import { test, expect } from "bun:test";
import { applyNudge, applyNudgeEnabled } from "../mods/nudge";

// MEASURED 2026-08-09 on Skill-Use: Letta opens a skill with a plain Read of SKILL.md, which MM
// could not see (index.ts shelfConsulted only fired on tool==="Skill"). Letta then trailed Claude
// Code on content compliance by 0.33-0.46 on procedural tasks. These pin the contract.

test("applyNudge is ON by default and opt-out via MM_APPLY_NUDGE=off", () => {
  expect(applyNudgeEnabled({})).toBe(true);
  expect(applyNudgeEnabled({ MM_APPLY_NUDGE: "off" })).toBe(false);
  expect(applyNudgeEnabled({ MM_APPLY_NUDGE: "OFF" })).toBe(false);
  expect(applyNudgeEnabled({ MM_APPLY_NUDGE: "on" })).toBe(true);
});

test("applyNudge names the skill and frames it as APPLY, not review", () => {
  const out = applyNudge("football-data");
  expect(out).toContain("football-data");
  expect(out.toLowerCase()).toContain("apply");
  expect(out.toLowerCase()).toContain("not a document to review");
});

test("applyNudge states the three MEASURED failure modes", () => {
  const out = applyNudge("x").toLowerCase();
  expect(out).toContain("in order");        // step-order slip
  expect(out).toContain("hardcode");        // football: typed a literal season id
  expect(out).toContain("each one");        // compare_crypto: dropped judged frames
});

test("applyNudge permits declared deviation but forbids silent substitution", () => {
  const out = applyNudge("x").toLowerCase();
  expect(out).toContain("disagreeing");
  expect(out).toContain("silently");
});

test("applyNudge is robust to an empty or junk skill name", () => {
  expect(applyNudge("")).toContain("this skill");
  expect(applyNudge("   ")).toContain("this skill");
});

test("applyNudge is a single advisory string, not a tool directive", () => {
  const out = applyNudge("pdftk-server");
  expect(out.startsWith("[muscle-memory]")).toBe(true);
  expect(out).not.toContain("muscle_memory_prescribe");
});
