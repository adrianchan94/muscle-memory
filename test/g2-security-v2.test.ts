// g2-security-v2 — a NEW security suite, not a restoration.
//
// The original S4–S20 scenarios lived only in /tmp/mm-g2-run and were reaped. Their source is
// unrecoverable; only their titles survive in the G2 receipts. This suite is therefore given its
// own identity and makes NO continuity claim: it is not "S4–S20 restored", it is a fresh suite
// written against the same threats, to be witnessed as new.
//
// Every scenario is stated as threat · setup · attack · expected, drives the BUILT bundle in a
// disposable seat, and asserts a fail-closed outcome that a plausible regression would break.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = join(ROOT, "mods", "index.bundled.mjs");

beforeAll(() => {
  // Assert freshness; never build here. A build inside a test rewrites the artifact the rest of
  // the suite is grading.
  expect(existsSync(BUNDLE), "run `npm run build` before the suite").toBe(true);
  const bundleAt = statSync(BUNDLE).mtimeMs;
  const newest = readdirSync(join(ROOT, "mods"))
    .filter((f) => f.endsWith(".ts"))
    .reduce((max, f) => Math.max(max, statSync(join(ROOT, "mods", f)).mtimeMs), 0);
  expect(bundleAt, "bundle older than mods/*.ts — run `npm run build`").toBeGreaterThanOrEqual(newest);
});

const seats: string[] = [];
afterAll(() => { for (const d of seats) rmSync(d, { recursive: true, force: true }); });

/** A disposable agent seat with its own state dir, shelves and instrument key location. */
interface Seat {
  home: string;
  state: string;
  shelf: string;
  global: string;
}

function seat(): Seat {
  const home = mkdtempSync(join(tmpdir(), "mm-g2v2-"));
  seats.push(home);
  const s: Seat = {
    home,
    state: join(home, "state"),
    shelf: join(home, "skills"),
    global: join(home, "global"),
  };
  for (const d of [s.state, s.shelf, s.global]) mkdirSync(d, { recursive: true });
  return s;
}

/** A skill that will actually match the task text the scenarios prescribe against. */
function seedMatchingSkill(shelf: string): string {
  const name = "recovering-failed-exact-match-edits";
  mkdirSync(join(shelf, name), { recursive: true });
  writeFileSync(join(shelf, name, "SKILL.md"), `---\nname: ${name}\ndescription: Use when an exact-match file edit fails because the target text is stale: re-read the file, re-anchor the match to current source, and re-run the same edit.\n---\n\n## When to use\n\nWhen an exact-match edit fails because the anchor text is stale.\n\n## Procedure\n\n1. Re-read the file around the failing range.\n2. Re-anchor the match to the current source text.\n3. Re-run the same edit and confirm it applies.\n\n## Verification\n\n- The edit applies and the original command exits zero.\n`);
  return name;
}

const TASK = "exact-match file edit failed because the target text was stale";

