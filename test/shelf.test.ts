// muscle-memory · E8 squad shelf tests.
//
// CONTRACT under test: shelf identity is TEXT-BORNE. Tags on archive-created passages do not
// survive the wire (verified live 2026-07-03: search returns them tagless), so publish must
// LEAD the passage text with the shelf marker, and pull must resolve skill + publisher + the
// NEWEST published version from markers alone over tagless search results. Pull is STAGED-ONLY
// (publish-staged dir + provenance header + review gate) and both directions hard-block
// secret-shaped content before it touches the wire or the disk.
// Run: `MM_STATE_DIR=$(mktemp -d) MM_GLOBAL_SKILLS_DIR=$(mktemp -d) bun test test/shelf.test.ts`
import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLISH_STAGED_DIR } from "../mods/core";
import { publishSkillToShelf, pullShelfSkill, SHELF_MARKER_RE, shelfMarker } from "../mods/shelf";

// ── marker round-trip (pure) ────────────────────────────────────────────────────────────────

test("shelfMarker ⇄ SHELF_MARKER_RE: skill, publisher, timestamp recovered exactly from the text", () => {
  const m = shelfMarker("retry-flaky-tests", "kev_agent-1", "2026-07-03T09:30:00.000Z").match(SHELF_MARKER_RE);
  expect(m && m.slice(1)).toEqual(["retry-flaky-tests", "kev_agent-1", "2026-07-03T09:30:00.000Z"]);
});

// ── publishSkillToShelf ─────────────────────────────────────────────────────────────────────

test("publishSkillToShelf: invalid name and secret-shaped content refused BEFORE the client is touched", async () => {
  const calls: unknown[] = [];
  const client = { archives: { passages: { create: (...a: unknown[]) => { calls.push(a); return Promise.resolve({}); } } } };
  const bad = await publishSkillToShelf(client, "arch-1", "Fix Stuff!", "content", "ultron");
  expect(bad.ok).toBe(false);
  const leaky = await publishSkillToShelf(client, "arch-1", "good-skill", "token: sk-abc123def456ghi789", "ultron");
  expect(leaky.ok).toBe(false);
  expect(leaky.reason).toContain("secret");
  expect(calls.length).toBe(0); // neither refusal reached the wire
});

test("publishSkillToShelf: passage text LEADS with a marker that parses back to (skill, publisher)", async () => {
  const calls: Array<unknown[]> = [];
  const client = { archives: { passages: { create: (...a: unknown[]) => { calls.push(a); return Promise.resolve({}); } } } };
  const res = await publishSkillToShelf(client, "arch-1", "retry-flaky-tests", "## steps\n- rerun", "ultron");
  expect(res).toMatchObject({ ok: true, archiveId: "arch-1" });
  expect(calls[0]?.[0]).toBe("arch-1");
  const params = calls[0]?.[1] as Record<string, unknown>;
  const [markerLine, ...body] = String(params.text).split("\n");
  const m = markerLine.match(SHELF_MARKER_RE); // identity must survive tag-stripping: it rides in the text
  expect(m && [m[1], m[2]]).toEqual(["retry-flaky-tests", "ultron"]);
  expect(body.join("\n")).toBe("## steps\n- rerun"); // content intact after the marker line
});

test("publishSkillToShelf: client without archives.passages.create → ok:false, never throws", async () => {
  const res = await publishSkillToShelf({}, "arch-1", "good-skill", "content", "ultron");
  expect(res.ok).toBe(false);
});

// ── pullShelfSkill ──────────────────────────────────────────────────────────────────────────

/** A shelf doc exactly as publish writes it: marker line, then body. */
const doc = (skill: string, publisher: string, ts: string, body: string) => `${shelfMarker(skill, publisher, ts)}\n${body}`;

test("pullShelfSkill: NEWEST marker version wins over TAGLESS results; staged copy carries provenance", async () => {
  // Live-verified: archive passages come back WITHOUT tags — these results carry none on purpose.
  const results = [
    { id: "p1", content: doc("retry-flaky-tests", "kev", "2026-07-01T00:00:00.000Z", "old body") }, // older FIRST —
    { id: "p2", content: "a random passage with no marker" },                                        //  a first-match or
    { id: "p3", content: doc("other-skill", "mack", "2026-07-04T00:00:00.000Z", "wrong skill") },    //  flipped-newest bug reds this
    { id: "p4", content: doc("retry-flaky-tests", "ultron", "2026-07-03T12:00:00.000Z", "new body") },
  ];
  const client = { agents: { passages: { search: () => Promise.resolve({ results }) } } };
  const res = await pullShelfSkill(client, "agent-1", "retry-flaky-tests");
  expect(res.ok).toBe(true);
  expect(res.publisher).toBe("ultron");
  expect(res.stagedPath).toBe(join(PUBLISH_STAGED_DIR, "retry-flaky-tests", "SKILL.md")); // STAGED, never the active shelf
  const staged = readFileSync(String(res.stagedPath), "utf8");
  const [header] = staged.split("\n");
  expect(header).toContain("publisher: ultron");
  expect(header).toContain("REVIEW BEFORE PROMOTION"); // the human gate rides in the file itself
  expect(staged).toContain("new body");
  expect(staged).not.toContain("old body");
});

test("pullShelfSkill: no marker-matching candidate (wrong skill / no marker) → ok:false, nothing staged", async () => {
  const results = [
    { id: "p1", content: "no marker here" },
    { id: "p2", content: doc("other-skill", "kev", "2026-07-01T00:00:00.000Z", "x") },
  ];
  const client = { agents: { passages: { search: () => Promise.resolve({ results }) } } };
  expect(await pullShelfSkill(client, "agent-1", "wanted-skill")).toMatchObject({ ok: false, stagedPath: null });
});

test("pullShelfSkill: secret-bearing shelf content refused — never written to disk", async () => {
  const poisoned = doc("leaky-skill", "kev", "2026-07-03T00:00:00.000Z", "creds: ghp_abcdef123456789012");
  const client = { agents: { passages: { search: () => Promise.resolve({ results: [{ id: "p", content: poisoned }] }) } } };
  const res = await pullShelfSkill(client, "agent-1", "leaky-skill");
  expect(res.ok).toBe(false);
  expect(res.reason).toContain("secret");
  expect(existsSync(join(PUBLISH_STAGED_DIR, "leaky-skill", "SKILL.md"))).toBe(false);
});

test("pullShelfSkill: invalid skill name refused before search", async () => {
  let searched = 0;
  const client = { agents: { passages: { search: () => { searched++; return Promise.resolve({ results: [] }); } } } };
  const res = await pullShelfSkill(client, "agent-1", "Not A Skill");
  expect(res.ok).toBe(false);
  expect(searched).toBe(0);
});
