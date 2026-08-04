import { beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import activate from "../mods/index";
import { GLOBAL_SKILLS_DIR, readUiState, writeUiState } from "../mods/core";
import { POSSESSION_LEDGER_PATH, loadPossessionEvents } from "../mods/possessions";
import { VERIFICATION_TASK_DIR } from "../mods/verification";
import { loadPlusMinus } from "../mods/referee";

const tools = new Map<string, any>();
const commands = new Map<string, any>();
let renderPanel: null | (() => string[]) = null;

beforeEach(() => {
  tools.clear();
  commands.clear();
  renderPanel = null;
  rmSync(POSSESSION_LEDGER_PATH, { force: true });
  rmSync(VERIFICATION_TASK_DIR, { recursive: true, force: true });
  delete process.env.MM_EXACT_FILE_ROOT;
  process.env.MM_ADVANCED = "on";
  rmSync(GLOBAL_SKILLS_DIR, { recursive: true, force: true });
  writeUiState({ phase: "idle", last: "", route: "" });
  const skillDir = join(GLOBAL_SKILLS_DIR, "recovering-failed-exact-match-edits");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `---
name: recovering-failed-exact-match-edits
description: Use when an exact-match file edit fails because target text is stale and the edit must be re-anchored against current file content.
---

## Procedure
1. Read the current file.
2. Re-anchor the exact edit.
3. Re-run the original check.
`);
});

function startMod(withPanel = false) {
  const letta = {
    capabilities: { tools: true, commands: true, ...(withPanel ? { ui: { panels: true } } : {}) },
    tools: { register(def: any) { tools.set(def.name, def); return () => {}; } },
    commands: { register(def: any) { commands.set(def.id, def); return () => {}; } },
    ...(withPanel ? { ui: { openPanel(def: any) { renderPanel = () => def.render({ agent: { name: "Kev" } }); return { update() {}, close() {} }; } } } : {}),
    client: {},
  };
  return activate(letta as any);
}

test("default slash-command home is the plain Decision Report, with internals behind filmroom", async () => {
  const dispose = startMod();
  try {
    const command = commands.get("muscle-memory");
    expect(command).toBeDefined();
    const home = await command.run({ argv: [], agent: { name: "Kev" } });
    expect(String(home.output)).toContain("MUSCLE MEMORY · DECISION REPORT · EARLY EVIDENCE");
    expect(String(home.output)).not.toMatch(/🏀|PLAY CALLS|SMART RESTRAINT/);
    expect(String(home.output)).not.toContain("reps observed");
    const readTool = tools.get("muscle_memory_skill_read");
    const report = String(await readTool.run({ args: { action: "report" }, agent: { name: "Kev" } }));
    const legacyAlias = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(report).toBe(String(home.output));
    expect(legacyAlias).toBe(report);
    const filmroom = await command.run({ argv: ["filmroom"], agent: { name: "Kev" } });
    expect(String(filmroom.output)).toContain("reps observed");
  } finally {
    dispose();
  }
});

test("default agent surface exposes the possession loop, not the research harness", async () => {
  delete process.env.MM_ADVANCED;
  const dispose = startMod();
  try {
    expect([...tools.keys()].sort()).toEqual([
      "muscle_memory_close",
      "muscle_memory_prescribe",
      "muscle_memory_skill_read",
    ]);
    const read = tools.get("muscle_memory_skill_read");
    expect(Object.keys(read.parameters.properties).sort()).toEqual(["action", "name"]);
    expect(read.parameters.properties.action.enum).toEqual(["report", "pending_possessions", "roster", "load"]);
    expect(String(read.description)).not.toMatch(/coverage|share.card|registry|defense|verification/i);
    const compactRoster = String(await read.run({ args: { action: "roster" } }));
    expect(compactRoster).toContain("no observed skill outcomes yet");
    expect(compactRoster).toMatch(/skills? with no possessions or field ratings hidden/);
  } finally {
    dispose();
    process.env.MM_ADVANCED = "on";
  }
});

