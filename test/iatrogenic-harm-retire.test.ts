// L3 IATROGENIC HARM · machine oracle.
// Question: does the shipped harm countermeasure (HARM_RETIRE_MIN + skillHarmRecord) ever
// actually take a harmful skill off the shelf through an AUTOMATIC path?
// Every assertion below is a fact about the shipped code, not a wish about it.
import { beforeEach, afterEach, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MM_TAG } from "../mods/core";
import {
  HARM_RETIRE_MIN,
  skillHarmRecord,
  curateManagedSkills,
  curatorPass,
  runAutonomousPrune,
  retireManagedSkill,
  loadUsage,
  saveUsage,
} from "../mods/lifecycle";
import { autopilotPlan, executeAutopilotPlan, managedView } from "../mods/autopilot";
import { POSSESSION_LEDGER_PATH, recordPossessionEvent } from "../mods/possessions";

const DAY = 86400000;
let shelf = "";
const envBefore = process.env.MM_AGENT_SKILLS_DIR;

function seedSkill(name: string, dir = shelf) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when proving whether recorded harm retires a skill.\n---\n\n## Procedure\n1. do the harmful thing\n\n<!-- ${MM_TAG}: L3 harm fixture -->\n`,
  );
  return join(dir, name, "SKILL.md");
}

/** Write REAL harm through the real ledger API: 3 harmed closes vs 1 helped => net -2. */
function seedHarm(skill: string, harmed = 3, helped = 1) {
  let i = 0;
  const rep = (result: "harmed" | "helped") => {
    const pid = `${skill}-p${i++}`;
    recordPossessionEvent({
      schema: "mm.possession.v1", event_id: `${pid}-d`, possession_id: pid, ts: 1000 + i,
      type: "decision", agent: "l3", model: "test", action: "prescribe",
      task_class: "harm-probe", gap_observed: true, route: "matched", skill,
    });
    recordPossessionEvent({
      schema: "mm.possession.v1", event_id: `${pid}-o`, possession_id: pid, ts: 2000 + i,
      type: "outcome", result, evidence_tier: "agent_judged",
      reason: `probe close recorded as ${result}`,
    });
  };
  for (let n = 0; n < harmed; n++) rep("harmed");
  for (let n = 0; n < helped; n++) rep("helped");
}

function onShelf(name: string, dir = shelf) { return existsSync(join(dir, name, "SKILL.md")); }

beforeEach(() => {
  rmSync(POSSESSION_LEDGER_PATH, { force: true });
  shelf = mkdtempSync(join(tmpdir(), "mm-l3-harm-"));
  process.env.MM_AGENT_SKILLS_DIR = shelf;
});

afterEach(() => {
  if (envBefore === undefined) delete process.env.MM_AGENT_SKILLS_DIR;
  else process.env.MM_AGENT_SKILLS_DIR = envBefore;
  rmSync(shelf, { recursive: true, force: true });
});

test("L3 · the tape DOES see the harm: skillHarmRecord reads 3 harmed / 1 helped / net -2", () => {
  const name = "l3-harmful-skill";
  seedSkill(name);
  seedHarm(name);
  expect(HARM_RETIRE_MIN).toBe(3);
  expect(skillHarmRecord(name)).toEqual({ helped: 1, harmed: 3, net: -2 });
});

test("L3 · curateManagedSkills flags retire_candidate but is ADVISORY — the SKILL.md never moves", () => {
  const name = "l3-harmful-skill";
  seedSkill(name);
  seedHarm(name);
  const rows = curateManagedSkills({}, [shelf]);
  const row = rows.find((r) => r.name === name)!;
  expect(row.verdict).toBe("retire_candidate");
  expect(row.harmed).toBe(3);
  // THE FINDING: a verdict is a string. Nothing on disk changed.
  expect(onShelf(name)).toBe(true);
  expect(existsSync(join(shelf, "_retired"))).toBe(false);
});

test("L3 · runAutonomousPrune is DISUSE-gated: a harmful skill that is USED is structurally immune", () => {
  const name = "l3-harmful-used-skill";
  seedSkill(name);
  seedHarm(name);
  const u = loadUsage();
  u[name] = { uses: 7, created: Date.now() - 400 * DAY, lastActivity: Date.now(), state: "active" };
  saveUsage(u);

  const res = runAutonomousPrune({}, { maxRetire: 5 });
  expect(res.retired).not.toContain(name);
  expect(res.kept).toContain(name);
  expect(onShelf(name)).toBe(true);

  const after = loadUsage(); delete after[name]; saveUsage(after);
});

