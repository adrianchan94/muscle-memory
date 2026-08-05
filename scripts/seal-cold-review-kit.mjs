#!/usr/bin/env node
/**
 * Seal the cold-review archive from ONE source of truth.
 *
 *   node scripts/seal-cold-review-kit.mjs --out <dir> [--brief <path>]
 *
 * Every hash it publishes is DERIVED here. Nothing is hand-copied, because a
 * hand-copied bundle hash already went stale once and had to be caught in custody
 * review. The rules this enforces:
 *
 *   - the declared bundle hash is read out of the EMBEDDED product tarball
 *   - a fresh `bun build` must reproduce that same bundle, or the seal fails
 *   - the product tarball is minted twice and must be byte-identical
 *   - CI run IDs are looked up for the exact frozen commit, never assumed
 *   - after sealing, the archive is re-extracted and every declared hash is
 *     re-verified against the actual bytes inside it
 *
 * Any failure exits non-zero and leaves no sealed archive behind.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const outDir = arg("--out");
if (!outDir) { console.error("usage: seal-cold-review-kit.mjs --out <dir> [--brief <path>]"); process.exit(2); }
const briefPath = arg("--brief");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const shaFile = (p) => sha256(readFileSync(p));
const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" }).trim();
const die = (msg) => { console.error(`SEAL FAILED: ${msg}`); process.exit(1); };

// ── 0 · the tree must be clean, or "the frozen commit" is a fiction ──────────
if (git("status", "--porcelain")) die("working tree is dirty; commit or stash before sealing");
const frozenCommit = git("rev-parse", "HEAD");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// ── 1 · double mint from pristine exports of the frozen commit ──────────────
const mint = () => {
  const w = mkdtempSync(join(tmpdir(), "mm-seal-mint-"));
  execFileSync("bash", ["-c", `git -C '${root}' archive ${frozenCommit} | tar -x -C '${w}'`]);
  mkdirSync(join(w, "out"), { recursive: true });
  execFileSync("npm", ["pack", "--pack-destination", join(w, "out")], { cwd: w, stdio: ["ignore", "ignore", "inherit"] });
  const f = readdirSync(join(w, "out")).find((n) => n.endsWith(".tgz"));
  return { dir: w, path: join(w, "out", f), name: f };
};
const mintA = mint();
const mintB = mint();
const tarballSha = shaFile(mintA.path);
if (tarballSha !== shaFile(mintB.path)) die(`double mint diverged: ${tarballSha} vs ${shaFile(mintB.path)}`);
const tarballBytes = readFileSync(mintA.path).length;

// ── 2 · derive the bundle hash FROM THE EMBEDDED TARBALL ────────────────────
const peek = mkdtempSync(join(tmpdir(), "mm-seal-peek-"));
execFileSync("tar", ["-xzf", mintA.path, "-C", peek]);
const embeddedBundle = join(peek, "package", "mods", "index.bundled.mjs");
if (!existsSync(embeddedBundle)) die("no mods/index.bundled.mjs inside the packed tarball");
const bundledEntrySha256 = shaFile(embeddedBundle);

// ── 3 · a fresh build must reproduce that exact bundle ──────────────────────
const buildDir = mkdtempSync(join(tmpdir(), "mm-seal-build-"));
const rebuilt = join(buildDir, "index.bundled.mjs");
execFileSync("bun", ["build", "mods/index.ts", "--target", "node", "--outfile", rebuilt], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const rebuiltSha = shaFile(rebuilt);
if (rebuiltSha !== bundledEntrySha256) die(`fresh build does not match the shipped bundle\n  embedded: ${bundledEntrySha256}\n  rebuilt:  ${rebuiltSha}`);

// ── 4 · CI for the exact frozen commit — looked up, never assumed ───────────
let ci = [];
try {
  const raw = execFileSync("gh", ["run", "list", "--branch", branch, "--limit", "20", "--json", "headSha,conclusion,url,databaseId"], { cwd: root, encoding: "utf8" });
  ci = JSON.parse(raw).filter((r) => r.headSha === frozenCommit);
} catch { /* offline is survivable; the field just records what was observed */ }
const ciUrls = ci.map((r) => r.url);
const ciAllGreen = ci.length > 0 && ci.every((r) => r.conclusion === "success");