test("dedicated prescribe tool makes the first task move obvious without weakening the research contract", async () => {
  delete process.env.MM_ADVANCED;
  const dispose = startMod();
  try {
    const prescribe = tools.get("muscle_memory_prescribe");
    const read = tools.get("muscle_memory_skill_read");
    const baselineReport = String(await read.run({ args: { action: "report" } }));
    const baselineActive = Number(baselineReport.match(/SKILLS · (\d+) active/)?.[1] || 0);
    expect(prescribe).toBeDefined();
    expect(prescribe.parameters.required).toEqual(["task", "gap_observed"]);
    expect(Object.keys(prescribe.parameters.properties).sort()).toEqual(["gap_observed", "task"]);
    expect(prescribe.parameters.properties.action).toBeUndefined();
    const result = String(await prescribe.run({
      args: {
        task: "An exact-match file edit failed because the target text was stale and must be re-anchored.",
        gap_observed: true,
      },
      model: { id: "fresh-agent-model", provider: "test" },
      agent: { name: "fresh-agent" },
    }));
    expect(result).toContain('PRESCRIBE "recovering-failed-exact-match-edits"');
    expect(result).toContain('Skill tool with skill="recovering-failed-exact-match-edits"');
    expect(result).toContain("muscle_memory_close");
    const possessionId = result.match(/possession: ([a-z0-9._:-]+)/i)?.[1] || "";
    expect(possessionId).not.toBe("");

    const close = tools.get("muscle_memory_close");
    expect(close).toBeDefined();
    expect(close.parameters.required).toEqual(["possession_id", "result", "reason"]);
    expect(Object.keys(close.parameters.properties).sort()).toEqual(["possession_id", "reason", "result"]);
    const closeout = String(await close.run({
      args: { possession_id: possessionId, result: "helped", reason: "The re-anchor procedure resolved the failed edit." },
      model: { id: "fresh-agent-model", provider: "test" },
    }));
    expect(closeout).toContain("OUTCOME RECORDED · helped · agent-judged");
    expect(closeout).toContain("SKILL · recovering-failed-exact-match-edits");
    expect(closeout).toContain("0 verified · still unproven");

    const events = loadPossessionEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "decision", action: "prescribe", route: "matched", skill: "recovering-failed-exact-match-edits" });
    expect(events[1]).toMatchObject({ type: "outcome", result: "helped", evidence_tier: "agent_judged" });

    const roster = String(await read.run({ args: { action: "roster" } }));
    expect(roster).toContain("EARLY POSITIVE · NEEDS REPLICATION · recovering-failed-exact-match-edits");
    expect(roster).toContain("possessions 1 helped / 0 harmed / 0 neutral");
    expect(roster).toContain("evidence 1 judged / 0 verified");
    expect(roster).toMatch(/skills with no possessions or field ratings yet hidden: \d+/);
    const report = String(await read.run({ args: { action: "report" } }));
    expect(report).toContain(`SKILLS · ${baselineActive + 1} active · 0 proven`);
  } finally {
    dispose();
    process.env.MM_ADVANCED = "on";
  }
});

test("agent-facing outcome tool cannot self-award verified evidence", async () => {
  const dispose = startMod();
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const outcomeTool = tools.get("record_agent_possession");
    await readTool.run({
      args: { action: "prescribe", gap_observed: true, task: "stale exact edit", task_class: "stale-exact-edit", difficulty: "standard" },
      model: "gpt-5.6-sol",
    });
    const decision = loadPossessionEvents().find((event) => event.type === "decision");
    const output = String(await outcomeTool.run({
      args: { possession_id: decision!.possession_id, result: "helped", evidence_tier: "verified", reason: "caller says verified", evidence_ref: "fake-receipt" },
    }));
    expect(output).toContain("callers cannot self-award verified");
    expect(loadPossessionEvents().filter((event) => event.type === "outcome")).toHaveLength(0);
  } finally {
    dispose();
  }
});

