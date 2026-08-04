import { beforeEach, expect, test } from "bun:test";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import {
  POSSESSION_LEDGER_PATH,
  EFFICIENCY_CONTRACT,
  buildShareCardPayload,
  inspectPossessionLedger,
  loadPossessionEvents,
  recordPossessionEvent,
  summarizePossessionLedger,
  summarizePossessions,
  validateShareCardPayload,
} from "../mods/possessions";

beforeEach(() => {
  rmSync(POSSESSION_LEDGER_PATH, { force: true });
});

test("versioned append-only ledger records decision and outcome as separate immutable events", () => {
  recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "evt-prescribe-1",
    possession_id: "possession-1",
    ts: 100,
    type: "decision",
    agent: "kev",
    model: "gpt-5.6-sol",
    action: "prescribe",
    task_class: "stale-exact-edit",
    gap_observed: true,
    route: "matched",
    skill: "recovering-failed-exact-match-edits",
  });
  recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "evt-outcome-1",
    possession_id: "possession-1",
    ts: 200,
    type: "outcome",
    result: "helped",
    evidence_tier: "human_judged",
    reason: "human observed the recovery; no instrument receipt was bound",
    evidence_ref: "receipt:edit-retry-1",
  });

  const events = loadPossessionEvents();
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ type: "decision", action: "prescribe", skill: "recovering-failed-exact-match-edits" });
  expect(events[1]).toMatchObject({ type: "outcome", result: "helped", evidence_tier: "human_judged" });
  expect(readFileSync(POSSESSION_LEDGER_PATH, "utf8").trim().split("\n")).toHaveLength(2);
});

test("ledger rejects unsafe identifiers and redacts private reason text before persistence", () => {
  expect(() => recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "evt-bad",
    possession_id: "possession-bad",
    ts: 100,
    type: "decision",
    agent: "kev",
    model: "gpt-5.6-sol",
    action: "prescribe",
    task_class: "raw task with spaces and /Users/someone/private",
    gap_observed: true,
    route: "matched",
    skill: "safe-skill",
  })).toThrow("task_class");

  recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "evt-safe-decision",
    possession_id: "possession-safe",
    ts: 200,
    type: "decision",
    agent: "kev",
    model: "gpt-5.6-sol",
    action: "abstain",
    task_class: "release-review",
    gap_observed: false,
    route: "no-gap",
  });
  recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "evt-safe-outcome",
    possession_id: "possession-safe",
    ts: 300,
    type: "outcome",
    result: "succeeded_unaided",
    evidence_tier: "human_judged",
    reason: "worked at /Users/someone/private with API_KEY=topsecretvalue",
  });

  const raw = readFileSync(POSSESSION_LEDGER_PATH, "utf8");
  expect(raw).not.toContain("/Users/someone/private");
  expect(raw).not.toContain("topsecretvalue");
  expect(raw).toContain("<path>");
  expect(raw).toContain("<redacted>");
});

