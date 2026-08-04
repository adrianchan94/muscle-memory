import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Row } from "../mods/core";
import { buildCrossConversationEvidence, detect } from "../mods/detect";
import { autopilotPlan, canonicalSkillIdentity, managedView, normalizePrescriptionQuery, pickUpdateTarget, searchSkills } from "../mods/autopilot";
import { coverageMap, curateManagedSkills } from "../mods/lifecycle";

const managedSkill = (dir: string, name: string, description: string) => {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n## Procedure\n1. Follow the workflow.\n\n<!-- muscle-memory provenance: dogfood fixture -->\n`);
};

const row = (tool: string, tmpl: string, ok: boolean, conv: string, ts: number): Row => ({
  tool,
  tmpl,
  fp: `${tool}:${tmpl}`,
  h: `${conv}:${ts}`,
  ok,
  conv,
  ts,
  ...(ok === false ? { err: "inferred-failure" } : {}),
});

const scriptRepairRows = (): Row[] => [
  row("Bash", "python3 test.py", false, "python", 1),
  row("Edit", "Edit <path>.py", true, "python", 2),
  row("Bash", "python3 test.py", true, "python", 3),
  row("Bash", "node test.js", false, "node", 4),
  row("Edit", "Edit <path>.js", true, "node", 5),
  row("Bash", "node test.js", true, "node", 6),
];

test("RC3 dogfood · class repair routes to the exact existing managed skill across mirrored shelves", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-dogfood-route-"));
  const agent = join(root, "agent");
  const global = join(root, "global");
  managedSkill(agent, "repairing-failing-script-runs", "Use when a script run fails: edit the source and rerun the same script until it passes.");
  managedSkill(global, "repairing-failing-script-runs", "Use when a mirrored script-repair skill must not split the routing vote.");
  managedSkill(agent, "repairing-failing-commands-at-source", "Use when any command fails: repair the source layer and rerun the exact invocation.");

  const hits = searchSkills([agent, global], "failing-script-runs edit the source inferred-failure", 4);
  expect(hits.filter((hit) => hit.name === "repairing-failing-script-runs")).toHaveLength(1);
  expect(pickUpdateTarget(hits, 18)?.name).toBe("repairing-failing-script-runs");

  const coverage = coverageMap(scriptRepairRows(), [agent, global]);
  expect(coverage.find((item) => item.domain === "failing-script-runs")).toMatchObject({
    status: "covered",
    skill: "repairing-failing-script-runs",
  });
});

test("live dogfood · self-referential product wording cannot drown the exact procedure match", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-dogfood-self-noise-"));
  managedSkill(root, "validating-skill-learning-loops", "Use when validating or dogfooding a skill-learning loop end to end, especially prescription handoff, actual Skill invocation, closeout, or release evidence.");
  managedSkill(root, "initializing-memory", "Use when setting up agent memory for a new agent.");
  writeFileSync(join(root, "initializing-memory", "SKILL.md"), `---
name: initializing-memory
description: Use when setting up agent memory for a new agent.
---

## Procedure
Inside inside inside an agent, review review review the model model model, release release release the full full state, task, closeout, prescription, surface, and trust boundary before continuing.
`);
  const task = "Dogfood the freshly reloaded three-tool Muscle Memory surface inside the agent and validate the full prescribe Skill task close loop without overclaiming or mutating release state.";
  const raw = searchSkills([root], task, 4);
  expect(pickUpdateTarget(raw, 18)).toBeNull();

  const normalized = normalizePrescriptionQuery(task);
  expect(normalized).not.toMatch(/muscle memory/i);
  expect(pickUpdateTarget(searchSkills([root], normalized, 4), 18)?.name).toBe("validating-skill-learning-loops");
});