test("pre-bound exact-file tool derives and records one instrument-owned verified outcome", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "mm-tool-verifier-"));
  process.env.MM_EXACT_FILE_ROOT = workspace;
  writeFileSync(join(workspace, "target.txt"), "repaired\n");
  const dispose = startMod();
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const registrationTool = tools.get("register_exact_file_verification");
    const verifierTool = tools.get("verify_agent_possession");
    expect(registrationTool).toBeDefined();
    expect(verifierTool).toBeDefined();
    const registered = String(await registrationTool.run({ args: {
      task_id: "tool-bound-repair",
      task_class: "stale-exact-edit",
      target_rel: "target.txt",
      expected_sha256: createHash("sha256").update("repaired\n").digest("hex"),
    } }));
    expect(registered).toContain("registered read-only");
    const prescribed = String(await readTool.run({
      args: {
        action: "prescribe",
        gap_observed: true,
        task: "exact-match file edit failed because target text was stale",
        task_class: "stale-exact-edit",
        difficulty: "standard",
        verification_task_id: "tool-bound-repair",
      },
      model: "gpt-5.6-sol",
      agent: { name: "Kev" },
    }));
    expect(prescribed).toContain("verify_agent_possession");
    const decision = loadPossessionEvents().find((event) => event.type === "decision");
    expect(decision).toMatchObject({ verification: { task_id: "tool-bound-repair", task_class: "stale-exact-edit" } });

    const verified = String(await verifierTool.run({ args: { possession_id: decision!.possession_id } }));
    expect(verified).toContain("BOUND-VERIFIED 'helped'");
    expect(loadPossessionEvents().find((event) => event.type === "outcome")).toMatchObject({
      evidence_tier: "verified",
      result: "helped",
      verification: { task_id: "tool-bound-repair", matched: true },
    });
    const boxscore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(boxscore).toContain("INTERVENTIONS · 1 served · 1 helped · 0 harmed");
    expect(boxscore).toContain("STATUS · early verified evidence · 1 verified · not claim-bearing");
  } finally {
    dispose();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(VERIFICATION_TASK_DIR, { recursive: true, force: true });
    delete process.env.MM_EXACT_FILE_ROOT;
  }
});

test("full exact-file tool chain records a bound-verified negative on digest mismatch", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "mm-tool-verifier-negative-"));
  process.env.MM_EXACT_FILE_ROOT = workspace;
  writeFileSync(join(workspace, "target.txt"), "still-broken\n");
  const dispose = startMod();
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const registrationTool = tools.get("register_exact_file_verification");
    const verifierTool = tools.get("verify_agent_possession");
    await registrationTool.run({ args: {
      task_id: "tool-bound-negative",
      task_class: "stale-exact-edit",
      target_rel: "target.txt",
      expected_sha256: createHash("sha256").update("repaired\n").digest("hex"),
    } });
    await readTool.run({
      args: {
        action: "prescribe",
        gap_observed: true,
        task: "exact-match file edit failed because target text was stale",
        task_class: "stale-exact-edit",
        difficulty: "standard",
        verification_task_id: "tool-bound-negative",
      },
      model: "gpt-5.6-sol",
      agent: { name: "Kev" },
    });
    const decision = loadPossessionEvents().find((event) => event.type === "decision");
    const verified = String(await verifierTool.run({ args: { possession_id: decision!.possession_id } }));
    expect(verified).toContain("BOUND-VERIFIED 'harmed'");
    const boxscore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(boxscore).toContain("INTERVENTIONS · 1 served · 0 helped · 1 harmed");
    expect(boxscore).toContain("STATUS · early verified evidence · 1 verified · not claim-bearing");
    expect(boxscore).not.toMatch(/🟥|GOOD DECISIONS/);
  } finally {
    dispose();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(VERIFICATION_TASK_DIR, { recursive: true, force: true });
    delete process.env.MM_EXACT_FILE_ROOT;
  }
});

