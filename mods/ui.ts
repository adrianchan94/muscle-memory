// muscle-memory · ui module (split from index.ts — behavior-preserving).
import { join } from "node:path";
import type { DecisionRoute, PossessionSummary } from "./possessions";


/** Hermes-style compact summary of a review's WRITE actions (finished, not thinking). */
export function summarizeReflectActions(events: Array<{ phase: string; summary: string }>, mode: "compact" | "verbose" = "compact"): string {
  const primaryPhases = ["skill_created", "skill_updated", "skill_staged", "skill_graduated", "skill_retired"];
  const writes = events.filter((e) => [...primaryPhases, "skill_review", "memory_pref_injected", "noise_rejected"].includes(e.phase));
  if (!writes.length) { const last = events[events.length - 1]; return `💾 muscle-memory review: ${last ? last.summary : "nothing to save"}`; }
  const main = writes.filter((w) => primaryPhases.includes(w.phase)).map((w) => w.summary);
  const extras = mode === "verbose" ? writes.filter((w) => !primaryPhases.includes(w.phase)).map((w) => w.summary) : [];
  return `💾 muscle-memory review: ${[...main, ...extras].join(" · ") || writes[0].summary}`;
}


const safeLabel = (value: string, fallback: string, max = 32) => value.replace(/[^A-Za-z0-9 ._-]/g, "").replace(/\s+/g, " ").trim().slice(0, max) || fallback;

const ROUTE_LABELS: Record<DecisionRoute, string> = {
  matched: "clear match",
  "no-gap": "no gap declared",
  "weak-match": "weak match",
  ambiguous: "tied strongest match",
  "negative-field": "negative field evidence",
  "no-safe-match": "no safe match",
};
export const friendlyRouteLabel = (route: DecisionRoute): string => ROUTE_LABELS[route];

