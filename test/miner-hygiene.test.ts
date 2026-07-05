// miner hygiene · synthetic-tape gate + shelf dedup — regression per observed defect class.
//
// Live observation (2026-07-05, dogfood box): the candidate miner counted MM's own reflex-suite
// nonce workflows (mmreflex<epoch-ms>, 11×) as top "durable experience" — the learner watching
// its own harness and calling it practice. Same contamination class that poisoned the SPM eval
// corpus. These tests pin the gate so the class stays dead.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Row } from "../mods/core";
import { detect, isSyntheticRow, NONCE_TOKEN_RE, SYNTHETIC_MARKER_RE } from "../mods/detect";
import { searchSkills } from "../mods/autopilot";

const R = (tool: string, tmpl: string, ok: boolean, extra: Partial<Row> = {}): Row =>
  ({ tool, tmpl, fp: `${tool}::${tmpl.slice(0, 24)}`, h: Math.random().toString(36).slice(2), ok, ...extra });

// The exact shape of the live contamination: a nonce command recurring across conversations.
const nonceRows = (cmd: string, times = 11): Row[] =>
  Array.from({ length: times }, (_, i) => R("Bash", `${cmd} --check`, i % 2 === 0, { conv: `c${i % 3}`, ts: 1000 + i }));

// A legit tape that is KNOWN to produce a candidate (mirrors detect.test.ts's repair fixture).
const legitRows: Row[] = [
  R("Bash", "python3 test.py", false, { conv: "a", ts: 1 }), R("Edit", "math.py", true, { conv: "a", ts: 2 }), R("Bash", "python3 test.py", true, { conv: "a", ts: 3 }),
  R("Bash", "node test.js", false, { conv: "b", ts: 4 }), R("Edit", "sum.js", true, { conv: "b", ts: 5 }), R("Bash", "node test.js", true, { conv: "b", ts: 6 }),
];

describe("synthetic-tape gate", () => {
  test("the EXACT live contamination — mmreflex<epoch-ms> recurring 11× — yields ZERO candidates", () => {
    const rows = nonceRows("mmreflex1783107000115");
    const d = detect(rows);
    expect(d.candidates.length).toBe(0);
    expect(d.templates.length).toBe(0);
    expect(d.rejectedSynthetic).toBe(rows.length);
  });

  test("class-level, not name-specific: ANY word fused to an epoch-ms nonce is filtered", () => {
    expect(NONCE_TOKEN_RE.test("spmdrill1783200000123 run")).toBe(true);
    expect(NONCE_TOKEN_RE.test("harness_case1791234567890")).toBe(true);
    const d = detect(nonceRows("spmdrill1783200000123"));
    expect(d.candidates.length).toBe(0);
  });

  test("MM's own harness markers are filtered: bench / canary / routing-eval / smoke", () => {
    for (const cmd of ["bun scripts/bench-rerank-live.ts agent mm-bench-99", "seed mm-canary-generic passage", "ls /tmp/mm-routing-eval-Xq2/skills", "mm-smoke-run step"]) {
      expect(isSyntheticRow(R("Bash", cmd, true))).toBe(true);
    }
  });

  test("INVARIANT: mixing synthetic rows into a legit tape changes NOTHING about the candidates", () => {
    const clean = detect(legitRows);
    const dirty = detect([...legitRows, ...nonceRows("mmreflex1783107000115"), ...nonceRows("spmdrill1783200000123", 7)]);
    expect(dirty.candidates).toEqual(clean.candidates);
    expect(dirty.templates).toEqual(clean.templates);
    expect(dirty.rejectedSynthetic).toBe(18);
    expect(clean.rejectedSynthetic).toBe(0);
  });

  test("legit tools/commands are NOT falsely flagged", () => {
    for (const [tool, tmpl] of [["Bash", "python3 -m pytest tests/"], ["Bash", "git commit -m <str>"], ["Edit", "src/routes.ts"], ["Bash", "npm run verify"], ["Bash", "kubectl rollout status deploy/api"]] as const) {
      expect(isSyntheticRow(R(tool, tmpl, true))).toBe(false);
    }
    // Known accepted tradeoff: epoch-ms-suffixed artifacts (app-1783107000115.log) ARE filtered —
    // a machine-minted timestamp never recurs across sessions, so it could never mature anyway.
    expect(SYNTHETIC_MARKER_RE.test("python3 -m pytest tests/")).toBe(false);
  });
});

describe("searchSkills shelf dedup", () => {
  test("a skill present on TWO shelves (agent + global) occupies ONE match slot, best score kept", () => {
    const mk = (desc: string) => {
      const dir = mkdtempSync(join(tmpdir(), "mm-dedup-"));
      mkdirSync(join(dir, "fixing-tsc-type-errors"), { recursive: true });
      writeFileSync(join(dir, "fixing-tsc-type-errors", "SKILL.md"), `---\nname: fixing-tsc-type-errors\ndescription: ${desc}\n---\n## Procedure\n1. Read the tsc diagnostic.`);
      return dir;
    };
    // Same name on both shelves; the richer description scores higher and must win the slot.
    const rich = mk("Use when tsc --noEmit reports type errors: read each diagnostic, fix source types, re-run tsc.");
    const poor = mk("Use when types break.");
    const out = searchSkills([poor, rich], "tsc --noEmit type errors diagnostic", 5);
    const hits = out.filter((m) => m.name === "fixing-tsc-type-errors");
    expect(hits.length).toBe(1);
    expect(hits[0].dir).toBe(rich);
  });
});
