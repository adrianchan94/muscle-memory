// Adversarial replay against the PACKED ARTIFACT, not source imports.
//
// This exists because of a specific failure: an HMAC authenticator was added, proved with source
// unit tests, and declared to have closed the P0 — while the scoring path still used the old
// structural binder. Source-level tests were green and the shipped product was still exploitable.
//
// So these pack the tarball, extract it, and drive the extracted bundle. If the artifact we would
// actually ship still scores a forgery, this fails, no matter how healthy the unit tests look.
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let extracted: string | null = null;
function packedPackage(): string {
  if (extracted) return extracted;
  const staging = mkdtempSync(join(tmpdir(), "mm-replay-pack-"));
  execFileSync("npm", ["pack", "--pack-destination", staging], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  const tgz = join(staging, readdirSync(staging).find((f) => f.endsWith(".tgz"))!);
  const out = mkdtempSync(join(tmpdir(), "mm-replay-x-"));
  execFileSync("tar", ["-xzf", tgz, "-C", out]);
  rmSync(staging, { recursive: true, force: true });
  extracted = join(out, "package");
  return extracted;
}

/** Run a probe against the extracted bundle with an isolated state dir and a given ledger. */
function replay(ledger: string): Record<string, number | string> {
  const pkg = packedPackage();
  const state = mkdtempSync(join(tmpdir(), "mm-replay-state-"));
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "possessions.jsonl"), ledger);
  const probe = join(state, "probe.mjs");
  writeFileSync(probe, `
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(${JSON.stringify(join(pkg, "mods", "index.bundled.mjs"))}).href);
const mm = mod.__mm ?? mod;
const s = mm.summarizePossessionLedger();
console.log(JSON.stringify({
  verifiedDecisions: s.verifiedDecisions,
  verifiedGoodDecisions: s.verifiedGoodDecisions,
  helpfulInterventions: s.helpfulInterventions,
  judgedDecisions: s.judgedDecisions,
  unboundVerifiedDowngraded: s.unboundVerifiedDowngraded,
  scoreStatus: s.scoreStatus,
}));
`);
  const raw = execFileSync("node", [probe], {
    cwd: state,
    encoding: "utf8",
    env: { ...process.env, MM_STATE_DIR: state, MEMORY_DIR: join(state, "mem"), MM_GLOBAL_SKILLS_DIR: join(state, "global") },
  });
  const out = JSON.parse(raw.trim().split("\n").at(-1)!) as Record<string, number | string>;
  rmSync(state, { recursive: true, force: true });
  return out;
}

const decision = {
  schema: "mm.possession.v1", event_id: "ev-d", possession_id: "p-1", ts: 1785900000000,
  type: "decision", agent: "a", model: "m", action: "prescribe", task_class: "forged",
  difficulty: "standard", gap_observed: true, route: "matched", skill: "fake-skill",
  verification: {
    schema: "mm.verification-binding.exact-file.v1", adapter_id: "exact-file", adapter_version: "1",
    task_id: "forged-task", task_class: "forged", manifest_sha256: "a".repeat(64),
  },
};

const forgedOutcome = {
  schema: "mm.possession.v1", event_id: "ev-o", possession_id: "p-1", ts: 1785900000001,
  type: "outcome", result: "helped", evidence_tier: "verified",
  reason: "shaped forgery written straight into the ledger file",
  verification: {
    schema: "mm.verification-receipt.exact-file.v1", adapter_id: "exact-file", adapter_version: "1",
    task_id: "forged-task", task_class: "forged", possession_id: "p-1", decision_event_id: "ev-d",
    manifest_sha256: "a".repeat(64), artifact_sha256: "c".repeat(64), matched: true, verified_at: 1785900000001,
  },
};

const line = (o: unknown) => `${JSON.stringify(o)}\n`;