/** Plain consumer decision report. Interventions and abstentions stay separate; no composite virtue score exists. */
export function renderAgentBoxScore(summary: PossessionSummary, options: { agent: string; period: string; skills?: { active: number; proven: number } }): string {
  const stage = summary.scoreStatus === "blocked" ? "LEDGER BLOCKED"
    : summary.scoreStatus === "incomplete" ? "INCOMPLETE EVIDENCE"
      : summary.scoreStatus === "claim_eligible" ? "CLAIM-ELIGIBLE EVIDENCE"
        : "EARLY EVIDENCE";
  const activeSkills = Number.isFinite(Number(options.skills?.active)) ? Math.max(0, Math.floor(Number(options.skills?.active))) : 0;
  const provenSkills = Number.isFinite(Number(options.skills?.proven)) ? Math.min(activeSkills, Math.max(0, Math.floor(Number(options.skills?.proven)))) : 0;
  const neutral = summary.observedNeutralInterventions > 0 ? ` · ${summary.observedNeutralInterventions} neutral` : "";
  const lines = [
    `MUSCLE MEMORY · DECISION REPORT · ${stage}`,
    `INTERVENTIONS · ${summary.observedInterventions} served · ${summary.observedHelpfulInterventions} helped · ${summary.observedHarmfulInterventions} harmed${neutral}`,
    `ABSTENTIONS · ${summary.observedAbstentions} · ${summary.observedSuccessfulAbstentions} succeeded unaided · ${summary.observedFailedAbstentions} failed`,
    `SKILLS · ${activeSkills} active · ${provenSkills} proven`,
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
  if (summary.openedDecisions === 0 && summary.scoreStatus !== "blocked") lines.push("START · declare a real procedural gap before a meaningful task");

  const invalidRows = Object.values(summary.exclusionReasons).reduce((sum, count) => sum + Number(count || 0), 0);
  if (summary.scoreStatus === "blocked") {
    lines.push(`STATUS · ledger integrity blocked · ${invalidRows} invalid row${invalidRows === 1 ? "" : "s"} · scoring withheld`);
  } else if (summary.scoreStatus === "incomplete") {
    lines.push(`STATUS · incomplete evidence · ${summary.verifiedDecisions} verified · scoring withheld`);
  } else if (summary.scoreStatus === "claim_eligible") {
    lines.push(`STATUS · verified evidence threshold met · ${summary.verifiedDecisions} verified · claim-eligible under ${summary.metricContract}`);
  } else {
    const evidence = summary.verifiedDecisions > 0 && summary.judgedDecisions > 0 ? "early mixed evidence"
      : summary.verifiedDecisions > 0 ? "early verified evidence"
        : summary.judgedDecisions > 0 ? "early judged evidence"
          : "no evaluated evidence";
    const capped = summary.repeatCappedDecisions > 0 ? ` · ${summary.repeatCappedDecisions} repeat-capped` : "";
    lines.push(`STATUS · ${evidence} · ${summary.verifiedDecisions} verified${capped} · not claim-bearing`);
  }
  return lines.join("\n");
}


/** Live learning-room broadcast: plain lifecycle verbs, outcome-only dopamine, and a truthful library counter. */
export function renderMuscleMemoryPanel(state: Record<string, any>): string[] {
  const mode = process.env.MM_REFLECT === "auto" ? "auto" : process.env.MM_REFLECT === "staged" ? "staged" : "off";
  const roster = state?.roster && typeof state.roster === "object" ? state.roster : {};
  const totalSkills = Number.isFinite(Number(roster.total)) ? Math.max(0, Math.floor(Number(roster.total))) : 0;
  const provenSkills = Number.isFinite(Number(roster.proven)) ? Math.min(totalSkills, Math.max(0, Math.floor(Number(roster.proven)))) : 0;
  const helpedCount = Number.isFinite(Number(roster.helped)) ? Math.max(0, Math.floor(Number(roster.helped))) : 0;
  const provenNames = new Set(Array.isArray(roster.provenNames) ? roster.provenNames.map((name: unknown) => safeLabel(String(name || ""), "", 80)).filter(Boolean) : []);
  // Camera-quiet resting line: library size + lifecycle helped. Mode (`auto`) and last-action prose
  // (`already reflected…`) stay out of the resting surface — details belong in transition/expanded views.
  // Helped counts qualifying closed helped prescriptions; proven is scarce chrome appended only when >0.
  // No decorative demo verbs here: prescribe/Skill-invoke must appear in the runtime transcript,
  // not as MM chrome phases without writers.
  const resting = (): string[] => {
    if (mode === "off") return [];
    const parts = [
      `💾 muscle-memory · ${totalSkills} skill${totalSkills === 1 ? "" : "s"}`,
      `${helpedCount} helped`,
    ];
    if (provenSkills > 0) parts.push(`${provenSkills} proven`);
    return [parts.join(" · ")];
  };

  if (!state || (!state.last && !state.phase)) return resting();

  const phase = String(state.phase || "idle");
  const route = String(state.route || "").toUpperCase();
  const ageMs = typeof state.ts === "number" ? Math.max(0, Date.now() - state.ts) : 0;
  const skill = safeLabel(String(state.skill || ""), "", 80);
  const alarmSubject = safeLabel(
    String(state.subject || state.last || "")
      .replace(/^blocked\s*/i, "")
      .replace(/\s*\(safe\)\s*$/i, ""),
    "unsafe content",
  );

  // Reachable writeUiState phases only (source-proven): protected, earned, learned, updated,
  // rotation, benched, reviewing, checking, shaping, saving, testing, idle.
  if (phase === "protected") return [`💾 muscle-memory · 🛡️ blocked ${alarmSubject}`];

  const beatTtlMs = 12_000;
  const beatPhases = new Set(["earned", "learned", "updated", "rotation", "benched"]);
  if (beatPhases.has(phase)) {
    if (ageMs > beatTtlMs) return resting();
    const fallback = phase === "earned" ? safeLabel(String(state.last || ""), "smart restraint") : "skill";
    const label = skill || fallback;
    const rating = state?.field && typeof state.field === "object" && skill ? state.field[skill] : null;
    const helped = rating && Number.isFinite(Number(rating.plus)) ? Math.max(0, Math.floor(Number(rating.plus))) : null;
    const missed = rating && Number.isFinite(Number(rating.minus)) ? Math.max(0, Math.floor(Number(rating.minus))) : null;
    const fieldLine = helped !== null && missed !== null ? ` (helped ${helped} · missed ${missed})` : "";
    switch (phase) {
      case "earned":
        if (!skill || /smart restraint/i.test(label)) return ["💾 muscle-memory · ✓ no skill needed · task completed"];
        if (provenNames.has(skill)) return [`💾 muscle-memory · ★ skill proven · ${skill}${fieldLine}`];
        return [`💾 muscle-memory · ✓ skill helped · ${skill}${fieldLine}`];
      case "learned": return [`💾 muscle-memory · ✓ skill learned · ${label}${fieldLine}`];
      case "updated": return [`💾 muscle-memory · ✓ skill improved · ${label}${fieldLine}`];
      case "rotation": return [`💾 muscle-memory · ★ skill promoted · ${label}${fieldLine}`];
      case "benched": return [`💾 muscle-memory · ↓ skill retired · ${label}${fieldLine}`];
    }
  }

  const progressTtlMs = 120_000;
  if (["reviewing", "shaping", "checking", "saving", "testing"].includes(phase)) {
    if (ageMs > progressTtlMs) return resting();
    const detail = String(state.detail || "")
      .replace(/[^A-Za-z0-9 /._-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64);
    if (phase === "reviewing") return [`💾 muscle-memory · learning from recent work${detail ? ` · ${detail}` : "…"}`];
    if (phase === "checking") {
      return [skill
        ? `💾 muscle-memory · checking skill: ${skill}…`
        : `💾 muscle-memory · checking the roster${route.includes("CREATE") ? " for a new skill" : ""}…`];
    }
    if (phase === "testing") return [`💾 muscle-memory · testing skill: ${skill || "new skill"}…`];
    if (phase === "saving") return [`💾 muscle-memory · saving ${route.includes("UPDATE") ? "skill update" : "skill"}: ${skill || "new skill"}…`];
    if (skill && route.includes("UPDATE")) return [`💾 muscle-memory · rewriting skill: ${skill}…`];
    return ["💾 muscle-memory · writing a new skill…"];
  }

  // Idle, rejected, skipped, stale, unknown, and unwritten decorative phases collapse to rest.
  return resting();
}
