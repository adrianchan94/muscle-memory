// muscle-memory · efficacy module — MEASURED skill efficacy + a non-regression prune guard.
//
// muscle-memory quality-GATES every skill (sotaQualityGaps/lintSkillDraft) but, until now, never PROVED a
// distilled skill measurably helps. Hermes's signature is exactly that proof — a holdout/before-after
// improvement number (its evolve_skill loop). This module brings that proof natively into the Letta loop:
// it scores how many of the failure classes the agent ACTUALLY re-hits the current library covers, at what
// context cost (CPG), and refuses a prune that would drop coverage of a still-recurring failure.
//
// Pure + deterministic — no model, runs offline in the verify suite. The ground truth is the agent's own
// matured repair chains (real fail→fix→verify), so "does the skill help?" is measured against real recurrence,
// not synthetic opinion.
import type { Row } from "./core";
import { detectRepairChains } from "./detect";

export type SkillLite = { name: string; body: string; description?: string };
export type FailureClass = { key: string; tokens: string[]; count: number; convs: number };
export type EfficacyReport = { classes: number; covered: number; coverage: number; skillTokens: number; cpg: number; uncovered: string[] };
export type RegressionVerdict = { ok: boolean; before: number; after: number; lost: string[] };

const EFFICACY_STOP = new Set(
  "the a an to of and or for with via run running fix fixed fixes failing failed fail error errors from then this that into your you not".split(" "),
);

/** Distinctive tokens that identify a failure class (command verbs, error class, example commands).
 * Drops short/stopword noise so coverage matching keys on the meaningful surface, not filler. */
export function classTokens(...parts: Array<string | undefined>): string[] {
  return [...new Set(parts.join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !EFFICACY_STOP.has(t)))];
}

/** Recurring failure classes the agent actually re-hits (matured real fail→fix→verify chains). These are
 * the classes a self-maintaining skill library is SUPPOSED to pre-empt — the ground truth for efficacy. */
export function recurringFailureClasses(rows: Row[]): FailureClass[] {
  const out: FailureClass[] = [];
  const seen = new Set<string>();
  for (const r of detectRepairChains(rows)) {
    const key = r.generalized ? `recovering-from-${r.trigger}` : r.verifyStep;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, tokens: classTokens(r.trigger, r.verifyStep, r.fixStep, (r.examples ?? []).join(" "), r.errClass), count: r.count, convs: r.convs });
  }
  return out;
}

/** A skill COVERS a failure class when ≥2 of the class's distinctive tokens appear in the skill text
 * (name + description + body). The ≥2 floor stops a single incidental word from counting as coverage. */
export function skillCovers(skill: SkillLite, cls: FailureClass): boolean {
  const hay = `${skill.name} ${skill.description ?? ""} ${skill.body}`.toLowerCase();
  let hits = 0;
  for (const t of cls.tokens) { if (hay.includes(t) && ++hits >= 2) return true; }
  return false;
}

/** MEASURED efficacy: of the failure classes the agent re-hits, how many does the current library cover,
 * and at what context cost. CPG (cost-per-gain) = covered classes per 1k skill tokens — the metric that
 * answers "does each distilled skill earn its tokens?" (Self-Evolving-Agents survey, arXiv:2507.21046). */
export function efficacyReport(rows: Row[], skills: SkillLite[]): EfficacyReport {
  const classes = recurringFailureClasses(rows);
  const uncovered: string[] = [];
  let covered = 0;
  for (const c of classes) {
    if (skills.some((s) => skillCovers(s, c))) covered++;
    else uncovered.push(c.key);
  }
  const skillTokens = skills.reduce((sum, s) => sum + Math.ceil(s.body.length / 4), 0);
  return {
    classes: classes.length,
    covered,
    coverage: classes.length ? Number((covered / classes.length).toFixed(3)) : 0,
    skillTokens,
    cpg: skillTokens ? Number((covered / (skillTokens / 1000)).toFixed(3)) : 0,
    uncovered,
  };
}

/** NON-REGRESSION guard: a prune/merge must not drop coverage of a STILL-RECURRING failure. Returns
 * ok=false (→ BLOCK the prune) when removing skills would orphan a failure class the library still needs to
 * cover — i.e. the skill is still earning its context even with a 0 usage counter. This is the
 * "misevolution" guardrail (Self-Evolving-Agents survey): a self-editing loop must never lower aggregate
 * task success while tidying. */
export function nonRegressionGuard(rows: Row[], before: SkillLite[], after: SkillLite[]): RegressionVerdict {
  const classes = recurringFailureClasses(rows);
  const coveredBefore = classes.filter((c) => before.some((s) => skillCovers(s, c))).map((c) => c.key);
  const coveredAfter = new Set(classes.filter((c) => after.some((s) => skillCovers(s, c))).map((c) => c.key));
  const lost = coveredBefore.filter((k) => !coveredAfter.has(k));
  return { ok: lost.length === 0, before: coveredBefore.length, after: coveredAfter.size, lost };
}