test("RC3 dogfood · primitive repair chains are noise, not uncovered skill gaps", () => {
  const rows: Row[] = [];
  for (const [index, ext] of ["md", "json", "ts"].entries()) {
    const conv = `primitive-${ext}`;
    rows.push(
      row("Read", `Read <path>.${ext}`, false, conv, index * 10 + 1),
      row("Edit", `Edit <path>.${ext}`, true, conv, index * 10 + 2),
      row("Read", `Read <path>.${ext}`, true, conv, index * 10 + 3),
    );
  }

  const evidence = buildCrossConversationEvidence(rows);
  expect(evidence.digest).not.toContain("recovered failure: \"Read");
  const coverage = coverageMap(rows, []);
  expect(coverage.some((item) => item.status === "uncovered")).toBe(false);
});

test("RC3 dogfood · one-off durable repairs do not appear as uncovered coverage", () => {
  const rows = [
    row("Bash", "npm run build", false, "single", 1),
    row("Edit", "Edit <path>.ts", true, "single", 2),
    row("Bash", "npm run build", true, "single", 3),
  ];
  expect(coverageMap(rows, []).filter((item) => item.status === "uncovered")).toEqual([]);
});

test("RC3 dogfood · inspection wrappers and command chains never enter autopilot distill", () => {
  const rows: Row[] = [];
  for (let i = 0; i < 4; i++) {
    const conv = `inspect-${i}`;
    rows.push(
      row("Bash", "timeout <n> letta models list --provider <str>", true, conv, i * 10 + 1),
      row("Bash", "letta models list --provider <str> | head -<n>", true, conv, i * 10 + 2),
      row("Bash", "env", true, conv, i * 10 + 3),
    );
  }

  expect(detect(rows).candidates).toEqual([]);
  const plan = autopilotPlan({ rows, managed: [], dirsForDedup: [], config: { mode: "staged", dailyBudget: 5, minImpact: 0 } });
  expect(plan.decisions.filter((decision) => decision.op === "distill")).toEqual([]);
});

test("research gate · verified repair chains clear deterministic quality admission", () => {
  const rows: Row[] = [];
  for (let i = 0; i < 3; i++) {
    const conv = `repair-${i}`;
    rows.push(
      row("Bash", "npm test", false, conv, i * 10 + 1),
      row("Edit", "Edit <path>.ts", true, conv, i * 10 + 2),
      row("Bash", "npm test", true, conv, i * 10 + 3),
    );
  }
  const plan = autopilotPlan({ rows, managed: [], dirsForDedup: [], config: { mode: "staged", dailyBudget: 5, minImpact: 0 } });
  expect(plan.decisions.some((decision) => decision.op === "distill" && decision.name === "recovering-from-npm-test-failures")).toBe(true);
  expect(plan.skipped.some((item) => item.why.startsWith("quality:"))).toBe(false);
});

test("RC3 dogfood · single-command repetition stays observable but never auto-distills", () => {
  const rows = Array.from({ length: 4 }, (_, index) => row("Bash", "docker build <str>", true, `docker-${index}`, index));
  expect(detect(rows).candidates.some((candidate) => candidate.kind === "template")).toBe(true);
  const plan = autopilotPlan({ rows, managed: [], dirsForDedup: [], config: { mode: "staged", dailyBudget: 5, minImpact: 0 } });
  expect(plan.decisions.filter((decision) => decision.op === "distill")).toEqual([]);
  expect(plan.skipped.some((item) => item.why.includes("single-command repetition"))).toBe(true);
});

test("RC3 dogfood · repairing/recovering aliases share one canonical skill identity", () => {
  expect(canonicalSkillIdentity("recovering-from-failing-script-runs")).toBe("script");
  expect(canonicalSkillIdentity("repairing-failing-script-runs")).toBe("script");
  expect(canonicalSkillIdentity("repairing-failing-commands-at-source")).toBe("commands-source");
});

test("RC3 dogfood · managed views and curator output dedupe mirrored shelves", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-dogfood-shelves-"));
  const agent = join(root, "agent");
  const global = join(root, "global");
  managedSkill(agent, "mirrored-skill", "Use when the agent-local copy should win.");
  managedSkill(global, "mirrored-skill", "Use when the global mirror must not create a duplicate row.");

  expect(managedView([agent, global]).map((item) => item.name)).toEqual(["mirrored-skill"]);
  expect(curateManagedSkills({}, [agent, global]).map((item) => item.name)).toEqual(["mirrored-skill"]);
});
