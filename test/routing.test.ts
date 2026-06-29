// muscle-memory · routing integration test — proves the OPT-IN semantic layer surfaces a skill the LEXICAL
// router misses, so update-first routes to it instead of authoring a near-duplicate (the L1 lever),
// end-to-end through routeMatches + pickUpdateTarget against real SKILL.md files on disk. Offline: the
// semantic ranking is injected as a stub (no network), exactly what the live embedding backend would return.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeMatches, pickUpdateTarget } from "../mods/autopilot";

function putSkill(dir: string, name: string, description: string, body: string): void {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
}

test("routeMatches: semantic surfaces a lexically-missed skill → update-first routes to it (no duplicate)", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-route-"));
  putSkill(dir, "handling-flaky-network-timeouts", "Use when requests intermittently time out — add retry with exponential backoff.", "## Procedure\n1. Wrap the call in retry-with-backoff and cap attempts.");
  putSkill(dir, "exporting-reports-to-pdf", "Use when rendering a report document to a PDF file.", "## Procedure\n1. Render the report to PDF.");

  // A query whose wording shares no distinctive tokens with the network skill's name/description.
  const query = "sporadic socket hangups when calling the upstream payments service";

  // Lexical-only: the network skill is not confidently routable (the gap semantics fills).
  const lexPick = pickUpdateTarget(routeMatches([dir], query, null), 18);
  expect(lexPick?.name).not.toBe("handling-flaky-network-timeouts");

  // With a high semantic similarity for the network skill (what the live embedder would return), update-first
  // now routes straight to it — and its description is hydrated from disk, not left empty.
  const semantic = routeMatches([dir], query, [{ name: "handling-flaky-network-timeouts", sim: 0.95 }]);
  const semPick = pickUpdateTarget(semantic, 18);
  expect(semPick?.name).toBe("handling-flaky-network-timeouts");
  const picked = semantic.find((m) => m.name === "handling-flaky-network-timeouts");
  expect(picked?.description).toContain("time out");
});
