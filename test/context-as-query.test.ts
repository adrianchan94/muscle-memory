import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { searchSkills, searchSkillsWithContext, stripModEcho, flattenContextText, distinctiveTerms, contextWeightAlpha, contextMatchedCap, contextCharCap } from "../mods/autopilot";

function shelf(skills: Array<{ name: string; description: string; body?: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), "mm-ctx-"));
  for (const s of skills) {
    mkdirSync(join(dir, s.name), { recursive: true });
    writeFileSync(join(dir, s.name, "SKILL.md"), `---\nname: ${s.name}\ndescription: ${s.description}\n---\n\n${s.body || ""}\n`);
  }
  return dir;
}

// The one contract that makes this shippable: OFF is byte-identical to what ships today.
describe("context-as-query: inert by default", () => {
  const dir = shelf([
    { name: "aligning-cairn-beacon-anchors", description: "Use when repairing a bracketed beacon payload in a panel" },
    { name: "folding-orbit-rows", description: "Use when folding ndjson rows into a canonical tabulation" },
  ]);
  test("empty context reproduces searchSkills exactly", () => {
    const q = "repair the bracketed beacon payload in the panel file";
    expect(searchSkillsWithContext([dir], q, "", 5)).toEqual(searchSkills([dir], q, 5));
  });
  test("alpha=0 reproduces searchSkills exactly even with rich context", () => {
    const q = "repair the bracketed beacon payload in the panel file";
    const ctx = "folding ndjson orbit rows into a canonical tabulation with an ordered projection policy";
    expect(searchSkillsWithContext([dir], q, ctx, 5, { alpha: 0 })).toEqual(searchSkills([dir], q, 5));
  });
});

describe("context-as-query: safety invariants", () => {
  const dir = shelf([
    { name: "reconciling-lilac-basin-locks", description: "Use when reconciling component version ranges into a lock file" },
    { name: "aligning-cairn-beacon-anchors", description: "Use when repairing a bracketed beacon payload in a panel" },
  ]);

  // I1 — context cannot conjure a candidate the agent's own words never reached.
  test("I1: a skill with zero agent-query overlap never enters the candidate set", () => {
    const out = searchSkillsWithContext([dir], "quantum flux capacitor calibration", "reconciling lilac basin locks version ranges lock file", 5, { alpha: 1 });
    expect(out.map((o) => o.name)).not.toContain("reconciling-lilac-basin-locks");
    expect(out).toHaveLength(0);
  });

  // I3 — with SEARCH_DISTINCT_MIN=3 and matchedCap=2, at least one distinctive term is always the agent's own.
  test("I3: context adds at most matchedCap to the distinctive `matched` count", () => {
    const q = "reconciling ranges";
    const ctx = "lilac basin locks component version lock file ranges resolved";
    const capped = searchSkillsWithContext([dir], q, ctx, 5, { alpha: 1, matchedCap: 2 });
    const uncapped = searchSkillsWithContext([dir], q, ctx, 5, { alpha: 1, matchedCap: 999 });
    const base = searchSkills([dir], q, 5).find((m) => m.name === "reconciling-lilac-basin-locks")!;
    const c = capped.find((m) => m.name === "reconciling-lilac-basin-locks")!;
    const u = uncapped.find((m) => m.name === "reconciling-lilac-basin-locks")!;
    expect(c.matched - base.matched).toBeLessThanOrEqual(2);
    expect(u.matched).toBeGreaterThanOrEqual(c.matched);
  });

  // I2 — down-weighting is real, and monotone in alpha.
  test("I2: context score contribution scales with alpha", () => {
    const q = "reconciling ranges";
    const ctx = "lilac basin locks resolved lock file";
    const pick = (a: number) => searchSkillsWithContext([dir], q, ctx, 5, { alpha: a }).find((m) => m.name === "reconciling-lilac-basin-locks")!.score;
    expect(pick(0.25)).toBeLessThan(pick(1));
    expect(pick(0)).toBeLessThan(pick(0.25));
  });

  // I4 — the cap keeps the TAIL, because the most recent text is the task at hand.
  test("I4: context is capped and the tail is what survives", () => {
    const q = "reconciling ranges";
    const head = "x".repeat(3000);
    const out = searchSkillsWithContext([dir], q, head + " lilac basin locks", 5, { alpha: 1, cap: 200 });
    const none = searchSkillsWithContext([dir], q, "lilac basin locks " + head, 5, { alpha: 1, cap: 200 });
    expect(out[0].score).toBeGreaterThan(none[0].score);
  });
});