test("summary headlines decision efficiency, restraint, harm, and evidence tiers instead of usage volume", () => {
  const events = [
    {
      schema: "mm.possession.v1" as const,
      event_id: "d1",
      possession_id: "p1",
      ts: 1,
      type: "decision" as const,
      agent: "kev",
      model: "gpt-5.6-sol",
      action: "prescribe" as const,
      task_class: "stale-edit",
      gap_observed: true,
      route: "matched" as const,
      skill: "recovering-stale-edits",
    },
    {
      schema: "mm.possession.v1" as const,
      event_id: "o1",
      possession_id: "p1",
      ts: 2,
      type: "outcome" as const,
      result: "helped" as const,
      evidence_tier: "human_judged" as const,
      reason: "human observed the same verifier pass",
    },
    {
      schema: "mm.possession.v1" as const,
      event_id: "d2",
      possession_id: "p2",
      ts: 3,
      type: "decision" as const,
      agent: "kev",
      model: "gpt-5.6-sol",
      action: "abstain" as const,
      task_class: "known-procedure",
      gap_observed: false,
      route: "no-gap" as const,
    },
    {
      schema: "mm.possession.v1" as const,
      event_id: "o2",
      possession_id: "p2",
      ts: 4,
      type: "outcome" as const,
      result: "succeeded_unaided" as const,
      evidence_tier: "agent_judged" as const,
      reason: "completed without injecting a skill",
    },
    {
      schema: "mm.possession.v1" as const,
      event_id: "l1",
      possession_id: "lifecycle-retire-1",
      ts: 5,
      type: "lifecycle" as const,
      action: "retire" as const,
      skill: "harmful-old-skill",
      reason: "repeated negative field evidence",
    },
  ];

  const summary = summarizePossessions(events);
  expect(summary).toMatchObject({
    metricContract: "mm.efficiency.v2",
    percentageDisplayThreshold: 10,
    decisions: 2,
    openedDecisions: 2,
    closedDecisions: 2,
    pendingDecisions: 0,
    evaluatedDecisions: 2,
    scoredDecisions: 2,
    goodDecisions: 2,
    prescribed: 1,
    abstained: 1,
    helpfulInterventions: 1,
    harmfulInterventions: 0,
    successfulAbstentions: 1,
    judgedOnlyAbstentions: 1,
    contextsAvoided: 0,
    interferenceAbstentions: 0,
    verifiedDecisions: 0,
    verifiedGoodDecisions: 0,
    judgedDecisions: 2,
    judgedGoodDecisions: 2,
    decisionEfficiencyPct: 100,
    verifiedEfficiencyPct: null,
    restraintEfficiencyPct: null,
    harmRatePct: 0,
    skillsRetired: 1,
  });
  expect(EFFICIENCY_CONTRACT.earnedMinute).toBe("same_tier_helped_prescription | same_tier_successful_abstention; useful routing decision, not literal skill invocation");
  expect((summary as any).skillReps).toBeUndefined();
  expect((summary as any).streak).toBeUndefined();
});

test("known-bad skill produces a visible negative and proves the referee can call red", () => {
  const summary = summarizePossessions([
    {
      schema: "mm.possession.v1",
      event_id: "d-red",
      possession_id: "p-red",
      ts: 1,
      type: "decision",
      agent: "test-agent",
      model: "test-model",
      action: "prescribe",
      task_class: "known-bad-fixture",
      gap_observed: true,
      route: "matched",
      skill: "known-bad-skill",
    },
    {
      schema: "mm.possession.v1",
      event_id: "o-red",
      possession_id: "p-red",
      ts: 2,
      type: "outcome",
      result: "harmed",
      evidence_tier: "agent_judged",
      reason: "fixture failed as observed; no bound verifier adapter exists",
    },
  ]);

  expect(summary).toMatchObject({
    metricContract: "mm.efficiency.v2",
    evaluatedDecisions: 1,
    goodDecisions: 0,
    harmfulInterventions: 1,
    decisionEfficiencyPct: 0,
    harmRatePct: 100,
    verifiedDecisions: 0,
    judgedDecisions: 1,
    judgedGoodDecisions: 0,
  });
});

test("share card is constructed from an aggregate allowlist and cannot leak event details", () => {
  const summary = summarizePossessions([
    {
      schema: "mm.possession.v1",
      event_id: "d-private",
      possession_id: "p-private",
      ts: 1,
      type: "decision",
      agent: "agent-secret-id",
      model: "private-provider/private-model",
      action: "abstain",
      task_class: "private-client-task",
      gap_observed: false,
      route: "no-gap",
    },
    {
      schema: "mm.possession.v1",
      event_id: "o-private",
      possession_id: "p-private",
      ts: 2,
      type: "outcome",
      result: "succeeded_unaided",
      evidence_tier: "verified",
      reason: "secret work at /Users/private/client",
      evidence_ref: "/Users/private/receipt.json",
    },
  ]);
  const card = buildShareCardPayload(summary, { period: "/Users/private/period" });

  expect(card.schema).toBe("mm.share-card.v1");
  expect(card.metric_contract).toBe("mm.efficiency.v2");
  expect(card.score_status).toBe("exploratory");
  expect((card as any).display_name).toBeUndefined();
  expect(card.period).toBe("EARLY TAPE");
  expect(card.statement).toBe("no bound-verified score · judged tape 1 of 1");
  expect(card).toMatchObject({ opened_decisions: 1, closed_decisions: 1, pending_decisions: 0, verified_evaluated_decisions: 0, judged_evaluated_decisions: 1 });
  expect((card as any).decision_efficiency_pct).toBeUndefined();
  expect((card as any).skills_retired).toBeUndefined();
  expect(() => validateShareCardPayload({ ...card, period: "LAST 30 DAYS" })).toThrow("must remain EARLY TAPE");
  expect(() => validateShareCardPayload({ ...card, percentage_display_threshold: 9 })).toThrow("must match the metric contract");
  expect(() => validateShareCardPayload({ ...card, harmful_interventions: 1 })).toThrow("intervention and abstention outcomes");
  expect(() => validateShareCardPayload({ ...card, helpful_interventions: 1 })).toThrow("intervention and abstention outcomes");
  const raw = JSON.stringify(card);
  expect(raw).not.toContain("private-client-task");
  expect(raw).not.toContain("private-provider");
  expect(raw).not.toContain("/Users");
  expect(raw).not.toContain("secret work");
});

