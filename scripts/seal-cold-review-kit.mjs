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

// Derived from the version, not a baked-in date: a reseal on a later day must not
// inherit a filename that misstates when it was sealed.
// Regenerate the freeze record and reproduction guide from live truth before sealing, so the
// sealed brief can never contradict the artifact it ships with. Hand-maintained numbers in these
// two files drifted (21 vs 23 packed files, a superseded tarball named CURRENT) and that is a
// publish blocker regardless of runtime quality.
{
  const { emitFreezeDocs } = await import("./emit-freeze-docs.mjs");
  // The freeze record is derived from the PACKAGE manifest (shipped files, bundle hash),
  // not from the kit manifest being assembled here.
  const packageManifest = JSON.parse(readFileSync(join(root, "docs", "cold-review", "PACKAGE-MANIFEST.json"), "utf8"));
  const out = emitFreezeDocs({ manifest: packageManifest, frozenCommit });
  console.error(`freeze docs regenerated: ${out.fileCount} packed files · ${out.counts.pass} pass / ${out.counts.fail} fail`);
}

const archiveName = `mm-v${pkg.version}-cold-review.tar.gz`;

// ── 5b · the brief is GENERATED from the derived values, never hand-written ──
const brief = `# Cold review — Muscle Memory \`${pkg.version}\`

> Generated by \`${manifest.generator}\` at ${manifest.sealedAt}.
> Every hash below is derived at seal time. Do not hand-edit this file.

You are reviewing a **release candidate**. Nothing has been published, tagged, released, or merged.

## The one current pin

| | |
|---|---|
| Package | \`${pkg.name}@${pkg.version}\` |
| Frozen commit | \`${frozenCommit}\` |
| Branch | \`${branch}\` |
| Product tarball | \`${tarballSha}\` |
| Tarball bytes | \`${tarballBytes}\` |
| Bundled entry | \`${bundledEntrySha256}\` |

CI on the exact frozen commit${ciAllGreen ? " — all green" : ""}:
${ciUrls.map((u) => `- ${u}`).join("\n") || "- (none observed at seal time)"}

Double mint byte-identical: **${manifest.doubleMintIdentical}**.
Fresh build reproduces the shipped bundle: **true**.

## Void pins — do not review these

Earlier candidates in this cycle are superseded. If your brief, archive, or checkout shows any
of these, you have the wrong bytes and the review does not count:

| Void pin | Why |
|---|---|
| \`cbfcbf6d…\` | superseded by the canonical-research-record wording |
| \`f0f63ae5…\` | superseded by the README product-hierarchy rewrite |
| \`c68e29d2…\` | superseded by the research kit and the username-leak fix |
| \`99b2a80c…\` | superseded by the changelog entry describing that fix |
| \`6a3ab912…\` | **stale bundle hash** — restated by hand, went stale, caught in custody review |
| \`00f094c2…\` | superseded by the meshAgentLabel privacy repair (the bytes the first Grok GO was bound to) |
| \`1a7b35a0…\` | superseded by the meshAgentLabel privacy repair (the bytes the Fable GO was bound to) |
| \`cc76f41c…\`, \`a9e4ef52…\` | superseded bundles |
| \`12f9ab7e…\`, \`0ed5d89f…\` | superseded archives |
| \`a768377…\`, \`784523072…\`, \`6db054cb…\`, \`adb98946…\`, \`5da4528c…\`, \`02eaf733…\` | superseded commits |
| \`e2b9c4a1…\`, \`cb951cbe…\`, \`d97875fa…\` | historical artifacts; no seal transfers to this candidate |
| \`f44e71ca…\`, \`02cd14fe…\`, \`4fced9f8…\`, \`46829794…\`, \`6a6fcdf8…\` | superseded product tarballs from the evidence-integrity cycle |
| \`0ed5d89f…\`, \`9b774dbd…\`, \`40de32c3…\`, \`3cd6e645…\`, \`58262ab8…\` | superseded cold-review archives |
| \`c7fda030…\`, \`24f4eb3f…\`, \`390c3bdc…\`, \`17e7aee3…\`, \`9d533974…\` | superseded commits from the evidence-integrity cycle |
| \`8d965bfd…\` | **superseded archive — the one G1 CLEAR and the G2 dogfood were bound to.** If you are holding it, stop |
| \`9e7b7668…\` | superseded archive previously placed on the Desktop |
| \`6bd385b0…\`, \`39057acc…\` | superseded archives from the void-ledger completion reseals |
| \`cc9241d2…\`, \`3fbfa9f7…\`, \`5e516367…\`, \`82e9b16a…\` | superseded archives from the docs-honesty cut |
| \`778c6c59…\` | **superseded product tarball — vulnerable to evidence transplant, forged invocation, and pre-decision window. Do not review it.** |
| \`a30a5735…\` | superseded archive built on those vulnerable bytes |
| \`d0293f72…\` | superseded commit — the head before the evidence-integrity v2 cut |
| \`66c0522c…\` | **superseded product tarball — attribution could be moved by a ledger edit. Do not review it.** |
| \`ad573568…\` | superseded archive built on those bytes |
| \`3bdaff3e…\` | superseded archive from the attribution cut, voided in the edit that supersedes it |
| \`c7bb9ee4…\` | **superseded product tarball — MM_REFLECT=staged could silently retire a skill, and the documented instrument-init command did not exist. Do not review it.** |
| \`4387c4ce…\` | superseded archive built on those bytes |
| \`5d3d3e4d…\`, \`eb7a7fa8…\` | superseded commits from the attribution cut |
| \`b595722b…\` | **superseded product tarball — the turn_end reflect hook could still auto-retire without the opt-in. Do not review it.** |
| \`1dc93fa0…\` | superseded archive built on those bytes |
| \`36731473…\`, \`d8eb6788…\`, \`6a2b3536…\` | superseded commits from the claim-honesty cut |
| \`452e663e…\`, \`bffb648d…\`, \`f64dd50b…\` | superseded commits from the evidence-integrity v2 cut |
| \`9d5093eb…\`, \`c4186c2a…\`, \`a527e649…\` | superseded commits from the docs-honesty cut |

The cold-review archive is a gzip of a tar and carries timestamps, so **the archive sha is not
byte-reproducible across seals** — only the product tarball is. Always compare the tarball
sha256 and the tar-stream sha256, and treat the archive sha as an identity pin for the exact
file you were handed, not something you can re-derive.
| \`3097a31d…\` | superseded commit — the product-freeze head before the generator-only void-ledger fix |
| \`385e648e…\` | superseded product tarball from the P0-wiring HOLD candidate |

## How to attach and review

1. Take the sealed archive file next to this brief: \`${archiveName}\`
2. Verify its sha256 matches the table above **before** extracting.
3. Extract it and read \`kit/START-HERE.md\`, then \`kit/MANIFEST.json\`.
4. Work offline and read-only. Do not push, comment, or contact anyone.
   The snapshot is a content export (\`git archive\`), so it carries no git history. Diff-checking
   it against a clone is content-level only; history verification is done by comparing the frozen
   commit SHA on GitHub. No git bundle is included, deliberately.
5. Return the verdict block from \`docs/cold-review/REVIEW-CHECKLIST.md\` inside the snapshot.

**The archive must be attached with this brief.** A review performed against the PR head without
the archive does not count — that failure has already voided two reviews in this cycle.
`;
writeFileSync(join(kit, "START-HERE.md"), brief);
for (const name of readdirSync(kit).sort()) {
  const p = join(kit, name);
  manifest.files[name] = { sha256: shaFile(p), bytes: readFileSync(p).length };
}
writeFileSync(join(kit, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");

// ── 6 · seal ────────────────────────────────────────────────────────────────
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
if (problems.length) { rmSync(archivePath, { force: true }); die(problems.join("; ")); }

// ── 8 · the outer brief CAN name the archive, because it lives outside it ───
const outerBrief = readFileSync(join(ck, "START-HERE.md"), "utf8")
  .replace(
    "| Bundled entry | `" + bundledEntrySha256 + "` |",
    "| Bundled entry | `" + bundledEntrySha256 + "` |\n| Sealed archive | `" + archiveSha + "` |\n| Archive bytes | `" + readFileSync(archivePath).length + "` |",
  );
writeFileSync(join(outDir, "mm-v1-rc3-cold-review-brief.md"), outerBrief);

for (const d of [mintA.dir, mintB.dir, peek, buildDir, check, inner]) rmSync(d, { recursive: true, force: true });

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
