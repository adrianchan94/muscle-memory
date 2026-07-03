// muscle-memory · E8 SQUAD SHELF — cross-agent skill inheritance over a shared Letta archive.
//
// The Memp finding this operationalizes: procedural memory built by a strong agent transfers its
// gains to weaker agents. Letta already ships the transport — archives are multi-agent-attachable
// passage stores with their own embedding config — but nothing in the ecosystem uses them as a
// skill shelf. This module does, with the squad's non-negotiables built in:
//
//   PULL-ONLY   a pulled skill lands in the publish-staged dir, NEVER on the active shelf —
//               a human/agent review promotes it (same gate as the publish flow).
//   PROVENANCE  every shelf passage carries mm:src:<publisher> tags + a provenance header in
//               the staged copy; a skill can always be traced to who earned it.
//   SANITIZED   publishing accepts content the caller already ran through the publish
//               sanitizer; this module additionally hard-blocks secret-shaped values.
//
// Wire shapes grounded against @letta-ai/letta-client (archives.create/list, archives.passages
// .create, agents.archives.attach; archive-level search is unsupported — consumers attach the
// archive and use agents.passages.search, same as the mm:skill index).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLISH_STAGED_DIR, SECRET_TOKEN_RE } from "./core";
import { isValidSkillName } from "./detect";
import { pageItems, reachFn, SKILL_PASSAGE_TAG, skillPassageTag } from "./engram"

export const SQUAD_ARCHIVE_NAME = process.env.MM_SQUAD_ARCHIVE || "mm-squad-shelf";

/** Tag marking a passage as a full shelf skill document (vs the routing index snippets). */
export const SHELF_DOC_TAG = "mm:shelf-doc";

export type ShelfPublishResult = { ok: boolean; archiveId: string | null; reason: string };
export type ShelfPullResult = { ok: boolean; stagedPath: string | null; publisher: string | null; reason: string };

/** Find or create the squad shelf archive. Returns its id, or null when the client lacks the
 * archives surface. Never throws. */
export async function ensureSquadArchive(client: unknown, opts?: { embedding?: string }): Promise<string | null> {
  const list = reachFn(client, ["archives", "list"]);
  const create = reachFn(client, ["archives", "create"]);
  if (!create) return null;
  try {
    if (list) {
      const resp: unknown = await list({ name: SQUAD_ARCHIVE_NAME, limit: 5 });
      const items: unknown[] = pageItems(resp)
      for (const a of items) {
        if (a && typeof a === "object" && "id" in a && typeof (a as Record<string, unknown>).id === "string" && "name" in a && (a as Record<string, unknown>).name === SQUAD_ARCHIVE_NAME) {
          return String((a as Record<string, unknown>).id);
        }
      }
    }
    const created: unknown = await create({ name: SQUAD_ARCHIVE_NAME, description: "muscle-memory squad shelf — sanitized, provenance-tagged skills published for cross-agent inheritance (pull-only, staged-first)", ...(opts?.embedding ? { embedding: opts.embedding } : {}) });
    return created && typeof created === "object" && "id" in created && typeof (created as Record<string, unknown>).id === "string" ? String((created as Record<string, unknown>).id) : null;
  } catch { return null; }
}

/** Canonical provenance marker embedded in every published shelf doc. Tags on archive-created
 * passages DO NOT survive the wire (verified live 2026-07-03: archives.passages.create accepts
 * tags, but agents.passages.search over the attached archive returns the passages with empty
 * tags and tag filters match nothing — unlike agent-created passages, which round-trip tags).
 * So shelf identity and provenance ride IN THE TEXT, where nothing can strip them. */
export const SHELF_MARKER_RE = /<!-- mm:shelf skill=([a-z0-9-]+) publisher=([A-Za-z0-9_-]+) published=([0-9T:.Z-]+) -->/;

export function shelfMarker(skillName: string, publisher: string, publishedAt: string): string {
  return `<!-- mm:shelf skill=${skillName} publisher=${publisher} published=${publishedAt} -->`;
}

/** Publish a SANITIZED skill document to the squad shelf. The caller is responsible for running
 * the publish sanitizer first; this is the last line of defense, not the gate. Re-publishing
 * appends a new version — pull resolves to the NEWEST marker timestamp (the API has neither
 * update nor list for archive passages). Never throws. */
