import { test, expect } from "bun:test";
import { applyNudge, applyNudgeEnabled } from "../mods/nudge";
// MEASURED 2026-08-09: 2 of 12 mm-on cells (airflow, SF03) reached their skill through the native
// `Skill` tool, not a Read — the body arrives as an injected user message. A Read-only hook missed
// both. This pins that the Skill path is in scope and still opt-out-able.
test("apply nudge covers the Skill-tool path and stays opt-out", () => {
  expect(applyNudgeEnabled({})).toBe(true);
  expect(applyNudgeEnabled({ MM_APPLY_NUDGE: "off" })).toBe(false);
  const out = applyNudge("migrating-airflow-2-to-3");
  expect(out).toContain("migrating-airflow-2-to-3");
  expect(out.toLowerCase()).toContain("apply");
});
