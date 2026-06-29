// muscle-memory · review-runtime tests — OPT-IN cheap-model fork routing + digest (mirrors Hermes's
// auxiliary.background_review). Pure config resolver + digest compaction; offline + deterministic.
import { test, expect } from "bun:test";
import { resolveReviewRuntime, digestEvidence } from "../mods/autopilot";

test("resolveReviewRuntime: NOT routed by default; routed to the cheap model when MM_REVIEW_MODEL is set", () => {
  expect(resolveReviewRuntime({}).routed).toBe(false);
  expect(resolveReviewRuntime({ MM_REVIEW_MODEL: "" }).routed).toBe(false);
  const rt = resolveReviewRuntime({ MM_REVIEW_MODEL: "anthropic/claude-haiku-4", MM_REVIEW_PROVIDER: "anthropic" });
  expect(rt.routed).toBe(true);
  expect(rt.model).toBe("anthropic/claude-haiku-4");
  expect(rt.provider).toBe("anthropic");
});

test("digestEvidence: short text is unchanged; long text becomes head+tail with an elision marker, bounded", () => {
  const short = "a".repeat(100);
  expect(digestEvidence(short, 4000)).toBe(short);

  const long = "H".repeat(3000) + "M".repeat(3000) + "T".repeat(3000); // 9000 chars
  const d = digestEvidence(long, 4000);
  expect(d.length).toBeLessThan(long.length);
  expect(d).toContain("elided");
  expect(d.startsWith("H")).toBe(true); // head preserved verbatim
  expect(d.endsWith("T")).toBe(true);   // tail preserved verbatim
});
