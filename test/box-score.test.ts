import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { summarizePossessions, type LedgerIntegrity, type PossessionEvent } from "../mods/possessions";
import { renderAgentBoxScore } from "../mods/ui";

const decision = (id: string, action: "prescribe" | "abstain", taskClass: string, extra: Record<string, any> = {}): any => ({
  schema: "mm.possession.v1",
  event_id: `d-${id}`,
  possession_id: `p-${id}`,
  ts: Number(id.replace(/\D/g, "")) || 1,
  type: "decision",
  agent: "kev",
  model: "gpt-5.6-sol",
  action,
  task_class: taskClass,
  difficulty: "standard",
  gap_observed: true,
  route: action === "prescribe" ? "matched" : "no-safe-match",
  ...(action === "prescribe" ? { skill: "test-skill" } : {}),
  ...extra,
});

const outcome = (id: string, result: "helped" | "harmed" | "neutral" | "succeeded_unaided" | "failed_unaided", tier: "human_judged" | "agent_judged" | "verified" = "agent_judged"): any => ({
  schema: "mm.possession.v1",
  event_id: `o-${id}`,
  possession_id: `p-${id}`,
  ts: (Number(id.replace(/\D/g, "")) || 1) + 100,
  type: "outcome",
  result,
  evidence_tier: tier,
  reason: "observed test outcome",
});

const emptyExclusions = () => ({ malformed_json: 0, invalid_schema: 0, unknown_enum: 0, duplicate_event_id: 0, duplicate_decision: 0, orphan_outcome: 0, duplicate_outcome: 0, invalid_supersession: 0, incompatible_outcome: 0 });

test("Decision Report splits interventions from abstentions without a composite perfect-record headline", () => {
  const summary = summarizePossessions([
    decision("1", "prescribe", "package-gate"),
    outcome("1", "helped", "human_judged"),
    decision("2", "abstain", "stale-edit"),
    outcome("2", "succeeded_unaided", "agent_judged"),
  ] as PossessionEvent[]);
  const output = renderAgentBoxScore(summary, { agent: "Kev", period: "All time", skills: { active: 10, proven: 0 } });

  expect(output).toContain("MUSCLE MEMORY · DECISION REPORT · EARLY EVIDENCE");
  expect(output).toContain("INTERVENTIONS · 1 served · 1 helped · 0 harmed");
  expect(output).toContain("ABSTENTIONS · 1 · 1 succeeded unaided · 0 failed");
  expect(output).toContain("SKILLS · 10 active · 0 proven");
  expect(output).toContain("LAST · abstained · no safe match · succeeded unaided");
  expect(output).toContain("PENDING · 0");
  expect(output).toContain("STATUS · early judged evidence · 0 verified · not claim-bearing");
  expect(output).not.toMatch(/\b2 OF 2\b|100%|PLAY CALLS|SMART RESTRAINT|🏀|🛡️/);
});

test("closing an older recovered possession becomes LAST activity", () => {
  const lateRecoveredOutcome = { ...outcome("1", "helped", "agent_judged"), ts: 1_000 };
  const summary = summarizePossessions([
    decision("1", "prescribe", "recovered-validation"),
    decision("20", "abstain", "newer-routine"),
    outcome("20", "succeeded_unaided", "agent_judged"),
    lateRecoveredOutcome,
  ] as PossessionEvent[]);
  const output = renderAgentBoxScore(summary, { agent: "Kev", period: "All time" });

  expect(output).toContain("LAST · intervened · clear match · helped");
  expect(output).not.toContain("LAST · abstained · no safe match · succeeded unaided");
});

test("known-bad judged fixture reports harm plainly without mascot or fake success framing", () => {
  const summary = summarizePossessions([
    decision("3", "prescribe", "known-bad-fixture", { difficulty: "hard" }),
    outcome("3", "harmed", "agent_judged"),
  ] as PossessionEvent[]);
  const output = renderAgentBoxScore(summary, { agent: "Calibration Agent", period: "Calibration" });

  expect(output).toContain("INTERVENTIONS · 1 served · 0 helped · 1 harmed");
  expect(output).toContain("STATUS · early judged evidence · 0 verified · not claim-bearing");
  expect(output).not.toMatch(/GOOD DECISIONS|🟥|HARM CHECK/);
});

test("ten closures plus ninety pending decisions renders incomplete evidence without a small-n percentage", () => {
  const events: PossessionEvent[] = [];
  for (let i = 0; i < 100; i++) {
    events.push(decision(`closure-${i}`, "prescribe", `class-${i % 5}`));
    if (i < 10) events.push(outcome(`closure-${i}`, "helped", "agent_judged"));
  }
  const output = renderAgentBoxScore(summarizePossessions(events), { agent: "Kev", period: "All time" });

  expect(output).toContain("DECISION REPORT · INCOMPLETE EVIDENCE");
  expect(output).toContain("INTERVENTIONS · 10 served · 10 helped · 0 harmed");
  expect(output).toContain("PENDING · 90 · class-4 → test-skill");
  expect(output).toContain("STATUS · incomplete evidence · 0 verified · scoring withheld");
  expect(output).not.toContain("10%");
});

test("repeat-capped work stays visible without pretending one task class is broad evidence", () => {
  const events: PossessionEvent[] = [];
  for (let i = 0; i < 10; i++) {
    events.push(decision(`farm-${i}`, "prescribe", "same-easy-task", { difficulty: "routine" }));
    events.push(outcome(`farm-${i}`, "helped", "agent_judged"));
  }
  const output = renderAgentBoxScore(summarizePossessions(events), { agent: "Kev", period: "All time" });

  expect(output).toContain("INTERVENTIONS · 10 served · 10 helped · 0 harmed");
  expect(output).toContain("STATUS · early judged evidence · 0 verified · 7 repeat-capped · not claim-bearing");
  expect(output).not.toMatch(/task class|EXPOSURE|CLAIM ELIGIBLE/);
});

test("ledger integrity failure blocks scoring visibly without sports emoji", () => {
  const integrity: LedgerIntegrity = {
    blocked: true,
    ledgerSha256: createHash("sha256").update("bad-row").digest("hex"),
    rowCount: 1,
    validRows: 0,
    malformedRows: 1,
    unknownEnumRows: 0,
    excludedRows: 1,
    excludedPossessionIds: ["p-bad"],
    excludedDecisionPossessionIds: [],
    orphanOutcomes: 0,
    exclusionReasons: { ...emptyExclusions(), malformed_json: 1 },
  };
  const output = renderAgentBoxScore(summarizePossessions([], integrity), { agent: "Kev", period: "All time" });

  expect(output).toContain("DECISION REPORT · LEDGER BLOCKED");
  expect(output).toContain("STATUS · ledger integrity blocked · 1 invalid row · scoring withheld");
  expect(output).not.toMatch(/🟥|🏀/);
});

test("cold start gives one plain next move without an inflated score", () => {
  const output = renderAgentBoxScore(summarizePossessions([]), { agent: "New Agent", period: "All time" });

  expect(output).toContain("INTERVENTIONS · 0 served · 0 helped · 0 harmed");
  expect(output).toContain("ABSTENTIONS · 0 · 0 succeeded unaided · 0 failed");
  expect(output).toContain("SKILLS · 0 active · 0 proven");
  expect(output).toContain("PENDING · 0");
  expect(output).toContain("START · declare a real procedural gap before a meaningful task");
  expect(output).toContain("STATUS · no evaluated evidence · 0 verified · not claim-bearing");
  expect(output).not.toMatch(/100%|GOOD DECISIONS|YOUR FIRST READ/);
});