test("prescribe opens a possession, judged closeout updates the private Box Score without fake verification", async () => {
  const dispose = startMod();
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const outcomeTool = tools.get("record_agent_possession");
    expect(readTool).toBeDefined();
    expect(outcomeTool).toBeDefined();

    const prescribed = String(await readTool.run({
      args: {
        action: "prescribe",
        gap_observed: true,
        task: "exact-match file edit failed because target text was stale",
        task_class: "stale-exact-edit",
        difficulty: "standard",
      },
      model: { provider: "openai-codex", id: "gpt-5.6-sol" },
      agent: { name: "Kev" },
    }));
    expect(prescribed).toContain("PRESCRIBE \"recovering-failed-exact-match-edits\"");
    expect(prescribed).toContain("possession:");

    const decision = loadPossessionEvents().find((event) => event.type === "decision");
    expect(decision).toMatchObject({ action: "prescribe", route: "matched", task_class: "stale-exact-edit", difficulty: "standard" });

    const pending = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(pending).toContain("INTERVENTIONS · 0 served · 0 helped · 0 harmed");
    expect(pending).toContain("PENDING · 1 · stale-exact-edit → recovering-failed-exact-match-edits");
    expect(pending).toContain("STATUS · no evaluated evidence · 0 verified · not claim-bearing");

    const resume = String(await readTool.run({ args: { action: "pending_possessions" }, agent: { name: "Kev" } }));
    expect(resume).toContain("SKILL · recovering-failed-exact-match-edits");
    expect(resume).toContain('NEXT · invoke Skill("recovering-failed-exact-match-edits"), finish the task, then close this same possession');
    const recovered = String(await readTool.run({ args: { action: "pending_possessions" }, agent: { name: "Kev" } }));
    expect(recovered).toContain(decision!.possession_id);

    const closed = String(await outcomeTool.run({
      args: {
        possession_id: decision!.possession_id,
        result: "helped",
        evidence_tier: "agent_judged",
        reason: "the task completed after re-anchoring; no instrument receipt adapter exists",
      },
    }));
    expect(closed).toContain("✓ skill helped · recovering-failed-exact-match-edits");
    expect(closed).toContain("recorded AGENT_JUDGED outcome");
    expect(closed).not.toContain("🏀");
    expect(readUiState()).toMatchObject({ phase: "earned", last: "recovering-failed-exact-match-edits" });

    const boxscore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(boxscore).toContain("INTERVENTIONS · 1 served · 1 helped · 0 harmed");
    expect(boxscore).toContain("PENDING · 0");
    expect(boxscore).toContain("STATUS · early judged evidence · 0 verified · not claim-bearing");
  } finally {
    dispose();
  }
});

test("pending closeout survives an actual mod dispose and reactivation", async () => {
  let dispose = startMod();
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    await readTool.run({ args: { action: "prescribe", gap_observed: true, task: "exact-match file edit failed because target text was stale", task_class: "reload-recovery", difficulty: "hard" }, model: "gpt-5.6-sol" });
    const decision = loadPossessionEvents().find((event) => event.type === "decision")!;
    const possessionId = decision.possession_id;

    dispose();
    dispose = startMod();
    const recoveredTool = tools.get("muscle_memory_skill_read");
    const recovered = String(await recoveredTool.run({ args: { action: "pending_possessions" }, agent: { name: "Kev" } }));
    expect(recovered).toContain(possessionId);
    expect(recovered).toContain("PENDING · HARD · PRESCRIBE · CLEAR MATCH · reload-recovery");
  } finally {
    dispose();
  }
});

