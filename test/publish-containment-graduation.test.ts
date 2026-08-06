// Three P0s from the cold-review lane, each a promise the code did not keep.
//
// 1. PUBLISH said it was privacy-gated. It ran a lint and a scan, then wrote the ORIGINAL
//    bytes to the shared catalog — sanitizeForPublish existed and was never called on the
//    write path. A body naming a real person left the machine unchanged.
// 2. SUPPORT FILES validated the path as a STRING. Every check passed for a `references`
//    directory that was itself a symlink to somewhere outside the skill root, so the write
//    landed outside and the "reversible quarantine" moved a file the agent never owned.
// 3. GRADUATION under MM_REFLECT=staged promoted updates and high-confidence creates
//    straight to the live shelf. `staged` meant staged only for ordinary creates.
//
// Each test below is written to fail on the shipped bytes first.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSupportFile, removeSupportFile, readSkill, writeSkill, listSkillNames } from "../mods/core";
import { publishSkillToCatalog } from "../mods/publish";

// These tests must own their shelf, and must hand it back. Setting MM_AGENT_SKILLS_DIR without
// restoring it overrode the shelf resolver for every OTHER test file in the run — six unrelated
// failures, none of them a product defect. Third time this cycle a shared mutable in MY tests
// has faked a red.
const ENV_KEYS = ["MM_AGENT_SKILLS_DIR", "MM_GLOBAL_SKILLS_DIR", "MM_TEST_USERINFO_USERNAME"] as const;
const saved = new Map<string, string | undefined>();
for (const k of ENV_KEYS) saved.set(k, process.env[k]);
afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${process.pid}`;

/** A real skill on an agent-local shelf, with the frontmatter the linter demands. */
function seedSkill(name: string, body: string) {
  const root = mkdtempSync(join(tmpdir(), "mm-pcg-"));
  const shelf = join(root, "skills");
  mkdirSync(join(shelf, name), { recursive: true });
  writeFileSync(
    join(shelf, name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when a scripted run fails and the fix must be re-anchored to source.\n---\n\n## When to use\n\nWhen a scripted run fails.\n\n## Procedure\n\n1. Read the error.\n2. Fix the source.\n3. Re-run the command.\n\n## Verification\n\nThe command exits zero.\n\n${body}\n`,
  );
  // The shelf resolver reads MM_AGENT_SKILLS_DIR, not ctx.skillsDir. Getting this wrong made
  // every one of these tests pass against a "no skill" error while proving nothing.
  process.env.MM_AGENT_SKILLS_DIR = shelf;
  return { root, shelf, ctx: { agentId: "pcg-agent" } as any };
}

// ── 1 · publish is sanitized and approved ──────────────────────────────────────

test("claim: publish sanitizes the body — the operator's own identity never reaches the catalog", () => {
  const name = uniq("publish-sanitize");
  // The load-bearing difference between the two functions. catalogPrivacyScan refuses a fixed
  // set of shapes it recognises as private; sanitizeForPublish additionally redacts the REAL
  // operator identity, derived at runtime, which covers every user rather than a hardcoded few.
  // Publish ran the scan and then wrote the ORIGINAL bytes, so the one class of leak that is
  // personal to whoever is running the machine was the class that got through.
  const secret = "jsmith";
  process.env.MM_TEST_USERINFO_USERNAME = secret;
  const { shelf, ctx } = seedSkill(name, `## Pitfalls\n\n- Ask ${secret} on the platform team before rotating the deploy key.`);
  const global = mkdtempSync(join(tmpdir(), "mm-cat-"));
  process.env.MM_GLOBAL_SKILLS_DIR = global;

  let published = "";
  try {
    published = readFileSync(publishSkillToCatalog(name, ctx), "utf8");
  } catch (e) {
    // Refusing outright also satisfies the claim. What must never happen is a clean publish of
    // the raw bytes.
    expect(String(e)).toMatch(/privacy|sanit|approval|blocked/i);
    return;
  } finally {
    delete process.env.MM_TEST_USERINFO_USERNAME;
  }
  expect(published).not.toContain(secret);
  expect(published).toContain("<user>");
});

