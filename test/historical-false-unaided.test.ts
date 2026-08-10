// HISTORICAL REPLAY — false unaided claims in already-published data.
//
// In the 96 counted possessions of the two fired studies (live-rc5-fire3, live-rc6) there are
// exactly SIX possessions where the product recorded decision action='abstain'
// (route='no-safe-match') AND the instrument recorded skill_invocation_count === 1 inside the
// SAME possession. Five of the six were then closed `succeeded_unaided` at
// evidence_tier='agent_judged'. That is a FALSE UNAIDED CLAIM: it says the agent got there
// without help while a Skill demonstrably ran inside the possession.
//
// These rows never claimed VERIFIED status, so nothing was BREACHED. The question this file
// answers is DETECTABILITY: does the new read-path predicate
// (authenticateStoredEvidence / claimBearingVerdict, ProceduralDenialReason
// 'invocation_during_abstention') retro-detect them?
//
// Each of the six is replayed TWICE:
//   (A) AS PUBLISHED — judged tier, unbound. This is what the shipped product actually holds.
//   (B) COUNTERFACTUAL — the identical possession carried on the verified tier.
// The pair isolates the tier as the only difference, so the answer cannot be confounded.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { initInstrumentKey } from "../mods/instrument";
import { STATE_DIR } from "../mods/core";
import {
  POSSESSION_LEDGER_PATH,
  __resetInstrumentKeyCache,
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
  const keyHome = mkdtempSync(join(tmpdir(), "mm-hist-key-"));
  process.env.MM_INSTRUMENT_KEY_FILE = join(keyHome, "k.key");
  initInstrumentKey({ keyPath: process.env.MM_INSTRUMENT_KEY_FILE, stateDir: STATE_DIR });
  __resetInstrumentKeyCache();
  rmSync(POSSESSION_LEDGER_PATH, { force: true });
  rmSync(INVOCATION_LOG_PATH, { force: true });
  rmSync(VERIFICATION_TASK_DIR, { recursive: true, force: true });
  workspace = mkdtempSync(join(tmpdir(), "mm-hist-"));
  process.env.MM_EXACT_FILE_ROOT = workspace;
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(VERIFICATION_TASK_DIR, { recursive: true, force: true });
  delete process.env.MM_EXACT_FILE_ROOT;
});

/** The six, transcribed from JOURNAL.jsonl CLAIM records (claim=='Activate', mm_state.P4). */
const HISTORICAL = [
  {
    "study": "live-rc5-fire3",
    "row": "M1-T2",
    "phase": "P4",
    "possessionId": "p-msj0lqqv-1-ec1b7333d4762cb0",
    "decisionEventId": "d-p-msj0lqqv-1-ec1b7333d4762cb0",
    "outcomeEventId": null,
    "evidenceTier": null,
    "result": null,
    "reason": null,
    "skill": "folding-sable-orbit-rows",
    "taskClass": "live-rc5-fire3-m1-t2-p4"
  },
  {
    "study": "live-rc5-fire3",
    "row": "M1-T3",
    "phase": "P4",
    "possessionId": "p-msj0o0rs-1-b0bb00643077ba0d",
    "decisionEventId": "d-p-msj0o0rs-1-b0bb00643077ba0d",
    "outcomeEventId": "o-p-msj0o0rs-1-b0bb00643077ba0d-msj0otfe-4fc8e58c",
    "evidenceTier": "agent_judged",
    "result": "succeeded_unaided",
    "reason": "Created submission/calc.py with only the return expression changed to (n + 5) * 2; the assay passed all cases and the file ends with one newline.",
    "skill": "repairing-ember-abacus-runners",
    "taskClass": "live-rc5-fire3-m1-t3-p4"
  },
  {
    "study": "live-rc5-fire3",
    "row": "M1-T4",
    "phase": "P4",
    "possessionId": "p-msj0qljl-1-728c9fbeb63ec370",
    "decisionEventId": "d-p-msj0qljl-1-728c9fbeb63ec370",
    "outcomeEventId": "o-p-msj0qljl-1-728c9fbeb63ec370-msj0r23u-060d6829",
    "evidenceTier": "agent_judged",
    "result": "succeeded_unaided",
    "reason": "Created submission/resolved.lock with the greatest compatible versions and verified its exact required bytes.",
    "skill": "reconciling-lilac-basin-locks",
    "taskClass": "live-rc5-fire3-m1-t4-p4"
  },
  {
    "study": "live-rc5-fire3",
    "row": "M2-T1",
    "phase": "P4",
    "possessionId": "p-msj0sxdq-1-802cd5c37ef6d82a",
    "decisionEventId": "d-p-msj0sxdq-1-802cd5c37ef6d82a",
    "outcomeEventId": "o-p-msj0sxdq-1-802cd5c37ef6d82a-msj0tfdj-6561986a",
    "evidenceTier": "agent_judged",
    "result": "succeeded_unaided",
    "reason": "Skill prescription abstained (no match cleared gate), so task was completed unaided by directly reading directive.tsv and panel.txt, replacing only the [shale:beacon] payload with 'fern', and verifying via diff that exactly one line changed.",
    "skill": "aligning-cairn-beacon-anchors",
    "taskClass": "live-rc5-fire3-m2-t1-p4"
  },
  {
    "study": "live-rc5-fire3",
    "row": "M3-T4",
    "phase": "P4",
    "possessionId": "p-msj19bjn-1-311111a325f2ab4c",
    "decisionEventId": "d-p-msj19bjn-1-311111a325f2ab4c",
    "outcomeEventId": "o-p-msj19bjn-1-311111a325f2ab4c-msj19xxt-99942bcb",
    "evidenceTier": "agent_judged",
    "result": "succeeded_unaided",
    "reason": "Prescribe abstained but task completed: resolved.lock has lock-v1, clay=5.0, dew=2.2 as greatest in-bounds versions.",
    "skill": "reconciling-lilac-basin-locks",
    "taskClass": "live-rc5-fire3-m3-t4-p4"
  },
  {
    "study": "live-rc6",
    "row": "M1-T4",
    "phase": "P4",
    "possessionId": "p-msj65drj-1-99e44b9241cb2053",
    "decisionEventId": "d-p-msj65drj-1-99e44b9241cb2053",
    "outcomeEventId": "o-p-msj65drj-1-99e44b9241cb2053-msj65tj4-9ca84909",
    "evidenceTier": "agent_judged",
    "result": "succeeded_unaided",
    "reason": "Created submission/resolved.lock with the greatest in-range catalog versions and confirmed its exact required bytes.",
    "skill": "reconciling-lilac-basin-locks",
    "taskClass": "live-rc6-m1-t4-p4"
  }
] as const;

