// muscle-memory · E7 REFEREE HOOK — skill plus-minus over Letta's native rating primitive.
//
// The learner cannot grade its own homework: muscle-memory can say "I learned", but only an
// outcome signal can say "that lesson helped the next possession". Letta ships the primitive —
// steps.feedback.create(stepId, { feedback: 'positive' | 'negative' }) — and nothing in the mod
// ecosystem uses it. This module wires it in the deterministic, receipts-first mm way:
//
//   LEDGER   a local plus-minus ledger per skill (plus/minus counts + timestamps) that the
//            lifecycle can consume for utility-weighted pruning: a skill with real minuses is
//            evidence-backed for retirement, not just stale.
//   NATIVE   when a step id is known, the rating is ALSO posted to steps.feedback — the signal
//            lands in Letta's own training-surface, not only in mm state.
//   HONEST   v1 ratings come from the agent/user (a rate command/tool), not from automatic
//            outcome attribution — automatic credit assignment over step windows is v0.8 work
//            (Bounded, not Verified) and must not be faked with heuristics that guess.
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_SKILL_RE, ensureDir, STATE_DIR } from "./core";
import { isSafeExistingSkillName, isValidSkillName } from "./detect";
import { reachFn } from "./engram";

export const PLUSMINUS_PATH = join(STATE_DIR, "skill-plusminus.json");
// SPM field sidecar (v0.8.3): append-only rating events with reason/rater/evidence, SEPARATE from
// the backward-compatible aggregate. evidence_ref is a DISPLAY STRING ONLY — never opened here.
export const RATING_REASONS_PATH = join(STATE_DIR, "rating-reasons.jsonl");

export type Rating = "up" | "down" | "no_rate";

export type RatingEvent = {
  ts: number; agent: string; rater: string; skill: string; rating: Rating;
  reason: string; evidence_ref: string; task: string; step_id: string | null; source: string;
  model: string; provider: string;
};

/** Append one field-rating event to the sidecar (append-only JSONL). Never throws.
 * Returns whether the append actually landed: the referee may not fabricate its own receipt.
 * NEVER opens evidence_ref — it is stored as an opaque display string only. */
/** INSTRUMENT-OBSERVED HARM (the mirror's self-feeding loop).
 *
 * MM's per-model `negative-field` abstention already refuses to prescribe a skill that has hurt
 * THIS runtime model. Until now that ledger only ever learned from an EXPLICIT rating, so a skill
 * that failed loudly in the tool stream taught the instrument nothing and the same harm could be
 * prescribed again next turn. Measured motivation (rc6, 3 models x 4 families, sha256 oracle): the
 * same skill on the same task took gpt-5.6-luna 0%->100% while taking claude-sonnet-5 100%->75%.
 * Effects FLIP SIGN across models, so a pooled per-skill score cannot express the truth and the
 * evidence has to be keyed on model — which RatingEvent already is.
 *
 * ATTRIBUTION IS DELIBERATELY NARROW. Only a failure of the `Skill` tool call ITSELF counts. A Bash
 * or Edit error later in the same turn is NOT attributed to the prescribed skill: post-hoc blame of
 * unrelated tool errors is exactly the over-attribution that makes harm numbers meaningless, and a
 * false `down` is worse than a missing one because it permanently suppresses a good skill for a
 * model. Wider signals stay a human-rating decision. */
export function recordObservedSkillFailure(input: {
  skill: string; model: string; provider?: string; agent?: string;
  toolCallId?: string | null; detail?: string; task?: string;
}): boolean {
  const skill = String(input.skill || "").trim();
  const model = String(input.model || "").trim();
  // An unknown model must NOT poison the shared pool: the whole point is per-model evidence.
  if (!skill || !model || model === "unknown") return false;
  const ref = `tool_end:${String(input.toolCallId || "").trim() || "unknown"}`;
  // Idempotent: the same tool call must never be counted twice if the handler re-runs.
  try {
    if (loadRatingEvents().some((ev) => ev.skill === skill && ev.evidence_ref === ref)) return false;
  } catch { /* an unreadable ledger must not block the append */ }
  return appendRatingReason({
    ts: Date.now(), agent: String(input.agent || "unknown"), rater: "instrument",
    skill, rating: "down",
    reason: `instrument-observed: the Skill tool call for "${skill}" failed on runtime model ${model}`
      + (input.detail ? ` — ${input.detail}` : ""),
    evidence_ref: ref, task: String(input.task || ""), step_id: null,
    source: "tool_end", model, provider: String(input.provider || "unknown"),
  });
}