test("claim: publish requires explicit approval — it is never a silent side effect", () => {
  const src = readFileSync(new URL("../mods/index.ts", import.meta.url), "utf8");
  const start = src.indexOf('a.action === "publish"');
  const block = src.slice(start, start + 1200);
  // Match CODE, never prose. My first version of this grepped the block for /approve|confirm/i
  // and stayed green when the gate was deleted, because the surrounding comment said
  // "unconfirmed". A test that reads its own documentation proves nothing.
  const code = block.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const gate = code.indexOf("a.approve");
  const call = code.indexOf("publishSkillToCatalog");
  expect(gate).toBeGreaterThan(-1);
  // and it must be checked BEFORE the catalog write, not after.
  expect(gate).toBeLessThan(call);
});

// ── 2 · support-file containment ───────────────────────────────────────────────

test("claim: a directory symlink out of the skill root refuses the WRITE, with a visible reason", () => {
  const name = uniq("containment-write");
  const { root, shelf, ctx } = seedSkill(name, "");
  const evil = join(root, "evil_dir");
  mkdirSync(evil, { recursive: true });
  // The exact attack: the support subdir itself is a symlink pointing outside the skill root.
  symlinkSync(evil, join(shelf, name, "references"));

  let reason = "";
  try {
    writeSupportFile(name, "references/notes.md", "payload", ctx);
  } catch (e) {
    reason = String(e);
  }
  expect(reason).toMatch(/symlink|escape|outside|contain/i);
  expect(existsSync(join(evil, "notes.md"))).toBe(false);
});

test("claim: the same escape refuses the REMOVE — quarantine never moves a file we do not own", () => {
  const name = uniq("containment-remove");
  const { root, shelf, ctx } = seedSkill(name, "");
  const evil = join(root, "evil_dir");
  mkdirSync(evil, { recursive: true });
  const victim = join(evil, "notes.md");
  writeFileSync(victim, "not ours");
  symlinkSync(evil, join(shelf, name, "references"));

  let reason = "";
  try {
    removeSupportFile(name, "references/notes.md", ctx);
  } catch (e) {
    reason = String(e);
  }
  expect(reason).toMatch(/symlink|escape|outside|contain/i);
  // The external file must still be there, untouched.
  expect(existsSync(victim)).toBe(true);
  expect(readFileSync(victim, "utf8")).toBe("not ours");
});

test("containment covers ALL skill file writes, not only the verification target", () => {
  const src = readFileSync(new URL("../mods/core.ts", import.meta.url), "utf8");
  // A string-only validator cannot see a symlinked segment. The real check must stat the
  // resolved path, and it must be reached by both the write and the remove path.
  expect(src).toMatch(/realpathSync|lstatSync/);
  const guarded = [...src.matchAll(/export function (writeSupportFile|removeSupportFile)[\s\S]{0,700}?\n}/g)];
  expect(guarded.length).toBe(2);
  for (const g of guarded) expect(g[0]).toMatch(/assertContained|realpathSync|lstatSync/);
});

// ── 3 · no auto-graduate under staged ──────────────────────────────────────────

test("claim: under MM_REFLECT=staged nothing auto-promotes — updates and high-confidence creates included", () => {
  const src = readFileSync(new URL("../mods/autopilot.ts", import.meta.url), "utf8");
  const line = src.match(/const graduate = .*/)?.[0] ?? "";
  expect(line).toBeTruthy();
  // `live` is the only thing that may open the live shelf on the autonomous path. An update or
  // a confident create must not smuggle itself past a staged operator.
  expect(line).not.toMatch(/res\.action === "update"/);
  expect(line).not.toMatch(/isHighConfidenceCreate/);
});

// ── 4 · read-side traversal ────────────────────────────────────────────────────
// Rocky's fourth P0, and the one that needed no symlink at all. `load` is a default
// no-approval action; it joined an unvalidated skill name onto each shelf directory, so a name
// of `../../..` walked straight out and returned a SKILL.md the agent was never granted. The
// write side had a containment story and the read side had none.

test("claim: a '../' skill name refuses the LOAD — read-side containment", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-trav-"));
  const shelf = join(root, "skills");
  mkdirSync(join(shelf, "innocent"), { recursive: true });
  writeFileSync(join(shelf, "innocent", "SKILL.md"), "---\nname: innocent\n---\nfine");
  // A secret one level above the shelf, reachable only by walking out of it.
  mkdirSync(join(root, "secrets"), { recursive: true });
  writeFileSync(join(root, "secrets", "SKILL.md"), "TOP SECRET");

  for (const evil of ["../secrets", "../../etc", "/etc/passwd", "a/b"]) {
    let reason = "";
    try {
      readSkill(shelf, evil);
    } catch (e) {
      reason = String(e);
    }
    expect(reason).toMatch(/unsafe skill name|separator|absolute|dot segment/i);
  }
  // The legitimate name still reads.
  expect(readSkill(shelf, "innocent")).toContain("fine");
});

