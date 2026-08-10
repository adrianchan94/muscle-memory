// muscle-memory · FIELD TAPE — the ungated raw record below the caution gate.
//
// WHY THIS EXISTS (P1 sweep, 2026-08-10). The caution at nudge.ts fires only at attempts>=5 AND
// failRate>=0.5. Swept minAttempts x {2,3,5,8} against minFailRate x {0.3,0.5,0.667,0.8} over the
// live 16-skill ledger: ALL 16 SETTINGS FIRED ON ZERO SKILLS, because minus=0 for every skill. The
// threshold was a free parameter with no effect. The defect was never the constants — the consumer
// independently proposed the identical rule (n>=5 AND misses>=helps IS failRate>=0.5) — it was that
// NOTHING renders below the gate. `caution` is [] there, so no field data reached the agent at n<5.
import { test, expect } from "bun:test";
import { applyNudge } from "../mods/nudge";

test("n=1 · the tape renders — one rated use is enough to show the raw record", () => {
  const out = applyNudge("pdf-tools", { plus: 1, minus: 0 });
  expect(out).toContain("FIELD TAPE · 1 helped / 0 missed · n=1");
});

test("n=0 · NO tape — an unrated skill must not be given an invented zero record", () => {
  // A "0 helped / 0 missed" line reads as evidence of nothing-good. Absence of data is not a zero.
  expect(applyNudge("pdf-tools", { plus: 0, minus: 0 })).not.toContain("FIELD TAPE");
  expect(applyNudge("pdf-tools", null)).not.toContain("FIELD TAPE");
  expect(applyNudge("pdf-tools", undefined)).not.toContain("FIELD TAPE");
});

test("evidence tier is INLINE · computed from PER-SIGN counters, not from the last write", () => {
  // SUPERSEDED ASSERTION (P1b, same day). This test previously required lastStepId to set the tier:
  //   {plus:2, minus:1, lastStepId:"call_abc"}  ->  "tool-observed"
  // That was the LAST WRITE ONLY, so one manual rating relabelled a whole record, and an autorate
  // write landing last would label mostly-self-assessed evidence "tool-observed". The tier now comes
  // from plusObserved/plusJudged/minusObserved/minusJudged. Full contract and the migration boundary
  // live in test/provenance-tier.test.ts; these two keep the INLINE placement pinned.
  expect(applyNudge("s", { plus: 2, minus: 1, plusObserved: 2, minusObserved: 1 }))
    .toContain("n=3 · evidence=tool-observed");
  expect(applyNudge("s", { plus: 2, minus: 1, plusJudged: 2, minusJudged: 1 }))
    .toContain("n=3 · evidence=agent-judged");
  // and a trailing stepId alone must no longer promote anything
  expect(applyNudge("s", { plus: 2, minus: 1, lastStepId: "call_abc" })).toContain("evidence=legacy");
});

test("the tape counts MISSES honestly and does not round or editorialise", () => {
  expect(applyNudge("s", { plus: 1, minus: 3 }))
    .toContain("FIELD TAPE · 1 helped / 3 missed · n=4");
});

test("the 5/0.5 caution gate is UNCHANGED — consumer-confirmed, not to be retuned", () => {
  // n=4 at 50% is below the attempts floor: tape only, no caution.
  const under = applyNudge("s", { plus: 2, minus: 2 });
  expect(under).toContain("FIELD TAPE");
  expect(under).not.toContain("FIELD RECORD");
  // n=5 at 60% clears both.
  const over = applyNudge("s", { plus: 2, minus: 3 });
  expect(over).toContain("FIELD TAPE · 2 helped / 3 missed · n=5");
  expect(over).toContain("FIELD RECORD");
  // n=5 at 40% clears attempts but not failRate -> tape only.
  const rate = applyNudge("s", { plus: 3, minus: 2 });
  expect(rate).toContain("FIELD TAPE");
  expect(rate).not.toContain("FIELD RECORD");
});

test("the APPLY contract itself is untouched — tape is additive, never a replacement", () => {
  const out = applyNudge("pdf-tools", { plus: 1, minus: 0 });
  expect(out).toContain("Treat it as a procedure to APPLY, not a document to review");
  expect(out).toContain("Follow its steps IN ORDER");
  expect(out).toContain("Disagreeing with the skill is allowed");
  // and the tape sits ABOVE the closing line, inside the bullet block
  expect(out.indexOf("FIELD TAPE")).toBeLessThan(out.indexOf("Disagreeing with the skill"));
});
