// THE MIRROR OF A PRESCRIPTION.
//
// A prescription is verified by proving a POSITIVE: the artifact is right AND the prescribed
// skill was observed running. Every public benchmark scores that cell. Nothing scores the other
// one — the true negative, where the right call was to send nobody in and the agent got there
// alone. Until now MM could not score it either: a verification binding was refused on abstain
// possessions, the signer demanded an invocation receipt that an abstention cannot have by
// definition, and the result mapper only spoke the prescribe vocabulary. `verifiedSuccessful-
// Abstentions` was therefore structurally 0, and the only cell nobody measures stayed the one
// cell MM let the agent self-report.
//
// These tests are adversarial on purpose. Making abstention reachable is worthless if it opens
// a second door into `verified`, so each honest case below is paired with the lie that shares
// its shape, and the lie must FAIL CLOSED.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { initInstrumentKey } from "../mods/instrument";
import { STATE_DIR } from "../mods/core";
import {
  POSSESSION_LEDGER_PATH,
  __resetInstrumentKeyCache,
  buildShareCardPayload,
  claimBearingVerdict,
  loadPossessionEvents,
  recordInstrumentVerifiedOutcome,
  recordPossessionEvent,
  summarizePossessionLedger,
} from "../mods/possessions";
import { INVOCATION_LOG_PATH, observeToolEnd, observeToolStart } from "../mods/invocation";
import {
  VERIFICATION_TASK_DIR,
  bindExactFileVerificationTask,
  createExactFileVerificationTask,
  verifyExactFilePossession,
} from "../mods/verification";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const BROKEN = "still broken\n";
const REPAIRED = "repaired\n";
let workspace = "";

beforeEach(() => {
  const keyHome = mkdtempSync(join(tmpdir(), "mm-abstain-key-"));
  process.env.MM_INSTRUMENT_KEY_FILE = join(keyHome, "k.key");
  initInstrumentKey({ keyPath: process.env.MM_INSTRUMENT_KEY_FILE, stateDir: STATE_DIR });
  __resetInstrumentKeyCache();
  rmSync(POSSESSION_LEDGER_PATH, { force: true });
  rmSync(INVOCATION_LOG_PATH, { force: true });
  rmSync(VERIFICATION_TASK_DIR, { recursive: true, force: true });
  workspace = mkdtempSync(join(tmpdir(), "mm-abstain-"));
  process.env.MM_EXACT_FILE_ROOT = workspace;
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(VERIFICATION_TASK_DIR, { recursive: true, force: true });
  delete process.env.MM_EXACT_FILE_ROOT;
});

/** Register a real gap: the target is WRONG when the manifest is sealed. */
function registerGap(taskId: string) {
  writeFileSync(join(workspace, "target.txt"), BROKEN);
  return createExactFileVerificationTask({
    taskId,
    taskClass: "exact-file-repair",
    targetRel: "target.txt",
    expectedSha256: sha(REPAIRED),
    registeredAt: 100,
  });
}

function openDecision(taskId: string, action: "abstain" | "prescribe", skill?: string) {
  return recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: `d-${taskId}`,
    possession_id: `p-${taskId}`,
    ts: 200,
    type: "decision",
    agent: "test-agent",
    model: "test-model",
    action,
    task_class: "exact-file-repair",
    difficulty: "standard",
    eligible: true,
    gap_observed: true,
    route: action === "abstain" ? "no-safe-match" : "matched",
    ...(skill ? { skill } : {}),
    verification: bindExactFileVerificationTask(taskId),
  }) as any;
}

const close = (decision: any, verified: any) => recordInstrumentVerifiedOutcome({
  schema: "mm.possession.v1",
  event_id: `o-${decision.possession_id}`,
  possession_id: decision.possession_id,
  ts: 300,
  type: "outcome",
  ...verified,
}, verified.evidence_context);

/** Drive the runtime's OWN observer handlers, so a "secret" skill run is recorded exactly the
 *  way a real one would be — MAC and all. Faking the log by hand would prove nothing. */
function secretlyRunSkill(decision: any, skill: string, callId: string) {
  observeToolStart({ toolName: "Skill", toolCallId: callId, args: { skill } }, 210);
  return observeToolEnd({ toolCallId: callId, status: "success" },
    [{ possession_id: decision.possession_id, event_id: decision.event_id, skill }], 220);
}

// ── 1. THE HONEST ABSTENTION ────────────────────────────────────────────────