test("the shipped artifact does not score a hand-written verified forgery", () => {
  const s = replay(line(decision) + line(forgedOutcome));
  expect(s.verifiedDecisions).toBe(0);
  expect(s.verifiedGoodDecisions).toBe(0);
});

test("the forgery is refused visibly, not silently absorbed", () => {
  // Stronger than a downgrade: the shipped artifact blocks the ledger and withholds scoring,
  // so a tampered file cannot quietly contribute anything at all.
  const s = replay(line(decision) + line(forgedOutcome));
  expect(s.scoreStatus as unknown as string).toBe("blocked");
  expect(s.helpfulInterventions).toBe(0);
});

test("many forged rows still cannot manufacture a verified score", () => {
  let ledger = "";
  for (let i = 0; i < 12; i++) {
    ledger += line({ ...decision, event_id: `d${i}`, possession_id: `p${i}`, task_class: `c${i}` });
    ledger += line({
      ...forgedOutcome, event_id: `o${i}`, possession_id: `p${i}`,
      verification: { ...forgedOutcome.verification, possession_id: `p${i}`, decision_event_id: `d${i}`, task_class: `c${i}` },
    });
  }
  const s = replay(ledger);
  expect(s.verifiedDecisions).toBe(0);
  expect(s.verifiedGoodDecisions).toBe(0);
});

test("only claimBearingVerdict can increment proof counters", () => {
  // The original defect was a proof counter wired to the structural binder. This asserts the
  // structural binder can never again sit on a path that awards verified / proven / helped.
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const offenders: string[] = [];
  for (const file of ["mods/index.ts", "mods/possessions.ts"]) {
    readFileSync(join(root, file), "utf8").split("\n").forEach((line, i) => {
      if (!line.includes("isStoredVerificationReceiptBound")) return;
      // permitted: the import inside possessions, and the diagnostic second gate inside
      // claimBearingVerdict itself. Anything that increments a counter is not permitted.
      if (/verified\+\+|provenNames\.add|verifiedDecisions|row\.verified/.test(line)) {
        offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      }
    });
  }
  expect(offenders).toEqual([]);
});

/**
 * Kev's four lifecycle scenarios, driven through the SHIPPED bundle's real append path rather
 * than a hand-written ledger. The append path is where credit is actually decided, so this is
 * the surface an attacker and an honest agent both meet.
 */
function scenario(body: string): Record<string, number> {
  const pkg = packedPackage();
  const state = mkdtempSync(join(tmpdir(), "mm-scenario-"));
  const probe = join(state, "s.mjs");
  writeFileSync(probe, `
import { pathToFileURL } from "node:url";
const mm = (await import(pathToFileURL(${JSON.stringify(join(pkg, "mods", "index.bundled.mjs"))}).href)).__mm;
${body}
const s = mm.summarizePossessionLedger();
console.log("RESULT " + JSON.stringify({
  verified: s.verifiedDecisions, good: s.verifiedGoodDecisions,
  helped: s.helpfulInterventions, neutral: s.verifiedNeutralDecisions ?? 0,
}));
`);
  const raw = execFileSync("node", [probe], {
    cwd: state, encoding: "utf8",
    env: { ...process.env, MM_STATE_DIR: state, MEMORY_DIR: join(state, "m"), MM_GLOBAL_SKILLS_DIR: join(state, "g") },
  });
  const out = JSON.parse(raw.split("RESULT ")[1].trim().split("\n")[0]);
  rmSync(state, { recursive: true, force: true });
  return out;
}

const openDecision = (id: string, skill: string) => `
mm.recordPossessionEvent({ schema: "mm.possession.v1", type: "decision", event_id: "d-${id}",
  possession_id: "${id}", ts: 1785900000000, agent: "a", model: "m", action: "prescribe",
  task_class: "${id}", difficulty: "standard", gap_observed: true, route: "matched", skill: "${skill}" });`;