function drive(s: Seat, body: string, extraEnv: Record<string, string> = {}): any {
  const probe = join(s.home, `probe-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(probe, `
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { join } from "node:path";
const mod = await import(${JSON.stringify(BUNDLE)});
const mm = mod.__mm;
const tools = new Map();
await mod.default({
  capabilities: { tools: true, commands: true, permissions: false },
  tools: { register: (t) => { tools.set(t.name, t); return () => {}; } },
  commands: { register: () => () => {} },
  events: { on: () => () => {} },
  ui: {},
});
const TASK = ${JSON.stringify(TASK)};
const prescribe = async (task = TASK) =>
  String(await tools.get("muscle_memory_prescribe").run({ args: { gap_observed: true, task } }));
const pidOf = (text) => (text.match(/possession: ([a-z0-9._:-]+)/i) || [])[1] || "";
const close = async (id, result, reason) =>
  String(await tools.get("muscle_memory_close").run({ args: { possession_id: id, result, reason } }));
const out = {};
${body}
console.log("@@" + JSON.stringify(out));
// The mod leaves a handle open that keeps the loop alive ~12s after the work finishes. In a
// long-lived host that is irrelevant; in a probe it turns a 2ms assertion into a 12s test.
process.exit(0);
`);
  const raw = execFileSync("node", [probe], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: s.home,
      MM_STATE_DIR: s.state,
      MM_AGENT_SKILLS_DIR: s.shelf,
      MM_GLOBAL_SKILLS_DIR: s.global,
      ...extraEnv,
    },
  });
  const line = raw.split("\n").find((l) => l.startsWith("@@"));
  if (!line) throw new Error(`probe produced no result:\n${raw.slice(-500)}`);
  return JSON.parse(line.slice(2));
}

// ── A · abstention is a value, not a failure ───────────────────────────────────
// threat: an empty shelf makes the loop look broken, tempting a caller to invent credit.
// attack: prescribe with nothing installed, then try to close it as a win.
// expected: an explicit abstain, and a refusal to record `helped` against it.
test("g2v2 · an empty shelf abstains, and abstention cannot be closed as helped", () => {
  const s = seat();
  const r = drive(s, `
mm.initInstrumentKey({ stateDir: process.env.MM_STATE_DIR });
const p = await prescribe();
out.abstained = /ABSTAIN/i.test(p);
out.hasNextStep = /Next:/i.test(p);
const pid = pidOf(p);
out.close = await close(pid, "helped", "claiming a win with nothing installed");
out.refused = /not recorded|incompatible/i.test(out.close);
const sum = mm.summarizePossessionLedger();
out.closed = sum.closedDecisions;
`);
  expect(r.abstained).toBe(true);
  expect(r.hasNextStep, "an abstention must still hand the agent a next step").toBe(true);
  expect(r.refused, `close should refuse: ${r.close}`).toBe(true);
  expect(r.closed).toBe(0);
});

// ── B · a real prescription can be closed, and it lands in the ledger ──────────
// This is the positive control. A suite that only proves refusals passes trivially when the
// product refuses everything — the exact gap that let the containment false-positive ship.
test("g2v2 · positive control: a matched prescription closes and is counted", () => {
  const s = seat();
  seedMatchingSkill(s.shelf);
  const r = drive(s, `
mm.initInstrumentKey({ stateDir: process.env.MM_STATE_DIR });
const p = await prescribe();
out.prescribed = /PRESCRIBE|Skill/i.test(p) && !/ABSTAIN/i.test(p);
const pid = pidOf(p);
out.pid = pid;
out.close = (await close(pid, "helped", "re-anchored the match and the edit applied")).slice(0, 120);
const sum = mm.summarizePossessionLedger();
out.closed = sum.closedDecisions;
out.integrity = sum.ledgerIntegrity;
`);
  expect(r.prescribed, "the seeded skill must actually match the task").toBe(true);
  expect(r.pid).toBeTruthy();
  expect(r.closed).toBe(1);
  expect(r.integrity).toBe("ok");
});

// ── C · a receipt cannot be replayed onto another possession ───────────────────
// NOTE ON WHAT THIS TEST DOES AND DOES NOT PROVE. The replay is refused by TWO independent
// guards — the ledger rejects a second active outcome, and the close path rejects a possession
// that already has one. Disabling either alone leaves this test green, which I verified rather
// than assumed. So this is a behaviour test of the observable contract, not a regression test
// for one guard. Recorded plainly because a green test whose reach you have not measured is the
// same trap as a guard whose green path you have not exercised.
// threat: harvest one authentic closure and reuse it to inflate a second.
// attack: close possession A honestly, then close B by pasting A's possession id back.
// expected: the ledger never credits two closures to one decision.
test("g2v2 · an authentic closure cannot be replayed onto a second possession", () => {
  const s = seat();
  seedMatchingSkill(s.shelf);
  const r = drive(s, `
mm.initInstrumentKey({ stateDir: process.env.MM_STATE_DIR });
const a = pidOf(await prescribe());
out.first = (await close(a, "helped", "genuine repair")).slice(0, 80);
const b = pidOf(await prescribe());
out.replay = (await close(a, "helped", "same receipt, second time")).slice(0, 120);
out.replayRefused = /not recorded|already|closed/i.test(out.replay);
const sum = mm.summarizePossessionLedger();
out.closed = sum.closedDecisions;
out.pending = sum.pendingDecisions;
`);
  expect(r.replayRefused, `replay should be refused: ${r.replay}`).toBe(true);
  expect(r.closed, "a replayed close must not add a second credit").toBe(1);
});

// ── D · a tier upgrade written straight to disk must not become a proven claim ──
// threat: the honest close records `agent_judged`. Editing that one word on disk is the cheapest
// possible forgery — it converts an unproven claim into a verified one.
// attack: close honestly, then rewrite evidence_tier to a verified tier in the ledger file.
// expected: the score never presents the forged row as verified.
test("g2v2 · upgrading evidence_tier on disk is caught as unbound and downgraded", () => {
  const s = seat();
  seedMatchingSkill(s.shelf);
  const before = drive(s, `
mm.initInstrumentKey({ stateDir: process.env.MM_STATE_DIR });
for (let i = 0; i < 4; i++) {
  const pid = pidOf(await prescribe(TASK + " run " + i));
  if (pid) await close(pid, "helped", "re-anchored and it applied " + i);
}
const sum = mm.summarizePossessionLedger();
out.closed = sum.closedDecisions;
out.verifiedDecisions = sum.verifiedDecisions;
out.downgraded = sum.unboundVerifiedDowngraded;
`);
  expect(before.closed).toBe(4);
  expect(before.verifiedDecisions).toBe(0);
  expect(before.downgraded).toBe(0);

  const path = join(s.state, "possessions.jsonl");
  const original = readFileSync(path, "utf8");
  expect(original).toContain('"evidence_tier":"agent_judged"'); // the honest value being attacked
  writeFileSync(path, original.replace(/"evidence_tier":"agent_judged"/g, '"evidence_tier":"verified"'));

  const after = drive(s, `
const sum = mm.summarizePossessionLedger();
out.verifiedDecisions = sum.verifiedDecisions;
out.downgraded = sum.unboundVerifiedDowngraded;
`);
  // The forged rows claim a verified tier with nothing binding them to a signed observation.
  // They must be counted as downgraded, and must not become verified decisions.
  expect(after.downgraded, "the forgery must be visibly demoted, not silently ignored").toBe(4);
  expect(after.verifiedDecisions, "a hand-edited tier must never mint a verified decision").toBe(0);
});

// ── E · a hand-written outcome row cannot mint credit ──────────────────────────
// threat: skip the loop entirely and type a win into the ledger.
// attack: append a plausible outcome row with no authentic decision behind it.
// expected: it is not counted as a closed decision on a clean ledger.
test("g2v2 · a hand-written outcome row earns nothing", () => {
  const s = seat();
  seedMatchingSkill(s.shelf);
  const base = drive(s, `
mm.initInstrumentKey({ stateDir: process.env.MM_STATE_DIR });
const a = pidOf(await prescribe());
await close(a, "helped", "genuine");
out.closed = mm.summarizePossessionLedger().closedDecisions;
`);
  expect(base.closed).toBe(1);

  const path = join(s.state, "possessions.jsonl");
  const forged = JSON.stringify({
    schema: "mm.possession.v1",
    event_id: "o-p-forged-by-hand",
    possession_id: "p-forged-by-hand",
    ts: Date.now(),
    type: "outcome",
    result: "helped",
    evidence_tier: "verified",
    reason: "typed straight into the file",
  });
  writeFileSync(path, readFileSync(path, "utf8") + forged + "\n");

  const after = drive(s, `
const sum = mm.summarizePossessionLedger();
out.closed = sum.closedDecisions;
out.integrity = sum.ledgerIntegrity;
out.excluded = sum.excludedDecisions;
out.status = sum.scoreStatus;
`);
  const credited = after.integrity === "ok" && after.excluded === 0 && after.closed > base.closed;
  expect(credited, `a hand-written row minted credit: ${JSON.stringify(after)}`).toBe(false);
});

// ── F · the score survives a full process restart ──────────────────────────────
// threat: state that only exists in memory is not a ledger.
// expected: a closure recorded in one process is still there in the next.
test("g2v2 · a recorded closure survives a full process restart", () => {
  const s = seat();
  seedMatchingSkill(s.shelf);
  const first = drive(s, `
mm.initInstrumentKey({ stateDir: process.env.MM_STATE_DIR });
const a = pidOf(await prescribe());
await close(a, "helped", "genuine repair");
out.closed = mm.summarizePossessionLedger().closedDecisions;
`);
  expect(first.closed).toBe(1);
  const second = drive(s, `
const sum = mm.summarizePossessionLedger();
out.closed = sum.closedDecisions;
out.integrity = sum.ledgerIntegrity;
`);
  expect(second.closed).toBe(1);
  expect(second.integrity).toBe("ok");
});

// ── G · an uninitialised instrument is announced, not silently degraded ────────
// threat: no key means no signed credit; hiding that turns absence into apparent success.
// expected: the summary reports a non-verified status rather than claiming a clean score.
test("g2v2 · without an instrument key the score status is not presented as verified", () => {
  const s = seat();
  seedMatchingSkill(s.shelf);
  const r = drive(s, `
// deliberately no initInstrumentKey
const a = pidOf(await prescribe());
out.close = (await close(a, "helped", "closed with no instrument")).slice(0, 100);
const sum = mm.summarizePossessionLedger();
out.status = sum.scoreStatus;
out.integrity = sum.ledgerIntegrity;
`);
  expect(r.status).not.toBe("verified");
  expect(typeof r.status).toBe("string");
});