test("ten self-asserted repeated outcomes never unlock a verified percentage", () => {
  const events: any[] = [];
  for (let i = 0; i < 10; i++) {
    events.push({
      schema: "mm.possession.v1",
      event_id: `d-mature-${i}`,
      possession_id: `p-mature-${i}`,
      ts: i * 2,
      type: "decision",
      agent: "kev",
      model: "gpt-5.6-sol",
      action: "prescribe",
      task_class: "package-gate",
      gap_observed: true,
      route: "matched",
      skill: "validating-packages",
    });
    events.push({
      schema: "mm.possession.v1",
      event_id: `o-mature-${i}`,
      possession_id: `p-mature-${i}`,
      ts: i * 2 + 1,
      type: "outcome",
      result: i < 8 ? "helped" : "neutral",
      evidence_tier: "verified",
      reason: "deterministic fixture",
    });
  }
  const card = buildShareCardPayload(summarizePossessions(events), { period: "last_30_days" });

  expect(card.score_status).toBe("exploratory");
  expect(card.period).toBe("EARLY TAPE");
  expect(card.statement).toBe("no bound-verified score · judged tape 3 of 3");
  expect(card.repeat_capped_exposures).toBe(7);
  expect((card as any).decision_efficiency_pct).toBeUndefined();
});

test("no-safe-match never masquerades as a verified overlap", () => {
  const summary = summarizePossessions([
    {
      schema: "mm.possession.v1",
      event_id: "d-overlap",
      possession_id: "p-overlap",
      ts: 1,
      type: "decision",
      agent: "kev",
      model: "gpt-5.6-sol",
      action: "abstain",
      task_class: "stale-edit",
      gap_observed: true,
      route: "no-safe-match",
    },
    {
      schema: "mm.possession.v1",
      event_id: "o-overlap",
      possession_id: "p-overlap",
      ts: 2,
      type: "outcome",
      result: "succeeded_unaided",
      evidence_tier: "verified",
      reason: "overlap withheld and task succeeded without context",
    },
  ]);

  expect(summary.interferenceAbstentions).toBe(0);
  expect(summary.contextsAvoided).toBe(0);
  expect(summary.judgedSuccessfulAbstentions).toBe(1);
  expect(summary.judgedOnlyAbstentions).toBe(1);
});

test("pending decisions stay visible but never count as successful", () => {
  const summary = summarizePossessions([
    {
      schema: "mm.possession.v1",
      event_id: "d-pending",
      possession_id: "p-pending",
      ts: 1,
      type: "decision",
      agent: "kev",
      model: "gpt-5.6-sol",
      action: "prescribe",
      task_class: "pending-task",
      gap_observed: true,
      route: "matched",
      skill: "pending-skill",
    },
  ]);

  expect(summary).toMatchObject({ decisions: 1, pendingDecisions: 1, evaluatedDecisions: 0 });
  expect(summary.decisionEfficiencyPct).toBeNull();
  expect(existsSync(POSSESSION_LEDGER_PATH)).toBe(false);
});

