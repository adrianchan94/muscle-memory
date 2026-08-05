import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const outIndex = args.indexOf("--out-dir");
const requestedOutDir = outIndex >= 0 && args[outIndex + 1] ? resolve(args[outIndex + 1]) : null;
const tempRoot = mkdtempSync(join(tmpdir(), "mm-package-smoke-"));
const stage = join(tempRoot, "stage");
const consumer = join(tempRoot, "consumer");
const packDir = requestedOutDir || join(tempRoot, "pack");
const npmEnv = { ...process.env, npm_config_cache: join(tempRoot, "npm-cache") };

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });
}

let receipt = {
  pass: false,
  packageVersion: null,
  tarballPath: null,
  tarballSha256: null,
  tarballBytes: 0,
  stagedBundleSha256: null,
  installedBundleExists: false,
  installedBundleSha256: null,
  registeredTools: [],
  registeredCommands: [],
  registeredPermissions: [],
  privatePathHits: [],
  missingRequiredFiles: [],
  packageFiles: [],
  error: null,
};

try {
  mkdirSync(stage, { recursive: true });
  mkdirSync(consumer, { recursive: true });
  mkdirSync(packDir, { recursive: true });
  for (const name of ["package.json", "MOD.md", "CHANGELOG.md", "README.md", "LICENSE", "mods"]) {
    cpSync(join(ROOT, name), join(stage, name), { recursive: true });
  }

  const pkg = JSON.parse(readFileSync(join(stage, "package.json"), "utf8"));
  receipt.packageVersion = pkg.version;
  run("bun", ["build", "mods/index.ts", "--target", "node", "--outfile", "mods/index.bundled.mjs"], { cwd: stage });
  receipt.stagedBundleSha256 = sha256(join(stage, "mods", "index.bundled.mjs"));

  const packRaw = run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packDir], { cwd: stage, env: npmEnv });
  const packed = JSON.parse(packRaw);
  const packInfo = Array.isArray(packed) ? packed[0] : packed;
  const tarball = join(packDir, packInfo.filename);
  receipt.tarballPath = requestedOutDir ? tarball : null;
  receipt.tarballSha256 = sha256(tarball);
  receipt.tarballBytes = statSync(tarball).size;
  receipt.packageFiles = (packInfo.files || []).map((file) => file.path).sort();

  const required = [
    "package.json",
    "MOD.md",
    "CHANGELOG.md",
    "README.md",
    "LICENSE",
    "mods/index.ts",
    "mods/index.bundled.mjs",
    "mods/referee.ts",
    "mods/verification.ts",
  ];
  receipt.missingRequiredFiles = required.filter((name) => !receipt.packageFiles.includes(name));

  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
  run("npm", ["install", "--ignore-scripts", "--no-package-lock", "--no-audit", "--no-fund", tarball], { cwd: consumer, env: npmEnv });

  const packageName = String(pkg.name || "");
  if (!packageName.startsWith("@") || !packageName.includes("/")) {
    throw new Error(`expected scoped package name, got ${packageName}`);
  }
  const [scope, unscoped] = packageName.split("/");
  const installedRoot = join(consumer, "node_modules", scope, unscoped);
  const installedBundle = join(installedRoot, "mods", "index.bundled.mjs");
  receipt.installedBundleExists = existsSync(installedBundle);
  if (receipt.installedBundleExists) receipt.installedBundleSha256 = sha256(installedBundle);

  const forbidden = [
    /\/Users\/chan2saucy/g,
    /\.local\/state\/kevos/g,
    /agent-71b0883e-c63f-4e79-bab4-a45a1380bd60/g,
  ];
  for (const path of walk(installedRoot)) {
    if (!/\.(?:md|json|ts|mjs|js|txt)$/i.test(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const pattern of forbidden) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) receipt.privatePathHits.push(`${path.slice(installedRoot.length + 1)}:${pattern.source}`);
    }
  }

  const runner = join(consumer, "smoke-runner.mjs");
  writeFileSync(runner, `
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const bundlePath = ${JSON.stringify(installedBundle)};
const mod = await import(pathToFileURL(bundlePath).href + "?smoke=" + Date.now());
const activate = mod.default;
// Verified evidence requires an instrument key, and a fresh consumer machine has none.
// Mint one explicitly so the smoke proves the real signed path instead of silently degrading.
const registered = { tools: [], commands: [], permissions: [], events: [] };
const handlers = {};
const fire = (name, event) => { for (const fn of handlers[name] || []) { try { fn(event); } catch { /* observation must never break the stream */ } } };
const toolDefs = new Map();
const commandDefs = new Map();
const letta = {
  capabilities: { tools: true, commands: true, permissions: true, ui: { panels: true }, events: { tools: true, lifecycle: true, turns: true, llm: true, compact: true } },
  // Keep the handlers: procedural credit now requires an instrument-observed Skill invocation,
  // and the only honest way to smoke that is to drive the runtime's own event stream.
  events: { on(name, fn) { registered.events.push(name); (handlers[name] ||= []).push(fn); return () => {}; } },
  tools: { register(def) { registered.tools.push(def.name); toolDefs.set(def.name, def); return () => {}; } },
  commands: { register(def) { registered.commands.push(def.id); commandDefs.set(def.id, def); return () => {}; } },
  permissions: { register(def) { registered.permissions.push(def.id); return () => {}; } },
  ui: { openPanel() { return { update() {}, close() {} }; } },
  diagnostics: { report() {} },
  client: {},
};
const globalDir = process.env.MM_GLOBAL_SKILLS_DIR;
const workspace = process.env.MM_EXACT_FILE_ROOT;
mkdirSync(join(globalDir, "recovering-failed-exact-match-edits"), { recursive: true });
writeFileSync(join(globalDir, "recovering-failed-exact-match-edits", "SKILL.md"), "---\\nname: recovering-failed-exact-match-edits\\ndescription: Use when an exact-match file edit fails because target text is stale and must be re-anchored\\n---\\n## Procedure\\n1. Read current content.\\n2. Re-anchor.\\n3. Verify.\\n");
mkdirSync(workspace, { recursive: true });
// CAUSAL smoke: the target starts WRONG. A smoke test that writes the correct file and then
// "verifies" it proves only that hashing works - it would pass even if the skill never ran.
writeFileSync(join(workspace, "target.txt"), "stale\\n");
const baseline = createHash("sha256").update("stale\\n").digest("hex");
const expected = createHash("sha256").update("repaired\\n").digest("hex");
if (baseline === expected) throw new Error("smoke misconfigured: baseline must differ from expected");
const dispose = activate(letta);

// K4: arm the key through the DOCUMENTED command, exactly as a consumer would, not through the
// test surface. A smoke that hand-mints the key proves the happy path works for us and says
// nothing about whether the path we published to users actually functions.
const mmCommand = commandDefs.get("muscle-memory");
const instrumentOut = mmCommand ? String((await mmCommand.run({ argv: ["instrument", "init"] }))?.output ?? "") : "no muscle-memory command registered";
if (!/instrument key (created|already present)/.test(instrumentOut)) {
  console.error("documented instrument init did not arm the key:", instrumentOut.slice(0, 140));
}
const registeredVerification = await toolDefs.get("register_exact_file_verification").run({
  args: { task_id: "package-verified-repair", task_class: "package-exact-repair", target_rel: "target.txt", expected_sha256: expected },
});
const rating = await toolDefs.get("rate_skill").run({
  args: { skill: "release-smoke-skill", rating: "no_rate", reason: "packed artifact smoke" },
  model: { id: "release-smoke", provider: "test" },
});
const prescribed = await toolDefs.get("muscle_memory_skill_read").run({
  args: { action: "prescribe", gap_observed: true, task: "exact-match file edit failed because target text was stale", task_class: "package-exact-repair", difficulty: "standard", verification_task_id: "package-verified-repair" },
  model: { id: "release-smoke", provider: "test" },
  agent: { name: "release-smoke" },
});
const possessionId = String(prescribed).match(/possession: ([a-z0-9._:-]+)/i)?.[1] || "";
// the transition happens HERE - after the prescription, before verification - so the
// verified outcome reflects an actual change rather than a file that was already correct
writeFileSync(join(workspace, "target.txt"), "repaired\\n");
// ...and the prescribed skill actually runs, witnessed by the runtime rather than asserted by us
fire("tool_start", { toolName: "Skill", toolCallId: "smoke-call-1", args: { skill: "recovering-failed-exact-match-edits" } });
fire("tool_end", { toolName: "Skill", toolCallId: "smoke-call-1", status: "success", output: "applied" });
const verification = possessionId ? await toolDefs.get("verify_agent_possession").run({ args: { possession_id: possessionId } }) : "missing possession";
const lightweight = await toolDefs.get("muscle_memory_prescribe").run({
  args: { gap_observed: true, task: "exact-match file edit failed because target text was stale" },
  model: { id: "release-smoke", provider: "test" },
  agent: { name: "release-smoke" },
});
const lightweightId = String(lightweight).match(/possession: ([a-z0-9._:-]+)/i)?.[1] || "";
const closeout = lightweightId ? await toolDefs.get("muscle_memory_close").run({
  args: { possession_id: lightweightId, result: "helped", reason: "The packaged recovery skill resolved the stale edit." },
  model: { id: "release-smoke", provider: "test" },
}) : "missing lightweight possession";
if (typeof dispose === "function") dispose();
console.log(JSON.stringify({ ...registered, instrumentInit: String(instrumentOut).slice(0, 140), rating: String(rating), registeredVerification: String(registeredVerification), prescribed: String(prescribed), verification: String(verification), lightweight: String(lightweight), closeout: String(closeout) }));
`);

  const runtimeRoot = mkdtempSync(join(tmpdir(), "mm-package-runtime-"));
  const runtimeRaw = run("node", [runner], {
    cwd: consumer,
    env: {
      ...process.env,
      MM_STATE_DIR: join(runtimeRoot, "state"),
      MM_INSTRUMENT_KEY_FILE: join(runtimeRoot, "instrument", "muscle-memory.key"),
      MM_GLOBAL_SKILLS_DIR: join(runtimeRoot, "global"),
      MM_EXACT_FILE_ROOT: join(runtimeRoot, "workspace"),
      MEMORY_DIR: join(runtimeRoot, "memory"),
      MM_AGENT: "release-smoke",
      MM_ADVANCED: "on",
      MM_REFLECT: "",
      MM_AUTOPILOT: "",
      MM_GUARD: "",
    },
  });
  const runtime = JSON.parse(runtimeRaw.trim().split("\n").at(-1));
  receipt.registeredTools = runtime.tools || [];
  receipt.registeredCommands = runtime.commands || [];
  receipt.registeredPermissions = runtime.permissions || [];

  const requiredTools = ["muscle_memory_skill_read", "muscle_memory_prescribe", "muscle_memory_close", "record_agent_possession", "register_exact_file_verification", "verify_agent_possession", "muscle_memory_skill_write", "muscle_memory_lifecycle_run", "rate_skill"];
  const runtimeMissing = requiredTools.filter((name) => !receipt.registeredTools.includes(name));
  receipt.missingRequiredFiles.push(...runtimeMissing.map((name) => `runtime-tool:${name}`));
  if (!receipt.registeredCommands.includes("muscle-memory")) receipt.missingRequiredFiles.push("runtime-command:muscle-memory");
  if (!receipt.registeredPermissions.includes("muscle-memory-guard")) receipt.missingRequiredFiles.push("runtime-permission:muscle-memory-guard");
  if (!String(runtime.rating || "").includes("release-smoke-skill")) receipt.missingRequiredFiles.push("runtime-rate-skill-execution");
  if (!String(runtime.registeredVerification || "").includes("registered read-only")) receipt.missingRequiredFiles.push("runtime-verifier-registration-execution");
  if (!String(runtime.prescribed || "").includes("verify_agent_possession")) receipt.missingRequiredFiles.push("runtime-verifier-binding-execution");
  if (!String(runtime.verification || "").includes("BOUND-VERIFIED 'helped'")) receipt.missingRequiredFiles.push("runtime-verifier-closeout-execution");
  if (!String(runtime.lightweight || "").includes("muscle_memory_close")) receipt.missingRequiredFiles.push("runtime-lightweight-prescribe-execution");
  if (!String(runtime.closeout || "").includes("OUTCOME RECORDED · helped · agent-judged")) receipt.missingRequiredFiles.push("runtime-lightweight-close-execution");

  receipt.pass = typeof receipt.tarballSha256 === "string"
    && /^[a-f0-9]{64}$/.test(receipt.tarballSha256)
    && receipt.tarballBytes > 0
    && receipt.installedBundleExists
    && receipt.stagedBundleSha256 === receipt.installedBundleSha256
    && receipt.privatePathHits.length === 0
    && receipt.missingRequiredFiles.length === 0;
} catch (error) {
  receipt.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
} finally {
  if (!requestedOutDir) receipt.tarballPath = null;
  rmSync(tempRoot, { recursive: true, force: true });
}

if (!jsonOnly) {
  console.log(receipt.pass ? "PACKAGE SMOKE: PASS" : "PACKAGE SMOKE: FAIL");
  console.log(`version=${receipt.packageVersion} tarball=${receipt.tarballSha256 || "none"}`);
}
console.log(JSON.stringify(receipt));
process.exit(receipt.pass ? 0 : 1);
