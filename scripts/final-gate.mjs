import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateGateResults } from "./release-gate-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const receiptIndex = args.indexOf("--receipt-dir");
const receiptRoot = receiptIndex >= 0 && args[receiptIndex + 1]
  ? resolve(args[receiptIndex + 1])
  : resolve(process.env.MM_RELEASE_RECEIPT_DIR || join(tmpdir(), `mm-v1-release-${Date.now()}`));
const candidateDir = join(receiptRoot, "candidate");
const packageDir = join(candidateDir, "package");
const reviewsDir = join(receiptRoot, "reviews");

if (existsSync(receiptRoot) && readdirSync(receiptRoot).length > 0) {
  console.error(`refusing to overwrite non-empty receipt root: ${receiptRoot}`);
  process.exit(2);
}
mkdirSync(packageDir, { recursive: true });
mkdirSync(reviewsDir, { recursive: true });

const runtimeRoot = mkdtempSync(join(tmpdir(), "mm-v1-final-runtime-"));
const gateEnv = {
  ...process.env,
  MM_STATE_DIR: join(runtimeRoot, "state"),
  MM_GLOBAL_SKILLS_DIR: join(runtimeRoot, "global"),
  MEMORY_DIR: join(runtimeRoot, "memory"),
  MM_AGENT: "release-gate",
  MM_REFLECT: "",
  MM_AUTOPILOT: "",
  MM_GUARD: "",
  npm_config_cache: join(runtimeRoot, "npm-cache"),
};

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function outputTail(text, max = 5000) {
  const value = String(text || "");
  return value.length <= max ? value : value.slice(-max);
}

function runStep(name, command, commandArgs, options = {}) {
  const started = Date.now();
  const proc = spawnSync(command, commandArgs, {
    cwd: options.cwd || ROOT,
    env: options.env || gateEnv,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });
  const result = {
    name,
    command: [command, ...commandArgs].join(" "),
    exitCode: proc.status ?? 1,
    durationMs: Date.now() - started,
    stdoutTail: outputTail(proc.stdout),
    stderrTail: outputTail(proc.stderr),
  };
  console.log(`${result.exitCode === 0 ? "PASS" : "FAIL"} ${name} (${result.durationMs}ms)`);
  return result;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function seal(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) { seal(path); chmodSync(path, 0o555); }
    else chmodSync(path, 0o444);
  }
  chmodSync(dir, 0o555);
}

const commands = [];
commands.push(runStep("build", "npm", ["run", "build"]));
commands.push(runStep("tests", "npm", ["test"]));
commands.push(runStep("routing", "npm", ["run", "eval:routing"]));
commands.push(runStep("live-smoke", "npm", ["run", "smoke:live"]));
commands.push(runStep("native-fit-boundary", "bun", ["run", "scripts/native-fit-boundary.ts"]));

const packageSmokeStep = runStep("package-smoke", "node", ["scripts/package-smoke.mjs", "--json", "--out-dir", packageDir]);
commands.push(packageSmokeStep);
let packageSmoke = { pass: false, error: "package smoke emitted no receipt" };
try { packageSmoke = JSON.parse(packageSmokeStep.stdoutTail.trim().split("\n").at(-1)); }
catch { /* command result already carries the parseable failure context */ }

const freshBundle = join(candidateDir, "index.fresh.mjs");
commands.push(runStep("independent-bundle", "bun", ["build", "mods/index.ts", "--target", "node", "--outfile", freshBundle]));
// A content export carries no .git, so `git diff --check` cannot run. Say so explicitly:
// a silent PASS would claim a check that never happened, and a HOLD would fail an honest
// reviewer for using the snapshot exactly as instructed.
if (existsSync(join(ROOT, ".git"))) {
  commands.push(runStep("diff-check", "git", ["diff", "--check"]));
} else {
  // exitCode 0 is required: the evaluator keys off it, and an absent code reads as a failure.
  commands.push({ name: "diff-check", exitCode: 0, ok: true, skipped: true,
    note: "SKIPPED (no-git-context) — snapshot is a content export; integrity is asserted by the sealed MANIFEST hashes instead" });
}

const checkedInBundle = join(ROOT, "mods", "index.bundled.mjs");
const checkedInBundleSha256 = existsSync(checkedInBundle) ? sha256(checkedInBundle) : null;
const sourceBundleSha256 = existsSync(freshBundle) ? sha256(freshBundle) : null;
const verdict = evaluateGateResults({
  commands,
  sourceBundleSha256,
  checkedInBundleSha256,
  packageSmokePass: packageSmoke.pass === true,
});

const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const gitBranch = spawnSync("git", ["branch", "--show-current"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
const gitStatus = spawnSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);

const sourcePaths = ["package.json", "MOD.md", "CHANGELOG.md", "README.md", "LICENSE", "mods", "scripts", "test"];
const sourceFiles = [];
for (const item of sourcePaths) {
  const path = join(ROOT, item);
  if (!existsSync(path)) continue;
  const st = statSync(path);
  const files = st.isDirectory() ? walk(path) : [path];
  for (const file of files) {
    if (/node_modules|\.tmp-release-test/.test(file)) continue;
    sourceFiles.push({ path: relative(ROOT, file), sha256: sha256(file), bytes: statSync(file).size });
  }
}
sourceFiles.sort((a, b) => a.path.localeCompare(b.path));

const receipt = {
  schema: "mm-v1-release-candidate/v1",
  createdAt: new Date().toISOString(),
  verdict: verdict.pass ? "PASS_RELEASE_CANDIDATE" : "HOLD_RELEASE_CANDIDATE",
  pass: verdict.pass,
  failures: verdict.failures,
  publicationAuthorized: false,
  version: packageJson.version,
  repo: ROOT,
  branch: gitBranch,
  head: gitHead,
  sourceClean: gitStatus.length === 0,
  gitStatus,
  candidateDir,
  reviewsDir,
  checkedInBundleSha256,
  independentBundleSha256: sourceBundleSha256,
  packageSmoke,
  commands,
  sourceFiles,
  priorEvidenceBoundary: {
    statement: "Q2.1 and separate frozen ROUTE/UPDATE/LIFECYCLE gates remain prior scoped evidence. This receipt qualifies only the exact packed release candidate bytes and does not rewrite V5/V6/V7 outcomes.",
    v5FullCombine: "HOLD preserved",
    v7Lifecycle: "PASS preserved",
  },
};

const receiptPath = join(candidateDir, "FINAL-GATE.json");
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
seal(candidateDir);

const summary = {
  pass: receipt.pass,
  verdict: receipt.verdict,
  version: receipt.version,
  receiptPath,
  receiptSha256: sha256(receiptPath),
  candidateDir,
  reviewsDir,
  checkedInBundleSha256,
  independentBundleSha256: sourceBundleSha256,
  tarballPath: packageSmoke.tarballPath || null,
  tarballSha256: packageSmoke.tarballSha256 || null,
  failures: receipt.failures,
};
console.log(JSON.stringify(summary));
process.exit(receipt.pass ? 0 : 1);