export function appendRatingReason(ev: RatingEvent): boolean {
  try { ensureDir(); appendFileSync(RATING_REASONS_PATH, JSON.stringify(ev) + "\n"); return true; }
  catch { return false; }
}

// PROVENANCE (P1b, 2026-08-10). plus/minus alone cannot say WHERE evidence came from, and the first
// attempt derived a tier from lastStepId — the LAST WRITE ONLY — so a single manual rating relabelled
// an entire record and "tool-observed" could overclaim on a record that was mostly self-assessed.
// Per-sign counters fix that. They are OPTIONAL: a line written before this change has none, and its
// provenance is NOT RECOVERABLE. Such counts are LEGACY and must never be promoted to observed —
// absence of a counter is OUTSIDE_COVERAGE, not a zero. `coverageStart` stamps the first write under
// the new schema so a reader can tell legacy mass from measured mass.
export type SkillRating = {
  plus: number; minus: number; lastTs: number; lastStepId: string | null;
  plusObserved?: number; plusJudged?: number; minusObserved?: number; minusJudged?: number;
  coverageStart?: number;
};
export type PlusMinusLedger = Record<string, SkillRating>;

export function loadPlusMinus(): PlusMinusLedger {
  try {
    if (!existsSync(PLUSMINUS_PATH)) return {};
    const parsed: unknown = JSON.parse(readFileSync(PLUSMINUS_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as PlusMinusLedger) : {};
  } catch { return {}; }
}

/** Read the append-only field events for model/task-conditioned review. Malformed rows are ignored;
 * this never opens evidence_ref and never mutates the ledger. */
export function loadRatingEvents(): RatingEvent[] {
  try {
    if (!existsSync(RATING_REASONS_PATH)) return [];
    const out: RatingEvent[] = [];
    for (const line of readFileSync(RATING_REASONS_PATH, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev && typeof ev === "object" && typeof ev.skill === "string" && (ev.rating === "up" || ev.rating === "down" || ev.rating === "no_rate")) out.push(ev as RatingEvent);
      } catch { /* malformed append-only rows do not poison the whole field ledger */ }
    }
    return out;
  } catch { return []; }
}

/** Record one rating in the ledger. Never throws. Returns the updated line and write truth. */
export type RatingProvenance = "observed" | "judged";
/**
 * PROVENANCE IS AN EXPLICIT ARGUMENT, NEVER INFERRED (P1b-fix, 2026-08-10 — found during review).
 *
 * The first cut derived provenance from `stepId` being non-empty. That is FORGEABLE: rate_skill
 * accepts a CALLER-SUPPLIED step_id (index.ts rateRun), so an agent could pass any string and have
 * its own judgement recorded as instrument evidence. Sandbox proof:
 *   rateSkill(..., source:"agent", stepId:"caller_supplied_step")  ->  plusObserved:1
 *   -> the tape then rendered  evidence=tool-observed
 * That is precisely the laundering of self-assessment as measurement the tier exists to prevent,
 * and the forgery path was introduced by the fix meant to stop it.
 *
 * DEFAULT IS "judged" — FAIL CLOSED. Only the tool_end autorate seam may pass "observed", because
 * only it holds a toolCallId it minted from the runtime's own event rather than from an argument.
 * A caller cannot reach "observed" by supplying data; it is reached only by BEING the instrument.
 */
