import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const runRoot = resolve(process.env.MM_DEMO_ROOT || mkdtempSync(join(tmpdir(), "mm-golden-demo-")));
const stateDir = join(runRoot, "state");
const memoryDir = join(runRoot, "memory");
const globalDir = join(runRoot, "global");
const stagedDir = join(runRoot, "staged");
const workspace = join(runRoot, "workspace");
for (const dir of [stateDir, memoryDir, globalDir, stagedDir, workspace]) mkdirSync(dir, { recursive: true });
process.env.MM_STATE_DIR = stateDir;
process.env.MEMORY_DIR = memoryDir;
process.env.MM_GLOBAL_SKILLS_DIR = globalDir;
process.env.MM_EXACT_FILE_ROOT = workspace;
process.env.MM_AGENT = "golden-demo";
delete process.env.MM_REFLECT;
delete process.env.MM_AUTOPILOT;
delete process.env.MM_GUARD;

const bundlePath = resolve(process.env.MM_BUNDLE_PATH || join(import.meta.dir, "..", "mods", "index.bundled.mjs"));
const bundle: any = await import(`${pathToFileURL(bundlePath).href}?golden=${Date.now()}`);
const mm = bundle.__mm;
if (!mm?.runReflectiveReview || typeof bundle.default !== "function") throw new Error("packed Muscle Memory surface unavailable");

const handlers = new Map<string, Function[]>();
const tools = new Map<string, any>();
const commands = new Map<string, any>();
const letta = {
  capabilities: { tools: true, commands: true, permissions: true, ui: { panels: true }, events: { tools: true, lifecycle: true, turns: true, llm: true, compact: true } },
  events: { on(name: string, fn: Function) { handlers.set(name, [...(handlers.get(name) || []), fn]); return () => {}; } },
  tools: { register(def: any) { tools.set(def.name, def); return () => {}; } },
  commands: { register(def: any) { commands.set(def.id, def); return () => {}; } },
  permissions: { register() { return () => {}; } },
  ui: { openPanel() { return { update() {}, close() {} }; } },
  diagnostics: { report() {} },
  client: {},
};
const dispose = bundle.default(letta);

const say = async (title: string, body: string, ms = 3600) => {
  process.stdout.write(`\n\u001b[1m${title}\u001b[0m\n${body}\n`);
  await wait(ms);
};
const row = (tool: string, tmpl: string, ok: boolean, conv: string, ts: number, err?: string) => ({
  tool, tmpl, fp: tmpl, h: tmpl, ok, conv, ts, ...(err ? { err } : {}),
});
const checker = (path: string) => spawnSync(process.execPath, ["-e", "const fs=require('fs'); const p=process.argv[1]; process.exit(fs.readFileSync(p,'utf8')==='repaired\\n'?0:1)", path]);
const performRepair = (name: string, conv: string, ts: number) => {
  const target = join(workspace, `${name}.txt`);
  writeFileSync(target, "stale\n");
  const before = checker(target);
  if (before.status === 0) throw new Error("fixture was not initially failing");
  writeFileSync(target, "repaired\n");
  const after = checker(target);
  if (after.status !== 0) throw new Error("fixture repair did not verify");
  return [
    row("Bash", "node verify-exact-edit.mjs", false, conv, ts, "exit-code-1"),
    row("Edit", `${name}.txt`, true, conv, ts + 1000),
    row("Bash", "node verify-exact-edit.mjs", true, conv, ts + 2000),
  ];
};

const draft = [
  "---",
  "name: repairing-stale-exact-file-edits",
  "description: Use when an exact-file edit fails because the expected text is stale; read current bytes, re-anchor the edit, and rerun the same verifier instead of blind-retrying.",
  "---",
  "## Procedure",
  "1. Read the current target bytes before changing anything.",
  "2. Re-anchor the intended edit against the current content.",
  "3. Apply the smallest exact change and rerun the original verifier.",
  "## Worked example",
  "```bash",
  "node verify-exact-edit.mjs target.txt  # fails",
  "# read target.txt, re-anchor the exact edit, then write the repair",
  "node verify-exact-edit.mjs target.txt  # passes",
  "```",
  "## Pitfalls",
  "### 1. Blind retry",
  "TELL: the same verifier fails again with unchanged target bytes. Read and re-anchor before retrying.",
  "### 2. Patching the test",
  "TELL: the verifier changed while the intended source stayed stale. Repair the source, not the check.",
  "## Verification",
  "Rerun the same verifier and require exit 0 on the intended target bytes.",
].join("\n");