test("runtime enums, duplicate decisions, duplicate outcomes, and self-awarded verified evidence fail closed", () => {
  const decision = {
    schema: "mm.possession.v1" as const,
    event_id: "d-runtime-1",
    possession_id: "p-runtime-1",
    ts: 1,
    type: "decision" as const,
    agent: "kev",
    model: "gpt-5.6-sol",
    action: "prescribe" as const,
    task_class: "runtime-integrity",
    difficulty: "standard" as const,
    gap_observed: true,
    route: "matched" as const,
    skill: "repairing-failing-verification-gates",
  };
  recordPossessionEvent(decision);

  expect(() => recordPossessionEvent({ ...decision, event_id: "d-runtime-2" })).toThrow("decision already exists");
  expect(() => recordPossessionEvent({ ...decision, event_id: "d-runtime-bad", possession_id: "p-runtime-bad", action: "bogus" } as any)).toThrow("action");
  expect(() => recordPossessionEvent({ ...decision, event_id: "d-route-bad", possession_id: "p-route-bad", route: "bogus" } as any)).toThrow("route");
  expect(() => recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "o-self-verified",
    possession_id: "p-runtime-1",
    ts: 2,
    type: "outcome",
    result: "helped",
    evidence_tier: "verified",
    reason: "caller says it passed",
  } as any)).toThrow("instrument-derived verification");

  recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "o-runtime-1",
    possession_id: "p-runtime-1",
    ts: 3,
    type: "outcome",
    result: "helped",
    evidence_tier: "agent_judged",
    reason: "observed locally but not receipt-bound",
  });
  expect(() => recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "o-runtime-2",
    possession_id: "p-runtime-1",
    ts: 4,
    type: "outcome",
    result: "harmed",
    evidence_tier: "agent_judged",
    reason: "second active outcome",
  })).toThrow("active outcome already exists");
});

test("explicit supersession must bind the active outcome and deterministically replaces it", () => {
  recordPossessionEvent({
    schema: "mm.possession.v1", event_id: "d-super", possession_id: "p-super", ts: 1, type: "decision",
    agent: "kev", model: "sol", action: "prescribe", task_class: "supersession-check", difficulty: "standard",
    gap_observed: true, route: "matched", skill: "test-skill",
  });
  recordPossessionEvent({
    schema: "mm.possession.v1", event_id: "o-super-1", possession_id: "p-super", ts: 2, type: "outcome",
    result: "helped", evidence_tier: "agent_judged", reason: "initial observation",
  });
  recordPossessionEvent({
    schema: "mm.possession.v1", event_id: "o-super-2", possession_id: "p-super", ts: 3, type: "outcome",
    result: "harmed", evidence_tier: "human_judged", reason: "human corrected the earlier outcome", supersedes_event_id: "o-super-1",
  });

  const inspection = inspectPossessionLedger();
  expect(inspection.integrity.blocked).toBe(false);
  const summary = summarizePossessionLedger();
  expect(summary).toMatchObject({ evaluatedDecisions: 1, helpfulInterventions: 0, harmfulInterventions: 1, decisionEfficiencyPct: 0 });
});

test("read-time custody rejects replayed event IDs across different possessions", () => {
  const first = { schema: "mm.possession.v1", event_id: "replayed-event", possession_id: "p-replay-1", ts: 1, type: "decision", agent: "kev", model: "sol", action: "prescribe", task_class: "replay-check", difficulty: "standard", gap_observed: true, route: "matched", skill: "test-skill" };
  const replay = { ...first, possession_id: "p-replay-2", task_class: "replay-check-two", ts: 2 };
  appendFileSync(POSSESSION_LEDGER_PATH, `${JSON.stringify(first)}\n${JSON.stringify(replay)}\n`, "utf8");

  const inspection = inspectPossessionLedger();
  expect(inspection.integrity).toMatchObject({ blocked: true, rowCount: 2, validRows: 1 });
  expect(inspection.integrity.exclusionReasons.duplicate_event_id).toBe(1);
  expect(inspection.integrity.excludedDecisionPossessionIds).toEqual(["p-replay-2"]);
  const summary = summarizePossessionLedger();
  expect(summary).toMatchObject({ openedDecisions: 2, closedDecisions: 1, pendingDecisions: 1, excludedDecisions: 1, scoreStatus: "blocked" });
});

