import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// This file must set its sandbox before importing the mods, but bun shares one process
// across test files: leaving these set redirects every file loaded afterwards. Capture the
// inherited values first, then restore them once this file's tests are done.
const inheritedEnv = { MM_STATE_DIR: process.env.MM_STATE_DIR, MM_GLOBAL_SKILLS_DIR: process.env.MM_GLOBAL_SKILLS_DIR, MEMORY_DIR: process.env.MEMORY_DIR };
afterAll(() => {
  for (const [key, value] of Object.entries(inheritedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

process.env.MM_STATE_DIR = mkdtempSync(join(tmpdir(), "mm-grad-state-"));
process.env.MM_GLOBAL_SKILLS_DIR = join(process.env.MM_STATE_DIR, "global");
process.env.MEMORY_DIR = join(process.env.MM_STATE_DIR, "agent");
mkdirSync(join(process.env.MEMORY_DIR, "skills"), { recursive: true });
mkdirSync(process.env.MM_GLOBAL_SKILLS_DIR, { recursive: true });

const { STAGED_DIR, UI_EVENTS, MM_TAG } = await import("../mods/core");
const { graduationProof, graduateStagedSkill } = await import("../mods/autopilot");

test("graduationProof requires the destination SKILL.md to exist and contain matching frontmatter", () => {
  const shelf = mkdtempSync(join(tmpdir(), "mm-grad-proof-"));
  expect(graduationProof(shelf, "truthy-skill").ok).toBe(false);

  mkdirSync(join(shelf, "truthy-skill"), { recursive: true });
  writeFileSync(join(shelf, "truthy-skill", "SKILL.md"), "---\nname: wrong-skill\ndescription: Use when testing.\n---\n## Procedure\n1. x\n");
  const wrong = graduationProof(shelf, "truthy-skill");
  expect(wrong.ok).toBe(false);
  expect(wrong.reason).toMatch(/frontmatter/i);

  writeFileSync(join(shelf, "truthy-skill", "SKILL.md"), "---\nname: truthy-skill\ndescription: Use when testing.\n---\n## Procedure\n1. x\n");
  const ok = graduationProof(shelf, "truthy-skill");
  expect(ok.ok).toBe(true);
  expect(ok.path.endsWith("truthy-skill/SKILL.md")).toBe(true);
});

test("manual graduate refuses a structurally valid but non-executable thin skill", () => {
  const nm = "thin-graduation-skill";
  mkdirSync(join(STAGED_DIR, nm), { recursive: true });
  writeFileSync(join(STAGED_DIR, nm, "SKILL.md"), `---\nname: ${nm}\ndescription: Use when a thin staged skill should not reach the active shelf.\n---\n## Procedure\n1. Do the thing.\n\n\`\`\`text\nwrite → read back → verify\n\`\`\`\n\n## Verification\n- Check it.\n${MM_TAG}\n`);
  expect(() => graduateStagedSkill(nm, { agent: { id: "test" } })).toThrow(/quality|concreteness/i);
});

test("manual graduate emits skill_graduated only after the active shelf has visible proof", () => {
  const nm = "visible-graduation-skill";
  mkdirSync(join(STAGED_DIR, nm), { recursive: true });
  writeFileSync(join(STAGED_DIR, nm, "SKILL.md"), `---\nname: ${nm}\ndescription: Use when a visible graduation proof is required.\n---\n## Procedure\n1. Prove the write.\n\n\`\`\`text\nnpm test > receipt.txt → read receipt.txt → verify exit 0\n\`\`\`\n\n## Verification\n- Read it back.\n${MM_TAG}\n`);

  const dst = graduateStagedSkill(nm, { agent: { id: "test" } });
  expect(readFileSync(dst, "utf8")).toContain(`name: ${nm}`);
  const events = readFileSync(UI_EVENTS, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const grad = events.find((e) => e.phase === "skill_graduated" && e.skill === nm);
  expect(grad).toBeTruthy();
  expect(graduationProof(join(process.env.MEMORY_DIR!, "skills"), nm).ok).toBe(true);
});
