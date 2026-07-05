// muscle-memory · E7 referee (skill plus-minus) tests.
//
// CONTRACT under test: the local ledger is the source of truth — every VALID rating lands there,
// ACCUMULATING plus/minus per skill (never overwriting, never clobbering sibling skills) and
// surviving reload. steps.feedback is ADDITIVE: posted only when a step id exists, with
// 'positive'/'negative' mapping, and a failing native post never loses the ledger write.
// skillUtility treats absence of ratings as NO EVIDENCE (null) — never as a minus.
// Run: `MM_STATE_DIR=$(mktemp -d) MM_GLOBAL_SKILLS_DIR=$(mktemp -d) bun test test/referee.test.ts`
import { test, expect } from "bun:test";
import { loadPlusMinus, rateSkill, recordPlusMinus, skillUtility } from "../mods/referee";

// ── ledger round-trip ───────────────────────────────────────────────────────────────────────

test("recordPlusMinus/loadPlusMinus: ratings ACCUMULATE per skill across reloads; siblings untouched", () => {
  recordPlusMinus("ref-skill-a", true);
  recordPlusMinus("ref-skill-a", true, "step-7");
  recordPlusMinus("ref-skill-a", false);
  recordPlusMinus("ref-skill-b", false);
  const ledger = loadPlusMinus(); // re-read from disk — the round-trip, not the return value
  expect(ledger["ref-skill-a"]).toMatchObject({ plus: 2, minus: 1, lastStepId: null }); // last write carried no step id
  expect(ledger["ref-skill-a"].lastTs).toBeGreaterThan(0);
  expect(ledger["ref-skill-b"]).toMatchObject({ plus: 0, minus: 1 }); // a-writes never clobbered b
});

// ── skillUtility (pure) ─────────────────────────────────────────────────────────────────────

test("skillUtility: unrated → null (absence of evidence is NOT a minus); rated → plus − minus", () => {
  const ledger = {
    "earning-skill": { plus: 3, minus: 1, lastTs: 1, lastStepId: null },
    "losing-skill": { plus: 0, minus: 2, lastTs: 1, lastStepId: null },
    "zeroed-skill": { plus: 0, minus: 0, lastTs: 0, lastStepId: null },
  };
  expect(skillUtility(ledger, "never-rated")).toBeNull(); // absent → no evidence, not retirement fodder
  expect(skillUtility(ledger, "zeroed-skill")).toBeNull(); // present but 0/0 → still no evidence
  expect(skillUtility(ledger, "earning-skill")).toBe(2);
  expect(skillUtility(ledger, "losing-skill")).toBe(-2);
});

// ── rateSkill ───────────────────────────────────────────────────────────────────────────────

test("rateSkill: step id + surface → native feedback posted as 'positive'/'negative'; ledger updated", async () => {
  const posts: Array<unknown[]> = [];
  const client = { steps: { feedback: { create: (...a: unknown[]) => { posts.push(a); return Promise.resolve({}); } } } };
  const up = await rateSkill(client, "ref-skill-native", true, "step-1");
  expect(up.nativePosted).toBe(true);
  const down = await rateSkill(client, "ref-skill-native", false, "step-2");
  expect(down.nativePosted).toBe(true);
  expect(posts).toEqual([["step-1", { feedback: "positive" }], ["step-2", { feedback: "negative" }]]); // up/down → wire mapping
  expect(loadPlusMinus()["ref-skill-native"]).toMatchObject({ plus: 1, minus: 1, lastStepId: "step-2" });
});

test("rateSkill: without step id → ledger only, native surface never touched", async () => {
  let posted = 0;
  const client = { steps: { feedback: { create: () => { posted++; return Promise.resolve({}); } } } };
  const res = await rateSkill(client, "ref-skill-local", true);
  expect(res.nativePosted).toBe(false);
  expect(posted).toBe(0);
  expect(loadPlusMinus()["ref-skill-local"]).toMatchObject({ plus: 1, minus: 0 });
});

test("rateSkill: failing steps.feedback tolerated — ledger still records, nativePosted false", async () => {
  const client = { steps: { feedback: { create: () => Promise.reject(new Error("503")) } } };
  const res = await rateSkill(client, "ref-skill-flaky", false, "step-9");
  expect(res.nativePosted).toBe(false); // native post is additive, never load-bearing
  expect(loadPlusMinus()["ref-skill-flaky"]).toMatchObject({ plus: 0, minus: 1, lastStepId: "step-9" });
});

test("rateSkill: invalid skill name refused — NO ledger write", async () => {
  const res = await rateSkill({}, "Not Valid!", true, "step-1");
  expect(res.nativePosted).toBe(false);
  expect(res.reason).toContain("invalid");
  expect(loadPlusMinus()["Not Valid!"]).toBeUndefined(); // garbage names never pollute the ledger
});
