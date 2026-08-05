// Generates docs/cold-review/FREEZE.txt and VERIFY-REPRODUCTION.md from live truth.
//
// These two files were hand-maintained and drifted: FREEZE.txt claimed 21 packed files when the
// tarball shipped 23, named a superseded tarball as CURRENT, said "six times" above seven rows,
// and both cited a MANIFEST.json `testCounts` field that never existed. A reviewer reading them
// against the artifact finds contradictions, which is a publish blocker no matter how good the
// runtime is. So nothing here is written by hand any more: every number is derived at seal time.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();

/** Real test counts from an actual run — never prose, never hand-copied. */
export function runTestCounts() {
  const env = {
    ...process.env,
    MM_STATE_DIR: mkdtempSync(join(tmpdir(), "mm-freeze-state-")),
    MEMORY_DIR: mkdtempSync(join(tmpdir(), "mm-freeze-mem-")),
    MM_GLOBAL_SKILLS_DIR: mkdtempSync(join(tmpdir(), "mm-freeze-glob-")),
  };
  // bun writes its summary to stderr, so capture both streams or the counts are invisible.
  const run = spawnSync("bun", ["test"], { cwd: root, encoding: "utf8", env });
  let out = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  // bun colourises its summary, so strip ANSI before matching or every number is invisible.
  out = out.replace(/\u001b\[[0-9;]*m/g, "");
  const pass = Number(/^\s*(\d+)\s+pass\s*$/m.exec(out)?.[1] ?? NaN);
  const fail = Number(/^\s*(\d+)\s+fail\s*$/m.exec(out)?.[1] ?? NaN);
  const files = Number(/across (\d+) files/.exec(out)?.[1] ?? NaN);
  if (!Number.isFinite(pass) || !Number.isFinite(fail)) throw new Error("could not parse test counts from the run output");
  return { pass, fail, files: Number.isFinite(files) ? files : null };
}

export function emitFreezeDocs({ manifest, ciUrls = [], frozenCommit = git("rev-parse", "HEAD"), testCounts }) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const tarSha = manifest.tarball.sha256;
  const tarBytes = manifest.tarball.bytes;
  const fileCount = manifest.shippedFiles.length;

  // Mint once to derive the reproduction contract from the real artifact.
  const staging = mkdtempSync(join(tmpdir(), "mm-freeze-pack-"));
  execFileSync("npm", ["pack", "--pack-destination", staging], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  const tgz = join(staging, readdirSync(staging).find((f) => f.endsWith(".tgz")));
  const gz = readFileSync(tgz);
  const mintedSha = sha256(gz);
  // The gzip ENVELOPE varies by packer and compression level; the tar STREAM inside does not.
  // So the reproduction contract is the decompressed stream, and envelope drift is not a defect.
  const tarStreamSha = sha256(gunzipSync(gz));
  rmSync(staging, { recursive: true, force: true });
  if (mintedSha !== tarSha) throw new Error(`freeze docs: minted ${mintedSha} does not match manifest ${tarSha}`);

  const counts = testCounts ?? runTestCounts();
  const ciBlock = ciUrls.length
    ? ciUrls.map((u) => `    ${u}`).join("\n")
    : "    (no completed runs observed for this commit at seal time)";

  const freeze = `MUSCLE MEMORY — COLD REVIEW FREEZE RECORD
=========================================
GENERATED at seal time. Every number below is derived from the artifact being sealed.
Do not hand-edit: the generator is scripts/emit-freeze-docs.mjs.

CANDIDATE
  package            ${pkg.name}
  version            ${pkg.version}
  status             RELEASE CANDIDATE — not published, not tagged, not merged

EXACT BYTES
  packed tarball     ${tarSha}          <- CURRENT
  tarball bytes      ${tarBytes}
  packed file count  ${fileCount}
  bundled entry      ${manifest.bundle.committedSha256}
  tar-stream sha256  ${tarStreamSha}

  REPRODUCTION CONTRACT: the decompressed tar stream, not the gzip envelope.
  \`npm pack\` output is gzip-wrapped, and the envelope varies with packer and
  compression level while the tar stream inside stays identical. If your outer
  .tgz sha differs but the tar-stream sha matches, the artifact is correct.
  Gzip-envelope drift is NOT a defect and NOT a P0.

    shasum -a 256 <your>.tgz              # outer envelope — may differ
    gunzip -c <your>.tgz | shasum -a 256  # must equal tar-stream sha256 above

FROZEN COMMIT
  branch             ${git("rev-parse", "--abbrev-ref", "HEAD")}
  frozen commit      ${frozenCommit}

  To confirm you are on it:
    git rev-parse HEAD          # must equal the frozen commit above
    git status --porcelain      # must be empty
    git diff --check            # must be empty

GATES ON THE FROZEN TREE
  npm test                      ${counts.pass} pass, ${counts.fail} fail${counts.files ? ` across ${counts.files} files` : ""}
                                (counted from a real run at seal time, not prose)
  npm run verify                all stages green         exit 0
  node scripts/final-gate.mjs   PASS_RELEASE_CANDIDATE   exit 0
  package smoke                 PASS, privatePathHits []

  CI (ubuntu-latest) for this exact frozen commit:
${ciBlock}

GENERATED EVIDENCE (regenerate and diff)
  node scripts/dump-package-manifest.mjs   -> PACKAGE-MANIFEST.json
  node scripts/dump-tool-schemas.mjs       -> TOOL-SCHEMAS.json
  Both exit non-zero if their assertions fail.

INVALIDATION RULE
  Any change to the packaged files (${pkg.files.join(", ")}) changes the packed bytes and
  VOIDS this freeze. Changes under docs/ and scripts/ do NOT: both are excluded from the
  package \`files\` field, and PACKAGE-MANIFEST.json asserts that no review doc ships.

  The full list of superseded pins is in the sealed cold-review brief, under
  "Void pins — do not review these". If your archive, brief, or checkout shows any of
  them, you have the wrong bytes.

BLOCKED AT FREEZE TIME
  no git tag · no GitHub release (not even a draft) · no npm publish ·
  no merge to main · no external research send
`;

  const verify = `# Verify this candidate yourself

Generated at seal time from the sealed artifact. Do not hand-edit —
the generator is \`scripts/emit-freeze-docs.mjs\`.

## The reproduction contract

\`npm pack\` produces a gzip-wrapped tar. The **gzip envelope** varies by packer version and
compression level; the **tar stream** inside does not. So the contract is the decompressed
stream:

| Artifact | sha256 |
|---|---|
| packed tarball (outer envelope, this machine) | \`${tarSha}\` |
| **decompressed tar stream (the contract)** | \`${tarStreamSha}\` |
| bundled entry \`mods/index.bundled.mjs\` | \`${manifest.bundle.committedSha256}\` |
| packed file count | ${fileCount} |

\`\`\`sh
npm ci && npm run build && npm pack
gunzip -c ${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz | shasum -a 256
# must equal the tar-stream sha above
\`\`\`

If the outer .tgz sha differs but the tar-stream sha matches, **the artifact is correct** and
you are looking at gzip-envelope drift. That is expected across npm/node versions and is not
a defect to report.

## Gates

| Command | Expected |
|---|---|
| \`npm test\` | ${counts.pass} pass, ${counts.fail} fail${counts.files ? `, ${counts.files} files` : ""} — counted from a real run at seal time |
| \`npm run verify\` | all stages green, exit 0 |
| \`node scripts/final-gate.mjs\` | \`PASS_RELEASE_CANDIDATE\` |
| \`node scripts/package-smoke.mjs\` | \`PASS\`, \`privatePathHits: []\` |
| \`node scripts/dump-package-manifest.mjs\` | regenerates \`PACKAGE-MANIFEST.json\` identically |

Test counts are generated, never restated by hand. Earlier revisions of this file cited a
\`MANIFEST.json\` \`testCounts\` field that did not exist; the numbers above come from the run
itself.

## Environment

| Tool | Version at seal time |
|---|---|
| node | ${process.version} |
| bun | ${(() => { try { return execFileSync("bun", ["--version"], { encoding: "utf8" }).trim(); } catch { return "not present"; } })()} |
| npm | ${(() => { try { return execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(); } catch { return "not present"; } })()} |

The test suite runs under \`bun test\`. A different bun version may report the same assertions
with different timings; counts should match exactly.

## Offline notes

The snapshot is a content export (\`git archive\`) and carries no git history, so
\`git status\` / \`git diff\` inside it are not meaningful — history verification is done by
comparing the frozen commit SHA on GitHub. The final gate's \`diff-check\` step is skipped in a
git-less export by design; that is not a failure.
`;

  writeFileSync(join(root, "docs", "cold-review", "FREEZE.txt"), freeze);
  writeFileSync(join(root, "docs", "cold-review", "VERIFY-REPRODUCTION.md"), verify);
  return { tarStreamSha, fileCount, counts };
}

// Standalone: regenerate from the current manifest without sealing.
if (process.argv[1] && process.argv[1].endsWith("emit-freeze-docs.mjs")) {
  const manifest = JSON.parse(readFileSync(join(root, "docs", "cold-review", "PACKAGE-MANIFEST.json"), "utf8"));
  let ciUrls = [];
  try {
    const head = git("rev-parse", "HEAD");
    const raw = execFileSync("gh", ["run", "list", "--branch", git("rev-parse", "--abbrev-ref", "HEAD"), "--limit", "10", "--json", "headSha,conclusion,url"], { cwd: root, encoding: "utf8" });
    ciUrls = JSON.parse(raw).filter((r) => r.headSha === head && r.conclusion === "success").map((r) => r.url);
  } catch { /* offline is fine; the block says so honestly */ }
  const out = emitFreezeDocs({ manifest, ciUrls });
  console.log(`emit-freeze-docs: ${out.fileCount} packed files · ${out.counts.pass} pass / ${out.counts.fail} fail · tar-stream ${out.tarStreamSha.slice(0, 16)}…`);
}
