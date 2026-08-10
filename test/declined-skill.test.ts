// THE DECLINED SKILL — the pair, asserted.
//
// `test/verified-abstention.test.ts` proved the MECHANISM: the true-negative cell is reachable
// and every forgery of it fails closed. This file proves the CLAIM CLASS the mechanism unlocks:
// for ONE named skill on ONE possession, the instrument — not a human's hindsight — says the
// correct disposition was DECLINE.
//
// It asserts a MATCHED PAIR over a single fixture (live RC6 P3 decoy `aligning-cairn-beacon-
// anchors` facing its recorded scope reversal, a counting task):
//   declined   -> succeeded_unaided, verifiedSuccessfulAbstentions 1, harmfulInterventions 0
//   prescribed -> harmed,            verifiedSuccessfulAbstentions 0, harmfulInterventions 1
// Neither half is the claim on its own. Lane A alone says only "the agent coped". Lane B alone
// says only "a skill missed once". Together, over the same sealed manifest, they say the shelf
// held a skill whose right answer here was no.
import { afterAll, expect, test } from "bun:test";
import {
  DECOY_SKILL,
  EXPECTED,
  TASK_CLASS,
  forgeryAttempts,
  laneAbstain,
  lanePrescribe,
  runDecoySkill,
  tallyVowels,
} from "../scripts/declined-skill-demo";

afterAll(() => { delete process.env.MM_EXACT_FILE_ROOT; });

test("the fixture is a genuine scope reversal: the decoy skill CANNOT produce the expected artifact", () => {
  // If the skill could accidentally satisfy the task, the whole demonstration is circular.
  const source = "anchor[cairn-b]=zephyr    |beacon\n";
  expect(runDecoySkill(source, "cairn-b", "quartz")).not.toBe(tallyVowels(source));
  expect(EXPECTED).toMatch(/^a=\d+\n/);
  expect(TASK_CLASS).toBe("anchor-repair-scope-reversal");
});

test("LANE A · declining the shelf skill is an instrument-verified success", () => {
  const a = laneAbstain();
  expect(a).toMatchObject({
    action: "abstain",
    route: "no-safe-match",
    skill_offered: DECOY_SKILL,
    skill_ran: false,
    artifact_correct: true,
    result: "succeeded_unaided",
    evidence_tier: "verified",
    procedural_credit: true,
    invocation_receipt_id: "",     // the mirror has no receipt to name, and must not invent one
  });
  expect(a.reason).toContain("NO skill invocation was observed");
  expect(a.counters).toMatchObject({
    verifiedSuccessfulAbstentions: 1,
    verifiedEvaluatedAbstentions: 1,
    helpfulInterventions: 0,
    harmfulInterventions: 0,
    verifiedGoodDecisions: 1,
    contextsAvoided: 1,
    unaidedClaimsDemoted: 0,
  });
  expect(a.share_card).toMatchObject({ verified_successful_abstentions: 1, harmful_interventions: 0 });
});

test("LANE B · the MIRROR: prescribing the same skill on the same fixture is instrument-verified harm", () => {
  const b = lanePrescribe();
  expect(b).toMatchObject({
    action: "prescribe",
    skill_offered: DECOY_SKILL,
    skill_ran: true,               // observed through the runtime's own tool observer, MAC-signed
    artifact_correct: false,       // the skill ran its documented procedure and still missed
    result: "harmed",
    evidence_tier: "verified",
    procedural_credit: false,
  });
  expect(b.counters).toMatchObject({
    harmfulInterventions: 1,
    helpfulInterventions: 0,
    verifiedSuccessfulAbstentions: 0,
    contextsAvoided: 0,
    verifiedGoodDecisions: 0,
  });
  expect(b.share_card).toMatchObject({ verified_successful_abstentions: 0, harmful_interventions: 1 });
});

test("THE PAIR is the claim: same task, same skill, opposite dispositions, opposite verdicts", () => {
  const a = laneAbstain();
  const b = lanePrescribe();
  expect(a.skill_offered).toBe(b.skill_offered);
  expect(a.result).toBe("succeeded_unaided");
  expect(b.result).toBe("harmed");
  expect(a.artifact_correct).toBe(true);
  expect(b.artifact_correct).toBe(false);
  // and the disagreement is carried by the counters a retirement decision would actually read
  expect(a.counters.verifiedSuccessfulAbstentions - b.counters.verifiedSuccessfulAbstentions).toBe(1);
  expect(b.counters.harmfulInterventions - a.counters.harmfulInterventions).toBe(1);
});

test("ADVERSARIAL: every way of FAKING 'should have been declined' fails closed", () => {
  const f = forgeryAttempts();
  expect(f).toHaveLength(5);
  const by = (needle: string) => f.find((x) => x.name.includes(needle))!;

  expect(by("relabel").error).toContain("result=failed_unaided");
  expect(by("relabel").error).toContain("verifiedSuccessfulAbstentions=0");

  expect(by("sign the decline first").error).toContain("proceduralCredit=false");
  expect(by("sign the decline first").error).toContain("invocation_during_abstention");
  expect(by("sign the decline first").error).toContain("unaidedClaimsDemoted=1");

  expect(by("names an invocation receipt").error).toContain("abstention cannot name an invocation receipt");

  expect(by("already done").error).toContain("result=failed_unaided");
  expect(by("already done").error).toContain("verifiedSuccessfulAbstentions=0");

  expect(by("flip").error).toContain("result does not match");

  // no attempt may leave a 'NOT BLOCKED' marker or a standing award
  for (const attempt of f) {
    expect(attempt.error).not.toContain("NOT BLOCKED");
    expect(attempt.error).not.toContain("verifiedSuccessfulAbstentions=1");
  }
});