test("orphan outcomes block integrity without fabricating an opened or closed decision", () => {
  appendFileSync(POSSESSION_LEDGER_PATH, `${JSON.stringify({ schema: "mm.possession.v1", event_id: "o-orphan", possession_id: "p-orphan", ts: 1, type: "outcome", result: "helped", evidence_tier: "agent_judged", reason: "orphan row" })}\n`, "utf8");

  const inspection = inspectPossessionLedger();
  expect(inspection.integrity).toMatchObject({ blocked: true, orphanOutcomes: 1, excludedDecisionPossessionIds: [] });
  const summary = summarizePossessionLedger();
  expect(summary).toMatchObject({ openedDecisions: 0, closedDecisions: 0, pendingDecisions: 0, excludedDecisions: 0, scoreStatus: "blocked" });
  const card = buildShareCardPayload(summary, { period: "all_time" });
  expect(card).toMatchObject({ score_status: "blocked", ledger_integrity: "blocked", opened_decisions: 0, closed_decisions: 0, pending_decisions: 0 });
  expect(() => validateShareCardPayload({ ...card, ledger_integrity: "ok" })).toThrow("exactly match");
  expect(() => validateShareCardPayload({ ...card, opened_decisions: 1 })).toThrow("custody arithmetic");
});

test("share status is recomputed and claim-bearing verified fields stay impossible without an adapter", () => {
  const card = buildShareCardPayload(summarizePossessions([]), { period: "all_time" });
  expect(() => validateShareCardPayload({ ...card, score_status: "blocked" })).toThrow("exactly match");
  expect(() => validateShareCardPayload({ ...card, score_status: "claim_eligible", verified_evaluated_decisions: 10, verified_good_decisions: 10, scored_exposures: 10, opened_decisions: 10, closed_decisions: 10, eligible_exposures: 10, unique_task_classes: 3, difficulty_strata: { routine: 4, standard: 3, hard: 3, unknown: 0 }, closure_rate_pct: 100, period: "EARLY TAPE", statement: "10 of 10 bound-verified good decisions · 100%", decision_efficiency_pct: 100 })).toThrow("constructed from the bound ledger summary");
});

test("malformed and unknown ledger rows block scoring instead of disappearing", () => {
  appendFileSync(POSSESSION_LEDGER_PATH, "{not-json}\n", "utf8");
  appendFileSync(POSSESSION_LEDGER_PATH, `${JSON.stringify({ schema: "mm.possession.v1", event_id: "bad-enum", possession_id: "p-bad", ts: 1, type: "decision", agent: "kev", model: "sol", action: "bogus", task_class: "bad-enum", gap_observed: true, route: "bogus" })}\n`, "utf8");

  const inspection = inspectPossessionLedger();
  expect(inspection.integrity).toMatchObject({ blocked: true, malformedRows: 1, unknownEnumRows: 1, rowCount: 2, validRows: 0 });
  const summary = summarizePossessionLedger();
  expect(summary.scoreStatus).toBe("blocked");
  expect(summary.excludedDecisions).toBe(1);
  expect(summary.exclusionReasons.unknown_enum).toBe(1);
});

test("selective closure is visible and blocks a trophy headline", () => {
  const events: any[] = [];
  for (let i = 0; i < 100; i++) {
    events.push({ schema: "mm.possession.v1", event_id: `d-closure-${i}`, possession_id: `p-closure-${i}`, ts: i, type: "decision", agent: "kev", model: "sol", action: "prescribe", task_class: `class-${i % 5}`, difficulty: "standard", gap_observed: true, route: "matched", skill: "test-skill" });
    if (i < 10) events.push({ schema: "mm.possession.v1", event_id: `o-closure-${i}`, possession_id: `p-closure-${i}`, ts: 100 + i, type: "outcome", result: "helped", evidence_tier: "agent_judged", reason: "closed judged outcome" });
  }
  const summary = summarizePossessions(events);
  expect(summary).toMatchObject({ openedDecisions: 100, closedDecisions: 10, pendingDecisions: 90, closureRatePct: 10, scoreStatus: "incomplete" });
  const card = buildShareCardPayload(summary, { period: "all_time" });
  expect(card).toMatchObject({ opened_decisions: 100, closed_decisions: 10, pending_decisions: 90, closure_rate_pct: 10, score_status: "incomplete" });
  expect((card as any).decision_efficiency_pct).toBeUndefined();
});