test("L3 · runAutonomousPrune retires ONLY for disuse — its own reason string never mentions harm", () => {
  const name = "l3-harmful-unused-skill";
  seedSkill(name);
  seedHarm(name);
  const u = loadUsage();
  u[name] = { uses: 0, created: Date.now() - 400 * DAY, state: "active" };
  saveUsage(u);

  const res = runAutonomousPrune({}, { maxRetire: 5 });
  expect(res.retired).toContain(name);
  expect(onShelf(name)).toBe(false);
  const archived = readdirSync(join(shelf, "_retired"));
  expect(archived.some((n) => n.startsWith(name))).toBe(true);
  // The trigger was 0 uses in 400d. Harm contributed nothing to this decision.
  const after = loadUsage(); delete after[name]; saveUsage(after);
});

test("L3 · autopilotPlan never emits op:'retire' from harm — the planner reads uses/age, not the tape", () => {
  const name = "l3-harmful-planner-skill";
  seedSkill(name);
  seedHarm(name, 9, 0); // overwhelming harm: 9 harmed, 0 helped
  expect(skillHarmRecord(name)).toMatchObject({ harmed: 9, helped: 0, net: -9 });

  const managed = managedView([shelf]).map((m) => ({ ...m, uses: 5, ageDays: 3 }));
  const plan = autopilotPlan({ rows: [], managed, dirsForDedup: [shelf], config: { mode: "auto", dailyBudget: 5, minImpact: 0 } });
  expect(plan.decisions.filter((d) => d.op === "retire")).toEqual([]);
  expect(onShelf(name)).toBe(true);
});

test("L3 · even a hand-built retire decision is withheld under the DEFAULT retirePolicy", () => {
  const name = "l3-harmful-default-policy";
  seedSkill(name);
  seedHarm(name);
  const res = executeAutopilotPlan(
    { decisions: [{ op: "retire", skill: name, reason: "3 harmed vs 1 helped" }] },
    { skillsDir: shelf, rows: [] },
  );
  expect(res.retired).toEqual([]);
  expect(res.recommendedRetire).toContain(name);
  expect(res.receipts.find((r) => r.op === "retire")?.reasonWithheld).toBe("retire_requires_explicit_policy");
  expect(onShelf(name)).toBe(true);
});

test("L3 · curatorPass is activity-only: a fresh, harmful skill gets no transition at all", () => {
  const name = "l3-harmful-curator-skill";
  seedSkill(name);
  seedHarm(name);
  expect(curatorPass([{ name, lastActivityDaysAgo: 0, state: "active" }]).transitions).toEqual([]);
  expect(onShelf(name)).toBe(true);
});

// ── PAIRED POSITIVE CONTROL ─────────────────────────────────────────────────────
// Retirement is NOT broken. Both explicit paths remove the same fixture from the same shelf.
test("L3 positive control · explicit retireManagedSkill DOES take the skill off the shelf", () => {
  const name = "l3-harmful-explicit";
  seedSkill(name);
  seedHarm(name);
  expect(onShelf(name)).toBe(true);
  const target = retireManagedSkill(name, "explicit op: 3 harmed vs 1 helped", {}, undefined, [shelf]);
  expect(onShelf(name)).toBe(false);
  expect(existsSync(join(target, "SKILL.md"))).toBe(true);
  const after = loadUsage(); delete after[name]; saveUsage(after);
});

test("L3 positive control · executeAutopilotPlan with retirePolicy:'enabled' DOES retire", () => {
  const name = "l3-harmful-enabled-policy";
  seedSkill(name);
  seedHarm(name);
  const res = executeAutopilotPlan(
    { decisions: [{ op: "retire", skill: name, reason: "3 harmed vs 1 helped" }] },
    { skillsDir: shelf, rows: [], retirePolicy: "enabled" },
  );
  expect(res.retired).toContain(name);
  expect(res.recommendedRetire).toEqual([]);
  expect(onShelf(name)).toBe(false);
  const after = loadUsage(); delete after[name]; saveUsage(after);
});
