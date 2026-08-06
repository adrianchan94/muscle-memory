// mods/index.ts
import { mkdirSync as mkdirSync10, readFileSync as readFileSync12, existsSync as existsSync12, writeFileSync as writeFileSync10, readdirSync as readdirSync4 } from "node:fs";
import { join as join14 } from "node:path";
import { randomBytes as randomBytes2 } from "node:crypto";

// mods/core.ts
import { appendFileSync, copyFileSync, lstatSync, mkdirSync, readFileSync, existsSync, writeFileSync, readdirSync, renameSync, rmSync, realpathSync } from "node:fs";
import { join, dirname, relative, isAbsolute, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
if (false) {}
if (false) {}
var STATE_DIR = process.env.MM_STATE_DIR || join(homedir(), ".letta", "muscle-memory");
var LOG_PATH = join(STATE_DIR, "experience.jsonl");
var SESSIONS_PATH = join(STATE_DIR, "sessions.jsonl");
function globalSkillsDir() {
  return process.env.MM_GLOBAL_SKILLS_DIR || join(homedir(), ".letta", "skills");
}
var SECRETISH = /(?:key|token|secret|password|passwd|auth|bearer|cookie|api[_-]?key)/i;
var LONG_OPAQUE = /\b[A-Za-z0-9_\-]{24,}\b/g;
var HEXID = /\b[0-9a-f]{7,}\b/gi;
var ABS_PATH = /(?:\/[\w.\-~ ]+){2,}/g;
var QUOTED = /(['"])(?:\\.|(?!\1).)*\1/g;
var SECRET_ASSIGN = /\b(?=[A-Za-z_][A-Za-z0-9_]*\s*=)(?=[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|COOKIE|BEARER|API[_-]?KEY|APIKEY))[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s;&]+)/gi;
var SECRET_QUERY = /([?&])(?:access[_-]?token|refresh[_-]?token|api[_-]?key|apikey|key|token|secret|password|passwd|auth|cookie|bearer)=([^&\s]+)/gi;
var SECRET_FLAG = /--(?:api[_-]?key|apikey|key|token|secret|password|passwd|auth|cookie|bearer)(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s;&]+)/gi;
var SECRET_HEADER = /\b(?:authorization|cookie|x-api-key|api-key)\s*:\s*(?:"[^"]*"|'[^']*'|[^\s;&]+)/gi;
var NUM = /\b\d+\b/g;
function scrubSecrets(t) {
  t = t.replace(/\b(?:bearer|token|apikey|api[_-]?key)\s+[^\s;&"']+/gi, "<cred> <redacted>");
  t = t.replace(/([a-z][a-z0-9+.\-]*:\/\/)[^/\s:@]+(?::[^/\s@]+)?@/gi, "$1<cred>@");
  t = t.replace(/\b((?:aws[_-]?)?(?:secret|password|passwd|token|api[_-]?key|access[_-]?key(?:[_-]?id)?|auth)[a-z0-9_]*)\s+(["']?)[^\s"';|&]{3,}\2/gi, "$1 <redacted>");
  t = t.replace(/(^|\s)(--?user|-u)[=\s]+("?)[^\s"':;|&]+:[^\s"';|&]+\3/gi, "$1$2 <redacted>");
  t = t.replace(/(^|\s)(--?(?:password|passwd|token|access[-_]?token|api[-_]?key))[=\s]+\S+/gi, "$1$2 <redacted>");
  t = t.replace(/(^|\s)-p(?=\S)\S+/g, "$1-p <redacted>");
  t = t.replace(/\b(?:AKIA|ASIA|AIza|ghp_|gho_|ghu_|ghs_|github_pat_|glpat-|xox[baprs]-|sk-[A-Za-z0-9]*-?|eyJ)[A-Za-z0-9_\-.]{6,}/g, "<id>");
  t = t.replace(SECRET_ASSIGN, "<cred>=<redacted>");
  t = t.replace(SECRET_QUERY, "$1<cred>=<redacted>");
  t = t.replace(SECRET_FLAG, "--<cred>=<redacted>");
  t = t.replace(SECRET_HEADER, "<cred>:<redacted>");
  return t;
}
function redactFragment(text, maxLines = 8, maxChars = 320) {
  const lines = String(text ?? "").split(/\r?\n/).slice(0, maxLines).map((ln) => {
    let s = scrubSecrets(ln);
    s = s.replace(ABS_PATH, "<path>");
    s = s.replace(/\b[A-Za-z0-9_\-]{28,}\b/g, "<id>");
    s = s.replace(/\b[0-9a-f]{12,}\b/gi, "<id>");
    return s.replace(/[ \t]+/g, " ").replace(/\s+$/, "");
  });
  return lines.join(`
`).replace(/\n{3,}/g, `

`).trim().slice(0, maxChars);
}
function hash(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
var MM = {
  MIN_COUNT: 3,
  MIN_CONVS: 2,
  STRONG_SINGLE: 8,
  MATURE_AT: 3,
  NGRAM: 2,
  W_FREQ: 1,
  W_SPREAD: 1.5,
  W_FIX: 2
};
function ensureDir() {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
  } catch {}
}
function appendJsonl(path, row) {
  try {
    ensureDir();
    appendFileSync(path, JSON.stringify(row) + `
`);
  } catch {}
}
function loadRows(path = LOG_PATH) {
  if (!existsSync(path))
    return [];
  const rows = [];
  for (const line of readFileSync(path, "utf8").split(`
`)) {
    if (!line)
      continue;
    try {
      rows.push(JSON.parse(line));
    } catch {}
  }
  return rows;
}
var MM_TAG = "muscle-memory provenance";
var FIXTURE_SKILL_RE = /^ref-skill-/;
function agentSkillsDir(ctx) {
  if (process.env.MM_AGENT_SKILLS_DIR)
    return process.env.MM_AGENT_SKILLS_DIR;
  if (process.env.MEMORY_DIR)
    return join(process.env.MEMORY_DIR, "skills");
  const id = ctx?.agent?.id || ctx?.agentId;
  if (id) {
    const projected = join(homedir(), ".letta", "agents", id, "memory", "skills");
    if (existsSync(join(homedir(), ".letta", "agents", id, "memory")))
      return projected;
    const local = join(homedir(), ".letta", "lc-local-backend", "memfs", id, "memory", "skills");
    if (existsSync(join(homedir(), ".letta", "lc-local-backend", "memfs", id)))
      return local;
  }
  return globalSkillsDir();
}
function scanDirs(ctx) {
  return [...new Set([agentSkillsDir(ctx), globalSkillsDir()])];
}
function skillShelves(ctx) {
  const agent = agentSkillsDir(ctx);
  const shelves = [{ name: "agent", dir: agent, writable: true, autonomous: true, priority: 20 }];
  if (globalSkillsDir() !== agent)
    shelves.push({ name: "global", dir: globalSkillsDir(), writable: false, autonomous: false, priority: 10 });
  return shelves;
}
function autonomousShelves(ctx) {
  return skillShelves(ctx).filter((s) => s.autonomous).map((s) => s.dir);
}
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}
function listSkillNames(dir) {
  try {
    return readdirSync(dir).filter((n) => {
      try {
        if (lstatSync(join(dir, n)).isSymbolicLink())
          return false;
      } catch {
        return false;
      }
      return existsSync(join(dir, n, "SKILL.md"));
    });
  } catch {
    return [];
  }
}
function assertSafeSkillName(name) {
  const n = String(name ?? "").trim();
  if (!n)
    throw new Error("skill name required");
  if (n === "." || n === "..")
    throw new Error(`unsafe skill name '${n}': dot segment`);
  if (/[\\/]/.test(n))
    throw new Error(`unsafe skill name '${n}': path separators are not allowed in a skill name`);
  if (isAbsolute(n) || /^[A-Za-z]:/.test(n) || n.startsWith("~"))
    throw new Error(`unsafe skill name '${n}': absolute paths are not allowed`);
  if (n.includes("\x00"))
    throw new Error(`unsafe skill name: null byte`);
  return n;
}
function resolveSkillDir(root, name) {
  assertSafeSkillName(name);
  const full = join(root, name);
  let st;
  try {
    st = lstatSync(full);
  } catch {
    return full;
  }
  if (st.isSymbolicLink()) {
    let target = "";
    try {
      target = realpathSync(full);
    } catch {
      throw new Error(`containment: skill dir '${name}' is a broken symlink — refusing`);
    }
    let outside = true;
    try {
      const rel = relative(realpathSync(root), target);
      outside = !rel || rel.startsWith("..") || isAbsolute(rel);
    } catch {}
    throw new Error(`containment: skill dir '${name}' is a symlink${outside ? ` escaping the shelf root (${target})` : ""} — refusing`);
  }
  return full;
}
function resolveSkillFile(root, name, file = "SKILL.md") {
  const dir = resolveSkillDir(root, name);
  const full = join(dir, file);
  let st;
  try {
    st = lstatSync(full);
  } catch {
    return full;
  }
  if (st.isSymbolicLink())
    throw new Error(`containment: '${name}/${file}' is a symlink — refusing`);
  return full;
}
function readSkill(dir, name) {
  const sf = resolveSkillFile(dir, name);
  try {
    return readFileSync(sf, "utf8");
  } catch {
    return "";
  }
}
function skillDesc(dir, name) {
  return (readSkill(dir, name).match(/description:\s*(.+)/)?.[1] || "").trim();
}
function isManaged(dir, name) {
  return readSkill(dir, name).includes(MM_TAG);
}
function writeSkill(dir, name, content) {
  const sd = resolveSkillDir(dir, name);
  mkdirSync(sd, { recursive: true });
  resolveSkillDir(dir, name);
  const target = resolveSkillFile(dir, name);
  const tmp = join(sd, ".SKILL.md.tmp");
  writeFileSync(tmp, content);
  renameSync(tmp, target);
  return target;
}
var CATALOG_SYNC_DIR = join(STATE_DIR, "catalog-sync");
var CATALOG_SYNC_BACKUP_DIR = join(CATALOG_SYNC_DIR, "backups");
var CATALOG_SYNC_META = ".mm-catalog-sync.json";
var CATALOG_SYNC_BACKUPS_PER_SKILL = 3;
function sourceAgentId(ctx) {
  return String(ctx?.agent?.id || ctx?.agentId || process.env.AGENT_ID || "").trim() || null;
}
function readCatalogSyncMeta(skill) {
  try {
    const meta = JSON.parse(readFileSync(join(globalSkillsDir(), skill, CATALOG_SYNC_META), "utf8"));
    return meta && typeof meta === "object" ? meta : null;
  } catch {
    return null;
  }
}
function writeCatalogSyncReceipt(result) {
  try {
    mkdirSync(CATALOG_SYNC_DIR, { recursive: true });
    const file = join(CATALOG_SYNC_DIR, `${Date.now()}-${result.skill}.json`);
    writeFileSync(file, JSON.stringify({ ...result, ts: Date.now() }, null, 2));
  } catch {}
}
function readTextIfSafe(file) {
  try {
    const buf = readFileSync(file);
    if (buf.includes(0))
      return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}
function normalizedSkillForCompare(file) {
  return (readTextIfSafe(file) || "").replace(/\n?<!-- muscle-memory desktop-catalog-sync:[\s\S]*?-->\n?/g, `
`).trim();
}
function sameSkillFile(a, b) {
  try {
    return normalizedSkillForCompare(a) === normalizedSkillForCompare(b);
  } catch {
    return false;
  }
}
function pruneCatalogBackups(skill) {
  try {
    if (!existsSync(CATALOG_SYNC_BACKUP_DIR))
      return;
    const matches = readdirSync(CATALOG_SYNC_BACKUP_DIR).filter((n) => n === skill || n.startsWith(`${skill}-`)).sort().reverse();
    for (const old of matches.slice(CATALOG_SYNC_BACKUPS_PER_SKILL))
      rmSync(join(CATALOG_SYNC_BACKUP_DIR, old), { recursive: true, force: true });
  } catch {}
}
function shouldSkipCatalogPath(rel) {
  if (!rel || rel === CATALOG_SYNC_META)
    return "internal catalog metadata";
  if (rel === "RETIRE-REASON.txt")
    return "retire receipt";
  if (/^references\/evidence\//.test(rel))
    return "evidence receipts stay agent-local";
  if (rel.split("/").some((part) => part.startsWith(".")))
    return "dotfile/temporary file";
  return null;
}
function copySkillFolderFiltered(srcDir, target, meta) {
  const copied = [];
  const skipped = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const src = join(dir, entry.name);
      const rel = relative(srcDir, src).replace(/\\/g, "/");
      const skipReason = shouldSkipCatalogPath(rel);
      if (skipReason) {
        skipped.push({ path: rel, reason: skipReason });
        continue;
      }
      let stat;
      try {
        stat = lstatSync(src);
      } catch {
        skipped.push({ path: rel, reason: "unreadable" });
        continue;
      }
      if (stat.isSymbolicLink()) {
        skipped.push({ path: rel, reason: "symlink skipped" });
        continue;
      }
      if (stat.isDirectory()) {
        walk(src);
        continue;
      }
      if (!stat.isFile()) {
        skipped.push({ path: rel, reason: "not a regular file" });
        continue;
      }
      if (rel !== "SKILL.md") {
        const v = validateSupportPath(rel);
        if (!v.ok) {
          skipped.push({ path: rel, reason: v.reason || "invalid support path" });
          continue;
        }
        const text = readTextIfSafe(src);
        if (text !== null) {
          const sc = scanSupportFile(rel, text);
          if (!sc.ok) {
            skipped.push({ path: rel, reason: `security: ${sc.issues.join("; ")}` });
            continue;
          }
        } else if (!/^assets\//.test(rel)) {
          skipped.push({ path: rel, reason: "binary/non-text support file outside assets" });
          continue;
        }
      } else {
        const text = readTextIfSafe(src) || "";
        const sc = scanSkillContent(text);
        if (!sc.ok) {
          skipped.push({ path: rel, reason: `security: ${sc.issues.join("; ")}` });
          continue;
        }
      }
      const dst = join(target, rel);
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
      copied.push(rel);
    }
  };
  walk(srcDir);
  writeFileSync(join(target, CATALOG_SYNC_META), JSON.stringify(meta, null, 2));
  return { copied, skipped };
}
function syncSkillToDesktopCatalog(name, ctx, opts = {}) {
  const nm = slug(name);
  if (!nm)
    return { status: "error", skill: nm, reason: "name required" };
  const srcRoot = agentSkillsDir(ctx);
  const srcDir = existsSync(join(srcRoot, nm, "SKILL.md")) ? join(srcRoot, nm) : scanDirs(ctx).filter((d) => d !== globalSkillsDir()).map((d) => join(d, nm)).find((d) => existsSync(join(d, "SKILL.md")));
  if (!srcDir)
    return { status: "missing", skill: nm, reason: "no agent skill to sync" };
  const target = join(globalSkillsDir(), nm);
  const srcSkill = join(srcDir, "SKILL.md");
  const dstSkill = join(target, "SKILL.md");
  const sourceAgent = sourceAgentId(ctx);
  const targetMeta = readCatalogSyncMeta(nm);
  const targetAgent = targetMeta?.sourceAgent ?? null;
  if (srcDir === target)
    return { status: "noop", skill: nm, source: srcDir, target, sourceAgent, targetAgent, reason: "source already is desktop catalog" };
  if (existsSync(dstSkill) && sameSkillFile(srcSkill, dstSkill) && (!targetAgent || targetAgent === sourceAgent)) {
    return { status: "noop", skill: nm, source: srcDir, target, sourceAgent, targetAgent, reason: "already in sync" };
  }
  if (existsSync(dstSkill) && !isManaged(globalSkillsDir(), nm) && !opts.force) {
    return { status: "blocked_unmanaged", skill: nm, source: srcDir, target, sourceAgent, targetAgent, reason: "target catalog skill is not muscle-memory-managed; pass force to replace" };
  }
  if (existsSync(dstSkill) && targetAgent && sourceAgent && targetAgent !== sourceAgent && !opts.force) {
    return { status: "blocked_different_agent", skill: nm, source: srcDir, target, sourceAgent, targetAgent, reason: `target catalog skill was synced by ${targetAgent}; pass force to replace` };
  }
  if (existsSync(dstSkill) && isManaged(globalSkillsDir(), nm) && !targetAgent && !opts.force && !sameSkillFile(srcSkill, dstSkill)) {
    return { status: "blocked_different_agent", skill: nm, source: srcDir, target, sourceAgent, targetAgent, reason: "target catalog skill has no source-agent metadata; pass force to replace" };
  }
  if (opts.dryRun)
    return { status: "dry_run", skill: nm, source: srcDir, target, sourceAgent, targetAgent, backup: existsSync(target) ? "would-back-up-target" : null };
  let backup = null;
  try {
    mkdirSync(globalSkillsDir(), { recursive: true });
    if (existsSync(target)) {
      mkdirSync(CATALOG_SYNC_BACKUP_DIR, { recursive: true });
      backup = join(CATALOG_SYNC_BACKUP_DIR, `${nm}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
      renameSync(target, backup);
    }
    mkdirSync(target, { recursive: true });
    const meta = { skill: nm, source: srcDir, sourceAgent, syncedAt: new Date().toISOString() };
    const { copied, skipped } = copySkillFolderFiltered(srcDir, target, meta);
    if (!copied.includes("SKILL.md"))
      throw new Error("SKILL.md was not copied");
    pruneCatalogBackups(nm);
    const result = { status: skipped.length ? "partial" : "synced", skill: nm, source: srcDir, target, backup, copied, skipped, sourceAgent, targetAgent };
    writeCatalogSyncReceipt(result);
    appendUiEvent({ phase: "skill_catalog_synced", summary: `synced '${nm}' to local Desktop catalog`, skill: nm, action: "catalog_sync", route: "desktop-catalog" });
    return result;
  } catch (e) {
    try {
      rmSync(target, { recursive: true, force: true });
      if (backup && existsSync(backup))
        renameSync(backup, target);
    } catch {}
    const result = { status: "error", skill: nm, source: srcDir, target, backup, sourceAgent, targetAgent, reason: String(e?.message ?? e) };
    writeCatalogSyncReceipt(result);
    return result;
  }
}
var OUTCOME_PATH = join(STATE_DIR, "outcomes.jsonl");
var TELEMETRY_PATH = join(STATE_DIR, "telemetry.json");
var RECEIPTS_DIR = join(STATE_DIR, "receipts");
function loadOutcomes() {
  if (!existsSync(OUTCOME_PATH))
    return [];
  const out = [];
  for (const l of readFileSync(OUTCOME_PATH, "utf8").split(`
`)) {
    if (!l)
      continue;
    try {
      out.push(JSON.parse(l));
    } catch {}
  }
  return out;
}
function loadExperience() {
  return inferOutcomes(correlateOutcomes(loadRows(), loadOutcomes()));
}
var PUBLISH_STAGED_DIR = join(STATE_DIR, "publish-staged");
var USAGE_PATH = join(STATE_DIR, "skill-usage.json");
var NEOCORTEX_BLOCK = "muscle_memory";
var SECRET_TOKEN_RE = /\b(?:(?:sk|pk|ghp|gho|ghu|ghs|xox[baprs])[-_][A-Za-z0-9]{12,}|sk-ant-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,})\b/;
var SECRET_LABEL_RE = /(?:^|[^A-Za-z0-9])[A-Za-z0-9_.-]*(?:secret|passwd|password|token|api[_-]?key)[A-Za-z0-9_.-]*\s*[:=]\s*["']?[^\s"'<>]{6,}/i;
function scanSkillContent(content) {
  const c = String(content || "");
  const issues = [];
  if (SECRET_TOKEN_RE.test(c) || /\b(?:authorization|api[_-]?key|secret|password)\s*[:=]\s*["']?[^\s"'<>]{6,}/i.test(c) || SECRET_LABEL_RE.test(c) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(c))
    issues.push("secret-looking credential");
  if (/\bcurl\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/i.test(c) || /\bwget\b[^\n|]*\|\s*(?:ba)?sh\b/i.test(c))
    issues.push("pipe-to-shell (curl|sh)");
  if (/\brm\s+-[rf]{1,2}\s+(?:["']?[~/]|\$HOME|\*)/.test(c))
    issues.push("naked rm -rf on root/home/glob");
  if (/(?:^|[\s;&|])sudo\s+\S/i.test(c))
    issues.push("sudo command");
  if (Math.ceil(c.length / 4) > 5000)
    issues.push("body > 5000 tokens (decompose into references/)");
  if (/\bignore\s+(?:all\s+|the\s+)?(?:previous|prior|above)\s+(?:instructions|messages|prompts|rules)\b/i.test(c) || /\b(?:disregard|override)\s+(?:your\s+|the\s+)?(?:system|previous)\s+(?:prompt|instructions)\b/i.test(c))
    issues.push("prompt-injection phrasing");
  if (/<\/?muscle-memory-skill\b/i.test(c) || /(?:<\/?(?:system|assistant|user)>|\[(?:system|assistant)\]\s*:?)\s*[^<\n]{0,80}\b(?:you\s+are\s+now|new\s+instructions?|ignore|disregard|override)\b/i.test(c) || /\bpublish\s+this\s+skill\s+(?:anyway|without\s+review|now\b|regardless)/i.test(c))
    issues.push("prompt-injection / context-escape directive");
  if (/\b(?:sk-ant-[a-zA-Z0-9-]{8,}|sk-[a-zA-Z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,})\b/.test(c))
    issues.push("hardcoded API key/token");
  if (/\$\([^)]*(?:cat|head|tail|less)[^)]*(?:\.ssh|id_rsa|\.env|\.aws|credentials|\.netrc|passwd|secret|token)/i.test(c) || /(?:curl|wget|nc|ncat)\b[^\n]*(?:\$\(|`)[^\n]*(?:cat|\.ssh|\.env|credentials|secret)/i.test(c))
    issues.push("credential exfiltration pattern");
  if (/\beval\s*\(\s*(?:atob|Buffer\.from|decodeURIComponent|unescape)\s*\(/i.test(c) || /\bbase64\s+-d\b[^\n]*\|\s*(?:ba)?sh\b/i.test(c) || /\b(?:python3?|node|ruby|perl)\b[^\n]*\s-[ec]\b[^\n]*(?:atob|base64|exec\(|eval)/i.test(c))
    issues.push("obfuscated code execution");
  return { ok: issues.length === 0, issues };
}
function scanSupportFile(path, content) {
  const issues = [...scanSkillContent(content).issues];
  if (/\.(?:sh|mjs|cjs|js|ts|py|rb)$/i.test(path)) {
    const testDemo = /\b(?:test|demo|smoke|example|fixture)\b/i.test(path) || /\b(?:test|demo|smoke|example)\b/i.test(String(content).slice(0, 240));
    if (!testDemo && /\b(?:curl|wget|fetch\s*\(|https?:\/\/|rm\s+-[rf]|dd\s+if=|mkfs|>\s*\/dev\/)\b/i.test(content))
      issues.push("support script runs network/destructive ops without test/demo marking");
  }
  return { ok: issues.length === 0, issues };
}
var SUPPORT_SUBDIRS = new Set(["references", "templates", "scripts", "assets"]);
function validateSupportPath(filePath) {
  const p = String(filePath || "");
  if (!p)
    return { ok: false, reason: "file_path required" };
  if (p.includes(".."))
    return { ok: false, reason: "path traversal ('..') blocked" };
  if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("~"))
    return { ok: false, reason: "absolute/home path blocked" };
  const parts = p.split("/").filter(Boolean);
  if (parts.length < 2)
    return { ok: false, reason: "provide subdir/filename" };
  if (!SUPPORT_SUBDIRS.has(parts[0]))
    return { ok: false, reason: `must be under: ${[...SUPPORT_SUBDIRS].join(", ")}` };
  if (parts.some((s) => s.startsWith(".")))
    return { ok: false, reason: "dotfiles/segments blocked" };
  return { ok: true };
}
function skillDirOf(name, ctx) {
  return scanDirs(ctx).find((d) => {
    try {
      return existsSync(join(resolveSkillDir(d, name), "SKILL.md"));
    } catch {
      return false;
    }
  }) ?? null;
}
function assertContained(root, full) {
  const base = realpathSync(root);
  const rel = relative(resolve(root), resolve(full));
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw new Error(`containment: '${rel || full}' escapes the skill root`);
  let cur = base;
  for (const seg of rel.split(sep)) {
    cur = join(cur, seg);
    let st;
    try {
      st = lstatSync(cur);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) {
      let target = "";
      try {
        target = realpathSync(cur);
      } catch {
        throw new Error(`containment: '${seg}' is a broken symlink — refusing`);
      }
      const tRel = relative(base, target);
      const outside = tRel.startsWith("..") || isAbsolute(tRel);
      throw new Error(`containment: '${seg}' is a symlink${outside ? ` pointing outside the skill root (${target})` : ""} — refusing`);
    }
  }
}
function writeSupportFile(name, filePath, content, ctx) {
  const v = validateSupportPath(filePath);
  if (!v.ok)
    throw new Error(v.reason);
  const sc = scanSupportFile(filePath, content);
  if (!sc.ok)
    throw new Error(`security: ${sc.issues.join("; ")}`);
  const d = skillDirOf(name, ctx);
  if (!d)
    throw new Error(`no skill '${name}'`);
  const full = resolveSkillFile(d, name, filePath);
  assertContained(join(d, name), full);
  mkdirSync(dirname(full), { recursive: true });
  assertContained(join(d, name), full);
  const tmp = full + ".mmtmp";
  writeFileSync(tmp, content);
  renameSync(tmp, full);
  return full;
}
function removeSupportFile(name, filePath, ctx) {
  const v = validateSupportPath(filePath);
  if (!v.ok)
    throw new Error(v.reason);
  const d = skillDirOf(name, ctx);
  if (!d)
    throw new Error(`no skill '${name}'`);
  const full = join(d, name, filePath);
  assertContained(join(d, name), full);
  if (!existsSync(full))
    throw new Error(`no such support file`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const grave = join(STATE_DIR, "removed-files", name, `${filePath.replace(/\//g, "__")}-${stamp}`);
  mkdirSync(dirname(grave), { recursive: true });
  renameSync(full, grave);
  return grave;
}
var STAGED_DIR = join(STATE_DIR, "staged");
function createDedupeSurface(ctx) {
  return [...new Set([...scanDirs(ctx), STAGED_DIR])];
}
var STAGED_RETIRED_DIR = join(STATE_DIR, "staged-retired");
var AUTOPILOT_STATE = join(STATE_DIR, "autopilot-state.json");
var UI_EVENTS = join(STATE_DIR, "ui-events.jsonl");
var UI_STATE = join(STATE_DIR, "ui-state.json");
var REFLECT_HANDLED = join(STATE_DIR, "reflect-handled.json");
function appendUiEvent(e) {
  try {
    ensureDir();
    appendJsonl(UI_EVENTS, { ts: Date.now(), source: "muscle-memory", ...e });
  } catch {}
}
var livePanel = null;
function setLivePanel(p) {
  livePanel = p;
}
var panelUpdatePending = false;
function writeUiState(s) {
  try {
    ensureDir();
    writeFileSync(UI_STATE, JSON.stringify({ phase: "", last: "", skill: "", route: "", subject: "", detail: "", ...s, ts: Date.now() }));
  } catch {}
  if (livePanel && !panelUpdatePending) {
    panelUpdatePending = true;
    setTimeout(() => {
      panelUpdatePending = false;
      try {
        livePanel?.update();
      } catch {}
    }, 100);
  }
}
function readUiState() {
  try {
    return existsSync(UI_STATE) ? JSON.parse(readFileSync(UI_STATE, "utf8")) : {};
  } catch {
    return {};
  }
}
function loadUiEvents(n = 8) {
  if (!existsSync(UI_EVENTS))
    return [];
  const out = [];
  for (const l of readFileSync(UI_EVENTS, "utf8").trim().split(`
`)) {
    if (!l)
      continue;
    try {
      out.push(JSON.parse(l));
    } catch {}
  }
  return out.slice(-n);
}
var MESH_FEED = process.env.MM_MESH_FEED || (process.env.MM_STATE_DIR ? join(STATE_DIR, "mesh-skill-feed.jsonl") : join(homedir(), ".local", "state", "mesh-skill-feed.jsonl"));
function meshAgentLabel() {
  return process.env.MM_AGENT || "agent";
}
function appendMeshFeed(e) {
  try {
    mkdirSync(dirname(MESH_FEED), { recursive: true });
    appendFileSync(MESH_FEED, JSON.stringify({ agent: meshAgentLabel(), ts: Date.now(), source: "muscle-memory", ...e }) + `
`);
  } catch {}
}
function loadMeshFeed(n = 6) {
  try {
    if (!existsSync(MESH_FEED))
      return [];
    const all = [];
    for (const l of readFileSync(MESH_FEED, "utf8").trim().split(`
`)) {
      if (l)
        try {
          all.push(JSON.parse(l));
        } catch {}
    }
    const seen = new Map;
    for (const e of all)
      seen.set(`${e.agent}|${e.skill}|${e.type}`, e);
    return [...seen.values()].slice(-n);
  } catch {
    return [];
  }
}
function renderMeshFeed(entries) {
  return entries.map((e) => `${(e.agent || "?").padEnd(5)} ${String(e.type || "").replace("skill_", "")} ${e.skill || ""}${e.route ? ` · ${e.route}` : ""}${e.signals ? ` · ${e.signals} signals` : ""}`.trim());
}

// mods/detect.ts
function commandTemplate2(cmd) {
  let t = String(cmd).trim();
  t = t.replace(/\b(?:bearer|token|apikey|api[_-]?key)\s+[^\s;&"']+/gi, "<cred> <redacted>");
  t = t.replace(/([a-z][a-z0-9+.\-]*:\/\/)[^/\s:@]+(?::[^/\s@]+)?@/gi, "$1<cred>@");
  t = t.replace(/\b((?:aws[_-]?)?(?:secret|password|passwd|token|api[_-]?key|access[_-]?key(?:[_-]?id)?|auth)[a-z0-9_]*)\s+(["']?)[^\s"';|&]{3,}\2/gi, "$1 <redacted>");
  t = t.replace(/(^|\s)(--?user|-u)[=\s]+("?)[^\s"':;|&]+:[^\s"';|&]+\3/gi, "$1$2 <redacted>");
  t = t.replace(/(^|\s)(--?(?:password|passwd|token|access[-_]?token|api[-_]?key))[=\s]+\S+/gi, "$1$2 <redacted>");
  t = t.replace(/(^|\s)-p(?=\S)\S+/g, "$1-p <redacted>");
  t = t.replace(/\b(?:AKIA|ASIA|AIza|ghp_|gho_|ghu_|ghs_|github_pat_|glpat-|xox[baprs]-|sk-[A-Za-z0-9]*-?|eyJ)[A-Za-z0-9_\-.]{6,}/g, "<id>");
  t = t.replace(SECRET_ASSIGN, "<cred>=<redacted>");
  t = t.replace(SECRET_QUERY, "$1<cred>=<redacted>");
  t = t.replace(SECRET_FLAG, "--<cred>=<redacted>");
  t = t.replace(SECRET_HEADER, "<cred>:<redacted>");
  t = t.replace(QUOTED, "<str>");
  t = t.replace(/\b(?:bearer|authorization|api[_-]?key|api\s+key|token|secret|password|passwd|cookie)\b/gi, "<cred>");
  t = t.replace(ABS_PATH, "<path>");
  t = t.replace(HEXID, "<id>");
  t = t.replace(LONG_OPAQUE, "<id>");
  t = t.replace(NUM, "<n>");
  t = t.replace(/\s+/g, " ").trim();
  return t.slice(0, 240);
}
var HIGH_SIGNAL_TOOL_SET = new Set((process.env.MM_HIGH_SIGNAL_TOOLS || "").split(",").map((s) => s.trim()).filter(Boolean));
function fingerprint2(tool, args) {
  let tmpl = null;
  const keys = Object.keys(args || {}).sort();
  if (tool === "Bash" && typeof args?.command === "string") {
    tmpl = commandTemplate2(args.command);
  } else if (tool === "exec_command" && typeof args?.cmd === "string") {
    tmpl = commandTemplate2(args.cmd);
  } else if ((tool === "Read" || tool === "Edit" || tool === "Write" || tool === "fast_apply") && typeof args?.file_path === "string") {
    const ext = String(args.file_path).match(/\.[A-Za-z0-9]+$/)?.[0] || "";
    tmpl = `${tool} <path>${ext}`;
  } else if (tool === "Grep" || tool === "Glob" || tool === "structural_search") {
    tmpl = `${tool} ${keys.join(",")}`;
  } else if (tool === "Skill" && typeof args?.skill === "string") {
    tmpl = `Skill ${slug(String(args.skill))}`;
  } else if (HIGH_SIGNAL_TOOL_SET.has(tool)) {
    tmpl = `${tool} ${keys.join(",")}`;
  }
  const shape = keys.filter((k) => !SECRETISH.test(k)).join(",");
  const fp = `${tool}(${shape})${tmpl ? " :: " + tmpl : ""}`;
  return { fp, tmpl };
}
function maturityScore(count, convs, fixes) {
  return MM.W_FREQ * Math.log2(count) + MM.W_SPREAD * (convs - 1) + MM.W_FIX * (fixes > 0 ? 1 : 0);
}
function isMature(count, convs, m) {
  const enoughSpread = convs >= MM.MIN_CONVS || count >= MM.STRONG_SINGLE;
  return count >= MM.MIN_COUNT && enoughSpread && m >= MM.MATURE_AT;
}
var TRIVIAL = new Set(["echo", "printf", "cd", "ls", "cat", "grep", "rg", "sed", "pgrep", "true", "pwd", "sleep", "timeout", "gtimeout", "letta", ":"]);
var SUBCMD = new Set(["git", "letta", "npm", "npx", "gh", "docker", "cargo", "bun", "pnpm", "yarn", "kubectl", "jq"]);
function stepSig(row) {
  if (row.tool !== "Bash") {
    const m = (row.tmpl || "").match(/\.[A-Za-z0-9]+$/);
    return m ? `${row.tool}${m[0]}` : row.tool;
  }
  const t = (row.tmpl || "").replace(/\bcd <[^>]+>\s*&&\s*/g, " ").replace(/\becho <str>\s*&&?\s*/g, " ");
  for (const seg of t.split(/&&|\|\||\||;/)) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    if (!toks.length)
      continue;
    let v = toks[0].replace(/^.*\//, "");
    if (TRIVIAL.has(v))
      continue;
    if (SUBCMD.has(v) && toks[1] && /^[a-z]/i.test(toks[1]))
      v = `${v} ${toks[1]}`;
    return v.slice(0, 24);
  }
  return "Bash";
}
function detectTemplates(rows) {
  const byKey = new Map;
  const failPending = new Map;
  for (const r of rows) {
    if (!r.tmpl)
      continue;
    const k = r.tmpl;
    let e = byKey.get(k);
    if (!e) {
      e = { count: 0, convs: new Set, fixes: 0, lastFail: false };
      byKey.set(k, e);
    }
    e.count++;
    e.convs.add(String(r.conv ?? "?"));
    const fk = `${r.conv}|${k}`;
    if (r.ok === false)
      failPending.set(fk, true);
    else if (r.ok === true && failPending.get(fk)) {
      e.fixes++;
      failPending.set(fk, false);
    }
  }
  return finalize("template", byKey);
}
function detectSequences(rows, n = MM.NGRAM) {
  const byConv = new Map;
  for (const r of rows) {
    const c = String(r.conv ?? "?");
    if (!byConv.has(c))
      byConv.set(c, []);
    byConv.get(c).push(r);
  }
  const byKey = new Map;
  for (const [conv, rs] of byConv) {
    rs.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    for (let i = 0;i + n <= rs.length; i++) {
      const win = rs.slice(i, i + n);
      const sigs = win.map(stepSig);
      const distinct = new Set(sigs);
      if (distinct.size < 2)
        continue;
      if (sigs.every((s) => s === "Bash"))
        continue;
      const gram = sigs.join(" → ");
      let e = byKey.get(gram);
      if (!e) {
        e = { count: 0, convs: new Set, fixes: 0 };
        byKey.set(gram, e);
      }
      e.count++;
      e.convs.add(conv);
      if (win.some((x) => x.ok === false))
        e.fixes++;
    }
  }
  return finalize("sequence", byKey);
}
function finalize(kind, byKey) {
  const out = [];
  for (const [key, e] of byKey) {
    const convs = e.convs.size;
    const m = maturityScore(e.count, convs, e.fixes);
    const mature = isMature(e.count, convs, m);
    out.push({ kind, key, count: e.count, convs, fixes: e.fixes, maturity: +m.toFixed(2), mature });
  }
  return out.sort((a, b) => b.maturity - a.maturity);
}
var PRIMITIVE = /^(Read|Write|Edit|Glob|Grep|Skill|fast_apply|structural_search)\b/;
var TRIVIAL_CMD = new Set(["echo", "printf", "cd", "ls", "cat", "grep", "rg", "sed", "pgrep", "shasum", "sha256sum", "md5", "true", "false", "pwd", "sleep", "timeout", "gtimeout", "letta", ":", "mkdir", "rmdir", "touch", "which", "whoami", "find", "head", "tail", "wc", "chmod", "chown", "cp", "mv", "rm", "export", "unset", "source", "clear", "env", "printenv", "date", "tree", "cut", "tr", "sort", "uniq", "basename", "dirname", "realpath", "test"]);
var BARE_RUN = /^(python3?|node|deno|bun|ruby|go|php|perl|java|dotnet|sh|bash|zsh)$|^\.\//i;
function templateVerb(key) {
  for (const seg of key.split(/&&|\|\||\||;/)) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    if (!toks.length)
      continue;
    let v = toks[0].replace(/^.*\//, "");
    if (TRIVIAL.has(v))
      continue;
    if (SUBCMD.has(v) && toks[1] && /^[a-z]/i.test(toks[1]))
      v = `${v} ${toks[1]}`;
    return v;
  }
  return (key.split(/\s+/)[0] || key).replace(/^.*\//, "");
}
function isDistinctiveStep(sig) {
  if (PRIMITIVE.test(sig))
    return false;
  if (BARE_RUN.test(sig))
    return false;
  if (isInspectionTemplate(sig))
    return false;
  if (/^letta (?:models|agents|skills|conversations|environments)\b/i.test(sig))
    return false;
  const v = sig.split(/\s+/)[0].replace(/^.*\//, "");
  if (TRIVIAL_CMD.has(v))
    return false;
  return /[a-z]/i.test(sig);
}
function isInspectionTemplate(key) {
  let normalized = String(key || "").toLowerCase().replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/^cd\s+<(?:str|path)>\s*&&\s*/, "");
  normalized = normalized.replace(/^(?:g?timeout)\s+(?:<n>|\d+(?:\.\d+)?[smhd]?)\s+/, "");
  normalized = normalized.replace(/^git\s+-c\s+<(?:str|path)>\s+/, "git ");
  const first = normalized.split(/&&|\|\||\||;/, 1)[0].trim();
  return /(?:^|\s)--(?:help|version)\b/.test(first) || /^letta (?:models?|agents?|skills?|conversations?|environments?) (?:list|show|current|<n>)\b/.test(first) || /^git (?:status|log|diff|show|shortlog|rev-parse)\b/.test(first) || /^gh (?:pr|issue|run|repo|release) (?:view|list|status|checks)\b/.test(first) || /^gh api\b/.test(first) && !/(?:--method|-x)\s*(?:post|put|patch|delete)\b/.test(first) || /^gh search\b/.test(first) || /^(?:npm|pnpm|yarn|bun) (?:list|ls|view|info|why|outdated)\b/.test(first) || /^docker (?:ps|images|inspect|info|version)\b/.test(first) || /^kubectl (?:get|describe|logs|api-resources|version)\b/.test(first);
}
function isSkillWorthy(c) {
  if (!c.mature)
    return false;
  if (c.kind === "template") {
    if (/^(?:<[^>]+>)+$/.test(c.key.trim()))
      return false;
    if (/^(?:python3?|node|deno|bun|ruby|perl)\s+(?:-c|-e)\s+<str>(?:\s|$)/i.test(c.key))
      return false;
    if (PRIMITIVE.test(c.key))
      return false;
    if (TRIVIAL_CMD.has(templateVerb(c.key)))
      return false;
    if (isInspectionTemplate(c.key))
      return false;
    return true;
  }
  if (c.kind === "sequence" && !c.key.split(/→/).some((s) => isDistinctiveStep(s.trim())))
    return false;
  return true;
}
function isDurableRepairChain(r) {
  if (!isDurableLesson(r.errClass))
    return false;
  const trigger = String(r.trigger || "").trim();
  if (!trigger || PRIMITIVE.test(trigger))
    return false;
  if (/^(?:Read|Write|Edit|Glob|Grep)(?:\.|\b)/i.test(trigger))
    return false;
  if (/^(?:[A-Z_][A-Z0-9_]*=|#)/.test(trigger))
    return false;
  if (!r.generalized && BARE_RUN.test(trigger))
    return false;
  if (TRIVIAL_CMD.has(templateVerb(trigger)) || isInspectionTemplate(trigger))
    return false;
  return true;
}
function isMatureRepairChain(r) {
  return isDurableRepairChain(r) && (r.convs >= MM.MIN_CONVS && r.count >= 2 || !!r.generalized && r.count >= 2 || r.count >= MM.MIN_COUNT);
}
function repairCandidates(rows) {
  const out = [];
  for (const r of detectRepairChains(rows).filter(isMatureRepairChain)) {
    out.push({ kind: "sequence", key: r.generalized ? r.trigger : r.verifyStep, count: r.count, convs: r.convs, fixes: r.count, maturity: +maturityScore(r.count, r.convs, r.count).toFixed(2), mature: true });
  }
  return out;
}
function detect(rows) {
  const templates = detectTemplates(rows);
  const sequences = detectSequences(rows);
  const repairs = repairCandidates(rows);
  const repairKeys = new Set(repairs.map((r) => r.key));
  const rest = [...templates, ...sequences].filter((c) => !repairKeys.has(c.key));
  const candidates = [...repairs, ...rest].filter(isSkillWorthy).sort((a, b) => b.maturity - a.maturity);
  return { templates, sequences, candidates };
}
function classifyError(resultText, ok) {
  if (ok !== false)
    return null;
  const raw = String(resultText ?? "");
  const known = raw.match(/\b(?:ENOENT|EACCES|EPERM|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|command not found|no such file|not found|permission denied|denied|refused|unauthorized|forbidden|invalid|conflict|timed out|timeout|rate.?limit|exit code \d+|assertion|syntax error|type ?error|module not found|cannot find)\b/i);
  return known ? known[0].toLowerCase().replace(/\s+/g, "-").slice(0, 40) : "error";
}
function mergeOutcomes(rows, ends) {
  const byId = new Map;
  for (const e of ends)
    if (e.id)
      byId.set(e.id, { ok: e.ok, err: e.err ?? null });
  return rows.map((r) => r.id && byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r);
}
function correlateOutcomes(starts, ends, opts = {}) {
  const windowMs = opts.windowMs ?? 5 * 60 * 1000;
  const rows = starts.map((r) => ({ ...r }));
  const used = new Set;
  const byId = new Map;
  rows.forEach((r, i) => {
    if (r.id != null && !byId.has(String(r.id)))
      byId.set(String(r.id), i);
  });
  const pending = [];
  for (const e of ends) {
    const eid = e.id != null ? String(e.id) : null;
    if (eid && byId.has(eid) && !used.has(byId.get(eid))) {
      const i = byId.get(eid);
      rows[i].ok = e.ok;
      rows[i].err = e.err ?? null;
      rows[i].errMsg = e.errMsg ?? rows[i].errMsg ?? null;
      used.add(i);
    } else
      pending.push(e);
  }
  for (const e of [...pending].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))) {
    const cands = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => !used.has(i) && r.ok === undefined && String(r.conv) === String(e.conv) && (e.ts ?? 0) - (r.ts ?? 0) >= 0 && (e.ts ?? 0) - (r.ts ?? 0) <= windowMs);
    if (!cands.length)
      continue;
    let pick;
    if (e.tool != null) {
      const same = cands.filter((c) => c.r.tool === e.tool);
      const pool = same.length ? same : cands;
      pick = pool.reduce((a, b) => (e.ts ?? 0) - (a.r.ts ?? 0) <= (e.ts ?? 0) - (b.r.ts ?? 0) ? a : b);
    } else {
      pick = cands.reduce((a, b) => (a.r.ts ?? 0) <= (b.r.ts ?? 0) ? a : b);
    }
    rows[pick.i].ok = e.ok;
    rows[pick.i].err = e.err ?? null;
    rows[pick.i].errMsg = e.errMsg ?? rows[pick.i].errMsg ?? null;
    used.add(pick.i);
  }
  return rows;
}
var VERIFY_RE = /\b(tests?|build|lint|tsc|type-?check|vitest|jest|pytest|mocha|check|compile|make|cargo|gradle|mvn|deploy|e2e|playwright|eslint|ruff|mypy|pyright|gate|qa|smoke|run|python3?|node|deno|ruby|go)\b|\.\/|\.(?:py|js|ts|tsx|sh|rb|go)\b/i;
var FIX_TOOL_RE = /^(Edit|Write|fast_apply)/;
function inferOutcomes(rows, opts = {}) {
  const windowMs = opts.windowMs ?? 10 * 60 * 1000;
  const out = rows.map((r) => ({ ...r }));
  const byConv = new Map;
  out.forEach((r, i) => {
    const c = String(r.conv ?? "?");
    (byConv.get(c) ?? byConv.set(c, []).get(c)).push(i);
  });
  for (const [, idxs] of byConv) {
    idxs.sort((a, b) => (out[a].ts ?? 0) - (out[b].ts ?? 0));
    const occ = new Map;
    for (const i of idxs) {
      const r = out[i];
      if (r.ok !== undefined || r.tool !== "Bash" && r.tool !== "exec_command")
        continue;
      if (!VERIFY_RE.test(String(r.tmpl ?? r.fp ?? "")))
        continue;
      (occ.get(stepSig(r)) ?? occ.set(stepSig(r), []).get(stepSig(r))).push(i);
    }
    for (const [, list] of occ) {
      for (let p = 0;p < list.length - 1; p++) {
        const a = list[p], b = list[p + 1];
        if ((out[b].ts ?? 0) - (out[a].ts ?? 0) > windowMs)
          continue;
        const fixBetween = idxs.some((j) => (out[j].ts ?? 0) > (out[a].ts ?? 0) && (out[j].ts ?? 0) < (out[b].ts ?? 0) && FIX_TOOL_RE.test(out[j].tool));
        const at = String(out[a].tmpl ?? ""), bt = String(out[b].tmpl ?? "");
        const invocationRefined = at !== "" && bt !== "" && bt !== at && bt.includes(at);
        if (!fixBetween && !invocationRefined)
          continue;
        if (out[a].ok === undefined) {
          out[a].ok = false;
          out[a].err = out[a].err ?? "inferred-failure";
        }
        if (out[b].ok === undefined)
          out[b].ok = true;
      }
    }
  }
  return out;
}
function detectInvocationGotchas(rows) {
  const byConv = new Map;
  for (const r of rows) {
    const c = String(r.conv ?? "?");
    (byConv.get(c) ?? byConv.set(c, []).get(c)).push(r);
  }
  const acc = new Map;
  for (const [conv, rs] of byConv) {
    rs.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    for (let i = 0;i < rs.length; i++) {
      if (rs[i].tool !== "Bash" && rs[i].tool !== "exec_command" || !VERIFY_RE.test(String(rs[i].tmpl ?? rs[i].fp ?? "")))
        continue;
      const at = String(rs[i].tmpl ?? "");
      if (!at)
        continue;
      for (let j = i + 1;j < Math.min(rs.length, i + 6); j++) {
        const bt = String(rs[j].tmpl ?? "");
        if ((rs[j].tool === "Bash" || rs[j].tool === "exec_command") && bt && bt !== at && bt.includes(at)) {
          const delta = bt.replace(at, "").trim();
          if (!/^(--?[a-z]|[A-Z][A-Z0-9_]*=)/.test(delta))
            break;
          const key = `${stepSig(rs[i])}|${delta}`;
          const e = acc.get(key) ?? { count: 0, convs: new Set };
          e.count++;
          e.convs.add(conv);
          acc.set(key, e);
          break;
        }
      }
    }
  }
  return [...acc.entries()].map(([k, e]) => {
    const [trigger, delta] = k.split("|");
    return { trigger, delta, count: e.count, convs: e.convs.size };
  }).sort((a, b) => b.count - a.count);
}
var FIX_VERBS = /^(Edit|Write|fast_apply|git commit|git add|patch|sed|npm|npx|bun|cargo)/i;
function triggerClass(sig) {
  const v = sig.split(/\s+/)[0].replace(/^.*\//, "").toLowerCase();
  if (/^(python3?|node|deno|bun|ruby|go|php|perl|java|dotnet)$/.test(v) || /\.(py|js|ts|tsx|rb|go|sh)$/.test(sig))
    return { key: "script-run", label: "failing-script-runs" };
  if (/^(pytest|jest|vitest|mocha|cargo|gradle|mvn|make|gotest|rspec|phpunit)$/.test(v))
    return { key: "test-build", label: "failing-tests-or-builds" };
  if (/^(tsc|mypy|pyright|eslint|ruff|prettier|biome|flake8)$/.test(v) || /type-?check/.test(v))
    return { key: "typecheck-lint", label: "type-check-or-lint-failures" };
  return null;
}
function fixClass(sig) {
  return /^(Edit|Write|fast_apply)/.test(sig) ? "edit the source" : sig;
}
function detectRepairChains(rows) {
  const byConv = new Map;
  for (const r of rows) {
    const c = String(r.conv ?? "?");
    (byConv.get(c) ?? byConv.set(c, []).get(c)).push(r);
  }
  const acc = new Map;
  for (const [conv, rs] of byConv) {
    rs.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    for (let i = 0;i < rs.length; i++) {
      if (rs[i].ok !== false)
        continue;
      const trigger = stepSig(rs[i]);
      const errClass = rs[i].err || classifyError("", false) || "error";
      let fixStep = "";
      let fixRow;
      for (let j = i + 1;j < Math.min(rs.length, i + 7); j++) {
        const sig = stepSig(rs[j]);
        if (!fixStep && FIX_VERBS.test(sig)) {
          fixStep = sig;
          fixRow = rs[j];
        }
        if (fixStep && rs[j].ok === true && stepSig(rs[j]) === trigger) {
          const key = `${trigger}|${fixStep}`;
          const e = acc.get(key) ?? { errClass, count: 0, convs: new Set, worked: [] };
          e.count++;
          e.convs.add(conv);
          const errMsg = rs[i].errMsg || undefined;
          const fix = fixRow?.fix || undefined;
          if (errMsg || fix)
            e.worked.push({ cmd: trigger, errMsg, fix });
          acc.set(key, e);
          break;
        }
      }
    }
  }
  const dedupeWorked = (ws) => {
    const seen = new Set;
    const out2 = [];
    for (const w of ws) {
      const k = `${w.errMsg ?? ""}|${w.fix ?? ""}`;
      if (seen.has(k))
        continue;
      seen.add(k);
      out2.push(w);
    }
    return out2.slice(0, 12);
  };
  const literal = [...acc.entries()].map(([k, e]) => {
    const [trigger, fixStep] = k.split("|");
    return { trigger, errClass: e.errClass, fixStep, count: e.count, convs: e.convs, worked: e.worked };
  });
  const groups = new Map;
  for (const l of literal) {
    const tc = triggerClass(l.trigger);
    if (!tc)
      continue;
    const gk = `${tc.key}|${fixClass(l.fixStep)}`;
    const g = groups.get(gk) ?? { label: tc.label, lits: [] };
    g.lits.push(l);
    groups.set(gk, g);
  }
  const absorbed = new Set;
  const out = [];
  for (const g of groups.values()) {
    const distinct = new Set(g.lits.map((l) => l.trigger));
    if (distinct.size < 2)
      continue;
    const convs = new Set;
    let count = 0;
    let errClass = "";
    const worked = [];
    for (const l of g.lits) {
      l.convs.forEach((c) => convs.add(c));
      count += l.count;
      errClass ||= l.errClass;
      worked.push(...l.worked);
      absorbed.add(`${l.trigger}|${l.fixStep}`);
    }
    const rep = g.lits.slice().sort((a, b) => b.count - a.count)[0];
    const dw = dedupeWorked(worked);
    out.push({ trigger: g.label, errClass, fixStep: fixClass(rep.fixStep), verifyStep: rep.trigger, count, convs: convs.size, generalized: true, examples: [...distinct], ...dw.length ? { worked: dw } : {} });
  }
  for (const l of literal) {
    if (absorbed.has(`${l.trigger}|${l.fixStep}`))
      continue;
    const dw = dedupeWorked(l.worked);
    out.push({ trigger: l.trigger, errClass: l.errClass, fixStep: l.fixStep, verifyStep: l.trigger, count: l.count, convs: l.convs.size, ...dw.length ? { worked: dw } : {} });
  }
  return out.sort((a, b) => b.count - a.count);
}
function detectAntiPatterns(rows) {
  const repairs = new Set(detectRepairChains(rows).map((r) => r.trigger));
  const acc = new Map;
  for (const r of rows) {
    if (r.ok !== false)
      continue;
    const step = stepSig(r);
    const e = acc.get(step) ?? { errClass: r.err || "error", fails: 0, convs: new Set };
    e.fails++;
    e.convs.add(String(r.conv ?? "?"));
    if (r.err)
      e.errClass = r.err;
    acc.set(step, e);
  }
  return [...acc.entries()].filter(([step, e]) => e.fails >= 2 && !repairs.has(step)).map(([step, e]) => ({ step, errClass: e.errClass, fails: e.fails, recovered: 0, convs: e.convs.size })).sort((a, b) => b.fails - a.fails);
}
var DESTRUCTIVE = /\b(rm|rmdir|drop|delete|truncate|reset --hard|force|push --force|mkfs|dd)\b/i;
function impactScore(c, opts = {}) {
  const repetition = Math.log2(Math.max(1, c.count));
  const spread = c.convs - 1;
  const fixes = c.fixes;
  const recency = 1;
  const safety = DESTRUCTIVE.test(c.key) ? -2 : 0;
  const bloat = -(opts.bloatOverlap ?? 0) * 2;
  const score = +(1 * repetition + 1.5 * spread + 2 * (fixes > 0 ? 1 : 0) + recency + safety + bloat).toFixed(2);
  return { score, repetition: +repetition.toFixed(2), spread, fixes, recency, safety, bloat: +bloat.toFixed(2) };
}
function isDurableLesson(text) {
  const t = String(text ?? "").toLowerCase().trim();
  if (!t)
    return false;
  const ENV = /(command not found|no such file|cannot find module|not installed|uninstalled|missing (binary|package|dependency)|permission denied|\beacces\b|\benoent\b|\beperm\b|connection refused|timed out|rate.?limit|quota|insufficient balance|unauthorized|401|403|invalid auth|credential|fresh.install|not configured)/;
  if (ENV.test(t))
    return false;
  if (/(is broken|does ?n'?t work|cannot use|unavailable|not supported)/.test(t))
    return false;
  return true;
}
function isValidSkillName(name) {
  const n = String(name ?? "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(n) || n.length > 64)
    return false;
  const ANTI = [/^fix-/, /^debug-/, /^audit-/, /^patch-/, /(?:^|-)to(?:-|$)/, /\d{3,}/, /v?\d+[._]\d+/, /\berror\b|\bexception\b/, /-today$|-now$|-temp$|-wip$/];
  return !ANTI.some((p) => p.test(n));
}
function multiInstanceSupport(topic, signals, minInstances = 2) {
  const GENERIC = new Set(["recovering", "recover", "failure", "failures", "fails", "failed", "failing", "when", "never", "running", "using", "with", "from", "this", "that", "command", "commands", "error", "errors", "instead", "blind", "retrying", "workflow", "recurring", "skill", "use", "then", "same", "exact", "exit", "code"]);
  const tok = (s) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !GENERIC.has(w)));
  const topicTokens = tok(topic);
  let best = null;
  for (const s of signals || []) {
    const lt = tok(s.label);
    let inter = 0;
    for (const w of topicTokens)
      if (lt.has(w))
        inter++;
    if (inter < 1)
      continue;
    const instances = Math.max(s.count || 0, s.convs || 0);
    if (!best || instances > best.instances || instances === best.instances && inter > best.overlap)
      best = { label: s.label, instances, overlap: inter };
  }
  if (!best)
    return { ok: false, reason: "no grounded evidence signal matches this skill's topic — refusing ungrounded create" };
  if (best.instances < minInstances)
    return { ok: false, matched: best.label, instances: best.instances, reason: `single-instance evidence: strongest topical signal "${best.label}" was observed ${best.instances}× — need >=${minInstances} distinct instances before a CREATE` };
  return { ok: true, matched: best.label, instances: best.instances, reason: `grounded: "${best.label}" observed ${best.instances}×` };
}
function buildCrossConversationEvidence(rows) {
  const convs = new Set(rows.map((r) => String(r.conv ?? "?"))).size;
  const allRepairs = detectRepairChains(rows), allAps = detectAntiPatterns(rows);
  const repairs = allRepairs.filter(isDurableRepairChain);
  const aps = allAps.filter((p) => isDurableLesson(p.errClass));
  const rejected = [];
  for (const r of allRepairs)
    if (!isDurableRepairChain(r))
      rejected.push({ item: `${r.trigger} (${r.errClass})`, reason: isDurableLesson(r.errClass) ? "primitive/inspection repair — not a standalone skill" : "environment/transient — negative filter" });
  for (const p of allAps)
    if (!isDurableLesson(p.errClass))
      rejected.push({ item: `${p.step} (${p.errClass})`, reason: "environment/transient — negative filter" });
  const tmpl = new Map;
  const highSignal = new Map;
  for (const r of rows)
    if (r.tmpl) {
      tmpl.set(r.tmpl, (tmpl.get(r.tmpl) || 0) + 1);
      if (HIGH_SIGNAL_TOOL_SET.has(r.tool)) {
        const e = highSignal.get(r.tmpl) || { count: 0, failures: 0, convs: new Set, tool: r.tool };
        e.count++;
        if (r.ok === false)
          e.failures++;
        e.convs.add(String(r.conv ?? "?"));
        highSignal.set(r.tmpl, e);
      }
    }
  const topTmpl = [...tmpl.entries()].filter(([t, c]) => c >= 3 && !PRIMITIVE.test(t)).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const high = [...highSignal.entries()].sort((a, b) => b[1].failures - a[1].failures || b[1].count - a[1].count).slice(0, 10);
  const L = [`CROSS-CONVERSATION EVIDENCE (aggregated over ${convs} sessions of real tool-use):`];
  for (const r of repairs.slice(0, 12)) {
    L.push(`- recovered failure: "${r.trigger}" failed (${r.errClass}) → fixed via "${r.fixStep}" → re-ran "${r.verifyStep}" [${r.count}× across ${r.convs} sessions]`);
    for (const w of r.worked ?? []) {
      const sym = w.errMsg ? ` symptom: ${w.errMsg.replace(/\s+/g, " ").slice(0, 160)}` : "";
      const fx = w.fix ? ` | fix: ${w.fix.replace(/\s+/g, " ").slice(0, 200)}` : "";
      if (sym || fx)
        L.push(`    · example —${sym}${fx}`);
    }
  }
  for (const p of aps.slice(0, 8))
    L.push(`- recurring failure (no clean fix yet): "${p.step}" — ${p.errClass} [${p.fails}×]`);
  for (const [t, c] of topTmpl)
    L.push(`- recurring workflow: ${t} [${c}×]`);
  for (const [t, e] of high)
    L.push(`- high-signal receipt workflow: ${t} [${e.count}× across ${e.convs.size} session${e.convs.size === 1 ? "" : "s"}${e.failures ? `, ${e.failures} failed/partial receipt${e.failures === 1 ? "" : "s"}` : ""}]`);
  const signals = [
    ...repairs.map((r) => ({ label: `${r.trigger} ${r.errClass} ${r.fixStep}`, kind: "repair", count: r.count, convs: r.convs })),
    ...aps.map((p) => ({ label: `${p.step} ${p.errClass}`, kind: "antipattern", count: p.fails, convs: p.convs })),
    ...topTmpl.map(([t, c]) => ({ label: t, kind: "template", count: c, convs: 1 })),
    ...high.map(([t, e]) => ({ label: t, kind: "high-signal", count: e.count, convs: e.convs.size }))
  ];
  return { digest: L.join(`
`), convs, items: repairs.length + aps.length + topTmpl.length + high.length, rejected, signals };
}
// mods/gate.ts
import { join as join2 } from "node:path";
function dedupCheck(name, description, dirs = [globalSkillsDir()]) {
  const words = new Set(description.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const overlapWith = (desc) => {
    const dw = new Set(desc.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    let inter = 0;
    for (const w of words)
      if (dw.has(w))
        inter++;
    return words.size ? inter / words.size : 0;
  };
  let worst = { name: "", overlap: 0 };
  for (const dir of dirs) {
    for (const n of listSkillNames(dir)) {
      if (n === name)
        return { dup: true, reason: `skill '${n}' already exists — patch it, don't duplicate`, name: n, overlap: 1 };
      const overlap = overlapWith(skillDesc(dir, n));
      if (overlap > worst.overlap)
        worst = { name: n, overlap };
    }
    const retiredRoot = join2(dir, "_retired");
    for (const rn of listSkillNames(retiredRoot)) {
      const base = rn.replace(/-\d{4}-\d{2}-\d{2}T[\dZ.-]+$/, "");
      if (base === name)
        return { dup: true, reason: `retired skill '${base}' exists in quarantine (${retiredRoot}/${rn}) — restore it or absorb instead of recreating`, name: base, overlap: 1 };
      const overlap = overlapWith(skillDesc(retiredRoot, rn));
      if (overlap > 0.6)
        return { dup: true, reason: `>60% description overlap with RETIRED skill '${base}' (${retiredRoot}/${rn}) — quarantined: restore/absorb instead of recreating a sibling`, name: base, overlap };
    }
  }
  return { dup: worst.overlap > 0.6, reason: worst.overlap > 0.6 ? `>60% description overlap with '${worst.name}' — patch/absorb instead` : "", name: worst.name, overlap: worst.overlap };
}
function candidateName(c) {
  const key = c.key.replace(/<[^>]+>/g, "").replace(/[(){}]/g, "").replace(/→/g, " to ");
  const STOP = new Set(["str", "path", "url", "read", "write", "edit", "bash", "sh", "cd", "ls", "cat", "echo", "pwd", "true", "sleep", "mkdir", "amp"]);
  const seen = new Set;
  const words = key.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w) && !seen.has(w) && seen.add(w));
  const base = words.slice(0, 5).join("-") || (c.kind === "sequence" ? "recurring-workflow" : "recurring-command");
  const name = words.length >= 2 || /ing$/.test(base) ? base : `${base}-workflow`;
  return slug(name);
}
function candidateDescription(c) {
  return `Use when repeating the observed ${c.kind} workflow '${c.key}' (${c.count} reps across ${c.convs} conversation${c.convs === 1 ? "" : "s"}${c.fixes ? `, ${c.fixes} error-recovery reps` : ""}); trigger on similar repeated tool-use, validation, or repair loops.`;
}
function draftSkillFromCandidate(c) {
  const name = candidateName(c);
  const description = candidateDescription(c);
  const parts = c.key.split(/\s*→\s*/).filter(Boolean);
  const steps = parts.length > 1 ? parts.map((s, i) => `${i + 1}. **${s}** — perform this step intentionally; adapt paths/args to the current repo/session.`).join(`
`) : `1. **${c.key}** — run the recurring command/template only after confirming the current repo/session context.
2. Inspect the output and capture the success/failure receipt.
3. If it fails, patch the root cause and rerun the same validation once.`;
  const recovery = c.fixes ? `
## Failure recovery
This pattern includes ${c.fixes} observed error-recovery rep${c.fixes === 1 ? "" : "s"}. Preserve the recovery loop:

1. Treat the first failure as diagnostic signal, not random noise.
2. Inspect the concrete error output.
3. Patch the smallest root cause.
4. Rerun the same validation command/tool before claiming fixed.
` : "";
  const body = `# ${name}

This skill was drafted from repeated real tool-use captured by muscle-memory. Treat it as a starting playbook: refine after the next successful/failed use.

## Trigger
${description}

## Observed pattern
\`\`\`text
${c.key}
\`\`\`

- Kind: ${c.kind}
- Repetitions: ${c.count}
- Conversation spread: ${c.convs}
- Error-recovery reps: ${c.fixes}
- Maturity score: ${c.maturity}

## Procedure
${steps}${recovery}
## Verification
- Capture the concrete command/tool output that proves the workflow succeeded.
- If this touches files, inspect diff/status before claiming done.
- If this changes a package/mod, bundle/import or run its package-local test.
- If this is visual/frontend work, require visual receipts plus computed boxes, not presence-only proof.

## Anti-bloat / refinement rule
- Patch this skill in place when a step is too vague, stale, or misses a failure mode.
- Do not create a duplicate skill for the same workflow; merge or absorb instead.
- Retire/quarantine it if future usage shows it does not earn its context.
`;
  return { name, description, body };
}
function findCandidate(candidateKey) {
  const { candidates } = detect(loadExperience());
  if (!candidateKey)
    return candidates[0];
  return candidates.find((c) => c.key === candidateKey || c.key.includes(candidateKey));
}
function repairForCandidate(c) {
  if (!c.fixes)
    return;
  const first = c.key.split(/\s*→\s*/)[0];
  return detectRepairChains(loadExperience()).find((r) => r.trigger === first || r.verifyStep === first || c.key.includes(r.trigger) || c.key.includes(r.verifyStep));
}
function lintSkillDraft(d, opts = {}) {
  const issues = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.name))
    issues.push("name must be lowercase-hyphen slug");
  if (d.name.length > 64)
    issues.push("name > 64 chars");
  if (!d.description || d.description.length < 20)
    issues.push("description too short");
  if (!/\b(use when|trigger|when )/i.test(d.description))
    issues.push("description must state WHEN to use (trigger phrase)");
  if (d.description.length > 700)
    issues.push("description > 700 chars (keep routing lean)");
  const approxTokens = Math.ceil(d.body.length / 4);
  if (approxTokens > 5000)
    issues.push(`body ~${approxTokens} tokens > 5000 (decompose into references/)`);
  if (!/##\s+procedure/i.test(d.body))
    issues.push("body missing ## Procedure");
  if (!/##\s+verification/i.test(d.body))
    issues.push("body missing ## Verification");
  if (opts.needsPitfalls && !/##\s+(pitfalls|failure recovery)/i.test(d.body))
    issues.push("fix-pattern skill must include ## Pitfalls / Failure recovery");
  return { ok: issues.length === 0, issues };
}
function sotaQualityGaps(d) {
  const gaps = [];
  const b = d.body;
  const lc = b.toLowerCase();
  const procedural = /##\s+(procedure|steps|workflow|method|pitfalls|failure recovery|recipe|how to)/i.test(b);
  const fencedBodies = [...b.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const concreteFence = fencedBodies.some((sample) => /(?:^|\s)(?:npm|npx|pnpm|yarn|bun|node|deno|python3?|pytest|jest|vitest|cargo|go|make|git|curl|letta|shopify|docker|kubectl)\b|(?:^|[\s"'`])[\w./-]+\.(?:ts|tsx|js|jsx|py|sh|rb|go|json|ya?ml|toml|liquid|md)\b|(?:^|\n)[+-]\s|[A-Za-z_$][\w$]*\s*(?:\(|=)|\b(?:return|if|for|while|class|function|const|let|def|import)\b/m.test(sample));
  if (procedural && !concreteFence)
    gaps.push("CONCRETENESS: add a fenced example with a real command, file, code fragment, or diff (show the exact correct fix, never hand-wave)");
  if (/##\s+pitfalls/i.test(b)) {
    const section = (b.split(/##\s+pitfalls[^\n]*\n/i)[1] || "").split(/\n##\s+/)[0] || "";
    const sectionLc = section.toLowerCase();
    const tells = (sectionLc.match(/\btell\b|\bsymptom\b|at-a-glance|the signal|you'll see|gives it away/g) || []).length;
    const pitfalls = section.match(/^\s*(?:[-*]|\d+\.|###)\s/gm)?.length || 0;
    if (pitfalls >= 2 && tells < Math.min(2, pitfalls))
      gaps.push("DIAGNOSTIC TELLS: give each Pitfall a one-line TELL — the at-a-glance symptom/error-string that identifies that failure class");
  }
  const destructive = /\b(rm\s+-rf?|reset\s+--hard|force[- ]?push|git\s+push\s+--force|--force\b|drop\s+(table|database)|db[: ]?migrate|delete\s+from|truncate\b|mv\s+[^\n]*\/)/i.test(b);
  const safeFirst = /\b(back\s?up|snapshot|stash|dry[- ]?run|--dry-run|--check|copy first|inspect|diff before|reversible|safety net|to a branch|tag first)\b/i.test(lc);
  if (destructive && !safeFirst)
    gaps.push("SAFE-FIRST: add an explicit non-destructive safety net (backup/snapshot/dry-run/inspect) as the first step before any destructive command");
  const idMatches = b.match(/\b(agent-[a-f0-9-]{8,}|[A-Za-z0-9_]+\.com\/[A-Za-z0-9_./-]+|sk-[A-Za-z0-9]{6,})\b/g) || [];
  if (idMatches.length >= 3)
    gaps.push("GENERALITY: this reads as a one-off (hardcoded ids/paths) — generalize to a class-level rule and demote the specifics to a worked example");
  return gaps;
}
function auditSkills(skills) {
  const flagged = [];
  const gapCounts = {};
  for (const s of skills) {
    const gaps = sotaQualityGaps({ name: s.name, description: s.description ?? "Use when relevant", body: s.body });
    if (gaps.length) {
      flagged.push({ name: s.name, gaps });
      for (const g of gaps) {
        const k = g.split(":")[0];
        gapCounts[k] = (gapCounts[k] || 0) + 1;
      }
    }
  }
  return { total: skills.length, clean: skills.length - flagged.length, flagged, gapCounts };
}
function crossShelfDuplicates(entries) {
  const byName = new Map;
  for (const e of entries) {
    const a = byName.get(e.name) || [];
    a.push({ shelf: e.shelf, body: e.body });
    byName.set(e.name, a);
  }
  const out = [];
  const norm = (b) => hash(b.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim());
  for (const [name, copies] of byName) {
    if (copies.length < 2)
      continue;
    const divergent = new Set(copies.map((c) => norm(c.body))).size > 1;
    out.push({ name, shelves: [...new Set(copies.map((c) => c.shelf))], divergent });
  }
  return out;
}
function effectivenessVerdict(input) {
  if (input.staleAntiPattern)
    return { verdict: "retire_candidate", reason: "the failure it targeted keeps recurring — skill isn't working" };
  if (input.uses === 0 && input.ageDays > 14)
    return { verdict: "retire_candidate", reason: `0 uses in ${input.ageDays}d — not earning its context` };
  if (input.uses === 0)
    return { verdict: "review", reason: "no observed use yet — keep if newly created" };
  return { verdict: "keep", reason: `used ${input.uses}×` };
}
function renderWorkedExamples(worked) {
  if (!worked || !worked.length)
    return "";
  const items = worked.map((w) => {
    const sym = w.errMsg ? `**symptom:** \`${w.errMsg.replace(/\s+/g, " ").slice(0, 180)}\`` : "**symptom:** (captured)";
    const fix = w.fix ? `
  \`\`\`diff
${w.fix.split(`
`).slice(0, 10).map((l) => "  " + l).join(`
`)}
  \`\`\`` : "";
    return `- ${sym}${fix}`;
  }).join(`
`);
  return `

## Worked examples (real, redacted)
Real symptom→fix pairs captured across sessions (credentials/paths scrubbed):
${items}
`;
}
function buildDiffFragment(args) {
  const oldS = typeof args?.old_string === "string" ? args.old_string : "";
  const newS = typeof args?.new_string === "string" ? args.new_string : typeof args?.content === "string" ? args.content : "";
  if (!oldS && !newS)
    return;
  const o = redactFragment(oldS, 6, 200);
  const n = redactFragment(newS, 6, 200);
  const lines = [];
  for (const l of o ? o.split(`
`) : [])
    lines.push(`- ${l}`);
  for (const l of n ? n.split(`
`) : [])
    lines.push(`+ ${l}`);
  const out = lines.join(`
`).slice(0, 400);
  return out || undefined;
}
function draftWithRepair(c, repair) {
  if (!repair)
    return draftSkillFromCandidate(c);
  const workedMd = renderWorkedExamples(repair.worked);
  const errTag = repair.errClass && repair.errClass !== "inferred-failure" ? repair.errClass : "";
  const s = repair.convs === 1 ? "" : "s";
  if (repair.generalized) {
    const name2 = slug(`recovering-from-${repair.trigger}`).slice(0, 64);
    const exs = ((repair.examples?.length) ? repair.examples : [repair.verifyStep]).slice(0, 4);
    const exList = exs.map((e) => `\`${e}\``).join(", ");
    const worked = exs.map((e) => `- \`${e}\` failed${errTag ? ` (\`${errTag}\`)` : ""} → edit the **source** to fix the cause → re-ran \`${e}\` → PASS`).join(`
`);
    const description2 = `Use when a test or script run fails (seen with ${exList}) — recover by editing the source and re-running the same command, never blind-retrying. Triggers on any fix-then-recheck loop, in any language.`;
    const body2 = `# ${name2}

A recovery discipline distilled from ${repair.count} real fix-then-recheck loops across ${repair.convs} session${s} (${exList}). The command differs by language; the discipline does not.

## When to use
- A test/script run fails (assertion, traceback, or wrong output) and you need to recover.
- You're about to re-run a failed command unchanged, hoping it passes.
- Any edit→re-run loop, regardless of language.

## Procedure (decision guide)
1. Re-run the exact failing command and READ the concrete error — assertion, traceback, or a wrong printed value.
2. Do NOT blind-retry. Edit the **source** (not the test) for that specific error — smallest change first.
3. Re-run the SAME command; confirm it passes (exit 0).
4. Run it once more to rule out a flaky / state-dependent pass.

## Worked examples (observed)
\`\`\`text
${worked}
\`\`\`

## Pitfalls (symptom → fix)
- TELL: re-running a failed command unchanged → it stays red; nothing passes until the source changes.
- TELL: exit code 0 but wrong output (e.g. \`go run\` prints the wrong value) → the failure is in stdout, not the exit code; assert on the value, not just the exit.
- TELL: editing the test to force a green → fix the code the test exercises, not the assertion.

## Verification
- [ ] The failure reproduced before the fix (you saw the real error).
- [ ] The same command passes after the fix (exit 0).
- [ ] A second independent run also passes.`;
    return { name: name2, description: description2, body: body2 + workedMd };
  }
  const verb = slug(repair.verifyStep) || slug(c.key) || "a-recurring-check";
  const name = slug(`recovering-from-${verb}-failures`).slice(0, 64);
  const description = `Use when \`${repair.verifyStep}\` fails${errTag ? ` (\`${errTag}\`)` : ""} — recover by applying \`${repair.fixStep}\` then re-running \`${repair.verifyStep}\`, never blind-retrying. Observed ${repair.count}× across ${repair.convs} session${s}.`;
  const body = `# ${name}

A recovery discipline distilled from ${repair.count} real \`${repair.verifyStep}\` fix-then-recheck loop${repair.count === 1 ? "" : "s"} across ${repair.convs} session${s}. The fix is known — apply it instead of re-deriving.

## When to use
- \`${repair.verifyStep}\` fails${errTag ? ` with \`${errTag}\`` : ""}, or any check→fix→recheck loop on it.
- You're about to re-run \`${repair.verifyStep}\` unchanged after it failed.

## Procedure (decision guide)
1. Run \`${repair.verifyStep}\` and read the concrete error${errTag ? ` (expect \`${errTag}\`)` : ""}.
2. Do NOT blind-retry. Apply the known fix: \`${repair.fixStep}\` — addressing that specific error.
3. Re-run \`${repair.verifyStep}\` to confirm it passes (exit 0).
4. Run once more to rule out a flaky pass.

## Worked example (observed)
\`\`\`text
${repair.verifyStep} failed${errTag ? ` (${errTag})` : ""} → ${repair.fixStep} → re-ran ${repair.verifyStep} → PASS  (${repair.count}× / ${repair.convs} session${s})
\`\`\`

## Pitfalls (symptom → fix)
- TELL: re-running \`${repair.verifyStep}\` unchanged → stays red; it won't pass until \`${repair.fixStep}\` is applied.
- TELL: treating the first failure as noise → it's signal; the fix is known from ${repair.count} prior recoveries.

## Verification
- [ ] \`${repair.verifyStep}\` failed before the fix (real error seen).
- [ ] \`${repair.verifyStep}\` passes after \`${repair.fixStep}\` (exit 0).
- [ ] A second run also passes.`;
  return { name, description, body: body + workedMd };
}
// mods/autopilot.ts
import { mkdirSync as mkdirSync4, readFileSync as readFileSync4, existsSync as existsSync4, writeFileSync as writeFileSync4, renameSync as renameSync3 } from "node:fs";
import { join as join5 } from "node:path";

// mods/publish.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2, existsSync as existsSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join3 } from "node:path";
import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";
var PUBLISH_SECRET_RES = [
  /\bsk-ant-[A-Za-z0-9_-]{12,}\b/,
  /\bsk-[A-Za-z0-9]{16,}\b/,
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b[A-Z][A-Z0-9_]*_(?:API_)?KEY\s*[:=]\s*['"][A-Za-z0-9_-]{12,}['"]/
];
function publishHardBlocks(body) {
  const out = [];
  for (const re of PUBLISH_SECRET_RES) {
    const m = body.match(re);
    if (m)
      out.push(`secret/credential value present: ${m[0].slice(0, 14)}…`);
  }
  return out;
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function gitConfigValue(key) {
  const envKey = key === "user.name" ? "MM_TEST_GIT_USER_NAME" : key === "user.email" ? "MM_TEST_GIT_USER_EMAIL" : "";
  if (envKey && process.env[envKey])
    return process.env[envKey] || "";
  try {
    return execFileSync("git", ["config", "--get", key], { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
function runtimeUserIdentifiers() {
  const vals = new Set;
  const add = (v) => {
    const s = String(v || "").trim();
    if (s.length >= 3 && !/^(root|user|admin|runner|node|git|local)$/i.test(s))
      vals.add(s);
  };
  try {
    add(process.env.MM_TEST_USERINFO_USERNAME || userInfo().username);
  } catch {}
  const gitName = gitConfigValue("user.name");
  const gitEmail = gitConfigValue("user.email");
  add(gitName);
  add(gitEmail);
  if (gitEmail.includes("@"))
    add(gitEmail.split("@")[0]);
  return [...vals].sort((a, b) => b.length - a.length);
}
function runtimePrivateAgentIdentifiers() {
  const vals = new Set;
  for (const raw of [process.env.MM_AGENT || "", ...(process.env.MM_PRIVATE_IDENTIFIERS || "").split(/[,;\n]/)]) {
    const value = raw.trim();
    if (value.length >= 3 && !/^(agent|assistant|worker|reviewer|user)$/i.test(value))
      vals.add(value);
  }
  return [...vals].sort((a, b) => b.length - a.length);
}
function sanitizeForPublish(body) {
  const replacements = [];
  let s = body;
  const sub = (kind, re, to) => {
    s = s.replace(re, (m) => {
      if (!replacements.some((r) => r.from === m))
        replacements.push({ kind, from: m, to });
      return to;
    });
  };
  sub("local-path", /\/Users\/[A-Za-z0-9._-]+/g, "<local path>");
  sub("agent-memfs", /(?:~\/)?\.letta\/(?:lc-local-backend\/memfs\/)?agents?\/[A-Za-z0-9._/-]+/g, "<agent memfs>");
  sub("agent-id", /\bagent-[a-f0-9]{6,}(?:-[a-f0-9]+)+\b/g, "<agent id>");
  sub("user", /\b(?:localuser|private-user)\b/gi, "<user>");
  for (const id of runtimeUserIdentifiers())
    sub("user", new RegExp(`\\b${escapeRegExp(id)}\\b`, "gi"), "<user>");
  for (const id of runtimePrivateAgentIdentifiers())
    sub("agent", new RegExp(`\\b${escapeRegExp(id)}\\b`, "gi"), "<agent>");
  sub("project", /\b(?:ProjectX|ExampleCorp)\b/g, "<project>");
  sub("provider-env", /\b(?:ZAI|Z_AI|OPENAI|ANTHROPIC|GLM|MORPH|KIMI|MINIMAX|GEMINI|XAI)_API_KEY\b/g, "PROVIDER_API_KEY");
  s = s.replace(/((?:^|[^A-Za-z0-9])[A-Za-z0-9_.-]*(?:secret|passwd|password|token|api[_-]?key)[A-Za-z0-9_.-]*\s*[:=]\s*)(["']?)([^\s"'<>]{6,})\2/gi, (m, head, quote, value) => {
    if (!replacements.some((r) => r.from === value))
      replacements.push({ kind: "labelled-secret", from: value, to: "<redacted>" });
    return `${head}${quote}<redacted>${quote}`;
  });
  return { sanitized: s, replacements };
}
function publishabilityScore(skill) {
  const b = skill.body;
  const issues = [];
  const hardBlocks = publishHardBlocks(b);
  const pen = (axis, penalty, detail) => issues.push({ axis, penalty, detail });
  const { replacements } = sanitizeForPublish(b);
  const kinds = new Set(replacements.map((r) => r.kind));
  for (const k of kinds)
    pen("portability", 8, `${k} present (sanitize before publish): e.g. ${replacements.find((r) => r.kind === k).from.slice(0, 28)}`);
  for (const g of sotaQualityGaps(skill))
    pen("quality", 10, g.split(":")[0]);
  for (const [re, label] of [[/##\s+when to use/i, "When to use"], [/##\s+procedure/i, "Procedure"], [/##\s+pitfalls|##\s+failure/i, "Pitfalls"], [/##\s+verification/i, "Verification"]])
    if (!re.test(b))
      pen("quality", 8, `missing ## ${label}`);
  if (!skill.description || skill.description.length < 30)
    pen("quality", 6, "description too thin for a shared shelf");
  if (/GENERALITY/.test(sotaQualityGaps(skill).join(" ")))
    pen("reusability", 10, "reads as a one-off (hardcoded specifics)");
  if (/(reset --hard|force[- ]?push|rm -rf|drop (table|database)|--force)/i.test(b) && !/(when not to use|do not use|scope|only when|caution)/i.test(b))
    pen("reusability", 5, "risky ops without a when-not-to-use / scope guard");
  if (!/(update|patch|retire|prune|absorb|anti-bloat|refine this skill|earn its context)/i.test(b))
    pen("compounding", 5, "no update/retire criteria (won't compound across agents)");
  let score = Math.max(0, 100 - issues.reduce((a, i) => a + i.penalty, 0));
  if (hardBlocks.length)
    score = Math.min(score, 15);
  const sanitizableLeft = kinds.size > 0;
  const recommended = hardBlocks.length ? "block" : score >= 80 && !sanitizableLeft ? "publish" : "stage-sanitized";
  return { score, hardBlocks, issues, recommended };
}
function publishPlan(skill) {
  const sc = publishabilityScore(skill);
  const san = sanitizeForPublish(skill.body);
  return {
    skill: skill.name,
    currentShelf: skill.shelf ?? "agent",
    recommendedShelf: sc.recommended === "block" ? "(blocked — keep agent-local)" : "Custom Skills",
    publishability: sc.score,
    recommended: sc.recommended,
    hardBlocks: sc.hardBlocks,
    issues: sc.issues,
    sanitizedPreview: san.sanitized,
    replacements: san.replacements
  };
}
function publishTier(plan) {
  if (plan.hardBlocks.length)
    return "blocked";
  const sanitizable = plan.replacements.length > 0;
  if (plan.publishability >= 85 && !sanitizable)
    return "marketplace-candidate";
  if (plan.publishability >= 65)
    return "team-shareable";
  return "agent-local";
}
function publishMetadata(plan, tier) {
  return { origin: "muscle-memory", publishability_score: plan.publishability, tier, privacy: plan.replacements.length ? "sanitized" : "as-is", published_at: new Date().toISOString().slice(0, 10) };
}
function findSimilarSkills(name, description, existing) {
  const toks = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !SEARCH_STOP.has(t)));
  const nT = toks(`${name} ${description}`);
  const out = [];
  for (const e of existing) {
    if (e.name === name) {
      out.push({ name: e.name, why: "exact name match — update it, don't duplicate" });
      continue;
    }
    const eT = toks(`${e.name} ${e.description}`);
    let shared = 0;
    for (const t of nT)
      if (eT.has(t))
        shared++;
    const overlap = shared / Math.max(1, Math.min(nT.size, eT.size));
    if (overlap >= 0.5 && shared >= 3)
      out.push({ name: e.name, why: `${Math.round(overlap * 100)}% topic overlap — consider merge/update` });
  }
  return out.slice(0, 3);
}
function stageSanitizedPublish(skill) {
  const plan = publishPlan(skill);
  const tier = publishTier(plan);
  if (plan.hardBlocks.length)
    return { staged: false, dir: "", plan, tier, reason: `blocked: ${plan.hardBlocks.join("; ")}` };
  const dir = join3(PUBLISH_STAGED_DIR, slug(skill.name));
  try {
    mkdirSync2(dir, { recursive: true });
  } catch {}
  const meta = publishMetadata(plan, tier);
  const body = /^---\n[\s\S]*?\n---/.test(plan.sanitizedPreview) ? plan.sanitizedPreview.replace(/^---\n([\s\S]*?)\n---/, (_m, fm) => `---
${fm.replace(/\n+$/, "")}
${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join(`
`)}
---`) : `---
name: ${skill.name}
description: ${skill.description}
${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join(`
`)}
---

${plan.sanitizedPreview}`;
  writeFileSync2(join3(dir, "SKILL.md"), body);
  writeFileSync2(join3(dir, "PUBLISH-PLAN.json"), JSON.stringify({ skill: skill.name, tier, publishability: plan.publishability, recommended: plan.recommended, issues: plan.issues, replacements: plan.replacements, metadata: meta, staged_at: Date.now() }, null, 2));
  return { staged: true, dir, plan, tier };
}
function approveStagedPublish(name, globalDir) {
  const staged = join3(PUBLISH_STAGED_DIR, slug(name), "SKILL.md");
  if (!existsSync2(staged))
    return { published: false, reason: "no staged copy — run `publish stage <skill>` first" };
  const body = readFileSync2(staged, "utf8");
  const hb = publishHardBlocks(body);
  if (hb.length)
    return { published: false, reason: `hard block on staged copy: ${hb.join("; ")}` };
  const sec = scanSkillContent(body);
  if (!sec.ok)
    return { published: false, reason: `security: ${sec.issues.join("; ")}` };
  const dst = join3(globalDir, slug(name));
  try {
    mkdirSync2(dst, { recursive: true });
  } catch {}
  writeFileSync2(join3(dst, "SKILL.md"), body);
  return { published: true, path: join3(dst, "SKILL.md") };
}
function publishVisibilityReceipt(name, globalDir) {
  const p = join3(globalDir, slug(name), "SKILL.md");
  return { exists: existsSync2(p), path: p, reloadHint: "run /reload (or restart the agent) so the skill index surfaces the new Custom Skill" };
}
function liveSkillVisible(name, agentId) {
  const onDisk = "on disk on the Custom Skills shelf — run /reload to load it into the live skill index";
  if (!agentId)
    return { checked: false, visible: false, note: onDisk };
  try {
    const out = execFileSync("letta", ["skills", "list", "--agent", agentId], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] });
    const visible = out.split(/\r?\n/).some((l) => l.includes(name));
    return { checked: true, visible, note: visible ? "✓ confirmed live: the agent's skill index now lists it" : `${onDisk} (not in the live index yet)` };
  } catch {
    return { checked: false, visible: false, note: `${onDisk} (live index query unavailable)` };
  }
}
function catalogPrivacyScan(content) {
  const issues = [];
  const body = content.replace(/^---[\s\S]*?\n---\s*\n?/, "");
  const sec = scanSkillContent(content);
  if (!sec.ok)
    issues.push(...sec.issues.map((i) => `security: ${i}`));
  if (/\/Users\/[A-Za-z0-9._-]+\//.test(content) || /\/home\/[A-Za-z0-9._-]+\//.test(content))
    issues.push("private absolute user path");
  if (/lc-local-backend/.test(content) || /~\/\.letta\/agents\//.test(content) || /~\/\.agents\/agents\//.test(content))
    issues.push("local harness path");
  if (/\b(?:private-store\.myshopify\.com|examplecorp|example-host|localuser|private-user)\b/i.test(content) || /\bagent-(?:local-)?[0-9a-f]{8}\b/i.test(content))
    issues.push("private org/user/agent identifier");
  if (/references\/evidence|receipt json|final-gate-result\.json/i.test(body) && /\/Users\//.test(content))
    issues.push("private evidence reference");
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}
function publishSkillToCatalog(name, ctx) {
  const nm = slug(name);
  if (!nm)
    throw new Error("name required");
  const d = scanDirs(ctx).find((x) => {
    try {
      return existsSync2(resolveSkillFile(x, nm));
    } catch {
      return false;
    }
  });
  if (!d)
    throw new Error(`no active skill '${nm}'`);
  const src = resolveSkillFile(d, nm);
  if (!existsSync2(src))
    throw new Error(`no SKILL.md for '${nm}'`);
  const content = readFileSync2(src, "utf8");
  const desc = (content.match(/^description:\s*(.+)$/im)?.[1] || "").trim();
  const body = content.replace(/^---[\s\S]*?\n---\s*\n?/, "");
  const lint = lintSkillDraft({ name: nm, description: desc, body });
  if (!lint.ok)
    throw new Error(`linter blocked: ${lint.issues.join("; ")}`);
  const priv = catalogPrivacyScan(content);
  if (!priv.ok)
    throw new Error(`privacy blocked: ${priv.issues.join("; ")}`);
  const san = sanitizeForPublish(content);
  const dstDir = resolveSkillDir(globalSkillsDir(), nm);
  mkdirSync2(dstDir, { recursive: true });
  const dstFile = resolveSkillFile(globalSkillsDir(), nm);
  const published = san.sanitized.includes(MM_TAG) ? san.sanitized : san.sanitized + `
<!-- ${MM_TAG}: published ${new Date().toISOString().slice(0, 10)}; catalog=global -->
`;
  writeFileSync2(dstFile, published);
  const redacted = san.replacements.length ? ` (redacted: ${san.replacements.map((r) => r.kind).join(", ")})` : "";
  appendUiEvent({ phase: "skill_published", summary: `published '${nm}' to custom skill catalog${redacted}`, skill: nm, action: "publish", route: "global-catalog" });
  appendMeshFeed({ type: "skill_published", skill: nm, route: "PUBLISH", signals: 0 });
  writeUiState({ phase: "rotation", skill: nm, last: `published '${nm}' to catalog`, route: "PUBLISH · catalog" });
  return dstFile;
}

// mods/lifecycle.ts
import { lstatSync as lstatSync2, mkdirSync as mkdirSync3, readFileSync as readFileSync3, existsSync as existsSync3, writeFileSync as writeFileSync3, readdirSync as readdirSync2, renameSync as renameSync2 } from "node:fs";
import { join as join4 } from "node:path";
function managedSkillUsage(name, rows = loadRows()) {
  const n = slug(name);
  return rows.filter((r) => (r.tmpl || r.fp || "").toLowerCase().includes(`skill ${n}`)).length;
}
function curateManagedSkills(ctx, dirsOverride) {
  const rows = loadRows();
  const dirs = dirsOverride ?? scanDirs(ctx);
  const out = [];
  const seen = new Set;
  for (const d of dirs) {
    for (const n of listSkillNames(d)) {
      if (!isManaged(d, n) || seen.has(n))
        continue;
      seen.add(n);
      const uses = managedSkillUsage(n, rows);
      let verdict = "keep";
      let reason = "managed skill has observed use or is newly created";
      if (uses === 0) {
        verdict = "review";
        reason = "no observed Skill-tool usage yet; keep if newly created, retire if stale";
      }
      out.push({ name: n, dir: d, uses, verdict, reason });
    }
  }
  return out.sort((a, b) => a.uses - b.uses || a.name.localeCompare(b.name));
}
function retireManagedSkill(name, reason, ctx, absorbedInto, restrictDirs) {
  const dirs = restrictDirs ?? scanDirs(ctx);
  const d = dirs.find((x) => existsSync3(join4(x, name, "SKILL.md")));
  if (!d)
    throw new Error(`no skill '${name}'`);
  if (!isManaged(d, name))
    throw new Error(`refusing to retire unmanaged skill '${name}'`);
  if (isPinned(name))
    throw new Error(`'${name}' is pinned — unpin first (pin protects from retire, not from patch)`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const retiredRoot = join4(d, "_retired");
  try {
    if (lstatSync2(retiredRoot).isSymbolicLink()) {
      throw new Error(`containment: '_retired' is a symlink — refusing to move '${name}' outside the shelf`);
    }
  } catch (e) {
    if (String(e).includes("containment:"))
      throw e;
  }
  mkdirSync3(retiredRoot, { recursive: true });
  const target = join4(retiredRoot, `${name}-${stamp}`);
  const forward = absorbedInto ? `absorbed_into: ${absorbedInto}
` : "";
  writeFileSync3(join4(d, name, "RETIRE-REASON.txt"), `${new Date().toISOString()}
${reason || "retired by muscle-memory curate"}
${forward}`);
  renameSync2(join4(d, name), target);
  const u = loadUsage();
  u[name] = { ...u[name] || {}, state: "archived", absorbedInto: absorbedInto || undefined };
  saveUsage(u);
  return target;
}
function retiredSkillBlocker(name, ctx) {
  const nm = slug(String(name || ""));
  if (!nm)
    return null;
  const usage = loadUsage();
  if (usage?.[nm]?.state === "archived") {
    return `skill '${nm}' is archived/retired; restore it before recreating or patch an existing replacement`;
  }
  for (const d of scanDirs(ctx)) {
    const retiredRoot = join4(d, "_retired");
    try {
      if (!existsSync3(retiredRoot))
        continue;
      const match = readdirSync2(retiredRoot).find((n) => n === nm || n.startsWith(`${nm}-`));
      if (match)
        return `skill '${nm}' is retired in ${retiredRoot}/${match}; restore it before recreating`;
    } catch {}
  }
  return null;
}
function runAutonomousPrune(ctx, opts = {}) {
  const maxRetire = Math.max(0, opts.maxRetire ?? 1);
  const usage = loadUsage();
  const now = Date.now();
  const retired = [];
  const retiredPaths = [];
  const flagged = [];
  const kept = [];
  for (const d of autonomousShelves(ctx)) {
    for (const n of listSkillNames(d)) {
      if (!isManaged(d, n)) {
        kept.push(n);
        continue;
      }
      const u = usage[n] || {};
      if (u.pinned) {
        kept.push(n);
        continue;
      }
      const uses = u.uses || 0;
      if (uses > 0 || u.lastActivity) {
        kept.push(n);
        continue;
      }
      const created = u.created || now;
      const ageDays = Math.floor((now - created) / 86400000);
      if (ageDays > 30 && retired.length < maxRetire) {
        const reason = `auto-prune: 0 uses in ${ageDays}d — not earning context (reversible quarantine)`;
        const target = retireManagedSkill(n, reason, ctx, undefined, [d]);
        retired.push(n);
        retiredPaths.push(target);
        appendUiEvent({ phase: "skill_retired", summary: `retired '${n}' (0 uses, ${ageDays}d) — reversible`, skill: n, action: "retire", route: "auto-prune" });
        appendMeshFeed({ type: "skill_retired", skill: n, route: "AUTO-PRUNE", signals: 0 });
      } else if (ageDays > 14) {
        flagged.push(n);
        appendUiEvent({ phase: "skill_review", summary: `review '${n}' (0 uses, ${ageDays}d)`, skill: n, action: "review", route: "auto-prune" });
      } else {
        kept.push(n);
      }
    }
  }
  if (retired.length)
    writeUiState({ phase: "benched", skill: retired[0], last: `retired '${retired[0]}' — reversible`, route: "AUTO-PRUNE · live" });
  return { retired, retiredPaths, flagged, kept };
}
function aggregateTelemetry(spans) {
  return spans.reduce((a, s) => ({ calls: a.calls + 1, tokensIn: a.tokensIn + (s.tokensIn || 0), tokensOut: a.tokensOut + (s.tokensOut || 0), ms: a.ms + (s.ms || 0) }), { calls: 0, tokensIn: 0, tokensOut: 0, ms: 0 });
}
function buildRegistry(dirs) {
  const usage = loadUsage();
  const byName = new Map;
  for (const d of dirs)
    for (const n of listSkillNames(d)) {
      if (!isManaged(d, n))
        continue;
      if (byName.has(n))
        continue;
      const prov = (readSkill(d, n).match(/<!--\s*muscle-memory provenance:([^>]*)-->/)?.[1] || "").trim();
      const u = usage[n] || {};
      byName.set(n, { name: n, description: skillDesc(d, n), dir: d, provenance: prov, state: u.state || "active", pinned: !!u.pinned, uses: u.uses || 0, absorbedInto: u.absorbedInto });
    }
  const skills = [...byName.values()];
  return { generated: new Date().toISOString(), count: skills.length, skills: skills.sort((a, b) => a.name.localeCompare(b.name)) };
}
function curatorPass(managed) {
  const transitions = [];
  for (const m of managed) {
    const r = lifecycleTransition({ state: m.state, lastActivityDaysAgo: m.lastActivityDaysAgo, pinned: m.pinned });
    if (r.changed)
      transitions.push({ name: m.name, from: m.state || "active", to: r.state });
  }
  return { transitions };
}
function skillVerbs(body) {
  const out = new Set;
  const pat = body.match(/##\s*Observed pattern\s*```text\s*([\s\S]*?)```/i);
  if (pat)
    for (const seg of pat[1].split(/\s*→\s*|\n/)) {
      const t = seg.trim().toLowerCase();
      if (/^[a-z][a-z0-9 ._-]{1,23}$/.test(t) && !["text", "bash"].includes(t))
        out.add(t);
    }
  return [...out];
}
function specDrift(body, rows) {
  const verbs = skillVerbs(body);
  if (!verbs.length)
    return { drift: false, missing: [], verbs };
  const seen = new Set(rows.map((r) => stepSig(r).toLowerCase()));
  const seenArr = [...seen];
  const missing = verbs.filter((v) => !seenArr.some((s) => s === v || s.includes(v) || v.includes(s)));
  return { drift: missing.length === verbs.length, missing, verbs };
}
var CURATOR = { STALE_DAYS: 30, ARCHIVE_DAYS: 90, IDLE_HOURS: 2 };
function lifecycleTransition(input) {
  const state = input.state || "active";
  if (input.pinned)
    return { state, changed: false };
  const d = input.lastActivityDaysAgo;
  if (d >= CURATOR.ARCHIVE_DAYS && state !== "archived")
    return { state: "archived", changed: true };
  if (d >= CURATOR.STALE_DAYS && state === "active")
    return { state: "stale", changed: true };
  if (d < CURATOR.STALE_DAYS && state === "stale")
    return { state: "active", changed: true };
  return { state, changed: false };
}
function loadUsage() {
  try {
    return existsSync3(USAGE_PATH) ? JSON.parse(readFileSync3(USAGE_PATH, "utf8")) : {};
  } catch {
    return {};
  }
}
function saveUsage(u) {
  try {
    ensureDir();
    writeFileSync3(USAGE_PATH, JSON.stringify(u, null, 2));
  } catch {}
}
function bumpUsage(name) {
  const u = loadUsage();
  const r = u[name] || { created: Date.now(), state: "active" };
  r.uses = (r.uses || 0) + 1;
  r.lastActivity = Date.now();
  if (r.state === "stale" || r.state === "archived")
    r.state = "active";
  u[name] = r;
  saveUsage(u);
}
function setPinned(name, pinned) {
  const u = loadUsage();
  u[name] = { ...u[name] || { created: Date.now() }, pinned };
  saveUsage(u);
}
function isPinned(name) {
  return !!loadUsage()[name]?.pinned;
}
function restoreManagedSkill(name, ctx) {
  const dirs = scanDirs(ctx);
  for (const d of dirs) {
    const retiredRoot = join4(d, "_retired");
    if (!existsSync3(retiredRoot))
      continue;
    const matches = readdirSync2(retiredRoot).filter((n) => n === name || n.startsWith(`${name}-`)).sort().reverse();
    if (matches.length) {
      if (existsSync3(join4(d, name, "SKILL.md")))
        throw new Error(`'${name}' already active`);
      renameSync2(join4(retiredRoot, matches[0]), join4(d, name));
      const u = loadUsage();
      u[name] = { ...u[name] || {}, state: "active", lastActivity: Date.now() };
      saveUsage(u);
      return join4(d, name);
    }
  }
  throw new Error(`no retired skill '${name}' to restore`);
}
function coverageMap(rows, dirs) {
  const ev = buildCrossConversationEvidence(rows);
  const out = [];
  for (const r of detectRepairChains(rows).filter(isMatureRepairChain)) {
    const hits = searchSkills(dirs, `${r.trigger} ${r.fixStep} ${r.errClass}`, 4);
    const domain = slug(r.trigger);
    const names = [...new Set(dirs.flatMap((dir) => listSkillNames(dir)))];
    const exact = names.filter((name) => slug(name).endsWith(domain));
    const lexical = pickUpdateTarget(hits, 18);
    const target = exact[0] ?? lexical?.name;
    const overCovered = exact.length >= 2 || !exact.length && hits.filter((hit) => hit.matched >= 2).length >= 2;
    out.push({ domain: r.trigger, status: target ? overCovered ? "over-covered" : "covered" : "uncovered", skill: target, signals: r.count });
  }
  for (const rej of ev.rejected)
    out.push({ domain: rej.item, status: "noise", signals: 0 });
  return out;
}
function churnSignal(i) {
  if (i.reverted)
    return { verdict: "blocked", reason: "reverted — blocked from auto-regeneration unless new evidence overrides the old rejection" };
  if (i.patches >= 5 && i.ageDays <= 2)
    return { verdict: "needs-verification", reason: `patched ${i.patches}× in ${i.ageDays}d — unstable; verify before trusting` };
  if (i.uses === 0 && i.ageDays > 7)
    return { verdict: "g-league", reason: `created but never invoked in ${i.ageDays}d — bench it` };
  if (i.uses > 0 && i.patches <= 1)
    return { verdict: "stable-veteran", reason: `used ${i.uses}×, low churn` };
  return { verdict: "active", reason: "in rotation" };
}

// mods/engram.ts
function buildDefenses(rows) {
  const out = [];
  for (const r of detectRepairChains(rows))
    out.push({ trigger: r.trigger, errClass: r.errClass, consequence: "fails until the known fix is applied", defense: `apply ${r.fixStep}, then re-run ${r.verifyStep}`, severity: Math.min(3, r.count + 1), count: r.count, kind: "fix" });
  for (const p of detectAntiPatterns(rows))
    out.push({ trigger: p.step, errClass: p.errClass, consequence: "recurring failure with no known recovery", defense: "root-cause before retrying; do not blind-retry", severity: Math.min(3, p.fails), count: p.fails, kind: "avoid" });
  for (const g of detectInvocationGotchas(rows))
    out.push({ trigger: g.trigger, errClass: "invocation", consequence: "fails unless invoked with the right flag/env", defense: `invoke with \`${g.delta}\``, severity: Math.min(3, g.count + 1), count: g.count, kind: "fix" });
  return out.sort((a, b) => b.severity - a.severity);
}
function preActionDefense(stepSignature, defenses) {
  const s = stepSignature.toLowerCase();
  return defenses.find((d) => d.trigger.toLowerCase() === s) || defenses.find((d) => s.includes(d.trigger.toLowerCase()) && d.trigger.length > 3) || null;
}
function coachOnFailure(step, output, defenses) {
  const hit = preActionDefense(stepSig({ tool: step.tool, fp: step.fp, tmpl: step.tmpl }), defenses);
  if (!hit || hit.kind !== "fix" || hit.count < 2)
    return null;
  const errNow = classifyError(output, false);
  if (errNow && hit.errClass && errNow !== hit.errClass)
    return null;
  return {
    reminder: `

<system-reminder>muscle-memory reflex: this step has failed exactly this way before and was recovered ${hit.count}× — known fix: ${hit.defense}. Apply that first; do not blind-retry.</system-reminder>`,
    hit
  };
}
var ENGRAM = {
  W_PE: 3,
  W_RW: 2,
  W_NOV: 1,
  W_REC: 1,
  TAG_HALFLIFE_MS: 6 * 60 * 60 * 1000,
  CAPTURE_WINDOW_MS: 30 * 60 * 1000,
  PRP_THRESHOLD: 3,
  WEAK_MAX: 1
};
function expectationFor(sig, defenses) {
  const d = preActionDefense(sig, defenses);
  if (!d)
    return;
  return d.kind === "avoid" ? false : true;
}
function predictionError(row, defenses) {
  if (row.ok === undefined)
    return 0;
  const exp = expectationFor(stepSig(row), defenses);
  if (exp === undefined)
    return row.ok === false ? 0.4 : 0;
  return exp !== row.ok ? 1 : 0;
}
function tagExperience(rows, opts = {}) {
  const defenses = opts.defenses ?? [];
  const now = opts.now ?? Date.now();
  const highSignal = opts.highSignal ?? HIGH_SIGNAL_TOOL_SET;
  const failedSig = new Map;
  const seen = new Map;
  const out = [];
  for (const r of [...rows].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))) {
    const conv = String(r.conv ?? "?");
    const sig = stepSig(r);
    const h = String(r.h ?? r.fp ?? sig);
    const nov = (seen.get(h) ?? 0) === 0 ? 1 : 0;
    seen.set(h, (seen.get(h) ?? 0) + 1);
    const pe = predictionError(r, defenses);
    const fset = failedSig.get(conv) ?? failedSig.set(conv, new Set).get(conv);
    let rw = 0;
    if (r.ok === false)
      fset.add(sig);
    else if (r.ok === true) {
      if (fset.has(sig)) {
        rw = 1;
        fset.delete(sig);
      } else if (highSignal.has(r.tool))
        rw = 1;
    }
    const rec = Math.pow(0.5, Math.max(0, now - (r.ts ?? now)) / ENGRAM.TAG_HALFLIFE_MS);
    const score = +(ENGRAM.W_PE * pe + ENGRAM.W_RW * rw + ENGRAM.W_NOV * nov + ENGRAM.W_REC * rec).toFixed(3);
    out.push({ ...r, sal: { score, pe, rw, nov, rec: +rec.toFixed(3) } });
  }
  return out;
}
function captureTagged(tagged, opts = {}) {
  const window = opts.window ?? ENGRAM.CAPTURE_WINDOW_MS;
  const prp = opts.prpThreshold ?? ENGRAM.PRP_THRESHOLD;
  const weakMax = opts.weakMax ?? ENGRAM.WEAK_MAX;
  const count = new Map;
  for (const t of tagged) {
    const h = String(t.h ?? t.fp ?? stepSig(t));
    count.set(h, (count.get(h) ?? 0) + 1);
  }
  const prpEvents = tagged.filter((t) => t.sal.score >= prp);
  const rescued = [];
  for (const t of tagged) {
    const h = String(t.h ?? t.fp ?? stepSig(t));
    if ((count.get(h) ?? 0) > weakMax)
      continue;
    if (t.sal.score >= prp)
      continue;
    const near = prpEvents.find((p) => p !== t && String(p.conv) === String(t.conv) && Math.abs((p.ts ?? 0) - (t.ts ?? 0)) <= window);
    if (near)
      rescued.push({ ...t, capturedBy: near.ts ?? 0 });
  }
  return rescued;
}
function skillRetrieved(verbs, rows) {
  if (!verbs.length)
    return false;
  const vset = verbs.map((v) => v.toLowerCase());
  return rows.some((r) => {
    const s = stepSig(r).toLowerCase();
    return vset.some((v) => s === v || v.length > 3 && s.includes(v));
  });
}
function labileSkills(skills, rows, defenses) {
  const tagged = tagExperience(rows, { defenses });
  const out = [];
  for (const s of skills) {
    const verbs = skillVerbs(s.body);
    if (!verbs.length)
      continue;
    const vset = verbs.map((v) => v.toLowerCase());
    const used = tagged.filter((t) => {
      const sig = stepSig(t).toLowerCase();
      return vset.some((v) => sig === v || v.length > 3 && sig.includes(v));
    });
    if (!used.length)
      continue;
    const hits = used.filter((t) => t.sal.pe >= 1);
    if (!hits.length)
      continue;
    const conflicts = [...new Set(hits.map((t) => `${stepSig(t)} ${t.ok === false ? "failed" : "succeeded-unexpectedly"} (${t.err || "ok"})`))].slice(0, 5);
    out.push({ name: s.name, reason: `retrieved + ${hits.length} prediction-error(s) → labile (re-author, do not append)`, pe: Math.max(...hits.map((t) => t.sal.pe)), conflicts });
  }
  return out.sort((a, b) => b.pe - a.pe || b.conflicts.length - a.conflicts.length);
}
function replayQueue(tagged, k = 12) {
  return [...tagged].sort((a, b) => b.sal.score - a.sal.score || (b.ts ?? 0) - (a.ts ?? 0)).slice(0, k);
}
function reverseReplay(tagged, opts = {}) {
  const lookback = opts.lookback ?? 6;
  const decay = opts.decay ?? 0.7;
  const byConv = new Map;
  for (const t of tagged) {
    const c = String(t.conv ?? "?");
    (byConv.get(c) ?? byConv.set(c, []).get(c)).push(t);
  }
  const credit = new Map;
  for (const [, rs] of byConv) {
    rs.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    rs.forEach((t, i) => {
      if (t.sal.rw > 0)
        for (let j = 0;j <= lookback && i - j >= 0; j++) {
          const step = rs[i - j];
          credit.set(step, (credit.get(step) ?? 0) + Math.pow(decay, j));
        }
    });
  }
  return [...credit.entries()].map(([t, c]) => ({ ...t, credit: +c.toFixed(3) })).sort((a, b) => b.credit - a.credit);
}
function interleave(novel, familiar) {
  const out = [];
  const n = Math.max(novel.length, familiar.length);
  for (let i = 0;i < n; i++) {
    if (i < novel.length)
      out.push(novel[i]);
    if (i < familiar.length)
      out.push(familiar[i]);
  }
  return out;
}
function renderEngramDigest(p) {
  const lines = ["# ENGRAM consolidation brief (prioritized replay, not recent-history)"];
  if (p.credited.length) {
    lines.push(`
## Rewarded paths (reverse-replay credit — steps that led to a win)`);
    for (const c of p.credited.slice(0, 8))
      lines.push(`- ${stepSig(c)} [credit ${c.credit}${c.ok === false ? " · was-a-failed-step" : ""}]`);
  }
  if (p.replay.length) {
    lines.push(`
## Highest-salience experiences`);
    for (const t of p.replay.slice(0, 8))
      lines.push(`- ${stepSig(t)} [sal ${t.sal.score} · pe ${t.sal.pe} · rw ${t.sal.rw} · nov ${t.sal.nov}]${t.err ? ` (${t.err})` : ""}`);
  }
  if (p.rescued.length) {
    lines.push(`
## Rescued one-shots (synaptic capture — rare, but sat next to what mattered)`);
    for (const t of p.rescued.slice(0, 6))
      lines.push(`- ${stepSig(t)}`);
  }
  if (p.labile.length) {
    lines.push(`
## Labile skills (RECONSOLIDATE — correct/weaken the contradicted claim; PRESERVE the proven core + frontmatter; never append a duplicate. Retire only if every prediction fails)`);
    for (const l of p.labile.slice(0, 6))
      lines.push(`- ${l.name}: ${l.reason}
    conflicts: ${l.conflicts.join("; ")}`);
  }
  if (lines.length === 1)
    lines.push("(nothing salient to consolidate this cycle)");
  return lines.join(`
`);
}
function engramConsolidate(rows, skills, opts = {}) {
  const defenses = opts.defenses ?? buildDefenses(rows);
  const tagged = tagExperience(rows, { defenses, now: opts.now, highSignal: opts.highSignal });
  const replay = replayQueue(tagged, opts.k ?? 12);
  const rescued = captureTagged(tagged);
  const credited = reverseReplay(tagged);
  const labile = labileSkills(skills, rows, defenses);
  return { hippoSize: rows.length, tagged: tagged.length, replay, rescued, credited, labile, digest: renderEngramDigest({ replay, rescued, credited, labile }) };
}
function guardDecision(toolName, args, defenses, mode) {
  if (mode === "off")
    return null;
  const { fp, tmpl } = fingerprint2(toolName, args ?? {});
  const hit = preActionDefense(stepSig({ tool: toolName, fp, tmpl }), defenses);
  if (!hit || hit.kind !== "avoid" || hit.severity < 2)
    return null;
  return { decision: mode, reason: `muscle-memory: "${hit.trigger}" → ${hit.errClass} recurred ${hit.count}× with no recovery. ${hit.defense}` };
}
function buildNeocortexBlock(managed, opts = {}) {
  const limit = opts.limit ?? 4000;
  const head = `# muscle-memory · consolidated skills (neocortex)
# ${managed.length} learned skill(s); invoke by name with the Skill tool.
`;
  const lines = managed.map((m) => `- ${m.name}: ${String(m.description).replace(/\s+/g, " ").slice(0, 140)}`);
  let body = head + lines.join(`
`);
  if (body.length > limit) {
    const keep = [];
    let len = head.length;
    for (const l of lines) {
      if (len + l.length + 1 > limit)
        break;
      keep.push(l);
      len += l.length + 1;
    }
    body = `${head}${keep.join(`
`)}
- …(+${lines.length - keep.length} more)`;
  }
  return body;
}
function nativeEnabled(channel) {
  return (process.env.MM_NATIVE ?? "").split(/[,\s]+/).filter(Boolean).includes(channel);
}
function reachFn(root, path) {
  let cur = root;
  let receiver = null;
  for (const key of path) {
    if (!cur || typeof cur !== "object")
      return null;
    receiver = cur;
    cur = Reflect.get(cur, key);
  }
  return typeof cur === "function" ? cur.bind(receiver) : null;
}
function pageItems(resp) {
  if (Array.isArray(resp))
    return resp;
  if (!resp || typeof resp !== "object")
    return [];
  const rec = resp;
  if (Array.isArray(rec.items))
    return rec.items;
  if (Array.isArray(rec.data))
    return rec.data;
  return [];
}
async function syncNeocortexBlock(client, agentId, content) {
  if (!agentId || !nativeEnabled("blocks"))
    return false;
  const update = reachFn(client, ["agents", "blocks", "update"]);
  if (!update)
    return false;
  try {
    await update(NEOCORTEX_BLOCK, { agent_id: agentId, value: content });
    return true;
  } catch {
    return false;
  }
}
var SKILL_PASSAGE_TAG = "mm:skill";
function skillPassageTag(name) {
  return `${SKILL_PASSAGE_TAG}:${name}`;
}
var SKILL_CANARY_NAMES = ["mm-canary-general-software-work", "mm-canary-generic-repair-shape"];
function isCanaryName(name) {
  return SKILL_CANARY_NAMES.includes(name);
}
function canaryPassages() {
  return [
    { name: SKILL_CANARY_NAMES[0], text: `skill: ${SKILL_CANARY_NAMES[0]}
general software work
Writing code, editing files, running commands in the terminal, reading documentation, checking output, and re-running until it works.` },
    { name: SKILL_CANARY_NAMES[1], text: `skill: ${SKILL_CANARY_NAMES[1]}
generic repair shape
Something failed during a run: investigate the cause of the failure, apply a change, run it again, and verify the fix worked.` }
  ];
}
function skillPassageText(name, description) {
  return `skill: ${name}
${name.replace(/-/g, " ")}
${String(description || "").replace(/\s+/g, " ").slice(0, 500)}`;
}
function parseSkillHits(resp) {
  if (!resp || typeof resp !== "object" || !("results" in resp) || !Array.isArray(resp.results))
    return [];
  const out = [];
  for (const r of resp.results) {
    if (!r || typeof r !== "object")
      continue;
    const tags = "tags" in r && Array.isArray(r.tags) ? r.tags : [];
    const named = tags.find((t) => typeof t === "string" && t.startsWith(`${SKILL_PASSAGE_TAG}:`));
    let name = named ? named.slice(SKILL_PASSAGE_TAG.length + 1) : "";
    if (!name && "content" in r && typeof r.content === "string")
      name = r.content.match(/^skill:\s*([a-z0-9-]+)/i)?.[1] ?? "";
    if (name && isValidSkillName(name) && !out.some((h) => h.name === name))
      out.push({ name, rank: out.length });
  }
  return out;
}
function calibrateSkillHits(raw, k) {
  const canaryRank = raw.reduce((best, h) => isCanaryName(h.name) && h.rank < best ? h.rank : best, Infinity);
  return raw.filter((h) => !isCanaryName(h.name)).slice(0, k).map((h, i) => canaryRank === Infinity ? { name: h.name, rank: i } : { name: h.name, rank: i, aboveCanary: h.rank < canaryRank });
}
async function semanticSkillCandidates(client, agentId, query, k = 3) {
  if (!agentId || !nativeEnabled("passages") || !query.trim())
    return [];
  const search = reachFn(client, ["agents", "passages", "search"]);
  if (!search)
    return [];
  try {
    const resp = await search(agentId, { query: query.slice(0, 4000), tags: [SKILL_PASSAGE_TAG], tag_match_mode: "all", top_k: k + SKILL_CANARY_NAMES.length });
    return calibrateSkillHits(parseSkillHits(resp), k);
  } catch {
    return [];
  }
}
async function syncSkillPassages(client, agentId, managed) {
  if (!agentId || !nativeEnabled("passages") || !managed.length)
    return 0;
  const search = reachFn(client, ["agents", "passages", "search"]);
  const create = reachFn(client, ["agents", "passages", "create"]);
  const del = reachFn(client, ["agents", "passages", "delete"]);
  if (!create)
    return 0;
  let synced = 0;
  const entries = [...managed.map((m) => ({ name: m.name, text: skillPassageText(m.name, m.description) })), ...canaryPassages()];
  for (const m of entries) {
    try {
      if (search && del) {
        const prior = await search(agentId, { query: m.name, tags: [skillPassageTag(m.name)], tag_match_mode: "all", top_k: 5 });
        if (prior && typeof prior === "object" && "results" in prior && Array.isArray(prior.results)) {
          for (const r of prior.results) {
            if (r && typeof r === "object" && "id" in r && typeof r.id === "string")
              await del(r.id, { agent_id: agentId });
          }
        }
      }
      await create(agentId, { text: m.text, tags: [SKILL_PASSAGE_TAG, skillPassageTag(m.name)] });
      if (!isCanaryName(m.name))
        synced++;
    } catch {}
  }
  return synced;
}

// mods/autopilot.ts
var AUTOPILOT_DEFAULT = { mode: "staged", dailyBudget: 5, minImpact: 4 };
function repairForRows(c, rows) {
  if (!c.fixes)
    return;
  const first = c.key.split(/\s*→\s*/)[0];
  return detectRepairChains(rows).find((r) => r.trigger === first || r.verifyStep === first || c.key.includes(r.trigger) || c.key.includes(r.verifyStep));
}
function autopilotPlan(input) {
  const cfg = input.config || AUTOPILOT_DEFAULT;
  const decisions = [];
  const skipped = [];
  let used = input.budgetUsedToday || 0;
  if (cfg.mode === "off")
    return { decisions, skipped: [{ what: "all", why: "autopilot off" }], budget: { used, limit: cfg.dailyBudget }, mode: cfg.mode };
  const existing = new Set(input.managed.map((m) => m.name));
  const existingByIdentity = new Map(input.managed.map((m) => [canonicalSkillIdentity(m.name), m.name]));
  const refineTargets = new Set;
  const apSteps = detectAntiPatterns(input.rows).map((p) => p.step.toLowerCase());
  for (const m of input.managed) {
    if (m.pinned)
      continue;
    const verbs = skillVerbs(m.body);
    if (verbs.length && verbs.some((v) => apSteps.some((s) => s === v || s.includes(v) || v.includes(s)))) {
      decisions.push({ op: "refine", skill: m.name, reason: "documented failure recurring — strengthen the pitfall" });
      refineTargets.add(m.name);
    }
  }
  for (const c of detect(input.rows).candidates) {
    if (used >= cfg.dailyBudget) {
      skipped.push({ what: c.key, why: "daily budget reached" });
      continue;
    }
    if (c.kind === "template") {
      skipped.push({ what: c.key, why: "single-command repetition — observe, don't auto-distill" });
      continue;
    }
    if (DESTRUCTIVE.test(c.key)) {
      skipped.push({ what: c.key, why: "destructive workflow — never auto-distilled" });
      continue;
    }
    const imp = impactScore(c).score;
    if (imp < cfg.minImpact) {
      skipped.push({ what: c.key, why: `impact ${imp} < ${cfg.minImpact}` });
      continue;
    }
    const draft = draftWithRepair(c, repairForRows(c, input.rows));
    const nm = slug(draft.name);
    if (!isValidSkillName(nm)) {
      skipped.push({ what: nm || c.key, why: "invalid or command-transition-shaped skill name" });
      continue;
    }
    const identity = canonicalSkillIdentity(nm);
    const identityMatch = identity && existingByIdentity.get(identity);
    if (identityMatch) {
      skipped.push({ what: nm, why: `canonical duplicate of ${identityMatch} — refine, don't re-distill` });
      continue;
    }
    if (existing.has(nm)) {
      skipped.push({ what: nm, why: "already managed — refine, don't re-distill" });
      continue;
    }
    const dc = dedupCheck(nm, draft.description, input.dirsForDedup);
    if (dc.dup) {
      skipped.push({ what: nm, why: `dedup: ${dc.reason}` });
      continue;
    }
    const lint = lintSkillDraft({ name: nm, description: draft.description, body: draft.body }, { needsPitfalls: !!c.fixes });
    if (!lint.ok) {
      skipped.push({ what: nm, why: `lint: ${lint.issues[0]}` });
      continue;
    }
    const quality = sotaQualityGaps({ name: nm, description: draft.description, body: draft.body });
    if (quality.length) {
      skipped.push({ what: nm, why: `quality: ${quality[0]}` });
      continue;
    }
    const verified = c.fixes > 0 || c.count >= MM.STRONG_SINGLE;
    const gate = cfg.mode === "auto" && verified ? "graduate" : "stage";
    decisions.push({ op: "distill", candidate: c, name: nm, reason: `impact ${imp}, ${c.count} reps${verified ? ", verified" : ""}`, gate });
    existing.add(nm);
    if (identity)
      existingByIdentity.set(identity, nm);
    used++;
  }
  for (const m of input.managed) {
    if (m.pinned || refineTargets.has(m.name))
      continue;
    const drift = specDrift(m.body, input.rows).drift;
    const ev = effectivenessVerdict({ uses: m.uses, ageDays: m.ageDays, staleAntiPattern: false });
    if (drift)
      decisions.push({ op: "retire", skill: m.name, reason: "spec-drift: referenced commands no longer occur" });
    else if (ev.verdict === "retire_candidate")
      decisions.push({ op: "retire", skill: m.name, reason: ev.reason });
  }
  return { decisions, skipped, budget: { used, limit: cfg.dailyBudget }, mode: cfg.mode };
}
function provenanceBlock(c) {
  return `
<!-- ${MM_TAG}: autopilot ${new Date().toISOString().slice(0, 10)}; candidate=${c.kind}:${c.key}; reps=${c.count}; convs=${c.convs}; fixes=${c.fixes}; impact=${impactScore(c).score} -->
`;
}
function appendRecurrenceNote(dir, name, note) {
  if (!existsSync4(join5(dir, name, "SKILL.md")))
    return false;
  let t = readSkill(dir, name);
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `- (${stamp}) autopilot: ${note}
`;
  if (/##\s+Pitfalls/i.test(t))
    t = t.replace(/(##\s+Pitfalls[^\n]*\n)/i, `$1${line}`);
  else
    t = t.replace(/(\n## Verification)/, `
## Pitfalls (autopilot)
${line}
$1`);
  writeSkill(dir, name, t);
  return true;
}
function executeAutopilotPlan(plan, opts) {
  const author = opts.author || ((c, r) => draftWithRepair(c, r));
  const graduated = [], staged = [], refined = [], retired = [], recommendedRetire = [];
  const retirePolicy = opts.retirePolicy ?? "recommend";
  const receipts = [];
  for (const d of plan.decisions) {
    try {
      if (d.op === "distill") {
        const draft = author(d.candidate, repairForRows(d.candidate, opts.rows));
        const content = `---
name: ${d.name}
description: ${draft.description}
---

${draft.body}${provenanceBlock(d.candidate)}
`;
        const sec = scanSkillContent(content);
        if (!sec.ok) {
          receipts.push({ op: "distill", name: d.name, blocked: `security: ${sec.issues.join("; ")}`, ts: Date.now() });
          continue;
        }
        if (d.gate === "graduate") {
          writeSkill(opts.skillsDir, d.name, content);
          syncSkillToDesktopCatalog(d.name, opts.ctx);
          graduated.push(d.name);
        } else {
          writeSkill(STAGED_DIR, d.name, content);
          staged.push(d.name);
        }
        receipts.push({ op: "distill", name: d.name, gate: d.gate, reason: d.reason, ts: Date.now() });
      } else if (d.op === "refine") {
        if (appendRecurrenceNote(opts.skillsDir, d.skill, d.reason)) {
          refined.push(d.skill);
          receipts.push({ op: "refine", name: d.skill, reason: d.reason, ts: Date.now() });
        }
      } else if (d.op === "retire") {
        if (retirePolicy !== "enabled") {
          recommendedRetire.push(d.skill);
          receipts.push({ op: "retire", name: d.skill, reason: d.reason, executed: false, reasonWithheld: "retire_requires_explicit_policy", ts: Date.now() });
        } else {
          const target = retireManagedSkill(d.skill, d.reason, opts.ctx, d.absorbedInto);
          retired.push(d.skill);
          receipts.push({ op: "retire", name: d.skill, reason: d.reason, target, executed: true, ts: Date.now() });
        }
      }
    } catch (e) {
      receipts.push({ op: d.op, error: String(e?.message ?? e) });
    }
  }
  return { graduated, staged, refined, retired, recommendedRetire, receipts };
}
function loadAutopilotState() {
  try {
    const s = JSON.parse(readFileSync4(AUTOPILOT_STATE, "utf8"));
    const today = new Date().toISOString().slice(0, 10);
    return s.date === today ? s : { date: today, used: 0 };
  } catch {
    return { date: new Date().toISOString().slice(0, 10), used: 0 };
  }
}
function saveAutopilotState(s) {
  try {
    ensureDir();
    writeFileSync4(AUTOPILOT_STATE, JSON.stringify(s));
  } catch {}
}
function managedView(dirs) {
  const usage = loadUsage();
  const out = [];
  const seen = new Set;
  for (const d of dirs)
    for (const n of listSkillNames(d)) {
      if (!isManaged(d, n) || seen.has(n))
        continue;
      seen.add(n);
      const u = usage[n] || {};
      const created = u.created || Date.now();
      out.push({ name: n, description: skillDesc(d, n), body: readSkill(d, n), uses: u.uses || 0, ageDays: Math.floor((Date.now() - created) / 86400000), pinned: !!u.pinned });
    }
  return out;
}
function streamChunkText(c) {
  if (c == null)
    return "";
  if (typeof c === "string")
    return c;
  if (typeof c.text === "string")
    return c.text;
  if (typeof c.delta === "string")
    return c.delta;
  if (typeof c.content === "string")
    return c.content;
  if (typeof c.delta?.text === "string")
    return c.delta.text;
  if (typeof c.delta?.content === "string")
    return c.delta.content;
  if (typeof c.content?.text === "string")
    return c.content.text;
  if (Array.isArray(c.content))
    return c.content.map((x) => typeof x === "string" ? x : x?.text ?? "").join("");
  if (typeof c.choices?.[0]?.delta?.content === "string")
    return c.choices[0].delta.content;
  if (typeof c.choices?.[0]?.text === "string")
    return c.choices[0].text;
  return "";
}
async function consumeStreamBounded(stream) {
  const ms = Number(process.env.MM_FORK_TIMEOUT_MS) || 60000;
  let out = "";
  const reader = (async () => {
    try {
      for await (const c of stream)
        out += streamChunkText(c);
    } catch {}
    return out;
  })();
  const timer = new Promise((resolve2) => setTimeout(() => resolve2(out), ms));
  return Promise.race([reader, timer]);
}
var HIDDEN_FORKS = new WeakMap;
async function hiddenForkFor(ctx, purpose) {
  if (typeof ctx?.conversation?.fork !== "function")
    return null;
  const key = typeof ctx === "object" && ctx ? ctx : ctx.conversation;
  let byPurpose = HIDDEN_FORKS.get(key);
  if (!byPurpose) {
    byPurpose = new Map;
    HIDDEN_FORKS.set(key, byPurpose);
  }
  let forked = byPurpose.get(purpose);
  if (!forked) {
    forked = Promise.resolve(ctx.conversation.fork({ hidden: true }));
    byPurpose.set(purpose, forked);
  }
  try {
    return await forked;
  } catch (e) {
    byPurpose.delete(purpose);
    throw e;
  }
}
async function forkAuthor(ctx, c, repair) {
  try {
    if (typeof ctx?.conversation?.fork !== "function")
      return null;
    const det = draftWithRepair(c, repair);
    const prompt = `You are muscle-memory's skill author. Write ONLY the markdown BODY (no YAML frontmatter) of a SKILL.md capturing this recurring real workflow. Keep it under 120 lines. Required sections in order: "## Trigger", "## Observed pattern" (include the exact pattern in a code block), "## Procedure" (numbered, concrete, adaptable), ${repair ? `"## Pitfalls" (the observed error "${repair.errClass}" and its fix "${repair.fixStep}"), ` : ""}"## Verification". Pattern: ${c.key}. Reps: ${c.count} across ${c.convs} conversation(s). Output ONLY the markdown body, nothing else.`;
    const forked = await hiddenForkFor(ctx, "fork-author");
    if (!forked)
      return null;
    const stream = await forked.sendMessageStream([{ role: "user", content: prompt }]);
    let body = await consumeStreamBounded(stream);
    body = body.trim().replace(/^```(?:markdown|md)?\n?|\n?```$/g, "");
    if (body.length < 80 || !/##\s*Procedure/i.test(body) || !/##\s*Verification/i.test(body))
      return null;
    const lint = lintSkillDraft({ name: det.name, description: det.description, body }, { needsPitfalls: !!c.fixes });
    if (!lint.ok)
      return null;
    const sec = scanSkillContent(body);
    if (!sec.ok)
      return null;
    return { name: det.name, description: det.description, body };
  } catch {
    return null;
  }
}
async function runAutopilot(ctx, config) {
  const cfg = config || AUTOPILOT_DEFAULT;
  const dirs = scanDirs(ctx);
  const rows = loadExperience();
  const st = loadAutopilotState();
  const plan = autopilotPlan({ rows, managed: managedView(dirs), dirsForDedup: dirs, config: cfg, budgetUsedToday: st.used });
  if (cfg.mode === "off" || !plan.decisions.length)
    return plan;
  const result = executeAutopilotPlan(plan, { skillsDir: agentSkillsDir(ctx), rows, ctx });
  saveAutopilotState({ date: st.date, used: st.used + result.graduated.length + result.staged.length });
  if (result.graduated.length || result.staged.length) {
    const activeDir = agentSkillsDir(ctx);
    const verifiedGraduated = result.graduated.filter((n) => {
      const proof = graduationProof(activeDir, n);
      if (!proof.ok)
        appendUiEvent({ phase: "graduation_unverified", summary: `not claiming graduation for '${n}': ${proof.reason.slice(0, 100)}`, skill: n, action: "graduate", route: "autopilot truth-guard" });
      return proof.ok;
    });
    const g = verifiedGraduated[0], s = result.staged[0];
    const summary = g ? `graduated '${g}'${verifiedGraduated.length > 1 ? ` +${verifiedGraduated.length - 1}` : ""}` : `staged '${s}'${result.staged.length > 1 ? ` +${result.staged.length - 1}` : ""} for review`;
    if (g || s) {
      appendUiEvent({ phase: g ? "skill_graduated" : "skill_staged", summary, skill: g || s, action: g ? "graduate" : "stage", route: "autopilot" });
      writeUiState(g ? { phase: "rotation", skill: g, last: summary, route: "AUTOPILOT · graduate" } : { phase: "idle", last: "", route: "AUTOPILOT · stage" });
    }
    for (const n of verifiedGraduated)
      appendMeshFeed({ type: "skill_graduated", skill: n, route: "AUTOPILOT", signals: 0 });
    for (const n of verifiedGraduated) {
      try {
        const _d = agentSkillsDir(ctx);
        const _b = readSkill(_d, n);
        if (_b) {
          const _p = publishPlan({ name: n, description: skillDesc(_d, n), body: _b, shelf: "agent" });
          appendUiEvent({ phase: "skill_publish_preflight", summary: `${n}: ${_p.publishability}/100 · tier=${publishTier(_p)} · ${_p.recommended}`, skill: n, route: "auto-after-graduate" });
        }
      } catch {}
    }
  }
  const published = [];
  if (process.env.MM_PUBLISH === "auto" && result.graduated.length) {
    for (const n of result.graduated) {
      try {
        publishSkillToCatalog(n, ctx);
        published.push(n);
      } catch {}
    }
    if (published.length) {
      appendUiEvent({ phase: "skill_published", summary: `published ${published.length} to catalog (Custom Skills)`, skill: published[0], action: "publish", route: "autopilot" });
      writeUiState({ phase: "rotation", skill: published[0], last: `published '${published[0]}' to catalog`, route: "AUTOPILOT · publish" });
      for (const n of published)
        appendMeshFeed({ type: "skill_published", skill: n, route: "CATALOG", signals: 0 });
    }
  }
  try {
    ensureDir();
    mkdirSync4(RECEIPTS_DIR, { recursive: true });
    writeFileSync4(join5(RECEIPTS_DIR, `autopilot-${Date.now()}.json`), JSON.stringify({ mode: cfg.mode, ...result, published, ts: Date.now() }, null, 2));
  } catch {}
  return { ...plan, result };
}
var REVIEW_PROMPT = `You are the skill-library reviewer for a self-improving AI coding agent (agentskills.io). From the cross-session evidence, author ONE genuinely valuable CLASS-LEVEL skill IF a durable reusable lesson emerged.

Write a COMPLETE skill — completeness matters more than brevity. Structure: frontmatter (name + description with triggers), then "## When to use" (concrete triggers), "## Procedure" (numbered, concrete, safe-first), "## Pitfalls" (one entry per genuinely-distinct hard-won failure, each as the real symptom → the exact fix → a one-line diagnostic TELL), "## Verification", and — when the evidence is diverse — a "## Worked examples (real cases)" section. MATCH LENGTH TO EVIDENCE: a short skill is right for simple/sparse evidence; a RICH, exhaustive skill is right when the evidence is diverse (many distinct real failures) — never sacrifice a real pitfall or worked-example to hit a length target. FINISH every section — never trail off mid-sentence or mid-code-block. Stay organized + hygienic (clear sections, short fenced snippets), never a wall of text.

HARD RULES:
- CAPTURE EVERY REAL PITFALL: include each genuinely-distinct hard-won failure in the evidence (this breadth of real, cross-session lessons IS the whole advantage), each with its exact fix. Cut filler, redundancy, and obvious steps ruthlessly — but never drop a real pitfall to save space.
- DECISION-AWARE: for recovery/debugging/troubleshooting skills especially, structure the Procedure as a DECISION GUIDE — symptom → safest fix first → fallback — so the reader knows WHICH path to take, not just a menu of options.
- CONCRETE + ACCURATE: show exact, CORRECT code/commands in fenced blocks (a wrong or hand-wavy example is worse than none — verify it actually fixes the stated problem). Keep code snippets short + self-contained so they never get cut off. Every step specific.
- SAFE FIRST: ALWAYS make a non-destructive safety net (a backup branch/tag, a stash, or a copy) the EXPLICIT first step before any destructive/irreversible command (reset --hard, force-push, rm, drop, db migrate) — and name it as the safety net so a wrong move is recoverable.
- NAMING: class-level only; never an x-to-y transition, error string, PR number, date, codename, or fix-/debug-/audit-today artifact.
- NEGATIVE FILTER: never capture environment-dependent failures (command-not-found, missing binaries, uninstalled packages, creds) or tool-negatives ("X is broken").
- WORKED EXAMPLES (the edge — use them FULLY): the evidence may include real, cross-session symptom→fix examples. Do TWO things, not one: (1) GENERALIZE them into a high-altitude decision guide in the Procedure/Pitfalls (transfers across languages/projects), giving each a one-line diagnostic TELL; AND (2) when the evidence is diverse, ALSO include an explicit "## Worked examples (real cases)" section that catalogs EACH distinct real case compactly — symptom (one line) → the exact fix → the TELL. The generalized guide gives ALTITUDE; the worked-examples catalog gives CONCRETENESS — include BOTH; the catalog is a strength when the cases are real and diverse, not a weakness. CRITICAL: do NOT collapse genuinely-distinct failure classes (e.g. float-truncation vs type-coercion vs input-mutation vs off-by-one are DIFFERENT bugs) into one generic bucket — emit a distinct pitfall + example for EACH. Beyond the observed examples, also cover the 2-3 most common ADJACENT failure modes for this class (e.g. order/state-dependence, import/path errors, masked cascading failures) so the skill is broad. Include a safe-first step (inspect/diff before editing; change source not tests; smallest reversible edit). Still emit the required frontmatter: a CLASS-level name (a noun phrase like debugging-failing-tests; obey the NAMING rule) and a description that STARTS WITH "Use when".
Output ONLY the complete SKILL.md (no preamble, not truncated), or exactly "NOTHING-TO-SAVE".`;
var REVIEW_PROMPT_COMPACT = `From the cross-session evidence below, author ONE class-level reusable skill as a COMPLETE SKILL.md, IF a durable lesson emerged. Format: YAML frontmatter (name: a class-level lowercase-hyphen slug; description: STARTS WITH "Use when"), then "## Procedure" (numbered, safe-first), "## Pitfalls" (each: symptom → exact fix → one-line TELL), "## Verification". Concrete correct fenced code; no preamble. Output ONLY the SKILL.md markdown, or exactly "NOTHING-TO-SAVE".`;
var SEARCH_STOP = new Set("the and for with via use using used run running runs tool tools command commands file files validate validating validation build builds building test testing tests check checking code into from that this your you any new real step steps workflow workflows work works working session sessions across before after fix fixed fixing error errors fail failed failing not add get set make made need want call calls called when then them they here there what which how its has have will can may also same each only over under out off across recurring observed".split(" "));
var SEARCH_DISTINCT_MIN = 3;
function normalizePrescriptionQuery(query) {
  return String(query).replace(/\bmuscle[\s-]+memory\b/gi, " ").replace(/\s+/g, " ").trim();
}
var IDENTITY_STOP = new Set(["recovering", "repairing", "recovery", "repair", "repairs", "from", "failing", "failed", "failure", "failures", "runs", "run", "at"]);
function canonicalSkillIdentity(name) {
  return [...new Set(slug(name).split("-").filter((token) => token && !IDENTITY_STOP.has(token)))].join("-");
}
function searchSkills(dirs, query, k = 5) {
  const terms = [...new Set(String(query).toLowerCase().split(/[^a-z0-9.]+/).filter((t) => t.length > 2 && !SEARCH_STOP.has(t)))];
  const out = [];
  const seen = new Set;
  for (const d of dirs)
    for (const n of listSkillNames(d)) {
      if (seen.has(n))
        continue;
      seen.add(n);
      const body = readSkill(d, n).toLowerCase();
      const desc = skillDesc(d, n);
      const nl = n.toLowerCase(), dl = desc.toLowerCase();
      let score = 0, matched = 0;
      for (const t of terms) {
        const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const inName = nl.includes(t), inDesc = dl.includes(t);
        if (inName || inDesc)
          matched++;
        const bc = Math.min((body.match(new RegExp("\\b" + esc, "g")) || []).length, 3);
        score += (inName ? 8 : 0) + (inDesc ? 4 : 0) + bc;
      }
      if (matched > 0)
        out.push({ name: n, description: desc, dir: d, score, matched });
    }
  return out.sort((a, b) => b.score - a.score || b.matched - a.matched).slice(0, k);
}
function pickUpdateTarget(matches, threshold = 18) {
  const top = matches[0];
  if (!top)
    return null;
  const second = matches[1];
  const clearlyLeads = !second || top.score >= 1.5 * second.score;
  const topDir = String(top.dir || "");
  const topIsStaged = topDir === STAGED_DIR || /[\\/]staged$/.test(topDir);
  if (top.score >= threshold && top.matched >= SEARCH_DISTINCT_MIN && (clearlyLeads || topIsStaged))
    return { ...top, confidence: "high" };
  return null;
}
function isAmbiguousExistingRoute(matches, threshold = 18) {
  const top = matches[0], second = matches[1];
  if (!top || !second)
    return false;
  if (pickUpdateTarget(matches, threshold))
    return false;
  const topStrong = top.score >= threshold && top.matched >= SEARCH_DISTINCT_MIN;
  const secondStrong = second.score >= Math.max(threshold, top.score * 0.65) && second.matched > top.matched;
  return topStrong && secondStrong;
}
var SEMANTIC_RANK_BONUS = [12, 6, 3];
function applySemanticEvidence(matches, hits, onShelf, threshold = 18) {
  if (!hits.length)
    return { matches, suspect: null };
  const boosted = matches.map((m) => {
    const hit = hits.find((h) => h.name === m.name);
    return hit && m.matched > 0 ? { ...m, score: m.score + (SEMANTIC_RANK_BONUS[hit.rank] ?? 0) } : m;
  }).sort((a, b) => b.score - a.score || b.matched - a.matched);
  const top = hits.some((h) => h.aboveCanary !== undefined) ? hits.find((h) => h.aboveCanary === true && onShelf(h.name)) : hits[0];
  const lex = top ? boosted.find((m) => m.name === top.name) : undefined;
  const suspect = top && onShelf(top.name) && (!lex || lex.matched < SEARCH_DISTINCT_MIN || lex.score < threshold) ? top.name : null;
  return { matches: boosted, suspect };
}
function routeSkill(lexical, hits, onShelf, threshold = 18) {
  const { matches, suspect } = applySemanticEvidence(lexical, hits, onShelf, threshold);
  const target = pickUpdateTarget(matches, threshold);
  if (target)
    return { route: "update", target, matches, suspect };
  if (isAmbiguousExistingRoute(matches, threshold))
    return { route: "park-ambiguous", target: null, matches, suspect };
  if (suspect)
    return { route: "park-semantic", target: null, matches, suspect };
  return { route: "create", target: null, matches, suspect };
}
function frontmatterOf(content) {
  return (String(content || "").match(/^---\n([\s\S]*?)\n---\s*/)?.[1] || "").trimEnd();
}
function metadataBlockFromFrontmatter(fm) {
  const lines = fm.split(`
`);
  const start = lines.findIndex((l) => /^metadata\s*:/i.test(l.trim()));
  if (start < 0)
    return "";
  const out = [lines[start]];
  for (let i = start + 1;i < lines.length; i++) {
    const line = lines[i];
    if (/^[A-Za-z0-9_-]+\s*:/.test(line) && !/^\s/.test(line))
      break;
    out.push(line);
  }
  return out.join(`
`).trimEnd();
}
function preserveExistingFrontmatterMetadata(newContent, oldContent) {
  if (!oldContent)
    return newContent;
  const oldMeta = metadataBlockFromFrontmatter(frontmatterOf(oldContent));
  if (!oldMeta || /^---\n[\s\S]*?\nmetadata\s*:/im.test(newContent))
    return newContent;
  return newContent.replace(/^---\n([\s\S]*?)\n---\s*/m, (_m, fm) => `---
${String(fm).trimEnd()}
${oldMeta}
---

`);
}
function skillSectionNames(content) {
  const out = [];
  const text = String(content || "").replace(/```[\s\S]*?```/g, "");
  for (const m of text.matchAll(/^##\s+(.+?)\s*$/gim)) {
    const section = m[1].trim().replace(/[`*_]/g, "").toLowerCase();
    if (section && !out.includes(section))
      out.push(section);
  }
  return out;
}
function compareSkillSections(oldContent, newContent) {
  const oldSections = skillSectionNames(oldContent || "");
  const newSections = skillSectionNames(newContent || "");
  const preservedSections = oldSections.filter((s) => newSections.includes(s));
  const droppedSections = oldSections.filter((s) => !newSections.includes(s));
  const addedSections = newSections.filter((s) => !oldSections.includes(s));
  return { oldSections, newSections, preservedSections, droppedSections, addedSections };
}
async function reviewAndAuthor(evidence, dirs, authorFn, opts = {}) {
  const threshold = opts.updateThreshold ?? 18;
  const hits = opts.semanticFn ? await opts.semanticFn(evidence, 3).catch(() => []) : [];
  const d = routeSkill(searchSkills(dirs, evidence, 3), hits, (n) => dirs.some((x) => existsSync4(join5(x, n, "SKILL.md"))), threshold);
  const { matches } = d;
  const updTarget = d.target;
  const slimEarly = matches.map((m) => ({ name: m.name, score: m.score, matched: m.matched }));
  if (d.route === "park-ambiguous") {
    return { action: "none", reason: `ambiguous existing skills: ${matches.slice(0, 3).map((m) => `${m.name}(s${m.score}/m${m.matched})`).join(", ")}; refusing autonomous create`, matches: slimEarly };
  }
  if (d.route === "park-semantic") {
    return { action: "none", reason: `possible semantic duplicate of '${d.suspect}' (embedding match without distinctive lexical overlap); refusing autonomous create — review or absorb manually`, matches: slimEarly };
  }
  const existingForUpdate = updTarget ? (() => {
    try {
      const d2 = dirs.find((x) => existsSync4(join5(x, updTarget.name, "SKILL.md")));
      return d2 ? readSkill(d2, updTarget.name) : "";
    } catch {
      return "";
    }
  })() : "";
  const updateContext = existingForUpdate ? `

EXISTING SKILL CONTENT (preserve proven core; patch in new lessons, do not rewrite from scratch):
\`\`\`markdown
${existingForUpdate.slice(0, 3500)}
\`\`\`` : "";
  const hint = updTarget ? `

UPDATE-FIRST (anti-bloat): an existing skill already covers this territory — "${updTarget.name}": ${updTarget.description}. Extend it: keep that exact name, preserve useful existing sections/frontmatter metadata/provenance, and fold ONLY the new pitfalls/steps into one improved full SKILL.md. Do not delete valuable original structure just to make a cleaner rewrite. Only use a different name if the territory is genuinely distinct.${updateContext}` : matches.length ? `

Existing skills (avoid duplicating): ${matches.map((m) => m.name).join(", ")}.` : "";
  const _classes = (evidence.match(/^- recovered failure:/gm) || []).length;
  const _examples = (evidence.match(/·\s*example\s*—/g) || []).length;
  const _diverse = Math.max(_classes, _examples) >= 4;
  const depthDirective = _diverse ? `

EVIDENCE DEPTH: this evidence holds ${_examples} concrete worked-example${_examples === 1 ? "" : "s"} spanning distinct failure classes. HIGH-DIVERSITY regime — completeness matters more than brevity. The skill should have ALL of these sections (a Procedure-only skill is INCOMPLETE and will be REJECTED):
- "## Procedure" — a generalized decision guide (symptom → safest fix path).
- "## Pitfalls" — ONE entry per DISTINCT failure class (symptom → exact fix → one-line diagnostic TELL). Never merge different bugs into one generic bucket; emit a separate pitfall for each of the ${_examples} cases' classes.
- "## Verification" — how to confirm green with no regressions.
- "## Worked examples (real cases)" — catalog ALL ${_examples} real cases compactly: symptom (one line) → exact fix → TELL.
The ~70-line cap is LIFTED (target a rich ~120-180 lines); be EXHAUSTIVE on the diverse evidence — that breadth is the whole edge — but stay sectioned + hygienic (no wall of text).` : "";
  const parseDraft = (raw2) => {
    let skill = (raw2 || "").replace(/<\/?think>/gi, "").trim();
    const startIdx = skill.search(/(^|\n)\s*(---\s*\n|#\s+|name:\s)/i);
    if (startIdx > 0)
      skill = skill.slice(startIdx).trim();
    skill = skill.replace(/^```(?:markdown|md|yaml)?\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    if (/^NOTHING-TO-SAVE/i.test(skill) || skill.length < 40)
      return null;
    const rawName = (skill.match(/^name:\s*["']?(.+?)["']?\s*$/im)?.[1] || "").trim();
    if (rawName && (/[\/\\;|&]|\.\./.test(rawName) || rawName.length > 64))
      return { name: "", description: "", body: "", unsafeName: rawName };
    let name2 = slug(rawName);
    if (rawName && name2 && !isValidSkillName(name2))
      return { name: name2, description: "", body: "", invalidName: name2 };
    if (!name2)
      name2 = slug((skill.match(/^#\s+(.+?)\s*$/m)?.[1] || "").trim());
    if (!name2 && updTarget)
      name2 = updTarget.name;
    let description2 = (skill.match(/^description:\s*["']?(.+?)["']?\s*$/im)?.[1] || "").trim();
    if (!description2)
      description2 = (skill.split(`
`).find((l) => {
        const t = l.trim();
        return t.length > 25 && !/^([#`>*-]|---|name:|title:|description:)/i.test(t);
      }) || "").trim();
    if (!description2 && updTarget)
      description2 = updTarget.description;
    let body2 = skill;
    const secStart = body2.search(/(^|\n)##\s+/);
    if (secStart >= 0)
      body2 = body2.slice(secStart);
    else
      body2 = body2.replace(/^---[\s\S]*?\n---\s*\n?/, "").replace(/^#\s+.+\n+/, "");
    body2 = body2.replace(/\n---\s*(\n[\s\S]*)?$/, "").trim();
    return { name: name2, description: description2, body: body2 };
  };
  const isCleanDraft = (p) => isValidSkillName(p.name) && !!p.description && p.description.length >= 20 && lintSkillDraft(p).ok;
  let _fb;
  const fallback = () => {
    if (_fb === undefined) {
      try {
        const c = findCandidate();
        _fb = c ? draftWithRepair(c, repairForCandidate(c)) : null;
      } catch {
        _fb = null;
      }
    }
    return _fb;
  };
  const fbUsable = (f) => !!f && isValidSkillName(f.name) && !!f.body && f.body.trim().length >= 40 && lintSkillDraft(f).ok && scanSkillContent(f.body).ok;
  const looksEmpty = (s) => {
    const t = (s || "").replace(/<\/?think>/gi, "").trim();
    return t.length < 40 && !/^NOTHING-TO-SAVE/i.test(t);
  };
  const saidNothing = (s) => /^NOTHING-TO-SAVE/i.test((s || "").replace(/<\/?think>/gi, "").trim());
  let degraded;
  let raw = await authorFn(REVIEW_PROMPT, evidence + hint + depthDirective) || "";
  if (looksEmpty(raw)) {
    degraded = "author-empty→retry-same";
    try {
      raw = await authorFn(REVIEW_PROMPT, evidence + hint + depthDirective) || raw;
    } catch {}
  }
  if (looksEmpty(raw)) {
    degraded = "author-empty→retry-compressed";
    try {
      raw = await authorFn(REVIEW_PROMPT_COMPACT, evidence) || raw;
    } catch {}
  }
  try {
    ensureDir();
    writeFileSync4(join5(STATE_DIR, "reflect-last-raw.txt"), `=== ${new Date().toISOString()}${degraded ? " [" + degraded + "]" : ""} ===
${raw}
`);
  } catch {}
  let parsed = parseDraft(raw);
  if (parsed?.unsafeName)
    return { action: "reject", reason: `name "${parsed.unsafeName.slice(0, 40)}" has unsafe characters (path/injection)`, degraded };
  if (parsed?.invalidName)
    return { action: "reject", reason: `name "${parsed.invalidName}" not class-level`, degraded };
  if (!parsed) {
    if (saidNothing(raw))
      return { action: "none", reason: "author judged NOTHING-TO-SAVE" };
    const f = fallback();
    if (fbUsable(f)) {
      parsed = { name: f.name, description: f.description, body: f.body };
      degraded = (degraded ? degraded + "→" : "author-empty→") + "deterministic-fallback";
    } else
      return { action: "reject", reason: `author produced no usable skill after same+compressed retries; deterministic fallback ${f ? "sub-threshold" : "unavailable"}`, degraded: (degraded || "author-empty") + "→no-usable-skill" };
  }
  if (!parsed.body || parsed.body.trim().length < 10)
    return { action: "reject", reason: "body too thin" };
  const depthComplete = (b) => !_diverse || /##\s+pitfalls/i.test(b) && /##\s+worked\s+examples/i.test(b);
  const sotaGaps = sotaQualityGaps(parsed);
  if ((!isCleanDraft(parsed) || !depthComplete(parsed.body) || sotaGaps.length) && !(degraded || "").includes("deterministic-fallback")) {
    const why = lintSkillDraft(parsed).issues.concat(isValidSkillName(parsed.name) ? [] : ["name must be a class-level lowercase-hyphen slug"]).concat((parsed.description || "").length >= 20 ? [] : ["description too short"]).concat(depthComplete(parsed.body) ? [] : [`HIGH-DIVERSITY skill is MISSING required depth sections (needs both "## Pitfalls" with one entry per distinct class AND "## Worked examples (real cases)" cataloging all ${_examples} cases) — a Procedure-only skill is too thin`]).concat(sotaGaps);
    const corrective = `

YOUR PREVIOUS DRAFT IS NOT YET SOTA (${why.join("; ")}). A top-tier skill ALWAYS has: concrete correct fenced code, a one-line diagnostic TELL on every Pitfall, an explicit safe-first step before any destructive command, and a class-level (not one-off) frame. Re-output ONE complete SKILL.md and NOTHING else, fixing every issue above: YAML frontmatter with a class-level "name:" (lowercase-hyphen) + a "description:" that STARTS WITH "Use when"; a body with "## Procedure", "## Pitfalls" (each with symptom → exact fix → TELL), "## Verification"${_diverse ? ', AND "## Worked examples (real cases)" cataloging every real case' : ""}.`;
    try {
      const raw2 = await authorFn(REVIEW_PROMPT, evidence + hint + depthDirective + corrective) || "";
      try {
        writeFileSync4(join5(STATE_DIR, "reflect-last-raw.txt"), `=== ${new Date().toISOString()} (retry) ===
${raw2}
`);
      } catch {}
      const p2 = parseDraft(raw2);
      if (p2 && !p2.unsafeName && isCleanDraft(p2) && depthComplete(p2.body) && sotaQualityGaps(p2).length <= sotaGaps.length) {
        parsed = p2;
        raw = raw2;
      }
    } catch {}
  }
  let { name, description, body } = parsed;
  if (!isValidSkillName(name)) {
    const f = fallback();
    name = updTarget && isValidSkillName(updTarget.name) ? updTarget.name : f && isValidSkillName(f.name) ? f.name : name;
  }
  if (!isValidSkillName(name))
    return { action: "reject", reason: `name "${name}" not class-level`, degraded };
  const secEarly = scanSkillContent(body);
  if (!secEarly.ok)
    return { action: "reject", reason: `security: ${secEarly.issues.join("; ")}`, degraded };
  const descOk = (d2) => !!d2 && d2.length >= 20 && /\b(use when|trigger|when )/i.test(d2);
  if (!descOk(description)) {
    if (description && description.length >= 12 && !/\b(use when|trigger|when )/i.test(description))
      description = `Use when ${description}`.slice(0, 700);
    if (!descOk(description)) {
      const f = fallback();
      description = f && descOk(f.description) ? f.description : updTarget && descOk(updTarget.description) ? updTarget.description : description;
    }
  }
  if (!/##\s+procedure/i.test(body) || !/##\s+verification/i.test(body)) {
    const f = fallback();
    if (f) {
      if (!/##\s+procedure/i.test(body)) {
        const m = f.body.match(/(##\s+Procedure[\s\S]*?)(?=\n##\s|\s*$)/i);
        body += `

${m ? m[1].trim() : `## Procedure
1. Repeat the observed workflow, adapting paths/args to the current context.
2. Capture the success/failure receipt before moving on.`}`;
      }
      if (!/##\s+verification/i.test(body)) {
        const m = f.body.match(/(##\s+Verification[\s\S]*?)(?=\n##\s|\s*$)/i);
        body += `

${m ? m[1].trim() : `## Verification
- Confirm via concrete command/tool output that the workflow actually succeeded.`}`;
      }
    }
  }
  const sec = scanSkillContent(body);
  if (!sec.ok)
    return { action: "reject", reason: `security: ${sec.issues.join("; ")}`, degraded };
  const lint = lintSkillDraft({ name, description, body });
  if (!lint.ok) {
    const f = fallback();
    if (f && lintSkillDraft(f).ok && isValidSkillName(f.name)) {
      ({ name, description, body } = f);
      degraded = (degraded ? degraded + "→" : "") + "lint-repair-fallback";
    } else
      return { action: "reject", reason: `lint: ${lint.issues.join("; ")}`, degraded };
  }
  const content = `---
name: ${name}
description: ${description}
---

${body}
`;
  const slim = matches.map((m) => ({ name: m.name, score: m.score, matched: m.matched }));
  const existingNames = new Set(matches.map((m) => m.name));
  if (existingNames.has(name)) {
    const preserved = preserveExistingFrontmatterMetadata(content, existingForUpdate);
    return { action: "update", name, description, body, content: preserved, updateTarget: name, matches: slim, degraded };
  }
  return { action: "create", name, description, body, content, matches: slim, degraded };
}
function buildEvidenceManifest(i) {
  const sd = i.oldContent ? compareSkillSections(i.oldContent, i.newContent) : undefined;
  return { ts: new Date().toISOString(), action: i.action, skill: i.skill, updateTarget: i.updateTarget, sources: { conversations: i.convs, durableSignals: i.signals }, memfsHits: i.memfsHits.map((m) => ({ name: m.name, score: m.score, matched: m.matched })), preferencesInjected: i.preferences, rejectedNoise: i.rejected, newHash: hash(i.newContent), oldHash: i.oldContent ? hash(i.oldContent) : undefined, sectionDiff: sd ? { preserved: sd.preservedSections, dropped: sd.droppedSections, added: sd.addedSections } : undefined, gates: { naming: true, security: true, lint: true } };
}
function retrievePreferences(evidence, memDir) {
  const dir = memDir || process.env.MEMORY_DIR;
  if (!dir)
    return [];
  const prefs = [];
  for (const s of ["persona.md", "system/persona.md", "system/human.md", "human.md", "system/human/preferences.md"]) {
    const p = join5(dir, s);
    if (!existsSync4(p))
      continue;
    try {
      for (const line of readFileSync4(p, "utf8").split(`
`)) {
        const l = line.trim().replace(/^[-*#>\s]+/, "");
        if (/\b(prefer|preference|always|never|wants?|likes?|hates?|style|format|verbos|concise|terse|tone|don'?t)\b/i.test(l) && l.length > 20 && l.length < 220)
          prefs.push(l);
      }
    } catch {}
  }
  return [...new Set(prefs)].slice(0, 6);
}
function reflectSignature(ev) {
  return hash(`${ev.convs}
${ev.items}
${ev.digest}`);
}
function loadHandledReflects() {
  try {
    return existsSync4(REFLECT_HANDLED) ? JSON.parse(readFileSync4(REFLECT_HANDLED, "utf8")) : {};
  } catch {
    return {};
  }
}
function markHandledReflect(sig, route) {
  try {
    ensureDir();
    const h = loadHandledReflects();
    h[sig] = { ts: Date.now(), route };
    writeFileSync4(REFLECT_HANDLED, JSON.stringify(h, null, 2));
  } catch {}
}
function isHighConfidenceCreate(res, ev) {
  if (res.action !== "create")
    return false;
  const top = res.matches?.[0];
  const cleanRoute = !pickUpdateTarget(res.matches || [], 18);
  const richDraft = !!res.description && res.description.length >= 80 && /##\s+Pitfalls/i.test(res.body || "") && /##\s+Verification/i.test(res.body || "");
  return ev.convs >= 3 && ev.items >= 1 && cleanRoute && richDraft;
}
function graduationProof(skillsDir, name) {
  const nm = slug(name);
  const path = join5(skillsDir, nm, "SKILL.md");
  if (!nm)
    return { ok: false, path, reason: "name required" };
  if (!existsSync4(path))
    return { ok: false, path, reason: "SKILL.md missing after write" };
  try {
    const content = readFileSync4(path, "utf8");
    const fmName = slug((content.match(/^name:\s*(.+)$/im)?.[1] || "").trim());
    if (fmName !== nm)
      return { ok: false, path, reason: `frontmatter name mismatch: expected ${nm}, got ${fmName || "(none)"}` };
    return { ok: true, path, reason: "write visible on active shelf" };
  } catch (e) {
    return { ok: false, path, reason: String(e?.message ?? e) };
  }
}
function graduateStagedSkill(name, ctx) {
  const nm = slug(name);
  if (!nm)
    throw new Error("name required");
  const srcDir = join5(STAGED_DIR, nm);
  const src = join5(srcDir, "SKILL.md");
  if (!existsSync4(src))
    throw new Error(`no staged skill '${nm}'`);
  const retiredBlock = retiredSkillBlocker(nm, ctx);
  if (retiredBlock)
    throw new Error(`retire-sticky blocked graduate: ${retiredBlock}`);
  const content = readFileSync4(src, "utf8");
  const desc = (content.match(/^description:\s*(.+)$/im)?.[1] || "").trim();
  const body = content.replace(/^---[\s\S]*?\n---\s*\n?/, "");
  const lint = lintSkillDraft({ name: nm, description: desc, body });
  if (!lint.ok)
    throw new Error(`linter blocked: ${lint.issues.join("; ")}`);
  const quality = sotaQualityGaps({ name: nm, description: desc, body });
  if (quality.length)
    throw new Error(`quality blocked: ${quality.join("; ")}`);
  const sec = scanSkillContent(body);
  if (!sec.ok)
    throw new Error(`security blocked: ${sec.issues.join("; ")}`);
  const dstRoot = agentSkillsDir(ctx);
  const dst = writeSkill(dstRoot, nm, content.includes(MM_TAG) ? content : content + `
<!-- ${MM_TAG}: graduated ${new Date().toISOString().slice(0, 10)} -->
`);
  const proof = graduationProof(dstRoot, nm);
  if (!proof.ok)
    throw new Error(`graduation proof failed: ${proof.reason}`);
  syncSkillToDesktopCatalog(nm, ctx);
  mkdirSync4(STAGED_RETIRED_DIR, { recursive: true });
  try {
    renameSync3(srcDir, join5(STAGED_RETIRED_DIR, `${nm}-graduated-${Date.now()}`));
  } catch {}
  appendUiEvent({ phase: "skill_graduated", summary: `graduated '${nm}'`, skill: nm, action: "graduate", route: "manual" });
  appendMeshFeed({ type: "skill_graduated", skill: nm, route: "GRADUATE", signals: 0 });
  writeUiState({ phase: "rotation", skill: nm, last: `graduated '${nm}'`, route: "GRADUATE · live" });
  try {
    const _b = readSkill(dstRoot, nm);
    if (_b) {
      const _p = publishPlan({ name: nm, description: skillDesc(dstRoot, nm), body: _b, shelf: "agent" });
      appendUiEvent({ phase: "skill_publish_preflight", summary: `${nm}: ${_p.publishability}/100 · tier=${publishTier(_p)} · ${_p.recommended}`, skill: nm, route: "auto-after-graduate" });
    }
  } catch {}
  return dst;
}
function reviewForkAuthor(ctx) {
  return async (sys, user) => {
    try {
      if (typeof ctx?.conversation?.fork !== "function")
        return "";
      const forked = await hiddenForkFor(ctx, "review-author");
      if (!forked)
        return "";
      const stream = await forked.sendMessageStream([{ role: "user", content: `${sys}

Treat this request independently from prior messages in this hidden bench thread.

${user}` }]);
      const out = await consumeStreamBounded(stream);
      return out.trim();
    } catch {
      return "";
    }
  };
}
async function runReflectiveReview(ctx, config = {}) {
  const dirs = config.dirs ?? scanDirs(ctx);
  const stagedShelf = config.stagedDir ?? STAGED_DIR;
  const reviewDirs = config.mode === "auto" ? dirs : [...dirs, stagedShelf];
  const exp = config.experience ?? loadExperience();
  const ev = buildCrossConversationEvidence(exp);
  const engram = engramConsolidate(exp, managedView(reviewDirs).map((m) => ({ name: m.name, body: m.body })));
  appendUiEvent({ phase: "review_started", summary: `reviewing ${ev.convs} sessions / ${ev.items} durable signals` });
  writeUiState({ phase: "reviewing", detail: `${ev.convs} sessions / ${ev.items} signals` });
  if (ev.items < (config.minItems ?? 2)) {
    appendUiEvent({ phase: "reflect_none", summary: `nothing to save yet (${ev.items} signals)` });
    writeUiState({ phase: "idle", last: "nothing to save yet" });
    return { action: "none", reason: `only ${ev.items} cross-session signals (need ≥${config.minItems ?? 2})` };
  }
  const prefs = retrievePreferences(ev.digest, process.env.MEMORY_DIR);
  const digest = `${engram.digest}

${ev.digest}` + (prefs.length ? `

USER PREFERENCES (from this agent's memory — bake the relevant ones into the skill's guidance):
${prefs.map((p) => `- ${p}`).join(`
`)}` : "");
  const preTgt = pickUpdateTarget(searchSkills(reviewDirs, digest, 3), 18);
  const routeKey = preTgt ? `UPDATE:${preTgt.name}` : "CREATE";
  const sig = reflectSignature(ev);
  if (loadHandledReflects()[sig]) {
    const summary = `already reflected ${routeKey.toLowerCase()} for this evidence signature`;
    appendUiEvent({ phase: "reflect_none", summary });
    writeUiState({ phase: "idle", last: summary, route: "SKIP · handled" });
    return { action: "none", reason: summary };
  }
  writeUiState({ phase: "checking", subject: preTgt?.name || "", route: preTgt ? `UPDATE → ${preTgt.name}` : "CREATE (new skill)" });
  appendUiEvent({ phase: "review_planned", summary: preTgt ? `route UPDATE → ${preTgt.name}` : "route CREATE — no existing skill safely covers this" });
  writeUiState({ phase: "shaping", skill: preTgt?.name || "", route: preTgt ? `UPDATE → ${preTgt.name}` : "CREATE" });
  const author = config.authorFn || reviewForkAuthor(ctx);
  let res;
  try {
    res = await reviewAndAuthor(digest, reviewDirs, author, { semanticFn: config.semanticFn });
  } catch (e) {
    appendUiEvent({ phase: "reflect_error", summary: `author failed: ${String(e?.message ?? e).slice(0, 80)}` });
    writeUiState({ phase: "idle", last: "review interrupted — will retry next session", route: "ERROR · safe" });
    return { action: "none", reason: `author error: ${String(e?.message ?? e).slice(0, 120)}` };
  }
  if ((res.action === "create" || res.action === "update") && res.name && res.content) {
    const live = config.mode === "auto";
    const graduate = live;
    const dir = graduate ? agentSkillsDir(ctx) : stagedShelf;
    const tagged = res.content.includes(MM_TAG) ? res.content : res.content + `
<!-- ${MM_TAG}: reflective ${new Date().toISOString().slice(0, 10)}; action=${res.action}; convs=${ev.convs}; ${graduate ? "graduated=true" : "staged=true"} -->
`;
    try {
      if (res.action === "create" && !res.updateTarget) {
        const retiredBlock = retiredSkillBlocker(res.name, ctx);
        if (retiredBlock) {
          markHandledReflect(sig, `RETIRED:${res.name}`);
          appendUiEvent({ phase: "reflect_none", summary: `retire-sticky blocked '${res.name}'` });
          writeUiState({ phase: "idle", last: `retire-sticky blocked '${res.name}'`, route: "SKIP · retired" });
          return { action: "none", name: res.name, reason: retiredBlock };
        }
        const n1 = multiInstanceSupport(`${res.name} ${res.description ?? ""}`, ev.signals ?? [], config.minInstances ?? 2);
        if (!n1.ok) {
          markHandledReflect(sig, `N1-PARKED:${res.name}`);
          appendUiEvent({ phase: "reflect_none", summary: `n=1 gate parked '${res.name}': ${n1.reason.slice(0, 120)}` });
          writeUiState({ phase: "idle", last: `n=1 gate parked '${res.name}'`, route: "SKIP · n=1" });
          return { action: "none", name: res.name, reason: `n=1 gate: ${n1.reason}` };
        }
      }
      const oldContent = res.action === "update" && res.updateTarget ? (() => {
        const d = reviewDirs.find((x) => existsSync4(join5(x, res.updateTarget, "SKILL.md")));
        return d ? readSkill(d, res.updateTarget) : undefined;
      })() : undefined;
      writeUiState({ phase: "saving", skill: res.name, route: res.action.toUpperCase() });
      writeSkill(dir, res.name, tagged);
      writeUiState({ phase: "testing", skill: res.name, route: res.action.toUpperCase() });
      const proof = graduate ? graduationProof(dir, res.name) : { ok: true, path: join5(dir, res.name, "SKILL.md"), reason: "staged write" };
      if (!proof.ok) {
        appendUiEvent({ phase: "graduation_unverified", summary: `not claiming graduation for '${res.name}': ${proof.reason.slice(0, 100)}`, skill: res.name, action: res.action, route: "truth-guard" });
        writeUiState({ phase: "idle", last: `graduation unverified for '${res.name}'`, route: "SKIP · truth-guard" });
        return { ...res, wrote: join5(dir, res.name), reason: `graduation proof failed: ${proof.reason}` };
      }
      if (graduate)
        syncSkillToDesktopCatalog(res.name, ctx);
      const manifest = buildEvidenceManifest({ action: res.action, skill: res.name, updateTarget: res.updateTarget, convs: ev.convs, signals: ev.items, memfsHits: res.matches || [], preferences: prefs, rejected: ev.rejected, newContent: tagged, oldContent });
      const evDir = join5(dir, res.name, "references", "evidence");
      mkdirSync4(evDir, { recursive: true });
      writeFileSync4(join5(evDir, `${Date.now()}.json`), JSON.stringify(manifest, null, 2));
      ensureDir();
      mkdirSync4(RECEIPTS_DIR, { recursive: true });
      writeFileSync4(join5(RECEIPTS_DIR, `reflect-${Date.now()}.json`), JSON.stringify({ action: res.action, name: res.name, updateTarget: res.updateTarget, convs: ev.convs, items: ev.items, prefsInjected: prefs.length, rejected: ev.rejected.length, degraded: res.degraded || null, dir, ts: Date.now() }, null, 2));
      if (res.degraded)
        appendUiEvent({ phase: "author_degraded", summary: `authored via graceful degradation: ${res.degraded}`, skill: res.name });
      const phase = graduate ? "skill_graduated" : "skill_staged";
      const verb = graduate ? "graduated" : res.action === "update" ? "staged update to" : "staged";
      const summary = `${verb} '${res.name}' (${res.action === "update" ? "update-first" : "new"}, ${ev.convs} sessions/${ev.items} signals)`;
      appendUiEvent({ phase, summary, skill: res.name, action: res.action, route: res.updateTarget ? `update ${res.updateTarget}` : "create" });
      appendMeshFeed({ type: phase, skill: res.name, route: graduate ? "GRADUATE" : res.action.toUpperCase(), signals: ev.items });
      markHandledReflect(sig, routeKey);
      appendUiEvent({ phase: "evidence_manifest_written", summary: "wrote evidence manifest" });
      if (ev.rejected.length)
        appendUiEvent({ phase: "noise_rejected", summary: `rejected ${ev.rejected.length} env-noise items` });
      if (prefs.length)
        appendUiEvent({ phase: "memory_pref_injected", summary: `injected ${prefs.length} user preferences` });
      writeUiState(graduate ? { phase: res.action === "update" ? "updated" : "learned", skill: res.name, last: summary, route: `${graduate ? "GRADUATE" : res.action.toUpperCase()}${res.updateTarget ? " " + res.updateTarget : ""} · live` } : { phase: "idle", last: "", route: `${res.action.toUpperCase()} · staged` });
      return { ...res, wrote: join5(dir, res.name) };
    } catch (e) {
      appendUiEvent({ phase: "reflect_error", summary: `write failed: ${String(e?.message ?? e).slice(0, 80)}` });
      return { ...res, reason: String(e?.message ?? e) };
    }
  }
  if (res.action === "reject") {
    const safe = /\bsecurity:/i.test(res.reason || "");
    markHandledReflect(sig, routeKey);
    try {
      ensureDir();
      mkdirSync4(RECEIPTS_DIR, { recursive: true });
      writeFileSync4(join5(RECEIPTS_DIR, `reflect-rejected-${Date.now()}.json`), JSON.stringify({ action: "reject", safe, reason: res.reason || "(none)", degraded: res.degraded || null, convs: ev.convs, items: ev.items, ts: Date.now() }, null, 2));
    } catch {}
    appendUiEvent({ phase: safe ? "blocked_unsafe" : "reflect_none", summary: safe ? `\uD83D\uDEE1️ blocked unsafe content (safe): ${res.reason}` : `draft rejected; nothing saved (${res.reason})${res.degraded ? " [degraded: " + res.degraded + "]" : ""}` });
    writeUiState({ phase: safe ? "protected" : "idle", last: safe ? "blocked unsafe content (safe)" : `draft rejected; nothing saved`, route: safe ? "BLOCKED · protected" : "SKIP · rejected-draft" });
  } else {
    markHandledReflect(sig, routeKey);
    appendUiEvent({ phase: "reflect_none", summary: "nothing durable to save" });
    writeUiState({ phase: "idle", last: "nothing to save" });
  }
  return res;
}
// mods/ui.ts
function summarizeReflectActions(events, mode = "compact") {
  const primaryPhases = ["skill_created", "skill_updated", "skill_staged", "skill_graduated", "skill_retired"];
  const writes = events.filter((e) => [...primaryPhases, "skill_review", "memory_pref_injected", "noise_rejected"].includes(e.phase));
  if (!writes.length) {
    const last = events[events.length - 1];
    return `\uD83D\uDCBE muscle-memory review: ${last ? last.summary : "nothing to save"}`;
  }
  const main = writes.filter((w) => primaryPhases.includes(w.phase)).map((w) => w.summary);
  const extras = mode === "verbose" ? writes.filter((w) => !primaryPhases.includes(w.phase)).map((w) => w.summary) : [];
  return `\uD83D\uDCBE muscle-memory review: ${[...main, ...extras].join(" · ") || writes[0].summary}`;
}
var safeLabel = (value, fallback, max = 32) => value.replace(/[^A-Za-z0-9 ._-]/g, "").replace(/\s+/g, " ").trim().slice(0, max) || fallback;
var ROUTE_LABELS = {
  matched: "clear match",
  "no-gap": "no gap declared",
  "weak-match": "weak match",
  ambiguous: "tied strongest match",
  "negative-field": "negative field evidence",
  "no-safe-match": "no safe match"
};
var friendlyRouteLabel = (route) => ROUTE_LABELS[route];
function renderAgentBoxScore(summary, options) {
  const stage = summary.scoreStatus === "blocked" ? "LEDGER BLOCKED" : summary.scoreStatus === "incomplete" ? "INCOMPLETE EVIDENCE" : summary.scoreStatus === "claim_eligible" ? "CLAIM-ELIGIBLE EVIDENCE" : "EARLY EVIDENCE";
  const activeSkills = Number.isFinite(Number(options.skills?.active)) ? Math.max(0, Math.floor(Number(options.skills?.active))) : 0;
  const provenSkills = Number.isFinite(Number(options.skills?.proven)) ? Math.min(activeSkills, Math.max(0, Math.floor(Number(options.skills?.proven)))) : 0;
  const neutral = summary.observedNeutralInterventions > 0 ? ` · ${summary.observedNeutralInterventions} neutral` : "";
  const lines = [
    `MUSCLE MEMORY · DECISION REPORT · ${stage}`,
    `INTERVENTIONS · ${summary.observedInterventions} served · ${summary.observedHelpfulInterventions} helped · ${summary.observedHarmfulInterventions} harmed${neutral}`,
    `ABSTENTIONS · ${summary.observedAbstentions} · ${summary.observedSuccessfulAbstentions} succeeded unaided · ${summary.observedFailedAbstentions} failed`,
    `SKILLS · ${activeSkills} active · ${provenSkills} proven`
  ];
  if (summary.lastPlay) {
    const play = summary.lastPlay;
    const decision = play.action === "abstain" ? "abstained" : "intervened";
    const result = play.result ? play.result.replace(/_/g, " ") : "outcome pending";
    lines.push(`LAST · ${decision} · ${friendlyRouteLabel(play.route)} · ${result}`);
  }
  const pending = summary.latestPendingPossession;
  const pendingDetail = pending ? ` · ${pending.taskClass}${pending.skill ? ` → ${pending.skill}` : ""}` : "";
  lines.push(`PENDING · ${summary.pendingDecisions}${pendingDetail}`);
  if (summary.openedDecisions === 0 && summary.scoreStatus !== "blocked")
    lines.push("START · declare a real procedural gap before a meaningful task");
  const invalidRows = Object.values(summary.exclusionReasons).reduce((sum, count) => sum + Number(count || 0), 0);
  if (summary.scoreStatus === "blocked") {
    lines.push(`STATUS · ledger integrity blocked · ${invalidRows} invalid row${invalidRows === 1 ? "" : "s"} · scoring withheld`);
  } else if (summary.scoreStatus === "incomplete") {
    lines.push(`STATUS · incomplete evidence · ${summary.verifiedDecisions} verified · scoring withheld`);
  } else if (summary.scoreStatus === "claim_eligible") {
    lines.push(`STATUS · verified evidence threshold met · ${summary.verifiedDecisions} verified · claim-eligible under ${summary.metricContract}`);
  } else {
    const evidence = summary.verifiedDecisions > 0 && summary.judgedDecisions > 0 ? "early mixed evidence" : summary.verifiedDecisions > 0 ? "early verified evidence" : summary.judgedDecisions > 0 ? "early judged evidence" : "no evaluated evidence";
    const capped = summary.repeatCappedDecisions > 0 ? ` · ${summary.repeatCappedDecisions} repeat-capped` : "";
    const gloss = summary.verifiedDecisions === 0 ? " · integrity gate · normal until instrument verify earns one · judged path is enough" : "";
    lines.push(`STATUS · ${evidence} · ${summary.verifiedDecisions} verified${capped} · not claim-bearing${gloss}`);
  }
  return lines.join(`
`);
}
function renderMuscleMemoryPanel(state) {
  const mode = process.env.MM_REFLECT === "auto" ? "auto" : process.env.MM_REFLECT === "staged" ? "staged" : "off";
  const roster = state?.roster && typeof state.roster === "object" ? state.roster : {};
  const totalSkills = Number.isFinite(Number(roster.total)) ? Math.max(0, Math.floor(Number(roster.total))) : 0;
  const provenSkills = Number.isFinite(Number(roster.proven)) ? Math.min(totalSkills, Math.max(0, Math.floor(Number(roster.proven)))) : 0;
  const helpedCount = Number.isFinite(Number(roster.helped)) ? Math.max(0, Math.floor(Number(roster.helped))) : 0;
  const provenNames = new Set(Array.isArray(roster.provenNames) ? roster.provenNames.map((name) => safeLabel(String(name || ""), "", 80)).filter(Boolean) : []);
  const resting = () => {
    if (mode === "off")
      return [];
    const parts = [
      `\uD83D\uDCBE muscle-memory · ${totalSkills} skill${totalSkills === 1 ? "" : "s"}`,
      `${helpedCount} helped`
    ];
    if (provenSkills > 0)
      parts.push(`${provenSkills} proven`);
    return [parts.join(" · ")];
  };
  if (!state || !state.last && !state.phase)
    return resting();
  const phase = String(state.phase || "idle");
  const route = String(state.route || "").toUpperCase();
  const ageMs = typeof state.ts === "number" ? Math.max(0, Date.now() - state.ts) : 0;
  const skill = safeLabel(String(state.skill || ""), "", 80);
  const alarmSubject = safeLabel(String(state.subject || state.last || "").replace(/^blocked\s*/i, "").replace(/\s*\(safe\)\s*$/i, ""), "unsafe content");
  if (phase === "protected")
    return [`\uD83D\uDCBE muscle-memory · \uD83D\uDEE1️ blocked ${alarmSubject}`];
  const beatTtlMs = 12000;
  const beatPhases = new Set(["earned", "learned", "updated", "rotation", "benched"]);
  if (beatPhases.has(phase)) {
    if (ageMs > beatTtlMs)
      return resting();
    const fallback = phase === "earned" ? safeLabel(String(state.last || ""), "smart restraint") : "skill";
    const label = skill || fallback;
    const rating = state?.field && typeof state.field === "object" && skill ? state.field[skill] : null;
    const helped = rating && Number.isFinite(Number(rating.plus)) ? Math.max(0, Math.floor(Number(rating.plus))) : null;
    const missed = rating && Number.isFinite(Number(rating.minus)) ? Math.max(0, Math.floor(Number(rating.minus))) : null;
    const fieldLine = helped !== null && missed !== null ? ` (helped ${helped} · missed ${missed})` : "";
    switch (phase) {
      case "earned":
        if (!skill || /smart restraint/i.test(label))
          return ["\uD83D\uDCBE muscle-memory · ✓ no skill needed · task completed"];
        if (provenNames.has(skill))
          return [`\uD83D\uDCBE muscle-memory · ★ skill proven · ${skill}${fieldLine}`];
        return [`\uD83D\uDCBE muscle-memory · ✓ skill helped · ${skill}${fieldLine}`];
      case "learned":
        return [`\uD83D\uDCBE muscle-memory · ✓ skill learned · ${label}${fieldLine}`];
      case "updated":
        return [`\uD83D\uDCBE muscle-memory · ✓ skill improved · ${label}${fieldLine}`];
      case "rotation":
        return [`\uD83D\uDCBE muscle-memory · ★ skill promoted · ${label}${fieldLine}`];
      case "benched":
        return [`\uD83D\uDCBE muscle-memory · ↓ skill retired · ${label}${fieldLine}`];
    }
  }
  const progressTtlMs = 120000;
  if (["reviewing", "shaping", "checking", "saving", "testing"].includes(phase)) {
    if (ageMs > progressTtlMs)
      return resting();
    const detail = String(state.detail || "").replace(/[^A-Za-z0-9 /._-]/g, "").replace(/\s+/g, " ").trim().slice(0, 64);
    if (phase === "reviewing")
      return [`\uD83D\uDCBE muscle-memory · learning from recent work${detail ? ` · ${detail}` : "…"}`];
    if (phase === "checking") {
      return [skill ? `\uD83D\uDCBE muscle-memory · checking skill: ${skill}…` : `\uD83D\uDCBE muscle-memory · checking the roster${route.includes("CREATE") ? " for a new skill" : ""}…`];
    }
    if (phase === "testing")
      return [`\uD83D\uDCBE muscle-memory · testing skill: ${skill || "new skill"}…`];
    if (phase === "saving")
      return [`\uD83D\uDCBE muscle-memory · saving ${route.includes("UPDATE") ? "skill update" : "skill"}: ${skill || "new skill"}…`];
    if (skill && route.includes("UPDATE"))
      return [`\uD83D\uDCBE muscle-memory · rewriting skill: ${skill}…`];
    return ["\uD83D\uDCBE muscle-memory · writing a new skill…"];
  }
  return resting();
}

// mods/invocation.ts
import { appendFileSync as appendFileSync2, existsSync as existsSync6, mkdirSync as mkdirSync6, readFileSync as readFileSync6 } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname as dirname3, join as join7 } from "node:path";

// mods/instrument.ts
import { createHash as createHash2, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync as existsSync5, mkdirSync as mkdirSync5, readFileSync as readFileSync5, realpathSync as realpathSync2, statSync, writeFileSync as writeFileSync5 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname2, join as join6, resolve as resolve2, sep as sep2 } from "node:path";
function defaultInstrumentKeyPath(home = homedir2()) {
  return join6(home, ".letta", "instrument", "muscle-memory.key");
}
function resolveInstrumentKeyPath(opts = {}) {
  const env = opts.env ?? process.env;
  const override = String(env.MM_INSTRUMENT_KEY_FILE || "").trim();
  return override ? resolve2(override) : defaultInstrumentKeyPath(opts.home ?? homedir2());
}
function isInsideStateDir(candidate, stateDir) {
  const real = (p) => {
    try {
      return realpathSync2(p);
    } catch {
      return resolve2(p);
    }
  };
  const key = real(candidate);
  const keyDir = real(dirname2(candidate));
  const state = real(stateDir);
  const under = (p) => p === state || p.startsWith(state + sep2);
  return under(key) || under(keyDir);
}
function loadInstrumentKey(opts) {
  const keyPath = opts.keyPath ?? resolveInstrumentKeyPath({ env: opts.env });
  if (isInsideStateDir(keyPath, opts.stateDir))
    return { available: false, reason: "key_inside_state_dir", keyPath };
  if (!existsSync5(keyPath))
    return { available: false, reason: "key_absent", keyPath };
  const mode = statSync(keyPath).mode & 511;
  if (mode !== 384)
    return { available: false, reason: "key_permissions", keyPath, detail: mode.toString(8) };
  const dirMode = statSync(dirname2(keyPath)).mode & 511;
  if (dirMode & 63)
    return { available: false, reason: "key_dir_permissions", keyPath, detail: dirMode.toString(8) };
  const raw = readFileSync5(keyPath, "utf8").trim();
  const [keyId, material] = raw.split(".");
  if (!keyId || !material || !/^[a-z0-9]{8}$/.test(keyId))
    return { available: false, reason: "key_malformed", keyPath };
  return { available: true, keyId, secret: Buffer.from(material, "base64url"), keyPath };
}
function initInstrumentKey(opts) {
  onKeyChanged();
  const keyPath = opts.keyPath ?? resolveInstrumentKeyPath({ env: opts.env });
  if (isInsideStateDir(keyPath, opts.stateDir)) {
    throw new Error("refusing to create the instrument key inside the state directory; it must live outside the directory whose contents it authenticates");
  }
  const existing = loadInstrumentKey({ keyPath, stateDir: opts.stateDir });
  if (existing.available)
    return { created: false, keyId: existing.keyId, keyPath };
  mkdirSync5(dirname2(keyPath), { recursive: true, mode: 448 });
  chmodSync(dirname2(keyPath), 448);
  const material = randomBytes(32);
  const keyId = createHash2("sha256").update(material).digest("hex").slice(0, 8);
  writeFileSync5(keyPath, `${keyId}.${material.toString("base64url")}
`, { mode: 384 });
  chmodSync(keyPath, 384);
  return { created: true, keyId, keyPath };
}
function instrumentStatusLine(loaded) {
  if (loaded.available)
    return null;
  if (loaded.reason === "key_inside_state_dir")
    return "INSTRUMENT KEY REFUSED · key must not live inside the state directory · verified disabled (judged still works)";
  if (loaded.reason === "key_absent")
    return "INSTRUMENT UNAVAILABLE · run /muscle-memory instrument init · verified disabled (judged still works)";
  return `INSTRUMENT KEY REFUSED · ${loaded.reason.replace(/_/g, " ")} · verified disabled (judged still works)`;
}
var noticeShown = false;
var keyChangeListeners = [];
function onInstrumentKeyChange(fn) {
  keyChangeListeners.push(fn);
}
function onKeyChanged() {
  noticeShown = false;
  for (const fn of keyChangeListeners) {
    try {
      fn();
    } catch {}
  }
}
function instrumentSessionNotice(stateDir) {
  if (noticeShown)
    return null;
  const line = instrumentStatusLine(loadInstrumentKey({ stateDir }));
  if (!line)
    return null;
  noticeShown = true;
  return line;
}
var EVIDENCE_FIELDS = [
  "schema_version",
  "key_id",
  "nonce",
  "timestamp",
  "possession_id",
  "decision_event_id",
  "skill",
  "task_id",
  "task_class",
  "manifest_sha256",
  "baseline_sha256",
  "baseline_captured_at",
  "expected_sha256",
  "final_sha256",
  "invocation_receipt_id",
  "verifier_id",
  "verifier_version",
  "target_rel",
  "result_class"
];
function signInstrumentTuple(tuple, key) {
  const bytes = Buffer.from(JSON.stringify(tuple, Object.keys(tuple).sort()), "utf8");
  return `${key.keyId}:${createHmac("sha256", key.secret).update(bytes).digest("hex")}`;
}
function verifyInstrumentTuple(tuple, mac, key) {
  if (typeof mac !== "string")
    return false;
  const expected = Buffer.from(signInstrumentTuple(tuple, key), "utf8");
  const actual = Buffer.from(mac, "utf8");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
function canonicalEvidenceBytes(payload) {
  if (!payload || typeof payload !== "object")
    throw new Error("evidence payload must be an object");
  const raw = payload;
  if (Object.keys(raw).length !== EVIDENCE_FIELDS.length)
    throw new Error("evidence payload field count mismatch");
  const canonical = {};
  for (const field of [...EVIDENCE_FIELDS].sort()) {
    if (!(field in raw))
      throw new Error(`evidence payload missing '${field}'`);
    canonical[field] = raw[field];
  }
  return Buffer.from(JSON.stringify(canonical), "utf8");
}
function signEvidencePayload(payload, key) {
  return createHmac("sha256", key.secret).update(canonicalEvidenceBytes(payload)).digest("hex");
}
function verifyEvidenceSignature(payload, signature, key) {
  let expected;
  try {
    expected = Buffer.from(signEvidencePayload(payload, key), "hex");
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "malformed payload" };
  }
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature))
    return { ok: false, reason: "malformed signature" };
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length)
    return { ok: false, reason: "length mismatch" };
  return timingSafeEqual(actual, expected) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

// mods/invocation.ts
var INVOCATION_LOG_PATH = join7(STATE_DIR, "invocations.jsonl");
var SCHEMA = "mm.invocation.v1";
var SAFE = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
function invocationTuple(e) {
  return {
    schema: e.schema,
    invocation_id: e.invocation_id,
    possession_id: e.possession_id,
    decision_event_id: e.decision_event_id,
    skill: e.skill,
    call_id: e.call_id,
    started_at: e.started_at,
    ended_at: e.ended_at,
    nonce: e.nonce
  };
}
function instrumentKey() {
  const loaded = loadInstrumentKey({ stateDir: STATE_DIR });
  return loaded.available ? { keyId: loaded.keyId, secret: loaded.secret } : null;
}
var unauthenticatedInvocationsSeen = 0;
var pending = new Map;
function appendInvocation(event) {
  const key = instrumentKey();
  const signed = key ? { ...event, mac: signInstrumentTuple(invocationTuple(event), key) } : event;
  mkdirSync6(dirname3(INVOCATION_LOG_PATH), { recursive: true });
  appendFileSync2(INVOCATION_LOG_PATH, `${JSON.stringify(signed)}
`, "utf8");
}
function loadInvocations() {
  if (!existsSync6(INVOCATION_LOG_PATH))
    return [];
  const rows = [];
  for (const line of readFileSync6(INVOCATION_LOG_PATH, "utf8").split(`
`)) {
    const text = line.trim();
    if (!text)
      continue;
    try {
      const raw = JSON.parse(text);
      if (raw?.schema !== SCHEMA)
        continue;
      if (!SAFE.test(String(raw.possession_id ?? "")) || !SAFE.test(String(raw.invocation_id ?? "")))
        continue;
      const key = instrumentKey();
      if (!key || !raw.mac || !verifyInstrumentTuple(invocationTuple(raw), raw.mac, key)) {
        unauthenticatedInvocationsSeen++;
        continue;
      }
      rows.push(raw);
    } catch {}
  }
  return rows;
}
function qualifyingInvocation(opts) {
  const rows = (opts.invocations ?? loadInvocations()).filter((row) => row.possession_id === opts.possessionId && row.decision_event_id === opts.decisionEventId && row.skill === opts.skill && row.started_at >= opts.decisionAt && row.started_at >= opts.baselineAt && row.ended_at >= row.started_at && row.ended_at <= opts.verifiedAt);
  return rows.length === 1 ? rows[0] : null;
}
function observeToolStart(event, now = Date.now()) {
  if (String(event?.toolName ?? "") !== "Skill")
    return;
  const skill = String(event?.args?.skill ?? "");
  const callId = String(event?.toolCallId ?? "");
  if (!skill || !callId || !SAFE.test(callId))
    return;
  pending.set(callId, { skill, startedAt: now });
  if (pending.size > 256) {
    const first = pending.keys().next().value;
    if (first !== undefined)
      pending.delete(first);
  }
}
function observeToolEnd(event, openPossessions, now = Date.now()) {
  const callId = String(event?.toolCallId ?? "");
  const started = callId ? pending.get(callId) : undefined;
  if (!started)
    return null;
  pending.delete(callId);
  const status = String(event?.status ?? "");
  const ok = status ? status === "success" : event?.ok ?? !(event?.isError || event?.error);
  if (!ok)
    return null;
  const matches = openPossessions.filter((row) => row.skill === started.skill);
  if (matches.length !== 1)
    return null;
  const invocation = {
    schema: SCHEMA,
    invocation_id: `inv-${randomUUID()}`,
    possession_id: matches[0].possession_id,
    decision_event_id: matches[0].event_id,
    skill: started.skill,
    call_id: callId,
    started_at: started.startedAt,
    ended_at: now,
    nonce: randomUUID()
  };
  appendInvocation(invocation);
  return invocation;
}

// mods/possessions.ts
import { createHash as createHash4 } from "node:crypto";
import { appendFileSync as appendFileSync3, existsSync as existsSync8, mkdirSync as mkdirSync8, readFileSync as readFileSync8 } from "node:fs";
import { dirname as dirname4, join as join9 } from "node:path";

// mods/verification.ts
import {
  chmodSync as chmodSync2,
  closeSync,
  constants,
  existsSync as existsSync7,
  fstatSync,
  lstatSync as lstatSync3,
  mkdirSync as mkdirSync7,
  openSync,
  readFileSync as readFileSync7,
  realpathSync as realpathSync3,
  statSync as statSync2,
  writeFileSync as writeFileSync6
} from "node:fs";
import { createHash as createHash3, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
import { isAbsolute as isAbsolute2, join as join8, relative as relative2, resolve as resolve3, sep as sep3 } from "node:path";
var EXACT_FILE_ADAPTER_ID = "mm.exact-file-sha256.v1";
var VERIFICATION_TASK_SCHEMA = "mm.verification-task.exact-file.v1";
var VERIFICATION_BINDING_SCHEMA = "mm.verification-binding.v1";
var VERIFICATION_RECEIPT_SCHEMA = "mm.verification-receipt.v1";
var VERIFICATION_TASK_DIR = join8(STATE_DIR, "verification-tasks");
var ADAPTER_VERSION = "1";
var ROOT_ID = "configured";
var SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
var SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
var SHA256 = /^[a-f0-9]{64}$/;
var TASK_KEYS = new Set(["schema", "adapter_id", "adapter_version", "task_id", "task_class", "registered_at", "root_id", "root_identity_sha256", "target_rel", "expected_sha256", "baseline_sha256"]);
var receiptCustody = new WeakSet;
var BINDING_KEYS = new Set(["schema", "adapter_id", "adapter_version", "task_id", "task_class", "manifest_sha256"]);
var RECEIPT_KEYS = new Set(["schema", "adapter_id", "adapter_version", "task_id", "task_class", "possession_id", "decision_event_id", "manifest_sha256", "artifact_sha256", "matched", "procedural_credit", "verified_at"]);
function exactObject(input, keys, label) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error(`${label} must be an object`);
  const raw = input;
  for (const key of Object.keys(raw))
    if (!keys.has(key))
      throw new Error(`${label} has unexpected field '${key}'`);
  for (const key of keys)
    if (!(key in raw))
      throw new Error(`${label} missing field '${key}'`);
  return raw;
}
function normalizeVerificationBinding(input) {
  const raw = exactObject(input, BINDING_KEYS, "verification binding");
  if (raw.schema !== VERIFICATION_BINDING_SCHEMA || raw.adapter_id !== EXACT_FILE_ADAPTER_ID || raw.adapter_version !== ADAPTER_VERSION) {
    throw new Error("verification binding identity mismatch");
  }
  assertSlug("verification task_id", raw.task_id);
  assertSlug("verification task_class", raw.task_class);
  assertSha("verification manifest_sha256", raw.manifest_sha256);
  return { ...raw };
}
function normalizeInstrumentVerificationReceipt(input) {
  const raw = exactObject(input, RECEIPT_KEYS, "verification receipt");
  if (raw.schema !== VERIFICATION_RECEIPT_SCHEMA || raw.adapter_id !== EXACT_FILE_ADAPTER_ID || raw.adapter_version !== ADAPTER_VERSION) {
    throw new Error("verification receipt identity mismatch");
  }
  assertSlug("verification task_id", raw.task_id);
  assertSlug("verification task_class", raw.task_class);
  assertId("verification possession_id", raw.possession_id);
  assertId("verification decision_event_id", raw.decision_event_id);
  assertSha("verification manifest_sha256", raw.manifest_sha256);
  assertSha("verification artifact_sha256", raw.artifact_sha256);
  if (typeof raw.matched !== "boolean")
    throw new Error("verification matched must be boolean");
  if (!Number.isSafeInteger(raw.verified_at) || Number(raw.verified_at) < 0)
    throw new Error("verification verified_at must be a non-negative safe integer");
  return { ...raw };
}
var hashBytes = (bytes) => createHash3("sha256").update(bytes).digest("hex");
var rootIdentitySha256 = (root) => {
  const st = statSync2(root);
  return hashBytes(`${root}\x00${st.dev}\x00${st.ino}`);
};
var taskPath = (taskId) => join8(VERIFICATION_TASK_DIR, `${taskId}.json`);
function assertSlug(label, value) {
  if (typeof value !== "string" || !SAFE_SLUG.test(value))
    throw new Error(`${label} must be a lowercase safe slug`);
}
function assertId(label, value) {
  if (typeof value !== "string" || !SAFE_ID.test(value))
    throw new Error(`${label} must be a bounded safe identifier`);
}
function assertSha(label, value) {
  if (typeof value !== "string" || !SHA256.test(value))
    throw new Error(`${label} must be a canonical lowercase SHA-256`);
}
function assertTargetRel(value) {
  if (typeof value !== "string" || !value || value.length > 240)
    throw new Error("target_rel must be a bounded relative path");
  if (value.includes("\x00") || value.includes("\\") || isAbsolute2(value) || value.startsWith("./") || value.includes("//")) {
    throw new Error("target_rel must be a canonical POSIX-style relative path");
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw new Error("target_rel cannot traverse or contain empty/dot segments");
}
function configuredRoot() {
  const raw = String(process.env.MM_EXACT_FILE_ROOT || "").trim();
  if (!raw || !isAbsolute2(raw))
    throw new Error("MM_EXACT_FILE_ROOT must be configured as an absolute trusted root");
  const root = realpathSync3(raw);
  if (!statSync2(root).isDirectory())
    throw new Error("MM_EXACT_FILE_ROOT must resolve to a directory");
  return root;
}
function resolveTarget(root, targetRel, requireFile) {
  assertTargetRel(targetRel);
  const lexical = resolve3(root, targetRel);
  const lexicalRel = relative2(root, lexical);
  if (!lexicalRel || lexicalRel.startsWith("..") || isAbsolute2(lexicalRel))
    throw new Error("target_rel escapes the trusted root");
  if (!existsSync7(lexical)) {
    if (requireFile)
      throw new Error("verification target does not exist");
    return lexical;
  }
  const lst = lstatSync3(lexical);
  if (lst.isSymbolicLink())
    throw new Error("verification target cannot be a symlink");
  const target = realpathSync3(lexical);
  if (target !== root && !target.startsWith(`${root}${sep3}`))
    throw new Error("verification target resolves outside the trusted root");
  if (!statSync2(target).isFile())
    throw new Error("verification target must be a regular file");
  return target;
}
function parseTaskBytes(bytes, path) {
  let raw;
  try {
    raw = JSON.parse(bytes);
  } catch {
    throw new Error(`verification manifest is malformed: ${path}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("verification manifest must be an object");
  for (const key of Object.keys(raw))
    if (!TASK_KEYS.has(key))
      throw new Error(`verification manifest has unexpected field '${key}'`);
  for (const key of TASK_KEYS)
    if (!(key in raw))
      throw new Error(`verification manifest missing field '${key}'`);
  if (raw.schema !== VERIFICATION_TASK_SCHEMA)
    throw new Error("verification manifest schema mismatch");
  if (raw.adapter_id !== EXACT_FILE_ADAPTER_ID || raw.adapter_version !== ADAPTER_VERSION)
    throw new Error("verification adapter identity mismatch");
  if (raw.root_id !== ROOT_ID)
    throw new Error("verification root identity mismatch");
  assertSha("root_identity_sha256", raw.root_identity_sha256);
  assertSlug("task_id", raw.task_id);
  assertSlug("task_class", raw.task_class);
  if (!Number.isSafeInteger(raw.registered_at) || Number(raw.registered_at) < 0)
    throw new Error("registered_at must be a non-negative safe integer");
  assertTargetRel(raw.target_rel);
  assertSha("expected_sha256", raw.expected_sha256);
  return raw;
}
function loadTask(taskId) {
  assertSlug("task_id", taskId);
  const path = taskPath(taskId);
  if (!existsSync7(path))
    throw new Error(`unknown verification task '${taskId}'`);
  const mode = statSync2(path).mode & 511;
  if ((mode & 146) !== 0)
    throw new Error("verification manifest must remain read-only");
  const bytes = readFileSync7(path, "utf8");
  const task = parseTaskBytes(bytes, path);
  if (task.task_id !== taskId)
    throw new Error("verification manifest task_id mismatch");
  return { task, path, bytes, manifestSha256: hashBytes(bytes) };
}
function createExactFileVerificationTask(input) {
  assertSlug("task_id", input.taskId);
  assertSlug("task_class", input.taskClass);
  assertTargetRel(input.targetRel);
  assertSha("expected_sha256", input.expectedSha256);
  const registeredAt = input.registeredAt ?? Date.now();
  if (!Number.isSafeInteger(registeredAt) || registeredAt < 0)
    throw new Error("registeredAt must be a non-negative safe integer");
  const root = configuredRoot();
  const targetPath = resolveTarget(root, input.targetRel, true);
  let baselineSha = null;
  try {
    baselineSha = hashBytes(readFileSync7(targetPath));
  } catch {
    baselineSha = null;
  }
  const task = {
    schema: VERIFICATION_TASK_SCHEMA,
    adapter_id: EXACT_FILE_ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    task_id: input.taskId,
    task_class: input.taskClass,
    registered_at: registeredAt,
    root_id: ROOT_ID,
    root_identity_sha256: rootIdentitySha256(root),
    target_rel: input.targetRel,
    expected_sha256: input.expectedSha256,
    baseline_sha256: baselineSha
  };
  const bytes = `${JSON.stringify(task)}
`;
  mkdirSync7(VERIFICATION_TASK_DIR, { recursive: true });
  const path = taskPath(input.taskId);
  writeFileSync6(path, bytes, { encoding: "utf8", flag: "wx", mode: 292 });
  chmodSync2(path, 292);
  const reread = readFileSync7(path, "utf8");
  if (reread !== bytes)
    throw new Error("verification manifest write custody mismatch");
  return { path, manifestSha256: hashBytes(reread), task };
}
function bindExactFileVerificationTask(taskId) {
  const { task, manifestSha256 } = loadTask(taskId);
  return {
    schema: VERIFICATION_BINDING_SCHEMA,
    adapter_id: EXACT_FILE_ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    task_id: task.task_id,
    task_class: task.task_class,
    manifest_sha256: manifestSha256
  };
}
function isInstrumentVerificationReceipt(value) {
  return !!value && typeof value === "object" && receiptCustody.has(value);
}
function isStoredVerificationReceiptBound(bindingInput, receiptInput, possessionId, decisionEventId) {
  try {
    const binding = normalizeVerificationBinding(bindingInput);
    const receipt = normalizeInstrumentVerificationReceipt(receiptInput);
    if (receipt.possession_id !== possessionId || receipt.decision_event_id !== decisionEventId)
      return false;
    if (binding.adapter_id !== receipt.adapter_id || binding.adapter_version !== receipt.adapter_version)
      return false;
    if (binding.task_id !== receipt.task_id || binding.task_class !== receipt.task_class)
      return false;
    if (binding.manifest_sha256 !== receipt.manifest_sha256)
      return false;
    const loaded = loadTask(binding.task_id);
    const digestRelation = receipt.artifact_sha256 === loaded.task.expected_sha256;
    return loaded.manifestSha256 === binding.manifest_sha256 && loaded.task.task_id === binding.task_id && loaded.task.task_class === binding.task_class && receipt.matched === digestRelation;
  } catch {
    return false;
  }
}
function verifyExactFilePossession(decision) {
  if (decision.action !== "prescribe")
    throw new Error("exact-file verification supports prescribed-skill possessions only");
  const binding = decision.verification;
  if (!binding)
    throw new Error("possession has no pre-work verification binding");
  if (binding.schema !== VERIFICATION_BINDING_SCHEMA || binding.adapter_id !== EXACT_FILE_ADAPTER_ID || binding.adapter_version !== ADAPTER_VERSION) {
    throw new Error("possession verification binding is not the exact-file adapter");
  }
  const { task, manifestSha256 } = loadTask(binding.task_id);
  {
    const bound = loadPossessionEvents().filter((row) => row.type === "decision" && row.verification?.task_id === binding.task_id);
    if (bound.some((row) => row.possession_id !== decision.possession_id)) {
      throw new Error("verification task_id is already bound to a different possession");
    }
  }
  if (manifestSha256 !== binding.manifest_sha256)
    throw new Error("verification manifest hash mismatch after decision binding");
  if (task.task_class !== binding.task_class || decision.task_class !== task.task_class)
    throw new Error("verification task_class mismatch");
  if (task.task_id !== binding.task_id)
    throw new Error("verification task_id mismatch");
  if (task.registered_at > decision.ts)
    throw new Error("verification task must be registered before the decision");
  const root = configuredRoot();
  if (rootIdentitySha256(root) !== task.root_identity_sha256)
    throw new Error("configured verification root changed after task registration");
  const target = resolveTarget(root, task.target_rel, true);
  if (typeof constants.O_NOFOLLOW !== "number" || constants.O_NOFOLLOW === 0) {
    throw new Error("exact-file verification is unsupported on this platform: O_NOFOLLOW unavailable");
  }
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const before = fstatSync(fd);
    if (!before.isFile())
      throw new Error("verification target must remain a regular file");
    const openedReal = realpathSync3(target);
    if (openedReal !== root && !openedReal.startsWith(`${root}${sep3}`))
      throw new Error("verification target escaped the trusted root while opening");
    const openedPathStat = statSync2(openedReal);
    if (openedPathStat.dev !== before.dev || openedPathStat.ino !== before.ino)
      throw new Error("verification target changed before hashing");
    bytes = readFileSync7(fd);
    const after = fstatSync(fd);
    const afterReal = realpathSync3(target);
    const afterPathStat = statSync2(afterReal);
    if (afterReal !== openedReal || afterPathStat.dev !== after.dev || afterPathStat.ino !== after.ino || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error("verification target changed while hashing");
    }
  } finally {
    closeSync(fd);
  }
  const artifactSha256 = hashBytes(bytes);
  const matched = timingSafeEqual2(Buffer.from(artifactSha256, "hex"), Buffer.from(task.expected_sha256, "hex"));
  const preExisting = task.baseline_sha256 !== null && task.baseline_sha256 === task.expected_sha256;
  const verifiedAt = Date.now();
  const invocation = decision.skill ? qualifyingInvocation({
    possessionId: decision.possession_id,
    decisionEventId: decision.event_id,
    skill: decision.skill,
    baselineAt: task.registered_at,
    decisionAt: decision.ts,
    verifiedAt
  }) : null;
  const proceduralCredit = matched && !preExisting && invocation !== null;
  const verification = {
    schema: VERIFICATION_RECEIPT_SCHEMA,
    adapter_id: EXACT_FILE_ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    task_id: task.task_id,
    task_class: task.task_class,
    possession_id: decision.possession_id,
    decision_event_id: decision.event_id,
    manifest_sha256: manifestSha256,
    artifact_sha256: artifactSha256,
    matched,
    procedural_credit: proceduralCredit,
    verified_at: verifiedAt
  };
  receiptCustody.add(verification);
  const result = !matched ? "harmed" : proceduralCredit ? "helped" : "neutral";
  const reason = !matched ? "exact-file SHA-256 did not match the bound manifest" : proceduralCredit ? "exact-file SHA-256 was wrong at registration and matches the bound manifest now" : preExisting ? "exact-file SHA-256 matched the bound manifest, but the target already matched before the prescription — artifact verified, no procedural credit" : "exact-file SHA-256 matches now, but no invocation of the prescribed skill was observed — artifact verified, no procedural credit";
  return {
    result,
    evidence_tier: "verified",
    reason,
    evidence_ref: `adapter:${EXACT_FILE_ADAPTER_ID}:${manifestSha256}`,
    verification,
    artifact_verified: matched,
    procedural_credit: proceduralCredit,
    evidence_context: {
      baselineSha256: task.baseline_sha256 ?? "",
      baselineCapturedAt: task.registered_at,
      invocationReceiptId: invocation?.invocation_id ?? "",
      skill: decision.skill ?? ""
    }
  };
}

// mods/possessions.ts
var POSSESSION_LEDGER_PATH = join9(STATE_DIR, "possessions.jsonl");
var keyCache;
function currentInstrumentKey() {
  if (keyCache)
    return keyCache;
  const loaded = loadInstrumentKey({ stateDir: STATE_DIR });
  keyCache = loaded.available ? { keyId: loaded.keyId, secret: loaded.secret } : null;
  return keyCache;
}
onInstrumentKeyChange(() => {
  keyCache = undefined;
});
var POSSESSION_SCHEMA = "mm.possession.v1";
function authenticateStoredEvidence(input) {
  const deny = (reason) => ({ authenticated: false, reason, artifactVerified: false, proceduralCredit: false, resultClass: "neutral" });
  const payload = input.evidence?.payload;
  if (!input.evidence || !payload)
    return deny("legacy_unsigned");
  if (!input.key)
    return deny("key_unavailable");
  if (payload.key_id !== input.key.keyId)
    return deny("unknown_key");
  if (input.evidence.signature === undefined)
    return deny("missing_signature");
  if (!verifyEvidenceSignature(payload, input.evidence.signature, input.key).ok)
    return deny("bad_signature");
  const artifactVerified = payload.final_sha256 === payload.expected_sha256;
  const hadGap = payload.baseline_sha256 !== payload.expected_sha256;
  const invoked = !!String(payload.invocation_receipt_id || "").trim();
  const invocationAfterBaseline = input.invocationObservedAt === undefined || input.invocationObservedAt >= Number(payload.baseline_captured_at);
  let proceduralReason;
  if (!hadGap)
    proceduralReason = "no_gap_to_close";
  else if (!invoked)
    proceduralReason = "no_observed_invocation";
  else if (!invocationAfterBaseline)
    proceduralReason = "invocation_precedes_baseline";
  else if (!artifactVerified)
    proceduralReason = "artifact_mismatch";
  const proceduralCredit = proceduralReason === undefined;
  const resultClass = artifactVerified ? proceduralCredit ? String(payload.result_class) : "neutral" : invoked ? "harmed" : "neutral";
  return { authenticated: true, artifactVerified, proceduralCredit, proceduralReason, resultClass };
}
var EFFICIENCY_CONTRACT = Object.freeze({
  id: "mm.efficiency.v2",
  numerator: "same_tier_helped_prescriptions + same_tier_successful_abstentions",
  denominator: "same_tier_scored_evaluated_decisions",
  neutralPolicy: "neutral_prescriptions_remain_in_denominator",
  harmPolicy: "harmful_prescriptions_remain_in_denominator_and_report_separately",
  verifiedPolicy: "agent_callers_cannot_self_award_verified; exact-file adapter binds pre-work manifest + instrument receipt",
  earnedMinute: "same_tier_helped_prescription | same_tier_successful_abstention; useful routing decision, not literal skill invocation",
  repeatCapPerTaskClass: 3,
  minimumUniqueTaskClasses: 3,
  minimumClosureRatePct: 80,
  percentageDisplayThreshold: 10
});
var DECISION_ACTIONS = new Set(["prescribe", "abstain"]);
var DECISION_ROUTES = new Set(["matched", "no-gap", "weak-match", "ambiguous", "negative-field", "no-safe-match"]);
var DIFFICULTIES = new Set(["routine", "standard", "hard", "unknown"]);
var OUTCOMES = new Set(["helped", "harmed", "neutral", "succeeded_unaided", "failed_unaided"]);
var EVIDENCE_TIERS = new Set(["verified", "human_judged", "agent_judged"]);
var LIFECYCLE_ACTIONS = new Set(["learn", "update", "graduate", "retire", "restore"]);
var SAFE_ID2 = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
var SAFE_SLUG2 = /^[a-z0-9][a-z0-9-]{0,79}$/;
var emptyExclusions = () => ({
  malformed_json: 0,
  invalid_schema: 0,
  unknown_enum: 0,
  duplicate_event_id: 0,
  duplicate_decision: 0,
  orphan_outcome: 0,
  duplicate_outcome: 0,
  invalid_supersession: 0,
  incompatible_outcome: 0
});
function assertSafeId(label, value) {
  if (typeof value !== "string" || !SAFE_ID2.test(value))
    throw new Error(`${label} must be a bounded safe identifier`);
}
function assertSafeSlug(label, value) {
  if (typeof value !== "string" || !SAFE_SLUG2.test(value))
    throw new Error(`${label} must be a lowercase slug, not raw task text`);
}
function compatible(action, result) {
  return action === "prescribe" ? result === "helped" || result === "harmed" || result === "neutral" : result === "succeeded_unaided" || result === "failed_unaided";
}
function normalizeEvent(input, mode) {
  if (!input || typeof input !== "object")
    throw new Error("event must be an object");
  const event = input;
  if (event.schema !== POSSESSION_SCHEMA)
    throw new Error(`schema must be ${POSSESSION_SCHEMA}`);
  assertSafeId("event_id", event.event_id);
  assertSafeId("possession_id", event.possession_id);
  if (!Number.isFinite(event.ts) || event.ts < 0)
    throw new Error("ts must be a non-negative number");
  if (event.type === "decision") {
    if (!DECISION_ACTIONS.has(event.action))
      throw new Error("action must be prescribe|abstain");
    if (!DECISION_ROUTES.has(event.route))
      throw new Error("route is not a known decision route");
    const difficulty = event.difficulty ?? "unknown";
    if (!DIFFICULTIES.has(difficulty))
      throw new Error("difficulty must be routine|standard|hard|unknown");
    assertSafeSlug("task_class", event.task_class);
    if (event.skill !== undefined)
      assertSafeSlug("skill", event.skill);
    if (event.action === "prescribe" && !event.skill)
      throw new Error("prescribe decisions require a skill");
    if (event.action === "abstain" && event.skill)
      throw new Error("abstain decisions cannot inject a skill");
    const verification = event.verification === undefined ? undefined : normalizeVerificationBinding(event.verification);
    if (verification && event.action !== "prescribe")
      throw new Error("verification binding supports prescribed-skill possessions only");
    if (verification && verification.task_class !== event.task_class)
      throw new Error("verification binding task_class must match the decision");
    return {
      schema: POSSESSION_SCHEMA,
      event_id: event.event_id,
      possession_id: event.possession_id,
      ts: event.ts,
      type: "decision",
      agent: redactFragment(String(event.agent || "agent"), 1, 80),
      model: redactFragment(String(event.model || "unknown"), 1, 120),
      action: event.action,
      task_class: event.task_class,
      difficulty,
      eligible: true,
      gap_observed: event.gap_observed === true,
      route: event.route,
      ...event.skill ? { skill: event.skill } : {},
      ...verification ? { verification } : {}
    };
  }
  if (event.type === "outcome") {
    if (!OUTCOMES.has(event.result))
      throw new Error("result is not a known outcome");
    if (!EVIDENCE_TIERS.has(event.evidence_tier))
      throw new Error("evidence_tier is not known");
    if (mode === "caller" && event.evidence_tier === "verified") {
      throw new Error("instrument-derived verification is required; callers must use human_judged or agent_judged");
    }
    if (event.evidence_tier !== "verified" && event.verification !== undefined) {
      throw new Error("judged outcomes cannot carry a verification receipt");
    }
    let verification;
    if (event.evidence_tier === "verified" && event.verification !== undefined) {
      verification = normalizeInstrumentVerificationReceipt(event.verification);
    }
    if (mode === "instrument") {
      if (event.evidence_tier !== "verified" || !verification || !isInstrumentVerificationReceipt(event.verification)) {
        throw new Error("instrument-owned receipt is required for verified append");
      }
    }
    if (!String(event.reason || "").trim())
      throw new Error("outcomes require a reason");
    if (event.supersedes_event_id)
      assertSafeId("supersedes_event_id", event.supersedes_event_id);
    return {
      schema: POSSESSION_SCHEMA,
      event_id: event.event_id,
      possession_id: event.possession_id,
      ts: event.ts,
      type: "outcome",
      result: event.result,
      evidence_tier: event.evidence_tier,
      reason: redactFragment(String(event.reason), 4, 320),
      ...event.evidence_ref ? { evidence_ref: redactFragment(String(event.evidence_ref), 2, 180) } : {},
      ...event.supersedes_event_id ? { supersedes_event_id: event.supersedes_event_id } : {},
      ...event.evidence ? { evidence: event.evidence } : {},
      ...verification ? { verification } : {}
    };
  }
  if (event.type === "lifecycle") {
    if (!LIFECYCLE_ACTIONS.has(event.action))
      throw new Error("lifecycle action is not known");
    assertSafeSlug("skill", event.skill);
    if (!String(event.reason || "").trim())
      throw new Error("lifecycle events require a reason");
    return {
      schema: POSSESSION_SCHEMA,
      event_id: event.event_id,
      possession_id: event.possession_id,
      ts: event.ts,
      type: "lifecycle",
      action: event.action,
      skill: event.skill,
      reason: redactFragment(String(event.reason), 4, 320)
    };
  }
  throw new Error("type is not a known possession event");
}
function classifyNormalizationError(error, raw) {
  const message = String(error?.message || error);
  if (message.includes("schema"))
    return "invalid_schema";
  if (message.includes("action") || message.includes("route") || message.includes("difficulty") || message.includes("result") || message.includes("evidence_tier") || message.includes("type"))
    return "unknown_enum";
  return raw?.type === "decision" ? "unknown_enum" : "invalid_schema";
}
function inspectPossessionLedger() {
  const rawText = existsSync8(POSSESSION_LEDGER_PATH) ? readFileSync8(POSSESSION_LEDGER_PATH, "utf8") : "";
  const lines = rawText.split(`
`).filter((line) => line.trim());
  const exclusions = emptyExclusions();
  const excludedPossessions = new Set;
  const excludedDecisionPossessions = new Set;
  const seenEventIds = new Set;
  const events = [];
  const decisions = new Map;
  const activeOutcomes = new Map;
  let malformedRows = 0;
  let unknownEnumRows = 0;
  for (const line of lines) {
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      malformedRows++;
      exclusions.malformed_json++;
      continue;
    }
    let event;
    try {
      event = normalizeEvent(raw, "read");
    } catch (error) {
      const reason = classifyNormalizationError(error, raw);
      exclusions[reason]++;
      if (reason === "unknown_enum")
        unknownEnumRows++;
      if (typeof raw?.possession_id === "string") {
        excludedPossessions.add(raw.possession_id);
        if (raw?.type === "decision")
          excludedDecisionPossessions.add(raw.possession_id);
      }
      continue;
    }
    if (seenEventIds.has(event.event_id)) {
      exclusions.duplicate_event_id++;
      excludedPossessions.add(event.possession_id);
      if (event.type === "decision" || decisions.has(event.possession_id))
        excludedDecisionPossessions.add(event.possession_id);
      continue;
    }
    seenEventIds.add(event.event_id);
    if (event.type === "decision") {
      if (decisions.has(event.possession_id)) {
        exclusions.duplicate_decision++;
        excludedPossessions.add(event.possession_id);
        excludedDecisionPossessions.add(event.possession_id);
        continue;
      }
      decisions.set(event.possession_id, event);
      events.push(event);
      continue;
    }
    if (event.type === "outcome") {
      const decision = decisions.get(event.possession_id);
      if (!decision) {
        exclusions.orphan_outcome++;
        excludedPossessions.add(event.possession_id);
        continue;
      }
      if (!compatible(decision.action, event.result)) {
        exclusions.incompatible_outcome++;
        excludedPossessions.add(event.possession_id);
        excludedDecisionPossessions.add(event.possession_id);
        continue;
      }
      const active = activeOutcomes.get(event.possession_id);
      if (active) {
        if (!event.supersedes_event_id) {
          exclusions.duplicate_outcome++;
          excludedPossessions.add(event.possession_id);
          excludedDecisionPossessions.add(event.possession_id);
          continue;
        }
        if (event.supersedes_event_id !== active.event_id) {
          exclusions.invalid_supersession++;
          excludedPossessions.add(event.possession_id);
          excludedDecisionPossessions.add(event.possession_id);
          continue;
        }
      } else if (event.supersedes_event_id) {
        exclusions.invalid_supersession++;
        excludedPossessions.add(event.possession_id);
        excludedDecisionPossessions.add(event.possession_id);
        continue;
      }
      activeOutcomes.set(event.possession_id, event);
      events.push(event);
      continue;
    }
    events.push(event);
  }
  const excludedRows = Object.values(exclusions).reduce((sum, count) => sum + count, 0);
  const blocked = excludedRows > 0;
  return {
    events,
    integrity: {
      blocked,
      ledgerSha256: createHash4("sha256").update(rawText).digest("hex"),
      rowCount: lines.length,
      validRows: events.length,
      malformedRows,
      unknownEnumRows,
      excludedRows,
      excludedPossessionIds: [...excludedPossessions].sort(),
      excludedDecisionPossessionIds: [...excludedDecisionPossessions].sort(),
      orphanOutcomes: exclusions.orphan_outcome,
      exclusionReasons: exclusions
    }
  };
}
function appendPossessionEvent(input, mode) {
  const clean = normalizeEvent(input, mode);
  const inspection = inspectPossessionLedger();
  if (inspection.integrity.blocked)
    throw new Error("ledger integrity is BLOCKED; repair custody before appending");
  if (inspection.events.some((row) => row.event_id === clean.event_id))
    throw new Error(`duplicate event_id '${clean.event_id}'`);
  const decisions = inspection.events.filter((row) => row.type === "decision");
  const outcomes = inspection.events.filter((row) => row.type === "outcome");
  if (clean.type === "decision" && decisions.some((row) => row.possession_id === clean.possession_id)) {
    throw new Error(`decision already exists for possession '${clean.possession_id}'`);
  }
  if (clean.type === "outcome") {
    const decision = decisions.find((row) => row.possession_id === clean.possession_id);
    if (!decision)
      throw new Error(`cannot record orphan outcome for '${clean.possession_id}'`);
    if (!compatible(decision.action, clean.result))
      throw new Error(`result '${clean.result}' is incompatible with decision '${decision.action}'`);
    if (clean.evidence_tier === "verified") {
      if (!decision.verification || !clean.verification || !isStoredVerificationReceiptBound(decision.verification, clean.verification, decision.possession_id, decision.event_id)) {
        throw new Error("verified outcome is not bound to the possession decision and stored manifest");
      }
      const expectedResult = !clean.verification.matched ? "harmed" : clean.verification.procedural_credit ? "helped" : "neutral";
      if (clean.result !== expectedResult) {
        throw new Error("verified outcome result does not match the instrument receipt");
      }
    }
    const active = outcomes.filter((row) => row.possession_id === clean.possession_id).at(-1);
    if (active && !clean.supersedes_event_id)
      throw new Error(`active outcome already exists for '${clean.possession_id}'`);
    if (active && clean.supersedes_event_id !== active.event_id)
      throw new Error("supersedes_event_id must bind the active outcome");
    if (!active && clean.supersedes_event_id)
      throw new Error("cannot supersede a missing outcome");
  }
  mkdirSync8(dirname4(POSSESSION_LEDGER_PATH), { recursive: true });
  appendFileSync3(POSSESSION_LEDGER_PATH, `${JSON.stringify(clean)}
`, "utf8");
  return clean;
}
function recordPossessionEvent(input) {
  return appendPossessionEvent(input, "caller");
}
function recordInstrumentVerifiedOutcome(input, context) {
  const key = currentInstrumentKey();
  const receipt = input.verification;
  if (receipt && typeof receipt === "object" && receipt.procedural_credit === true) {
    const namedId = String(context?.invocationReceiptId ?? "").trim();
    if (!namedId)
      throw new Error("procedural credit requires an observed invocation receipt id at the signing boundary");
    const owned = loadInvocations().some((row) => row.invocation_id === namedId && row.possession_id === input.possession_id);
    if (!owned)
      throw new Error("procedural credit names an invocation that is not an authenticated observation of this possession");
  }
  if (key && receipt && typeof receipt === "object") {
    const r = receipt;
    const payload = {
      schema_version: "mm.evidence.v1",
      key_id: key.keyId,
      nonce: `${input.possession_id}:${input.event_id}`,
      timestamp: input.ts,
      possession_id: input.possession_id,
      decision_event_id: String(r.decision_event_id ?? ""),
      skill: String(context?.skill ?? ""),
      task_id: String(r.task_id ?? ""),
      task_class: String(r.task_class ?? ""),
      manifest_sha256: String(r.manifest_sha256 ?? ""),
      baseline_sha256: String(context?.baselineSha256 ?? ""),
      baseline_captured_at: Number(context?.baselineCapturedAt ?? 0),
      expected_sha256: String(r.artifact_sha256 ?? ""),
      final_sha256: r.matched ? String(r.artifact_sha256 ?? "") : "",
      invocation_receipt_id: String(context?.invocationReceiptId ?? ""),
      verifier_id: String(r.adapter_id ?? ""),
      verifier_version: String(r.adapter_version ?? ""),
      target_rel: String(r.target_rel ?? ""),
      result_class: input.result
    };
    const signed = { ...input, evidence: { payload, signature: signEvidencePayload(payload, key) } };
    return appendPossessionEvent(signed, "instrument");
  }
  return appendPossessionEvent(input, "instrument");
}
function loadPossessionEvents() {
  return inspectPossessionLedger().events;
}
var pct = (good, total) => total ? Math.round(100 * good / total) : null;
var cleanIntegrity = () => ({
  blocked: false,
  ledgerSha256: createHash4("sha256").update("").digest("hex"),
  rowCount: 0,
  validRows: 0,
  malformedRows: 0,
  unknownEnumRows: 0,
  excludedRows: 0,
  excludedPossessionIds: [],
  excludedDecisionPossessionIds: [],
  orphanOutcomes: 0,
  exclusionReasons: emptyExclusions()
});
var safePossessionView = (decision, outcome) => ({
  possessionId: decision.possession_id,
  taskClass: decision.task_class,
  difficulty: decision.difficulty ?? "unknown",
  action: decision.action,
  route: decision.route,
  ...decision.skill ? { skill: decision.skill } : {},
  openedAt: decision.ts,
  ...outcome ? {
    result: outcome.result,
    evidence: claimBearingVerdict(decision, outcome).verified ? "bound_verified" : "judged"
  } : { evidence: "none" }
});
function pendingPossessionViews(events) {
  const outcomes = new Set(events.filter((event) => event.type === "outcome").map((event) => event.possession_id));
  return events.filter((event) => event.type === "decision" && !outcomes.has(event.possession_id)).sort((a, b) => b.ts - a.ts).map((decision) => safePossessionView(decision));
}
function claimBearingVerdict(decision, outcome) {
  if (outcome.evidence_tier !== "verified")
    return { verified: false, proceduralCredit: false };
  const key = currentInstrumentKey();
  const verdict = authenticateStoredEvidence({ evidence: outcome.evidence, key });
  if (!verdict.authenticated)
    return { verified: false, proceduralCredit: false, downgrade: verdict.reason };
  const structurallyBound = !!decision.verification && !!outcome.verification && isStoredVerificationReceiptBound(decision.verification, outcome.verification, decision.possession_id, decision.event_id);
  if (!structurallyBound)
    return { verified: false, proceduralCredit: false, downgrade: "bad_signature" };
  const payload = outcome.evidence?.payload ?? {};
  const receipt = outcome.verification;
  if (receipt.procedural_credit !== undefined && typeof receipt.procedural_credit !== "boolean") {
    return { verified: false, proceduralCredit: false, downgrade: "evidence_transplanted" };
  }
  const sameRow = String(payload.possession_id ?? "") === decision.possession_id && String(payload.decision_event_id ?? "") === decision.event_id;
  const sameInstrumentEvent = String(payload.task_id ?? "") === String(receipt.task_id ?? "") && String(payload.manifest_sha256 ?? "") === String(receipt.manifest_sha256 ?? "") && String(payload.expected_sha256 ?? "") === String(receipt.artifact_sha256 ?? "");
  if (!sameRow || !sameInstrumentEvent) {
    return { verified: false, proceduralCredit: false, downgrade: "evidence_transplanted" };
  }
  const attributedSkill = String(payload.skill ?? "");
  const attributedResult = String(payload.result_class ?? "");
  const skillDisagrees = !!decision.skill && attributedSkill !== decision.skill;
  const resultDisagrees = !!outcome.result && !!attributedResult && attributedResult !== outcome.result;
  if (skillDisagrees || resultDisagrees) {
    return { verified: false, proceduralCredit: false, downgrade: "attribution_mismatch" };
  }
  const namedInvocation = String(payload.invocation_receipt_id ?? "").trim();
  if (namedInvocation) {
    const owned = loadInvocations().some((row) => row.invocation_id === namedInvocation && row.possession_id === decision.possession_id);
    if (!owned)
      return { verified: false, proceduralCredit: false, downgrade: "evidence_transplanted" };
  }
  return { verified: true, proceduralCredit: verdict.proceduralCredit, proceduralReason: verdict.proceduralReason, attributedSkill };
}
function summarizePossessions(events, integrity = cleanIntegrity()) {
  const decisions = events.filter((event) => event.type === "decision");
  const activeOutcomes = new Map;
  for (const event of events)
    if (event.type === "outcome")
      activeOutcomes.set(event.possession_id, event);
  const excludedIds = new Set(integrity.excludedDecisionPossessionIds);
  const repeatCounts = new Map;
  const difficultyStrata = { routine: 0, standard: 0, hard: 0, unknown: 0 };
  let evaluatedDecisions = 0;
  let scoredDecisions = 0;
  let repeatCappedDecisions = 0;
  let observedInterventions = 0;
  let observedHelpfulInterventions = 0;
  let observedHarmfulInterventions = 0;
  let observedNeutralInterventions = 0;
  let observedAbstentions = 0;
  let observedSuccessfulAbstentions = 0;
  let observedFailedAbstentions = 0;
  let helpfulInterventions = 0;
  let harmfulInterventions = 0;
  let neutralInterventions = 0;
  let successfulAbstentions = 0;
  let failedAbstentions = 0;
  let verifiedSuccessfulAbstentions = 0;
  let verifiedEvaluatedAbstentions = 0;
  let judgedSuccessfulAbstentions = 0;
  let judgedEvaluatedAbstentions = 0;
  let judgedOnlyAbstentions = 0;
  let interferenceAbstentions = 0;
  let verifiedDecisions = 0;
  let judgedDecisions = 0;
  let verifiedGood = 0;
  let judgedGood = 0;
  let unboundVerifiedDowngraded = 0;
  let transplantDemoted = 0;
  let attributionMismatch = 0;
  let verifiedNeutralDecisions = 0;
  let prescribedEvaluated = 0;
  for (const decision of decisions) {
    const difficulty = decision.difficulty ?? "unknown";
    difficultyStrata[difficulty]++;
    if (excludedIds.has(decision.possession_id))
      continue;
    const outcome = activeOutcomes.get(decision.possession_id);
    if (!outcome || !compatible(decision.action, outcome.result))
      continue;
    evaluatedDecisions++;
    if (decision.action === "prescribe") {
      observedInterventions++;
      if (outcome.result === "helped")
        observedHelpfulInterventions++;
      if (outcome.result === "harmed")
        observedHarmfulInterventions++;
      if (outcome.result === "neutral")
        observedNeutralInterventions++;
    } else {
      observedAbstentions++;
      if (outcome.result === "succeeded_unaided")
        observedSuccessfulAbstentions++;
      if (outcome.result === "failed_unaided")
        observedFailedAbstentions++;
    }
    const seen = repeatCounts.get(decision.task_class) || 0;
    const scoreEligible = seen < EFFICIENCY_CONTRACT.repeatCapPerTaskClass;
    repeatCounts.set(decision.task_class, seen + 1);
    if (!scoreEligible) {
      repeatCappedDecisions++;
      continue;
    }
    scoredDecisions++;
    const verdict = claimBearingVerdict(decision, outcome);
    const boundVerified = verdict.verified;
    if (outcome.evidence_tier === "verified" && !boundVerified)
      unboundVerifiedDowngraded++;
    if (verdict.downgrade === "evidence_transplanted")
      transplantDemoted++;
    if (verdict.downgrade === "attribution_mismatch")
      attributionMismatch++;
    let good = false;
    if (decision.action === "prescribe") {
      prescribedEvaluated++;
      const creditable = !boundVerified || verdict.proceduralCredit;
      if (outcome.result === "helped" && creditable) {
        helpfulInterventions++;
        good = true;
      } else if (outcome.result === "helped") {
        neutralInterventions++;
        if (boundVerified)
          verifiedNeutralDecisions++;
      }
      if (outcome.result === "harmed")
        harmfulInterventions++;
      if (outcome.result === "neutral") {
        neutralInterventions++;
        if (boundVerified)
          verifiedNeutralDecisions++;
      }
    } else {
      if (outcome.result === "succeeded_unaided") {
        successfulAbstentions++;
        good = true;
      } else {
        failedAbstentions++;
      }
      if (boundVerified) {
        verifiedEvaluatedAbstentions++;
        if (good)
          verifiedSuccessfulAbstentions++;
      } else {
        judgedEvaluatedAbstentions++;
        judgedOnlyAbstentions++;
        if (good)
          judgedSuccessfulAbstentions++;
      }
    }
    if (boundVerified) {
      verifiedDecisions++;
      if (good)
        verifiedGood++;
    } else {
      judgedDecisions++;
      if (good)
        judgedGood++;
    }
  }
  const lifecycle = events.filter((event) => event.type === "lifecycle");
  const excludedDecisions = excludedIds.size;
  const validDecisionIds = new Set(decisions.map((decision) => decision.possession_id));
  const excludedDecisionRowsWithoutValidDecision = [...excludedIds].filter((id) => !validDecisionIds.has(id)).length;
  difficultyStrata.unknown += excludedDecisionRowsWithoutValidDecision;
  const openedDecisions = decisions.length + excludedDecisionRowsWithoutValidDecision;
  const closedDecisions = evaluatedDecisions + excludedDecisions;
  const pendingDecisions = Math.max(0, openedDecisions - closedDecisions);
  const closureRatePct = pct(closedDecisions, openedDecisions);
  const uniqueTaskClasses = new Set(decisions.map((decision) => decision.task_class)).size;
  const pendingRows = decisions.filter((decision) => !excludedIds.has(decision.possession_id) && !activeOutcomes.has(decision.possession_id)).sort((a, b) => b.ts - a.ts);
  const activityTs = (decision) => Math.max(decision.ts, activeOutcomes.get(decision.possession_id)?.ts ?? decision.ts);
  const latestActivityDecision = [...decisions].sort((a, b) => activityTs(b) - activityTs(a))[0];
  const latestPendingPossession = pendingRows[0] ? safePossessionView(pendingRows[0]) : null;
  const lastPlay = latestActivityDecision ? safePossessionView(latestActivityDecision, activeOutcomes.get(latestActivityDecision.possession_id)) : null;
  const goodDecisions = verifiedGood + judgedGood;
  const contextsAvoided = verifiedSuccessfulAbstentions;
  const blocked = integrity.blocked;
  const incomplete = openedDecisions >= EFFICIENCY_CONTRACT.percentageDisplayThreshold && (closureRatePct ?? 0) < EFFICIENCY_CONTRACT.minimumClosureRatePct;
  const exploratory = repeatCappedDecisions > 0 || uniqueTaskClasses < EFFICIENCY_CONTRACT.minimumUniqueTaskClasses || difficultyStrata.unknown > 0;
  const scoreStatus = blocked ? "blocked" : incomplete ? "incomplete" : verifiedDecisions < EFFICIENCY_CONTRACT.percentageDisplayThreshold ? exploratory ? "exploratory" : "early_tape" : exploratory ? "exploratory" : "claim_eligible";
  return {
    metricContract: EFFICIENCY_CONTRACT.id,
    percentageDisplayThreshold: EFFICIENCY_CONTRACT.percentageDisplayThreshold,
    scoreStatus,
    ledgerIntegrity: blocked ? "blocked" : "ok",
    ledgerSha256: integrity.ledgerSha256,
    ledgerRows: integrity.rowCount,
    eligibleExposures: openedDecisions,
    openedDecisions,
    closedDecisions,
    pendingDecisions,
    excludedDecisions,
    exclusionReasons: { ...integrity.exclusionReasons },
    closureRatePct,
    decisions: openedDecisions,
    evaluatedDecisions,
    scoredDecisions,
    repeatCappedDecisions,
    uniqueTaskClasses,
    difficultyStrata,
    goodDecisions,
    prescribed: decisions.filter((event) => event.action === "prescribe").length,
    abstained: decisions.filter((event) => event.action === "abstain").length,
    observedInterventions,
    observedHelpfulInterventions,
    observedHarmfulInterventions,
    observedNeutralInterventions,
    observedAbstentions,
    observedSuccessfulAbstentions,
    observedFailedAbstentions,
    helpfulInterventions,
    harmfulInterventions,
    neutralInterventions,
    successfulAbstentions,
    failedAbstentions,
    verifiedSuccessfulAbstentions,
    verifiedEvaluatedAbstentions,
    judgedSuccessfulAbstentions,
    judgedEvaluatedAbstentions,
    judgedOnlyAbstentions,
    contextsAvoided,
    interferenceAbstentions,
    verifiedDecisions,
    verifiedGoodDecisions: verifiedGood,
    judgedDecisions,
    judgedGoodDecisions: judgedGood,
    unboundVerifiedDowngraded,
    transplantDemoted,
    attributionMismatch,
    verifiedNeutralDecisions,
    decisionEfficiencyPct: pct(goodDecisions, scoredDecisions),
    verifiedEfficiencyPct: pct(verifiedGood, verifiedDecisions),
    judgedEfficiencyPct: pct(judgedGood, judgedDecisions),
    restraintEfficiencyPct: pct(verifiedSuccessfulAbstentions, verifiedEvaluatedAbstentions),
    harmRatePct: pct(harmfulInterventions, prescribedEvaluated),
    skillsLearned: lifecycle.filter((event) => event.action === "learn" || event.action === "graduate").length,
    skillsUpdated: lifecycle.filter((event) => event.action === "update").length,
    skillsRetired: lifecycle.filter((event) => event.action === "retire").length,
    skillsRestored: lifecycle.filter((event) => event.action === "restore").length,
    latestPendingPossession,
    lastPlay
  };
}
function summarizePossessionLedger() {
  const inspection = inspectPossessionLedger();
  return summarizePossessions(inspection.events, inspection.integrity);
}
var claimBearingShareCustody = new WeakSet;
var SHARE_KEYS = new Set([
  "schema",
  "metric_contract",
  "score_status",
  "percentage_display_threshold",
  "period",
  "statement",
  "opened_decisions",
  "closed_decisions",
  "pending_decisions",
  "excluded_decisions",
  "closure_rate_pct",
  "eligible_exposures",
  "scored_exposures",
  "repeat_capped_exposures",
  "unique_task_classes",
  "difficulty_strata",
  "verified_good_decisions",
  "verified_neutral_decisions",
  "verified_evaluated_decisions",
  "judged_good_decisions",
  "judged_evaluated_decisions",
  "verified_successful_abstentions",
  "verified_evaluated_abstentions",
  "judged_successful_abstentions",
  "judged_failed_abstentions",
  "judged_only_abstentions",
  "helpful_interventions",
  "harmful_interventions",
  "neutral_interventions",
  "ledger_integrity",
  "exclusions",
  "decision_efficiency_pct"
]);
var PERIODS = new Set(["EARLY TAPE", "LAST 7 DAYS", "LAST 30 DAYS", "SEASON", "ALL TIME"]);
var SCORE_STATUSES = new Set(["blocked", "incomplete", "early_tape", "exploratory", "claim_eligible"]);
var safePeriod = (value) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "last_7_days" || normalized === "this_week")
    return "LAST 7 DAYS";
  if (normalized === "last_30_days" || normalized === "this_month")
    return "LAST 30 DAYS";
  if (normalized === "season")
    return "SEASON";
  return "ALL TIME";
};
function shareStatement(card) {
  if (card.score_status === "blocked")
    return "ledger blocked · inspect integrity";
  if (card.score_status === "incomplete")
    return `${card.closed_decisions} of ${card.opened_decisions} possessions closed · incomplete tape`;
  if (card.score_status === "claim_eligible" && card.decision_efficiency_pct !== undefined) {
    return `${card.verified_good_decisions} of ${card.verified_evaluated_decisions} bound-verified good decisions · ${card.decision_efficiency_pct}%`;
  }
  if (card.verified_evaluated_decisions > 0)
    return `${card.verified_good_decisions} of ${card.verified_evaluated_decisions} bound-verified good decisions · early tape`;
  return `no bound-verified score · judged tape ${card.judged_good_decisions} of ${card.judged_evaluated_decisions}`;
}
var nonNegativeInt = (label, value) => {
  if (!Number.isInteger(value) || Number(value) < 0)
    throw new Error(`${label} must be a non-negative integer`);
};
function validateShareCardPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("share payload must be an object");
  const raw = input;
  for (const key of Object.keys(raw))
    if (!SHARE_KEYS.has(key))
      throw new Error(`unexpected field '${key}'`);
  for (const key of SHARE_KEYS)
    if (key !== "decision_efficiency_pct" && !(key in raw))
      throw new Error(`missing field '${key}'`);
  if (raw.schema !== "mm.share-card.v1")
    throw new Error("schema mismatch");
  if (raw.metric_contract !== EFFICIENCY_CONTRACT.id)
    throw new Error("metric_contract mismatch");
  if (!SCORE_STATUSES.has(raw.score_status))
    throw new Error("score_status mismatch");
  if (!PERIODS.has(raw.period))
    throw new Error("period is not allowlisted");
  if (raw.percentage_display_threshold !== EFFICIENCY_CONTRACT.percentageDisplayThreshold)
    throw new Error("percentage_display_threshold must match the metric contract");
  if (raw.ledger_integrity !== "ok" && raw.ledger_integrity !== "blocked")
    throw new Error("ledger_integrity mismatch");
  const numeric = [
    "percentage_display_threshold",
    "opened_decisions",
    "closed_decisions",
    "pending_decisions",
    "excluded_decisions",
    "eligible_exposures",
    "scored_exposures",
    "repeat_capped_exposures",
    "unique_task_classes",
    "verified_good_decisions",
    "verified_evaluated_decisions",
    "judged_good_decisions",
    "judged_evaluated_decisions",
    "verified_successful_abstentions",
    "verified_evaluated_abstentions",
    "judged_successful_abstentions",
    "judged_failed_abstentions",
    "judged_only_abstentions",
    "helpful_interventions",
    "harmful_interventions",
    "neutral_interventions"
  ];
  for (const key of numeric)
    nonNegativeInt(key, raw[key]);
  if (raw.closure_rate_pct !== null && (!Number.isInteger(raw.closure_rate_pct) || raw.closure_rate_pct < 0 || raw.closure_rate_pct > 100))
    throw new Error("closure_rate_pct invalid");
  if (raw.decision_efficiency_pct !== undefined && (!Number.isInteger(raw.decision_efficiency_pct) || raw.decision_efficiency_pct < 0 || raw.decision_efficiency_pct > 100))
    throw new Error("decision_efficiency_pct invalid");
  for (const key of DIFFICULTIES)
    nonNegativeInt(`difficulty_strata.${key}`, raw.difficulty_strata?.[key]);
  if (Object.keys(raw.difficulty_strata || {}).some((key) => !DIFFICULTIES.has(key)))
    throw new Error("difficulty_strata unexpected field");
  for (const key of Object.keys(emptyExclusions()))
    nonNegativeInt(`exclusions.${key}`, raw.exclusions?.[key]);
  if (Object.keys(raw.exclusions || {}).some((key) => !(key in emptyExclusions())))
    throw new Error("exclusions unexpected field");
  const claimBearing = raw.verified_evaluated_decisions > 0 || raw.verified_good_decisions > 0 || raw.decision_efficiency_pct !== undefined;
  if (claimBearing && !claimBearingShareCustody.has(raw))
    throw new Error("claim-bearing verified share payload must be constructed from the bound ledger summary");
  const statusSaysBlocked = raw.score_status === "blocked";
  const integritySaysBlocked = raw.ledger_integrity === "blocked";
  if (statusSaysBlocked !== integritySaysBlocked)
    throw new Error("score_status=blocked must exactly match ledger_integrity=blocked");
  if (raw.opened_decisions !== raw.closed_decisions + raw.pending_decisions)
    throw new Error("custody arithmetic mismatch: opened must equal closed + pending");
  if (raw.eligible_exposures !== raw.opened_decisions)
    throw new Error("custody arithmetic mismatch: eligible exposures must equal opened decisions");
  if (raw.closed_decisions < raw.excluded_decisions)
    throw new Error("custody arithmetic mismatch: excluded exceeds closed");
  if (raw.scored_exposures + raw.repeat_capped_exposures !== raw.closed_decisions - raw.excluded_decisions)
    throw new Error("custody arithmetic mismatch: scored + repeat-capped must equal evaluated closures");
  if (raw.verified_evaluated_decisions + raw.judged_evaluated_decisions !== raw.scored_exposures)
    throw new Error("custody arithmetic mismatch: evidence tiers must equal scored exposures");
  if (raw.verified_good_decisions > raw.verified_evaluated_decisions || raw.judged_good_decisions > raw.judged_evaluated_decisions)
    throw new Error("custody arithmetic mismatch: good decisions exceed same-tier evaluated decisions");
  if (raw.verified_successful_abstentions > raw.verified_evaluated_abstentions)
    throw new Error("custody arithmetic mismatch: verified abstention successes exceed evaluated abstentions");
  if (raw.judged_successful_abstentions + raw.judged_failed_abstentions !== raw.judged_only_abstentions)
    throw new Error("custody arithmetic mismatch: judged abstention outcomes must equal judged-only abstentions");
  if (raw.verified_evaluated_abstentions !== 0 || raw.verified_successful_abstentions !== 0)
    throw new Error("exact-file verification cannot claim verified abstentions");
  const verifiedHelpful = raw.verified_good_decisions;
  const verifiedHarmful = Math.max(0, raw.verified_evaluated_decisions - raw.verified_good_decisions - (raw.verified_neutral_decisions ?? 0));
  const judgedHelpful = raw.helpful_interventions - verifiedHelpful;
  const judgedHarmful = raw.harmful_interventions - verifiedHarmful;
  if (judgedHelpful < 0 || judgedHarmful < 0)
    throw new Error("custody arithmetic mismatch: verified intervention counts exceed totals");
  const judgedNeutral = raw.neutral_interventions - (raw.verified_neutral_decisions ?? 0);
  if (judgedNeutral < 0)
    throw new Error("custody arithmetic mismatch: verified neutral exceeds neutral total");
  if (judgedHelpful + judgedHarmful + judgedNeutral + raw.judged_only_abstentions !== raw.judged_evaluated_decisions)
    throw new Error("custody arithmetic mismatch: judged intervention and abstention outcomes must equal judged evaluated decisions");
  if (raw.judged_good_decisions !== judgedHelpful + raw.judged_successful_abstentions)
    throw new Error("custody arithmetic mismatch: judged good decisions must equal judged helped prescriptions + successful abstentions");
  const difficultyTotal = Object.values(raw.difficulty_strata).reduce((sum, count) => sum + Number(count), 0);
  if (difficultyTotal !== raw.opened_decisions)
    throw new Error("custody arithmetic mismatch: difficulty strata must equal opened decisions");
  const expectedClosure = raw.opened_decisions ? Math.round(100 * raw.closed_decisions / raw.opened_decisions) : null;
  if (raw.closure_rate_pct !== expectedClosure)
    throw new Error("custody arithmetic mismatch: closure rate does not match counts");
  const exploratory = raw.repeat_capped_exposures > 0 || raw.unique_task_classes < EFFICIENCY_CONTRACT.minimumUniqueTaskClasses || raw.difficulty_strata.unknown > 0;
  const incomplete = raw.opened_decisions >= EFFICIENCY_CONTRACT.percentageDisplayThreshold && (raw.closure_rate_pct ?? 0) < EFFICIENCY_CONTRACT.minimumClosureRatePct;
  const claimEligible = raw.verified_evaluated_decisions >= EFFICIENCY_CONTRACT.percentageDisplayThreshold && !exploratory && !incomplete && !integritySaysBlocked;
  const expectedStatus = integritySaysBlocked ? "blocked" : incomplete ? "incomplete" : claimEligible ? "claim_eligible" : exploratory ? "exploratory" : "early_tape";
  if (raw.score_status !== expectedStatus)
    throw new Error(`score_status mismatch: expected ${expectedStatus}`);
  if (claimEligible) {
    const expectedPct = pct(raw.verified_good_decisions, raw.verified_evaluated_decisions);
    if (raw.decision_efficiency_pct !== expectedPct)
      throw new Error("decision_efficiency_pct must match same-tier bound-verified counts");
    if (raw.period === "EARLY TAPE")
      throw new Error("claim-eligible share card requires an allowlisted reporting period");
  } else {
    if (raw.decision_efficiency_pct !== undefined)
      throw new Error("percentage is allowed only for claim-eligible bound-verified tape");
    if (raw.period !== "EARLY TAPE")
      throw new Error("non-claim-bearing share card must remain EARLY TAPE");
  }
  if (raw.statement !== shareStatement(raw))
    throw new Error("statement must be derived from aggregate fields");
  return raw;
}
function buildShareCardPayload(summary, options) {
  if (summary.verifiedDecisions > 0) {
    const live = summarizePossessionLedger();
    if (summary.ledgerSha256 !== live.ledgerSha256 || summary.verifiedDecisions !== live.verifiedDecisions || summary.verifiedGoodDecisions !== live.verifiedGoodDecisions || summary.scoredDecisions !== live.scoredDecisions) {
      throw new Error("claim-bearing share payload must match the current bound ledger summary");
    }
  }
  const percentageAllowed = summary.scoreStatus === "claim_eligible" && summary.verifiedDecisions >= EFFICIENCY_CONTRACT.percentageDisplayThreshold;
  const period = percentageAllowed ? safePeriod(options.period) : "EARLY TAPE";
  const base = {
    schema: "mm.share-card.v1",
    metric_contract: EFFICIENCY_CONTRACT.id,
    score_status: summary.scoreStatus,
    percentage_display_threshold: EFFICIENCY_CONTRACT.percentageDisplayThreshold,
    period,
    statement: "",
    opened_decisions: summary.openedDecisions,
    closed_decisions: summary.closedDecisions,
    pending_decisions: summary.pendingDecisions,
    excluded_decisions: summary.excludedDecisions,
    closure_rate_pct: summary.closureRatePct,
    eligible_exposures: summary.eligibleExposures,
    scored_exposures: summary.scoredDecisions,
    repeat_capped_exposures: summary.repeatCappedDecisions,
    unique_task_classes: summary.uniqueTaskClasses,
    difficulty_strata: { ...summary.difficultyStrata },
    verified_good_decisions: summary.verifiedGoodDecisions,
    verified_neutral_decisions: summary.verifiedNeutralDecisions,
    verified_evaluated_decisions: summary.verifiedDecisions,
    judged_good_decisions: summary.judgedGoodDecisions,
    judged_evaluated_decisions: summary.judgedDecisions,
    verified_successful_abstentions: summary.verifiedSuccessfulAbstentions,
    verified_evaluated_abstentions: summary.verifiedEvaluatedAbstentions,
    judged_successful_abstentions: summary.judgedSuccessfulAbstentions,
    judged_failed_abstentions: summary.failedAbstentions,
    judged_only_abstentions: summary.judgedOnlyAbstentions,
    helpful_interventions: summary.helpfulInterventions,
    harmful_interventions: summary.harmfulInterventions,
    neutral_interventions: summary.neutralInterventions,
    ledger_integrity: summary.ledgerIntegrity,
    exclusions: { ...summary.exclusionReasons },
    ...percentageAllowed && summary.verifiedEfficiencyPct !== null ? { decision_efficiency_pct: summary.verifiedEfficiencyPct } : {}
  };
  base.statement = shareStatement(base);
  if (base.verified_evaluated_decisions > 0 || base.decision_efficiency_pct !== undefined)
    claimBearingShareCustody.add(base);
  return validateShareCardPayload(base);
}

// mods/wins.ts
import { existsSync as existsSync9, readFileSync as readFileSync9, readdirSync as readdirSync3 } from "node:fs";
import { join as join10 } from "node:path";
function readJsonl(path) {
  if (!existsSync9(path))
    return [];
  const out = [];
  for (const line of readFileSync9(path, "utf8").split(`
`)) {
    if (!line.trim())
      continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}
function num(o, k) {
  if (o && typeof o === "object" && k in o) {
    const v = Reflect.get(o, k);
    if (typeof v === "number")
      return v;
  }
  return null;
}
function str(o, k) {
  if (o && typeof o === "object" && k in o) {
    const v = Reflect.get(o, k);
    if (typeof v === "string")
      return v;
  }
  return "";
}
function collectWins(stateDir = STATE_DIR) {
  const exp = readJsonl(join10(stateDir, "experience.jsonl"));
  const convs = new Set;
  let firstRepTs = null;
  for (const r of exp) {
    const c = str(r, "conv");
    if (c)
      convs.add(c);
    const ts = num(r, "ts");
    if (ts !== null && (firstRepTs === null || ts < firstRepTs))
      firstRepTs = ts;
  }
  const sessions = new Set(readJsonl(join10(stateDir, "sessions.jsonl")).map((s) => str(s, "conv")).filter(Boolean));
  for (const c of convs)
    sessions.add(c);
  const skillsEarned = [];
  const updatesFolded = [];
  const receiptsDir = join10(stateDir, "receipts");
  if (existsSync9(receiptsDir)) {
    for (const f of readdirSync3(receiptsDir)) {
      if (!/^reflect-\d+\.json$/.test(f))
        continue;
      try {
        const r = JSON.parse(readFileSync9(join10(receiptsDir, f), "utf8"));
        const action = str(r, "action");
        const name = str(r, "name");
        const ts = num(r, "ts") ?? 0;
        if (!name)
          continue;
        const graduated = !str(r, "dir").includes("staged");
        if (action === "create")
          skillsEarned.push({ name, action: "create", graduated, ts });
        else if (action === "update")
          updatesFolded.push({ name, action: "update", graduated, ts });
      } catch {}
    }
  }
  skillsEarned.sort((a, b) => b.ts - a.ts);
  updatesFolded.sort((a, b) => b.ts - a.ts);
  const hits = readJsonl(join10(stateDir, "defense-hits.jsonl"));
  let knownFixSurfaced = 0;
  let lastFlag = null;
  for (const h of hits) {
    if (str(h, "kind") === "fix")
      knownFixSurfaced++;
    const ts = num(h, "ts") ?? 0;
    if (!lastFlag || ts > lastFlag.ts)
      lastFlag = { step: str(h, "step"), errClass: str(h, "errClass"), defense: str(h, "defense"), ts };
  }
  let noiseRejected = 0;
  for (const e of readJsonl(join10(stateDir, "ui-events.jsonl"))) {
    if (str(e, "phase") !== "noise_rejected")
      continue;
    const m = str(e, "summary").match(/rejected (\d+)/);
    noiseRejected += m ? Number(m[1]) : 1;
  }
  const skillUses = [];
  const usagePath = join10(stateDir, "skill-usage.json");
  if (existsSync9(usagePath)) {
    try {
      const u = JSON.parse(readFileSync9(usagePath, "utf8"));
      if (u && typeof u === "object")
        for (const [name, rec] of Object.entries(u)) {
          const uses = num(rec, "uses") ?? (typeof rec === "number" ? rec : 0);
          if (uses > 0)
            skillUses.push({ name, uses });
        }
    } catch {}
  }
  skillUses.sort((a, b) => b.uses - a.uses);
  const firstSkillTs = skillsEarned.length ? skillsEarned[skillsEarned.length - 1].ts : null;
  return {
    reps: exp.length,
    sessions: sessions.size,
    firstRepTs,
    skillsEarned,
    updatesFolded,
    repeatsFlagged: hits.length,
    knownFixSurfaced,
    lastFlag,
    noiseRejected,
    skillUses: skillUses.slice(0, 5),
    timeToFirstSkillMs: firstRepTs !== null && firstSkillTs !== null && firstSkillTs > firstRepTs ? firstSkillTs - firstRepTs : null
  };
}
function ago(ms, now = Date.now()) {
  const d = Math.max(0, now - ms);
  if (d < 90000)
    return "just now";
  if (d < 90 * 60000)
    return `${Math.round(d / 60000)}m ago`;
  if (d < 36 * 3600000)
    return `${Math.round(d / 3600000)}h ago`;
  return `${Math.round(d / 86400000)}d ago`;
}
function span(ms) {
  if (ms < 3600000)
    return `${Math.max(1, Math.round(ms / 60000))} minutes`;
  if (ms < 48 * 3600000)
    return `${Math.round(ms / 3600000)} hours`;
  return `${Math.round(ms / 86400000)} days`;
}
function renderWins(w, now = Date.now()) {
  if (w.reps === 0)
    return `\uD83D\uDCBE muscle-memory · wins
(no reps observed yet — work a real session and check back)`;
  const L = ["\uD83D\uDCBE muscle-memory · wins — what watching your work bought you", ""];
  L.push(`  \uD83C\uDF9E  ${w.reps.toLocaleString()} reps watched across ${w.sessions} session${w.sessions === 1 ? "" : "s"}`);
  if (w.skillsEarned.length) {
    const grad = w.skillsEarned.filter((s) => s.graduated).length;
    L.push(`  \uD83C\uDFC5 ${w.skillsEarned.length} skill${w.skillsEarned.length === 1 ? "" : "s"} earned from your own work (${grad} graduated, ${w.skillsEarned.length - grad} staged)`);
    for (const s of w.skillsEarned.slice(0, 3))
      L.push(`      · ${s.name} — ${ago(s.ts, now)}`);
  }
  if (w.updatesFolded.length)
    L.push(`  \uD83E\uDDEC ${w.updatesFolded.length} lesson${w.updatesFolded.length === 1 ? "" : "s"} folded into existing skills instead of spawning duplicates`);
  if (w.repeatsFlagged) {
    L.push(`  \uD83D\uDEE1  ${w.repeatsFlagged} repeat-failure${w.repeatsFlagged === 1 ? "" : "s"} recognized before the tool ran${w.knownFixSurfaced ? ` (${w.knownFixSurfaced} with a known fix on file)` : ""}`);
    if (w.lastFlag)
      L.push(`      · last: ${w.lastFlag.step} → ${w.lastFlag.errClass} (${ago(w.lastFlag.ts, now)})`);
  }
  if (w.skillUses.length) {
    const total = w.skillUses.reduce((a, s) => a + s.uses, 0);
    L.push(`  \uD83D\uDCC8 learned skills invoked ${total}× — top: ${w.skillUses[0].name} (${w.skillUses[0].uses}×)`);
  }
  if (w.noiseRejected)
    L.push(`  \uD83E\uDDF9 ${w.noiseRejected} env-noise item${w.noiseRejected === 1 ? "" : "s"} kept OUT of your skill library`);
  if (w.timeToFirstSkillMs !== null)
    L.push(`  ⏱  first rep → first earned skill: ${span(w.timeToFirstSkillMs)}`);
  if (!w.skillsEarned.length && !w.updatesFolded.length)
    L.push(`  \uD83C\uDF31 no skills earned yet — patterns need ≥2 sessions to mature (that's the taste, not a bug)`);
  L.push("", "  every line above is backed by a receipt · /muscle-memory events");
  return L.join(`
`);
}

// mods/history.ts
import { existsSync as existsSync10, readFileSync as readFileSync10, writeFileSync as writeFileSync7 } from "node:fs";
import { join as join11 } from "node:path";
var MINE_WATERMARK_PATH = join11(STATE_DIR, "mined-watermark.json");
function loadWatermarks() {
  try {
    if (!existsSync10(MINE_WATERMARK_PATH))
      return {};
    const parsed = JSON.parse(readFileSync10(MINE_WATERMARK_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function saveWatermark(agentId, id, ts) {
  try {
    ensureDir();
    const all = loadWatermarks();
    all[agentId] = { id, ts };
    writeFileSync7(MINE_WATERMARK_PATH, JSON.stringify(all, null, 2));
  } catch {}
}
function parseHistoryMessage(m) {
  if (!m || typeof m !== "object")
    return [];
  const msg = m;
  const ts = typeof msg.date === "string" ? Date.parse(msg.date) || Date.now() : Date.now();
  const conv = typeof msg.conversation_id === "string" ? msg.conversation_id : null;
  const out = [];
  const mtype = typeof msg.message_type === "string" ? msg.message_type : "";
  if (mtype === "tool_call_message") {
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : msg.tool_call ? [msg.tool_call] : [];
    for (const c of calls) {
      if (!c || typeof c !== "object")
        continue;
      const call = c;
      const tool = typeof call.name === "string" ? call.name : "";
      const id = typeof call.tool_call_id === "string" ? call.tool_call_id : "";
      if (!tool || !id)
        continue;
      let args = {};
      if (typeof call.arguments === "string") {
        try {
          const parsed = JSON.parse(call.arguments);
          if (parsed && typeof parsed === "object")
            args = parsed;
        } catch {}
      }
      out.push({ kind: "call", ts, id, conv, tool, args });
    }
  } else if (mtype === "tool_return_message") {
    const id = typeof msg.tool_call_id === "string" ? msg.tool_call_id : "";
    if (id) {
      const status = typeof msg.status === "string" ? msg.status : "";
      const ret = msg.tool_return;
      const text = typeof ret === "string" ? ret : Array.isArray(ret) ? ret.map((p) => p && typeof p === "object" && ("text" in p) && typeof p.text === "string" ? String(p.text) : "").join(`
`) : "";
      out.push({ kind: "return", ts, id, conv, tool: typeof msg.name === "string" ? msg.name : null, ok: status === "success", text });
    }
  }
  return out;
}
function minedRecords(events) {
  const rows = [];
  const outcomes = [];
  for (const e of events) {
    if (e.kind === "call") {
      const { fp, tmpl } = fingerprint2(e.tool, e.args);
      rows.push({ ts: e.ts, conv: e.conv, tool: e.tool, fp, tmpl, h: hash(fp), id: e.id, mined: true });
    } else {
      outcomes.push({ ts: e.ts, id: e.id, tool: e.tool, conv: e.conv, ok: e.ok, err: e.ok ? null : classifyError(e.text, false), mined: true });
    }
  }
  return { rows, outcomes };
}
async function mineAgentHistory(client, agentId, opts) {
  const empty = { rows: 0, outcomes: 0, scanned: 0, newestId: null, newestTs: 0 };
  if (!agentId)
    return empty;
  const list = reachFn(client, ["agents", "messages", "list"]);
  if (!list)
    return empty;
  const mark = loadWatermarks()[agentId];
  const maxPages = opts?.maxPages ?? 10;
  const pageSize = opts?.pageSize ?? 100;
  const logPath = opts?.stateDirOverride?.log ?? LOG_PATH;
  const outPath = opts?.stateDirOverride?.outcomes ?? OUTCOME_PATH;
  let scanned = 0, rowsWritten = 0, outcomesWritten = 0;
  let newestId = null, newestTs = 0;
  let after;
  if (mark)
    after = mark.id;
  try {
    for (let page = 0;page < maxPages; page++) {
      const resp = await list(agentId, { limit: pageSize, ...after ? { after } : {}, order: "asc" });
      const items = pageItems(resp);
      if (!items.length)
        break;
      for (const m of items) {
        scanned++;
        const events = parseHistoryMessage(m);
        const { rows, outcomes } = minedRecords(events);
        for (const r of rows) {
          appendJsonl(logPath, r);
          rowsWritten++;
        }
        for (const o of outcomes) {
          appendJsonl(outPath, o);
          outcomesWritten++;
        }
        const mid = m && typeof m === "object" && "id" in m && typeof m.id === "string" ? String(m.id) : null;
        const mts = m && typeof m === "object" && "date" in m && typeof m.date === "string" ? Date.parse(String(m.date)) || 0 : 0;
        if (mid) {
          newestId = mid;
          newestTs = mts;
        }
      }
      const last = items[items.length - 1];
      const cursor = last && typeof last === "object" && "id" in last && typeof last.id === "string" ? String(last.id) : undefined;
      if (!cursor || items.length < pageSize) {
        after = cursor;
        break;
      }
      after = cursor;
    }
  } catch {}
  if (newestId && !opts?.stateDirOverride)
    saveWatermark(agentId, newestId, newestTs);
  return { rows: rowsWritten, outcomes: outcomesWritten, scanned, newestId, newestTs };
}

// mods/referee.ts
import { existsSync as existsSync11, readFileSync as readFileSync11, writeFileSync as writeFileSync8, appendFileSync as appendFileSync4 } from "node:fs";
import { join as join12 } from "node:path";
var PLUSMINUS_PATH = join12(STATE_DIR, "skill-plusminus.json");
var RATING_REASONS_PATH = join12(STATE_DIR, "rating-reasons.jsonl");
function appendRatingReason(ev) {
  try {
    ensureDir();
    appendFileSync4(RATING_REASONS_PATH, JSON.stringify(ev) + `
`);
    return true;
  } catch {
    return false;
  }
}
function loadPlusMinus() {
  try {
    if (!existsSync11(PLUSMINUS_PATH))
      return {};
    const parsed = JSON.parse(readFileSync11(PLUSMINUS_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function loadRatingEvents() {
  try {
    if (!existsSync11(RATING_REASONS_PATH))
      return [];
    const out = [];
    for (const line of readFileSync11(RATING_REASONS_PATH, "utf8").split(`
`)) {
      if (!line.trim())
        continue;
      try {
        const ev = JSON.parse(line);
        if (ev && typeof ev === "object" && typeof ev.skill === "string" && (ev.rating === "up" || ev.rating === "down" || ev.rating === "no_rate"))
          out.push(ev);
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}
function recordPlusMinus(skillName, up, stepId) {
  const ledger = loadPlusMinus();
  const cur = ledger[skillName] ?? { plus: 0, minus: 0, lastTs: 0, lastStepId: null };
  const next = { plus: cur.plus + (up ? 1 : 0), minus: cur.minus + (up ? 0 : 1), lastTs: Date.now(), lastStepId: stepId ?? null };
  ledger[skillName] = next;
  try {
    ensureDir();
    writeFileSync8(PLUSMINUS_PATH, JSON.stringify(ledger, null, 2));
    return { line: next, persisted: true };
  } catch {
    return { line: next, persisted: false };
  }
}
function modelIdentity(model) {
  if (typeof model === "string")
    return model.trim().slice(0, 200) || "unknown";
  if (!model || typeof model !== "object")
    return "unknown";
  const m = model;
  const handle = typeof m.handle === "string" ? m.handle.trim() : "";
  if (handle)
    return handle.slice(0, 200);
  const id = typeof m.id === "string" ? m.id.trim() : "";
  const provider = typeof m.provider === "string" ? m.provider.trim() : "";
  if (provider && id && !id.includes("/"))
    return `${provider}/${id}`.slice(0, 200);
  if (id)
    return id.slice(0, 200);
  const name = typeof m.name === "string" ? m.name.trim() : "";
  return name.slice(0, 200) || "unknown";
}
function providerIdentity(model) {
  if (model && typeof model === "object") {
    const provider = model.provider;
    if (typeof provider === "string" && provider.trim())
      return provider.trim().slice(0, 100);
  }
  const label = modelIdentity(model);
  return label.includes("/") ? label.split("/", 1)[0].slice(0, 100) : "unknown";
}
var ZERO = { plus: 0, minus: 0, lastTs: 0, lastStepId: null };
async function rateSkill(client, skillName, rating, stepId, opts = {}) {
  const legacyBool = typeof rating === "boolean";
  const kind = legacyBool ? rating ? "up" : "down" : rating;
  const refuse = (why, zero = false) => ({
    skill: skillName,
    rating: zero ? ZERO : loadPlusMinus()[skillName] ?? ZERO,
    nativePosted: false,
    reason: why,
    recorded: false,
    ratingKind: kind,
    sidecarWritten: false,
    aggregatePersisted: null,
    partial: false
  });
  if (!isValidSkillName(skillName))
    return refuse(`invalid skill name '${skillName}'`, true);
  if (kind !== "up" && kind !== "down" && kind !== "no_rate")
    return refuse(`invalid rating '${String(rating)}' (want up|down|no_rate)`, true);
  const reason = (opts.reason ?? "").trim();
  if (!legacyBool && (kind === "down" || kind === "no_rate") && !reason)
    return refuse(`rating '${kind}' requires a reason — not recorded`);
  const agent = opts.agent ?? process.env.MM_AGENT ?? "unknown";
  const sidecarWritten = appendRatingReason({
    ts: Date.now(),
    agent,
    rater: opts.rater ?? agent,
    skill: skillName,
    rating: kind,
    reason,
    evidence_ref: (opts.evidenceRef ?? "").slice(0, 300),
    task: opts.task ?? "",
    step_id: stepId ?? null,
    source: opts.source ?? "rate_skill",
    model: opts.model ?? "unknown",
    provider: opts.provider ?? "unknown"
  });
  if (!sidecarWritten)
    return refuse("NOT recorded — sidecar append failed; field evidence requires the sidecar");
  let line = loadPlusMinus()[skillName] ?? ZERO;
  let aggregatePersisted = null;
  if (kind !== "no_rate") {
    const recorded = recordPlusMinus(skillName, kind === "up", stepId);
    line = recorded.line;
    aggregatePersisted = recorded.persisted;
  }
  const partial = aggregatePersisted === false;
  let nativePosted = false;
  if (stepId && kind !== "no_rate") {
    const post = reachFn(client, ["steps", "feedback", "create"]);
    if (post) {
      try {
        await post(stepId, { feedback: kind === "up" ? "positive" : "negative" });
        nativePosted = true;
      } catch {}
    }
  }
  const status = kind === "no_rate" ? "sidecar only (no_rate — aggregate unchanged)" : partial ? "PARTIAL: sidecar recorded; aggregate persist FAILED" : nativePosted ? "ledger + sidecar + native steps.feedback" : stepId ? "ledger + sidecar (native unavailable/failed)" : "ledger + sidecar (no step id)";
  return { skill: skillName, rating: line, nativePosted, reason: status, recorded: true, ratingKind: kind, sidecarWritten, aggregatePersisted, partial };
}
function renderPlusMinus(ledger) {
  const rows = Object.entries(ledger).filter(([name]) => !FIXTURE_SKILL_RE.test(name)).sort((a, b) => b[1].plus - b[1].minus - (a[1].plus - a[1].minus));
  if (!rows.length)
    return "(no skill ratings yet — rate with /muscle-memory rate <skill> up|down [step-id])";
  return rows.map(([name, r]) => {
    const sample = r.plus + r.minus;
    return `  ${name} · ${r.plus} helped · ${r.minus} missed · ${sample} rated`;
  }).join(`
`);
}

// mods/shelf.ts
import { mkdirSync as mkdirSync9, writeFileSync as writeFileSync9 } from "node:fs";
import { join as join13 } from "node:path";
var SQUAD_ARCHIVE_NAME = process.env.MM_SQUAD_ARCHIVE || "mm-squad-shelf";
var SHELF_DOC_TAG = "mm:shelf-doc";
async function ensureSquadArchive(client, opts) {
  const list = reachFn(client, ["archives", "list"]);
  const create = reachFn(client, ["archives", "create"]);
  if (!create)
    return null;
  try {
    if (list) {
      const resp = await list({ name: SQUAD_ARCHIVE_NAME, limit: 5 });
      const items = pageItems(resp);
      for (const a of items) {
        if (a && typeof a === "object" && "id" in a && typeof a.id === "string" && "name" in a && a.name === SQUAD_ARCHIVE_NAME) {
          return String(a.id);
        }
      }
    }
    const created = await create({ name: SQUAD_ARCHIVE_NAME, description: "muscle-memory squad shelf — sanitized, provenance-tagged skills published for cross-agent inheritance (pull-only, staged-first)", ...opts?.embedding ? { embedding: opts.embedding } : {} });
    return created && typeof created === "object" && "id" in created && typeof created.id === "string" ? String(created.id) : null;
  } catch {
    return null;
  }
}
var SHELF_MARKER_RE = /<!-- mm:shelf skill=([a-z0-9-]+) publisher=([A-Za-z0-9_-]+) published=([0-9T:.Z-]+) -->/;
function shelfMarker(skillName, publisher, publishedAt) {
  return `<!-- mm:shelf skill=${skillName} publisher=${publisher} published=${publishedAt} -->`;
}
async function publishSkillToShelf(client, archiveId, skillName, sanitizedContent, publisher) {
  if (!archiveId)
    return { ok: false, archiveId: null, reason: "no archive id" };
  if (!isValidSkillName(skillName))
    return { ok: false, archiveId, reason: `invalid skill name '${skillName}'` };
  if (SECRET_TOKEN_RE.test(sanitizedContent))
    return { ok: false, archiveId, reason: "secret-shaped value in content — publish blocked (run the sanitizer)" };
  const create = reachFn(client, ["archives", "passages", "create"]);
  if (!create)
    return { ok: false, archiveId, reason: "client lacks archives.passages.create" };
  try {
    const marker = shelfMarker(skillName, publisher, new Date().toISOString());
    await create(archiveId, {
      text: `${marker}
${sanitizedContent.slice(0, 40000)}`,
      tags: [SKILL_PASSAGE_TAG, skillPassageTag(skillName), SHELF_DOC_TAG, `mm:src:${publisher}`],
      metadata: { publisher, skill: skillName, publishedAt: new Date().toISOString(), format: "SKILL.md" }
    });
    return { ok: true, archiveId, reason: "published" };
  } catch (e) {
    return { ok: false, archiveId, reason: `publish failed: ${e instanceof Error ? e.message : "unknown"}` };
  }
}
async function attachSquadShelf(client, agentId, archiveId) {
  const attach = reachFn(client, ["agents", "archives", "attach"]);
  if (!attach || !agentId || !archiveId)
    return false;
  try {
    await attach(archiveId, { agent_id: agentId });
    return true;
  } catch {
    return false;
  }
}
async function pullShelfSkill(client, agentId, skillName) {
  if (!isValidSkillName(skillName))
    return { ok: false, stagedPath: null, publisher: null, reason: `invalid skill name '${skillName}'` };
  const search = reachFn(client, ["agents", "passages", "search"]);
  if (!search || !agentId)
    return { ok: false, stagedPath: null, publisher: null, reason: "client lacks agents.passages.search" };
  try {
    const resp = await search(agentId, { query: skillName.replace(/-/g, " "), top_k: 10 });
    const results = resp && typeof resp === "object" && "results" in resp && Array.isArray(resp.results) ? resp.results : [];
    let best = null;
    for (const r of results) {
      if (!r || typeof r !== "object" || !("content" in r) || typeof r.content !== "string")
        continue;
      const content = String(r.content);
      const m = content.match(SHELF_MARKER_RE);
      if (!m || m[1] !== skillName)
        continue;
      if (!best || m[3] > best.publishedAt)
        best = { content, publisher: m[2], publishedAt: m[3] };
    }
    if (!best)
      return { ok: false, stagedPath: null, publisher: null, reason: `no shelf doc found for '${skillName}' (is the shelf attached to this agent?)` };
    if (SECRET_TOKEN_RE.test(best.content))
      return { ok: false, stagedPath: null, publisher: best.publisher, reason: "shelf content failed the secret gate — refused" };
    const dir = join13(PUBLISH_STAGED_DIR, skillName);
    mkdirSync9(dir, { recursive: true });
    const staged = join13(dir, "SKILL.md");
    const header = `<!-- muscle-memory shelf pull · publisher: ${best.publisher} · published: ${best.publishedAt} · pulled: ${new Date().toISOString()} · REVIEW BEFORE PROMOTION -->
`;
    writeFileSync9(staged, header + best.content);
    return { ok: true, stagedPath: staged, publisher: best.publisher, reason: "staged for review" };
  } catch (e) {
    return { ok: false, stagedPath: null, publisher: null, reason: `pull failed: ${e instanceof Error ? e.message : "unknown"}` };
  }
}

// mods/index.ts
var __mm = {
  meshAgentLabel,
  initInstrumentKey,
  summarizePossessionLedger,
  recordPossessionEvent,
  recordInstrumentVerifiedOutcome,
  commandTemplate: commandTemplate2,
  fingerprint: fingerprint2,
  redactFragment,
  buildDiffFragment,
  detect,
  detectTemplates,
  detectSequences,
  maturityScore,
  MM,
  loadRows,
  dedupCheck,
  slug,
  draftSkillFromCandidate,
  candidateName,
  candidateDescription,
  curateManagedSkills,
  managedSkillUsage,
  streamChunkText,
  isDurableLesson,
  isValidSkillName,
  buildCrossConversationEvidence,
  REVIEW_PROMPT,
  reviewAndAuthor,
  searchSkills,
  pickUpdateTarget,
  runReflectiveReview,
  graduateStagedSkill,
  publishSkillToCatalog,
  catalogPrivacyScan,
  isHighConfidenceCreate,
  runAutonomousPrune,
  buildEvidenceManifest,
  retrievePreferences,
  coverageMap,
  churnSignal,
  summarizeReflectActions,
  renderMuscleMemoryPanel,
  loadMeshFeed,
  renderMeshFeed,
  buildRegistry,
  curatorPass,
  skillVerbs,
  specDrift,
  lifecycleTransition,
  CURATOR,
  setPinned,
  isPinned,
  buildDefenses,
  preActionDefense,
  autopilotPlan,
  executeAutopilotPlan,
  AUTOPILOT_DEFAULT,
  managedView,
  forkAuthor,
  scanSkillContent,
  scanSupportFile,
  validateSupportPath,
  writeSupportFile,
  removeSupportFile,
  restoreManagedSkill,
  classifyError,
  mergeOutcomes,
  correlateOutcomes,
  inferOutcomes,
  detectInvocationGotchas,
  loadExperience,
  detectRepairChains,
  detectAntiPatterns,
  impactScore,
  lintSkillDraft,
  aggregateTelemetry,
  effectivenessVerdict,
  draftWithRepair,
  stepSig,
  sotaQualityGaps,
  auditSkills,
  crossShelfDuplicates,
  publishabilityScore,
  sanitizeForPublish,
  publishHardBlocks,
  publishPlan,
  publishTier,
  publishMetadata,
  findSimilarSkills,
  stageSanitizedPublish,
  approveStagedPublish,
  publishVisibilityReceipt,
  liveSkillVisible,
  writeSkill,
  isManaged,
  listSkillNames,
  readSkill,
  retireManagedSkill,
  agentSkillsDir,
  scanDirs,
  syncSkillToDesktopCatalog,
  MM_TAG,
  ENGRAM,
  expectationFor,
  predictionError,
  tagExperience,
  captureTagged,
  skillRetrieved,
  labileSkills,
  replayQueue,
  reverseReplay,
  interleave,
  engramConsolidate,
  renderEngramDigest,
  guardDecision,
  buildNeocortexBlock,
  nativeEnabled,
  NEOCORTEX_BLOCK,
  applySemanticEvidence,
  semanticSkillCandidates,
  syncSkillPassages,
  coachOnFailure,
  collectWins,
  renderWins
};
function autoPruneIfEnabled(ctx) {
  if (process.env.MM_PRUNE !== "enabled")
    return;
  try {
    runAutonomousPrune(ctx, { maxRetire: 1 });
  } catch {}
}
function activate(letta) {
  const disposers = [];
  let panel = null;
  let panelBeatTimer = null;
  const flashEarnedMinute = (label, skill = "") => {
    if (panelBeatTimer)
      clearTimeout(panelBeatTimer);
    writeUiState({ phase: "earned", last: label, skill, route: "" });
    panelBeatTimer = setTimeout(() => {
      panelBeatTimer = null;
      const state = readUiState();
      if (state?.phase === "earned")
        writeUiState({ phase: "idle", last: "", skill: "", route: "" });
    }, 12000);
  };
  disposers.push(() => {
    if (panelBeatTimer)
      clearTimeout(panelBeatTimer);
    panelBeatTimer = null;
  });
  const DEFENSE_HITS = join14(STATE_DIR, "defense-hits.jsonl");
  let defensesCache = [];
  const refreshDefenses = () => {
    try {
      defensesCache = buildDefenses(loadExperience());
    } catch {
      defensesCache = [];
    }
  };
  const isInstalledSkill = (name, ctx) => scanDirs(ctx).some((dir) => existsSync12(join14(dir, name, "SKILL.md")));
  const recordLifecycle = (action, skill, reason) => {
    const stamp = Date.now();
    try {
      recordPossessionEvent({
        schema: "mm.possession.v1",
        event_id: `l-${action}-${stamp.toString(36)}-${hash(`${skill}:${reason}:${stamp}`)}`,
        possession_id: `lifecycle-${action}-${stamp.toString(36)}-${hash(skill)}`,
        ts: stamp,
        type: "lifecycle",
        action,
        skill: slug(skill),
        reason
      });
      return "";
    } catch (error) {
      return `
⚠ lifecycle event not recorded — ${String(error?.message || error)}`;
    }
  };
  const renderRosterSnapshot = (ctx) => {
    const events = loadPossessionEvents();
    const active = new Set(curateManagedSkills(ctx).map((row) => row.name));
    for (const event of events) {
      if (event.type === "decision" && event.action === "prescribe" && event.skill && isInstalledSkill(event.skill, ctx))
        active.add(event.skill);
    }
    const decisions = new Map(events.filter((event) => event.type === "decision").map((event) => [event.possession_id, event]));
    const outcomes = new Map;
    for (const event of events)
      if (event.type === "outcome")
        outcomes.set(event.possession_id, event);
    const provenNames = new Set;
    let helped = 0;
    for (const [possessionId, decision] of decisions) {
      if (decision.type !== "decision" || decision.action !== "prescribe" || !decision.skill || !active.has(decision.skill))
        continue;
      const outcome = outcomes.get(possessionId);
      if (!outcome || outcome.result !== "helped")
        continue;
      helped++;
      if (outcome.evidence_tier !== "verified" || !decision.verification || !outcome.verification)
        continue;
      const verdict = claimBearingVerdict(decision, outcome);
      if (verdict.verified)
        provenNames.add(verdict.attributedSkill || decision.skill);
    }
    return { total: active.size, proven: provenNames.size, provenNames: [...provenNames].sort(), helped };
  };
  const renderDecisionReport = (summary, ctx) => {
    const roster = renderRosterSnapshot(ctx);
    return renderAgentBoxScore(summary, {
      agent: String(process.env.MM_AGENT || ctx?.agent?.name || "Agent"),
      period: "All time",
      skills: { active: roster.total, proven: roster.proven }
    });
  };
  let possessionCounter = 0;
  const prescribeForTask = (task, gapDeclared, ctx, taskClassInput, difficultyInput, verificationTaskId) => {
    const query = String(task || "").trim();
    if (!query)
      return "ABSTAIN — describe the observed task/procedure gap before requesting a prescription.";
    const taskClass = /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(taskClassInput || "")) ? String(taskClassInput) : `task-${hash(query)}`;
    const track = (message, action, route2, skill) => {
      const stamp = Date.now();
      const possessionId = `p-${stamp.toString(36)}-${++possessionCounter}-${hash(`${taskClass}:${route2}:${stamp}`)}`;
      try {
        const verification = action === "prescribe" && verificationTaskId ? bindExactFileVerificationTask(String(verificationTaskId)) : undefined;
        recordPossessionEvent({
          schema: "mm.possession.v1",
          event_id: `d-${possessionId}`,
          possession_id: possessionId,
          ts: stamp,
          type: "decision",
          agent: String(process.env.MM_AGENT || ctx?.agent?.name || "agent"),
          model: modelIdentity(ctx?.model),
          action,
          task_class: taskClass,
          difficulty: difficultyInput || "unknown",
          gap_observed: gapDeclared,
          route: route2,
          ...skill ? { skill } : {},
          ...verification ? { verification } : {}
        });
        const closeout = verification ? `run verify_agent_possession possession_id="${possessionId}"; the bound instrument derives the outcome` : "record the observed outcome with muscle_memory_close";
        return `${message}
possession: ${possessionId} · after the task, ${closeout}`;
      } catch (error) {
        return `${message}
tracking: decision not recorded — ${String(error?.message || error)}`;
      }
    };
    if (!gapDeclared)
      return track("ABSTAIN — no observed/known procedure gap was declared. Relevance alone is not an indication; let the model work unaided.", "abstain", "no-gap");
    const dirs = scanDirs(ctx);
    const top = searchSkills(dirs, normalizePrescriptionQuery(query), 3);
    const decision = routeSkill(top, [], (name) => dirs.some((dir) => existsSync12(join14(dir, name, "SKILL.md"))), 18);
    if (decision.route === "update" && decision.target) {
      const t = decision.target;
      const model = modelIdentity(ctx?.model);
      const modelEvents = loadRatingEvents().filter((ev) => ev.skill === t.name && ev.rating !== "no_rate" && model !== "unknown" && ev.model === model);
      const modelNet = modelEvents.reduce((sum, ev) => sum + (ev.rating === "up" ? 1 : -1), 0);
      if (modelEvents.length && modelNet < 0) {
        return track(`ABSTAIN — "${t.name}" matches the task but has negative field evidence for runtime model ${model} (${modelNet}, n=${modelEvents.length}). Review/reformulate instead of repeating observed harm.`, "abstain", "negative-field");
      }
      const modelLine = model === "unknown" ? "runtime model: unknown (selection is task-conditioned only; capability is not inferred)" : modelEvents.length ? `runtime model ${model}: field ${modelNet >= 0 ? "+" : ""}${modelNet} across ${modelEvents.length} rated possession${modelEvents.length === 1 ? "" : "s"}` : `runtime model ${model}: unproven for this skill; caller owns the gap diagnosis`;
      return track(`PRESCRIBE "${t.name}" — one smallest matching installed skill (score ${t.score}, ${t.matched} distinctive terms)
NEXT · invoke the normal Skill tool with skill="${t.name}", perform the task, then call muscle_memory_close with the observed result
${modelLine}
gap diagnosis: caller-attested observed/known procedure gap; the router does not infer hidden model capability
control: do not inject sibling skills or the full shelf`, "prescribe", "matched", t.name);
    }
    const strongTie = top.length > 1 && top[0].score >= 18 && top[1].score >= 18 && Math.abs(top[0].score - top[1].score) <= 3;
    const route = decision.route === "park-ambiguous" || strongTie ? "ambiguous" : decision.route === "park-semantic" ? "weak-match" : "no-safe-match";
    const why = route === "ambiguous" ? "two candidates tied for the strongest match, so no single skill had enough dominance to inject safely" : decision.route === "park-semantic" ? `possible duplicate/neighbor "${decision.suspect}" without enough lexical proof` : "no installed skill cleared the safe-match gate";
    const closest = top.length ? top.map((m, index) => `${index + 1}. ${m.name} — ${index === 0 ? "strongest" : m.score === top[0].score ? "tied strongest" : "close neighbor"}; ${m.matched} distinctive term${m.matched === 1 ? "" : "s"}`).join(`
`) : "none";
    return track(`ABSTAIN — ${why}.

Closest:
${closest}

Next: continue unaided, or inspect one candidate without loading the full shelf.`, "abstain", route);
  };
  const renderPendingPossessions = () => {
    const rows = pendingPossessionViews(loadPossessionEvents());
    if (!rows.length)
      return "NONE OPEN · continue work, or run `/muscle-memory` for the report";
    return rows.slice(0, 10).map((row) => {
      const ageMinutes = Math.max(0, Math.floor((Date.now() - row.openedAt) / 60000));
      const skill = row.skill ? `
SKILL · ${row.skill}` : "";
      const next = row.skill ? `NEXT · invoke Skill("${row.skill}"), finish the task, then close this same possession` : "NEXT · finish the task unaided, then close this same possession";
      return `PENDING · ${row.difficulty.toUpperCase()} · ${row.action.toUpperCase()} · ${friendlyRouteLabel(row.route).toUpperCase()} · ${row.taskClass} · ${ageMinutes}m ago${skill}
${next}
CLOSE · muscle_memory_close possession_id="${row.possessionId}"`;
    }).join(`

`);
  };
  const renderRosterReport = (ctx, compact = false) => {
    const managedRows = curateManagedSkills(ctx);
    const managed = new Map(managedRows.map((row) => [row.name, row]));
    const events = loadPossessionEvents();
    const outcomes = new Map;
    for (const event of events)
      if (event.type === "outcome")
        outcomes.set(event.possession_id, event);
    const stats = new Map;
    for (const event of events) {
      if (event.type !== "decision" || event.action !== "prescribe" || !event.skill || !isInstalledSkill(event.skill, ctx))
        continue;
      const row = stats.get(event.skill) || { helped: 0, harmed: 0, neutral: 0, judged: 0, verified: 0 };
      const outcome = outcomes.get(event.possession_id);
      if (outcome?.result === "helped")
        row.helped++;
      else if (outcome?.result === "harmed")
        row.harmed++;
      else if (outcome?.result === "neutral")
        row.neutral++;
      if (outcome?.evidence_tier === "verified" && outcome.result === "helped" && event.verification && outcome.verification && claimBearingVerdict(event, outcome).verified)
        row.verified++;
      else if (outcome?.evidence_tier === "agent_judged" || outcome?.evidence_tier === "human_judged")
        row.judged++;
      stats.set(event.skill, row);
    }
    const field = loadPlusMinus();
    const allNames = [...new Set([...managed.keys(), ...stats.keys()])].sort((a, b) => {
      const ar = stats.get(a);
      const br = stats.get(b);
      const at = ar ? ar.helped + ar.harmed + ar.neutral : 0;
      const bt = br ? br.helped + br.harmed + br.neutral : 0;
      return bt - at || a.localeCompare(b);
    });
    const hasSignal = (name) => {
      const row = stats.get(name);
      const possessionTotal = row ? row.helped + row.harmed + row.neutral : 0;
      const fieldTotal = field[name] ? field[name].plus + field[name].minus : 0;
      return possessionTotal > 0 || fieldTotal > 0 || (managed.get(name)?.uses || 0) > 0;
    };
    const names = compact ? allNames.filter(hasSignal) : allNames;
    const hidden = allNames.length - names.length;
    if (!names.length)
      return compact ? `(no observed skill outcomes yet · ${hidden} skill${hidden === 1 ? "" : "s"} with no possessions or field ratings hidden)` : "NONE YET · skills appear here once work is observed";
    const lines = names.map((name) => {
      const managedRow = managed.get(name);
      const possession = stats.get(name) || { helped: 0, harmed: 0, neutral: 0, judged: 0, verified: 0 };
      const score = field[name];
      const net = score ? score.plus - score.minus : 0;
      const sample = score ? score.plus + score.minus : 0;
      const fieldLine = score ? `field ${score.plus} helped / ${score.minus} missed · ${sample} rated` : "field unrated (n=0)";
      const possessionLine = `possessions ${possession.helped} helped / ${possession.harmed} harmed / ${possession.neutral} neutral`;
      const evidenceLine = `evidence ${possession.judged} judged / ${possession.verified} verified`;
      const verdict = sample >= 3 && net >= 2 ? "PROMOTION REVIEW" : sample >= 3 && net <= -2 ? "RETIREMENT REVIEW" : possession.harmed > 0 ? "REVIEW · HARM OBSERVED" : possession.helped > 0 ? "EARLY POSITIVE · NEEDS REPLICATION" : sample >= 2 ? "REVIEW · MIXED OUTCOMES" : possession.neutral > 0 ? "HOLD · NEUTRAL OBSERVED" : (managedRow?.uses || 0) === 0 && sample === 0 ? "UNPROVEN · NEEDS OUTCOMES" : "HOLD · INSUFFICIENT EVIDENCE";
      const reason = managedRow?.reason || "prescribed from the installed shelf; possession history is now traceable";
      return `${verdict} · ${name} · ${possessionLine} · ${evidenceLine} · ${fieldLine} — ${reason}`;
    });
    const compactNote = compact && hidden > 0 ? `
skills with no possessions or field ratings yet hidden: ${hidden} · full rotation remains available through /muscle-memory roster` : "";
    return `MUSCLE MEMORY · SKILL REVIEW
${lines.join(`
`)}${compactNote}

minimum 3 rated tasks before promotion or retirement advice · possession evidence and field ratings stay separate · no automatic lifecycle changes`;
  };
  const renderRatingReceipt = (res) => {
    const observed = res.ratingKind === "up" ? "helped" : res.ratingKind === "down" ? "missed" : "neutral";
    const sample = res.rating.plus + res.rating.minus;
    const heading = res.partial ? "RATING PARTIAL" : "RATING RECORDED";
    return `${heading} · ${res.skill} · ${observed}
OUTCOMES · ${res.rating.plus} helped · ${res.rating.minus} missed · ${sample} rated
STATUS · ${res.reason}`;
  };
  refreshDefenses();
  const semanticFnFor = (agentId) => (q, k) => semanticSkillCandidates(letta.client, agentId, q, k);
  if (typeof letta.permissions?.register === "function") {
    disposers.push(letta.permissions.register({
      id: "muscle-memory-guard",
      description: "Ask/deny before a tool that recurs into a learned, unrecovered failure (set MM_GUARD=ask|deny).",
      check: (event) => {
        try {
          const mode = process.env.MM_GUARD === "deny" ? "deny" : process.env.MM_GUARD === "ask" ? "ask" : "off";
          if (mode === "off" || event?.phase !== "approval")
            return;
          const d = guardDecision(String(event?.toolName ?? ""), event?.args ?? {}, defensesCache, mode);
          return d ? { decision: d.decision, reason: d.reason } : undefined;
        } catch {
          return;
        }
      }
    }));
  }
  if (letta.capabilities?.events?.tools) {
    const stepByCallId = new Map;
    const coachedOnce = new Set;
    disposers.push(letta.events.on("tool_start", (event) => {
      try {
        const tool = String(event?.toolName ?? "");
        if (!tool)
          return;
        const { fp, tmpl } = fingerprint2(tool, event?.args ?? {});
        const callId = String(event?.toolCallId ?? "");
        if (callId) {
          stepByCallId.set(callId, { tool, fp, tmpl });
          if (stepByCallId.size > 256) {
            const first = stepByCallId.keys().next().value;
            if (first !== undefined)
              stepByCallId.delete(first);
          }
        }
        const cap = process.env.MM_CAPTURE;
        const fix = cap === "worked" && (tool === "Edit" || tool === "Write" || tool === "fast_apply") ? buildDiffFragment(event?.args ?? {}) : undefined;
        appendJsonl(LOG_PATH, { ts: Date.now(), conv: event?.conversationId ?? null, agent: event?.agentId ?? null, tool, fp, tmpl, h: hash(fp), id: event?.toolCallId ?? null, ...fix ? { fix } : {} });
        if (tool === "Skill" && typeof event?.args?.skill === "string")
          bumpUsage(slug(String(event.args.skill)));
        observeToolStart(event);
        if (defensesCache.length) {
          const hit = preActionDefense(stepSig({ tool, fp, tmpl }), defensesCache);
          if (hit && hit.severity >= 2)
            appendJsonl(DEFENSE_HITS, { ts: Date.now(), conv: event?.conversationId ?? null, step: hit.trigger, kind: hit.kind, errClass: hit.errClass, defense: hit.defense, severity: hit.severity });
        }
      } catch {}
      return;
    }));
    try {
      disposers.push(letta.events.on("tool_end", (event) => {
        let coached = null;
        try {
          const status = String(event?.status ?? "");
          const ok = status ? status === "success" : event?.ok ?? !(event?.isError || event?.error);
          const outText = String(event?.output ?? event?.resultText ?? event?.error ?? "");
          const err = ok ? null : classifyError(outText, false);
          const cap = process.env.MM_CAPTURE;
          const errMsg = !ok && (cap === "context" || cap === "worked") ? redactFragment(outText, 8, 320) : undefined;
          try {
            const open = loadPossessionEvents();
            const closed = new Set(open.filter((row) => row.type === "outcome").map((row) => row.possession_id));
            observeToolEnd(event, open.filter((row) => row.type === "decision" && row.action === "prescribe" && !closed.has(row.possession_id)).map((row) => ({ possession_id: row.possession_id, event_id: row.event_id, skill: row.skill })));
          } catch {}
          appendJsonl(OUTCOME_PATH, { ts: Date.now(), id: event?.toolCallId ?? null, tool: event?.toolName ?? null, conv: event?.conversationId ?? null, ok, err, ...errMsg ? { errMsg } : {} });
          if (process.env.MM_REFLEX === "on" && !ok && defensesCache.length) {
            const step = stepByCallId.get(String(event?.toolCallId ?? ""));
            const c = step ? coachOnFailure(step, outText, defensesCache) : null;
            const onceKey = c ? `${event?.conversationId ?? "?"}::${c.hit.trigger}` : "";
            if (c && !coachedOnce.has(onceKey)) {
              coachedOnce.add(onceKey);
              appendJsonl(DEFENSE_HITS, { ts: Date.now(), conv: event?.conversationId ?? null, step: c.hit.trigger, kind: c.hit.kind, errClass: c.hit.errClass, defense: c.hit.defense, severity: c.hit.severity, surfaced: true });
              appendUiEvent({ phase: "reflex_coached", summary: `\uD83E\uDDE0 reflex: surfaced known fix for '${c.hit.trigger.slice(0, 60)}'` });
              coached = { status: status || "error", output: outText + c.reminder };
            }
          }
        } catch {}
        return coached ? { result: coached } : undefined;
      }));
    } catch {}
  }
  if (letta.capabilities?.events?.llm) {
    const spanByConv = new Map;
    disposers.push(letta.events.on("llm_start", (event) => {
      try {
        spanByConv.set(String(event?.conversationId ?? "?"), Date.now());
      } catch {}
    }));
    disposers.push(letta.events.on("llm_end", (event) => {
      try {
        const started = spanByConv.get(String(event?.conversationId ?? "?")) ?? Date.now();
        const span2 = { tokensIn: event?.usage?.promptTokens ?? event?.tokensIn, tokensOut: event?.usage?.completionTokens ?? event?.tokensOut, ms: Date.now() - started, stop: event?.stopReason };
        let t = {};
        try {
          if (existsSync12(TELEMETRY_PATH))
            t = JSON.parse(readFileSync12(TELEMETRY_PATH, "utf8"));
        } catch {}
        const agg = aggregateTelemetry([span2]);
        t.calls = (t.calls || 0) + agg.calls;
        t.tokensIn = (t.tokensIn || 0) + agg.tokensIn;
        t.tokensOut = (t.tokensOut || 0) + agg.tokensOut;
        t.ms = (t.ms || 0) + agg.ms;
        try {
          ensureDir();
          writeFileSync10(TELEMETRY_PATH, JSON.stringify(t));
        } catch {}
      } catch {}
    }));
  }
  if (letta.capabilities?.events?.compact) {
    let compactReflectInFlight = false;
    disposers.push(letta.events.on("compact_start", (event, ctx) => {
      try {
        ensureDir();
        mkdirSync10(RECEIPTS_DIR, { recursive: true });
        const { candidates } = detect(loadExperience());
        writeFileSync10(join14(RECEIPTS_DIR, `compact-${Date.now()}.json`), JSON.stringify({ phase: "start", conv: event?.conversationId ?? null, trigger: event?.trigger ?? null, candidatesPreserved: candidates.length, ts: Date.now() }));
      } catch {}
      const rfMode = process.env.MM_REFLECT;
      if (rfMode !== "staged" && rfMode !== "auto" || compactReflectInFlight)
        return;
      compactReflectInFlight = true;
      appendUiEvent({ phase: "compact_reflect_started", summary: "compaction boundary → reflective review started before context eviction" });
      runReflectiveReview(ctx ?? { agentId: event?.agentId }, { mode: rfMode, semanticFn: semanticFnFor(event?.agentId ?? ctx?.agent?.id) }).then(() => {
        try {
          panel?.update();
        } catch {}
      }).catch(() => {}).finally(() => {
        compactReflectInFlight = false;
      });
    }));
    disposers.push(letta.events.on("compact_end", (event) => {
      try {
        ensureDir();
        mkdirSync10(RECEIPTS_DIR, { recursive: true });
        writeFileSync10(join14(RECEIPTS_DIR, `compact-end-${Date.now()}.json`), JSON.stringify({ phase: "end", conv: event?.conversationId ?? null, trigger: event?.trigger ?? null, messagesBefore: event?.messagesBefore ?? null, messagesAfter: event?.messagesAfter ?? null, contextTokensBefore: event?.contextTokensBefore ?? null, contextTokensAfter: event?.contextTokensAfter ?? null, ts: Date.now() }));
      } catch {}
    }));
  }
  if (letta.capabilities?.events?.lifecycle) {
    disposers.push(letta.events.on("conversation_close", (event, ctx) => {
      appendJsonl(SESSIONS_PATH, { ts: Date.now(), conv: event?.conversationId ?? null, agent: event?.agentId ?? null, reason: event?.reason ?? null, toolCalls: event?.toolCallCount ?? null, messages: event?.messageCount ?? null, durationMs: event?.durationMs ?? null });
      refreshDefenses();
      if (nativeEnabled("blocks") || nativeEnabled("passages")) {
        try {
          const managed = managedView(scanDirs(ctx ?? {})).map((m) => ({ name: m.name, description: m.description }));
          if (nativeEnabled("blocks"))
            syncNeocortexBlock(letta.client, event?.agentId ?? null, buildNeocortexBlock(managed));
          if (nativeEnabled("passages"))
            syncSkillPassages(letta.client, event?.agentId ?? null, managed);
        } catch {}
      }
      const apMode = process.env.MM_AUTOPILOT;
      if (apMode === "staged" || apMode === "auto") {
        runAutopilot(ctx ?? { agentId: event?.agentId }, { ...AUTOPILOT_DEFAULT, mode: apMode }).catch(() => {});
      }
      const rfMode = process.env.MM_REFLECT;
      if (rfMode === "staged" || rfMode === "auto") {
        runReflectiveReview(ctx ?? { agentId: event?.agentId }, { mode: rfMode, semanticFn: semanticFnFor(event?.agentId ?? ctx?.agent?.id) }).then(() => {
          autoPruneIfEnabled(ctx ?? { agentId: event?.agentId });
          try {
            panel?.update();
          } catch {}
        }).catch(() => {});
      }
    }));
  }
  if (letta.capabilities?.events?.turns) {
    let autoReflectInFlight = false;
    disposers.push(letta.events.on("turn_end", (event, ctx) => {
      const rfMode = process.env.MM_REFLECT;
      if (rfMode !== "staged" && rfMode !== "auto" || autoReflectInFlight)
        return;
      try {
        const ev = buildCrossConversationEvidence(loadExperience());
        if (ev.items < 2 || loadHandledReflects()[reflectSignature(ev)])
          return;
      } catch {
        return;
      }
      autoReflectInFlight = true;
      runReflectiveReview(ctx ?? { agentId: event?.agentId }, { mode: rfMode, semanticFn: semanticFnFor(event?.agentId ?? ctx?.agent?.id) }).then(() => {
        autoPruneIfEnabled(ctx ?? { agentId: event?.agentId });
        try {
          panel?.update();
        } catch {}
      }).catch(() => {}).finally(() => {
        autoReflectInFlight = false;
      });
    }));
  }
  if (letta.capabilities?.ui?.panels && letta.ui?.openPanel) {
    try {
      panel = letta.ui.openPanel({
        id: "muscle-memory-live",
        order: 20,
        render: (renderCtx = {}) => {
          try {
            return renderMuscleMemoryPanel({
              ...readUiState(),
              roster: renderRosterSnapshot(renderCtx),
              field: loadPlusMinus()
            });
          } catch {
            return [];
          }
        }
      });
      setLivePanel(panel);
      try {
        const s = readUiState();
        if (["reviewing", "routing", "writing", "shaping", "checking", "saving", "testing", "earned", "learned", "updated", "rotation", "benched", "done"].includes(String(s?.phase || ""))) {
          writeUiState({ phase: "idle", last: "", skill: "", route: "" });
        }
      } catch {}
      const t = setInterval(() => {
        try {
          panel?.update();
        } catch {}
      }, 5000);
      disposers.push(() => {
        clearInterval(t);
        try {
          panel?.close();
        } catch {}
      });
    } catch {}
  }
  if (letta.capabilities?.commands) {
    disposers.push(letta.commands.register({
      id: "muscle-memory",
      description: "Show the Muscle Memory Decision Report or inspect learning details",
      async run(ctx = {}) {
        const argv = Array.isArray(ctx?.argv) ? ctx.argv : String(ctx?.args || "").trim().split(/\s+/).filter(Boolean);
        const sub = String(argv?.[0] || "").toLowerCase();
        if (!sub || sub === "report" || sub === "boxscore") {
          const summary = summarizePossessionLedger();
          return { type: "output", output: renderDecisionReport(summary, ctx) };
        }
        if (sub === "instrument") {
          const action = String(argv?.[1] || "").trim();
          if (action && action !== "init")
            return { type: "output", output: `unknown instrument action '${action}' — try: /muscle-memory instrument init` };
          try {
            const { created, keyId, keyPath } = initInstrumentKey({ stateDir: STATE_DIR });
            return { type: "output", output: created ? `\uD83D\uDD11 instrument key created · id ${keyId} · ${keyPath}
Verified evidence is now reachable. The key itself is never printed or logged.` : `\uD83D\uDD11 instrument key already present · id ${keyId} · ${keyPath}` };
          } catch (error) {
            return { type: "output", output: `\uD83D\uDEAB instrument init refused — ${error instanceof Error ? error.message : String(error)}` };
          }
        }
        if (sub === "pending") {
          return { type: "output", output: renderPendingPossessions() };
        }
        if (sub === "share") {
          const summary = summarizePossessionLedger();
          return { type: "output", output: JSON.stringify(buildShareCardPayload(summary, { period: "All time" }), null, 2) };
        }
        if (sub === "events") {
          const n = Math.max(1, Math.min(50, Number(argv?.[1] || 8) || 8));
          const events2 = loadUiEvents(n);
          const lines = events2.map((e) => `\uD83D\uDCBE muscle-memory review: ${e.summary}`);
          return { type: "output", output: lines.join(`
`) || "NONE YET · review events appear after a possession closes" };
        }
        if (sub === "wins") {
          return { type: "output", output: renderWins(collectWins()) };
        }
        if (sub === "squad") {
          const feed = loadMeshFeed(10);
          return { type: "output", output: feed.length ? `\uD83D\uDCBE squad distillations (cross-agent):
` + renderMeshFeed(feed).map((l) => `  ${l}`).join(`
`) : "(no squad distillations yet — other agents sharing this feed appear here as they distill)" };
        }
        if (sub === "prescribe") {
          const hasGap = String(argv?.[1] || "").toLowerCase() === "--gap";
          const task = argv.slice(hasGap ? 2 : 1).join(" ").trim();
          return { type: "output", output: prescribeForTask(task, hasGap, ctx) };
        }
        if (sub === "ratings" || sub === "scoreboard") {
          return { type: "output", output: `FIELD RATINGS · next-task outcomes
${renderPlusMinus(loadPlusMinus())}` };
        }
        if (sub === "roster") {
          return { type: "output", output: renderRosterReport(ctx) };
        }
        if (sub === "staged") {
          let s = [];
          try {
            s = existsSync12(STAGED_DIR) ? readdirSync4(STAGED_DIR).filter((n) => existsSync12(join14(STAGED_DIR, n, "SKILL.md"))) : [];
          } catch {}
          return { type: "output", output: s.length ? `staged skills (1-tap to graduate):
` + s.map((n) => `  · ${n}`).join(`
`) : "(no staged skills yet — set MM_REFLECT=staged, work a few sessions)" };
        }
        if (sub === "coverage") {
          const cov2 = coverageMap(loadExperience(), scanDirs(ctx));
          const icon = (st) => st === "covered" ? "✓" : st === "uncovered" ? "＋" : st === "over-covered" ? "⧉" : "✗";
          return { type: "output", output: cov2.length ? cov2.map((c) => `${icon(c.status)} [${c.status}] ${c.domain}${c.skill ? ` → ${c.skill}` : ""}`).join(`
`) : "NONE YET · task-classes appear once a pattern repeats" };
        }
        if (sub === "audit") {
          const dirs = scanDirs(ctx);
          const entries = [];
          for (const d of dirs) {
            const shelf = d === globalSkillsDir() ? "global" : "agent";
            for (const n of listSkillNames(d)) {
              try {
                entries.push({ name: n, shelf, body: readSkill(d, n), description: skillDesc(d, n) });
              } catch {}
            }
          }
          const seen = new Set;
          const skills = [];
          for (const e of entries) {
            if (seen.has(e.name))
              continue;
            seen.add(e.name);
            skills.push({ name: e.name, description: e.description, body: e.body });
          }
          const r = auditSkills(skills);
          const dups = crossShelfDuplicates(entries).filter((x) => x.divergent);
          const pct2 = r.total ? Math.round(100 * r.clean / r.total) : 0;
          const gapline = Object.entries(r.gapCounts).sort((a, b) => b[1] - a[1]).map(([g, c]) => `${g} ×${c}`).join("  ") || "—";
          const top = r.flagged.slice(0, 20).map((f) => `  ⚠ ${f.name.slice(0, 46).padEnd(48)} ${f.gaps.map((g) => g.split(":")[0]).join(", ")}`).join(`
`);
          const dupline = dups.length ? `
⧉ cross-shelf duplicates (consolidate — stale copy diverging): ${dups.map((x) => `${x.name} [${x.shelves.join("+")}]`).join(", ")}` : "";
          return { type: "output", output: `\uD83C\uDFC5 SOTA library audit — ${r.total} skills · ${r.clean} top-tier (${pct2}%) · ${r.flagged.length} to upgrade${dups.length ? ` · ${dups.length} dup` : ""}
gaps: ${gapline}
${top}${r.flagged.length > 20 ? `
  …and ${r.flagged.length - 20} more` : ""}${dupline}` };
        }
        if (sub === "publish") {
          const v1 = String(argv?.[1] || "").toLowerCase();
          const action = v1 === "stage" || v1 === "approve" ? v1 : "preflight";
          const target = String((action === "preflight" ? argv?.[1] : argv?.[2]) || "").trim();
          if (!target)
            return { type: "output", output: "usage: /muscle-memory publish <skill> | publish stage <skill> | publish approve <skill>  (never auto-publishes)" };
          const dirs = scanDirs(ctx);
          let found = null;
          for (const d of dirs)
            for (const n of listSkillNames(d))
              if (n.toLowerCase() === target.toLowerCase()) {
                found = { dir: d, name: n };
                break;
              }
          if (action === "approve") {
            const res = approveStagedPublish(target, globalSkillsDir());
            if (!res.published)
              return { type: "output", output: `\uD83D\uDEAB not published — ${res.reason}` };
            try {
              appendUiEvent({ phase: "skill_published", summary: `published '${target}' to Custom Skills`, skill: target, action: "publish" });
              appendMeshFeed({ type: "skill_published", skill: target, route: "PUBLISH", signals: 0 });
            } catch {}
            const vis = publishVisibilityReceipt(target, globalSkillsDir());
            const live = liveSkillVisible(slug(target), ctx?.agent?.id || ctx?.agentId);
            return { type: "output", output: `✅ published — ${res.path}
  on disk: ${vis.exists ? "yes ✓" : "NO ❌"}
  live index: ${live.checked ? live.visible ? "✓ visible to the agent now" : "not loaded yet" : "not queried"}  ·  ${live.note}` };
          }
          if (!found)
            return { type: "output", output: `skill "${target}" not found (try /muscle-memory audit to list)` };
          const skill = { name: found.name, description: skillDesc(found.dir, found.name), body: readSkill(found.dir, found.name), shelf: "agent" };
          const plan = publishPlan(skill);
          const tier = publishTier(plan);
          const existing = listSkillNames(globalSkillsDir()).filter((n) => n !== found.name).map((n) => ({ name: n, description: skillDesc(globalSkillsDir(), n) }));
          const dups = findSimilarSkills(found.name, skill.description, existing);
          if (action === "stage") {
            const st = stageSanitizedPublish(skill);
            if (!st.staged)
              return { type: "output", output: `\uD83D\uDEAB not staged — ${st.reason}` };
            try {
              appendUiEvent({ phase: "skill_publish_staged", summary: `staged '${found.name}' (tier=${st.tier}, ${plan.publishability}/100)`, skill: found.name, action: "stage" });
            } catch {}
            const dupline2 = dups.length ? `
⚠ similar Custom Skills: ${dups.map((d) => `${d.name} (${d.why})`).join("; ")}` : "";
            return { type: "output", output: `\uD83D\uDCE6 staged SANITIZED publish — ${found.name}
  ${st.dir}/SKILL.md  +  PUBLISH-PLAN.json
  tier: ${st.tier}  ·  publishability ${plan.publishability}/100${dupline2}
  next: review the sanitized SKILL.md, then \`/muscle-memory publish approve ${found.name}\`` };
          }
          try {
            appendUiEvent({ phase: "skill_publish_preflight", summary: `${plan.skill}: ${plan.publishability}/100 · tier=${tier} · ${plan.recommended}`, skill: found.name });
          } catch {}
          const blocks = plan.hardBlocks.length ? `
\uD83D\uDEAB HARD BLOCKS (never publish): ${plan.hardBlocks.join("; ")}` : "";
          const issues = plan.issues.length ? plan.issues.map((i) => `  - [${i.axis}] ${i.detail}`).join(`
`) : "  (none)";
          const reps = plan.replacements.length ? `
sanitize: ${plan.replacements.map((r) => `${r.from.slice(0, 22)} → ${r.to}`).join(", ")}` : "";
          const dupline = dups.length ? `
⚠ similar Custom Skills (consider merge/update): ${dups.map((d) => d.name).join(", ")}` : "";
          const act = plan.recommended === "publish" ? "✅ publish as-is (clean)" : plan.recommended === "stage-sanitized" ? "\uD83D\uDCE6 stage SANITIZED (run `publish stage`)" : "\uD83D\uDEAB block";
          return { type: "output", output: `\uD83D\uDEA2 publish preflight — ${plan.skill}
  ${plan.currentShelf} → ${plan.recommendedShelf}  ·  tier: ${tier}  ·  publishability ${plan.publishability}/100  ·  ${act}${blocks}
issues:
${issues}${reps}${dupline}
(dry-run — nothing published.)` };
        }
        if (sub === "mine") {
          const agentId = String(argv?.[1] || ctx?.agent?.id || ctx?.agentId || "").trim();
          if (!agentId)
            return { type: "output", output: "usage: /muscle-memory mine [agent-id]  (defaults to the current agent)" };
          const batch = await mineAgentHistory(letta.client, agentId);
          const chains = detectRepairChains(loadExperience());
          return { type: "output", output: `⛏️ mined ${batch.scanned} messages → ${batch.rows} steps + ${batch.outcomes} outcomes (watermark ${batch.newestId ? "advanced" : "unchanged"})
  repair chains in experience now: ${chains.length}` };
        }
        if (sub === "shelf") {
          const v1 = String(argv?.[1] || "").toLowerCase();
          const agentId = String(ctx?.agent?.id || ctx?.agentId || "");
          if (v1 === "publish") {
            const target = String(argv?.[2] || "").trim();
            if (!target)
              return { type: "output", output: "usage: /muscle-memory shelf publish <skill>  (publishes the SANITIZED staged copy — run `publish stage <skill>` first)" };
            const stagedPath = join14(STATE_DIR, "publish-staged", slug(target), "SKILL.md");
            if (!existsSync12(stagedPath))
              return { type: "output", output: `\uD83D\uDEAB no sanitized staged copy for '${target}' — run \`/muscle-memory publish stage ${target}\` first (the shelf only ever receives sanitized content)` };
            const archiveId = await ensureSquadArchive(letta.client);
            if (!archiveId)
              return { type: "output", output: "\uD83D\uDEAB could not ensure the squad shelf archive (client lacks the archives surface?)" };
            const res = await publishSkillToShelf(letta.client, archiveId, slug(target), readFileSync12(stagedPath, "utf8"), String(process.env.MM_AGENT || "agent"));
            return { type: "output", output: res.ok ? `\uD83D\uDCE1 shelf-published '${target}' → ${SQUAD_ARCHIVE_NAME} (${archiveId})
  squad agents: attach once, then \`/muscle-memory shelf pull ${target}\`` : `\uD83D\uDEAB shelf publish failed — ${res.reason}` };
          }
          if (v1 === "attach") {
            const archiveId = await ensureSquadArchive(letta.client);
            if (!archiveId || !agentId)
              return { type: "output", output: "\uD83D\uDEAB shelf attach needs an agent context + archives surface" };
            const ok = await attachSquadShelf(letta.client, agentId, archiveId);
            return { type: "output", output: ok ? `\uD83D\uDD17 squad shelf attached (${SQUAD_ARCHIVE_NAME} → this agent)` : "\uD83D\uDEAB attach failed" };
          }
          if (v1 === "pull") {
            const target = String(argv?.[2] || "").trim();
            if (!target)
              return { type: "output", output: "usage: /muscle-memory shelf pull <skill>" };
            const res = await pullShelfSkill(letta.client, agentId, slug(target));
            return { type: "output", output: res.ok ? `\uD83D\uDCE5 pulled '${target}' from ${res.publisher ?? "?"} → STAGED (review before promotion):
  ${res.stagedPath}` : `\uD83D\uDEAB pull failed — ${res.reason}` };
          }
          return { type: "output", output: "usage: /muscle-memory shelf publish <skill> | shelf attach | shelf pull <skill>  (pull-only + staged-first by design)" };
        }
        if (sub === "rate") {
          const target = String(argv?.[1] || "").trim();
          const dir = String(argv?.[2] || "").toLowerCase();
          const reason = (argv?.slice(3).join(" ") || "").trim();
          if (!target || dir !== "up" && dir !== "down" && dir !== "no_rate")
            return { type: "output", output: "usage: /muscle-memory rate <skill> up|down|no_rate [reason...]   (reason required for down/no_rate)" };
          const skill = slug(target);
          if (!isInstalledSkill(skill, ctx))
            return { type: "output", output: `\uD83D\uDEAB not recorded — skill '${skill}' is not installed on this agent` };
          const res = await rateSkill(letta.client, skill, dir, null, {
            reason,
            rater: process.env.MM_AGENT ?? "user",
            source: "manual",
            model: modelIdentity(ctx?.model),
            provider: providerIdentity(ctx?.model)
          });
          if (!res.recorded)
            return { type: "output", output: `\uD83D\uDEAB not recorded — ${res.reason}` };
          return { type: "output", output: `${renderRatingReceipt(res)}

FIELD RATINGS · next-task outcomes
${renderPlusMinus(loadPlusMinus())}` };
        }
        if (sub === "engram") {
          const dirs = scanDirs(ctx);
          const plan = engramConsolidate(loadExperience(), managedView(dirs).map((m) => ({ name: m.name, body: m.body })));
          const head = `\uD83E\uDDE0 ENGRAM (CLS loop) · hippocampus ${plan.hippoSize} reps · ${plan.replay.length} replay · ${plan.rescued.length} rescued · ${plan.labile.length} labile`;
          return { type: "output", output: `${head}

${plan.digest}` };
        }
        if (sub === "lifecycle" || sub === "skills") {
          const dirs = scanDirs(ctx);
          const reg = buildRegistry(dirs);
          let staged2 = [];
          try {
            staged2 = existsSync12(STAGED_DIR) ? readdirSync4(STAGED_DIR).filter((n) => existsSync12(join14(STAGED_DIR, n, "SKILL.md"))) : [];
          } catch {}
          const used = reg.skills.filter((s) => s.uses > 0);
          const idle = reg.skills.filter((s) => s.uses === 0 && s.state !== "archived");
          const archived = reg.skills.filter((s) => s.state === "archived");
          const field = loadPlusMinus();
          const fieldScore = (name) => {
            const row = field[name];
            if (!row)
              return "";
            return ` · outcomes ${row.plus} helped / ${row.minus} missed`;
          };
          const distribution = (name) => existsSync12(join14(globalSkillsDir(), name, "SKILL.md")) ? " · \uD83D\uDCE1 catalog" : "";
          const L = ["\uD83D\uDCBE muscle-memory · skill lifecycle (creation → use → prune)"];
          L.push(`
\uD83C\uDF31 staged · 1-tap to graduate (${staged2.length})`);
          staged2.slice(0, 8).forEach((n) => L.push(`   · ${n}`));
          L.push(`
✅ active · earning context (${used.length})`);
          used.slice(0, 10).forEach((s) => L.push(`   · ${s.name} — ${s.uses} uses${fieldScore(s.name)}${distribution(s.name)}${s.pinned ? " \uD83D\uDCCC" : ""}`));
          L.push(`
\uD83D\uDCA4 idle · prune candidates (${idle.length})`);
          idle.slice(0, 10).forEach((s) => L.push(`   · ${s.name}${fieldScore(s.name)}${distribution(s.name)}${s.pinned ? " \uD83D\uDCCC pinned (protected)" : " — retires after 30d unused (reversible)"}`));
          if (archived.length) {
            L.push(`
\uD83D\uDDC4 retired · reversible quarantine (${archived.length})`);
            archived.slice(0, 6).forEach((s) => L.push(`   · ${s.name}${fieldScore(s.name)}${distribution(s.name)}${s.absorbedInto ? ` → absorbed into ${s.absorbedInto}` : ""}`));
          }
          return { type: "output", output: L.join(`
`) };
        }
        if (sub !== "filmroom") {
          return {
            type: "output",
            output: [
              "usage: /muscle-memory                → Decision Report (home)",
              "       /muscle-memory pending        → resume open possessions",
              "       /muscle-memory prescribe --gap <task>",
              "       /muscle-memory roster|wins|ratings|lifecycle|staged",
              "       /muscle-memory coverage|audit|engram → tape / coverage / candidates (debug)",
              "loop:  muscle_memory_prescribe → Skill(exact name) → muscle_memory_close → /muscle-memory"
            ].join(`
`)
          };
        }
        const rows = loadExperience();
        const byTool = {};
        for (const r of rows)
          byTool[r.tool] = (byTool[r.tool] || 0) + 1;
        const { candidates, templates, sequences } = detect(rows);
        const toolLine = Object.entries(byTool).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join("  ");
        const cand = candidates.slice(0, 6).map((c) => `  [${c.maturity}] ${c.kind} ×${c.count}/${c.convs}conv${c.fixes ? ` (${c.fixes} fixes)` : ""}  ${c.key.slice(0, 90)}`).join(`
`);
        const mode = process.env.MM_REFLECT === "auto" ? "auto" : process.env.MM_REFLECT === "staged" ? "staged" : "off (set MM_REFLECT=staged to enable)";
        const events = loadUiEvents(8);
        const lastReview = events.length ? summarizeReflectActions(events) : "NONE YET · review appears once a skill has rated possessions";
        let managed = 0, staged = 0;
        try {
          for (const d of scanDirs(ctx))
            for (const n of listSkillNames(d))
              if (isManaged(d, n))
                managed++;
        } catch {}
        try {
          staged = existsSync12(STAGED_DIR) ? readdirSync4(STAGED_DIR).filter((n) => existsSync12(join14(STAGED_DIR, n, "SKILL.md"))).length : 0;
        } catch {}
        const cov = (() => {
          try {
            const c = coverageMap(rows, scanDirs(ctx));
            return `${c.filter((x) => x.status === "covered").length} covered / ${c.filter((x) => x.status === "uncovered").length} uncovered / ${c.filter((x) => x.status === "over-covered").length} over-covered`;
          } catch {
            return "n/a";
          }
        })();
        const out = [
          `\uD83D\uDCBE muscle-memory · filmroom · reflect ${mode}`,
          `last review: ${lastReview}`,
          `library: ${managed} managed · ${staged} staged · coverage ${cov}`,
          ``,
          `recent review events:`,
          events.slice(-5).map((e) => `  · ${e.summary}`).join(`
`) || `  (none yet — set MM_REFLECT=staged, work a few sessions)`,
          ...(() => {
            const feed = loadMeshFeed(4);
            return feed.length ? [``, `squad distillations (cross-agent):`, ...renderMeshFeed(feed).map((l) => `  ${l}`)] : [];
          })(),
          ``,
          `${rows.length} reps observed${toolLine ? ` · tools ${toolLine}` : ""}`,
          `mature candidates: ${candidates.length} (${templates.length} templates, ${sequences.length} sequences)`,
          cand || `  (none mature yet — need ≥${MM.MIN_COUNT}× across ≥${MM.MIN_CONVS} conversations)`,
          ``,
          `inspect: wins · ratings · roster · prescribe · lifecycle · coverage · engram · audit`,
          `act: rate · mine · publish · shelf`,
          `home: /muscle-memory  ·  loop: prescribe → Skill → close`
        ].join(`
`);
        return { type: "output", output: out };
      }
    }));
  }
  if (letta.capabilities?.tools) {
    const advancedAgentSurface = /^(1|true|on)$/i.test(String(process.env.MM_ADVANCED || ""));
    const readParams = {
      type: "object",
      properties: {
        action: { type: "string", enum: ["report", "boxscore", "pending_possessions", "share_card", "candidates", "draft", "load", "list", "curate", "roster", "prescribe", "repairs", "antipatterns", "defenses", "defense_hits", "registry", "autopilot_plan", "reflect_plan", "coverage"], description: "read-oriented operation; report is the canonical Decision Report and boxscore remains a legacy alias; prescribe appends one private decision event to the possession ledger" },
        name: { type: "string", description: "skill name — for load" },
        candidate_key: { type: "string", description: "candidate key or substring to draft; defaults to top mature candidate" },
        task: { type: "string", description: "current task/procedure gap — for prescribe; raw task text is never persisted" },
        task_class: { type: "string", description: "optional privacy-safe lowercase task-class slug for possession stats; otherwise a one-way hash label is used" },
        difficulty: { type: "string", enum: ["routine", "standard", "hard", "unknown"], description: "coarse task difficulty stratum for exposure control; use unknown rather than guessing" },
        verification_task_id: { type: "string", description: "optional pre-registered immutable exact-file verification task to bind before the prescribed work begins" },
        gap_observed: { type: "boolean", description: "for prescribe: caller attests a concrete miss or known missing procedure; false means abstain. The router does not infer the model's hidden capability" },
        period: { type: "string", description: "optional allowlisted period label for the private aggregate share payload; caller identity is never accepted" },
        verified_gap: { type: "boolean", description: "deprecated alias for gap_observed" },
        mode: { type: "string", enum: ["staged", "auto"], description: "autopilot mode preview — for autopilot_plan" }
      },
      required: ["action"],
      additionalProperties: false
    };
    const leanReadParams = {
      type: "object",
      properties: {
        action: { type: "string", enum: ["report", "pending_possessions", "roster", "load"], description: "report current evidence, resume one pending possession, review the skill roster, or load one known skill" },
        name: { type: "string", description: "skill name — required only for load" }
      },
      required: ["action"],
      additionalProperties: false
    };
    const prescribeParams = {
      type: "object",
      properties: {
        task: { type: "string", description: "the current procedural miss or known missing procedure; raw task text is never persisted" },
        gap_observed: { type: "boolean", description: "caller attests a concrete miss or known missing procedure; false means abstain. Muscle Memory never infers hidden model capability" }
      },
      required: ["task", "gap_observed"],
      additionalProperties: false
    };
    const writeParams = {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create_from_candidate", "create", "patch", "edit_full", "write_file", "remove_file", "retire", "restore", "pin", "unpin", "autopilot_run", "reflect", "graduate", "catalog_sync"], description: "mutating operation to perform" },
        mode: { type: "string", enum: ["staged", "auto"], description: "autopilot mode — for autopilot_run (staged=draft+1-tap, auto=graduate-on-gate)" },
        name: { type: "string", description: "skill name (gerund, lowercase-hyphen) — for create/patch/retire" },
        description: { type: "string", description: "skill description incl. trigger phrases — for create" },
        body: { type: "string", description: "SKILL.md markdown body — for create" },
        old: { type: "string", description: "exact text to replace — for patch" },
        replacement: { type: "string", description: "replacement text — for patch" },
        candidate_key: { type: "string", description: "candidate key or substring to create from; defaults to top mature candidate" },
        reason: { type: "string", description: "reason for retirement/quarantine — for retire" },
        absorbed_into: { type: "string", description: "umbrella skill name this was merged into — for retire (consolidation vs prune)" },
        file_path: { type: "string", description: "support file path under references/templates/scripts/assets — for write_file/remove_file" },
        file_content: { type: "string", description: "support file content — for write_file" },
        dry_run: { type: "boolean", description: "for catalog_sync: preview without copying" },
        force: { type: "boolean", description: "for catalog_sync: manually replace an existing catalog copy after approval" }
      },
      required: ["action"],
      additionalProperties: false
    };
    const readRun = async (ctx) => {
      const a = ctx?.args || {};
      const dirs = scanDirs(ctx);
      const findSkillDir = (name) => {
        assertSafeSkillName(name);
        return dirs.find((d) => existsSync12(join14(d, name, "SKILL.md")));
      };
      try {
        if (a.action === "report" || a.action === "boxscore") {
          const summary = summarizePossessionLedger();
          return renderDecisionReport(summary, ctx);
        }
        if (a.action === "pending_possessions") {
          return renderPendingPossessions();
        }
        if (a.action === "share_card") {
          const summary = summarizePossessionLedger();
          return JSON.stringify(buildShareCardPayload(summary, { period: String(a.period || "All time") }), null, 2);
        }
        if (a.action === "prescribe") {
          return prescribeForTask(String(a.task || ""), a.gap_observed === true || a.verified_gap === true, ctx, a.task_class ? String(a.task_class) : undefined, a.difficulty ? String(a.difficulty) : "unknown", a.verification_task_id ? String(a.verification_task_id) : undefined);
        }
        if (a.action === "roster") {
          return renderRosterReport(ctx, !advancedAgentSurface);
        }
        if (a.action === "candidates") {
          const rows = loadExperience();
          const { candidates } = detect(rows);
          return candidates.slice(0, 10).map((c) => `[impact ${impactScore(c).score} | mat ${c.maturity}] ${c.kind} ×${c.count}/${c.convs}conv${c.fixes ? ` (${c.fixes}fix)` : ""}  ${c.key}`).join(`
`) || "(no mature candidates yet — keep working)";
        }
        if (a.action === "repairs") {
          const rs = detectRepairChains(loadExperience());
          return rs.slice(0, 10).map((r) => `×${r.count}/${r.convs}conv  FAIL[${r.trigger}] (${r.errClass}) → ${r.fixStep} → PASS`).join(`
`) || "NONE YET · repair chains appear once a failure recurs";
        }
        if (a.action === "antipatterns") {
          const aps = detectAntiPatterns(loadExperience());
          return aps.slice(0, 10).map((p) => `×${p.fails}fails/${p.convs}conv  AVOID[${p.step}] — ${p.errClass}`).join(`
`) || "NONE OBSERVED · no repeated unrecovered failures in the tape";
        }
        if (a.action === "defenses") {
          const ds = buildDefenses(loadExperience());
          return ds.slice(0, 12).map((d) => `[sev${d.severity} ${d.kind}] ${d.trigger} → ${d.errClass} ⇒ ${d.defense}`).join(`
`) || "NONE YET · defenses appear once a failure repeats and is recovered";
        }
        if (a.action === "defense_hits") {
          const hits = [];
          if (existsSync12(DEFENSE_HITS))
            for (const l of readFileSync12(DEFENSE_HITS, "utf8").trim().split(`
`).slice(-20)) {
              if (l)
                try {
                  hits.push(JSON.parse(l));
                } catch {}
            }
          return hits.length ? hits.map((h) => `[sev${h.severity} ${h.kind}] ${h.step} → ${h.errClass} ⇒ ${h.defense}`).join(`
`) : "NONE YET · hits appear when a learned defense fires before an action";
        }
        if (a.action === "registry") {
          const reg = buildRegistry(dirs);
          return reg.count ? `${reg.count} managed skills:
` + reg.skills.map((s) => `- ${s.name}: ${s.description}`).join(`
`) : "(registry empty)";
        }
        if (a.action === "autopilot_plan") {
          const rows = loadExperience();
          const plan = autopilotPlan({ rows, managed: managedView(dirs), dirsForDedup: dirs, config: { ...AUTOPILOT_DEFAULT, mode: a.mode === "auto" ? "auto" : "staged" } });
          const lines = plan.decisions.map((d) => d.op === "distill" ? `  DISTILL ${d.name} [${d.gate}] — ${d.reason}` : d.op === "refine" ? `  REFINE ${d.skill} — ${d.reason}` : `  RETIRE ${d.skill} — ${d.reason}`);
          return `autopilot mode=${plan.mode} budget=${plan.budget.used}/${plan.budget.limit}
${lines.join(`
`) || "  (no decisions)"}
skipped: ${plan.skipped.length}`;
        }
        if (a.action === "reflect_plan") {
          const ev = buildCrossConversationEvidence(loadExperience());
          const reviewDirs = [...new Set([...dirs, STAGED_DIR])];
          const top = searchSkills(reviewDirs, ev.digest, 3);
          const decision = routeSkill(top, [], (name) => reviewDirs.some((dir) => existsSync12(join14(dir, name, "SKILL.md"))), 18);
          const route = decision.route === "update" && decision.target ? `UPDATE-FIRST → "${decision.target.name}" (score ${decision.target.score}, ${decision.target.matched} distinctive terms, dominant)` : decision.route === "park-ambiguous" ? "PARK (ambiguous overlap — refusing autonomous create)" : decision.route === "park-semantic" ? `PARK (possible semantic duplicate of "${decision.suspect}")` : "CREATE (no existing skill safely covers this)";
          return `reflective review preview — ${ev.convs} sessions, ${ev.items} durable signals
routing: ${route}
top matches: ${top.map((t) => `${t.name}(s${t.score}/m${t.matched})`).join(", ") || "none"}

${ev.digest.slice(0, 700)}`;
        }
        if (a.action === "coverage") {
          const cov = coverageMap(loadExperience(), dirs);
          if (!cov.length)
            return "NONE YET · task-classes appear once a pattern repeats";
          const icon = (s) => s === "covered" ? "✓" : s === "uncovered" ? "＋" : s === "over-covered" ? "⧉" : "✗";
          return cov.map((c) => `${icon(c.status)} [${c.status}] ${c.domain}${c.skill ? ` → ${c.skill}` : ""} (${c.signals} signals)`).join(`
`);
        }
        if (a.action === "list") {
          const managed = buildRegistry(dirs).skills;
          return managed.length ? managed.map((skill) => `- ${skill.name}: ${skill.description}`).join(`
`) : "(no muscle-memory-managed skills yet — use muscle_memory_skill_write action:create)";
        }
        if (a.action === "curate") {
          const rows = curateManagedSkills(ctx);
          if (!rows.length)
            return "(no muscle-memory-managed skills yet — create one first)";
          return rows.map((r) => `${r.verdict.toUpperCase()} uses=${r.uses} ${r.name} — ${r.reason}`).join(`
`);
        }
        if (a.action === "load") {
          if (!a.name)
            return { status: "error", content: "name required" };
          const d = findSkillDir(a.name);
          if (!d)
            return { status: "error", content: `no skill '${a.name}'` };
          return readSkill(d, a.name);
        }
        if (a.action === "draft") {
          const c = findCandidate(a.candidate_key);
          if (!c)
            return { status: "error", content: "no matching mature candidate — run action:candidates first or keep working" };
          const repair = repairForCandidate(c);
          const d = draftWithRepair(c, repair);
          const lint = lintSkillDraft(d, { needsPitfalls: !!c.fixes });
          return { candidate: c, ...d, repair: repair ?? null, lint, content: `---
name: ${d.name}
description: ${d.description}
---

${d.body}` };
        }
        return { status: "error", content: "unknown read action" };
      } catch (e) {
        return { status: "error", content: String(e?.message ?? e) };
      }
    };
    const writeRun = async (ctx) => {
      const a = ctx?.args || {};
      const dir = agentSkillsDir(ctx);
      const dirs = scanDirs(ctx);
      const findSkillDir = (name) => {
        assertSafeSkillName(name);
        return dirs.find((d) => existsSync12(join14(d, name, "SKILL.md")));
      };
      try {
        if (a.action === "autopilot_run") {
          const cfg = { ...AUTOPILOT_DEFAULT, mode: a.mode === "auto" ? "auto" : "staged" };
          const r = await runAutopilot(ctx, cfg);
          const res = r.result || { graduated: [], staged: [], refined: [], retired: [] };
          const ledgerWarnings = [
            ...res.graduated.map((name) => recordLifecycle("graduate", slug(name), "autopilot graduated skill after gates")),
            ...res.refined.map((name) => recordLifecycle("update", slug(name), "autopilot refined existing skill after gates")),
            ...res.retired.map((name) => recordLifecycle("retire", slug(name), "autopilot retired skill after evidence gate"))
          ].join("");
          return `autopilot ${cfg.mode}: graduated ${res.graduated.length} ${JSON.stringify(res.graduated)}, staged ${res.staged.length}, refined ${res.refined.length} ${JSON.stringify(res.refined)}, retired ${res.retired.length} ${JSON.stringify(res.retired)}. budget ${r.budget.used + res.graduated.length + res.staged.length}/${r.budget.limit}.${ledgerWarnings}`;
        }
        if (a.action === "reflect") {
          const r = await runReflectiveReview(ctx, { mode: a.mode === "auto" ? "auto" : "staged", semanticFn: semanticFnFor(ctx?.agent?.id) });
          if (r.action === "none" || r.action === "reject")
            return `reflect: ${r.action} — ${r.reason || ""}`;
          const graduated = !!r.wrote && !String(r.wrote).startsWith(STAGED_DIR);
          const ledgerWarning = r.wrote && r.updateTarget ? recordLifecycle("update", slug(r.name), "reflect updated existing skill after evidence review") : graduated ? recordLifecycle("graduate", slug(r.name), "reflect graduated a new skill to the active shelf") : "";
          return `reflect: ${r.action} skill "${r.name}"${r.updateTarget ? ` (updated existing — anti-bloat)` : ""}${graduated ? " (graduated)" : ""} → ${r.wrote || "(write failed)"}${ledgerWarning}`;
        }
        if (a.action === "graduate") {
          if (!a.name)
            return { status: "error", content: "name required" };
          const p = graduateStagedSkill(String(a.name), ctx);
          const ledgerWarning = recordLifecycle("graduate", slug(a.name), "graduated staged skill to active shelf");
          return `graduated '${slug(a.name)}' -> ${p}${ledgerWarning}`;
        }
        if (a.action === "catalog_sync") {
          if (!a.name)
            return { status: "error", content: "name required" };
          const r = syncSkillToDesktopCatalog(String(a.name), ctx, { dryRun: !!a.dry_run, force: !!a.force });
          return r;
        }
        if (a.action === "pin") {
          if (!a.name)
            return { status: "error", content: "name required" };
          setPinned(slug(a.name), true);
          return `pinned '${slug(a.name)}' — protected from auto-retire/consolidation (patches still allowed)`;
        }
        if (a.action === "unpin") {
          if (!a.name)
            return { status: "error", content: "name required" };
          setPinned(slug(a.name), false);
          return `unpinned '${slug(a.name)}'`;
        }
        if (a.action === "retire") {
          if (!a.name)
            return { status: "error", content: "name required" };
          const reason = String(a.reason || "retired by muscle-memory");
          const target = retireManagedSkill(slug(a.name), reason, ctx, a.absorbed_into ? slug(a.absorbed_into) : undefined);
          const ledgerWarning = recordLifecycle("retire", slug(a.name), reason);
          return `Retired '${slug(a.name)}'${a.absorbed_into ? ` (absorbed into ${slug(a.absorbed_into)})` : ""} → ${target} (reversible quarantine)${ledgerWarning}`;
        }
        if (a.action === "create_from_candidate") {
          const c = findCandidate(a.candidate_key);
          if (!c)
            return { status: "error", content: "no matching mature candidate — run muscle_memory_skill_read action:candidates first or keep working" };
          const repair = repairForCandidate(c);
          const d = draftWithRepair(c, repair);
          const nm = slug(a.name || d.name);
          const retiredBlock = retiredSkillBlocker(nm, ctx);
          if (retiredBlock)
            return { status: "error", content: `retire-sticky blocked: ${retiredBlock}`, candidate: c };
          const desc = String(a.description || d.description);
          const dc = dedupCheck(nm, desc, createDedupeSurface(ctx));
          if (dc.dup)
            return { status: "error", content: `anti-bloat blocked: ${dc.reason}. Use action:patch on '${dc.name}' instead.`, candidate: c };
          const lint = lintSkillDraft({ name: nm, description: desc, body: d.body }, { needsPitfalls: !!c.fixes });
          if (!lint.ok)
            return { status: "error", content: `authoring-linter blocked: ${lint.issues.join("; ")}`, candidate: c };
          const secC = scanSkillContent(d.body);
          if (!secC.ok)
            return { status: "error", content: `security blocked: ${secC.issues.join("; ")}`, candidate: c };
          const prov = `
<!-- ${MM_TAG}: distilled ${new Date().toISOString().slice(0, 10)}; candidate=${c.kind}:${c.key}; reps=${c.count}; convs=${c.convs}; fixes=${c.fixes}; impact=${impactScore(c).score} -->
`;
          const content = `---
name: ${nm}
description: ${desc}
---

${d.body}${prov}
`;
          const p = writeSkill(dir, nm, content);
          syncSkillToDesktopCatalog(nm, ctx);
          const ledgerWarning = recordLifecycle("learn", nm, `created from mature candidate ${c.kind}`);
          return `created '${nm}' from candidate '${c.key}'${repair ? ` (w/ observed Pitfall: ${repair.errClass})` : ""} -> ${p}
Load with muscle_memory_skill_read action:load, then invoke the normal Skill tool with skill="${nm}". Dedup max overlap ${Math.round(dc.overlap * 100)}% (${dc.name || "none"}); lint OK.${ledgerWarning}`;
        }
        if (a.action === "create") {
          if (!a.name || !a.description || !a.body)
            return { status: "error", content: "need name, description, body" };
          const nm = slug(a.name);
          const retiredBlock = retiredSkillBlocker(nm, ctx);
          if (retiredBlock)
            return { status: "error", content: `retire-sticky blocked: ${retiredBlock}` };
          const dc = dedupCheck(nm, a.description, createDedupeSurface(ctx));
          if (dc.dup)
            return { status: "error", content: `anti-bloat blocked: ${dc.reason}. Use action:patch on '${dc.name}' instead.` };
          const lint = lintSkillDraft({ name: nm, description: a.description, body: a.body });
          if (!lint.ok)
            return { status: "error", content: `authoring-linter blocked: ${lint.issues.join("; ")}` };
          const sec0 = scanSkillContent(a.body);
          if (!sec0.ok)
            return { status: "error", content: `security blocked: ${sec0.issues.join("; ")}` };
          const prov = `
<!-- ${MM_TAG}: distilled ${new Date().toISOString().slice(0, 10)} -->
`;
          const body = a.body.includes(MM_TAG) ? a.body : a.body + prov;
          const content = `---
name: ${nm}
description: ${a.description}
---

${body}
`;
          const p = writeSkill(dir, nm, content);
          syncSkillToDesktopCatalog(nm, ctx);
          const ledgerWarning = recordLifecycle("learn", nm, "created after authoring and anti-bloat gates");
          return `created '${nm}' -> ${p}
Load with muscle_memory_skill_read action:load, then invoke the normal Skill tool with skill="${nm}" when you want to use it. Dedup max overlap ${Math.round(dc.overlap * 100)}% (${dc.name || "none"}).${ledgerWarning}`;
        }
        if (a.action === "patch") {
          if (!a.name || a.old == null || a.replacement == null)
            return { status: "error", content: "need name, old, replacement" };
          const d = findSkillDir(a.name);
          if (!d)
            return { status: "error", content: `no skill '${a.name}'` };
          const t = readSkill(d, a.name);
          if (!t.includes(a.old))
            return { status: "error", content: "old text not found in skill" };
          const nt = t.replace(a.old, a.replacement);
          const secP = scanSkillContent(nt);
          if (!secP.ok)
            return { status: "error", content: `security blocked: ${secP.issues.join("; ")}` };
          writeSkill(d, a.name, nt);
          syncSkillToDesktopCatalog(String(a.name), ctx);
          const ledgerWarning = recordLifecycle("update", slug(a.name), "patched active skill after review");
          return `patched '${a.name}' in ${d}${ledgerWarning}`;
        }
        if (a.action === "edit_full") {
          if (!a.name || !a.body)
            return { status: "error", content: "need name, body (full SKILL.md)" };
          const d = findSkillDir(a.name);
          if (!d)
            return { status: "error", content: `no skill '${a.name}'` };
          const desc = (a.body.match(/description:\s*(.+)/)?.[1] || a.description || "").trim();
          const lint = lintSkillDraft({ name: slug(a.name), description: desc, body: a.body });
          if (!lint.ok)
            return { status: "error", content: `linter blocked: ${lint.issues.join("; ")}` };
          const sec = scanSkillContent(a.body);
          if (!sec.ok)
            return { status: "error", content: `security blocked: ${sec.issues.join("; ")}` };
          writeSkill(d, a.name, a.body.includes(MM_TAG) ? a.body : a.body + `
<!-- ${MM_TAG}: edited ${new Date().toISOString().slice(0, 10)} -->
`);
          syncSkillToDesktopCatalog(String(a.name), ctx);
          const ledgerWarning = recordLifecycle("update", slug(a.name), "full skill rewrite passed authoring gates");
          return `full-rewrote '${a.name}'${ledgerWarning}`;
        }
        if (a.action === "write_file") {
          if (!a.name || !a.file_path || a.file_content == null)
            return { status: "error", content: "need name, file_path, file_content" };
          const full = writeSupportFile(slug(a.name), String(a.file_path), String(a.file_content), ctx);
          return `wrote support file ${a.file_path} -> ${full}`;
        }
        if (a.action === "remove_file") {
          if (!a.name || !a.file_path)
            return { status: "error", content: "need name, file_path" };
          const grave = removeSupportFile(slug(a.name), String(a.file_path), ctx);
          return `removed ${a.file_path} (reversible quarantine -> ${grave})`;
        }
        if (a.action === "restore") {
          if (!a.name)
            return { status: "error", content: "name required" };
          const p = restoreManagedSkill(slug(a.name), ctx);
          const ledgerWarning = recordLifecycle("restore", slug(a.name), "restored quarantined skill to active shelf");
          return `Restored '${slug(a.name)}' to the active shelf → ${p}${ledgerWarning}`;
        }
        return { status: "error", content: "unknown write action" };
      } catch (e) {
        return { status: "error", content: String(e?.message ?? e) };
      }
    };
    const lifecycleParams = {
      type: "object",
      properties: {
        action: { type: "string", enum: ["reflect", "graduate", "publish", "prune"], description: "Lifecycle action. All are reversible except publish, which writes to the shared catalog and needs approve: true" },
        mode: { type: "string", enum: ["staged", "auto"], description: "reflect mode; staged writes every result to the staging shelf and promotes nothing — graduate explicitly. auto promotes." },
        name: { type: "string", description: "staged skill name — for graduate" },
        approve: { type: "boolean", description: "required for publish, unless the operator has set MM_PUBLISH=auto (standing approval for autopilot graduates). Confirms the sanitized skill may be written to the shared catalog" }
      },
      required: ["action"],
      additionalProperties: false
    };
    const lifecycleRun = async (ctx) => {
      const a = ctx?.args || {};
      try {
        if (a.action === "reflect") {
          const r = await runReflectiveReview(ctx, { mode: a.mode === "auto" ? "auto" : "staged", semanticFn: semanticFnFor(ctx?.agent?.id) });
          if (r.action === "none" || r.action === "reject")
            return `reflect: ${r.action} — ${r.reason || ""}`;
          const graduated = !!r.wrote && !String(r.wrote).startsWith(STAGED_DIR);
          if (r.updateTarget) {
            const ledgerWarning = r.wrote ? recordLifecycle("update", slug(r.name), "autonomous reflect updated existing skill") : "";
            return `reflect: Updated existing skill "${r.name}" — anti-bloat, live → ${r.wrote || "(write failed)"}${ledgerWarning}`;
          }
          if (graduated) {
            const ledgerWarning = recordLifecycle("graduate", slug(r.name), "autonomous reflect graduated new skill");
            return `reflect: Graduated new skill "${r.name}" to the active shelf → ${r.wrote || "(write failed)"}${ledgerWarning}`;
          }
          return `reflect: Staged new skill "${r.name}" for review → ${r.wrote || "(write failed)"}`;
        }
        if (a.action === "graduate") {
          if (!a.name)
            return { status: "error", content: "name required" };
          const p = graduateStagedSkill(String(a.name), ctx);
          const ledgerWarning = recordLifecycle("graduate", slug(a.name), "graduated staged skill to active shelf");
          return `Graduated '${slug(a.name)}' to the active shelf → ${p}${ledgerWarning}`;
        }
        if (a.action === "publish") {
          if (!a.name)
            return { status: "error", content: "name required" };
          if (a.approve !== true) {
            return {
              status: "error",
              content: `publish to the shared catalog needs explicit approval — re-run with approve: true to publish '${slug(String(a.name))}'`
            };
          }
          const p = publishSkillToCatalog(String(a.name), ctx);
          return `Published '${slug(a.name)}' to the shared Custom Skills catalog → ${p}`;
        }
        if (a.action === "prune") {
          const r = runAutonomousPrune(ctx, { maxRetire: 1 });
          const ledgerWarnings = r.retired.map((name) => recordLifecycle("retire", slug(name), "autonomous prune retired skill after evidence gate")).join("");
          return `prune: retired ${r.retired.length} ${JSON.stringify(r.retired)}, flagged ${r.flagged.length}, kept ${r.kept.length}${ledgerWarnings}`;
        }
        return { status: "error", content: "unknown lifecycle action" };
      } catch (e) {
        return { status: "error", content: String(e?.message ?? e) };
      }
    };
    const rateParams = {
      type: "object",
      properties: {
        skill: { type: "string", description: "the skill name (slug) you are rating" },
        rating: { type: "string", enum: ["up", "down", "no_rate"], description: "up = it helped the next possession; down = it misled / wasted time / added drag; no_rate = you used it but it was genuinely neutral" },
        reason: { type: "string", description: "why — REQUIRED for down and no_rate; strongly encouraged for up. State the OUTCOME you saw, not that you remembered the skill." },
        evidence_ref: { type: "string", description: "optional receipt path/id/url — stored as a display string only, NEVER opened" },
        task: { type: "string", description: "optional short task/thread label this rating came from" },
        step_id: { type: "string", description: "optional Letta step id — when present the rating also posts to native steps.feedback" }
      },
      required: ["skill", "rating"],
      additionalProperties: false
    };
    const rateRun = async (ctx) => {
      const a = ctx?.args || {};
      const skill = slug(String(a.skill || "").trim());
      const rating = String(a.rating || "").toLowerCase();
      if (!skill)
        return "\uD83D\uDEAB skill is required";
      if (rating !== "up" && rating !== "down" && rating !== "no_rate")
        return "\uD83D\uDEAB rating must be up|down|no_rate";
      if (!isInstalledSkill(skill, ctx))
        return `\uD83D\uDEAB not recorded — skill '${skill}' is not installed on this agent`;
      const res = await rateSkill(letta.client, skill, rating, a.step_id ? String(a.step_id) : null, {
        reason: a.reason ? String(a.reason) : "",
        rater: process.env.MM_AGENT || "agent",
        evidenceRef: a.evidence_ref ? String(a.evidence_ref) : "",
        task: a.task ? String(a.task) : "",
        source: "agent",
        model: modelIdentity(ctx?.model),
        provider: providerIdentity(ctx?.model)
      });
      if (!res.recorded)
        return `\uD83D\uDEAB not recorded — ${res.reason}`;
      return renderRatingReceipt(res);
    };
    const outcomeParams = {
      type: "object",
      properties: {
        possession_id: { type: "string", description: "possession ID returned by action:prescribe" },
        result: { type: "string", enum: ["helped", "harmed", "neutral", "succeeded_unaided", "failed_unaided"], description: "observed result; prescribe uses helped|harmed|neutral, abstain uses succeeded_unaided|failed_unaided" },
        evidence_tier: { type: "string", enum: ["human_judged", "agent_judged"], description: "caller-recorded outcomes are judged only. Bound verification is reserved for a future instrument-owned adapter and cannot be self-awarded" },
        reason: { type: "string", description: "required observed outcome; privately redacted before append" },
        evidence_ref: { type: "string", description: "optional receipt ID/path label; privately redacted and never opened" },
        supersedes_event_id: { type: "string", description: "optional exact active outcome event ID when correcting a prior judged outcome; append-only correction, never overwrite" }
      },
      required: ["possession_id", "result", "evidence_tier", "reason"],
      additionalProperties: false
    };
    const outcomeRun = async (ctx) => {
      const a = ctx?.args || {};
      const possessionId = String(a.possession_id || "").trim();
      const result = String(a.result || "");
      const tier = String(a.evidence_tier || "");
      const events = loadPossessionEvents();
      const decision = events.find((event) => event.type === "decision" && event.possession_id === possessionId);
      if (!decision || decision.type !== "decision")
        return `\uD83D\uDEAB not recorded — unknown possession '${possessionId}'`;
      const activeOutcome = events.filter((event) => event.type === "outcome" && event.possession_id === possessionId).at(-1);
      const supersedes = String(a.supersedes_event_id || "").trim();
      if (activeOutcome && !supersedes)
        return `\uD83D\uDEAB not recorded — possession '${possessionId}' already has an outcome; correction requires supersedes_event_id='${activeOutcome.event_id}'`;
      if (!activeOutcome && supersedes)
        return `\uD83D\uDEAB not recorded — cannot supersede a missing outcome for '${possessionId}'`;
      const prescribeResult = result === "helped" || result === "harmed" || result === "neutral";
      const abstainResult = result === "succeeded_unaided" || result === "failed_unaided";
      if (decision.action === "prescribe" && !prescribeResult || decision.action === "abstain" && !abstainResult) {
        return `\uD83D\uDEAB not recorded — result '${result}' is incompatible with decision '${decision.action}'`;
      }
      if (tier !== "human_judged" && tier !== "agent_judged")
        return "\uD83D\uDEAB not recorded — callers cannot self-award verified; evidence_tier must be human_judged|agent_judged";
      if (!String(a.reason || "").trim())
        return "\uD83D\uDEAB not recorded — reason is required";
      try {
        const recorded = recordPossessionEvent({
          schema: "mm.possession.v1",
          event_id: `o-${possessionId}-${Date.now().toString(36)}-${randomBytes2(4).toString("hex")}`,
          possession_id: possessionId,
          ts: Date.now(),
          type: "outcome",
          result,
          evidence_tier: tier,
          reason: String(a.reason),
          ...a.evidence_ref ? { evidence_ref: String(a.evidence_ref) } : {},
          ...supersedes ? { supersedes_event_id: supersedes } : {}
        });
        const earned = !supersedes && (result === "helped" || result === "succeeded_unaided");
        const affectedSkill = decision.action === "prescribe" ? String(decision.skill || "") : "";
        if (earned)
          flashEarnedMinute(affectedSkill || "smart restraint", affectedSkill);
        else
          writeUiState({ phase: "idle", last: "", skill: "", route: "" });
        const beat = !supersedes && result === "helped" ? `✓ skill helped · ${String(decision.skill || "prescribed skill")}` : !supersedes && result === "succeeded_unaided" ? "✓ no skill needed · task completed" : "";
        const receipt = `recorded ${tier.toUpperCase()} outcome '${result}' for ${possessionId}${supersedes ? ` · superseded ${supersedes}` : ""} · event ${recorded.event_id} · Decision Report updated from observed evidence`;
        return beat ? `${beat}
${receipt}` : receipt;
      } catch (error) {
        return `\uD83D\uDEAB not recorded — ${String(error?.message || error)}`;
      }
    };
    const closeParams = {
      type: "object",
      properties: {
        possession_id: { type: "string", description: "possession ID returned by muscle_memory_prescribe" },
        result: { type: "string", enum: ["helped", "harmed", "neutral", "succeeded_unaided", "failed_unaided"], description: "observed result; prescriptions use helped|harmed|neutral and abstentions use succeeded_unaided|failed_unaided" },
        reason: { type: "string", description: "one concrete sentence describing the observed task outcome" }
      },
      required: ["possession_id", "result", "reason"],
      additionalProperties: false
    };
    const closeRun = async (ctx) => {
      const a = ctx?.args || {};
      const possessionId = String(a.possession_id || "").trim();
      const result = String(a.result || "");
      const recorded = await outcomeRun({
        ...ctx,
        args: {
          possession_id: possessionId,
          result,
          evidence_tier: "agent_judged",
          reason: String(a.reason || "")
        }
      });
      if (recorded.startsWith("\uD83D\uDEAB"))
        return recorded;
      const events = loadPossessionEvents();
      const decision = events.find((event) => event.type === "decision" && event.possession_id === possessionId);
      const outcome = [...events].reverse().find((event) => event.type === "outcome" && event.possession_id === possessionId);
      const receipt = outcome?.event_id ? `
RECEIPT · ${outcome.event_id}` : "";
      if (!decision)
        return recorded;
      if (decision.action === "abstain") {
        const abstentionRead = result === "succeeded_unaided" ? "smart restraint confirmed" : "task failed unaided";
        return `OUTCOME RECORDED · ${result.replace(/_/g, " ")} · agent-judged
DECISION · abstained · ${abstentionRead}
EVIDENCE · judged result added · not verified${receipt}`;
      }
      const skill = String(decision.skill || "prescribed skill");
      const decisions = new Map(events.filter((event) => event.type === "decision").map((event) => [event.possession_id, event]));
      let judged = 0;
      let verified = 0;
      for (const event of events) {
        if (event.type !== "outcome")
          continue;
        const source = decisions.get(event.possession_id);
        if (!source || source.action !== "prescribe" || source.skill !== skill)
          continue;
        if (event.evidence_tier === "verified" && event.result === "helped" && source.verification && event.verification && claimBearingVerdict(source, event).verified)
          verified++;
        else if (event.evidence_tier === "agent_judged" || event.evidence_tier === "human_judged")
          judged++;
      }
      const proven = renderRosterSnapshot(ctx).provenNames.includes(skill);
      return `OUTCOME RECORDED · ${result} · agent-judged
SKILL · ${skill}
EVIDENCE · ${judged} judged · ${verified} verified · ${proven ? "proven" : "still unproven"}${receipt}`;
    };
    const verifierRegistrationParams = {
      type: "object",
      properties: {
        task_id: { type: "string", description: "unique lowercase verification task slug" },
        task_class: { type: "string", description: "lowercase task-class slug that must match the later possession" },
        target_rel: { type: "string", description: "canonical relative path under the trusted MM_EXACT_FILE_ROOT; absolute/traversing/symlink targets are refused" },
        expected_sha256: { type: "string", description: "canonical lowercase SHA-256 of the expected final file bytes" }
      },
      required: ["task_id", "task_class", "target_rel", "expected_sha256"],
      additionalProperties: false
    };
    const verifierRegistrationRun = async (ctx) => {
      const a = ctx?.args || {};
      try {
        const created = createExactFileVerificationTask({
          taskId: String(a.task_id || ""),
          taskClass: String(a.task_class || ""),
          targetRel: String(a.target_rel || ""),
          expectedSha256: String(a.expected_sha256 || "")
        });
        return `\uD83D\uDD12 verification task registered read-only · ${created.task.task_id} · ${created.task.task_class} · manifest ${created.manifestSha256.slice(0, 12)}… · bind it during prescribe before work begins`;
      } catch (error) {
        return `\uD83D\uDEAB verification task refused — ${String(error?.message || error)}`;
      }
    };
    const verifierParams = {
      type: "object",
      properties: {
        possession_id: { type: "string", description: "possession ID whose pre-work exact-file manifest binding will be verified; no caller-supplied result/path/hash/tier is accepted" }
      },
      required: ["possession_id"],
      additionalProperties: false
    };
    const verifierRun = async (ctx) => {
      const possessionId = String(ctx?.args?.possession_id || "").trim();
      const events = loadPossessionEvents();
      const decision = events.find((event) => event.type === "decision" && event.possession_id === possessionId);
      if (!decision)
        return `\uD83D\uDEAB verification refused — unknown possession '${possessionId}'`;
      if (!decision.verification)
        return `\uD83D\uDEAB verification refused — possession '${possessionId}' has no pre-work instrument binding`;
      if (events.some((event) => event.type === "outcome" && event.possession_id === possessionId)) {
        return `\uD83D\uDEAB verification refused — possession '${possessionId}' already has an outcome`;
      }
      try {
        const notice = instrumentSessionNotice(STATE_DIR);
        const verified = verifyExactFilePossession(decision);
        const stamp = Date.now();
        const recorded = recordInstrumentVerifiedOutcome({
          schema: "mm.possession.v1",
          event_id: `o-${possessionId}-${stamp.toString(36)}-${randomBytes2(4).toString("hex")}`,
          possession_id: possessionId,
          ts: stamp,
          type: "outcome",
          ...verified
        }, verified.evidence_context);
        if (verified.result === "helped") {
          const affectedSkill = String(decision.skill || "");
          flashEarnedMinute(affectedSkill || "prescribed skill", affectedSkill);
        } else
          writeUiState({ phase: "idle", last: "", skill: "", route: "" });
        const head = verified.procedural_credit ? `\uD83D\uDD2C BOUND-VERIFIED 'helped'` : verified.artifact_verified ? `\uD83D\uDD2C ARTIFACT-VERIFIED · no procedural credit` : `\uD83D\uDD2C BOUND-VERIFIED 'harmed'`;
        const why = verified.procedural_credit ? "" : ` · ${verified.reason}`;
        return `${notice ? `⚠️ ${notice}
` : ""}${head} for ${possessionId} · adapter ${verified.verification.adapter_id} · manifest ${verified.verification.manifest_sha256.slice(0, 12)}… · event ${recorded.event_id}${why}`;
      } catch (error) {
        return `\uD83D\uDEAB verification refused — ${String(error?.message || error)}`;
      }
    };
    disposers.push(letta.tools.register({
      name: "muscle_memory_skill_read",
      description: advancedAgentSurface ? "Read Muscle Memory state. START with action:report for the private Decision Report (boxscore is a legacy alias). Use action:pending_possessions to resume open work, action:roster for conservative outcome review, and action:reflect_plan before learning. For a current task gap, prefer the dedicated muscle_memory_prescribe tool; legacy action:prescribe remains compatible. Coverage and low-level tape are diagnostics, not the primary workflow." : "Read the private Decision Report, resume a pending possession, review the skill roster, or load one known skill. For a current task gap, use muscle_memory_prescribe.",
      parameters: advancedAgentSurface ? readParams : leanReadParams,
      requiresApproval: false,
      async run(ctx) {
        return readRun(ctx);
      }
    }));
    disposers.push(letta.tools.register({
      name: "muscle_memory_prescribe",
      description: "Use after you observe a real procedural miss, or when you know you lack the procedure for the current task. Provide only the task and your explicit gap attestation. Returns exactly ONE installed Skill or ABSTAIN and opens one private possession. It never dumps the shelf, creates a skill, or infers hidden model capability. If you already know the recovery, do not call this tool; continue unaided. After a prescription, invoke the exact Skill tool, complete the task, then use muscle_memory_close.",
      parameters: prescribeParams,
      requiresApproval: false,
      async run(ctx) {
        return readRun({ ...ctx, args: { task: ctx?.args?.task, gap_observed: ctx?.args?.gap_observed, action: "prescribe" } });
      }
    }));
    disposers.push(letta.tools.register({
      name: "muscle_memory_close",
      description: "Lightweight default closeout for a Muscle Memory possession. Provide the returned possession_id, the observed result, and one concrete reason. The tool records agent_judged evidence automatically, reports whether the skill remains unproven, and cannot accept or self-award verified evidence. Use record_agent_possession only for human-judged closeout, evidence references, or append-only corrections; use verify_agent_possession for pre-bound instrument proof.",
      parameters: closeParams,
      requiresApproval: false,
      async run(ctx) {
        return closeRun(ctx);
      }
    }));
    if (advancedAgentSurface) {
      disposers.push(letta.tools.register({
        name: "record_agent_possession",
        description: "Advanced judged closeout and correction surface. Prefer muscle_memory_close for ordinary agent-judged outcomes. Use this full tool when a human owns the judgment, an evidence reference must be attached, or an append-only correction must supersede the exact active outcome event. Caller-recorded evidence remains human_judged or agent_judged only; verified is reserved for an instrument-owned adapter and cannot be self-awarded. Never promotes, publishes, or mutates a skill.",
        parameters: outcomeParams,
        requiresApproval: false,
        async run(ctx) {
          return outcomeRun(ctx);
        }
      }));
      disposers.push(letta.tools.register({
        name: "register_exact_file_verification",
        description: "Pre-register one immutable exact-file SHA-256 verification task before a prescribed edit begins. The caller defines the task class, trusted-root-relative target, and expected final digest; the mod writes a read-only manifest and returns its hash. It accepts no outcome/evidence tier and cannot close a possession.",
        parameters: verifierRegistrationParams,
        requiresApproval: false,
        async run(ctx) {
          return verifierRegistrationRun(ctx);
        }
      }));
      disposers.push(letta.tools.register({
        name: "verify_agent_possession",
        description: "Instrument-owned exact-file SHA-256 closeout for a possession that was bound to a pre-registered immutable verification task before work began. Accepts only possession_id; the adapter derives the trusted root, task, manifest, target, hash, result, evidence tier, reason, and receipt. Refuses unbound, tampered, replayed, symlinked, traversing, or already-closed possessions.",
        parameters: verifierParams,
        requiresApproval: false,
        async run(ctx) {
          return verifierRun(ctx);
        }
      }));
      disposers.push(letta.tools.register({
        name: "muscle_memory_skill_write",
        description: "muscle-memory writes (approval-gated, reversible). THE CORE LOOP: action:reflect distills a class-level skill from your cross-conversation work → update-first anti-bloat, security/lint-gated, staged by default. graduate promotes a staged skill to your active skill shelf. Plus create/patch/edit_full/retire/restore/pin lifecycle + write_file for support files. Preview first with reflect_plan (the read tool). For no-approval reflect/graduate/publish/prune, use muscle_memory_lifecycle_run.",
        parameters: writeParams,
        requiresApproval: true,
        async run(ctx) {
          return writeRun(ctx);
        }
      }));
      disposers.push(letta.tools.register({
        name: "muscle_memory_lifecycle_run",
        description: "muscle-memory autonomous lifecycle. reflect (distill a skill from your work), graduate (promote a staged skill → active shelf) and prune (retire stale/unused skills) are reversible and need no approval. publish (mirror a skill → shared Custom Skills catalog) is the exception: it writes outside your own shelf, so it requires approve: true unless the operator has set MM_PUBLISH=auto. This is the full self-improvement loop. Broad/manual skill edits → muscle_memory_skill_write; preview → reflect_plan in muscle_memory_skill_read.",
        parameters: lifecycleParams,
        requiresApproval: false,
        async run(ctx) {
          return lifecycleRun(ctx);
        }
      }));
      disposers.push(letta.tools.register({
        name: "rate_skill",
        description: "Rate a muscle-memory skill from YOUR experience of whether it helped the NEXT possession — the field-referee signal (both agents rate at their own natural boundaries). rating: up (it helped), down (it misled / wasted time / added drag), no_rate (you used it but it was genuinely neutral). reason REQUIRED for down/no_rate — state the OUTCOME you saw; never rate because you remembered the skill or to self-congratulate (that is Goodhart on our own instrument). rater is auto-set to the calling agent. Writes an append-only reasoned event (rating-reasons.jsonl) + the backward-compatible plus-minus aggregate, feeding the read-only roster recommendations. Field ratings are ASSOCIATIONAL — they can flag a skill for patch/bench, never auto-promote or auto-retire it.",
        parameters: rateParams,
        requiresApproval: false,
        async run(ctx) {
          return rateRun(ctx);
        }
      }));
    }
  }
  return () => {
    for (const d of disposers.reverse())
      d();
  };
}
export {
  preserveExistingFrontmatterMetadata,
  isSkillWorthy,
  isAmbiguousExistingRoute,
  draftWithRepair,
  detectRepairChains,
  detect,
  activate as default,
  compareSkillSections,
  __mm
};