test("honest abstention: artifact right, NO skill observed → instrument-derived succeeded_unaided", () => {
  registerGap("abstain-win");
  const decision = openDecision("abstain-win", "abstain");
  // the agent does the work itself, unaided
  writeFileSync(join(workspace, "target.txt"), REPAIRED);

  const verified = verifyExactFilePossession(decision);
  expect(verified).toMatchObject({
    result: "succeeded_unaided",   // NOT "helped" — no skill ran, so nothing helped
    evidence_tier: "verified",
    artifact_verified: true,
    procedural_credit: true,
  });
  expect(verified.reason).toContain("NO skill invocation was observed");
  // The mirror must not smuggle in an invocation id it does not have.
  expect(verified.evidence_context.invocationReceiptId).toBe("");

  close(decision, verified);
  const summary = summarizePossessionLedger();
  expect(summary).toMatchObject({
    verifiedSuccessfulAbstentions: 1,   // the cell that was structurally unreachable
    verifiedEvaluatedAbstentions: 1,
    successfulAbstentions: 1,
    unaidedClaimsDemoted: 0,
    judgedOnlyAbstentions: 0,
    verifiedDecisions: 1,
    verifiedGoodDecisions: 1,
    helpfulInterventions: 0,            // an abstention is not an intervention
    contextsAvoided: 1,
  });
  expect(summary.lastPlay).toMatchObject({ evidence: "bound_verified", result: "succeeded_unaided" });
  // the share card's custody arithmetic must accept it rather than refuse it outright
  expect(buildShareCardPayload(summary, { period: "all_time" })).toMatchObject({
    verified_successful_abstentions: 1,
    verified_evaluated_abstentions: 1,
    judged_only_abstentions: 0,
  });
});

// ── 2. THE ABSTENTION THAT SECRETLY RAN A SKILL ─────────────────────────────

test("DENIED: an abstention that secretly ran a skill is not an unaided success", () => {
  registerGap("abstain-cheat");
  const decision = openDecision("abstain-cheat", "abstain");
  expect(secretlyRunSkill(decision, "recovering-failed-exact-match-edits", "c-cheat")).not.toBeNull();
  writeFileSync(join(workspace, "target.txt"), REPAIRED);

  const verified = verifyExactFilePossession(decision);
  // The artifact IS correct. The claim of an UNAIDED success is what fails.
  expect(verified.verification.matched).toBe(true);
  expect(verified).toMatchObject({ result: "failed_unaided", procedural_credit: false });
  expect(verified.reason).toContain("skill invocation WAS observed");

  close(decision, verified);
  const summary = summarizePossessionLedger();
  expect(summary.verifiedSuccessfulAbstentions).toBe(0);
  expect(summary.successfulAbstentions).toBe(0);
  expect(summary.failedAbstentions).toBe(1);
  expect(summary.verifiedGoodDecisions).toBe(0);
});

test("DENIED at the SIGNING boundary: a hand-built succeeded_unaided receipt over a secret run", () => {
  // The adapter is not the only door. A caller holding a genuine receipt object still has to get
  // past the signer, and the signer re-derives the negative from the instrument's own log.
  registerGap("abstain-signer");
  const decision = openDecision("abstain-signer", "abstain");
  writeFileSync(join(workspace, "target.txt"), REPAIRED);
  const verified = verifyExactFilePossession(decision);
  expect(verified.procedural_credit).toBe(true);

  // ...and only THEN does the skill run get observed. The receipt in hand is now stale.
  expect(secretlyRunSkill(decision, "recovering-failed-exact-match-edits", "c-late")).not.toBeNull();
  expect(() => close(decision, verified)).toThrow("abstention credit refused");
  expect(loadPossessionEvents().filter((row) => row.type === "outcome")).toHaveLength(0);
});

test("DENIED: an abstention may not name an invocation receipt to borrow prescribe-shaped proof", () => {
  registerGap("abstain-borrow");
  const decision = openDecision("abstain-borrow", "abstain");
  writeFileSync(join(workspace, "target.txt"), REPAIRED);
  const verified = verifyExactFilePossession(decision);
  expect(() => recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "o-abstain-borrow",
    possession_id: decision.possession_id,
    ts: 300,
    type: "outcome",
    ...verified,
  } as any, { ...verified.evidence_context, invocationReceiptId: "inv-made-up" }))
    .toThrow("abstention cannot name an invocation receipt");
});

