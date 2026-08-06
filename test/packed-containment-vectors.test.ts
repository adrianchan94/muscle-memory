// Containment vectors against the PACKED, INSTALLED bundle — the consumer path, not the library.
//
// These lived in /tmp as standalone driver scripts and were reaped, taking the only copy with
// them. The apparatus that proves the product safe was itself in ephemeral storage. So they now
// live in the repo, run under `npm test`, and are versioned with the code they guard.
//
// Every containment defect this cycle hid behind an accessor nobody exercised. A library call
// passing proves the function is fixed; it does not prove the shipped surface is. These drive
// the built bundle through its registered tools wherever the behaviour is reachable that way.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = join(ROOT, "mods", "index.bundled.mjs");

beforeAll(() => {
  // Guard against grading a stale artifact — but NEVER by building here. A build inside a test
  // file rewrites mods/index.bundled.mjs while sibling files are packing the repo, and my first
  // version did exactly that and took an unrelated privacy test red. Assert freshness, do not
  // manufacture it.
  expect(existsSync(BUNDLE), "run `npm run build` before the suite").toBe(true);
  const bundleAt = statSync(BUNDLE).mtimeMs;
  const newestSource = readdirSync(join(ROOT, "mods"))
    .filter((f) => f.endsWith(".ts"))
    .reduce((max, f) => Math.max(max, statSync(join(ROOT, "mods", f)).mtimeMs), 0);
  expect(bundleAt, "bundle is older than mods/*.ts — run `npm run build`").toBeGreaterThanOrEqual(newestSource);
});

const envs: string[] = [];
afterAll(() => { for (const d of envs) rmSync(d, { recursive: true, force: true }); });

/** A disposable agent seat: HOME, state dir, and a shelf rooted under `base`. */
interface Seat {
  home: string;
  state: string;
  base: string;
  shelf: string;
}

/** A disposable agent env plus, optionally, a shelf whose lexical path is NOT its realpath. */
function seat(nonCanonical: boolean): Seat {
  const home = mkdtempSync(join(tmpdir(), "mm-pv-"));
  envs.push(home);
  const state = join(home, "state");
  mkdirSync(state, { recursive: true });
  let base = join(home, "base");
  mkdirSync(base, { recursive: true });
  if (nonCanonical) {
    const link = join(home, "via-link");
    symlinkSync(base, link);
    base = link;
  }
  const shelf = join(base, "skills");
  mkdirSync(shelf, { recursive: true });
  return { home, state, base, shelf };
}

function seedSkill(shelf: string, name: string) {
  mkdirSync(join(shelf, name), { recursive: true });
  writeFileSync(join(shelf, name, "SKILL.md"), `---\nname: ${name}\ndescription: Use when an exact-match edit fails and the anchor must be refreshed from source.\n---\n\n## When to use\n\nWhen an edit fails.\n\n## Procedure\n\n1. Re-read.\n2. Re-anchor.\n3. Re-run.\n\n## Verification\n\n- The command exits zero.\n`);
}