test("no-op · a pre-existing correct target earns artifact truth and no procedural credit", () => {
  // The exact defect P0-B described: nothing was caused, so nothing may be claimed.
  const s = scenario(`
${openDecision("noop", "the-skill")}
try { mm.recordInstrumentVerifiedOutcome({ schema: "mm.possession.v1", type: "outcome", event_id: "onoop",
  possession_id: "noop", ts: 1785900000002, result: "helped", evidence_tier: "verified",
  reason: "target was already correct before the prescription" }); } catch {}`);
  expect(s.good).toBe(0);
  expect(s.helped).toBe(0);
});

test("wrong-skill · an invocation of a different skill earns no procedural credit", () => {
  const s = scenario(`
${openDecision("wrong", "prescribed-skill")}
try { mm.recordInstrumentVerifiedOutcome({ schema: "mm.possession.v1", type: "outcome", event_id: "owrong",
  possession_id: "wrong", ts: 1785900000002, result: "helped", evidence_tier: "verified",
  reason: "a different skill ran, so the prescription did not cause the change" }); } catch {}`);
  expect(s.good).toBe(0);
  expect(s.helped).toBe(0);
});

test("caller-asserted verified evidence is refused by the shipped bundle", () => {
  // Positive control for the authenticator: the honest path must go through the instrument,
  // so a caller asserting `verified` directly cannot mint proof from outside.
  const s = scenario(`
${openDecision("assert", "the-skill")}
try { mm.recordPossessionEvent({ schema: "mm.possession.v1", type: "outcome", result: "helped",
  evidence_tier: "verified", reason: "caller asserts its own verified tier" },
  "caller", { event_id: "oassert", possession_id: "assert", ts: 1785900000002 }); } catch {}`);
  expect(s.good).toBe(0);
  expect(s.helped).toBe(0);
});