test("repeat caps and difficulty strata prevent one easy task class from farming maturity", () => {
  const events: any[] = [];
  for (let i = 0; i < 10; i++) {
    events.push({ schema: "mm.possession.v1", event_id: `d-farm-${i}`, possession_id: `p-farm-${i}`, ts: i * 2, type: "decision", agent: "kev", model: "sol", action: "prescribe", task_class: "same-easy-task", difficulty: "routine", gap_observed: true, route: "matched", skill: "test-skill" });
    events.push({ schema: "mm.possession.v1", event_id: `o-farm-${i}`, possession_id: `p-farm-${i}`, ts: i * 2 + 1, type: "outcome", result: "helped", evidence_tier: "agent_judged", reason: "same easy fixture" });
  }
  const summary = summarizePossessions(events);
  expect(summary).toMatchObject({ eligibleExposures: 10, scoredDecisions: 3, repeatCappedDecisions: 7, uniqueTaskClasses: 1, scoreStatus: "exploratory" });
  expect(summary.difficultyStrata).toEqual({ routine: 10, standard: 0, hard: 0, unknown: 0 });
});

test("share payload has no free-form identity and runtime validation rejects field smuggling", () => {
  const summary = summarizePossessions([]);
  const card = buildShareCardPayload(summary, { period: "all_time" });
  expect((card as any).display_name).toBeUndefined();
  expect(() => validateShareCardPayload({ ...card, display_name: "Secret Client Task" })).toThrow("unexpected field");
  expect(() => validateShareCardPayload({ ...card, period: "Prompt Injection" })).toThrow("period");
  expect(() => validateShareCardPayload({ ...card, statement: "ACME Project X" })).toThrow("statement");
  expect(() => validateShareCardPayload({ ...card, extra: "/Users/private/client" })).toThrow("unexpected field");
  expect(() => validateShareCardPayload({ ...card, opened_decisions: 99 })).toThrow("custody arithmetic");
  expect(() => validateShareCardPayload({ ...card, decision_efficiency_pct: 100 })).toThrow("constructed from the bound ledger summary");
});

test("judged abstentions never become verified restraint or interference credit", () => {
  const events: any[] = [
    { schema: "mm.possession.v1", event_id: "d-judged-abstain", possession_id: "p-judged-abstain", ts: 1, type: "decision", agent: "kev", model: "sol", action: "abstain", task_class: "ambiguous-edit", difficulty: "standard", gap_observed: true, route: "ambiguous" },
    { schema: "mm.possession.v1", event_id: "o-judged-abstain", possession_id: "p-judged-abstain", ts: 2, type: "outcome", result: "succeeded_unaided", evidence_tier: "human_judged", reason: "human observed success" },
    { schema: "mm.possession.v1", event_id: "d-failed-abstain", possession_id: "p-failed-abstain", ts: 3, type: "decision", agent: "kev", model: "sol", action: "abstain", task_class: "missing-skill", difficulty: "hard", gap_observed: true, route: "no-safe-match" },
    { schema: "mm.possession.v1", event_id: "o-failed-abstain", possession_id: "p-failed-abstain", ts: 4, type: "outcome", result: "failed_unaided", evidence_tier: "agent_judged", reason: "task failed after context was withheld" },
  ];
  const summary = summarizePossessions(events);
  expect(summary).toMatchObject({ verifiedSuccessfulAbstentions: 0, verifiedEvaluatedAbstentions: 0, judgedSuccessfulAbstentions: 1, failedAbstentions: 1, judgedOnlyAbstentions: 2, judgedGoodDecisions: 1, goodDecisions: 1, decisionEfficiencyPct: 50, interferenceAbstentions: 0 });
  expect(summary.restraintEfficiencyPct).toBeNull();
});