/** Replay the possession's ONE observed Skill call through the runtime's own observer, so the
 *  invocation log row is MAC'd exactly as the real one was. Hand-faking it would prove nothing. */
function replayObservedInvocation(possessionId: string, decisionEventId: string, skill: string, at: number) {
  const callId = `c-${possessionId}`;
  observeToolStart({ toolName: "Skill", toolCallId: callId, args: { skill } }, at);
  return observeToolEnd({ toolCallId: callId, status: "success" },
    [{ possession_id: possessionId, event_id: decisionEventId, skill }], at + 10);
}

// ── A. AS PUBLISHED: judged tier, exactly the bytes the studies wrote ────────

for (const row of HISTORICAL) {
  test(`AS PUBLISHED ${row.study}/${row.row}/${row.phase}: abstain + 1 observed invocation, judged tier`, () => {
    const decision = recordPossessionEvent({
      schema: "mm.possession.v1",
      event_id: row.decisionEventId,
      possession_id: row.possessionId,
      ts: 200,
      type: "decision",
      agent: row.row,
      model: "chatgpt-plus-pro/gpt-5.6-luna",
      action: "abstain",
      task_class: row.taskClass,
      difficulty: "standard",
      eligible: true,
      gap_observed: true,
      route: "no-safe-match",
    } as any) as any;

    // the instrument DID see a skill run inside this possession
    expect(replayObservedInvocation(row.possessionId, row.decisionEventId, row.skill, 210)).not.toBeNull();

    if (!row.outcomeEventId) {
      // M1-T2 was never closed: no outcome row, so nothing is claimed and nothing is scored.
      const summary = summarizePossessionLedger();
      expect(summary.successfulAbstentions).toBe(0);
      expect(summary.unaidedClaimsDemoted).toBe(0);
      expect(loadPossessionEvents().filter((e) => e.type === "outcome")).toHaveLength(0);
      return;
    }

    const outcome = recordPossessionEvent({
      schema: "mm.possession.v1",
      event_id: row.outcomeEventId,
      possession_id: row.possessionId,
      ts: 300,
      type: "outcome",
      result: row.result,
      evidence_tier: row.evidenceTier,
      reason: row.reason,
    } as any) as any;

    // THE READ PATH. `claimBearingVerdict` returns on line one for any non-verified row, so the
    // abstain mirror predicate is never even consulted: no proceduralReason is produced.
    const verdict = claimBearingVerdict(decision, outcome);
    expect(verdict.verified).toBe(false);
    expect(verdict.proceduralCredit).toBe(false);
    expect(verdict.proceduralReason).toBeUndefined();
    expect(verdict.proceduralReason).not.toBe("invocation_during_abstention");

    // AND THE SCOREBOARD STILL BELIEVES THE CLAIM. `abstentionCreditable = !boundVerified ||
    // proceduralCredit` is TRUE for every judged row, so the false unaided claim is counted
    // good and `unaidedClaimsDemoted` stays 0. These six remain undetected by the shipped code.
    const summary = summarizePossessionLedger();
    expect(summary.successfulAbstentions).toBe(1);
    expect(summary.judgedSuccessfulAbstentions).toBe(1);
    expect(summary.unaidedClaimsDemoted).toBe(0);
    expect(summary.judgedGoodDecisions).toBe(1);
    expect(summary.verifiedEvaluatedAbstentions).toBe(0);
  });
}