test("positive control · the real tool path lands verifiedGood on the shipped bundle", () => {
  // Mack's G1.4: the adapter computed credit correctly while the scoreboard stayed 0, because
  // the signing context never left verifierRun. This drives the packed bundle's REAL tool chain -
  // register, prescribe, observe a Skill call, verify - and reads the scoreboard afterwards.
  const pkg = packedPackage();
  const state = mkdtempSync(join(tmpdir(), "mm-positive-"));
  const keyHome = mkdtempSync(join(tmpdir(), "mm-positive-key-"));
  const work = join(state, "workspace");
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "target.txt"), "broken\n");
  // The router only prescribes an INSTALLED skill, so the shelf has to be real.
  const shelf = join(state, "g", "recovering-failed-exact-match-edits");
  mkdirSync(shelf, { recursive: true });
  writeFileSync(join(shelf, "SKILL.md"), "---\nname: recovering-failed-exact-match-edits\ndescription: Use when an exact-match file edit fails because target text is stale and must be re-anchored\n---\n## Procedure\n1. Read current content.\n2. Re-anchor.\n3. Verify.\n");
  const probe = join(state, "positive.mjs");
  writeFileSync(probe, `
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const mod = await import(pathToFileURL(${JSON.stringify(join(pkg, "mods", "index.bundled.mjs"))}).href);
mod.__mm.initInstrumentKey({ keyPath: process.env.MM_INSTRUMENT_KEY_FILE, stateDir: process.env.MM_STATE_DIR });

const tools = new Map(); const handlers = {};
const fire = (n, e) => { for (const fn of handlers[n] || []) { try { fn(e); } catch {} } };
const letta = {
  capabilities: { tools: true, commands: true, permissions: true, ui: { panels: true }, events: { tools: true } },
  events: { on(n, fn) { (handlers[n] ||= []).push(fn); return () => {}; } },
  tools: { register(d) { tools.set(d.name, d); return () => {}; } },
  commands: { register: () => () => {} }, permissions: { register: () => () => {} },
  ui: { panels: { register: () => () => {} } },
};
await mod.default(letta);
const skill = "recovering-failed-exact-match-edits";
const expected = createHash("sha256").update("repaired\\n").digest("hex");
await tools.get("register_exact_file_verification").run({ args: { task_id: "t1", task_class: "exact-file-repair", target_rel: "target.txt", expected_sha256: expected } });
const prescribed = String(await tools.get("muscle_memory_skill_read").run({
  args: { action: "prescribe", gap_observed: true, task: "exact-match file edit failed because target text was stale", task_class: "exact-file-repair", difficulty: "standard", verification_task_id: "t1" },
  model: { id: "probe", provider: "test" }, agent: { name: "probe" },
}));
const pid = prescribed.match(/possession: ([a-z0-9._:-]+)/i)?.[1] || "";
// the skill runs, and the runtime witnesses it
fire("tool_start", { toolName: "Skill", toolCallId: "call-1", args: { skill } });
writeFileSync(join(process.env.MM_EXACT_FILE_ROOT, "target.txt"), "repaired\\n");
fire("tool_end", { toolName: "Skill", toolCallId: "call-1", status: "success", output: "applied" });
const verification = String(await tools.get("verify_agent_possession").run({ args: { possession_id: pid } }));
const s = mod.__mm.summarizePossessionLedger();
console.log("RESULT " + JSON.stringify({ verifiedGood: s.verifiedGoodDecisions, verified: s.verifiedDecisions, helped: s.helpfulInterventions, saysHelped: verification.includes("BOUND-VERIFIED 'helped'") , v: verification.slice(0, 150) }));
`);
  const raw = execFileSync("node", [probe], {
    cwd: state, encoding: "utf8",
    env: {
      ...process.env, MM_STATE_DIR: state, MEMORY_DIR: join(state, "m"), MM_GLOBAL_SKILLS_DIR: join(state, "g"),
      MM_EXACT_FILE_ROOT: work, MM_INSTRUMENT_KEY_FILE: join(keyHome, "mm.key"), MM_ADVANCED: "on",
    },
  });
  const out = JSON.parse(raw.split("RESULT ")[1].trim().split("\n")[0]);
  rmSync(state, { recursive: true, force: true });
  rmSync(keyHome, { recursive: true, force: true });
  expect(out.v, JSON.stringify(out)).toContain("BOUND-VERIFIED");
  expect(out.saysHelped, JSON.stringify(out)).toBe(true);
  expect(out.verifiedGood).toBe(1);   // the scoreboard, not just the adapter
  expect(out.helped).toBe(1);
}, 60_000);   // packs, extracts, and boots the real runtime

