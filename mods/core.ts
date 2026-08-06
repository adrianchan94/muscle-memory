// muscle-memory · core module (split from index.ts — behavior-preserving).
import { appendFileSync, copyFileSync, lstatSync, mkdirSync, readFileSync, existsSync, writeFileSync, readdirSync, renameSync, rmSync, realpathSync } from "node:fs";
import { join, dirname, relative, isAbsolute, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { commandTemplate, correlateOutcomes, fingerprint, inferOutcomes } from "./detect";
import { sotaQualityGaps } from "./gate";
import { archivePassage, syncNeocortexBlock } from "./engram";


if (process.env.NODE_ENV === "test" && !process.env.MM_STATE_DIR) {
  throw new Error("Refusing to run muscle-memory tests against the real state dir — set MM_STATE_DIR to a sandbox (package script does this automatically).");
}

if (process.env.NODE_ENV === "test" && !process.env.MM_AGENT_SKILLS_DIR && !process.env.MEMORY_DIR) {
  throw new Error("Refusing to run muscle-memory mutating tests without an agent-shelf sandbox — set MM_AGENT_SKILLS_DIR (preferred) or MEMORY_DIR (package script does this automatically).");
}

export const STATE_DIR = process.env.MM_STATE_DIR || join(homedir(), ".letta", "muscle-memory");

export const LOG_PATH = join(STATE_DIR, "experience.jsonl");

export const SESSIONS_PATH = join(STATE_DIR, "sessions.jsonl");

/**
 * The shared desktop/global skill shelf, resolved on every call.
 *
 * Never capture this at module load. A frozen snapshot made the shelf depend on
 * which file imported `core` first, so a test that set MM_GLOBAL_SKILLS_DIR at
 * module scope silently redirected the runtime for every file loaded after it —
 * order-dependent, and therefore platform-dependent.
 */
export function globalSkillsDir(): string {
  return process.env.MM_GLOBAL_SKILLS_DIR || join(homedir(), ".letta", "skills");
}


// ── Redaction ────────────────────────────────────────────────────────────────
export const SECRETISH = /(?:key|token|secret|password|passwd|auth|bearer|cookie|api[_-]?key)/i;

export const LONG_OPAQUE = /\b[A-Za-z0-9_\-]{24,}\b/g;

export const HEXID = /\b[0-9a-f]{7,}\b/gi;

export const ABS_PATH = /(?:\/[\w.\-~ ]+){2,}/g;

export const QUOTED = /(['"])(?:\\.|(?!\1).)*\1/g;

export const SECRET_ASSIGN = /\b(?=[A-Za-z_][A-Za-z0-9_]*\s*=)(?=[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|COOKIE|BEARER|API[_-]?KEY|APIKEY))[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s;&]+)/gi;

export const SECRET_QUERY = /([?&])(?:access[_-]?token|refresh[_-]?token|api[_-]?key|apikey|key|token|secret|password|passwd|auth|cookie|bearer)=([^&\s]+)/gi;

export const SECRET_FLAG = /--(?:api[_-]?key|apikey|key|token|secret|password|passwd|auth|cookie|bearer)(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s;&]+)/gi;

export const SECRET_HEADER = /\b(?:authorization|cookie|x-api-key|api-key)\s*:\s*(?:"[^"]*"|'[^']*'|[^\s;&]+)/gi;

export const NUM = /\b\d+\b/g;


/** Secret-scrub cascade shared by the fingerprint template and the opt-in worked-example redactor,
 * so both honor the same credential-removal contract. */
export function scrubSecrets(t: string): string {
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


/** Opt-in worked-example redactor (MM_CAPTURE). Unlike commandTemplate it PRESERVES code/error
 * structure (line numbers, operators, short identifiers, quotes) so a captured error/diff stays
 * concrete, but still strips credentials, absolute paths, and long opaque tokens. The final skill
 * body is independently re-scanned by scanSkillContent before any write (defense in depth). */
export function redactFragment(text: unknown, maxLines = 8, maxChars = 320): string {
  const lines = String(text ?? "").split(/\r?\n/).slice(0, maxLines).map((ln) => {
    let s = scrubSecrets(ln);
    s = s.replace(ABS_PATH, "<path>");
    s = s.replace(/\b[A-Za-z0-9_\-]{28,}\b/g, "<id>");
    s = s.replace(/\b[0-9a-f]{12,}\b/gi, "<id>");
    return s.replace(/[ \t]+/g, " ").replace(/\s+$/, "");
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxChars);
}


export function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}


// ── D2: DETECT (pure, deterministic — the testable core) ─────────────────────
// v2 (0.27.18): rows carry an outcome (ok) + error class (err) + a call id so
// tool_end outcomes can be merged onto tool_start observations.
export type Row = { ts?: number; conv?: string | null; tool: string; fp: string; tmpl?: string | null; h?: string; ok?: boolean; err?: string | null; id?: string; errMsg?: string | null; fix?: string | null };


export type Candidate = {
  kind: "template" | "sequence";
  key: string;
  count: number;
  convs: number;          // distinct conversations (cross-session spread)
  fixes: number;          // occurrences that recovered an error (false->true)
  maturity: number;
  mature: boolean;
};


// Tunable, conservative thresholds (born-hard — keeps the bank lean).
export const MM = {
  MIN_COUNT: 3,           // must recur >= 3x
  MIN_CONVS: 2,           // cross-session spread OR ...
  STRONG_SINGLE: 8,       // ... heavily repeated within a single session (both are "you do this a lot")
  MATURE_AT: 3.0,         // maturity score threshold to become a candidate
  NGRAM: 2,               // workflow transition (verb bigram) — empirically the right granularity
  // weights
  W_FREQ: 1.0, W_SPREAD: 1.5, W_FIX: 2.0,
};


// ── State I/O ────────────────────────────────────────────────────────────────
export function ensureDir() { try { mkdirSync(STATE_DIR, { recursive: true }); } catch { /* */ } }

export function appendJsonl(path: string, row: unknown) {
  try { ensureDir(); appendFileSync(path, JSON.stringify(row) + "\n"); } catch { /* tap must never throw */ }
}

export function loadRows(path = LOG_PATH): Row[] {
  if (!existsSync(path)) return [];
  const rows: Row[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}


// ── D3: DISTILL / GRADUATE / HOT-LOAD / REFINE (Hermes-style skill_manage) ────
export const MM_TAG = "muscle-memory provenance"; // marker that tags a muscle-memory-managed skill

// Synthetic-tape doctrine: ref-skill-* are test/reference fixtures. They may be RECORDED in the
// ledger (referee tests rate them) but must never LEAK into any user-facing board. Single source
// of truth here in core so every display renderer (boxscore + plus-minus) filters identically
// without a lifecycle↔referee import cycle.
export const FIXTURE_SKILL_RE = /^ref-skill-/;


/** Resolve the agent-scoped skills dir (compounds via MemFS); fall back to global. Portable. */
export function agentSkillsDir(ctx?: any): string {
  // Priority 1: explicit agent-shelf override (decoupled from MEMORY_DIR; sandbox-safe).
  if (process.env.MM_AGENT_SKILLS_DIR) return process.env.MM_AGENT_SKILLS_DIR;
  if (process.env.MEMORY_DIR) return join(process.env.MEMORY_DIR, "skills");
  const id = ctx?.agent?.id || ctx?.agentId;
  if (id) {
    // Prefer the projected agent MemFS path that the Skill shelf indexes. The local-backend
    // mirror can exist but be seatbelt-inaccessible / invisible to the normal Skill tool.
    const projected = join(homedir(), ".letta", "agents", id, "memory", "skills");
    if (existsSync(join(homedir(), ".letta", "agents", id, "memory"))) return projected;
    const local = join(homedir(), ".letta", "lc-local-backend", "memfs", id, "memory", "skills");
    if (existsSync(join(homedir(), ".letta", "lc-local-backend", "memfs", id))) return local;
  }
  return globalSkillsDir();
}

/** Dirs to scan for list/dedup/AUDIT: agent-scoped + global (deduped). Read-only visibility across both. */
export function scanDirs(ctx?: any): string[] { return [...new Set([agentSkillsDir(ctx), globalSkillsDir()])]; }

// ── NATIVE-FIT SHELF RESOLVER (Block N) — name each shelf + its permissions. An autonomous (unattended)
// loop may READ agent + global (audit/dedup visibility) but may only MUTATE the agent-local shelf: it must
// NEVER retire or rewrite shared global Custom Skills other agents may depend on. Global mutation is
// explicit-only (`/muscle-memory publish approve`). This is a permission boundary, NOT a priority resolver.
export type SkillShelf = { name: string; dir: string; writable: boolean; autonomous: boolean; priority: number };
export function skillShelves(ctx?: any): SkillShelf[] {
  const agent = agentSkillsDir(ctx);
  const shelves: SkillShelf[] = [{ name: "agent", dir: agent, writable: true, autonomous: true, priority: 20 }];
  // global is present for READ (audit/dedup) but is NOT autonomous-writable; only when it's a distinct shelf.
  if (globalSkillsDir() !== agent) shelves.push({ name: "global", dir: globalSkillsDir(), writable: false, autonomous: false, priority: 10 });
  return shelves;
}
/** The only shelves an AUTONOMOUS (unattended) op may MUTATE — agent-local; never the shared global shelf. */
export function autonomousShelves(ctx?: any): string[] { return skillShelves(ctx).filter((s) => s.autonomous).map((s) => s.dir); }


export function slug(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64); }

export function listSkillNames(dir: string): string[] { try { return readdirSync(dir).filter((n) => { try { if (lstatSync(join(dir, n)).isSymbolicLink()) return false; } catch { return false; } return existsSync(join(dir, n, "SKILL.md")); }); } catch { return []; } }

/**
 * Read-side mirror of `assertContained`. A skill NAME is a single directory segment, always.
 * The load path joined it straight onto each shelf dir, so `../../../etc` walked out and read a
 * SKILL.md the agent was never granted — the read-side twin of the support-file symlink escape,
 * and it needed no symlink at all. Rejecting the shape is enough here: a name is not a path.
 */
export function assertSafeSkillName(name: unknown): string {
  const n = String(name ?? "").trim();
  if (!n) throw new Error("skill name required");
  if (n === "." || n === "..") throw new Error(`unsafe skill name '${n}': dot segment`);
  if (/[\\/]/.test(n)) throw new Error(`unsafe skill name '${n}': path separators are not allowed in a skill name`);
  if (isAbsolute(n) || /^[A-Za-z]:/.test(n) || n.startsWith("~")) throw new Error(`unsafe skill name '${n}': absolute paths are not allowed`);
  if (n.includes("\0")) throw new Error(`unsafe skill name: null byte`);
  return n;
}

/**
 * THE skill-directory resolution layer. Every accessor goes through this — not because the
 * reported call site needed it, but because the previous three containment fixes each guarded
 * the call they were reported against and the next reviewer simply found a different accessor.
 *
 * `assertSafeSkillName` proves the name is a single segment. It says nothing about what that
 * segment IS on disk. A skill directory that is itself a symlink pointing out of the shelf turns
 * every reader into an exfiltration primitive and every writer into an arbitrary overwrite.
 *
 * Refuse the link itself rather than only links that escape: a skill directory is a real
 * directory of content the agent owns, and there is no legitimate reason for one to be a link.
 */
export function resolveSkillDir(root: string, name: string): string {
  assertSafeSkillName(name);
  const full = join(root, name);
  let st;
  try { st = lstatSync(full); } catch { return full; } // not created yet — nothing to escape through
  if (st.isSymbolicLink()) {
    let target = "";
    try { target = realpathSync(full); } catch { throw new Error(`containment: skill dir '${name}' is a broken symlink — refusing`); }
    let outside = true;
    try { const rel = relative(realpathSync(root), target); outside = !rel || rel.startsWith("..") || isAbsolute(rel); } catch { /* treat as outside */ }
    throw new Error(`containment: skill dir '${name}' is a symlink${outside ? ` escaping the shelf root (${target})` : ""} — refusing`);
  }
  return full;
}

/**
 * The FILE-level twin of `resolveSkillDir`. Resolving the directory proves the segment is a real
 * directory; it says nothing about the file inside it. A real skill dir whose `SKILL.md` is a
 * symlink to an external file made every reader return content the agent was never granted —
 * the same escape one level down, which is exactly where the previous four fixes stopped looking.
 *
 * Refuse the link rather than only links that escape: skill files are content the agent owns.
 */
export function resolveSkillFile(root: string, name: string, file = "SKILL.md"): string {
  const dir = resolveSkillDir(root, name);
  const full = join(dir, file);
  let st;
  try { st = lstatSync(full); } catch { return full; } // not created yet
  if (st.isSymbolicLink()) throw new Error(`containment: '${name}/${file}' is a symlink — refusing`);
  return full;
}

export function readSkill(dir: string, name: string): string { const sf = resolveSkillFile(dir, name); try { return readFileSync(sf, "utf8"); } catch { return ""; } }

export function skillDesc(dir: string, name: string): string { return (readSkill(dir, name).match(/description:\s*(.+)/)?.[1] || "").trim(); }

export function isManaged(dir: string, name: string): boolean { return readSkill(dir, name).includes(MM_TAG); }

export function writeSkill(dir: string, name: string, content: string): string {
  const sd = resolveSkillDir(dir, name);
  mkdirSync(sd, { recursive: true });
  resolveSkillDir(dir, name); // mkdir may have followed a link planted mid-call
  const target = resolveSkillFile(dir, name); // refuse a symlinked SKILL.md before we open or rename onto it
  const tmp = join(sd, ".SKILL.md.tmp"); writeFileSync(tmp, content); renameSync(tmp, target);
  return target;
}

export const CATALOG_SYNC_DIR = join(STATE_DIR, "catalog-sync");
export const CATALOG_SYNC_BACKUP_DIR = join(CATALOG_SYNC_DIR, "backups");
export const CATALOG_SYNC_META = ".mm-catalog-sync.json";
export const CATALOG_SYNC_BACKUPS_PER_SKILL = 3;

export type CatalogSyncResult = {
  status: "synced" | "noop" | "dry_run" | "missing" | "blocked_unmanaged" | "blocked_different_agent" | "partial" | "error";
  skill: string;
  source?: string;
  target?: string;
  backup?: string | null;
  copied?: string[];
  skipped?: Array<{ path: string; reason: string }>;
  sourceAgent?: string | null;
  targetAgent?: string | null;
  reason?: string;
};

type CatalogSyncMeta = { sourceAgent: string | null; syncedAt: string; source: string; skill: string };

function sourceAgentId(ctx?: any): string | null {
  return String(ctx?.agent?.id || ctx?.agentId || process.env.AGENT_ID || "").trim() || null;
}

function readCatalogSyncMeta(skill: string): CatalogSyncMeta | null {
  try {
    const meta = JSON.parse(readFileSync(join(globalSkillsDir(), skill, CATALOG_SYNC_META), "utf8"));
    return meta && typeof meta === "object" ? meta as CatalogSyncMeta : null;
  } catch { return null; }
}

function writeCatalogSyncReceipt(result: CatalogSyncResult) {
  try {
    mkdirSync(CATALOG_SYNC_DIR, { recursive: true });
    const file = join(CATALOG_SYNC_DIR, `${Date.now()}-${result.skill}.json`);
    writeFileSync(file, JSON.stringify({ ...result, ts: Date.now() }, null, 2));
  } catch { /* receipt must never break sync */ }
}

function readTextIfSafe(file: string): string | null {
  try {
    const buf = readFileSync(file);
    if (buf.includes(0)) return null;
    return buf.toString("utf8");
  } catch { return null; }
}

function normalizedSkillForCompare(file: string): string {
  return (readTextIfSafe(file) || "").replace(/\n?<!-- muscle-memory desktop-catalog-sync:[\s\S]*?-->\n?/g, "\n").trim();
}

function sameSkillFile(a: string, b: string): boolean {
  try { return normalizedSkillForCompare(a) === normalizedSkillForCompare(b); } catch { return false; }
}

function pruneCatalogBackups(skill: string) {
  try {
    if (!existsSync(CATALOG_SYNC_BACKUP_DIR)) return;
    const matches = readdirSync(CATALOG_SYNC_BACKUP_DIR)
      .filter((n) => n === skill || n.startsWith(`${skill}-`))
      .sort()
      .reverse();
    for (const old of matches.slice(CATALOG_SYNC_BACKUPS_PER_SKILL)) rmSync(join(CATALOG_SYNC_BACKUP_DIR, old), { recursive: true, force: true });
  } catch { /* best-effort */ }
}

function shouldSkipCatalogPath(rel: string): string | null {
  if (!rel || rel === CATALOG_SYNC_META) return "internal catalog metadata";
  if (rel === "RETIRE-REASON.txt") return "retire receipt";
  if (/^references\/evidence\//.test(rel)) return "evidence receipts stay agent-local";
  if (rel.split("/").some((part) => part.startsWith("."))) return "dotfile/temporary file";
  return null;
}

function copySkillFolderFiltered(srcDir: string, target: string, meta: CatalogSyncMeta): { copied: string[]; skipped: Array<{ path: string; reason: string }> } {
  const copied: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const src = join(dir, entry.name);
      const rel = relative(srcDir, src).replace(/\\/g, "/");
      const skipReason = shouldSkipCatalogPath(rel);
      if (skipReason) { skipped.push({ path: rel, reason: skipReason }); continue; }
      let stat;
      try { stat = lstatSync(src); } catch { skipped.push({ path: rel, reason: "unreadable" }); continue; }
      if (stat.isSymbolicLink()) { skipped.push({ path: rel, reason: "symlink skipped" }); continue; }
      if (stat.isDirectory()) { walk(src); continue; }
      if (!stat.isFile()) { skipped.push({ path: rel, reason: "not a regular file" }); continue; }
      if (rel !== "SKILL.md") {
        const v = validateSupportPath(rel);
        if (!v.ok) { skipped.push({ path: rel, reason: v.reason || "invalid support path" }); continue; }
        const text = readTextIfSafe(src);
        if (text !== null) {
          const sc = scanSupportFile(rel, text);
          if (!sc.ok) { skipped.push({ path: rel, reason: `security: ${sc.issues.join("; ")}` }); continue; }
        } else if (!/^assets\//.test(rel)) {
          skipped.push({ path: rel, reason: "binary/non-text support file outside assets" }); continue;
        }
      } else {
        const text = readTextIfSafe(src) || "";
        const sc = scanSkillContent(text);
        if (!sc.ok) { skipped.push({ path: rel, reason: `security: ${sc.issues.join("; ")}` }); continue; }
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

/** Local Desktop bridge: mirror an agent-MemFS skill into ~/.letta/skills so Desktop's local
 * catalog-backed modal can render it. This is NOT publish/share/marketplace — it is a reversible
 * local availability sync. Auto-sync refuses unmanaged or different-agent collisions; manual callers
 * may pass force when they explicitly want the local catalog copy replaced. */
export function syncSkillToDesktopCatalog(name: string, ctx?: any, opts: { dryRun?: boolean; force?: boolean } = {}): CatalogSyncResult {
  const nm = slug(name);
  if (!nm) return { status: "error", skill: nm, reason: "name required" };
  const srcRoot = agentSkillsDir(ctx);
  const srcDir = existsSync(join(srcRoot, nm, "SKILL.md"))
    ? join(srcRoot, nm)
    : scanDirs(ctx).filter((d) => d !== globalSkillsDir()).map((d) => join(d, nm)).find((d) => existsSync(join(d, "SKILL.md")));
  if (!srcDir) return { status: "missing", skill: nm, reason: "no agent skill to sync" };
  const target = join(globalSkillsDir(), nm);
  const srcSkill = join(srcDir, "SKILL.md");
  const dstSkill = join(target, "SKILL.md");
  const sourceAgent = sourceAgentId(ctx);
  const targetMeta = readCatalogSyncMeta(nm);
  const targetAgent = targetMeta?.sourceAgent ?? null;
  if (srcDir === target) return { status: "noop", skill: nm, source: srcDir, target, sourceAgent, targetAgent, reason: "source already is desktop catalog" };
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
  if (opts.dryRun) return { status: "dry_run", skill: nm, source: srcDir, target, sourceAgent, targetAgent, backup: existsSync(target) ? "would-back-up-target" : null };
  let backup: string | null = null;
  try {
    mkdirSync(globalSkillsDir(), { recursive: true });
    if (existsSync(target)) {
      mkdirSync(CATALOG_SYNC_BACKUP_DIR, { recursive: true });
      backup = join(CATALOG_SYNC_BACKUP_DIR, `${nm}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
      renameSync(target, backup);
    }
    mkdirSync(target, { recursive: true });
    const meta: CatalogSyncMeta = { skill: nm, source: srcDir, sourceAgent, syncedAt: new Date().toISOString() };
    const { copied, skipped } = copySkillFolderFiltered(srcDir, target, meta);
    if (!copied.includes("SKILL.md")) throw new Error("SKILL.md was not copied");
    pruneCatalogBackups(nm);
    const result: CatalogSyncResult = { status: skipped.length ? "partial" : "synced", skill: nm, source: srcDir, target, backup, copied, skipped, sourceAgent, targetAgent };
    writeCatalogSyncReceipt(result);
    appendUiEvent({ phase: "skill_catalog_synced", summary: `synced '${nm}' to local Desktop catalog`, skill: nm, action: "catalog_sync", route: "desktop-catalog" });
    return result;
  } catch (e: any) {
    try { rmSync(target, { recursive: true, force: true }); if (backup && existsSync(backup)) renameSync(backup, target); } catch { /* best effort rollback */ }
    const result: CatalogSyncResult = { status: "error", skill: nm, source: srcDir, target, backup, sourceAgent, targetAgent, reason: String(e?.message ?? e) };
    writeCatalogSyncReceipt(result);
    return result;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// v2 (Letta Code 0.27.18) — outcome-aware learning, repair chains, impact scoring,
// authoring linter, anti-patterns, effectiveness retirement, llm/compact telemetry.
// Pure + deterministic where it matters; the harness proves each piece.
// ════════════════════════════════════════════════════════════════════════════
export const OUTCOME_PATH = join(STATE_DIR, "outcomes.jsonl");

export const TELEMETRY_PATH = join(STATE_DIR, "telemetry.json");

export const RECEIPTS_DIR = join(STATE_DIR, "receipts");

export type Outcome = { id?: string | null; ok?: boolean; err?: string | null; tool?: string | null; conv?: string | null; ts?: number; errMsg?: string | null };

export function loadOutcomes(): Outcome[] {
  if (!existsSync(OUTCOME_PATH)) return [];
  const out: Outcome[] = [];
  for (const l of readFileSync(OUTCOME_PATH, "utf8").split("\n")) { if (!l) continue; try { out.push(JSON.parse(l)); } catch { /* skip */ } }
  return out;
}

/** v2.1 experience = starts correlated with outcomes (id-exact + fallback), then sequence-inferred
 *  outcomes for tools Letta never reports (Bash/Task). The latter is what makes the loop work live. */
export function loadExperience(): Row[] { return inferOutcomes(correlateOutcomes(loadRows(), loadOutcomes())); }


// ── MM_PUBLISH v1.1: the SUPPLY CHAIN — graduated agent skill → publishability preflight → staged
// sanitized Custom Skill → approved publish → visibility receipt. No auto-publish; sanitize identifiers
// (not mechanisms); dedup-aware; tiered. Closes "this agent learned" → "the mesh reuses it". (2026-06-28)
export const PUBLISH_STAGED_DIR = join(STATE_DIR, "publish-staged");


// ════════════════════════════════════════════════════════════════════════════
// HERMES-PARITY + EDGE: curator lifecycle (replicate) · failure-defense (beat).
// ════════════════════════════════════════════════════════════════════════════
export const USAGE_PATH = join(STATE_DIR, "skill-usage.json");


// ── E3.5: NATIVE NEOCORTEX BRIDGE (opt-in) — exploit Letta's core memory + archival ───────────
// CLS made literal: project the consolidated skill index into a Letta CORE MEMORY BLOCK so the
// agent SEES its neocortex in-context every turn (no retrieval), and (optionally) write salient
// lessons as ARCHIVAL PASSAGES for semantic recall. The string builders are pure + tested; the
// live SDK writes (syncNeocortexBlock/archivePassage) are best-effort + opt-in (MM_NATIVE), never
// throw, and no-op without a client+agentId. SDK shapes grounded against @letta-ai/letta-client.
export const NEOCORTEX_BLOCK = "muscle_memory";


// ════════════════════════════════════════════════════════════════════════════
// M2: SECURITY + AUTHORING GATE — every write path (create/edit/patch/write_file/
// autopilot-graduate) passes through this. Block dangerous content; no partial writes.
// ════════════════════════════════════════════════════════════════════════════
// Real key formats: separator-prefixed (sk-/pk-/ghp_/xoxb-…), Anthropic sk-ant- (internal hyphen),
// AWS AKIA + 16 (NO separator), Google AIza + 20+ (NO separator). The old single `[-_]` rule silently
// missed AKIA/AIza/sk-ant real keys — found by the adversarial safety tests; hardened, not benchmark-tuned.
export const SECRET_TOKEN_RE = /\b(?:(?:sk|pk|ghp|gho|ghu|ghs|xox[baprs])[-_][A-Za-z0-9]{12,}|sk-ant-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,})\b/;

/**
 * `\bsecret` never matches inside `client_secret`, because `_` is a word character — so the most
 * common real-world shape of the thing we claim to block sailed straight through. This catches a
 * labelled assignment whose key CONTAINS secret/token/passwd anywhere, underscores and all.
 */
export const SECRET_LABEL_RE = /(?:^|[^A-Za-z0-9])[A-Za-z0-9_.-]*(?:secret|passwd|password|token|api[_-]?key)[A-Za-z0-9_.-]*\s*[:=]\s*["']?[^\s"'<>]{6,}/i;

export function scanSkillContent(content: string): { ok: boolean; issues: string[] } {
  const c = String(content || "");
  const issues: string[] = [];
  if (SECRET_TOKEN_RE.test(c) || /\b(?:authorization|api[_-]?key|secret|password)\s*[:=]\s*["']?[^\s"'<>]{6,}/i.test(c) || SECRET_LABEL_RE.test(c) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(c)) issues.push("secret-looking credential");
  if (/\bcurl\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/i.test(c) || /\bwget\b[^\n|]*\|\s*(?:ba)?sh\b/i.test(c)) issues.push("pipe-to-shell (curl|sh)");
  if (/\brm\s+-[rf]{1,2}\s+(?:["']?[~/]|\$HOME|\*)/.test(c)) issues.push("naked rm -rf on root/home/glob");
  if (/(?:^|[\s;&|])sudo\s+\S/i.test(c)) issues.push("sudo command");
  // NOTE: force-push / reset --hard / rm etc. are NOT security threats — they are legitimate workflow ops a
  // skill may need to teach (git rebase, deploy rollback). Hard-blocking them here made mm unable to distil
  // entire domains (git/rebase/deploy). The real concern — "use them with a safety net" — is the SAFE-FIRST
  // QUALITY gate's job (sotaQualityGaps), which flags destructive ops lacking a backup/--force-with-lease/
  // dry-run and regenerates. Security scanner = true threats (secrets, exfil, pipe-to-shell, injection) only.
  if (Math.ceil(c.length / 4) > 5000) issues.push("body > 5000 tokens (decompose into references/)");
  if (/\bignore\s+(?:all\s+|the\s+)?(?:previous|prior|above)\s+(?:instructions|messages|prompts|rules)\b/i.test(c) || /\b(?:disregard|override)\s+(?:your\s+|the\s+)?(?:system|previous)\s+(?:prompt|instructions)\b/i.test(c)) issues.push("prompt-injection phrasing");
  // context-escape / role-injection: skill content that closes the mod's own skill wrapper, or impersonates
  // a system/role turn to issue agent instructions (publish anyway, approve, new instructions). A SKILL.md
  // body never legitimately contains these — they are attempts to subvert the publish/write gate.
  if (/<\/?muscle-memory-skill\b/i.test(c)
      || /(?:<\/?(?:system|assistant|user)>|\[(?:system|assistant)\]\s*:?)\s*[^<\n]{0,80}\b(?:you\s+are\s+now|new\s+instructions?|ignore|disregard|override)\b/i.test(c)
      || /\bpublish\s+this\s+skill\s+(?:anyway|without\s+review|now\b|regardless)/i.test(c)) issues.push("prompt-injection / context-escape directive");
  // concrete hardcoded API-key/token formats (QA-hardened)
  if (/\b(?:sk-ant-[a-zA-Z0-9-]{8,}|sk-[a-zA-Z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,})\b/.test(c)) issues.push("hardcoded API key/token");
  // credential exfiltration: command-substitution reading secrets, or piping creds to the network
  if (/\$\([^)]*(?:cat|head|tail|less)[^)]*(?:\.ssh|id_rsa|\.env|\.aws|credentials|\.netrc|passwd|secret|token)/i.test(c) || /(?:curl|wget|nc|ncat)\b[^\n]*(?:\$\(|`)[^\n]*(?:cat|\.ssh|\.env|credentials|secret)/i.test(c)) issues.push("credential exfiltration pattern");
  // obfuscated code execution
  if (/\beval\s*\(\s*(?:atob|Buffer\.from|decodeURIComponent|unescape)\s*\(/i.test(c) || /\bbase64\s+-d\b[^\n]*\|\s*(?:ba)?sh\b/i.test(c) || /\b(?:python3?|node|ruby|perl)\b[^\n]*\s-[ec]\b[^\n]*(?:atob|base64|exec\(|eval)/i.test(c)) issues.push("obfuscated code execution");
  return { ok: issues.length === 0, issues };
}

export function scanSupportFile(path: string, content: string): { ok: boolean; issues: string[] } {
  const issues = [...scanSkillContent(content).issues];
  if (/\.(?:sh|mjs|cjs|js|ts|py|rb)$/i.test(path)) {
    const testDemo = /\b(?:test|demo|smoke|example|fixture)\b/i.test(path) || /\b(?:test|demo|smoke|example)\b/i.test(String(content).slice(0, 240));
    if (!testDemo && /\b(?:curl|wget|fetch\s*\(|https?:\/\/|rm\s+-[rf]|dd\s+if=|mkfs|>\s*\/dev\/)\b/i.test(content)) issues.push("support script runs network/destructive ops without test/demo marking");
  }
  return { ok: issues.length === 0, issues };
}


// ════════════════════════════════════════════════════════════════════════════
// M1: SUPPORT-FILE MANAGER + RESTORE (Hermes skill_manage parity)
// ════════════════════════════════════════════════════════════════════════════
export const SUPPORT_SUBDIRS = new Set(["references", "templates", "scripts", "assets"]);

export function validateSupportPath(filePath: string): { ok: boolean; reason?: string } {
  const p = String(filePath || "");
  if (!p) return { ok: false, reason: "file_path required" };
  if (p.includes("..")) return { ok: false, reason: "path traversal ('..') blocked" };
  if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("~")) return { ok: false, reason: "absolute/home path blocked" };
  const parts = p.split("/").filter(Boolean);
  if (parts.length < 2) return { ok: false, reason: "provide subdir/filename" };
  if (!SUPPORT_SUBDIRS.has(parts[0])) return { ok: false, reason: `must be under: ${[...SUPPORT_SUBDIRS].join(", ")}` };
  if (parts.some((s) => s.startsWith("."))) return { ok: false, reason: "dotfiles/segments blocked" };
  return { ok: true };
}

export function skillDirOf(name: string, ctx?: any): string | null { return scanDirs(ctx).find((d) => { try { return existsSync(join(resolveSkillDir(d, name), "SKILL.md")); } catch { return false; } }) ?? null; }

/**
 * Containment for every support-file write. `validateSupportPath` reasons about the path as a
 * STRING, which cannot see a directory that is itself a symlink out of the skill root: a
 * `references` symlink to $HOME/evil_dir passes '..'-blocking, absolute-blocking, dotfile-blocking
 * and subdir-allowlisting, and the write lands outside. The remove path was worse — it would
 * happily quarantine a file the agent never owned.
 *
 * So resolve for real. Every segment from the skill root down is lstat'd, and any symlink whose
 * target leaves the root aborts. Symlinks INSIDE the root are still refused: a support file is
 * plain content, and there is no legitimate reason for one to be a link.
 */
export function assertContained(root: string, full: string): void {
  const base = realpathSync(root);
  // Compare LIKE WITH LIKE. This realpath'd the root and then measured a lexical `full` against
  // it, so on any host where the shelf sits under a symlinked prefix — /tmp -> /private/tmp on
  // macOS is the ordinary case, not an attack — every legitimate write computed a relative path
  // like ../../../../tmp/... and was refused. Fail-closed, but closed on the wrong people.
  //
  // Take the relative path in one consistent frame (lexical, both sides normalised), then walk
  // the canonical base. The symlink refusals below are unchanged: this fixes who gets measured,
  // not what counts as an escape.
  const rel = relative(resolve(root), resolve(full));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`containment: '${rel || full}' escapes the skill root`);
  let cur = base;
  for (const seg of rel.split(sep)) {
    cur = join(cur, seg);
    let st;
    try { st = lstatSync(cur); } catch { return; } // not created yet — nothing to escape through
    if (st.isSymbolicLink()) {
      let target = "";
      try { target = realpathSync(cur); } catch { throw new Error(`containment: '${seg}' is a broken symlink — refusing`); }
      const tRel = relative(base, target);
      const outside = tRel.startsWith("..") || isAbsolute(tRel);
      throw new Error(`containment: '${seg}' is a symlink${outside ? ` pointing outside the skill root (${target})` : ""} — refusing`);
    }
  }
}

export function writeSupportFile(name: string, filePath: string, content: string, ctx?: any): string {
  const v = validateSupportPath(filePath); if (!v.ok) throw new Error(v.reason);
  const sc = scanSupportFile(filePath, content); if (!sc.ok) throw new Error(`security: ${sc.issues.join("; ")}`);
  const d = skillDirOf(name, ctx); if (!d) throw new Error(`no skill '${name}'`);
  const full = resolveSkillFile(d, name, filePath);
  assertContained(join(d, name), full);
  mkdirSync(dirname(full), { recursive: true });
  assertContained(join(d, name), full); // mkdir may have followed a link created mid-call
  const tmp = full + ".mmtmp"; writeFileSync(tmp, content); renameSync(tmp, full); // atomic, no partial write
  return full;
}

export function removeSupportFile(name: string, filePath: string, ctx?: any): string {
  const v = validateSupportPath(filePath); if (!v.ok) throw new Error(v.reason);
  const d = skillDirOf(name, ctx); if (!d) throw new Error(`no skill '${name}'`);
  const full = join(d, name, filePath);
  assertContained(join(d, name), full);
  if (!existsSync(full)) throw new Error(`no such support file`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const grave = join(STATE_DIR, "removed-files", name, `${filePath.replace(/\//g, "__")}-${stamp}`);
  mkdirSync(dirname(grave), { recursive: true }); renameSync(full, grave); // reversible quarantine, not delete
  return grave;
}


// ════════════════════════════════════════════════════════════════════════════
// AUTOPILOT — the self-driving loop. Pure decision engine + executor so the whole
// autonomous distill/refine/manage cycle is testable WITHOUT a live model; the
// optional fork-author is a quality layer on top. Gated, budgeted, reversible, receipted.
// ════════════════════════════════════════════════════════════════════════════
export const STAGED_DIR = join(STATE_DIR, "staged");

/** P0 2b · the CREATE-lane dedupe surface: agent + global + STAGED shelves. Manual create and
 * create_from_candidate previously deduped against scanDirs only, so a near-duplicate of a
 * staged (not-yet-graduated) skill sailed through and sprayed siblings. */
export function createDedupeSurface(ctx?: any): string[] { return [...new Set([...scanDirs(ctx), STAGED_DIR])]; }

export const STAGED_RETIRED_DIR = join(STATE_DIR, "staged-retired");

export const AUTOPILOT_STATE = join(STATE_DIR, "autopilot-state.json");


// ════════════════════════════════════════════════════════════════════════════
// v3.3 — HERMES-VISIBLE UI: surface compact, FINISHED self-improvement summaries
// (not chain-of-thought) via a Letta panel + events ledger. No transcript hack —
// only the supported openPanel + command APIs — distillation must be visible while it happens.
// ════════════════════════════════════════════════════════════════════════════
export const UI_EVENTS = join(STATE_DIR, "ui-events.jsonl");

export const UI_STATE = join(STATE_DIR, "ui-state.json");

export const REFLECT_HANDLED = join(STATE_DIR, "reflect-handled.json");

export type UiEvent = { ts: number; phase: string; summary: string; skill?: string; action?: string; route?: string; source: "muscle-memory" };

export function appendUiEvent(e: { phase: string; summary: string; skill?: string; action?: string; route?: string }) { try { ensureDir(); appendJsonl(UI_EVENTS, { ts: Date.now(), source: "muscle-memory", ...e }); } catch { /* */ } }

export let livePanel: any = null; // set in activate(); lets state changes re-render the panel LIVE (interactive mirror)

export function setLivePanel(p: any) { livePanel = p; } // setter so the entry module can wire the panel across the module boundary

let panelUpdatePending = false;
export function writeUiState(s: Record<string, unknown>) {
  try {
    ensureDir();
    writeFileSync(UI_STATE, JSON.stringify({ phase: "", last: "", skill: "", route: "", subject: "", detail: "", ...s, ts: Date.now() }));
  } catch { /* */ }
  if (livePanel && !panelUpdatePending) {
    panelUpdatePending = true;
    setTimeout(() => { panelUpdatePending = false; try { livePanel?.update(); } catch { /* */ } }, 100);
  }
}

export function readUiState(): Record<string, any> { try { return existsSync(UI_STATE) ? JSON.parse(readFileSync(UI_STATE, "utf8")) : {}; } catch { return {}; } }

export function loadUiEvents(n = 8): UiEvent[] { if (!existsSync(UI_EVENTS)) return []; const out: UiEvent[] = []; for (const l of readFileSync(UI_EVENTS, "utf8").trim().split("\n")) { if (!l) continue; try { out.push(JSON.parse(l)); } catch { /* */ } } return out.slice(-n); }


// CROSS-AGENT MESH FEED — shared so the panel shows both local and cloud agents distilling.
// Best-effort; never breaks reflect. Redacted (skill name + route + counts only).
export const MESH_FEED = process.env.MM_MESH_FEED
  || (process.env.MM_STATE_DIR ? join(STATE_DIR, "mesh-skill-feed.jsonl") : join(homedir(), ".local", "state", "mesh-skill-feed.jsonl"));

// Label this agent in the shared feed. Explicit opt-in only: inferring identity from
// filesystem paths meant shipping one machine's agent id, and one person's name, to
// every consumer. Set MM_AGENT to choose a label; otherwise stay generic.
export function meshAgentLabel(): string { return process.env.MM_AGENT || "agent"; }

export function appendMeshFeed(e: { type: string; skill?: string; route?: string; signals?: number }) { try { mkdirSync(dirname(MESH_FEED), { recursive: true }); appendFileSync(MESH_FEED, JSON.stringify({ agent: meshAgentLabel(), ts: Date.now(), source: "muscle-memory", ...e }) + "\n"); } catch { /* */ } }

export function loadMeshFeed(n = 6): Array<{ agent?: string; type?: string; skill?: string; route?: string; signals?: number }> { try { if (!existsSync(MESH_FEED)) return []; const all: any[] = []; for (const l of readFileSync(MESH_FEED, "utf8").trim().split("\n")) { if (l) try { all.push(JSON.parse(l)); } catch { /* */ } } const seen = new Map<string, any>(); for (const e of all) seen.set(`${e.agent}|${e.skill}|${e.type}`, e); return [...seen.values()].slice(-n); } catch { return []; } }

export function renderMeshFeed(entries: Array<{ agent?: string; type?: string; skill?: string; route?: string; signals?: number }>): string[] {
  return entries.map((e) => `${(e.agent || "?").padEnd(5)} ${String(e.type || "").replace("skill_", "")} ${e.skill || ""}${e.route ? ` · ${e.route}` : ""}${e.signals ? ` · ${e.signals} signals` : ""}`.trim());
}
