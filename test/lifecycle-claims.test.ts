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

test("claim: NO automatic path can retire without the explicit opt-in", () => {
  // The previous version of this test regex-matched a single hook. Two reflect hooks call prune;
  // I gated one, the other survived, and this test passed anyway — a class-killer that checked
  // one instance of its own class. It now enumerates EVERY call site mechanically.
  const src = readFileSync(join(import.meta.dir, "..", "mods", "index.ts"), "utf8");
  const lines = src.split("\n");

  // The single sanctioned choke point, and the one explicit user-initiated command.
  const gate = lines.findIndex((l) => l.includes("function autoPruneIfEnabled"));
  expect(gate).toBeGreaterThan(-1);
  expect(lines.slice(gate, gate + 4).join("\n")).toMatch(/MM_PRUNE !== "enabled"/);

  const ungated: string[] = [];
  lines.forEach((line, i) => {
    if (!/\brunAutonomousPrune\s*\(/.test(line)) return;
    if (i >= gate && i < gate + 6) return;                       // the gate's own body
    const context = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
    const userInitiated = /a\.action === "prune"/.test(context); // explicit command, documented
    if (!userInitiated) ungated.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
  });
  expect(ungated).toEqual([]);
});

test("claim: every reflect hook routes prune through the gate, not directly", () => {
  const src = readFileSync(join(import.meta.dir, "..", "mods", "index.ts"), "utf8");
  // Both hooks exist and both must call the choke point.
  for (const hook of ["conversation_close", "turn_end"]) expect(src).toContain(hook);
  const reflectBlocks = [...src.matchAll(/runReflectiveReview\([\s\S]{0,400}?\.then\(\(\) => \{([\s\S]{0,200}?)\}\)/g)]
    .map((m) => m[1]!);
  expect(reflectBlocks.length).toBeGreaterThan(0);
  for (const block of reflectBlocks) {
    if (!block.includes("Prune") && !block.includes("prune")) continue;
    expect(block).toContain("autoPruneIfEnabled");
  }
});

// ── Class map extension (fix v5) ───────────────────────────────────────────────
// Three more headline promises, each broken in the shipped bytes and each now mechanical.
// The behavioural proofs live in test/publish-containment-graduation.test.ts; these rows keep
// the claims table itself honest, so a doc edit cannot quietly re-open a class.

test("class: no auto-graduate under staged — the mirror of no-auto-retire", () => {
  const src = readFileSync(new URL("../mods/autopilot.ts", import.meta.url), "utf8");
  const line = src.match(/const graduate = .*/)?.[0] ?? "";
  expect(line).toBeTruthy();
  expect(line).not.toMatch(/isHighConfidenceCreate|res\.action === "update"/);
});

test("class: publish is sanitized AND approved", () => {
  const pub = readFileSync(new URL("../mods/publish.ts", import.meta.url), "utf8");
  const fn = pub.slice(pub.indexOf("export function publishSkillToCatalog"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  expect(body).toMatch(/sanitizeForPublish/);
  // The bytes that reach disk must be the sanitized ones, not the source content.
  // Match the argument, not a paren-free prefix — the call nests join(...), so [^)]* never
  // reached the second argument and this assertion passed on any writeFileSync at all.
  expect(body).toMatch(/writeFileSync\(.*,\s*published\)/);
  expect(body).not.toMatch(/writeFileSync\(.*,\s*content\)/);

  const idx = readFileSync(new URL("../mods/index.ts", import.meta.url), "utf8");
  const start = idx.indexOf('a.action === "publish"');
  const code = idx.slice(start, start + 1200).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  expect(code.indexOf("a.approve")).toBeGreaterThan(-1);
  expect(code.indexOf("a.approve")).toBeLessThan(code.indexOf("publishSkillToCatalog"));
});

test("class: support-file containment refuses symlink escape on every write path", () => {
  const src = readFileSync(new URL("../mods/core.ts", import.meta.url), "utf8");
  expect(src).toMatch(/export function assertContained/);
  expect(src).toMatch(/lstatSync/);
  expect(src).toMatch(/realpathSync/);
  // Both mutators, not just the one a reviewer happened to test.
  // Span to the next top-level export rather than a fixed char budget: a 700-char cap silently
  // stopped matching writeSupportFile once its body grew, so the assertion covered one mutator
  // instead of two and still passed.
  const guarded = [...src.matchAll(/export function (writeSupportFile|removeSupportFile)\b[\s\S]*?(?=\nexport )/g)];
  expect(guarded.length).toBe(2);
  for (const g of guarded) expect(g[0]).toMatch(/assertContained|resolveSkillFile/);
});

test("class: the lifecycle schema does not advertise the bug it used to have", () => {
  const idx = readFileSync(new URL("../mods/index.ts", import.meta.url), "utf8");
  // It literally read "staged still auto-graduates trusted updates/high-confidence creates".
  expect(idx).not.toMatch(/staged still auto-graduates/);
});

test("class: the MM_PUBLISH=auto carve-out is documented, defaults off, and still sanitizes", () => {
  const auto = readFileSync(new URL("../mods/autopilot.ts", import.meta.url), "utf8");
  // Standing approval, not absent approval: the env var must be an explicit opt-in that
  // defaults to off, and the bytes must still go through the same sanitizing publisher.
  expect(auto).toMatch(/process\.env\.MM_PUBLISH === "auto"/);
  expect(auto).not.toMatch(/process\.env\.MM_PUBLISH !== "off"/);
  const block = auto.slice(auto.indexOf('process.env.MM_PUBLISH === "auto"'));
  expect(block.slice(0, 400)).toMatch(/publishSkillToCatalog/);

  // And the claim must say so. A docs page that promises per-call approval while an env var
  // grants standing approval is the same defect class as a stale sha: the words disagree with
  // the bytes.
  const claims = readFileSync(new URL("../docs/cold-review/CLAIMS-AND-LIMITATIONS.md", import.meta.url), "utf8");
  expect(claims).toMatch(/MM_PUBLISH=auto/);
  expect(claims).toMatch(/standing\s+approval/i); // markdown wraps; do not assume one line

  const idx = readFileSync(new URL("../mods/index.ts", import.meta.url), "utf8");
  const desc = idx.match(/approve: \{ type: "boolean"[^}]*\}/)?.[0] ?? "";
  expect(desc).toMatch(/MM_PUBLISH=auto/);
});

test("class: no tool description claims blanket no-approval while hosting publish", () => {
  const idx = readFileSync(new URL("../mods/index.ts", import.meta.url), "utf8");
  const reg = idx.slice(idx.indexOf('name: "muscle_memory_lifecycle_run"'));
  const desc = reg.slice(0, reg.indexOf("\n      parameters"));
  // The tool hosts publish, which writes outside the agent's own shelf. A description that
  // advertises "no-approval, safe, reversible" for the whole tool is the words disagreeing with
  // the bytes again — the same class as a stale sha, one layer up.
  expect(desc).not.toMatch(/no-approval, safe, reversible/);
  expect(desc).toMatch(/approve: true/);
});

test("class: the threat map stays in step with the suites it indexes", () => {
  const map = readFileSync(new URL("../docs/cold-review/THREAT-MAP.md", import.meta.url), "utf8");
  // The map is the spine of G2 now that S-numbered continuity is dead. If it stops naming the
  // files it indexes, it has become decoration.
  for (const suite of ["packed-containment-vectors", "g2-security-v2", "packed-forgery-replay", "package-smoke"]) {
    expect(map, `threat map does not reference ${suite}`).toContain(suite);
  }
  // Reach must be declared, and the honest gaps must stay visible in the same document.
  expect(map).toMatch(/red-checked/);
  expect(map).toMatch(/Residual\s+threats/i);
  // And nobody quotes the dead numbering again. Whitespace-tolerant on purpose: markdown wraps,
  // and this is the third line-naive regex I have written against wrapped prose in one session.
  expect(map).toMatch(/S-numbered\s+continuity\s+is\s+dead/);
});

test("class: the launch packet lists the residual threats V1 does not claim", () => {
  const claims = readFileSync(new URL("../docs/cold-review/CLAIMS-AND-LIMITATIONS.md", import.meta.url), "utf8");
  // Mack co-signed these as residual for V1.1. A launch packet that omits them would be claiming
  // coverage we explicitly do not have.
  for (const t of ["key rotation", "drifted target", "sealed-manifest rewrite", "failed skill call", "already correct", "scale"]) {
    expect(claims.toLowerCase(), `residual threat '${t}' missing from the claims doc`).toContain(t.toLowerCase());
  }
  const map = readFileSync(new URL("../docs/cold-review/THREAT-MAP.md", import.meta.url), "utf8");
  expect((map.match(/residual V1\.1/g) || []).length, "every gap row must carry its residual status").toBe(6);
  expect(map).toMatch(/V1 G2 FULL does not cover these six/);
});
