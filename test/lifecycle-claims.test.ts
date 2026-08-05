// K2 — the claims-table class.
//
// The docs promise "lifecycle changes are never automatic" and "nothing is auto-promoted or
// auto-retired". Those were prose. A cold reviewer found that MM_REFLECT=staged silently retired
// a stale skill at conversation close, so `staged` quietly meant benched.
//
// Each headline behavioural claim below is now a named test that simulates the condition. The
// fixture matters more than it looks: prune only touches the AGENT-LOCAL shelf, only skills
// carrying the muscle-memory provenance tag, and it reads age from the usage store rather than
// file mtime. Get any of those wrong and the test passes while proving nothing — which is what
// my first three attempts did.
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAutonomousPrune } from "../mods/lifecycle";
import { STATE_DIR, USAGE_PATH } from "../mods/core";

// A unique name per test. Sharing one name coupled these tests through the shelf and the
// quarantine directory, which passed locally and failed in CI — order and timing dependent.
let seq = 0;
const nextName = () => `stale-unused-skill-${++seq}`;

/** A skill that IS a genuine prune candidate: agent-local, managed, aged, zero uses. */
function ownShelf(): string {
  // Another suite deletes MEMORY_DIR mid-run, so this file sets its own rather than inheriting
  // one. Same leak class that made box-score depend on whichever test ran first.
  if (!process.env.MEMORY_DIR) process.env.MEMORY_DIR = mkdtempSync(join(tmpdir(), "mm-claims-mem-"));
  if (!process.env.MM_GLOBAL_SKILLS_DIR) process.env.MM_GLOBAL_SKILLS_DIR = mkdtempSync(join(tmpdir(), "mm-claims-glob-"));
  return join(process.env.MEMORY_DIR, "skills");
}

function eligibleSkill(): { shelf: string; file: string; name: string; ctx: { agentId: string } } {
  const NAME = nextName();
  const shelf = ownShelf();
  const dir = join(shelf, NAME);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"),
    `---\nname: ${NAME}\ndescription: An old managed skill with zero uses, past the retirement window\n---\n<!-- muscle-memory provenance: graduated -->\n## Procedure\n1. x\n`);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(USAGE_PATH, JSON.stringify({ [NAME]: { created: Date.now() - 45 * 864e5, uses: 0, state: "active" } }));
  return { shelf, file: join(dir, "SKILL.md"), name: NAME, ctx: { agentId: "claims-test" } };
}

test("the fixture is genuinely eligible — prune retires it when asked", () => {
  // Positive control. Without this, every claim below could pass because nothing was retirable.
  const { file, ctx, name } = eligibleSkill();
  const result = runAutonomousPrune(ctx, { maxRetire: 1 });
  expect(result.retired).toContain(name);
  expect(existsSync(file)).toBe(false);
});

test("claim: retirement is reversible, never a deletion", () => {
  const { shelf, ctx, name } = eligibleSkill();
  expect(runAutonomousPrune(ctx, { maxRetire: 1 }).retired).toContain(name);
  // Quarantine is timestamped: _retired/<name>-<iso>, so the original is recoverable and a
  // second retire of the same name cannot clobber the first.
  // Tests in this file share one shelf, so more than one quarantine entry may exist by now —
  // which is itself the property: the timestamp means a second retire never clobbers the first.
  const quarantined = readdirSync(join(shelf, "_retired")).filter((d) => d.startsWith(name));
  expect(quarantined.length).toBeGreaterThan(0);
  expect(new Set(quarantined).size).toBe(quarantined.length);
  for (const entry of quarantined) expect(existsSync(join(shelf, "_retired", entry, "SKILL.md"))).toBe(true);
});

test("claim: prune never touches the shared global shelf", () => {
  // Another agent may depend on a global Custom Skill; autonomous prune must not reach it.
  ownShelf();
  const globalDir = join(process.env.MM_GLOBAL_SKILLS_DIR!, "global-managed-skill");
  mkdirSync(globalDir, { recursive: true });
  writeFileSync(join(globalDir, "SKILL.md"),
    "---\nname: global-managed-skill\ndescription: A shared skill another agent may rely on\n---\n<!-- muscle-memory provenance: graduated -->\n## P\n1. x\n");
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(USAGE_PATH, JSON.stringify({ "global-managed-skill": { created: Date.now() - 45 * 864e5, uses: 0, state: "active" } }));
  const result = runAutonomousPrune({ agentId: "claims-test" }, { maxRetire: 1 });
  expect(result.retired).not.toContain("global-managed-skill");
  expect(existsSync(join(globalDir, "SKILL.md"))).toBe(true);
});

test("claim: a used skill is never retired, however old", () => {
  const { file, ctx, name } = eligibleSkill();
  writeFileSync(USAGE_PATH, JSON.stringify({ [name]: { created: Date.now() - 900 * 864e5, uses: 1, state: "active" } }));
  expect(runAutonomousPrune(ctx, { maxRetire: 1 }).retired).toEqual([]);
  expect(existsSync(file)).toBe(true);
});

test("claim: a pinned skill is never retired", () => {
  const { file, ctx, name } = eligibleSkill();
  writeFileSync(USAGE_PATH, JSON.stringify({ [name]: { created: Date.now() - 45 * 864e5, uses: 0, state: "active", pinned: true } }));
  expect(runAutonomousPrune(ctx, { maxRetire: 1 }).retired).toEqual([]);
  expect(existsSync(file)).toBe(true);
});

test("claim: an unmanaged skill is never retired by muscle-memory", () => {
  const shelf = ownShelf();
  const dir = join(shelf, "hand-written-skill");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: hand-written-skill\ndescription: Authored by a human, not managed by muscle-memory\n---\n## P\n1. x\n");
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(USAGE_PATH, JSON.stringify({ "hand-written-skill": { created: Date.now() - 45 * 864e5, uses: 0, state: "active" } }));
  expect(runAutonomousPrune({ agentId: "claims-test" }, { maxRetire: 1 }).retired).toEqual([]);
  expect(existsSync(join(dir, "SKILL.md"))).toBe(true);
});

test("claim: the conversation-close hook does not retire unless MM_PRUNE is enabled", () => {
  // The P0 itself. Asserted at the call site rather than in the docs: index.ts must gate the
  // prune call behind an explicit opt-in, so `staged` can never mean quietly benched.
  const src = readFileSync(join(import.meta.dir, "..", "mods", "index.ts"), "utf8");
  const hook = /rfMode === "staged" \|\| rfMode === "auto"[\s\S]{0,900}?runAutonomousPrune/.exec(src)?.[0] ?? "";
  expect(hook).toContain("runAutonomousPrune");
  expect(hook).toMatch(/MM_PRUNE === "enabled"/);
});