// RED TEAM (L2/S3): the mod's own ABSTAIN output prints `Closest: 1. <skill-name>`. Feeding that back
// in as context flipped 11 of 12 correct abstentions into false prescriptions. A retrieval system that
// reads its own past output is measuring itself, not the task.
describe("context-as-query: the router must not read its own output", () => {
  test("stripModEcho removes decision lines and the enumerated Closest block", () => {
    const echo = [
      "let me check the shelf",
      'ABSTAIN — no installed skill cleared the safe-match gate.',
      "",
      "Closest:",
      "1. aligning-cairn-beacon-anchors — strongest; 2 distinctive terms",
      "2. reconciling-lilac-basin-locks — close neighbor; 1 distinctive term",
      "",
      "Next: continue unaided, or inspect one candidate without loading the full shelf.",
      "ok I will just do it by hand",
    ].join("\n");
    const clean = stripModEcho(echo);
    expect(clean).not.toContain("aligning-cairn-beacon-anchors");
    expect(clean).not.toContain("reconciling-lilac-basin-locks");
    expect(clean).not.toContain("ABSTAIN");
    expect(clean).toContain("ok I will just do it by hand");
  });

  test("PRESCRIBE echo lines are stripped too", () => {
    const echo = 'PRESCRIBE "folding-orbit-rows" — one smallest matching installed skill (score 30, 4 distinctive terms)\nNEXT · invoke the normal Skill tool with skill="folding-orbit-rows"\npossession: p-abc-1 · after the task\nreal user words here';
    const clean = stripModEcho(echo);
    expect(clean).not.toContain("folding-orbit-rows");
    expect(clean).toContain("real user words here");
  });
});

describe("context-as-query: context extraction", () => {
  test("flattenContextText reads text and thinking but NOT toolCall names/arguments", () => {
    const input = [
      { role: "user", content: [{ type: "text", text: "please repair the beacon payload" }] },
      { role: "assistant", content: [{ type: "thinking", thinking: "the panel file is the target" }, { type: "toolCall", name: "folding_orbit_rows_tool", arguments: { path: "canonical-tabulation.tsv" } }] },
    ];
    const out = flattenContextText(input);
    expect(out).toContain("repair the beacon payload");
    expect(out).toContain("the panel file is the target");
    expect(out).not.toContain("folding_orbit_rows_tool");
    expect(out).not.toContain("canonical-tabulation.tsv");
  });

  test("flattenContextText drops <system-reminder> harness scaffolding", () => {
    const input = [{ role: "user", content: [{ type: "text", text: '<system-reminder>task_class="anchor-repair-scope-reversal"</system-reminder>\nfold the rows' }] }];
    const out = flattenContextText(input);
    expect(out).not.toContain("anchor-repair-scope-reversal");
    expect(out).toContain("fold the rows");
  });

  test("flattenContextText keeps the TAIL when it must cut", () => {
    const out = flattenContextText([{ role: "user", content: "OLDEST " + "y".repeat(500) + " NEWEST" }], 40);
    expect(out).toContain("NEWEST");
    expect(out).not.toContain("OLDEST");
  });

  test("unknown shapes contribute nothing rather than JSON noise", () => {
    expect(flattenContextText([{ weird: { nested: 1 } }, null, 42])).toBe("");
  });

  test("distinctiveTerms uses the shipped stoplist and length floor", () => {
    const t = distinctiveTerms("the and for a beacon payload");
    expect(t).toContain("beacon");
    expect(t).toContain("payload");
    expect(t).not.toContain("the");
    expect(t).not.toContain("for");
  });
});

// The shipped defaults are measured, not chosen. alpha=1.0 (naive concat) halved the abstain control.
describe("context-as-query: shipped defaults are the measured ones", () => {
  test("alpha defaults to 0.25, matchedCap to 2, cap to 2000", () => {
    delete process.env.MM_CTX_ALPHA; delete process.env.MM_CTX_MATCHED_CAP; delete process.env.MM_CTX_CAP;
    expect(contextWeightAlpha()).toBe(0.25);
    expect(contextMatchedCap()).toBe(2);
    expect(contextCharCap()).toBe(2000);
  });
  test("out-of-range env values fall back to the measured default, never to garbage", () => {
    process.env.MM_CTX_ALPHA = "9"; expect(contextWeightAlpha()).toBe(0.25);
    process.env.MM_CTX_ALPHA = "nonsense"; expect(contextWeightAlpha()).toBe(0.25);
    delete process.env.MM_CTX_ALPHA;
  });
});
