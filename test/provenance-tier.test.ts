// muscle-memory · P1b PROVENANCE REPAIR — the evidence tier must never claim what it cannot prove.
//
// THE BUG THIS REPLACES (shipped and caught the same afternoon, 2026-08-10). The first FIELD TAPE
// derived evidence= from field.lastStepId. That is the tier of the MOST RECENT WRITE ONLY. Measured
// on the live ledger: recovering-edit-run-loops was {plus:2, lastStepId:"call_TmQ..."} at 16:09 and
// {plus:4, lastStepId:null} minutes later — a manual rating had overwritten the autorate stamp and
// silently relabelled the WHOLE record agent-judged. The reverse is the dangerous direction: an
// autorate write landing last would label a mostly-self-assessed record "tool-observed", which is
// laundering self-assessment as measurement — exactly what the tier exists to prevent.
//
// MIGRATION BOUNDARY (Kev's requirement). Counts written before the per-sign counters existed have
// NO recoverable provenance. They are LEGACY. Absence of a counter is OUTSIDE_COVERAGE, not a zero,
// and must never be promoted to observed.
import { test, expect } from "bun:test";
import { applyNudge } from "../mods/nudge";

const tape = (o: any) => applyNudge("s", o).split("\n").find(l => l.includes("FIELD TAPE")) ?? "";

test("LEGACY · counters absent -> evidence=legacy, never promoted to observed", () => {
  // This is every line in the live ledger written before P1b. It must not claim a tier.
  expect(tape({ plus: 4, minus: 0 })).toContain("evidence=legacy");
  expect(tape({ plus: 4, minus: 0 })).not.toContain("tool-observed");
});

test("LEGACY · the OLD bug: a trailing lastStepId must no longer promote a whole record", () => {
  // Under the shipped bug this rendered "tool-observed" off one final autorate write.
  expect(tape({ plus: 6, minus: 0, lastStepId: "call_abc" })).toContain("evidence=legacy");
  expect(tape({ plus: 6, minus: 0, lastStepId: "call_abc" })).not.toContain("evidence=tool-observed");
});

test("PARTIAL COVERAGE · counters that do not account for the total stay legacy-marked", () => {
  // 6 total, only 2 accounted: 4 came from before the boundary. Report both masses, promote neither.
  // Label form updated per Kev: the earlier "legacy+2 observed" showed only the flattering half.
  const t = tape({ plus: 6, minus: 0, plusObserved: 2, plusJudged: 0 });
  expect(t).toContain("n=6");
  expect(t).toContain("legacy");
  expect(t).toContain("2 observed");
  expect(t).toContain("0 judged");
  expect(t).toContain("4 unaccounted");
});

test("TOOL-OBSERVED · only when every counted rating is bound to a tool outcome", () => {
  expect(tape({ plus: 2, minus: 1, plusObserved: 2, minusObserved: 1 }))
    .toContain("evidence=tool-observed");
});

test("AGENT-JUDGED · only when every counted rating is a manual assertion", () => {
  expect(tape({ plus: 2, minus: 1, plusJudged: 2, minusJudged: 1 }))
    .toContain("evidence=agent-judged");
});

test("MIXED · both kinds present -> report the OBSERVED SHARE, never round to either pole", () => {
  // The whole point: a reader must be able to weigh it. "3/4 observed" is honest; "tool-observed"
  // would overclaim and "agent-judged" would undersell.
  expect(tape({ plus: 3, minus: 1, plusObserved: 3, minusJudged: 1 }))
    .toContain("mixed 3/4 observed");
});

test("n=0 · still no tape at all — absence of data is not a legacy record", () => {
  expect(applyNudge("s", { plus: 0, minus: 0 })).not.toContain("FIELD TAPE");
  expect(applyNudge("s", null)).not.toContain("FIELD TAPE");
});

test("the 5/0.5 caution gate is untouched by the provenance change", () => {
  const out = applyNudge("s", { plus: 2, minus: 3, minusObserved: 3, plusObserved: 2 });
  expect(out).toContain("FIELD RECORD");
  expect(out).toContain("evidence=tool-observed");
});

test("FORGED PROVENANCE · a caller-supplied step_id must NOT buy instrument evidence", () => {
  // Kev's sandbox proof, 2026-08-10: rateSkill(..., source:"agent", stepId:"caller_supplied_step")
  // wrote plusObserved:1 and the tape rendered evidence=tool-observed. rate_skill takes step_id from
  // the CALLER (index.ts rateRun), so provenance inferred from stepId is forgeable by any agent
  // rating its own work. Provenance is now an explicit argument defaulting to "judged".
  // This asserts the RENDERING contract; the writer contract is asserted in referee's own tests.
  const forged = { plus: 1, minus: 0, lastStepId: "caller_supplied_step", plusJudged: 1 };
  expect(tape(forged)).toContain("evidence=agent-judged");
  expect(tape(forged)).not.toContain("tool-observed");
});

test("OVER-COUNTING counters are as broken as under-counting · guard is !==, not <", () => {
  // accounted (5) > attempts (3): a desynchronised ledger. Must not claim a clean tier.
  const t = tape({ plus: 3, minus: 0, plusObserved: 3, plusJudged: 2 });
  expect(t).toContain("legacy");
  expect(t).not.toContain("evidence=tool-observed");
});

test("PARTIAL reports BOTH masses, not just the flattering one", () => {
  // 6 total, 2 observed + 1 judged accounted, 3 unaccounted. Showing only "2 observed" would hide
  // that a third of the accounted mass was self-assessed and half the record is unexplained.
  const t = tape({ plus: 6, minus: 0, plusObserved: 2, plusJudged: 1 });
  expect(t).toContain("2 observed");
  expect(t).toContain("1 judged");
  expect(t).toContain("3 unaccounted");
});
