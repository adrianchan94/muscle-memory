// v0.8 CLOSED LOOP — the referee's record drives lifecycle decisions. One test per nerve.
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = join(tmpdir(), `mm-loop-${Date.now()}`);
process.env.MM_STATE_DIR = STATE;
process.env.MM_GLOBAL_SKILLS_DIR = join(STATE, "global");
mkdirSync(process.env.MM_GLOBAL_SKILLS_DIR, { recursive: true });

const { MM_TAG, STATE_DIR } = await import("../mods/core");
const { PLUSMINUS_PATH } = await import("../mods/referee");
const { tenureFor, runAutonomousPrune, setPinned } = await import("../mods/lifecycle");
const { runFilmRoom } = await import("../mods/filmroom");

function ledger(o: Record<string, { plus: number; minus: number }>) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(PLUSMINUS_PATH, JSON.stringify(Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, { ...v, lastTs: Date.now(), lastStepId: null }]))));
}
function usage(o: Record<string, any>) {
  writeFileSync(join(STATE_DIR, "skill-usage.json"), JSON.stringify(o));
}
function skillOnShelf(dir: string, name: string, opts: { managed?: boolean } = {}) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when demo.\n---\n## Procedure\n1. x.\n${opts.managed === false ? "" : MM_TAG}\n`);
}

describe("vault tenure ladder (tenureFor)", () => {
  test("referee record EARNS tenure; pinned outranks; labile default", () => {
    ledger({ "earner": { plus: 4, minus: 1 }, "rookie": { plus: 1, minus: 0 } });
    usage({ "vet": { uses: 12 }, "pinned-one": { pinned: true } });
    expect(tenureFor("earner")).toBe("tenured");   // net +3 via referee
    expect(tenureFor("vet")).toBe("tenured");      // 12 real uses
    expect(tenureFor("rookie")).toBe("labile");    // net +1 — not yet
    expect(tenureFor("pinned-one")).toBe("pinned");
    expect(tenureFor("nobody")).toBe("labile");
  });
});

describe("referee-weighted autonomous prune", () => {
  test("NEGATIVE record retires a skill even WITH uses; POSITIVE record protects a 0-uses skill; null = legacy rules; pinned immune", () => {
    const shelf = join(STATE, "agent-shelf", "skills");
    mkdirSync(shelf, { recursive: true });
    for (const n of ["hurting", "earning", "stale-null", "pinned-bad"]) skillOnShelf(shelf, n);
    const old = Date.now() - 40 * 86400000;
    usage({
      "hurting":   { uses: 5, created: old, lastActivity: Date.now() },
      "earning":   { uses: 0, created: old },
      "stale-null":{ uses: 0, created: old },
      "pinned-bad":{ uses: 0, created: old, pinned: true },
    });
    ledger({ "hurting": { plus: 0, minus: 3 }, "earning": { plus: 2, minus: 0 }, "pinned-bad": { plus: 0, minus: 9 } });
    const ctx = { agent: { id: "test" }, cwd: STATE, __shelves: [shelf] };
    // autonomousShelves(ctx) resolves agent dirs — inject via env override used by core.agentSkillsDir
    process.env.MEMORY_DIR = join(STATE, "agent-shelf");
    const r = runAutonomousPrune(ctx, { maxRetire: 5 });
    expect(r.retired).toContain("hurting");        // net -3 → benched despite 5 uses
    expect(r.retired).toContain("stale-null");     // legacy 0-uses/40d rule still works
    expect(r.retired).not.toContain("earning");    // net +2 → minutes EARNED, protected
    expect(r.retired).not.toContain("pinned-bad"); // pinned immune even at net -9 (human fiat)
    expect(r.kept).toContain("earning");
  });
});

describe("film room judge-confirm", () => {
  test("lexical miss + judge YES → patched; judge NO → parked", async () => {
    const dir = join(tmpdir(), `mm-fr-judge-${Date.now()}`);
    skillOnShelf(dir, "zz-target-skill");
    const note = JSON.stringify([{ skill: "zz-target-skill", section: "Pitfalls", op: "append", lines: "- watch the epoch offset (TELL: hours off by 7)", evidence_ref: "r1" }]);
    const yes = async () => ({ same_job: true, confidence: 0.9 });
    const no = async () => ({ same_job: false, confidence: 0.95 });
    const r1 = await runFilmRoom({ summary: "totally unrelated words here", dirs: [dir], authorFn: async () => note, judgeFn: yes, enabled: "staged" });
    expect(r1.patched.length).toBe(1);
    const r2 = await runFilmRoom({ summary: "totally unrelated words here", dirs: [dir], authorFn: async () => note, judgeFn: no, enabled: "staged" });
    expect(r2.parked.length).toBe(1);
  });
});
