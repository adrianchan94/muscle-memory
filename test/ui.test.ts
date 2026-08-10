// muscle-memory · ui tests (split from the original suite).
// ENGRAM (v5) deterministic core tests — salience, synaptic tagging & capture,
// prediction-error reconsolidation, prioritized/reverse replay, interleaving.
// Pure functions only; no live model, no FS. Run: `bun test muscle-memory.engram.test.ts`.
import { test, expect } from "bun:test";
import { __mm } from "../mods/index";
import type { Row, Defense } from "../mods/index";
import { preserveExistingFrontmatterMetadata, isAmbiguousExistingRoute, compareSkillSections } from "../mods/index";
import { detect, detectRepairChains, draftWithRepair, isSkillWorthy } from "../mods/index";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join as _join } from "node:path";
import { readUiState, writeUiState } from "../mods/core";

const {
  tagExperience, predictionError, captureTagged, labileSkills, skillRetrieved,
  replayQueue, reverseReplay, interleave, ENGRAM,
} = __mm;

const T0 = 1_700_000_000_000;
const MIN = 60_000;

let seq = 0;
function R(tool: string, tmpl: string, ok: boolean | undefined, opts: { conv?: string; ts?: number; h?: string } = {}): Row {
  return { tool, tmpl, fp: tmpl, h: opts.h ?? tmpl, ok, ts: opts.ts ?? T0 + seq++ * 1000, conv: opts.conv ?? "c1" };
}

const fixDef: Defense = { trigger: "npm test", errClass: "exit-code-1", consequence: "", defense: "", severity: 2, count: 2, kind: "fix" };
const avoidDef: Defense = { trigger: "rm", errClass: "error", consequence: "", defense: "", severity: 2, count: 2, kind: "avoid" };

// ── prediction error (the reconsolidation trigger) ───────────────────────────
const skillBody = "## Observed pattern\n```text\nnpm test → edit → npm test\n```\n\n## Procedure\nrun the loop.\n";
const avoidHi: Defense = { trigger: "rm", errClass: "error", consequence: "", defense: "root-cause before retrying", severity: 3, count: 3, kind: "avoid" };
const fixHi: Defense = { trigger: "npm test", errClass: "exit-code-1", consequence: "", defense: "apply the fix", severity: 3, count: 3, kind: "fix" };
const { renderMuscleMemoryPanel } = __mm;
const { redactFragment, buildDiffFragment, buildCrossConversationEvidence } = __mm;

test("writeUiState replaces stale phase metadata with a complete fresh shape", () => {
  writeUiState({ phase: "checking", last: "old", skill: "systematic-debugging", route: "UPDATE", subject: "old subject", detail: "old detail" });
  writeUiState({ phase: "idle", last: "nothing to save" });
  const { ts, ...state } = readUiState();
  expect(Number.isFinite(ts)).toBe(true);
  expect(state).toEqual({ phase: "idle", last: "nothing to save", skill: "", route: "", subject: "", detail: "" });
});

test("renderMuscleMemoryPanel: resting line shows library size and helped lifecycle density", () => {
  process.env.MM_REFLECT = "auto";
  expect(renderMuscleMemoryPanel({ roster: { total: 12, helped: 4, proven: 9 } })).toEqual([
    "💾 muscle-memory · 12 skills · 4 helped · 9 proven",
  ]);
  expect(renderMuscleMemoryPanel({ roster: { total: 10, helped: 2, proven: 9 } })).toEqual([
    "💾 muscle-memory · 10 skills · 2 helped · 9 proven",
  ]);
  expect(renderMuscleMemoryPanel({})).toEqual([
    "💾 muscle-memory · 0 skills · 0 helped",
  ]);
  // Mode + last-action prose must stay out of resting (camera quiet).
  // Fresh / unproven seats still show 0 helped so 0→1 movement is visible; proven stays omitted at 0.
  expect(renderMuscleMemoryPanel({
    phase: "idle",
    last: "already reflected create for this evidence signature",
    roster: { total: 16, helped: 0, proven: 0 },
  })).toEqual([
    "💾 muscle-memory · 16 skills · 0 helped",
  ]);
  // Unwritten decorative phases must not invent chrome — collapse to rest.
  expect(renderMuscleMemoryPanel({ phase: "prescribing", ts: Date.now(), roster: { total: 16, helped: 0, proven: 0 } })[0]).toBe("💾 muscle-memory · 16 skills · 0 helped");
  expect(renderMuscleMemoryPanel({ phase: "invoked", ts: Date.now(), roster: { total: 16, helped: 0, proven: 0 } })[0]).toBe("💾 muscle-memory · 16 skills · 0 helped");
});