// ── 5 · assemble the kit ────────────────────────────────────────────────────
rmSync(outDir, { recursive: true, force: true });
const kit = join(outDir, "kit");
mkdirSync(kit, { recursive: true });
copyFileSync(mintA.path, join(kit, mintA.name));
execFileSync("bash", ["-c", `git -C '${root}' archive --format=tar --prefix=muscle-memory/ ${frozenCommit} | gzip -9 > '${join(kit, "branch-snapshot.tar.gz")}'`]);
if (briefPath && existsSync(briefPath)) copyFileSync(briefPath, join(kit, "START-HERE.md"));

const manifest = {
  kit: "muscle-memory-rc3-cold-review",
  sealedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  generator: "scripts/seal-cold-review-kit.mjs",
  note: "Every hash here is derived at seal time. None is hand-copied.",
  candidate: {
    package: pkg.name,
    version: pkg.version,
    tarballName: mintA.name,
    tarballSha256: tarballSha,
    tarballBytes,
    bundledEntrySha256,
    bundleSource: "read from mods/index.bundled.mjs inside the packed tarball, then confirmed against a fresh bun build",
  },
  frozenCommit,
  branch,
  pullRequest: "https://github.com/adrianchan94/muscle-memory/pull/2",
  ci: ciUrls,
  ciAllGreen,
  doubleMintIdentical: true,
  files: {},
};

for (const name of readdirSync(kit).sort()) {
  const p = join(kit, name);
  manifest.files[name] = { sha256: shaFile(p), bytes: readFileSync(p).length };
}
writeFileSync(join(kit, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");

// ── 6 · seal ────────────────────────────────────────────────────────────────
const archiveName = "mm-v1-rc3-cold-review-20260805.tar.gz";
const archivePath = join(outDir, archiveName);
execFileSync("tar", ["-czf", archivePath, "-C", outDir, "kit"]);
const archiveSha = shaFile(archivePath);

// ── 7 · SELF-CHECK: re-extract and re-verify every declared hash ────────────
const check = mkdtempSync(join(tmpdir(), "mm-seal-check-"));
execFileSync("tar", ["-xzf", archivePath, "-C", check]);
const ck = join(check, "kit");
const m2 = JSON.parse(readFileSync(join(ck, "MANIFEST.json"), "utf8"));
const problems = [];
if (shaFile(join(ck, m2.candidate.tarballName)) !== m2.candidate.tarballSha256) problems.push("embedded tarball hash != declared");
const inner = mkdtempSync(join(tmpdir(), "mm-seal-inner-"));
execFileSync("tar", ["-xzf", join(ck, m2.candidate.tarballName), "-C", inner]);
if (shaFile(join(inner, "package", "mods", "index.bundled.mjs")) !== m2.candidate.bundledEntrySha256) problems.push("bundle inside embedded tarball != declared bundledEntrySha256");
for (const [name, rec] of Object.entries(m2.files)) {
  if (shaFile(join(ck, name)) !== rec.sha256) problems.push(`file hash mismatch: ${name}`);
}
for (const d of [mintA.dir, mintB.dir, peek, buildDir, check, inner]) rmSync(d, { recursive: true, force: true });
if (problems.length) { rmSync(archivePath, { force: true }); die(problems.join("; ")); }

console.log(JSON.stringify({
  frozenCommit,
  branch,
  tarball: { name: manifest.candidate.tarballName, sha256: tarballSha, bytes: tarballBytes },
  bundledEntrySha256,
  doubleMintIdentical: true,
  freshBuildMatchesShippedBundle: true,
  ci: ciUrls,
  ciAllGreen,
  archive: { path: archivePath, name: archiveName, sha256: archiveSha, bytes: readFileSync(archivePath).length },
  selfCheck: "PASS — archive re-extracted, every declared hash re-verified",
}, null, 2));
