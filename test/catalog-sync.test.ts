// muscle-memory · local Desktop catalog sync tests.
// Contract: sync graduated/live agent skills into the local Desktop catalog without publishing,
// leaking evidence receipts, dereferencing symlinks, or overwriting another owner by surprise.
import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const GLOBAL = process.env.MM_GLOBAL_SKILLS_DIR || mkdtempSync(join(tmpdir(), "mm-global-fallback-"));
process.env.MM_GLOBAL_SKILLS_DIR = GLOBAL;

const { __mm } = await import("../mods/index");
const TAG = __mm.MM_TAG;

function withMemory<T>(fn: (memoryDir: string) => T): T {
  const oldMemory = process.env.MEMORY_DIR;
  const oldAgentSkills = process.env.MM_AGENT_SKILLS_DIR;
  const memoryDir = mkdtempSync(join(tmpdir(), "mm-memory-"));
  process.env.MEMORY_DIR = memoryDir;
  delete process.env.MM_AGENT_SKILLS_DIR;
  try { return fn(memoryDir); }
  finally {
    if (oldMemory === undefined) delete process.env.MEMORY_DIR;
    else process.env.MEMORY_DIR = oldMemory;
    if (oldAgentSkills === undefined) delete process.env.MM_AGENT_SKILLS_DIR;
    else process.env.MM_AGENT_SKILLS_DIR = oldAgentSkills;
  }
}

function skillDoc(name: string, body = "## Procedure\n- do the thing") {
  return `---\nname: ${name}\ndescription: Use when testing catalog sync safely\n---\n\n${body}\n\n<!-- ${TAG}: test -->\n`;
}

function writeAgentSkill(memoryDir: string, name: string, body?: string) {
  const dir = join(memoryDir, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), skillDoc(name, body));
  return dir;
}

test("catalog sync copies a live MM skill folder but skips evidence receipts and symlinks", () => withMemory((memoryDir) => {
  const name = `catalog-safe-${Date.now()}`;
  const src = writeAgentSkill(memoryDir, name);
  mkdirSync(join(src, "references", "evidence"), { recursive: true });
  writeFileSync(join(src, "references", "evidence", "receipt.json"), '{"private":"receipt"}');
  mkdirSync(join(src, "templates"), { recursive: true });
  writeFileSync(join(src, "templates", "prompt.md"), "safe prompt");
  symlinkSync("/tmp", join(src, "templates", "tmp-link"));

  const res = __mm.syncSkillToDesktopCatalog(name, { agent: { id: "agent-a" } });
  expect(res.status === "synced" || res.status === "partial").toBe(true);
  const target = join(GLOBAL, name);
  expect(existsSync(join(target, "SKILL.md"))).toBe(true);
  expect(existsSync(join(target, "templates", "prompt.md"))).toBe(true);
  expect(existsSync(join(target, "references", "evidence", "receipt.json"))).toBe(false);
  expect(existsSync(join(target, "templates", "tmp-link"))).toBe(false);
  expect(readFileSync(join(target, ".mm-catalog-sync.json"), "utf8")).toContain("agent-a");
  expect(res.skipped?.some((s: any) => s.path === "references/evidence/receipt.json")).toBe(true);
  expect(res.skipped?.some((s: any) => s.path === "templates/tmp-link" && /symlink/.test(s.reason))).toBe(true);
}));

test("catalog sync dry-run does not copy; second real sync noops when byte-identical", () => withMemory((memoryDir) => {
  const name = `catalog-dry-${Date.now()}`;
  writeAgentSkill(memoryDir, name);
  const dry = __mm.syncSkillToDesktopCatalog(name, { agent: { id: "agent-a" } }, { dryRun: true });
  expect(dry.status).toBe("dry_run");
  expect(existsSync(join(GLOBAL, name, "SKILL.md"))).toBe(false);
  const first = __mm.syncSkillToDesktopCatalog(name, { agent: { id: "agent-a" } });
  expect(first.status === "synced" || first.status === "partial").toBe(true);
  const target = join(GLOBAL, name, "SKILL.md");
  const bytesBefore = readFileSync(target);
  const second = __mm.syncSkillToDesktopCatalog(name, { agent: { id: "agent-a" } });
  const bytesAfter = readFileSync(target);
  expect(second.status).toBe("noop");
  expect(bytesAfter.equals(bytesBefore)).toBe(true);
}));

test("catalog sync blocks unmanaged or different-agent catalog collisions unless forced", () => withMemory((memoryDir) => {
  const unmanaged = `catalog-unmanaged-${Date.now()}`;
  writeAgentSkill(memoryDir, unmanaged);
  const unmanagedTarget = join(GLOBAL, unmanaged);
  mkdirSync(unmanagedTarget, { recursive: true });
  writeFileSync(join(unmanagedTarget, "SKILL.md"), `---\nname: ${unmanaged}\ndescription: hand authored\n---\n\nnot mm managed\n`);
  expect(__mm.syncSkillToDesktopCatalog(unmanaged, { agent: { id: "agent-a" } }).status).toBe("blocked_unmanaged");
  const forced = __mm.syncSkillToDesktopCatalog(unmanaged, { agent: { id: "agent-a" } }, { force: true });
  expect(forced.status === "synced" || forced.status === "partial").toBe(true);
  expect(forced.backup).toBeTruthy();

  const sameName = `catalog-collision-${Date.now()}`;
  writeAgentSkill(memoryDir, sameName, "## Procedure\n- agent a version");
  expect(__mm.syncSkillToDesktopCatalog(sameName, { agent: { id: "agent-a" } }).status).not.toMatch(/blocked/);
  const oldMemory = process.env.MEMORY_DIR;
  const otherMemory = mkdtempSync(join(tmpdir(), "mm-memory-other-"));
  process.env.MEMORY_DIR = otherMemory;
  try {
    writeAgentSkill(otherMemory, sameName, "## Procedure\n- agent b version");
    expect(__mm.syncSkillToDesktopCatalog(sameName, { agent: { id: "agent-b" } }).status).toBe("blocked_different_agent");
  } finally {
    process.env.MEMORY_DIR = oldMemory;
  }
}));
