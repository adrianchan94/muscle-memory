// muscle-memory · THE FILM ROOM — bounded incremental skill maintenance.
// docs/film-room-design.md governs. Cameron's ask, verbatim: "primarily improving existing
// skills versus creating new skills… smaller kind of persistent incremental changes."
//
// DISCIPLINE, enforced in code (not prompting):
//   INPUT   conversation SUMMARY + session receipts only — never raw transcripts.
//   BUDGET  hard step budget (≤3 model calls per boundary); exhaustion → clean park.
//   OUTPUT  PATCH_NOTEs only: ≤8 lines, ≤2 per boundary, append-only into whitelisted
//           sections, frontmatter immutable. The film room NEVER creates skills — no-match
//           lessons park as candidates for the normal reflect lane (where the gates live).
//   TARGET  only `update`-routed targets are patchable (routeSkillReranked / lexical head).
//   TENURE  pinned/tenured skills take patches as SHADOW DIFFS only (review to promote);
//           labile skills patch live only in auto mode (staged default).
//   REVERT  every patch snapshots first; referee-coupled regression (net plus-minus drop
//           since patch) auto-reverts. Evidence beats pedigree, both directions.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RECEIPTS_DIR, STATE_DIR, appendJsonl, appendUiEvent, ensureDir, isManaged, readSkill, scanSkillContent, writeSkill } from "./core";
import { compareSkillSections, routeSkill, searchSkills } from "./autopilot";
import { isPinned, managedSkillUsage, tenureFor as vaultTenure } from "./lifecycle";
import type { PlusMinusLedger } from "./referee";

export const FILMROOM_MAX_LINES = 8;
export const FILMROOM_MAX_PATCHES = 2;
export const FILMROOM_STEP_BUDGET = 3;
export const FILMROOM_SECTIONS = ["Procedure", "Pitfalls", "Verification", "Worked examples"] as const;
export const FILMROOM_SHADOW_DIR = join(STATE_DIR, "filmroom-shadow");
export const FILMROOM_SNAP_DIR = join(STATE_DIR, "filmroom-snapshots");
export const FILMROOM_PARKED = join(STATE_DIR, "filmroom-parked.jsonl");
export const FILMROOM_RECEIPTS = join(STATE_DIR, "filmroom-receipts.jsonl");

export type PatchNote = { skill: string; section: (typeof FILMROOM_SECTIONS)[number]; op: "append"; lines: string; evidence_ref: string };
export type Tenure = "labile" | "tenured" | "pinned";

/** Strict PATCH_NOTE extraction from model output: JSON array, whitelisted sections, line cap,
 * note cap, evidence required. Anything malformed → null (caller parks; never guesses). */
export function parsePatchNotes(raw: string): PatchNote[] | null {
  const text = String(raw || "").replace(/<\/?think>/gi, "");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr: unknown = JSON.parse(m[0]);
    if (!Array.isArray(arr) || arr.length === 0 || arr.length > FILMROOM_MAX_PATCHES) return null;
    const out: PatchNote[] = [];
    for (const o of arr) {
      if (!o || typeof o !== "object") return null;
      const n = o as Record<string, unknown>;
      const lines = String(n.lines ?? "");
      if (typeof n.skill !== "string" || !n.skill.trim()) return null;
      if (!FILMROOM_SECTIONS.includes(n.section as never)) return null;
      if (n.op !== "append") return null;
      if (!lines.trim() || lines.split("\n").length > FILMROOM_MAX_LINES) return null;
      if (typeof n.evidence_ref !== "string" || !n.evidence_ref.trim()) return null;
      out.push({ skill: n.skill.trim(), section: n.section as PatchNote["section"], op: "append", lines: lines.trim(), evidence_ref: n.evidence_ref.trim() });
    }
    return out;
  } catch { return null; }
}

/** Tenure via the shared Vault ladder (lifecycle.tenureFor) — one ladder, every consumer. */
export function tenureOf(name: string, dirs: string[]): Tenure {
  try { return vaultTenure(name); } catch { return "labile"; }
}

/** Append note lines under the target section of a SKILL.md body. Section missing → appended at
 * end. Frontmatter is never touched (split off and re-attached verbatim). */
export function applyNoteToContent(content: string, note: PatchNote): string {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\s*\n?)/);
  const fm = fmMatch ? fmMatch[1] : "";
  let body = content.slice(fm.length);
  const marker = `\n_[filmroom ${new Date().toISOString().slice(0, 10)} · ${note.evidence_ref}]_`;
  const block = `${note.lines}${marker}`;
  const re = new RegExp(`(##\\s*${note.section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\n)`, "i");
  if (re.test(body)) {
    // insert right after the section heading's existing content — append at section end:
    // find next "## " after the heading, insert before it (or at end of body)
    const headIdx = body.search(re);
    const afterHead = body.slice(headIdx);
    const nextSec = afterHead.slice(2).search(/\n##\s/);
    const insertAt = nextSec === -1 ? body.length : headIdx + 2 + nextSec + 1;
    body = body.slice(0, insertAt).replace(/\s*$/, "\n") + block + "\n" + body.slice(insertAt);
  } else {
    body = body.replace(/\s*$/, "\n") + `\n## ${note.section}\n${block}\n`;
  }
  return fm + body;
}