test("stale key cache · a report before instrument init must not starve the scoreboard", () => {
  // Mack's G1 regression, same process: summarize with a verified-tier row FIRST (which used to
  // pin keyCache = null forever), then init the key, then run the causal path. The row must sign.
  const pkg = packedPackage();
  const state = mkdtempSync(join(tmpdir(), "mm-stale-"));
  const keyHome = mkdtempSync(join(tmpdir(), "mm-stale-key-"));
  const work = join(state, "workspace");
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "target.txt"), "broken\n");
  const shelf = join(state, "g", "recovering-failed-exact-match-edits");
  mkdirSync(shelf, { recursive: true });
  writeFileSync(join(shelf, "SKILL.md"), "---\nname: recovering-failed-exact-match-edits\ndescription: Use when an exact-match file edit fails because target text is stale and must be re-anchored\n---\n## Procedure\n1. Read.\n2. Re-anchor.\n3. Verify.\n");
  const probe = join(state, "stale.mjs");
  writeFileSync(probe, `
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const mod = await import(pathToFileURL(${JSON.stringify(join(pkg, "mods", "index.bundled.mjs"))}).href);
const mm = mod.__mm;
// 1. a report BEFORE any key exists, over a ledger that CONTAINS a verified-tier row.
//    Summarizing an empty ledger never consults the key, so it would poison nothing - the
//    poison needs a row that actually asks "is this signature authentic?".
const NL = String.fromCharCode(10);
writeFileSync(join(process.env.MM_STATE_DIR, "possessions.jsonl"), [
  JSON.stringify({ schema: "mm.possession.v1", event_id: "d-seed", possession_id: "p-seed", ts: 1785900000000, type: "decision", agent: "a", model: "m", action: "prescribe", task_class: "seed", difficulty: "standard", gap_observed: true, route: "matched", skill: "recovering-failed-exact-match-edits" }),
  JSON.stringify({ schema: "mm.possession.v1", event_id: "o-seed", possession_id: "p-seed", ts: 1785900000001, type: "outcome", result: "helped", evidence_tier: "verified", reason: "a pre-existing verified-tier row forces a key lookup" }),
  "",
].join(NL));
const pre = mm.summarizePossessionLedger();
// 2. the user runs instrument init
mm.initInstrumentKey({ keyPath: process.env.MM_INSTRUMENT_KEY_FILE, stateDir: process.env.MM_STATE_DIR });
// 3. the full causal path, same process
const tools = new Map(); const handlers = {};
const fire = (n, e) => { for (const f of handlers[n] || []) { try { f(e); } catch {} } };
await mod.default({
  capabilities: { tools: true, commands: true, permissions: true, ui: { panels: true }, events: { tools: true } },
  events: { on(n, f) { (handlers[n] ||= []).push(f); return () => {}; } },
  tools: { register(d) { tools.set(d.name, d); return () => {}; } },
  commands: { register: () => () => {} }, permissions: { register: () => () => {} },
  ui: { panels: { register: () => () => {} } },
});
const expected = createHash("sha256").update("repaired\\n").digest("hex");
await tools.get("register_exact_file_verification").run({ args: { task_id: "t1", task_class: "exact-file-repair", target_rel: "target.txt", expected_sha256: expected } });
const pres = String(await tools.get("muscle_memory_skill_read").run({ args: { action: "prescribe", gap_observed: true, task: "exact-match file edit failed because target text was stale", task_class: "exact-file-repair", difficulty: "standard", verification_task_id: "t1" }, model: { id: "p", provider: "t" }, agent: { name: "p" } }));
const pid = pres.match(/possession: ([a-z0-9._:-]+)/i)?.[1] || "";
fire("tool_start", { toolName: "Skill", toolCallId: "c1", args: { skill: "recovering-failed-exact-match-edits" } });
writeFileSync(join(process.env.MM_EXACT_FILE_ROOT, "target.txt"), "repaired\\n");
fire("tool_end", { toolName: "Skill", toolCallId: "c1", status: "success", output: "applied" });
await tools.get("verify_agent_possession").run({ args: { possession_id: pid } });
const s = mm.summarizePossessionLedger();
console.log("RESULT " + JSON.stringify({ preVerified: pre.verifiedDecisions, verifiedGood: s.verifiedGoodDecisions, helped: s.helpfulInterventions, downgraded: s.unboundVerifiedDowngraded }));
`);
  const raw = execFileSync("node", [probe], {
    cwd: state, encoding: "utf8",
    env: {
      ...process.env, MM_STATE_DIR: state, MEMORY_DIR: join(state, "m"), MM_GLOBAL_SKILLS_DIR: join(state, "g"),
      MM_EXACT_FILE_ROOT: work, MM_INSTRUMENT_KEY_FILE: join(keyHome, "mm.key"), MM_ADVANCED: "on",
    },
  });
  const out = JSON.parse(raw.split("RESULT ")[1].trim().split("\n")[0]);
  rmSync(state, { recursive: true, force: true });
  rmSync(keyHome, { recursive: true, force: true });
  expect(out.verifiedGood, JSON.stringify(out)).toBe(1);   // the causal row signed despite the earlier miss
  expect(out.downgraded).toBe(1);                           // and the seeded unsigned row is still refused
}, 60_000);