test("renderMuscleMemoryPanel: in-progress phases reveal the lifecycle without leaking router prose", () => {
  process.env.MM_REFLECT = "auto";
  const now = Date.now();
  expect(renderMuscleMemoryPanel({ phase: "reviewing", detail: "882 sessions / 66 signals", ts: now })[0]).toBe("💾 muscle-memory · learning from recent work · 882 sessions / 66 signals");
  expect(renderMuscleMemoryPanel({ phase: "shaping", skill: "", last: "already reflected create for this evidence signature", route: "CREATE", ts: now })[0]).toBe("💾 muscle-memory · writing a new skill…");
  expect(renderMuscleMemoryPanel({ phase: "shaping", skill: "systematic-debugging", route: "UPDATE → systematic-debugging", ts: now })[0]).toBe("💾 muscle-memory · rewriting skill: systematic-debugging…");
  expect(renderMuscleMemoryPanel({ phase: "checking", skill: "", route: "CREATE (new skill)", ts: now })[0]).toBe("💾 muscle-memory · checking the roster for a new skill…");
  expect(renderMuscleMemoryPanel({ phase: "checking", skill: "systematic-debugging", route: "UPDATE → systematic-debugging", ts: now })[0]).toBe("💾 muscle-memory · checking skill: systematic-debugging…");
  expect(renderMuscleMemoryPanel({ phase: "saving", skill: "systematic-debugging", route: "CREATE", ts: now })[0]).toBe("💾 muscle-memory · saving skill: systematic-debugging…");
  expect(renderMuscleMemoryPanel({ phase: "saving", skill: "systematic-debugging", route: "UPDATE", ts: now })[0]).toBe("💾 muscle-memory · saving skill update: systematic-debugging…");
  expect(renderMuscleMemoryPanel({ phase: "testing", skill: "systematic-debugging", ts: now })[0]).toBe("💾 muscle-memory · testing skill: systematic-debugging…");
});

test("renderMuscleMemoryPanel: terminal beats reward outcomes and expire back to the library", () => {
  process.env.MM_REFLECT = "auto";
  const now = Date.now();
  const field = {
    "systematic-debugging": { plus: 3, minus: 0 },
    "noisy-old-skill": { plus: 1, minus: 4 },
  };
  expect(renderMuscleMemoryPanel({ phase: "earned", skill: "systematic-debugging", field, roster: { total: 12, helped: 3, proven: 8, provenNames: [] }, ts: now })[0]).toBe("💾 muscle-memory · ✓ skill helped · systematic-debugging (helped 3 · missed 0)");
  expect(renderMuscleMemoryPanel({ phase: "earned", skill: "systematic-debugging", field, roster: { total: 12, helped: 3, proven: 9, provenNames: ["systematic-debugging"] }, ts: now })[0]).toBe("💾 muscle-memory · ★ skill proven · systematic-debugging (helped 3 · missed 0)");
  expect(renderMuscleMemoryPanel({ phase: "earned", last: "smart restraint", ts: now })[0]).toBe("💾 muscle-memory · ✓ no skill needed · task completed");
  expect(renderMuscleMemoryPanel({ phase: "learned", skill: "systematic-debugging", field, ts: now })[0]).toBe("💾 muscle-memory · ✓ skill learned · systematic-debugging (helped 3 · missed 0)");
  expect(renderMuscleMemoryPanel({ phase: "updated", skill: "systematic-debugging", field, ts: now })[0]).toBe("💾 muscle-memory · ✓ skill improved · systematic-debugging (helped 3 · missed 0)");
  expect(renderMuscleMemoryPanel({ phase: "rotation", skill: "systematic-debugging", field, ts: now })[0]).toBe("💾 muscle-memory · ★ skill promoted · systematic-debugging (helped 3 · missed 0)");
  expect(renderMuscleMemoryPanel({ phase: "benched", skill: "noisy-old-skill", field, ts: now })[0]).toBe("💾 muscle-memory · ↓ skill retired · noisy-old-skill (helped 1 · missed 4)");
  expect(renderMuscleMemoryPanel({ phase: "learned", skill: "systematic-debugging", ts: now - 12_001, roster: { total: 12, helped: 3, proven: 9 } })[0]).toBe("💾 muscle-memory · 12 skills · 3 helped · 9 proven");
  expect(renderMuscleMemoryPanel({ phase: "learned", skill: "systematic-debugging", ts: now - 12_001, roster: { total: 1, helped: 1, proven: 0 } })[0]).toBe("💾 muscle-memory · 1 skill · 1 helped");
});

test("renderMuscleMemoryPanel: alarms persist while normal rejection is silent", () => {
  process.env.MM_REFLECT = "auto";
  const stale = Date.now() - 86_400_000;
  expect(renderMuscleMemoryPanel({ phase: "protected", subject: "unsafe content", ts: stale })[0]).toBe("💾 muscle-memory · 🛡️ blocked unsafe content");
  // `blocked` has no writeUiState writer (source uses `protected`); must not paint fake chrome.
  expect(renderMuscleMemoryPanel({ phase: "blocked", subject: "gate G7", ts: stale, roster: { total: 12, helped: 3, proven: 9 } })[0]).toBe("💾 muscle-memory · 12 skills · 3 helped · 9 proven");
  expect(renderMuscleMemoryPanel({ phase: "idle", last: "draft rejected; nothing saved", ts: Date.now(), roster: { total: 12, helped: 3, proven: 9 } })[0]).toBe("💾 muscle-memory · 12 skills · 3 helped · 9 proven");
});

test("renderMuscleMemoryPanel: hidden when off+idle, ready when armed", () => {
  process.env.MM_REFLECT = "off";
  expect(renderMuscleMemoryPanel({})).toEqual([]);
  process.env.MM_REFLECT = "auto";
  expect(renderMuscleMemoryPanel({})[0]).toContain("skills");
  expect(renderMuscleMemoryPanel({})[0]).not.toContain("ready");
  expect(renderMuscleMemoryPanel({})[0]).not.toContain("auto");
  delete process.env.MM_REFLECT;
});

// ── SOTA leap: skill-worthiness gate (reject noise) + class-generalized repairs (learn the lesson) ──