export async function publishSkillToShelf(client: unknown, archiveId: string, skillName: string, sanitizedContent: string, publisher: string): Promise<ShelfPublishResult> {
  if (!archiveId) return { ok: false, archiveId: null, reason: "no archive id" };
  if (!isValidSkillName(skillName)) return { ok: false, archiveId, reason: `invalid skill name '${skillName}'` };
  if (SECRET_TOKEN_RE.test(sanitizedContent)) return { ok: false, archiveId, reason: "secret-shaped value in content — publish blocked (run the sanitizer)" };
  const create = reachFn(client, ["archives", "passages", "create"]);
  if (!create) return { ok: false, archiveId, reason: "client lacks archives.passages.create" };
  try {
    const marker = shelfMarker(skillName, publisher, new Date().toISOString());
    await create(archiveId, {
      text: `${marker}\n${sanitizedContent.slice(0, 40_000)}`,
      // Tags kept for the day the server round-trips them; identity never depends on them.
      tags: [SKILL_PASSAGE_TAG, skillPassageTag(skillName), SHELF_DOC_TAG, `mm:src:${publisher}`],
      metadata: { publisher, skill: skillName, publishedAt: new Date().toISOString(), format: "SKILL.md" },
    });
    return { ok: true, archiveId, reason: "published" };
  } catch (e) { return { ok: false, archiveId, reason: `publish failed: ${e instanceof Error ? e.message : "unknown"}` }; }
}

/** Attach the squad shelf to an agent so its passage search can see shelf skills. Never throws. */
export async function attachSquadShelf(client: unknown, agentId: string, archiveId: string): Promise<boolean> {
  const attach = reachFn(client, ["agents", "archives", "attach"]);
  if (!attach || !agentId || !archiveId) return false;
  try { await attach(archiveId, { agent_id: agentId }); return true; } catch { return false; }
}

/** Pull a skill from the shelf into the STAGED dir — never the active shelf. The staged copy
 * carries a provenance header; promotion goes through the same review gate as publish-approve.
 * Requires the shelf archive to be attached to the agent (search runs through the agent).
 * Identity is text-borne: candidates are verified by their embedded shelf marker, and multiple
 * published versions resolve to the newest marker timestamp. */
export async function pullShelfSkill(client: unknown, agentId: string, skillName: string): Promise<ShelfPullResult> {
  if (!isValidSkillName(skillName)) return { ok: false, stagedPath: null, publisher: null, reason: `invalid skill name '${skillName}'` };
  const search = reachFn(client, ["agents", "passages", "search"]);
  if (!search || !agentId) return { ok: false, stagedPath: null, publisher: null, reason: "client lacks agents.passages.search" };
  try {
    // No tag filter — archive passages lose tags on the wire (see SHELF_MARKER_RE note).
    const resp: unknown = await search(agentId, { query: skillName.replace(/-/g, " "), top_k: 10 });
    const results: unknown[] = resp && typeof resp === "object" && "results" in resp && Array.isArray((resp as Record<string, unknown>).results) ? ((resp as Record<string, unknown>).results as unknown[]) : [];
    let best: { content: string; publisher: string; publishedAt: string } | null = null;
    for (const r of results) {
      if (!r || typeof r !== "object" || !("content" in r) || typeof (r as Record<string, unknown>).content !== "string") continue;
      const content = String((r as Record<string, unknown>).content);
      const m = content.match(SHELF_MARKER_RE);
      if (!m || m[1] !== skillName) continue; // not a shelf doc, or a different skill
      if (!best || m[3] > best.publishedAt) best = { content, publisher: m[2], publishedAt: m[3] };
    }
    if (!best) return { ok: false, stagedPath: null, publisher: null, reason: `no shelf doc found for '${skillName}' (is the shelf attached to this agent?)` };
    if (SECRET_TOKEN_RE.test(best.content)) return { ok: false, stagedPath: null, publisher: best.publisher, reason: "shelf content failed the secret gate — refused" };
    const dir = join(PUBLISH_STAGED_DIR, skillName);
    mkdirSync(dir, { recursive: true });
    const staged = join(dir, "SKILL.md");
    const header = `<!-- muscle-memory shelf pull · publisher: ${best.publisher} · published: ${best.publishedAt} · pulled: ${new Date().toISOString()} · REVIEW BEFORE PROMOTION -->\n`;
    writeFileSync(staged, header + best.content);
    return { ok: true, stagedPath: staged, publisher: best.publisher, reason: "staged for review" };
  } catch (e) { return { ok: false, stagedPath: null, publisher: null, reason: `pull failed: ${e instanceof Error ? e.message : "unknown"}` }; }
}