export function recordPlusMinus(skillName: string, up: boolean, stepId?: string | null,
                                provenance: RatingProvenance = "judged"): { line: SkillRating; persisted: boolean } {
  const ledger = loadPlusMinus();
  const cur: SkillRating = ledger[skillName] ?? { plus: 0, minus: 0, lastTs: 0, lastStepId: null };
  // OBSERVED vs JUDGED. An observed rating is bound to a tool outcome by its toolCallId (autorate);
  // a judged rating is a manual rateSkill with no step binding. The stepId IS the discriminator, but
  // it is now accumulated per sign instead of overwriting a single last-write field.
  const observed = provenance === "observed";   // NOT derived from stepId — see the note above
  const now = Date.now();
  const next: SkillRating = {
    plus: cur.plus + (up ? 1 : 0),
    minus: cur.minus + (up ? 0 : 1),
    lastTs: now,
    lastStepId: stepId ?? null,
    plusObserved:  (cur.plusObserved  ?? 0) + (up && observed ? 1 : 0),
    plusJudged:    (cur.plusJudged    ?? 0) + (up && !observed ? 1 : 0),
    minusObserved: (cur.minusObserved ?? 0) + (!up && observed ? 1 : 0),
    minusJudged:   (cur.minusJudged   ?? 0) + (!up && !observed ? 1 : 0),
    // Stamped once, on the first write under this schema. Counts accrued BEFORE it are legacy and
    // are not represented in the four counters — that gap is the migration boundary, and it is
    // deliberately visible rather than backfilled with a guess.
    coverageStart: cur.coverageStart ?? now,
  };
  ledger[skillName] = next;
  try { ensureDir(); writeFileSync(PLUSMINUS_PATH, JSON.stringify(ledger, null, 2)); return { line: next, persisted: true }; }
  catch { return { line: next, persisted: false }; }
}

/** Net utility for lifecycle consumption: positive = earning its context, negative = evidence
 * for retirement. Skills without ratings return null (no evidence — never treat absence of
 * ratings as a minus). Pure. */
export function skillUtility(ledger: PlusMinusLedger, skillName: string): number | null {
  const r = ledger[skillName];
  if (!r || r.plus + r.minus === 0) return null;
  return r.plus - r.minus;
}

export type RateResult = {
  skill: string; rating: SkillRating; nativePosted: boolean; reason: string; recorded: boolean; ratingKind: Rating;
  sidecarWritten: boolean; aggregatePersisted: boolean | null; partial: boolean;
};

export type RateOpts = {
  reason?: string; rater?: string; evidenceRef?: string; task?: string; source?: string; agent?: string;
  model?: string; provider?: string;
};

/** Collapse the dynamic mod `ctx.model` surface to one safe, stable label. Never serialize the
 * whole context object: model handles are useful attribution; arbitrary runtime state is not. */
export function modelIdentity(model: unknown): string {
  if (typeof model === "string") return model.trim().slice(0, 200) || "unknown";
  if (!model || typeof model !== "object") return "unknown";
  const m = model as Record<string, unknown>;
  const handle = typeof m.handle === "string" ? m.handle.trim() : "";
  if (handle) return handle.slice(0, 200);
  const id = typeof m.id === "string" ? m.id.trim() : "";
  const provider = typeof m.provider === "string" ? m.provider.trim() : "";
  if (provider && id && !id.includes("/")) return `${provider}/${id}`.slice(0, 200);
  if (id) return id.slice(0, 200);
  const name = typeof m.name === "string" ? m.name.trim() : "";
  return name.slice(0, 200) || "unknown";
}

/** Provider attribution comes from the runtime model context, never tool arguments. */
export function providerIdentity(model: unknown): string {
  if (model && typeof model === "object") {
    const provider = (model as Record<string, unknown>).provider;
    if (typeof provider === "string" && provider.trim()) return provider.trim().slice(0, 100);
  }
  const label = modelIdentity(model);
  return label.includes("/") ? label.split("/", 1)[0].slice(0, 100) : "unknown";
}

const ZERO: SkillRating = { plus: 0, minus: 0, lastTs: 0, lastStepId: null };

/** Rate a skill (v0.8.3 field sidecar).
 *  - rating: "up" | "down" | "no_rate" (legacy boolean still accepted: true=up, false=down).
 *  - AGGREGATE (skill-plusminus.json): up→plus++, down→minus++, no_rate→UNCHANGED (backward-compatible).
 *  - SIDECAR (rating-reasons.jsonl): full event ALWAYS appended (reason/rater/evidence_ref/task/step/source).
 *  - reason REQUIRED for down and no_rate; encouraged for up.
 *  - evidence_ref stored as a display string only — NEVER opened.
 *  - native steps.feedback posted for up/down when a step id + surface exist (no_rate has no native mapping).
 *  Never throws. */
