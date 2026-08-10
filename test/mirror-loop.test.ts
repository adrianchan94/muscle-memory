import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** THE MIRROR LOOP. MM's per-model `negative-field` gate already refuses to prescribe a skill that
 * has hurt THIS model, but it only ever learned from explicit ratings — so an observed failure
 * taught it nothing. Motivation (rc6, 3 models x 4 families, sha256 oracle): the same skill took
 * gpt-5.6-luna 0%->100% and claude-sonnet-5 100%->75%. Effects flip sign per model. */
test("an observed Skill failure becomes per-model negative field evidence, and is idempotent", async () => {
  const root = mkdtempSync(join(tmpdir(), "mm-mirror-"));
  process.env.MM_STATE_DIR = join(root, "state");
  mkdirSync(process.env.MM_STATE_DIR, { recursive: true });

  const ref = await import("../mods/referee.ts");

  const wrote = ref.recordObservedSkillFailure({
    skill: "folding-sable-orbit-rows", model: "claude-sonnet-5", provider: "anthropic",
    agent: "a1", toolCallId: "call-1", detail: "nonzero_exit",
  });
  expect(wrote).toBe(true);

  const evs = ref.loadRatingEvents().filter((e: any) => e.skill === "folding-sable-orbit-rows");
  expect(evs.length).toBe(1);
  expect(evs[0].rating).toBe("down");
  expect(evs[0].model).toBe("claude-sonnet-5");
  expect(evs[0].rater).toBe("instrument");
  expect(evs[0].source).toBe("tool_end");

  // Idempotent on the same tool call — a re-fired handler must not double-count.
  expect(ref.recordObservedSkillFailure({
    skill: "folding-sable-orbit-rows", model: "claude-sonnet-5", toolCallId: "call-1",
  })).toBe(false);
  expect(ref.loadRatingEvents().filter((e: any) => e.skill === "folding-sable-orbit-rows").length).toBe(1);

  // A distinct tool call DOES count.
  expect(ref.recordObservedSkillFailure({
    skill: "folding-sable-orbit-rows", model: "claude-sonnet-5", toolCallId: "call-2",
  })).toBe(true);

  // An unknown model must never poison the shared pool — the evidence is per-model by design.
  expect(ref.recordObservedSkillFailure({
    skill: "folding-sable-orbit-rows", model: "unknown", toolCallId: "call-3",
  })).toBe(false);

  // Evidence is keyed on model: a DIFFERENT model's harm must not implicate this one.
  expect(ref.recordObservedSkillFailure({
    skill: "folding-sable-orbit-rows", model: "gpt-5.6-luna", toolCallId: "call-4",
  })).toBe(true);
  const byModel = ref.loadRatingEvents().filter((e: any) => e.skill === "folding-sable-orbit-rows");
  expect(byModel.filter((e: any) => e.model === "claude-sonnet-5").length).toBe(2);
  expect(byModel.filter((e: any) => e.model === "gpt-5.6-luna").length).toBe(1);
});