// ── B. COUNTERFACTUAL: the identical possession on the VERIFIED tier ─────────

for (const row of HISTORICAL.filter((r) => !!r.outcomeEventId)) {
  test(`COUNTERFACTUAL ${row.study}/${row.row}/${row.phase}: same shape at verified tier IS demoted`, () => {
    const taskId = `${row.study}-${row.row}`.toLowerCase();
    writeFileSync(join(workspace, "target.txt"), BROKEN);
    createExactFileVerificationTask({
      taskId,
      taskClass: row.taskClass,
      targetRel: "target.txt",
      expectedSha256: sha(REPAIRED),
      registeredAt: 100,
    });
    const decision = recordPossessionEvent({
      schema: "mm.possession.v1",
      event_id: row.decisionEventId,
      possession_id: row.possessionId,
      ts: 200,
      type: "decision",
      agent: row.row,
      model: "chatgpt-plus-pro/gpt-5.6-luna",
      action: "abstain",
      task_class: row.taskClass,
      difficulty: "standard",
      eligible: true,
      gap_observed: true,
      route: "no-safe-match",
      verification: bindExactFileVerificationTask(taskId),
    } as any) as any;

    // The task is completed and the instrument signs an unaided success while its log is silent.
    writeFileSync(join(workspace, "target.txt"), REPAIRED);
    const verified = verifyExactFilePossession(decision);
    expect(verified.result).toBe("succeeded_unaided");
    const outcome = recordInstrumentVerifiedOutcome({
      schema: "mm.possession.v1",
      event_id: row.outcomeEventId,
      possession_id: row.possessionId,
      ts: 300,
      type: "outcome",
      ...verified,
    } as any, verified.evidence_context) as any;
    expect(summarizePossessionLedger().verifiedSuccessfulAbstentions).toBe(1);

    // Now the possession's REAL observed Skill call lands, as it did in the studies.
    expect(replayObservedInvocation(row.possessionId, row.decisionEventId, row.skill, 310)).not.toBeNull();

    const verdict = claimBearingVerdict(decision, outcome);
    expect(verdict.verified).toBe(true);                              // provenance intact
    expect(verdict.proceduralCredit).toBe(false);                     // the CLAIM is not
    expect(verdict.proceduralReason).toBe("invocation_during_abstention");
    const summary = summarizePossessionLedger();
    expect(summary.unaidedClaimsDemoted).toBe(1);
    expect(summary.verifiedSuccessfulAbstentions).toBe(0);
    expect(summary.successfulAbstentions).toBe(0);
    expect(summary.failedAbstentions).toBe(1);
  });
}

// ── C. THE FINDING, STATED AS ONE ASSERTION ─────────────────────────────────

test("FINDING: the demotion path does not reach the judged tier — all six stay undetected", () => {
  let demoted = 0;
  for (const row of HISTORICAL) {
    if (!row.outcomeEventId) continue;
    rmSync(POSSESSION_LEDGER_PATH, { force: true });
    rmSync(INVOCATION_LOG_PATH, { force: true });
    const decision = recordPossessionEvent({
      schema: "mm.possession.v1",
      event_id: row.decisionEventId,
      possession_id: row.possessionId,
      ts: 200,
      type: "decision",
      agent: row.row,
      model: "m",
      action: "abstain",
      task_class: row.taskClass,
      difficulty: "standard",
      eligible: true,
      gap_observed: true,
      route: "no-safe-match",
    } as any) as any;
    replayObservedInvocation(row.possessionId, row.decisionEventId, row.skill, 210);
    recordPossessionEvent({
      schema: "mm.possession.v1",
      event_id: row.outcomeEventId,
      possession_id: row.possessionId,
      ts: 300,
      type: "outcome",
      result: row.result,
      evidence_tier: row.evidenceTier,
      reason: row.reason,
    } as any);
    demoted += summarizePossessionLedger().unaidedClaimsDemoted;
  }
  // Five false unaided claims in published data. Zero of them are caught at judged tier.
  expect(demoted).toBe(0);
});
