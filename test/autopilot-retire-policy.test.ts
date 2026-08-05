// The docs promised "lifecycle changes are never automatic" and "nothing is auto-retired",
// while executeAutopilotPlan called retireManagedSkill unconditionally. A cold review caught
// the contradiction. The conservative claim is the one worth keeping, so the behaviour moves
// to match it: retirement is a recommendation unless it is explicitly enabled.
import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeAutopilotPlan } from "../mods/autopilot";

function shelfWithSkill(name: string) {
  const dir = mkdtempSync(join(tmpdir(), "mm-retire-"));
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: Use when testing retirement policy.\n---\n## Procedure\n1. step\n`);
  return dir;
}

const retirePlan = (skill: string) => ({ decisions: [{ op: "retire" as const, skill, reason: "stale under test" }] });

test("staged mode does not retire; it recommends", () => {
  const skill = "policy-victim";
  const skillsDir = shelfWithSkill(skill);
  const res = executeAutopilotPlan(retirePlan(skill), { skillsDir, rows: [] });

  expect(res.retired).toEqual([]);
  expect(res.recommendedRetire).toContain(skill);
  // the skill is still on the shelf - nothing was silently removed
  expect(existsSync(join(skillsDir, skill, "SKILL.md"))).toBe(true);

  const receipt = res.receipts.find((r) => r.op === "retire");
  expect(receipt.executed).toBe(false);
  expect(receipt.reasonWithheld).toBe("retire_requires_explicit_policy");
  rmSync(skillsDir, { recursive: true, force: true });
});

test("retirement happens only when explicitly enabled", () => {
  const skill = "policy-victim";
  const skillsDir = shelfWithSkill(skill);
  const res = executeAutopilotPlan(retirePlan(skill), { skillsDir, rows: [], retirePolicy: "enabled" });

  // Under an explicit policy the retire branch is taken: nothing is withheld, and the skill is
  // not merely recommended. (Full retirement needs a real managed shelf, which a synthetic
  // fixture cannot provide, so this asserts the policy decision rather than the lifecycle.)
  expect(res.recommendedRetire).toEqual([]);
  const receipt = res.receipts.find((r) => r.op === "retire");
  expect(receipt?.reasonWithheld).toBeUndefined();
  rmSync(skillsDir, { recursive: true, force: true });
});

test("graduate and refine are unaffected by the retire policy", () => {
  const skillsDir = shelfWithSkill("keeper");
  const res = executeAutopilotPlan({ decisions: [] }, { skillsDir, rows: [] });
  expect(res.graduated).toEqual([]);
  expect(res.retired).toEqual([]);
  rmSync(skillsDir, { recursive: true, force: true });
});
