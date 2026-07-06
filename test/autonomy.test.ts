// AUTONOMY TENURE — one test per law in docs/AUTONOMY.md. Trust as a ledger, deterministic.
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = join(tmpdir(), `mm-auto-${Date.now()}`);
process.env.MM_STATE_DIR = STATE;
process.env.MM_GLOBAL_SKILLS_DIR = join(STATE, "g");
mkdirSync(process.env.MM_GLOBAL_SKILLS_DIR, { recursive: true });

const A = await import("../mods/autonomy");

const DAY = 86400000;
let seq = 0;
function ledgerFile(name: string, entries: Array<Partial<A.LedgerEntry>>): string {
  const p = join(STATE, `${name}.jsonl`);
  seq = 0;
  writeFileSync(p, entries.map((e, i) => JSON.stringify({ seq: i, ts: e.ts ?? Date.now() - 30 * DAY + i * 60000, lane: e.lane ?? "distill-update", outcome: e.outcome ?? "approved", rung: e.rung, weak: e.weak })).join("\n") + "\n");
  return p;
}
const approvals = (n: number, lane = "distill-update") => Array.from({ length: n }, () => ({ lane: lane as A.Lane, outcome: "approved" as const }));

describe("the ladder", () => {
  test("default rung is L1 STAGE — never auto out of the box", () => {
    const p = ledgerFile("fresh", []);
    expect(A.laneState("distill-update", { path: p, env: "on" }).rung).toBe(1);
    expect(A.autonomyMode("distill-update", { path: p, env: "on" })).toBe("stage");
  });
  test("20-streak of approvals EARNS L2 (after cold start)", () => {
    const p = ledgerFile("earn", approvals(21));
    expect(A.laneState("distill-update", { path: p, env: "on" }).rung).toBe(2);
    expect(A.autonomyMode("distill-update", { path: p, env: "on" })).toBe("auto");
  });
  test("ONE rejection demotes instantly and resets the streak", () => {
    const p = ledgerFile("miss", [...approvals(25), { lane: "distill-update", outcome: "rejected" }]);
    const st = A.laneState("distill-update", { path: p, env: "on" });
    expect(st.rung).toBe(1);
    expect(st.streak).toBe(0);
    expect(st.lastDemotion?.reason).toBe("rejected");
  });
  test("untouched-then-used counts toward the streak (weak approval)", () => {
    const p = ledgerFile("weak", Array.from({ length: 21 }, () => ({ lane: "distill-update" as A.Lane, outcome: "untouched_used" as const, weak: true })));
    expect(A.laneState("distill-update", { path: p, env: "on" }).rung).toBe(2);
  });
});

describe("the guard rails", () => {
  test("COLD START: no promotion within 14 days of first ledger entry", () => {
    const now = Date.now();
    const p = ledgerFile("cold", approvals(30).map((e) => ({ ...e, ts: now - 2 * DAY })));
    expect(A.laneState("distill-update", { path: p, env: "on", now }).rung).toBe(1);
  });
  test("SHARED-STATE lanes never self-promote past L1", () => {
    const p = ledgerFile("shared", approvals(40, "catalog-sync"));
    expect(A.laneState("catalog-sync", { path: p, env: "on" }).rung).toBe(1);
  });
  test("MM_AUTONOMY=off freezes everything at L1 even with a perfect record", () => {
    const p = ledgerFile("frozen", approvals(40));
    const st = A.laneState("distill-update", { path: p, env: "off" });
    expect(st.rung).toBe(1);
    expect(st.frozen).toBe(true);
  });
  test("TAMPER (sequence gap) fails closed to L0 OBSERVE", () => {
    const p = ledgerFile("tamper", approvals(25));
    // delete a line = sequence gap
    const lines = readFileSync(p, "utf8").trim().split("\n");
    lines.splice(5, 1);
    writeFileSync(p, lines.join("\n") + "\n");
    const st = A.laneState("distill-update", { path: p, env: "on" });
    expect(st.tampered).toBe(true);
    expect(st.rung).toBe(0);
    expect(A.autonomyMode("distill-update", { path: p, env: "on" })).toBe("observe");
  });
  test("HUMAN PIN outranks the ladder in both directions", () => {
    const up = ledgerFile("pinup", [{ lane: "distill-update", outcome: "pin", rung: 2 }]);
    expect(A.laneState("distill-update", { path: up, env: "on" }).rung).toBe(2);
    const down = ledgerFile("pindown", [...approvals(30), { lane: "distill-update", outcome: "pin", rung: 1 }]);
    expect(A.laneState("distill-update", { path: down, env: "on" }).rung).toBe(1);
  });
});

describe("honest surfaces", () => {
  test("renderAutonomy shows every lane with rung + streak + misses", () => {
    const p = ledgerFile("render", approvals(3));
    const out = A.renderAutonomy({ path: p, env: "on" });
    for (const lane of A.LANES) expect(out).toContain(lane);
    expect(out).toContain("streak");
  });
  test("append-only recorder keeps dense sequence", () => {
    const p = join(STATE, "record.jsonl");
    A.recordAutonomy("film-room-patch", "proposed", { path: p, ref: "patch-1" });
    A.recordAutonomy("film-room-patch", "approved", { path: p, ref: "patch-1" });
    const entries = A.readLedger(p);
    expect(entries.map((e) => e.seq)).toEqual([0, 1]);
  });
});
