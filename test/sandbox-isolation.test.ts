import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// The module-level fail-closed guard cannot be exercised via import inside this
// suite (core is already loaded with a sandbox); use a subprocess for load-time cases.
const CORE = join(import.meta.dir, "..", "mods", "core.ts");
function loadCore(env: Record<string, string | undefined>) {
  return spawnSync("bun", ["-e", `await import(${JSON.stringify(CORE)}); console.log("LOADED");`], {
    env: { ...process.env, ...env } as Record<string, string>,
    encoding: "utf8",
  });
}

test("agentSkillsDir honors MM_AGENT_SKILLS_DIR as highest priority (beats MEMORY_DIR)", async () => {
  const root = mkdtempSync(join(tmpdir(), "mm-agent-skills-"));
  const shelf = join(root, "agent-shelf");
  mkdirSync(shelf, { recursive: true });
  const prevA = process.env.MM_AGENT_SKILLS_DIR;
  const prevM = process.env.MEMORY_DIR;
  try {
    process.env.MM_AGENT_SKILLS_DIR = shelf;
    process.env.MEMORY_DIR = join(root, "other-memory");
    const { agentSkillsDir } = await import("../mods/core.ts");
    expect(agentSkillsDir()).toBe(shelf);
  } finally {
    if (prevA === undefined) delete process.env.MM_AGENT_SKILLS_DIR; else process.env.MM_AGENT_SKILLS_DIR = prevA;
    if (prevM === undefined) delete process.env.MEMORY_DIR; else process.env.MEMORY_DIR = prevM;
    rmSync(root, { recursive: true, force: true });
  }
});

test("agentSkillsDir falls back to MEMORY_DIR/skills when override unset", async () => {
  const root = mkdtempSync(join(tmpdir(), "mm-memfall-"));
  const prevA = process.env.MM_AGENT_SKILLS_DIR;
  const prevM = process.env.MEMORY_DIR;
  try {
    delete process.env.MM_AGENT_SKILLS_DIR;
    process.env.MEMORY_DIR = root;
    const { agentSkillsDir } = await import("../mods/core.ts");
    expect(agentSkillsDir()).toBe(join(root, "skills"));
  } finally {
    if (prevA === undefined) delete process.env.MM_AGENT_SKILLS_DIR; else process.env.MM_AGENT_SKILLS_DIR = prevA;
    if (prevM === undefined) delete process.env.MEMORY_DIR; else process.env.MEMORY_DIR = prevM;
    rmSync(root, { recursive: true, force: true });
  }
});

test("NODE_ENV=test FAILS CLOSED at module load without MM_AGENT_SKILLS_DIR or MEMORY_DIR", () => {
  const state = mkdtempSync(join(tmpdir(), "mm-state-"));
  const res = loadCore({ NODE_ENV: "test", MM_STATE_DIR: state, MM_AGENT_SKILLS_DIR: undefined, MEMORY_DIR: undefined });
  expect(res.stdout).not.toContain("LOADED");
  expect(res.stderr).toMatch(/agent-shelf sandbox/);
  rmSync(state, { recursive: true, force: true });
});

test("NODE_ENV=test loads cleanly WITH MM_AGENT_SKILLS_DIR sandbox", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-ok-"));
  const res = loadCore({ NODE_ENV: "test", MM_STATE_DIR: join(root, "state"), MM_AGENT_SKILLS_DIR: join(root, "shelf") });
  expect(res.stdout).toContain("LOADED");
  rmSync(root, { recursive: true, force: true });
});