test("containment covers the READ path as well as the write path", () => {
  const core = readFileSync(new URL("../mods/core.ts", import.meta.url), "utf8");
  expect(core).toMatch(/export function assertSafeSkillName/);
  const rs = core.match(/export function readSkill[^\n]*/)?.[0] ?? "";
  // readSkill now reaches the name check through the directory resolver, which also proves the
  // segment is a real directory rather than a link out of the shelf.
  expect(rs).toMatch(/resolveSkillDir/);
  expect(core).toMatch(/export function resolveSkillDir[\s\S]{0,400}?assertSafeSkillName/);
  // Every load entry point in the tool surface, not just the one that was reported.
  const idx = readFileSync(new URL("../mods/index.ts", import.meta.url), "utf8");
  const finders = [...idx.matchAll(/const findSkillDir = [^\n]*/g)];
  expect(finders.length).toBeGreaterThan(0);
  for (const f of finders) expect(f[0]).toMatch(/assertSafeSkillName/);
});

// ── 5 · the skill DIRECTORY itself is a symlink ────────────────────────────────
// Fourth containment surface, and the reason this one is asserted at the resolution layer
// rather than per call site: the previous three fixes each guarded the call they were reported
// against, and the next reviewer simply found a different accessor. `assertSafeSkillName` proves
// the NAME is one segment; it says nothing about what that segment IS on disk. A skill directory
// that is itself a symlink pointing out of the shelf turns every accessor into an escape.

test("claim: a symlinked skill DIRECTORY refuses the read — no external content is returned", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-sdir-"));
  const shelf = join(root, "skills");
  mkdirSync(shelf, { recursive: true });
  const victim = join(root, "victim");
  mkdirSync(victim, { recursive: true });
  writeFileSync(join(victim, "SKILL.md"), "TOP SECRET EXTERNAL");
  symlinkSync(victim, join(shelf, "innocent"));

  let out = "", reason = "";
  try {
    out = readSkill(shelf, "innocent");
  } catch (e) {
    reason = String(e);
  }
  expect(out).not.toContain("TOP SECRET EXTERNAL");
  expect(reason).toMatch(/containment|symlink|escape|outside/i);
});

test("claim: a symlinked skill DIRECTORY refuses the write — no external file is overwritten", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-sdirw-"));
  const shelf = join(root, "skills");
  mkdirSync(shelf, { recursive: true });
  const victim = join(root, "victim");
  mkdirSync(victim, { recursive: true });
  writeFileSync(join(victim, "SKILL.md"), "ORIGINAL");
  symlinkSync(victim, join(shelf, "innocent"));

  let reason = "";
  try {
    writeSkill(shelf, "innocent", "ATTACKER CONTENT");
  } catch (e) {
    reason = String(e);
  }
  expect(reason).toMatch(/containment|symlink|escape|outside/i);
  expect(readFileSync(join(victim, "SKILL.md"), "utf8")).toBe("ORIGINAL");
});

test("green path: a real skill directory still reads and writes", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-sdirok-"));
  const shelf = join(root, "skills");
  mkdirSync(join(shelf, "real-skill"), { recursive: true });
  writeFileSync(join(shelf, "real-skill", "SKILL.md"), "---\nname: real-skill\n---\nbody");
  expect(readSkill(shelf, "real-skill")).toContain("body");
  writeSkill(shelf, "real-skill", "updated");
  expect(readSkill(shelf, "real-skill")).toBe("updated");
  expect(listSkillNames(shelf)).toEqual(["real-skill"]);
});

test("class: every skill-dir accessor resolves through the guarded layer", () => {
  const src = readFileSync(new URL("../mods/core.ts", import.meta.url), "utf8");
  expect(src).toMatch(/export function resolveSkillDir/);
  // Not per-call-site patches: the accessors must all go through one resolver, so a NEW
  // accessor added later inherits the guard instead of re-opening the class a fifth time.
  for (const fn of ["readSkill", "writeSkill", "skillDirOf"]) {
    // One-liners and block bodies both: take everything up to the next top-level export.
    const m = src.match(new RegExp(`export function ${fn}\\b[\\s\\S]*?(?=\\nexport )`));
    expect(m, `${fn} not found`).toBeTruthy();
    expect(m![0], `${fn} does not resolve through the guard`).toMatch(/resolveSkillDir/);
  }
  // Enumeration must not offer a symlinked entry as a skill in the first place.
  const ls = src.match(/export function listSkillNames[\s\S]{0,400}?\n/)?.[0] ?? "";
  expect(ls).toMatch(/lstatSync|resolveSkillDir|isSymbolicLink/);
});