test("evidence transplant · an authentic signature cannot be moved onto another row", () => {
  // The P0 a cold reviewer found. Authenticity and structural binding were two self-consistent
  // gates that never compared notes: the HMAC proved a payload was genuine, the binder proved a
  // receipt belonged to this decision, and nothing proved they described the SAME event. So an
  // authentic payload lifted from a possession that earned credit rode in on a different row's
  // own valid receipt and was awarded credit with no downgrade recorded.
  //
  // Donor A: real repair, observed invocation, legitimately earns credit.
  // Victim B: same shape, NO invocation, correctly earns nothing.
  // Attack:   B keeps its OWN receipt, but takes A's signed evidence.
  const pkg = packedPackage();
  const state = mkdtempSync(join(tmpdir(), "mm-transplant-"));
  const keyHome = mkdtempSync(join(tmpdir(), "mm-transplant-key-"));
  const work = join(state, "workspace");
  mkdirSync(work, { recursive: true });
  const shelf = join(state, "g", "recovering-failed-exact-match-edits");
  mkdirSync(shelf, { recursive: true });
  writeFileSync(join(shelf, "SKILL.md"), "---\nname: recovering-failed-exact-match-edits\ndescription: Use when an exact-match file edit fails because target text is stale and must be re-anchored\n---\n## Procedure\n1. Read.\n");
  const probe = join(state, "transplant.mjs");
  writeFileSync(probe, `
import { pathToFileURL } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const NL = String.fromCharCode(10);
const mod = await import(pathToFileURL(${JSON.stringify(join(pkg, "mods", "index.bundled.mjs"))}).href);
const mm = mod.__mm;
mm.initInstrumentKey({ keyPath: process.env.MM_INSTRUMENT_KEY_FILE, stateDir: process.env.MM_STATE_DIR });
const tools = new Map(); const handlers = {};
const fire = (n, e) => { for (const f of handlers[n] || []) { try { f(e); } catch {} } };
await mod.default({
  capabilities: { tools: true, commands: true, permissions: true, ui: { panels: true }, events: { tools: true } },
  events: { on(n, f) { (handlers[n] ||= []).push(f); return () => {}; } },
  tools: { register(d) { tools.set(d.name, d); return () => {}; } },
  commands: { register: () => () => {} }, permissions: { register: () => () => {} },
  ui: { panels: { register: () => () => {} } },
});
const W = process.env.MM_EXACT_FILE_ROOT;
const mk = async (id, file, invoke) => {
  writeFileSync(join(W, file), "broken" + NL);
  await tools.get("register_exact_file_verification").run({ args: { task_id: id, task_class: "exact-file-repair", target_rel: file, expected_sha256: sha("repaired" + NL) } });
  const p = String(await tools.get("muscle_memory_skill_read").run({ args: { action: "prescribe", gap_observed: true, task: "exact-match file edit failed because target text was stale", task_class: "exact-file-repair", difficulty: "standard", verification_task_id: id }, model: { id: "m", provider: "t" }, agent: { name: "a" } }));
  const pid = p.match(/possession: ([a-z0-9._:-]+)/i)?.[1] || "";
  const c = "c-" + id;
  if (invoke) fire("tool_start", { toolName: "Skill", toolCallId: c, args: { skill: "recovering-failed-exact-match-edits" } });
  writeFileSync(join(W, file), "repaired" + NL);
  if (invoke) fire("tool_end", { toolName: "Skill", toolCallId: c, status: "success", output: "ok" });
  await tools.get("verify_agent_possession").run({ args: { possession_id: pid } });
  return pid;
};
const A = await mk("ta", "a.txt", true);
const B = await mk("tb", "b.txt", false);
const before = mm.summarizePossessionLedger();
const L = join(process.env.MM_STATE_DIR, "possessions.jsonl");
const rows = readFileSync(L, "utf8").trim().split(NL).map(JSON.parse);
const oa = rows.find((r) => r.type === "outcome" && r.possession_id === A);
const ob = rows.find((r) => r.type === "outcome" && r.possession_id === B);
ob.evidence = oa.evidence;          // authentic signature from a different possession
ob.result = "helped";               // and the caller asserts the win
writeFileSync(L, rows.map((r) => JSON.stringify(r)).join(NL) + NL);
const after = mm.summarizePossessionLedger();
console.log("RESULT " + JSON.stringify({
  beforeVG: before.verifiedGoodDecisions,
  afterVG: after.verifiedGoodDecisions,
  transplantDemoted: after.transplantDemoted ?? 0,
}));
`);
  const raw = execFileSync("node", [probe], {
    cwd: state, encoding: "utf8",
    env: {
      ...process.env, MM_STATE_DIR: state, MEMORY_DIR: join(state, "m"), MM_GLOBAL_SKILLS_DIR: join(state, "g"),
      MM_EXACT_FILE_ROOT: work, MM_INSTRUMENT_KEY_FILE: join(keyHome, "mm.key"), MM_ADVANCED: "on",
    },
  });
  const out = JSON.parse(raw.split("RESULT ")[1].trim().split("\n")[0]);
  rmSync(state, { recursive: true, force: true });
  rmSync(keyHome, { recursive: true, force: true });
  expect(out.beforeVG, JSON.stringify(out)).toBe(1);
  expect(out.afterVG, JSON.stringify(out)).toBe(1);      // the theft must not inflate the score
  expect(out.transplantDemoted).toBeGreaterThan(0);       // and must be visibly recorded
}, 90_000);