try {
  await say("MUSCLE MEMORY · GOLDEN POSSESSION", `fresh isolated state · packed bundle ${sha256(readFileSync(bundlePath)).slice(0, 12)}…`, 4000);

  const base = Date.now() - 20_000;
  const first = performRepair("case-one", "session-one", base);
  const padding = [
    row("Bash", "node --version", true, "warmup-one", base + 3000),
    row("Bash", "node --version", true, "warmup-two", base + 4000),
    row("Bash", "node --version", true, "warmup-three", base + 5000),
  ];
  const n1 = await mm.runReflectiveReview({}, {
    mode: "staged",
    experience: [...first, ...padding],
    authorFn: async () => draft,
    dirs: [join(memoryDir, "skills")],
    stagedDir,
  });
  if (n1.action !== "none" || !/n=1|only 1|single.instance|multi.instance/i.test(String(n1.reason))) throw new Error(`n=1 refusal missing: ${JSON.stringify(n1)}`);
  await say("1 · RESTRAINT", "one repair is not a playbook\nN=1 CREATE REFUSED · nothing written", 4500);

  const second = performRepair("case-two", "session-two", base + 7000);
  const learned = await mm.runReflectiveReview({}, {
    mode: "auto",
    experience: [...first, ...padding, ...second],
    authorFn: async () => draft,
    dirs: [join(memoryDir, "skills")],
    stagedDir,
  });
  if (!learned.wrote || !readFileSync(join(learned.wrote, "SKILL.md"), "utf8").includes("repairing-stale-exact-file-edits")) {
    throw new Error(`repeated-evidence learning failed: ${JSON.stringify(learned)}`);
  }
  await say("2 · REPEATED EVIDENCE", "second distinct repair lands\nCREATE → repairing-stale-exact-file-edits", 4500);

  const learnedBody = readFileSync(join(learned.wrote, "SKILL.md"), "utf8");
  const gaps = mm.sotaQualityGaps({
    name: "repairing-stale-exact-file-edits",
    description: "Use when an exact-file edit fails because expected text is stale",
    body: learnedBody,
  });
  if (gaps.length) throw new Error(`admission gaps: ${gaps.join(", ")}`);
  await say("3 · ADMISSION", "dedupe ✓  safety ✓  quality ✓  lifecycle ✓\none exact skill earns a jersey", 4200);

  const heldOut = join(workspace, "held-out.txt");
  writeFileSync(heldOut, "stale\n");
  const expected = sha256("repaired\n");
  const registration = await tools.get("register_exact_file_verification").run({ args: {
    task_id: "golden-held-out",
    task_class: "stale-exact-file-edit",
    target_rel: basename(heldOut),
    expected_sha256: expected,
  } });
  if (!String(registration).includes("registered read-only")) throw new Error(String(registration));
  await say("4 · HELD-OUT SIBLING", "new file · same procedural gap\nimmutable expected hash registered before the decision", 4600);

  const prescribed = String(await tools.get("muscle_memory_skill_read").run({
    args: {
      action: "prescribe",
      gap_observed: true,
      task: "verify-exact-edit failed on a held-out file because the exact source text was stale; re-anchor and rerun the same verifier",
      task_class: "stale-exact-file-edit",
      difficulty: "standard",
      verification_task_id: "golden-held-out",
    },
    model: "golden-demo-model",
    agent: { name: "golden-demo" },
  }));
  if (!prescribed.includes("PRESCRIBE \"repairing-stale-exact-file-edits\"")) throw new Error(`exact retrieval failed: ${prescribed}`);
  const possessionId = prescribed.match(/possession: ([a-z0-9._:-]+)/i)?.[1];
  if (!possessionId) throw new Error("possession id missing");
  await say("5 · ONE-SKILL RETRIEVAL", "PRESCRIBE repairing-stale-exact-file-edits\nno siblings · no full-shelf context dump", 4500);

  if (checker(heldOut).status === 0) throw new Error("held-out task unexpectedly passed before repair");
  writeFileSync(heldOut, "repaired\n");
  if (checker(heldOut).status !== 0) throw new Error("held-out repair failed");
  await say("6 · THE PLAY", "read current bytes → re-anchor → repair\noriginal verifier now exits 0", 4200);

  const verified = String(await tools.get("verify_agent_possession").run({ args: { possession_id: possessionId } }));
  if (!verified.includes("BOUND-VERIFIED 'helped'")) throw new Error(verified);
  await say("7 · INSTRUMENT OWNS THE WHISTLE", "caller supplied no result and no evidence tier\nexact-file adapter: BOUND-VERIFIED helped", 4600);

  const boxscore = String(await tools.get("muscle_memory_skill_read").run({ args: { action: "boxscore" }, agent: { name: "golden-demo" } }));
  if (!boxscore.includes("1 OF 1 BOUND-VERIFIED GOOD DECISIONS")) throw new Error(boxscore);
  await say("8 · RECEIPT", boxscore.split("\n").slice(0, 5).join("\n"), 5000);

  const receipt = {
    schema: "mm.golden-shock-demo/v1",
    createdAt: new Date().toISOString(),
    pass: true,
    publicationAuthorized: false,
    bundleSha256: sha256(readFileSync(bundlePath)),
    n1: { action: n1.action, reason: n1.reason },
    learned: { action: learned.action, name: learned.name, wrote: learned.wrote },
    registration: String(registration),
    prescribed,
    verified,
    boxscore,
  };
  const receiptPath = join(runRoot, "GOLDEN-DEMO-RECEIPT.json");
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  await say("THE SHOCK LINE", "The agent refused premature learning, earned one exact play from repeated evidence,\nused it on a held-out task, and let an independent instrument score the result.", 5500);
  process.stdout.write(`\nDEMO PASS · receipt ${receiptPath}\n`);
} finally {
  if (typeof dispose === "function") dispose();
}