export async function rateSkill(client: unknown, skillName: string, rating: Rating | boolean, stepId?: string | null, opts: RateOpts = {}): Promise<RateResult> {
  const legacyBool = typeof rating === "boolean";
  const kind: Rating = legacyBool ? (rating ? "up" : "down") : rating;
  const refuse = (why: string, zero = false): RateResult => ({
    skill: skillName,
    rating: zero ? ZERO : (loadPlusMinus()[skillName] ?? ZERO),
    nativePosted: false,
    reason: why,
    recorded: false,
    ratingKind: kind,
    sidecarWritten: false,
    aggregatePersisted: null,
    partial: false,
  });
  if (!isSafeExistingSkillName(skillName)) return refuse(`invalid skill name '${skillName}'`, true);
  if (kind !== "up" && kind !== "down" && kind !== "no_rate") return refuse(`invalid rating '${String(rating)}' (want up|down|no_rate)`, true);
  const reason = (opts.reason ?? "").trim();
  if (!legacyBool && (kind === "down" || kind === "no_rate") && !reason) return refuse(`rating '${kind}' requires a reason — not recorded`);

  // Sidecar first: the append-only reasoned event is the field truth. No sidecar means no rating.
  const agent = opts.agent ?? process.env.MM_AGENT ?? "unknown";
  const sidecarWritten = appendRatingReason({
    ts: Date.now(), agent, rater: opts.rater ?? agent, skill: skillName, rating: kind,
    reason, evidence_ref: (opts.evidenceRef ?? "").slice(0, 300), task: opts.task ?? "",
    step_id: stepId ?? null, source: opts.source ?? "rate_skill",
    model: opts.model ?? "unknown", provider: opts.provider ?? "unknown",
  });
  if (!sidecarWritten) return refuse("NOT recorded — sidecar append failed; field evidence requires the sidecar");

  let line: SkillRating = loadPlusMinus()[skillName] ?? ZERO;
  let aggregatePersisted: boolean | null = null;
  if (kind !== "no_rate") {
    // rateSkill is the MANUAL/AGENT lane (slash command and the rate_skill tool). It is ALWAYS
    // "judged", even when the caller supplied a step_id — that argument is untrusted by construction.
    const recorded = recordPlusMinus(skillName, kind === "up", stepId, "judged");
    line = recorded.line;
    aggregatePersisted = recorded.persisted;
  }
  const partial = aggregatePersisted === false;

  let nativePosted = false;
  if (stepId && kind !== "no_rate") {
    const post = reachFn(client, ["steps", "feedback", "create"]);
    if (post) {
      try { await post(stepId, { feedback: kind === "up" ? "positive" : "negative" }); nativePosted = true; }
      catch { /* native post is additive — the sidecar remains the field truth */ }
    }
  }
  const status = kind === "no_rate" ? "sidecar only (no_rate — aggregate unchanged)"
    : partial ? "PARTIAL: sidecar recorded; aggregate persist FAILED"
    : nativePosted ? "ledger + sidecar + native steps.feedback"
    : stepId ? "ledger + sidecar (native unavailable/failed)" : "ledger + sidecar (no step id)";
  return { skill: skillName, rating: line, nativePosted, reason: status, recorded: true, ratingKind: kind, sidecarWritten, aggregatePersisted, partial };
}

/** Render the ledger for the dashboard/wins surface. Pure. */
export function renderPlusMinus(ledger: PlusMinusLedger): string {
  const rows = Object.entries(ledger)
    .filter(([name]) => !FIXTURE_SKILL_RE.test(name))
    .sort((a, b) => (b[1].plus - b[1].minus) - (a[1].plus - a[1].minus));
  if (!rows.length) return "(no skill ratings yet — rate with /muscle-memory rate <skill> up|down [step-id])";
  return rows.map(([name, r]) => {
    const sample = r.plus + r.minus;
    return `  ${name} · ${r.plus} helped · ${r.minus} missed · ${sample} rated`;
  }).join("\n");
}