/** Shared driver for the fix-v2 attack classes, all against the SHIPPED bundle. */
function attack(body: string): Record<string, number> {
  const pkg = packedPackage();
  const state = mkdtempSync(join(tmpdir(), "mm-atk-"));
  const keyHome = mkdtempSync(join(tmpdir(), "mm-atk-key-"));
  const work = join(state, "workspace");
  mkdirSync(work, { recursive: true });
  const shelf = join(state, "g", "recovering-failed-exact-match-edits");
  mkdirSync(shelf, { recursive: true });
  writeFileSync(join(shelf, "SKILL.md"), "---\nname: recovering-failed-exact-match-edits\ndescription: Use when an exact-match file edit fails because target text is stale and must be re-anchored\n---\n## Procedure\n1. Read.\n");
  const probe = join(state, "atk.mjs");
  writeFileSync(probe, `
import { pathToFileURL } from "node:url";
import { writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const NL = String.fromCharCode(10);
const mod = await import(pathToFileURL(${JSON.stringify(join(pkg, "mods", "index.bundled.mjs"))}).href);
const mm = mod.__mm;
mm.initInstrumentKey({ keyPath: process.env.MM_INSTRUMENT_KEY_FILE, stateDir: process.env.MM_STATE_DIR });
const tools = new Map(); const handlers = {};
const fire = (n, e) => { for (const f of handlers[n] || []) { try { f(e); } catch {} } };
await mod.default({
  capabilities: { tools: true, commands: true, permissions: true, ui: { panels: true }, events: { tools: true } },
  events: { on(n, f) { (handlers[n] ||= []).push(f); return () => {}; } },
  tools: { register(d) { tools.set(d.name, d); return () => {}; } },
  commands: { register: () => () => {} }, permissions: { register: () => () => {} },
  ui: { panels: { register: () => () => {} } },
});
const W = process.env.MM_EXACT_FILE_ROOT;
const LEDGER = join(process.env.MM_STATE_DIR, "possessions.jsonl");
const INVLOG = join(process.env.MM_STATE_DIR, "invocations.jsonl");
const register = async (id, file) => {
  writeFileSync(join(W, file), "broken" + NL);
  await tools.get("register_exact_file_verification").run({ args: { task_id: id, task_class: "exact-file-repair", target_rel: file, expected_sha256: sha("repaired" + NL) } });
};
const prescribe = async (id) => {
  const p = String(await tools.get("muscle_memory_skill_read").run({ args: { action: "prescribe", gap_observed: true, task: "exact-match file edit failed because target text was stale", task_class: "exact-file-repair", difficulty: "standard", verification_task_id: id }, model: { id: "m", provider: "t" }, agent: { name: "a" } }));
  return p.match(/possession: ([a-z0-9._:-]+)/i)?.[1] || "";
};
const verify = async (pid) => { try { return String(await tools.get("verify_agent_possession").run({ args: { possession_id: pid } })); } catch (e) { return "threw: " + e.message; } };
const score = () => { const s = mm.summarizePossessionLedger(); return { vg: s.verifiedGoodDecisions, helped: s.helpfulInterventions }; };
const out = {};
${body}
console.log("ATK " + JSON.stringify(out));
`);
  const raw = execFileSync("node", [probe], {
    cwd: state, encoding: "utf8",
    env: {
      ...process.env, MM_STATE_DIR: state, MEMORY_DIR: join(state, "m"), MM_GLOBAL_SKILLS_DIR: join(state, "g"),
      MM_EXACT_FILE_ROOT: work, MM_INSTRUMENT_KEY_FILE: join(keyHome, "mm.key"), MM_ADVANCED: "on",
    },
  });
  const out = JSON.parse(raw.split("ATK ")[1].trim().split("\n")[0]);
  rmSync(state, { recursive: true, force: true });
  rmSync(keyHome, { recursive: true, force: true });
  return out;
}

