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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, STATE_DIR } from "./core";
import { isValidSkillName } from "./detect";
import { reachFn } from "./engram";

export const PLUSMINUS_PATH = join(STATE_DIR, "skill-plusminus.json");

export type SkillRating = { plus: number; minus: number; lastTs: number; lastStepId: string | null };
export type PlusMinusLedger = Record<string, SkillRating>;

export function loadPlusMinus(): PlusMinusLedger {
  try {
    if (!existsSync(PLUSMINUS_PATH)) return {};
    const parsed: unknown = JSON.parse(readFileSync(PLUSMINUS_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as PlusMinusLedger) : {};
  } catch { return {}; }
}

/** Record one rating in the ledger. Returns the skill's updated line. Never throws. */
export function recordPlusMinus(skillName: string, up: boolean, stepId?: string | null): SkillRating {
  const ledger = loadPlusMinus();
  const cur: SkillRating = ledger[skillName] ?? { plus: 0, minus: 0, lastTs: 0, lastStepId: null };
  const next: SkillRating = { plus: cur.plus + (up ? 1 : 0), minus: cur.minus + (up ? 0 : 1), lastTs: Date.now(), lastStepId: stepId ?? null };
  ledger[skillName] = next;
  try { ensureDir(); writeFileSync(PLUSMINUS_PATH, JSON.stringify(ledger, null, 2)); } catch { /* ledger write is best-effort */ }
  return next;
}

/** Net utility for lifecycle consumption: positive = earning its context, negative = evidence
 * for retirement. Skills without ratings return null (no evidence — never treat absence of
 * ratings as a minus). Pure. */
export function skillUtility(ledger: PlusMinusLedger, skillName: string): number | null {
  const r = ledger[skillName];
  if (!r || r.plus + r.minus === 0) return null;
  return r.plus - r.minus;
}

export type RateResult = { skill: string; rating: SkillRating; nativePosted: boolean; reason: string };

/** Rate a skill: ledger always; steps.feedback ALSO when a step id is provided and the client
 * carries the surface. Never throws. */
export async function rateSkill(client: unknown, skillName: string, up: boolean, stepId?: string | null): Promise<RateResult> {
  if (!isValidSkillName(skillName)) return { skill: skillName, rating: { plus: 0, minus: 0, lastTs: 0, lastStepId: null }, nativePosted: false, reason: `invalid skill name '${skillName}'` };
  const rating = recordPlusMinus(skillName, up, stepId);
  let nativePosted = false;
  if (stepId) {
    const post = reachFn(client, ["steps", "feedback", "create"]);
    if (post) {
      try { await post(stepId, { feedback: up ? "positive" : "negative" }); nativePosted = true; }
      catch { /* native post is additive — the ledger is the source of truth */ }
    }
  }
  return { skill: skillName, rating, nativePosted, reason: nativePosted ? "ledger + native steps.feedback" : stepId ? "ledger only (native post unavailable/failed)" : "ledger only (no step id)" };
}

/** Render the ledger for the dashboard/wins surface. Pure. */
export function renderPlusMinus(ledger: PlusMinusLedger): string {
  const rows = Object.entries(ledger).sort((a, b) => (b[1].plus - b[1].minus) - (a[1].plus - a[1].minus));
  if (!rows.length) return "(no skill ratings yet — rate with /muscle-memory rate <skill> up|down [step-id])";
  return rows.map(([name, r]) => {
    const net = r.plus - r.minus;
    return `  ${net >= 0 ? "+" : ""}${net}  ${name}  (+${r.plus}/-${r.minus})`;
  }).join("\n");
}