export type PatchResult = { skill: string; status: "patched-live" | "shadowed" | "rejected" | "parked"; reason: string; snapshot?: string; shadow?: string };

/** Apply one PATCH_NOTE with every gate from the design. Pure-ish: all fs under injected dirs. */
export function applyPatchNote(note: PatchNote, dirs: string[], opts: { mode?: "staged" | "auto"; tenure?: Tenure } = {}): PatchResult {
  const dir = dirs.find((d) => existsSync(join(d, note.skill, "SKILL.md")));
  if (!dir) return { skill: note.skill, status: "parked", reason: "target skill not found on managed shelves" };
  if (!isManaged(dir, note.skill)) return { skill: note.skill, status: "rejected", reason: "unmanaged skill — the film room only maintains muscle-memory-managed skills" };
  const original = readSkill(dir, note.skill);
  const next = applyNoteToContent(original, note);
  // GATES — security, section preservation, frontmatter immutability
  const sec = scanSkillContent(next);
  if (!sec.ok) return { skill: note.skill, status: "rejected", reason: `security scan: ${sec.reason ?? "flagged"}` };
  const diff = compareSkillSections(original, next);
  if (diff.droppedSections.length) return { skill: note.skill, status: "rejected", reason: `sections dropped: ${diff.droppedSections.join(",")}` };
  const fmOld = original.match(/^---\n[\s\S]*?\n---/)?.[0] ?? "";
  const fmNew = next.match(/^---\n[\s\S]*?\n---/)?.[0] ?? "";
  if (fmOld !== fmNew) return { skill: note.skill, status: "rejected", reason: "frontmatter mutated — immutable in the film room" };
  // SNAPSHOT (revert path) — always, before any write
  ensureDir(); mkdirSync(FILMROOM_SNAP_DIR, { recursive: true });
  const snap = join(FILMROOM_SNAP_DIR, `${note.skill}-${Date.now()}.md`);
  writeFileSync(snap, original);
  const tenure = opts.tenure ?? tenureOf(note.skill, dirs);
  const mode = opts.mode ?? "staged";
  if (tenure === "pinned" || tenure === "tenured" || mode === "staged") {
    mkdirSync(FILMROOM_SHADOW_DIR, { recursive: true });
    const shadow = writeSkill(FILMROOM_SHADOW_DIR, note.skill, next);
    appendJsonl(FILMROOM_RECEIPTS, { ts: Date.now(), kind: "shadow", note, snapshot: snap, shadow, tenure, reviewFlag: tenure === "pinned" });
    return { skill: note.skill, status: "shadowed", reason: tenure === "pinned" ? "pinned — shadow diff + explicit review flag" : tenure === "tenured" ? "tenured — shadow diff, promote via review/referee evidence" : "staged mode — shadow diff for review", snapshot: snap, shadow };
  }
  writeSkill(dir, note.skill, next);
  appendJsonl(FILMROOM_RECEIPTS, { ts: Date.now(), kind: "live-patch", note, snapshot: snap, dir });
  appendUiEvent({ phase: "skill_patched", summary: `film room: +${note.lines.split("\n").length} lines → ${note.skill} (${note.section})`, skill: note.skill, action: "patch", route: "filmroom" });
  return { skill: note.skill, status: "patched-live", reason: "labile + auto mode", snapshot: snap };
}

/** Referee-coupled regression check: if a skill's net plus-minus DROPPED since a live patch,
 * auto-revert to the snapshot (reconsolidation clause — evidence beats pedigree). */