test("correct abstention earns restraint credit only after an observed unaided outcome", async () => {
  const dispose = startMod();
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const outcomeTool = tools.get("record_agent_possession");
    const abstained = String(await readTool.run({
      args: {
        action: "prescribe",
        gap_observed: false,
        task: "use a procedure the model already knows",
        task_class: "known-procedure",
      },
      model: "gpt-5.6-sol",
      agent: { name: "Kev" },
    }));
    expect(abstained).toContain("ABSTAIN");

    const decision = loadPossessionEvents().find((event) => event.type === "decision");
    expect(decision).toMatchObject({ action: "abstain", route: "no-gap" });
    let boxscore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(boxscore).toContain("ABSTENTIONS · 0 · 0 succeeded unaided · 0 failed");
    expect(boxscore).toContain("PENDING · 1 · known-procedure");
    const resume = String(await readTool.run({ args: { action: "pending_possessions" }, agent: { name: "Kev" } }));
    expect(resume).toContain("NEXT · finish the task unaided, then close this same possession");
    expect(resume).not.toContain("SKILL ·");

    const closed = String(await outcomeTool.run({
      args: {
        possession_id: decision!.possession_id,
        result: "succeeded_unaided",
        evidence_tier: "human_judged",
        reason: "the task completed cleanly without loading a skill",
      },
    }));
    expect(closed).toContain("✓ no skill needed · task completed");
    expect(readUiState()).toMatchObject({ phase: "earned", last: "smart restraint" });
    boxscore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(boxscore).toContain("ABSTENTIONS · 1 · 1 succeeded unaided · 0 failed");
    expect(boxscore).toContain("PENDING · 0");
    expect(boxscore).toContain("STATUS · early judged evidence · 0 verified · not claim-bearing");
  } finally {
    dispose();
  }
});

test("failed abstention closeout never awards smart restraint", async () => {
  delete process.env.MM_ADVANCED;
  const dispose = startMod();
  try {
    const prescribe = tools.get("muscle_memory_prescribe");
    const close = tools.get("muscle_memory_close");
    const opened = String(await prescribe.run({
      args: { task: "perform a task the caller expected to be known unaided", gap_observed: false },
      model: { id: "dogfood-model", provider: "test" },
    }));
    const possessionId = opened.match(/possession: ([a-z0-9._:-]+)/i)?.[1] || "";
    expect(possessionId).not.toBe("");
    const closed = String(await close.run({
      args: { possession_id: possessionId, result: "failed_unaided", reason: "No safe procedure was available and the task could not be completed unaided." },
      model: { id: "dogfood-model", provider: "test" },
    }));
    expect(closed).toContain("DECISION · abstained · task failed unaided");
    expect(closed).not.toContain("smart restraint");
    expect(String(await tools.get("muscle_memory_skill_read").run({ args: { action: "report" } }))).toContain("ABSTENTIONS · 1 · 0 succeeded unaided · 1 failed");
  } finally {
    dispose();
    process.env.MM_ADVANCED = "on";
  }
});

test("successful abstention beat is visible through the live panel seam", async () => {
  process.env.MM_REFLECT = "auto";
  const dispose = startMod(true);
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const outcomeTool = tools.get("record_agent_possession");
    await readTool.run({
      args: { action: "prescribe", gap_observed: false, task: "verify a known checksum", task_class: "known-checksum" },
      model: "gpt-5.6-sol",
      agent: { name: "Kev" },
    });
    const decision = loadPossessionEvents().find((event) => event.type === "decision")!;
    await outcomeTool.run({
      args: { possession_id: decision.possession_id, result: "succeeded_unaided", evidence_tier: "agent_judged", reason: "checksum matched without a procedural skill" },
    });
    expect(renderPanel).not.toBeNull();
    expect(renderPanel!()).toContain("💾 muscle-memory · ✓ no skill needed · task completed");
  } finally {
    dispose();
    delete process.env.MM_REFLECT;
  }
});

