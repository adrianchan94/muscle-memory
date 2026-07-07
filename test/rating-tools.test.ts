// v0.8.1 — agent-callable referee rating + box score. One test per Kev's gate list.
// The shared-code-path guarantee is STRUCTURAL: slash command and tool action both call
// renderBoxscore()/rateSkill() — these tests pin the shared units.
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = join(tmpdir(), `mm-rate-tools-${Date.now()}`);
process.env.MM_STATE_DIR = STATE;
process.env.MM_GLOBAL_SKILLS_DIR = join(STATE, "g");
mkdirSync(process.env.MM_GLOBAL_SKILLS_DIR, { recursive: true });

const { rateSkill, loadPlusMinus, renderPlusMinus } = await import("../mods/referee");
const { renderBoxscore, FIXTURE_SKILL_RE } = await import("../mods/lifecycle");
const { MM_TAG } = await import("../mods/core");

function shelf(names: string[]): string {
  const dir = join(tmpdir(), `mm-rt-shelf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
  for (const n of names) {
    mkdirSync(join(dir, n), { recursive: true });
    writeFileSync(join(dir, n, "SKILL.md"), `---\nname: ${n}\ndescription: Use when demo.\n---\n## Procedure\n1. x.\n${MM_TAG}\n`);
  }
  return dir;
}

describe("rate_skill code path (rateSkill — same fn as slash + tool)", () => {
  test("ledger accumulates across ratings", async () => {
    await rateSkill(null, "accum-skill", true, null);
    await rateSkill(null, "accum-skill", true, null);
    const r = (await rateSkill(null, "accum-skill", false, null)).rating;
    expect(r.plus).toBe(2);
    expect(r.minus).toBe(1);
    expect(loadPlusMinus()["accum-skill"].plus).toBe(2);
  });
  test("invalid skill name refused, ledger untouched", async () => {
    const res = await rateSkill(null, "NOT a valid//name!!", true, null);
    expect(res.reason).toContain("invalid skill name");
    expect(loadPlusMinus()["NOT a valid//name!!"]).toBeUndefined();
  });
  test("no step id → ledger only (native lane not attempted)", async () => {
    const res = await rateSkill({ steps: { feedback: { create: () => { throw new Error("must not be called"); } } } }, "ledger-only-skill", true, null);
    expect(res.nativePosted).toBe(false);
    expect(res.reason).toContain("no step id");
  });
  test("failing native feedback STILL records the ledger (ledger is source of truth)", async () => {
    const client = { steps: { feedback: { create: async () => { throw new Error("server down"); } } } };
    const res = await rateSkill(client, "native-fail-skill", true, "step-123");
    expect(res.nativePosted).toBe(false);
    expect(res.rating.plus).toBe(1);
    expect(res.reason).toContain("ledger only (native post unavailable/failed)");
  });
  test("working native surface posts AND records", async () => {
    let posted: unknown = null;
    const client = { steps: { feedback: { create: async (id: string, body: unknown) => { posted = { id, body }; return {}; } } } };
    const res = await rateSkill(client, "native-ok-skill", true, "step-9");
    expect(res.nativePosted).toBe(true);
    expect(posted).toEqual({ id: "step-9", body: { feedback: "positive" } });
  });
});

describe("renderBoxscore (shared renderer — slash + tool)", () => {
  test("renders rated + unrated skills with tenure icons and the program's autonomy rows", async () => {
    const dir = shelf(["scored-skill", "silent-skill"]);
    await rateSkill(null, "scored-skill", true, null);
    const out = renderBoxscore([dir], { renderAutonomy: () => "  🤖 L1  test-lane  (streak 0 · misses 0)" });
    expect(out).toContain("HARDWOOD BOX SCORE");
    expect(out).toContain("scored-skill");
    expect(out).toContain("silent-skill");
    expect(out).toContain("THE PROGRAM ITSELF");
    expect(out).toContain("test-lane");
  });
  test("FILTERS ref-skill-* fixtures from the live display (synthetic-tape doctrine)", async () => {
    const dir = shelf(["real-skill", "ref-skill-zz-tools", "ref-skill-zz-flaky"]); // zz names: fixture-pattern match WITHOUT colliding with referee.test's ledger counts (shared state dir per process)
    await rateSkill(null, "ref-skill-zz-tools", true, null); // even a rated fixture stays hidden
    const out = renderBoxscore([dir]);
    expect(out).toContain("real-skill");
    expect(out).not.toContain("ref-skill-zz-tools");
    expect(out).not.toContain("ref-skill-zz-flaky");
    expect(FIXTURE_SKILL_RE.test("ref-skill-anything")).toBe(true);
  });
  test("dedupes the same skill across agent + global shelves", () => {
    const a = shelf(["twin-skill"]); const b = shelf(["twin-skill"]);
    const out = renderBoxscore([a, b]);
    expect(out.split("twin-skill").length - 1).toBe(1);
  });
});
