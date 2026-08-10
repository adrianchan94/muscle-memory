// muscle-memory · READ PATH — accumulated field evidence must CHANGE the injected contract.
//
// EVIDENCE (2026-08-10): every loadPlusMinus() call site was DISPLAY-ONLY (index.ts 459/951/1023/
// 1147/1165) and skillUtility() (referee.ts:122) had ZERO callers. MM wrote a scoreboard nobody
// played off. Measured in the episode pilot: arm B carried 4 accumulated ratings and produced a
// slope IDENTICAL to four decimals vs the arm that wiped its library each task (-0.1753 both).
// A library with no consumer cannot change behaviour.
import { test, expect } from "bun:test";
import { applyNudge } from "../mods/nudge";

test("no field record · contract is unchanged (the shipped default must not shift)", () => {
  expect(applyNudge("pdf-tools")).not.toContain("FIELD RECORD");
});

test("below the attempts floor · stays silent even at 100% failure", () => {
  // RATE rule: 4 attempts is under the floor of 5, however bad the rate.
  expect(applyNudge("pdf-tools", { plus: 0, minus: 4 })).not.toContain("FIELD RECORD");
});

test("a good record raises NO CAUTION · we caution about harm, never about use", () => {
  // SCOPE CORRECTION (2026-08-10, P1). This file governs the CAUTION ("FIELD RECORD") only.
  // "Silent" here means no caution is raised — it does NOT mean the agent is shown nothing.
  // Since P1, applyNudge also emits an UNGATED "FIELD TAPE" line at attempts>=1 which exposes the
  // raw record in BOTH directions, positive and negative, with an inline evidence tier. So a
  // good record DOES now speak — as raw counts the agent judges for itself — while the caution,
  // which is a verdict rather than data, stays reserved for demonstrated harm. The consumer asked
  // for exactly this split: data at any n, a verdict only at attempts>=5 AND failRate>=0.5.
  // Tape behaviour is owned by test/field-tape.test.ts; assertions here must stay caution-scoped.
  expect(applyNudge("pdf-tools", { plus: 5, minus: 1 })).not.toContain("FIELD RECORD");
});

test("a HIGH FAIL RATE over enough attempts speaks", () => {
  const out = applyNudge("pdf-tools", { plus: 2, minus: 6 });
  expect(out).toContain("FIELD RECORD");
  expect(out).toContain("failed 6 of 8 attempts");
  expect(out).toContain("75%");
});

test("MEASURED 2026-08-10 · a COUNT-based rule would fire here, the RATE rule must NOT", () => {
  // 4 failures but 20 attempts = 20% fail rate: a heavily-USED skill, not a harmful one.
  // The old rule (minus>=2 && minus>plus) stayed silent only by luck; corr(miss_count,
  // retrieval_count)=0.995 means count-based penalties mostly measure USAGE.
  expect(applyNudge("pdf-tools", { plus: 16, minus: 4 })).not.toContain("FIELD RECORD");
});

test("the caution never replaces the procedure contract — it is ADDITIVE", () => {
  const out = applyNudge("pdf-tools", { plus: 0, minus: 6 });
  expect(out).toContain("Treat it as a procedure to APPLY");
  expect(out).toContain("Silently substituting your own approach is not.");
  expect(out).toContain("FIELD RECORD");
});