export function checkPatchRegression(ledger: PlusMinusLedger, dirs: string[], opts: { receiptsPath?: string } = {}): Array<{ skill: string; reverted: boolean; reason: string }> {
  const path = opts.receiptsPath ?? FILMROOM_RECEIPTS;
  const out: Array<{ skill: string; reverted: boolean; reason: string }> = [];
  let receipts: Array<{ kind: string; note: PatchNote; snapshot: string; dir?: string; netAtPatch?: number; ts: number }> = [];
  try { receipts = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch { return out; }
  for (const r of receipts) {
    if (r.kind !== "live-patch" || !r.dir) continue;
    const cur = ledger[r.note.skill];
    const net = cur ? cur.plus - cur.minus : null;
    const netAtPatch = r.netAtPatch ?? 0;
    if (net !== null && net < netAtPatch) {
      try {
        const snap = readFileSync(r.snapshot, "utf8");
        writeSkill(r.dir, r.note.skill, snap);
        appendJsonl(path, { ts: Date.now(), kind: "auto-revert", note: r.note, from: r.snapshot });
        appendUiEvent({ phase: "skill_patch_reverted", summary: `film room: reverted patch on ${r.note.skill} — plus-minus dropped ${netAtPatch}→${net}`, skill: r.note.skill, action: "revert", route: "filmroom" });
        out.push({ skill: r.note.skill, reverted: true, reason: `net ${netAtPatch}→${net}` });
      } catch { out.push({ skill: r.note.skill, reverted: false, reason: "snapshot restore failed" }); }
    }
  }
  return out;
}

export type FilmRoomResult = { ran: boolean; patched: PatchResult[]; parked: PatchNote[]; reason: string; stepsUsed: number };

/** The orchestrator — runs at a boundary (compact_end / conversation close / sleeptime).
 * authorFn injectable (the bounded model call); absent/failed author → clean no-op. */
export async function runFilmRoom(opts: {
  summary: string;
  dirs: string[];
  authorFn?: (system: string, user: string) => Promise<string>;
  judgeFn?: (evidence: string, skill: { name: string; description: string }) => Promise<{ same_job: boolean; confidence: number } | null>;
  mode?: "staged" | "auto";
  stepBudget?: number;
  enabled?: string; // env override for tests
}): Promise<FilmRoomResult> {
  const flag = opts.enabled ?? process.env.MM_FILMROOM ?? "off";
  if (flag === "off") return { ran: false, patched: [], parked: [], reason: "MM_FILMROOM=off", stepsUsed: 0 };
  if (!opts.summary?.trim() || !opts.authorFn) return { ran: false, patched: [], parked: [], reason: "no summary or author available", stepsUsed: 0 };
  let steps = 0;
  const budget = opts.stepBudget ?? FILMROOM_STEP_BUDGET;
  const shelf = opts.dirs.flatMap((d) => { try { return searchSkills([d], opts.summary, 6); } catch { return []; } });
  const shelfList = [...new Set(shelf.map((s) => `${s.name}: ${s.description}`))].slice(0, 12).join("\n");
  const system = `You are muscle-memory's FILM ROOM — a maintenance editor for EXISTING skills. From the session summary, extract at most ${FILMROOM_MAX_PATCHES} small durable lessons that IMPROVE an existing skill below. Reply STRICT JSON only: an array of {"skill": "<existing name>", "section": "Procedure"|"Pitfalls"|"Verification"|"Worked examples", "op": "append", "lines": "<=8 lines of markdown>", "evidence_ref": "<one-line receipt>"}. Rules: NEVER invent a new skill name; if no lesson clearly belongs to an existing skill, reply []. Small and specific beats broad.`;
  const user = `SESSION SUMMARY:\n${opts.summary.slice(0, 4000)}\n\nEXISTING SKILLS:\n${shelfList || "(none)"}`;
  steps++;
  let raw = "";
  try { raw = await opts.authorFn(system, user); } catch { return { ran: true, patched: [], parked: [], reason: "author call failed — clean no-op", stepsUsed: steps }; }
  const notes = parsePatchNotes(raw);
  if (!notes) return { ran: true, patched: [], parked: [], reason: "no valid PATCH_NOTEs (malformed or empty) — nothing written", stepsUsed: steps };
  const patched: PatchResult[] = []; const parked: PatchNote[] = [];
  for (const note of notes) {
    if (steps >= budget && patched.length === 0) { parked.push(note); continue; } // budget exhausted → park, never partial-write
    // route-confirm: the note's target must be update-routable (lexical head; judge optional upstream)
    const lex = searchSkills(opts.dirs, `${note.skill} ${note.lines}`, 3);
    const d = routeSkill(lex, [], (n) => opts.dirs.some((x) => existsSync(join(x, n, "SKILL.md"))));
    let confirmed: boolean;
    if (opts.judgeFn && steps < budget) {
      // JUDGE AUTHORITATIVE (rerank doctrine): when a judge is available, it IS the precision
      // gate — the lexical echo (name appears in its own query) can never self-confirm past it.
      steps++;
      const desc = lex.find((m) => m.name === note.skill)?.description ?? "";
      const j = await opts.judgeFn(note.lines, { name: note.skill, description: desc }).catch(() => null);
      confirmed = !!j && j.same_job === true && j.confidence >= 0.6;
    } else {
      confirmed = (d.route === "update" && d.target?.name === note.skill) || lex.some((m) => m.name === note.skill);
    }
    if (!confirmed) {
      parked.push(note);
      appendJsonl(FILMROOM_PARKED, { ts: Date.now(), note, reason: "routing + judge did not confirm target — parked for reflect lane" });
      continue;
    }
    patched.push(applyPatchNote(note, opts.dirs, { mode: opts.mode }));
  }
  return { ran: true, patched, parked, reason: "boundary maintenance complete", stepsUsed: steps };
}