test("DENIED at READ time: an invocation row that lands after signing takes the credit back", () => {
  // A negative claim is only as good as the latest look. A signed receipt is not permission to
  // stop checking; the scoreboard re-derives the mirror predicate on every read.
  registerGap("abstain-late-row");
  const decision = openDecision("abstain-late-row", "abstain");
  writeFileSync(join(workspace, "target.txt"), REPAIRED);
  const verified = verifyExactFilePossession(decision);
  const outcome = close(decision, verified);
  expect(summarizePossessionLedger().verifiedSuccessfulAbstentions).toBe(1);

  expect(secretlyRunSkill(decision, "recovering-failed-exact-match-edits", "c-after")).not.toBeNull();
  const verdict = claimBearingVerdict(decision, outcome as any);
  expect(verdict.verified).toBe(true);                 // provenance is untouched
  expect(verdict.proceduralCredit).toBe(false);        // the CLAIM is not
  expect(verdict.proceduralReason).toBe("invocation_during_abstention");
  const summary = summarizePossessionLedger();
  expect(summary.verifiedSuccessfulAbstentions).toBe(0);
  expect(summary.unaidedClaimsDemoted).toBe(1);
  expect(summary.failedAbstentions).toBe(1);
});

// ── 3. A WRONG ARTIFACT IS failed_unaided, NEVER harmed ─────────────────────

test("a wrong artifact under an abstention maps to failed_unaided, not harmed", () => {
  // `harmed` asserts a skill did damage. No skill ran. The old mapper would have said `harmed`
  // anyway — a false statement, and one compatible() would have rejected on append.
  registerGap("abstain-miss");
  const decision = openDecision("abstain-miss", "abstain");
  // the agent tries alone and does not get there
  writeFileSync(join(workspace, "target.txt"), "half repaired\n");

  const verified = verifyExactFilePossession(decision);
  expect(verified.result).toBe("failed_unaided");
  expect(verified.result).not.toBe("harmed");
  expect(verified.verification.matched).toBe(false);

  close(decision, verified);
  const summary = summarizePossessionLedger();
  expect(summary).toMatchObject({
    failedAbstentions: 1,
    successfulAbstentions: 0,
    verifiedEvaluatedAbstentions: 1,
    verifiedSuccessfulAbstentions: 0,
    harmfulInterventions: 0,          // nothing was harmed, because nothing ran
    observedFailedAbstentions: 1,
  });
  // a verified FAILED abstention must not be smuggled into the judged cells either
  expect(buildShareCardPayload(summary, { period: "all_time" })).toMatchObject({
    verified_evaluated_abstentions: 1,
    verified_successful_abstentions: 0,
    judged_failed_abstentions: 0,
    judged_only_abstentions: 0,
    harmful_interventions: 0,
  });
});

test("a caller cannot flip a verified abstention's result string past the append check", () => {
  registerGap("abstain-flip");
  const decision = openDecision("abstain-flip", "abstain");
  writeFileSync(join(workspace, "target.txt"), REPAIRED);
  const verified = verifyExactFilePossession(decision);
  expect(() => recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "o-abstain-flip",
    possession_id: decision.possession_id,
    ts: 300,
    type: "outcome",
    ...verified,
    result: "failed_unaided",
  } as any, verified.evidence_context)).toThrow("result does not match");
});

// ── 4. PRESCRIPTION SECURITY IS UNCHANGED ───────────────────────────────────

test("prescription forgery is STILL impossible: no invocation, no procedural credit", () => {
  registerGap("prescribe-noinv");
  const decision = openDecision("prescribe-noinv", "prescribe", "recovering-failed-exact-match-edits");
  writeFileSync(join(workspace, "target.txt"), REPAIRED);
  const verified = verifyExactFilePossession(decision);
  expect(verified).toMatchObject({ result: "neutral", procedural_credit: false, artifact_verified: true });
  close(decision, verified);
  expect(summarizePossessionLedger()).toMatchObject({
    helpfulInterventions: 0,
    neutralInterventions: 1,
    verifiedGoodDecisions: 0,
    verifiedSuccessfulAbstentions: 0,
  });
});