test("helped skill closeout names the skill and field score through the live panel seam", async () => {
  process.env.MM_REFLECT = "auto";
  const dispose = startMod(true);
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const outcomeTool = tools.get("record_agent_possession");
    const rateTool = tools.get("rate_skill");
    const skill = "recovering-failed-exact-match-edits";
    expect(renderPanel).not.toBeNull();
    // Fresh seeded seat: show 0 helped so lifecycle 0→1 is visible; omit proven at zero.
    expect(renderPanel!()[0]).toMatch(/^💾 muscle-memory · \d+ skills? · 0 helped$/);
    expect(renderPanel!()[0]).not.toContain("proven");
    await rateTool.run({
      args: { skill, rating: "up", reason: "the re-anchor procedure fixed the next stale edit" },
      model: "gpt-5.6-sol",
    });
    const rating = loadPlusMinus()[skill];
    expect(rating).toBeDefined();

    await readTool.run({
      args: { action: "prescribe", gap_observed: true, task: "exact-match edit failed because the target text was stale", task_class: "live-skill-beat" },
      model: "gpt-5.6-sol",
      agent: { name: "Kev" },
    });
    const decision = loadPossessionEvents().find((event) => event.type === "decision")!;
    await outcomeTool.run({
      args: { possession_id: decision.possession_id, result: "helped", evidence_tier: "agent_judged", reason: "the re-anchor procedure completed the edit" },
    });

    expect(readUiState()).toMatchObject({ phase: "earned", skill, last: skill });
    expect(renderPanel!()).toContain(`💾 muscle-memory · ✓ skill helped · ${skill} (helped ${rating.plus} · missed ${rating.minus})`);
    // Ratings must not inflate resting helped; only the closed helped prescription counts.
    writeUiState({ phase: "idle", last: "", skill: "", route: "" });
    expect(renderPanel!()[0]).toMatch(/^💾 muscle-memory · \d+ skills? · 1 helped$/);
    expect(renderPanel!()[0]).not.toContain("proven");
  } finally {
    dispose();
    delete process.env.MM_REFLECT;
  }
});

test("successful skill updates become lifecycle evidence instead of invisible mutation volume", async () => {
  const dispose = startMod();
  try {
    const writeTool = tools.get("muscle_memory_skill_write");
    const readTool = tools.get("muscle_memory_skill_read");
    const patched = String(await writeTool.run({ args: { action: "patch", name: "recovering-failed-exact-match-edits", old: "3. Re-run the original check.", replacement: "3. Re-run the original check and save evidence." } }));
    expect(patched).toContain("patched 'recovering-failed-exact-match-edits'");
    expect(loadPossessionEvents().find((event) => event.type === "lifecycle")).toMatchObject({ action: "update", skill: "recovering-failed-exact-match-edits" });
    const boxscore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(boxscore).toMatch(/SKILLS · \d+ active · 0 proven/);
    expect(boxscore).not.toContain("ROSTER");
  } finally {
    dispose();
  }
});

test("retirement becomes an earned roster move in the same append-only ledger", async () => {
  const retiredDir = join(GLOBAL_SKILLS_DIR, "retire-me");
  mkdirSync(retiredDir, { recursive: true });
  writeFileSync(join(retiredDir, "SKILL.md"), `---
name: retire-me
description: Use when testing reversible retirement after repeated negative evidence.
---

## Procedure
1. Review the evidence.
2. Retire only after the threshold is met.

<!-- muscle-memory provenance: test fixture -->
`);
  const dispose = startMod();
  try {
    const writeTool = tools.get("muscle_memory_skill_write");
    const readTool = tools.get("muscle_memory_skill_read");
    const retired = String(await writeTool.run({
      args: { action: "retire", name: "retire-me", reason: "three harmful verified possessions" },
    }));
    expect(retired).toContain("Retired 'retire-me'");
    expect(loadPossessionEvents().find((event) => event.type === "lifecycle")).toMatchObject({ action: "retire", skill: "retire-me" });
    const boxscore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    const retiredActive = Number(boxscore.match(/SKILLS · (\d+) active · 0 proven/)?.[1]);
    expect(Number.isFinite(retiredActive)).toBe(true);
    expect(boxscore).not.toContain("ROSTER");
    const restored = String(await writeTool.run({ args: { action: "restore", name: "retire-me" } }));
    expect(restored).toContain("Restored 'retire-me'");
    expect(loadPossessionEvents().filter((event) => event.type === "lifecycle").at(-1)).toMatchObject({ action: "restore", skill: "retire-me" });
    const restoredScore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    const restoredActive = Number(restoredScore.match(/SKILLS · (\d+) active · 0 proven/)?.[1]);
    expect(restoredActive).toBe(retiredActive + 1);
  } finally {
    dispose();
  }
});

