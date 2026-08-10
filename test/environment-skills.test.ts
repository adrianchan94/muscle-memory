import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Letta 0.30.9+ (PR #3722 / LET-10735) added an explicit environment skill root supplied by
 * managed listeners via `--skills` or LETTA_SKILLS_DIRECTORY. Letta's own PR #3728 documents the
 * failure this creates: such skills are INVOCABLE via the Skill tool while being ABSENT from the
 * agent's available-skills prompt. If MM cannot see that shelf it abstains while the skill is
 * sitting right there — measured score 69 vs threshold 18 on Letta's own example skill. */
test("environment skill directory (LETTA_SKILLS_DIRECTORY) is on the router's shelf", async () => {
  const root = mkdtempSync(join(tmpdir(), "mm-envskills-"));
  const envDir = join(root, "env-skills");
  mkdirSync(join(envDir, "searching-and-viewing-slack"), { recursive: true });
  writeFileSync(join(envDir, "searching-and-viewing-slack", "SKILL.md"),
    "---\nname: searching-and-viewing-slack\n" +
    "description: Use when you need to search Slack history and view thread messages for a channel.\n---\n");

  const prev = process.env.LETTA_SKILLS_DIRECTORY;
  const prevAgent = process.env.MM_AGENT_SKILLS_DIR;
  const prevGlobal = process.env.MM_GLOBAL_SKILLS_DIR;
  mkdirSync(join(root, "agent"), { recursive: true });
  mkdirSync(join(root, "global"), { recursive: true });
  process.env.MM_AGENT_SKILLS_DIR = join(root, "agent");
  process.env.MM_GLOBAL_SKILLS_DIR = join(root, "global");
  try {
    const mod = await import("../mods/core.ts");
    delete process.env.LETTA_SKILLS_DIRECTORY;
    expect(mod.scanDirs()).not.toContain(envDir);

    process.env.LETTA_SKILLS_DIRECTORY = envDir;
    expect(mod.scanDirs()).toContain(envDir);

    const ap = await import("../mods/autopilot.ts");
    const hits = ap.searchSkills(mod.scanDirs(), "search slack history for a channel and view the thread messages", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].name).toBe("searching-and-viewing-slack");
    expect(ap.pickUpdateTarget(hits, 18)?.name).toBe("searching-and-viewing-slack");

    // A non-existent path must never enter the shelf.
    process.env.LETTA_SKILLS_DIRECTORY = join(root, "does-not-exist");
    expect(mod.scanDirs()).not.toContain(join(root, "does-not-exist"));
  } finally {
    if (prev === undefined) delete process.env.LETTA_SKILLS_DIRECTORY; else process.env.LETTA_SKILLS_DIRECTORY = prev;
    if (prevAgent === undefined) delete process.env.MM_AGENT_SKILLS_DIR; else process.env.MM_AGENT_SKILLS_DIR = prevAgent;
    if (prevGlobal === undefined) delete process.env.MM_GLOBAL_SKILLS_DIR; else process.env.MM_GLOBAL_SKILLS_DIR = prevGlobal;
  }
});