/** Drive the INSTALLED bundle in a child process; returns whatever the probe prints as JSON. */
function drive(seatDirs: Seat, body: string, advanced = false): any {
  const probe = join(seatDirs.home, `probe-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(probe, `
import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
const mod = await import(${JSON.stringify(BUNDLE)});
const mm = mod.__mm;
const tools = new Map();
await mod.default({
  capabilities: { tools: true, commands: true, permissions: false },
  tools: { register: (t) => { tools.set(t.name, t); return () => {}; } },
  commands: { register: () => () => {} },
  events: { on: () => () => {} },
  ui: {},
});
const out = {};
${body}
console.log("@@" + JSON.stringify(out));
`);
  const env = {
    ...process.env,
    HOME: seatDirs.home,
    MM_STATE_DIR: seatDirs.state,
    MM_AGENT_SKILLS_DIR: seatDirs.shelf,
    MM_GLOBAL_SKILLS_DIR: join(seatDirs.home, "global"),
    // write_file and lifecycle_run live on the ADVANCED surface — the default seat registers
    // only read/prescribe/close. Driving the tool path means opting into the surface that
    // actually exposes it, which is also where Grok found the defect.
    ...(advanced ? { MM_ADVANCED: "on" } : {}),
  };
  const raw = execFileSync("node", [probe], { encoding: "utf8", env });
  const line = raw.split("\n").find((l) => l.startsWith("@@"));
  if (!line) throw new Error(`probe produced no result:\n${raw.slice(-400)}`);
  return JSON.parse(line.slice(2));
}

// ── the availability half: containment must not refuse legitimate work ─────────

test("packed · write_file SUCCEEDS through the shipped tool on a non-canonical shelf root", () => {
  const s = seat(true);
  const name = "recovering-failed-exact-match-edits";
  seedSkill(s.shelf, name);
  const r = drive(s, `
const res = JSON.stringify(await tools.get("muscle_memory_skill_write").run({
  args: { action: "write_file", name: ${JSON.stringify(name)}, file_path: "references/notes.md", file_content: "legit via tool" },
}));
out.refused = /containment|escapes the skill root/i.test(res);
out.res = res.slice(0, 200);
out.tools = [...tools.keys()];
`, true);
  expect(r.tools, "advanced surface must expose the write tool").toContain("muscle_memory_skill_write");
  expect(r.refused, `tool refused a legitimate write: ${r.res}`).toBe(false);
  const landed = join(s.shelf, name, "references", "notes.md");
  expect(existsSync(landed)).toBe(true);
  expect(readFileSync(landed, "utf8")).toBe("legit via tool");
});

// ── the containment half: the escapes must still fail closed ───────────────────

test("packed · a directory symlink still refuses write and remove, on that same root", () => {
  const s = seat(true);
  const name = "recovering-failed-exact-match-edits";
  seedSkill(s.shelf, name);
  const evil = join(s.home, "evil_dir");
  mkdirSync(evil, { recursive: true });
  writeFileSync(join(evil, "victim.md"), "not ours");
  symlinkSync(evil, join(s.shelf, name, "references"));

  const r = drive(s, `
let w = "", rm = "";
try { mm.writeSupportFile(${JSON.stringify(name)}, "references/pwned.md", "x", {}); } catch (e) { w = String(e); }
try { mm.removeSupportFile(${JSON.stringify(name)}, "references/victim.md", {}); } catch (e) { rm = String(e); }
out.writeRefused = /containment|symlink|escape|outside/i.test(w);
out.removeRefused = /containment|symlink|escape|outside/i.test(rm);
`);
  expect(r.writeRefused).toBe(true);
  expect(r.removeRefused).toBe(true);
  expect(existsSync(join(evil, "pwned.md"))).toBe(false);
  expect(readFileSync(join(evil, "victim.md"), "utf8")).toBe("not ours");
});

test("packed · a symlinked skill DIRECTORY leaks nothing through the load tool", () => {
  const s = seat(false);
  const victim = join(s.home, "victim");
  mkdirSync(victim, { recursive: true });
  writeFileSync(join(victim, "SKILL.md"), "TOP SECRET EXTERNAL");
  symlinkSync(victim, join(s.shelf, "planted-link-skill"));

  const r = drive(s, `
const viaTool = JSON.stringify(await tools.get("muscle_memory_skill_read").run({
  args: { action: "load", name: "planted-link-skill" },
}));
let libErr = "", got = "";
try { got = mm.readSkill(process.env.MM_AGENT_SKILLS_DIR, "planted-link-skill"); } catch (e) { libErr = String(e); }
out.toolLeaked = viaTool.includes("TOP SECRET EXTERNAL");
out.libLeaked = got.includes("TOP SECRET EXTERNAL");
out.libRefused = /containment|symlink|escape|outside/i.test(libErr);
out.listed = mm.listSkillNames(process.env.MM_AGENT_SKILLS_DIR).includes("planted-link-skill");
`);
  expect(r.toolLeaked).toBe(false);
  expect(r.libLeaked).toBe(false);
  expect(r.libRefused).toBe(true);
  expect(r.listed).toBe(false);
});

test("packed · a '../' skill name cannot load a SKILL.md from outside the shelf", () => {
  const s = seat(false);
  const secrets = join(s.base, "secrets");
  mkdirSync(secrets, { recursive: true });
  writeFileSync(join(secrets, "SKILL.md"), "TOP SECRET TRAVERSAL");

  const r = drive(s, `
out.leaks = [];
for (const evil of ["../secrets", "../../etc", "/etc/passwd", "a/b"]) {
  const res = JSON.stringify(await tools.get("muscle_memory_skill_read").run({ args: { action: "load", name: evil } }));
  if (res.includes("TOP SECRET TRAVERSAL")) out.leaks.push(evil);
}
`);
  expect(r.leaks).toEqual([]);
});

// ── the green path, kept honest ────────────────────────────────────────────────

test("packed · real skill directories still read, write and enumerate", () => {
  const s = seat(false);
  seedSkill(s.shelf, "real-skill");
  const r = drive(s, `
out.read = mm.readSkill(process.env.MM_AGENT_SKILLS_DIR, "real-skill").includes("## Procedure");
mm.writeSkill(process.env.MM_AGENT_SKILLS_DIR, "second-real-skill", "---\\nname: second-real-skill\\n---\\nbody");
out.wrote = mm.readSkill(process.env.MM_AGENT_SKILLS_DIR, "second-real-skill").includes("body");
out.names = mm.listSkillNames(process.env.MM_AGENT_SKILLS_DIR).sort();
`);
  expect(r.read).toBe(true);
  expect(r.wrote).toBe(true);
  expect(r.names).toEqual(["real-skill", "second-real-skill"]);
});