test("forged invocation · an unsigned observation cannot mint procedural credit", () => {
  // The observer log was plain JSONL: anyone who could write the state directory appended a line
  // and the instrument then notarized that lie as verified evidence.
  const r = attack(`
await register("t1", "target.txt");
const pid = await prescribe("t1");
const dec = readFileSync(LEDGER, "utf8").trim().split(NL).map(JSON.parse).find((x) => x.type === "decision");
appendFileSync(INVLOG, JSON.stringify({
  schema: "mm.invocation.v1", invocation_id: "inv-forged", possession_id: pid,
  decision_event_id: dec.event_id, skill: "recovering-failed-exact-match-edits",
  call_id: "forged", started_at: dec.ts + 1, ended_at: dec.ts + 2, nonce: "n",
}) + NL);
writeFileSync(join(W, "target.txt"), "repaired" + NL);
out.verify = (await verify(pid)).slice(0, 60);
Object.assign(out, score());
`);
  expect(r.vg, JSON.stringify(r)).toBe(0);
}, 90_000);

test("pre-decision invocation · a skill that ran before the prescription earns nothing", () => {
  // An invocation whose started_at preceded the decision was adopted as proof the decision caused
  // the repair. Causation cannot run backwards.
  const r = attack(`
await register("t1", "target.txt");
const cid = "c-early";
fire("tool_start", { toolName: "Skill", toolCallId: cid, args: { skill: "recovering-failed-exact-match-edits" } });
fire("tool_end", { toolName: "Skill", toolCallId: cid, status: "success", output: "ran before any prescription existed" });
const pid = await prescribe("t1");
writeFileSync(join(W, "target.txt"), "repaired" + NL);
out.verify = (await verify(pid)).slice(0, 60);
Object.assign(out, score());
`);
  expect(r.vg, JSON.stringify(r)).toBe(0);
}, 90_000);

test("task reuse · one sealed manifest cannot back two possessions", () => {
  const r = attack(`
await register("t1", "target.txt");
const p1 = await prescribe("t1");
const p2 = await prescribe("t1");
writeFileSync(join(W, "target.txt"), "repaired" + NL);
out.v1 = (await verify(p1)).slice(0, 80);
out.v2 = (await verify(p2)).slice(0, 80);
out.refused = (out.v1 + out.v2).includes("already bound to a different") ? 1 : 0;
Object.assign(out, score());
`);
  expect(r.refused, JSON.stringify(r)).toBe(1);
  expect(r.vg).toBe(0);
}, 90_000);
