// FILM ROOM · deterministic tests — design §7, one test per discipline rule. Fake authors,
// tmp shelves, zero model calls. The film room's honesty must not depend on prompting.
import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = join(tmpdir(), `mm-filmroom-${Date.now()}`);
process.env.MM_STATE_DIR = STATE;
process.env.MM_GLOBAL_SKILLS_DIR = join(STATE, "global");
mkdirSync(process.env.MM_GLOBAL_SKILLS_DIR, { recursive: true });

const { parsePatchNotes, applyNoteToContent, applyPatchNote, runFilmRoom, checkPatchRegression, FILMROOM_SHADOW_DIR, FILMROOM_RECEIPTS } = await import("../mods/filmroom");
const { MM_TAG } = await import("../mods/core");

const SKILL = (name: string) => `---
name: ${name}
description: Use when the demo pipeline needs its conventions applied.
---
## Procedure
1. Apply the conventions.
## Pitfalls
- None known yet.
## Verification
Check the output.
${MM_TAG}
`;

function shelf(name = "demo-pipeline-conventions"): string {
  const dir = join(tmpdir(), `mm-fr-shelf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), SKILL(name));
  return dir;
}

const NOTE = (skill: string, lines = "- New pitfall: eighths-of-a-cent amounts (TELL: totals 8x too large).") =>
  ({ skill, section: "Pitfalls" as const, op: "append" as const, lines, evidence_ref: "session-receipt-1" });

describe("parsePatchNotes — strict output contract", () => {
  test("valid array parses", () => {
    const r = parsePatchNotes(JSON.stringify([NOTE("a-skill")]));
    expect(r?.length).toBe(1);
  });
  test("caps: >2 notes, >8 lines, bad section, missing evidence, create-shaped → null", () => {
    expect(parsePatchNotes(JSON.stringify([NOTE("a"), NOTE("b"), NOTE("c")]))).toBeNull();
    expect(parsePatchNotes(JSON.stringify([NOTE("a", Array(10).fill("- x").join("\n"))]))).toBeNull();
    expect(parsePatchNotes(JSON.stringify([{ ...NOTE("a"), section: "New Section" }]))).toBeNull();
    expect(parsePatchNotes(JSON.stringify([{ ...NOTE("a"), evidence_ref: "" }]))).toBeNull();
    expect(parsePatchNotes(JSON.stringify([{ ...NOTE("a"), op: "rewrite" }]))).toBeNull();
    expect(parsePatchNotes("no lessons today")).toBeNull();
    expect(parsePatchNotes("[]")).toBeNull();
  });
});

describe("applyNoteToContent — surgical append", () => {
  test("appends inside the target section, frontmatter untouched", () => {
    const next = applyNoteToContent(SKILL("x"), NOTE("x"));
    expect(next).toContain("New pitfall: eighths");
    expect(next.indexOf("New pitfall")).toBeGreaterThan(next.indexOf("## Pitfalls"));
    expect(next.indexOf("New pitfall")).toBeLessThan(next.indexOf("## Verification"));
    expect(next.match(/^---\n[\s\S]*?\n---/)?.[0]).toBe(SKILL("x").match(/^---\n[\s\S]*?\n---/)?.[0]);
    expect(next).toContain("_[filmroom "); // provenance marker travels with the patch
  });
  test("missing section → appended at end, nothing dropped", () => {
    const next = applyNoteToContent(SKILL("x"), { ...NOTE("x"), section: "Worked examples" });
    expect(next).toContain("## Worked examples");
    expect(next).toContain("## Verification");
  });
});

describe("applyPatchNote — the gate stack", () => {
  test("labile + auto → patched live, snapshot exists", () => {
    const dir = shelf();
    const r = applyPatchNote(NOTE("demo-pipeline-conventions"), [dir], { mode: "auto", tenure: "labile" });
    expect(r.status).toBe("patched-live");
    expect(existsSync(r.snapshot!)).toBe(true);
    expect(readFileSync(join(dir, "demo-pipeline-conventions", "SKILL.md"), "utf8")).toContain("New pitfall");
  });
  test("staged mode (default) → shadow diff, live file untouched", () => {
    const dir = shelf();
    const r = applyPatchNote(NOTE("demo-pipeline-conventions"), [dir], { tenure: "labile" });
    expect(r.status).toBe("shadowed");
    expect(readFileSync(join(dir, "demo-pipeline-conventions", "SKILL.md"), "utf8")).not.toContain("New pitfall");
    expect(readFileSync(join(FILMROOM_SHADOW_DIR, "demo-pipeline-conventions", "SKILL.md"), "utf8")).toContain("New pitfall");
  });
  test("tenured → shadow even in auto; pinned → shadow + review flag receipt", () => {
    const dir = shelf();
    expect(applyPatchNote(NOTE("demo-pipeline-conventions"), [dir], { mode: "auto", tenure: "tenured" }).status).toBe("shadowed");
    const r = applyPatchNote(NOTE("demo-pipeline-conventions"), [dir], { mode: "auto", tenure: "pinned" });
    expect(r.status).toBe("shadowed");
    expect(r.reason).toContain("pinned");
    const receipts = readFileSync(FILMROOM_RECEIPTS, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(receipts.some((x) => x.reviewFlag === true)).toBe(true);
  });
  test("unmanaged target → rejected (film room only maintains MM-managed skills)", () => {
    const dir = join(tmpdir(), `mm-fr-um-${Date.now()}`);
    mkdirSync(join(dir, "hand-written"), { recursive: true });
    writeFileSync(join(dir, "hand-written", "SKILL.md"), "---\nname: hand-written\ndescription: Use when x.\n---\n## Procedure\n1. y.");
    expect(applyPatchNote(NOTE("hand-written"), [dir], { mode: "auto" }).status).toBe("rejected");
  });
  test("missing target → parked, never created", () => {
    expect(applyPatchNote(NOTE("does-not-exist"), [shelf()], { mode: "auto" }).status).toBe("parked");
  });
});

describe("runFilmRoom — the boundary orchestrator", () => {
  test("MM_FILMROOM=off → byte-identical no-op", async () => {
    const dir = shelf();
    const before = readFileSync(join(dir, "demo-pipeline-conventions", "SKILL.md"), "utf8");
    const r = await runFilmRoom({ summary: "learned things", dirs: [dir], authorFn: async () => JSON.stringify([NOTE("demo-pipeline-conventions")]), enabled: "off" });
    expect(r.ran).toBe(false);
    expect(readFileSync(join(dir, "demo-pipeline-conventions", "SKILL.md"), "utf8")).toBe(before);
  });
  test("durable lesson matching existing skill → exactly one shadowed PATCH_NOTE (staged default)", async () => {
    const dir = shelf();
    const r = await runFilmRoom({ summary: "the demo pipeline conventions bit us: amounts were in eighths of a cent", dirs: [dir], authorFn: async () => JSON.stringify([NOTE("demo-pipeline-conventions")]), enabled: "staged" });
    expect(r.ran).toBe(true);
    expect(r.patched.length).toBe(1);
    expect(r.patched[0].status).toBe("shadowed");
  });
  test("lesson matching nothing → parked, zero writes", async () => {
    const dir = shelf();
    const r = await runFilmRoom({ summary: "unrelated summary", dirs: [dir], authorFn: async () => JSON.stringify([NOTE("some-unknown-skill")]), enabled: "staged" });
    expect(r.patched.length).toBe(0);
    expect(r.parked.length).toBe(1);
  });
  test("malformed author output → clean no-op, reason recorded", async () => {
    const r = await runFilmRoom({ summary: "sum", dirs: [shelf()], authorFn: async () => "I think we should rewrite everything!", enabled: "staged" });
    expect(r.patched.length).toBe(0);
    expect(r.reason).toContain("no valid PATCH_NOTEs");
  });
  test("author failure → clean no-op, never throws", async () => {
    const r = await runFilmRoom({ summary: "sum", dirs: [shelf()], authorFn: async () => { throw new Error("model down"); }, enabled: "staged" });
    expect(r.ran).toBe(true);
    expect(r.reason).toContain("author call failed");
  });
});

describe("referee-coupled auto-revert", () => {
  test("live patch on skill whose plus-minus then drops → reverted to snapshot", async () => {
    const dir = shelf();
    const target = join(dir, "demo-pipeline-conventions", "SKILL.md");
    const before = readFileSync(target, "utf8");
    const r = applyPatchNote(NOTE("demo-pipeline-conventions"), [dir], { mode: "auto", tenure: "labile" });
    expect(r.status).toBe("patched-live");
    // fixture ledger: net utility now NEGATIVE (below netAtPatch default 0)
    const ledger = { "demo-pipeline-conventions": { plus: 0, minus: 2, lastTs: Date.now(), lastStepId: null } };
    const reverts = checkPatchRegression(ledger, [dir]);
    expect(reverts.some((x) => x.skill === "demo-pipeline-conventions" && x.reverted)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(before);
  });
});
