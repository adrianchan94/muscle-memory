import { test, expect } from "bun:test";
// REGRESSION 2026-08-09: applyNudge shipped REPLACING the Read output. The agent lost the skill body
// on first read, burned a turn re-reading, and the contract never sat adjacent to the body. My e2e
// test asked "did the nudge appear" and passed. It never asked "did the file body survive".
test("apply nudge must APPEND to the tool output, never replace it", () => {
  const body = "---\nname: football-data\n---\n1. Derive season_id.\n2. Never hardcode it.";
  const { applyNudge } = require("../mods/nudge");
  const combined = body + "\n\n" + applyNudge("football-data");
  expect(combined).toContain("Never hardcode it.");     // the BODY survives
  expect(combined).toContain("[muscle-memory]");        // the contract is there too
  expect(combined.indexOf("[muscle-memory]")).toBeGreaterThan(combined.indexOf("name: football-data"));
});