// ── 6 · containment must not refuse the legitimate case ────────────────────────
// Grok's P1, and an S13-shaped coverage gap in MY tests. assertContained realpath'd the root and
// then measured a LEXICAL path against it, so wherever the shelf sits under a symlinked prefix
// — /tmp -> /private/tmp on macOS is the ordinary case, not an attack — every legitimate write
// computed a relative path like ../../../../tmp/... and was refused.
//
// The suite stayed green with the defect live for two reasons, both mine:
//   1. every fixture used tmpdir(), which on macOS is already canonical (/var/folders/...), and
//   2. no containment test ever called writeSupportFile on the GREEN path — they only asserted
//      that attacks were refused. A guard that refuses everything passes tests like that.
// So these use a /tmp-rooted shelf deliberately, and they exercise success, not just refusal.

test("claim: a legitimate support-file write SUCCEEDS on a non-canonical shelf root", () => {
  // Build the non-canonical root EXPLICITLY rather than borrowing a host quirk. My first version
  // used /tmp and asserted realpath differs — true on macOS, false on Linux CI, so the test that
  // exists to prove "compare like with like" was itself host-dependent. Same family of
  // assumption as the defect it guards.
  const real = mkdtempSync(join(tmpdir(), "mm-noncanon-real-"));
  const root = join(mkdtempSync(join(tmpdir(), "mm-noncanon-link-")), "via-link");
  symlinkSync(real, root);
  expect(realpathSync(root)).not.toBe(root); // now guaranteed on every platform
  const shelf = join(root, "skills");
  const name = "real-skill";
  mkdirSync(join(shelf, name), { recursive: true });
  writeFileSync(join(shelf, name, "SKILL.md"), "---\nname: real-skill\n---\nbody");
  process.env.MM_AGENT_SKILLS_DIR = shelf;

  const written = writeSupportFile(name, "references/notes.md", "legit", { agentId: "a" } as any);
  expect(readFileSync(written, "utf8")).toBe("legit");
  // and it must land INSIDE the shelf, not merely somewhere
  expect(realpathSync(written).startsWith(realpathSync(shelf))).toBe(true);
});

test("claim: the escape is still refused on that same non-canonical root", () => {
  const real = mkdtempSync(join(tmpdir(), "mm-noncanon-esc-real-"));
  const root = join(mkdtempSync(join(tmpdir(), "mm-noncanon-esc-link-")), "via-link");
  symlinkSync(real, root);
  const shelf = join(root, "skills");
  const name = "real-skill";
  mkdirSync(join(shelf, name), { recursive: true });
  writeFileSync(join(shelf, name, "SKILL.md"), "---\nname: real-skill\n---\nbody");
  const evil = join(root, "evil_dir");
  mkdirSync(evil);
  writeFileSync(join(evil, "notes.md"), "not ours");
  symlinkSync(evil, join(shelf, name, "references"));
  process.env.MM_AGENT_SKILLS_DIR = shelf;

  let w = "", r = "";
  try { writeSupportFile(name, "references/pwned.md", "x", { agentId: "a" } as any); } catch (e) { w = String(e); }
  try { removeSupportFile(name, "references/notes.md", { agentId: "a" } as any); } catch (e) { r = String(e); }
  expect(w).toMatch(/containment|symlink/i);
  expect(r).toMatch(/containment|symlink/i);
  expect(existsSync(join(evil, "pwned.md"))).toBe(false);
  expect(readFileSync(join(evil, "notes.md"), "utf8")).toBe("not ours");
});

test("class: containment compares like with like — never a canonical root against a lexical path", () => {
  const src = readFileSync(new URL("../mods/core.ts", import.meta.url), "utf8");
  const fn = src.match(/export function assertContained[\s\S]*?(?=\nexport )/)?.[0] ?? "";
  expect(fn).toBeTruthy();
  // The relative() call must take both operands from one frame. `relative(base, full)` with a
  // realpath'd base and a raw full is the exact defect.
  expect(fn).not.toMatch(/relative\(base,\s*full\)/);
  expect(fn).toMatch(/relative\(resolve\([^)]*\),\s*resolve\([^)]*\)\)/);
});
