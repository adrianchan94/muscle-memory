// muscle-memory · wins-ledger tests — the visible-value surface must be receipt-honest.
//
// CONTRACT this suite defends: collectWins is deterministic arithmetic over receipt files
// in an injectable state dir (never throws on torn/corrupt inputs, only counts what a
// receipt backs), and renderWins never claims a win the Wins object doesn't carry.
// Run: `bun test test/wins.test.ts`
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectWins, renderWins, ago, type Wins } from "../mods/wins";

const T0 = 1_700_000_000_000;

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), "mm-wins-"));
}

function jsonl(rows: unknown[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

/** A fully-populated state dir exercising every input the ledger reads. */
function fullFixture(): string {
  const dir = freshDir();
  // 4 reps across 2 convs; earliest ts (T0) is NOT the first line → firstRepTs must be the min, not line order.
  writeFileSync(join(dir, "experience.jsonl"), jsonl([
    { conv: "c1", ts: T0 + 5_000 },
    { conv: "c1", ts: T0 },
    { conv: "c2", ts: T0 + 2_000 },
    { conv: "c2", ts: T0 + 9_000 },
  ]));
  // sessions = union of sessions.jsonl convs and experience convs: {c1,c2,c3}.
  writeFileSync(join(dir, "sessions.jsonl"), jsonl([{ conv: "c1" }, { conv: "c3" }]));
  // Reflect receipts: staged create (oldest), graduated create (newest), one update.
  mkdirSync(join(dir, "receipts"));
  writeFileSync(join(dir, "receipts", `reflect-${T0 + 60_000}.json`),
    JSON.stringify({ action: "create", name: "staged-skill", dir: "/x/staged/foo", ts: T0 + 60_000 }));
  writeFileSync(join(dir, "receipts", `reflect-${T0 + 120_000}.json`),
    JSON.stringify({ action: "create", name: "grad-skill", dir: "/x/skills/bar", ts: T0 + 120_000 }));
  writeFileSync(join(dir, "receipts", `reflect-${T0 + 90_000}.json`),
    JSON.stringify({ action: "update", name: "folded-lesson", dir: "/x/skills/baz", ts: T0 + 90_000 }));
  // Defense hits: one fix, one avoid; the avoid is newest → it is lastFlag.
  writeFileSync(join(dir, "defense-hits.jsonl"), jsonl([
    { ts: T0 + 10_000, step: "run_bash", kind: "fix", errClass: "ENOENT", defense: "use absolute path" },
    { ts: T0 + 20_000, step: "edit_file", kind: "avoid", errClass: "EPERM", defense: "skip readonly file" },
  ]));
  // One counted noise event; the second row has a matching summary but the WRONG phase → ignored.
  writeFileSync(join(dir, "ui-events.jsonl"), jsonl([
    { phase: "noise_rejected", summary: "rejected 3 env-noise items" },
    { phase: "skill_created", summary: "rejected 9 red herrings" },
  ]));
  // 6 nonzero entries (cap is 5) + one zero-uses entry that must be filtered out.
  writeFileSync(join(dir, "skill-usage.json"), JSON.stringify({
    alpha: { uses: 1 }, beta: { uses: 7 }, gamma: { uses: 3 },
    delta: { uses: 5 }, epsilon: { uses: 2 }, zeta: { uses: 9 }, unused: { uses: 0 },
  }));
  return dir;
}

// ── collectWins · zero state ────────────────────────────────────────────────────────────────

test("collectWins on an empty state dir is all zeros/null/empty, and renders the no-reps line", () => {
  const w = collectWins(freshDir());
  expect(w).toEqual({
    reps: 0, sessions: 0, firstRepTs: null,
    skillsEarned: [], updatesFolded: [],
    repeatsFlagged: 0, knownFixSurfaced: 0, lastFlag: null,
    noiseRejected: 0, skillUses: [], timeToFirstSkillMs: null,
  });
  expect(renderWins(w, T0)).toContain("no reps observed yet");
});

// ── collectWins · full fixture ──────────────────────────────────────────────────────────────

test("reps/sessions/firstRepTs: counts rows, unions sessions.jsonl with experience convs, min ts wins", () => {
  const w = collectWins(fullFixture());
  expect(w.reps).toBe(4);
  expect(w.sessions).toBe(3); // c1, c2 (experience) ∪ c3 (sessions.jsonl); c1 not double-counted
  expect(w.firstRepTs).toBe(T0); // the min ts, even though it is not the first line
});

test("reflect receipts: creates → skillsEarned newest-first with graduated flags, updates → updatesFolded", () => {
  const w = collectWins(fullFixture());
  expect(w.skillsEarned).toEqual([
    { name: "grad-skill", action: "create", graduated: true, ts: T0 + 120_000 },
    { name: "staged-skill", action: "create", graduated: false, ts: T0 + 60_000 },
  ]);
  expect(w.updatesFolded).toEqual([
    { name: "folded-lesson", action: "update", graduated: true, ts: T0 + 90_000 },
  ]);
});

test("defense hits: repeatsFlagged counts all, knownFixSurfaced counts kind:fix, lastFlag is newest by ts", () => {
  const w = collectWins(fullFixture());
  expect(w.repeatsFlagged).toBe(2);
  expect(w.knownFixSurfaced).toBe(1);
  expect(w.lastFlag).toEqual({ step: "edit_file", errClass: "EPERM", defense: "skip readonly file", ts: T0 + 20_000 });
});

test("ui-events: only noise_rejected rows count, and the rejected-N summary contributes N", () => {
  const w = collectWins(fullFixture());
  expect(w.noiseRejected).toBe(3); // the phase:"skill_created" row with a matching summary is ignored
});

test("skill-usage: sorted by uses desc, zero-use entries dropped, capped at top 5", () => {
  const w = collectWins(fullFixture());
  expect(w.skillUses).toEqual([
    { name: "zeta", uses: 9 },
    { name: "beta", uses: 7 },
    { name: "delta", uses: 5 },
    { name: "gamma", uses: 3 },
    { name: "epsilon", uses: 2 },
  ]); // "alpha" (1 use) cut by the cap, "unused" (0) filtered
});

test("timeToFirstSkillMs = oldest create ts − first rep ts", () => {
  const w = collectWins(fullFixture());
  expect(w.timeToFirstSkillMs).toBe(60_000); // staged-skill (T0+60s) is the oldest create; first rep at T0
});

test("timeToFirstSkillMs is null when the first create predates the first rep (inverted ordering)", () => {
  const dir = freshDir();
  writeFileSync(join(dir, "experience.jsonl"), jsonl([{ conv: "c1", ts: T0 }]));
  mkdirSync(join(dir, "receipts"));
  writeFileSync(join(dir, "receipts", `reflect-${T0 - 5_000}.json`),
    JSON.stringify({ action: "create", name: "early-bird", dir: "/x/skills/e", ts: T0 - 5_000 }));
  const w = collectWins(dir);
  expect(w.skillsEarned).toHaveLength(1); // the create itself still counts as a win
  expect(w.timeToFirstSkillMs).toBeNull(); // but a negative span must never be reported
});

// ── collectWins · torn/corrupt inputs are skipped, never thrown ─────────────────────────────

test("torn jsonl lines, a corrupt receipt, and a corrupt usage sidecar are skipped — valid rows still count", () => {
  const dir = freshDir();
  const TORN = '{"conv":"c9","ts":'; // truncated mid-object
  writeFileSync(join(dir, "experience.jsonl"), jsonl([{ conv: "c1", ts: T0 }]) + TORN + "\n");
  writeFileSync(join(dir, "sessions.jsonl"), jsonl([{ conv: "s1" }]) + TORN + "\n");
  writeFileSync(join(dir, "defense-hits.jsonl"),
    jsonl([{ ts: T0 + 1_000, step: "run_bash", kind: "fix", errClass: "ENOENT", defense: "d" }]) + TORN + "\n");
  writeFileSync(join(dir, "ui-events.jsonl"),
    jsonl([{ phase: "noise_rejected", summary: "rejected 2 env-noise items" }]) + TORN + "\n");
  mkdirSync(join(dir, "receipts"));
  writeFileSync(join(dir, "receipts", `reflect-${T0 + 30_000}.json`),
    JSON.stringify({ action: "create", name: "survivor", dir: "/x/staged/s", ts: T0 + 30_000 }));
  writeFileSync(join(dir, "receipts", `reflect-${T0 + 40_000}.json`), '{"action":"create","na'); // corrupt
  writeFileSync(join(dir, "receipts", `reflect-${T0 + 50_000}.json`),
    JSON.stringify({ action: "create", dir: "/x/skills/n", ts: T0 + 50_000 })); // nameless → skipped
  writeFileSync(join(dir, "receipts", "notes.txt"), "not a receipt at all"); // non-matching name → ignored
  writeFileSync(join(dir, "skill-usage.json"), "{not json");

  const w = collectWins(dir); // must not throw
  expect(w.reps).toBe(1);
  expect(w.sessions).toBe(2); // c1 (experience) ∪ s1 (sessions.jsonl)
  expect(w.repeatsFlagged).toBe(1);
  expect(w.knownFixSurfaced).toBe(1);
  expect(w.noiseRejected).toBe(2);
  expect(w.skillsEarned).toEqual([{ name: "survivor", action: "create", graduated: false, ts: T0 + 30_000 }]);
  expect(w.skillUses).toEqual([]);
});

// ── renderWins · every populated field surfaces, honestly ───────────────────────────────────

test("renderWins surfaces every populated win with the graduated/staged split and the receipts footer", () => {
  const NOW = T0 + 10 * 86_400_000;
  const w: Wins = {
    reps: 42, sessions: 2, firstRepTs: T0,
    skillsEarned: [
      { name: "grad-skill", action: "create", graduated: true, ts: NOW - 2 * 3_600_000 },
      { name: "staged-skill", action: "create", graduated: false, ts: NOW - 2 * 86_400_000 },
    ],
    updatesFolded: [{ name: "folded-lesson", action: "update", graduated: true, ts: NOW - 60_000 }],
    repeatsFlagged: 2, knownFixSurfaced: 1,
    lastFlag: { step: "run_bash", errClass: "ENOENT", defense: "use absolute path", ts: NOW - 5 * 60_000 },
    noiseRejected: 3,
    skillUses: [{ name: "grad-skill", uses: 8 }, { name: "staged-skill", uses: 2 }],
    timeToFirstSkillMs: 90 * 60_000,
  };
  const out = renderWins(w, NOW);
  expect(out).toContain("42 reps watched across 2 sessions");
  expect(out).toContain("2 skills earned from your own work (1 graduated, 1 staged)");
  expect(out).toContain("· grad-skill — 2h ago");
  expect(out).toContain("1 lesson folded into existing skills");
  expect(out).toContain("2 repeat-failures recognized before the tool ran (1 with a known fix on file)");
  expect(out).toContain("· last: run_bash → ENOENT (5m ago)");
  expect(out).toContain("invoked 10× — top: grad-skill (8×)");
  expect(out).toContain("3 env-noise items kept OUT of your skill library");
  expect(out).toContain("first rep → first earned skill: 2 hours");
  expect(out).toContain("every line above is backed by a receipt");
  expect(out).not.toContain("no reps observed yet");
  expect(out).not.toContain("patterns need ≥2 sessions");
});

test("renderWins with reps but nothing earned shows the ≥2-sessions maturity line (and singular session)", () => {
  const w: Wins = {
    reps: 3, sessions: 1, firstRepTs: T0,
    skillsEarned: [], updatesFolded: [],
    repeatsFlagged: 0, knownFixSurfaced: 0, lastFlag: null,
    noiseRejected: 0, skillUses: [], timeToFirstSkillMs: null,
  };
  const out = renderWins(w, T0 + 1_000);
  expect(out).toContain("3 reps watched across 1 session");
  expect(out).not.toContain("1 sessions");
  expect(out).toContain("patterns need ≥2 sessions");
  expect(out).toContain("every line above is backed by a receipt");
});

// ── ago · branch boundaries at a fixed now ──────────────────────────────────────────────────

test("ago: branch boundaries (just-now window, minutes, hours, days) and future-ts clamp", () => {
  const NOW = 1_750_000_000_000;
  const cases: Array<{ name: string; msAgo: number; want: string }> = [
    { name: "zero delta", msAgo: 0, want: "just now" },
    { name: "just inside the 90s window", msAgo: 89_999, want: "just now" },
    { name: "exactly 90s → minutes branch", msAgo: 90_000, want: "2m ago" },
    { name: "five minutes", msAgo: 5 * 60_000, want: "5m ago" },
    { name: "just inside the 90m window", msAgo: 89 * 60_000, want: "89m ago" },
    { name: "exactly 90m → hours branch", msAgo: 90 * 60_000, want: "2h ago" },
    { name: "just inside the 36h window", msAgo: 35 * 3_600_000, want: "35h ago" },
    { name: "exactly 36h → days branch", msAgo: 36 * 3_600_000, want: "2d ago" },
    { name: "three days", msAgo: 3 * 86_400_000, want: "3d ago" },
    { name: "future timestamp clamps to just now", msAgo: -10_000, want: "just now" },
  ];
  for (const c of cases) {
    expect(ago(NOW - c.msAgo, NOW), c.name).toBe(c.want);
  }
});