test("prescription forgery is STILL impossible: the signer refuses credit with no named receipt", () => {
  // The abstain lane got its own evidence predicate. It did NOT get to be a bypass: a PRESCRIBE
  // possession still has to name a MAC-authenticated observation, and the lane is read from the
  // ledger decision row, so a caller cannot declare its prescription an "abstention" to escape.
  registerGap("prescribe-forge");
  const decision = openDecision("prescribe-forge", "prescribe", "recovering-failed-exact-match-edits");
  writeFileSync(join(workspace, "target.txt"), REPAIRED);
  const verified = verifyExactFilePossession(decision);
  const forged = { ...verified, result: "helped", verification: { ...verified.verification, procedural_credit: true } };
  expect(() => recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "o-prescribe-forge",
    possession_id: decision.possession_id,
    ts: 300,
    type: "outcome",
    ...forged,
  } as any, { ...verified.evidence_context, invocationReceiptId: "" }))
    .toThrow("procedural credit requires an observed invocation receipt id");
});

test("prescription forgery is STILL impossible: a receipt id from another possession is refused", () => {
  registerGap("prescribe-steal");
  const decision = openDecision("prescribe-steal", "prescribe", "recovering-failed-exact-match-edits");
  writeFileSync(join(workspace, "target.txt"), REPAIRED);
  const verified = verifyExactFilePossession(decision);
  // a genuine, MAC-signed observation that belongs to SOMEONE ELSE
  const stolen = observeToolEnd(
    { toolCallId: "c-other", status: "success" },
    [{ possession_id: "p-someone-else", event_id: "d-someone-else", skill: "other-skill" }],
    220,
    // observeToolStart must have run first for this to exist
  );
  observeToolStart({ toolName: "Skill", toolCallId: "c-other2", args: { skill: "other-skill" } }, 210);
  const real = observeToolEnd({ toolCallId: "c-other2", status: "success" },
    [{ possession_id: "p-someone-else", event_id: "d-someone-else", skill: "other-skill" }], 220);
  expect(stolen).toBeNull();
  expect(real).not.toBeNull();
  const forged = { ...verified, result: "helped", verification: { ...verified.verification, procedural_credit: true } };
  expect(() => recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "o-prescribe-steal",
    possession_id: decision.possession_id,
    ts: 300,
    type: "outcome",
    ...forged,
  } as any, { ...verified.evidence_context, invocationReceiptId: real!.invocation_id }))
    .toThrow("not an authenticated observation of this possession");
});

test("the honest PRESCRIBE lane still earns helped when the skill is actually observed", () => {
  // The regression that matters most: opening the abstain door must not close the prescribe one.
  registerGap("prescribe-win");
  const decision = openDecision("prescribe-win", "prescribe", "recovering-failed-exact-match-edits");
  expect(secretlyRunSkill(decision, "recovering-failed-exact-match-edits", "c-honest")).not.toBeNull();
  writeFileSync(join(workspace, "target.txt"), REPAIRED);
  const verified = verifyExactFilePossession(decision);
  expect(verified).toMatchObject({ result: "helped", procedural_credit: true });
  close(decision, verified);
  expect(summarizePossessionLedger()).toMatchObject({
    helpfulInterventions: 1,
    verifiedGoodDecisions: 1,
    verifiedSuccessfulAbstentions: 0,
  });
});

// ── 5. THE OLD SELF-REPORTED PATH IS UNCHANGED, AND STILL SEPARATE ──────────

test("an UNBOUND abstention still scores judged, never verified", () => {
  recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "d-judged-abstain",
    possession_id: "p-judged-abstain",
    ts: 200,
    type: "decision",
    agent: "a", model: "m",
    action: "abstain",
    task_class: "no-binding",
    difficulty: "standard",
    eligible: true,
    gap_observed: true,
    route: "no-safe-match",
  } as any);
  recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "o-judged-abstain",
    possession_id: "p-judged-abstain",
    ts: 300,
    type: "outcome",
    result: "succeeded_unaided",
    evidence_tier: "agent_judged",
    reason: "agent says it managed alone",
  } as any);
  const summary = summarizePossessionLedger();
  expect(summary).toMatchObject({
    judgedSuccessfulAbstentions: 1,
    judgedOnlyAbstentions: 1,
    verifiedSuccessfulAbstentions: 0,
    verifiedEvaluatedAbstentions: 0,
  });
  // judged arithmetic must still balance on the share card
  expect(buildShareCardPayload(summary, { period: "all_time" })).toMatchObject({
    judged_successful_abstentions: 1,
    judged_failed_abstentions: 0,
    judged_only_abstentions: 1,
  });
});