test("neutral and harmful closeouts update the tape without emitting a fake earned-minute beat", async () => {
  const dispose = startMod();
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const outcomeTool = tools.get("record_agent_possession");

    await readTool.run({ args: { action: "prescribe", gap_observed: true, task: "exact-match edit failed because the target text was stale", task_class: "neutral-edit", difficulty: "standard" }, model: "gpt-5.6-sol" });
    const neutralDecision = loadPossessionEvents().filter((event) => event.type === "decision").at(-1)!;
    await outcomeTool.run({ args: { possession_id: neutralDecision.possession_id, result: "neutral", evidence_tier: "agent_judged", reason: "the procedure neither helped nor harmed" } });
    expect(readUiState()).toMatchObject({ phase: "idle", last: "" });

    await readTool.run({ args: { action: "prescribe", gap_observed: true, task: "exact string replacement missed the intended stale target", task_class: "harmful-edit", difficulty: "standard" }, model: "gpt-5.6-sol" });
    const harmedDecision = loadPossessionEvents().filter((event) => event.type === "decision").at(-1)!;
    await outcomeTool.run({ args: { possession_id: harmedDecision.possession_id, result: "harmed", evidence_tier: "human_judged", reason: "the prescribed procedure made the task worse" } });
    expect(readUiState()).toMatchObject({ phase: "idle", last: "" });

    const boxscore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(boxscore).toContain("INTERVENTIONS · 2 served · 0 helped · 1 harmed · 1 neutral");
    expect(boxscore).toContain("STATUS · early judged evidence · 0 verified · not claim-bearing");
    expect(boxscore).not.toContain("GOOD DECISIONS");
  } finally {
    dispose();
  }
});

test("agent-facing correction binds the exact active outcome through supersession", async () => {
  const dispose = startMod();
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const outcomeTool = tools.get("record_agent_possession");
    await readTool.run({ args: { action: "prescribe", gap_observed: true, task: "exact-match file edit failed because target text was stale", task_class: "stale-exact-edit", difficulty: "standard" }, model: "gpt-5.6-sol" });
    const decision = loadPossessionEvents().find((event) => event.type === "decision")!;
    expect(decision).toMatchObject({ action: "prescribe", route: "matched" });
    const first = String(await outcomeTool.run({ args: { possession_id: decision.possession_id, result: "helped", evidence_tier: "agent_judged", reason: "initial judgment" } }));
    const active = loadPossessionEvents().filter((event) => event.type === "outcome").at(-1)!;
    expect(first).toContain(active.event_id);

    const blocked = String(await outcomeTool.run({ args: { possession_id: decision.possession_id, result: "harmed", evidence_tier: "human_judged", reason: "human correction" } }));
    expect(blocked).toContain(`correction requires supersedes_event_id='${active.event_id}'`);

    const corrected = String(await outcomeTool.run({ args: { possession_id: decision.possession_id, result: "harmed", evidence_tier: "human_judged", reason: "human correction", supersedes_event_id: active.event_id } }));
    expect(corrected).toContain(`superseded ${active.event_id}`);
    expect(readUiState()).toMatchObject({ phase: "idle", last: "" });
    const boxscore = String(await readTool.run({ args: { action: "boxscore" }, agent: { name: "Kev" } }));
    expect(boxscore).toContain("INTERVENTIONS · 1 served · 0 helped · 1 harmed");
  } finally {
    dispose();
  }
});

test("outcome tool rejects incompatible results instead of scoring nonsense", async () => {
  const dispose = startMod();
  try {
    const readTool = tools.get("muscle_memory_skill_read");
    const outcomeTool = tools.get("record_agent_possession");
    await readTool.run({
      args: { action: "prescribe", gap_observed: false, task: "known", task_class: "known-procedure" },
      model: "gpt-5.6-sol",
    });
    const decision = loadPossessionEvents().find((event) => event.type === "decision");
    const output = String(await outcomeTool.run({
      args: {
        possession_id: decision!.possession_id,
        result: "helped",
        evidence_tier: "agent_judged",
        reason: "invalid because abstentions need an unaided outcome",
      },
    }));
    expect(output).toContain("not recorded");
    expect(loadPossessionEvents().filter((event) => event.type === "outcome")).toHaveLength(0);
  } finally {
    dispose();
  }
});
