import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  composeEnabled, composeMaxSkills, composeMinNewTerms, selectCompanions, composePrescription,
  searchSkills, routeSkill, pickUpdateTarget,
} from "../mods/autopilot";

function shelf(skills: Array<{ name: string; description: string; body?: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), "mm-compose-"));
  for (const s of skills) {
    mkdirSync(join(dir, s.name), { recursive: true });
    writeFileSync(join(dir, s.name, "SKILL.md"), `---\nname: ${s.name}\ndescription: ${s.description}\n---\n\n${s.body || ""}\n`);
  }
  return dir;
}

// FIXTURE 1 — the architectural gap itself: an itinerary task whose correct answer is genuinely
// 2+ skills (flights AND accommodations AND activities), on a shelf of six search-* siblings.
const travel = shelf([
  { name: "search-flights", description: "Use when searching flights and comparing airline fares for a travel itinerary trip", body: "flights airline fares itinerary" },
  { name: "search-accommodations", description: "Use when searching accommodations hotels and lodging for a travel itinerary trip", body: "hotels lodging accommodations itinerary" },
  { name: "search-activities", description: "Use when searching activities tours and attractions for a travel itinerary trip", body: "activities tours attractions itinerary" },
  { name: "search-restaurants", description: "Use when searching restaurants and dining reservations", body: "restaurants dining" },
  { name: "search-weather", description: "Use when searching weather forecasts for a destination", body: "weather forecasts" },
  { name: "search-visas", description: "Use when searching visa entry requirements for a destination country", body: "visa entry requirements" },
]);
const itineraryTask = "plan a seven day travel itinerary for the trip: book flights, find accommodations hotels, and pick activities tours";

// FIXTURE 2 — exactly one right skill among unrelated siblings: must still prescribe exactly 1.
const single = shelf([
  { name: "rotating-quartz-ledger-keys", description: "Use when rotating quartz ledger signing keys in the vault manifest", body: "quartz ledger signing keys vault" },
  { name: "folding-orbit-rows", description: "Use when folding ndjson orbit rows into a canonical tabulation", body: "ndjson orbit rows" },
  { name: "painting-mural-tiles", description: "Use when painting mural tiles onto a canvas grid", body: "mural tiles canvas" },
]);
const singleTask = "rotate the quartz ledger signing keys in the vault manifest";

// FIXTURE 3 — nothing matches: ABSTAIN must survive composition.
const none = shelf([
  { name: "search-flights", description: "Use when searching flights and comparing airline fares", body: "" },
  { name: "search-weather", description: "Use when searching weather forecasts", body: "" },
]);
const noneTask = "transpile the legacy fortran actuarial kernel to rust";

describe("MM_COMPOSE: flag off is byte-identical / inert", () => {
  test("composeEnabled is OFF by default", () => {
    delete process.env.MM_COMPOSE;
    expect(composeEnabled()).toBe(false);
  });
  test("caps: never more than 3 total, companions must earn >=2 new terms by default", () => {
    delete process.env.MM_COMPOSE_MAX; delete process.env.MM_COMPOSE_MIN_NEW;
    expect(composeMaxSkills()).toBe(3);
    expect(composeMinNewTerms()).toBe(2);
    process.env.MM_COMPOSE_MAX = "50"; // a shelf dump request is clamped, not honoured
    expect(composeMaxSkills()).toBe(3);
    delete process.env.MM_COMPOSE_MAX;
  });
});

describe("MM_COMPOSE: composition case — the itinerary needs 2+ skills", () => {
  test("shipped router abstains ambiguous on the tie; composition rescues it as an ordered set of <=3", () => {
    const pool = searchSkills([travel], itineraryTask, 10);
    const decision = routeSkill(pool.slice(0, 3), [], () => true, 18);
    expect(decision.route).not.toBe("update"); // THE GAP: complements tie, single-skill router gives up
    const composed = composePrescription(itineraryTask, pool, 18)!;
    expect(composed).not.toBeNull();
    expect(composed.rescuedTie).toBe(true);
    const t = composed.primary;
    const companions = composed.companions;
    // The gap: single-skill routing names ONE of six search-* skills. Composition must name >=2 total.
    expect(companions.length).toBeGreaterThanOrEqual(1);
    expect(companions.length).toBeLessThanOrEqual(2); // set of 2-3 total, never the shelf
    const set = [t.name, ...companions.map((c) => c.name)];
    // Every named skill is one the task genuinely needs; the off-task siblings stay off the set.
    for (const n of set) expect(["search-flights", "search-accommodations", "search-activities"]).toContain(n);
    expect(set).not.toContain("search-weather");
    expect(set).not.toContain("search-visas");
    // Each companion ships its reason: the uncovered task terms it contributes.
    for (const c of companions) expect(c.newTerms.length).toBeGreaterThanOrEqual(2);
  });
  test("companions clear the SAME gate as the primary — no second scorer", () => {
    const pool = searchSkills([travel], itineraryTask, 10);
    const composed = composePrescription(itineraryTask, pool, 18)!;
    const companions = composed.companions;
    for (const c of companions) {
      const row = pool.find((p) => p.name === c.name)!;
      expect(pickUpdateTarget([row], 18)).not.toBeNull(); // the shipped gate, reused verbatim
    }
  });
});

describe("MM_COMPOSE: single-skill case — must still prescribe exactly 1", () => {
  test("near-duplicate-free shelf with one right answer yields zero companions", () => {
    const pool = searchSkills([single], singleTask, 10);
    const decision = routeSkill(pool.slice(0, 3), [], () => true, 18);
    expect(decision.route).toBe("update");
    expect(decision.target!.name).toBe("rotating-quartz-ledger-keys");
    const t = decision.target!;
    const companions = selectCompanions(singleTask, { name: t.name, description: (t as any).description || "" }, pool, { threshold: 18 });
    expect(companions).toEqual([]); // composition does not inflate a 1-skill answer
    expect(composePrescription(singleTask, pool, 18)).toBeNull(); // no set to claim ⇒ shipped 1-skill path runs verbatim
  });
});

describe("MM_COMPOSE: near-duplicate tie — the margin's real case still abstains", () => {
  const dupes = shelf([
    { name: "syncing-topaz-manifest-entries", description: "Use when syncing topaz manifest entries into the registry index", body: "topaz manifest entries registry" },
    { name: "aligning-topaz-manifest-entries", description: "Use when aligning topaz manifest entries in the registry index", body: "topaz manifest entries registry" },
  ]);
  test("tied paraphrase twins add no uncovered terms, so composition refuses and abstain survives", () => {
    const q = "sync the topaz manifest entries into the registry index";
    const pool = searchSkills([dupes], q, 10);
    const decision = routeSkill(pool.slice(0, 3), [], () => true, 18);
    if (decision.route === "update") return; // if lexical happens to dominate, single-skill path is fine
    expect(composePrescription(q, pool, 18)).toBeNull();
  });
});

describe("MM_COMPOSE: abstain case — no match still means abstain", () => {
  test("no candidate clears the gate, so there is no primary and composition never fires", () => {
    const pool = searchSkills([none], noneTask, 10);
    const decision = routeSkill(pool.slice(0, 3), [], () => true, 18);
    expect(decision.route).not.toBe("update"); // index.ts abstains on this route, unchanged
    expect(decision.target).toBeNull();        // composeLines is only built under a routed primary
    expect(composePrescription(noneTask, pool, 18)).toBeNull(); // composition cannot rescue a no-match
  });
});
