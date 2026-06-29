// muscle-memory · efficacy tests — MEASURED skill efficacy + the non-regression prune guard.
// The ground truth is the agent's own matured repair chains (real fail→fix→verify), so "does the skill
// help?" is measured against real recurrence — not synthetic opinion. Offline + deterministic.
import { test, expect } from "bun:test";
import { recurringFailureClasses, skillCovers, efficacyReport, nonRegressionGuard } from "../mods/efficacy";
import type { Row } from "../mods/core";
import type { SkillLite } from "../mods/efficacy";

const T0 = 1_700_000_000_000;
let seq = 0;
function R(tool: string, tmpl: string, ok: boolean | undefined, opts: { conv?: string; ts?: number } = {}): Row {
  return { tool, tmpl, fp: tmpl, h: tmpl, ok, ts: opts.ts ?? T0 + seq++ * 1000, conv: opts.conv ?? "c1" };
}

// Same-shape recovery across two languages → one matured (generalized) recurring failure class. Mirrors the
// proven detect.test fixture, so the ground-truth class is guaranteed to exist.
const repairRows: Row[] = [
  R("Bash", "python3 test.py", false, { conv: "a", ts: 1 }), R("Edit", "math.py", true, { conv: "a", ts: 2 }), R("Bash", "python3 test.py", true, { conv: "a", ts: 3 }),
  R("Bash", "node test.js", false, { conv: "b", ts: 4 }), R("Edit", "sum.js", true, { conv: "b", ts: 5 }), R("Bash", "node test.js", true, { conv: "b", ts: 6 }),
];

const coveringSkill: SkillLite = {
  name: "recovering-from-failing-script-runs",
  description: "Use when a python3 or node test run fails — edit the source and re-run the same command.",
  body: "# recovering-from-failing-script-runs\n## Procedure\n1. Read the failing python3/node test output.\n2. Edit the source, re-run the same command.",
};
const unrelatedSkill: SkillLite = {
  name: "deploying-with-docker-compose",
  description: "Use when bringing up a docker compose stack for local kubernetes parity.",
  body: "# deploying-with-docker-compose\n## Procedure\n1. docker compose up.\n2. verify the kubernetes ingress.",
};

test("recurringFailureClasses surfaces the matured cross-session repair as a ground-truth class", () => {
  const classes = recurringFailureClasses(repairRows);
  expect(classes.length).toBeGreaterThanOrEqual(1);
  expect(classes.some((c) => c.key.includes("failing-script-runs"))).toBe(true);
});

test("skillCovers: a skill carrying ≥2 class tokens covers it; an unrelated skill does not", () => {
  const cls = recurringFailureClasses(repairRows).find((c) => c.key.includes("failing-script-runs"))!;
  expect(skillCovers(coveringSkill, cls)).toBe(true);
  expect(skillCovers(unrelatedSkill, cls)).toBe(false);
});

test("efficacyReport: empty library covers nothing; the covering skill measurably lifts coverage + CPG", () => {
  const baseline = efficacyReport(repairRows, []);
  expect(baseline.classes).toBeGreaterThanOrEqual(1);
  expect(baseline.covered).toBe(0);
  expect(baseline.coverage).toBe(0);

  const withSkill = efficacyReport(repairRows, [coveringSkill]);
  expect(withSkill.covered).toBeGreaterThan(baseline.covered); // MEASURED improvement vs no-skill baseline
  expect(withSkill.coverage).toBe(1);
  expect(withSkill.skillTokens).toBeGreaterThan(0);
  expect(withSkill.cpg).toBeGreaterThan(0);                    // covered classes per 1k skill tokens

  // an unrelated skill adds tokens but no coverage → CPG must not improve
  const withNoise = efficacyReport(repairRows, [coveringSkill, unrelatedSkill]);
  expect(withNoise.covered).toBe(withSkill.covered);
  expect(withNoise.cpg).toBeLessThan(withSkill.cpg);
});

test("nonRegressionGuard BLOCKS a prune that orphans a still-recurring failure, ALLOWS a safe one", () => {
  // removing the only covering skill while the failure still recurs → blocked
  const dropCovering = nonRegressionGuard(repairRows, [coveringSkill], []);
  expect(dropCovering.ok).toBe(false);
  expect(dropCovering.lost.some((k) => k.includes("failing-script-runs"))).toBe(true);

  // removing an unrelated 0-coverage skill → safe, coverage preserved
  const dropUnrelated = nonRegressionGuard(repairRows, [coveringSkill, unrelatedSkill], [coveringSkill]);
  expect(dropUnrelated.ok).toBe(true);
  expect(dropUnrelated.lost.length).toBe(0);

  // removing a skill that covered nothing in the first place → safe
  const dropNothing = nonRegressionGuard(repairRows, [unrelatedSkill], []);
  expect(dropNothing.ok).toBe(true);
});
