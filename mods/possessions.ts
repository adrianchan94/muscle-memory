import { loadInvocations } from "./invocation";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { STATE_DIR, redactFragment } from "./core";
import {
  isInstrumentVerificationReceipt,
  isStoredVerificationReceiptBound,
  normalizeInstrumentVerificationReceipt,
  normalizeVerificationBinding,
  type InstrumentVerificationReceipt,
  type VerificationBinding,
} from "./verification";

export const POSSESSION_LEDGER_PATH = join(STATE_DIR, "possessions.jsonl");
import { loadInstrumentKey, signEvidencePayload, verifyEvidenceSignature, onInstrumentKeyChange } from "./instrument";

let keyCache: { keyId: string; secret: Buffer } | null | undefined;
/** Resolved once per process; absence is a normal state that disables `verified`, not an error. */
function currentInstrumentKey(): { keyId: string; secret: Buffer } | null {
  // Only a SUCCESSFUL lookup is cached. Caching absence is a trap: a summarize that runs before
  // `instrument init` would pin `null` for the life of the process, and every later signature
  // would be skipped silently - the key exists on disk, the rows land unsigned, and the
  // scoreboard reads zero for no visible reason. Re-resolving a miss costs one stat per
  // verified append, which is nothing next to lying about evidence.
  if (keyCache) return keyCache;
  const loaded = loadInstrumentKey({ stateDir: STATE_DIR });
  keyCache = loaded.available ? { keyId: loaded.keyId, secret: loaded.secret } : null;
  return keyCache;
}
export function __resetInstrumentKeyCache(): void { keyCache = undefined; }
// Belt and braces: a key created mid-process drops any cached miss immediately.
onInstrumentKeyChange(() => { keyCache = undefined; });

export const POSSESSION_SCHEMA = "mm.possession.v1" as const;

/** Why a stored `verified` row did not authenticate. Each is counted separately so a downgrade
 *  is visible in the Decision Report rather than silently reclassified. */
export type EvidenceDowngradeReason =
  | "legacy_unsigned" | "missing_signature" | "bad_signature" | "key_unavailable" | "unknown_key"
  // An authentic signature lifted off a DIFFERENT possession and pasted onto this row. Its own
  // reason because a reviewer must be able to see credit theft as distinct from a lost key.
  | "evidence_transplanted"
  // The signature was valid but the unsigned row disagrees with it about WHO earned the credit
  // or WHAT the result was. A valid signature on a mislabelled row is a false jersey.
  | "attribution_mismatch";

/** Why an authenticated row still earned no procedural credit. Artifact truth and causation are
 *  separate questions: a target that was already correct proves nothing about the skill. */
export type ProceduralDenialReason =
  | "no_gap_to_close" | "no_observed_invocation" | "invocation_precedes_baseline" | "artifact_mismatch";

export type StoredEvidenceVerdict = {
  authenticated: boolean;
  reason?: EvidenceDowngradeReason;
  artifactVerified: boolean;
  proceduralCredit: boolean;
  proceduralReason?: ProceduralDenialReason;
  resultClass: string;
};

/**
 * Decide what a persisted evidence row is actually worth.
 *
 * Authenticity first: an unsigned or badly signed row is not `verified`, no matter how well
 * formed it is. Then causation, which is a strictly separate test — a pre-existing correct
 * target or an absent invocation yields artifact truth only.
 */
export function authenticateStoredEvidence(input: {
  evidence?: { payload?: Record<string, unknown>; signature?: unknown };
  key: { keyId: string; secret: Buffer } | null;
  invocationObservedAt?: number;
}): StoredEvidenceVerdict {
  const deny = (reason: EvidenceDowngradeReason): StoredEvidenceVerdict =>
    ({ authenticated: false, reason, artifactVerified: false, proceduralCredit: false, resultClass: "neutral" });

  const payload = input.evidence?.payload;
  if (!input.evidence || !payload) return deny("legacy_unsigned");
  if (!input.key) return deny("key_unavailable");
  if (payload.key_id !== input.key.keyId) return deny("unknown_key");
  if (input.evidence.signature === undefined) return deny("missing_signature");
  if (!verifyEvidenceSignature(payload, input.evidence.signature, input.key).ok) return deny("bad_signature");

  const artifactVerified = payload.final_sha256 === payload.expected_sha256;
  const hadGap = payload.baseline_sha256 !== payload.expected_sha256;
  const invoked = !!String(payload.invocation_receipt_id || "").trim();
  const invocationAfterBaseline = input.invocationObservedAt === undefined
    || input.invocationObservedAt >= Number(payload.baseline_captured_at);

  let proceduralReason: ProceduralDenialReason | undefined;
  if (!hadGap) proceduralReason = "no_gap_to_close";
  else if (!invoked) proceduralReason = "no_observed_invocation";
  else if (!invocationAfterBaseline) proceduralReason = "invocation_precedes_baseline";
  else if (!artifactVerified) proceduralReason = "artifact_mismatch";

  const proceduralCredit = proceduralReason === undefined;
  // A mismatch only counts as harm when an invocation was actually observed; otherwise the
  // instrument saw a wrong file, not a skill that broke something.
  const resultClass = artifactVerified
    ? (proceduralCredit ? String(payload.result_class) : "neutral")
    : (invoked ? "harmed" : "neutral");

  return { authenticated: true, artifactVerified, proceduralCredit, proceduralReason, resultClass };
}

export const EFFICIENCY_CONTRACT = Object.freeze({
  id: "mm.efficiency.v2" as const,
  numerator: "same_tier_helped_prescriptions + same_tier_successful_abstentions",
  denominator: "same_tier_scored_evaluated_decisions",
  neutralPolicy: "neutral_prescriptions_remain_in_denominator",
  harmPolicy: "harmful_prescriptions_remain_in_denominator_and_report_separately",
  verifiedPolicy: "agent_callers_cannot_self_award_verified; exact-file adapter binds pre-work manifest + instrument receipt",
  earnedMinute: "same_tier_helped_prescription | same_tier_successful_abstention; useful routing decision, not literal skill invocation",
  repeatCapPerTaskClass: 3,
  minimumUniqueTaskClasses: 3,
  minimumClosureRatePct: 80,
  percentageDisplayThreshold: 10,
});

export type EvidenceTier = "verified" | "human_judged" | "agent_judged";
export type DecisionAction = "prescribe" | "abstain";
export type DecisionRoute = "matched" | "no-gap" | "weak-match" | "ambiguous" | "negative-field" | "no-safe-match";
export type DifficultyTier = "routine" | "standard" | "hard" | "unknown";
export type OutcomeResult = "helped" | "harmed" | "neutral" | "succeeded_unaided" | "failed_unaided";
export type LifecycleAction = "learn" | "update" | "graduate" | "retire" | "restore";
export type ExclusionReason = "malformed_json" | "invalid_schema" | "unknown_enum" | "duplicate_event_id" | "duplicate_decision" | "orphan_outcome" | "duplicate_outcome" | "invalid_supersession" | "incompatible_outcome";
export type ScoreStatus = "blocked" | "incomplete" | "early_tape" | "exploratory" | "claim_eligible";

const DECISION_ACTIONS = new Set<DecisionAction>(["prescribe", "abstain"]);
const DECISION_ROUTES = new Set<DecisionRoute>(["matched", "no-gap", "weak-match", "ambiguous", "negative-field", "no-safe-match"]);
const DIFFICULTIES = new Set<DifficultyTier>(["routine", "standard", "hard", "unknown"]);
const OUTCOMES = new Set<OutcomeResult>(["helped", "harmed", "neutral", "succeeded_unaided", "failed_unaided"]);
const EVIDENCE_TIERS = new Set<EvidenceTier>(["verified", "human_judged", "agent_judged"]);
const LIFECYCLE_ACTIONS = new Set<LifecycleAction>(["learn", "update", "graduate", "retire", "restore"]);
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const emptyExclusions = (): Record<ExclusionReason, number> => ({
  malformed_json: 0,
  invalid_schema: 0,
  unknown_enum: 0,
  duplicate_event_id: 0,
  duplicate_decision: 0,
  orphan_outcome: 0,
  duplicate_outcome: 0,
  invalid_supersession: 0,
  incompatible_outcome: 0,
});

export type EventBase = {
  schema: typeof POSSESSION_SCHEMA;
  event_id: string;
  possession_id: string;
  ts: number;
};

export type PossessionDecisionEvent = EventBase & {
  type: "decision";
  agent: string;
  model: string;
  action: DecisionAction;
  task_class: string;
  difficulty?: DifficultyTier;
  eligible?: true;
  gap_observed: boolean;
  route: DecisionRoute;
  skill?: string;
  verification?: VerificationBinding;
};

export type PossessionOutcomeEvent = EventBase & {
  type: "outcome";
  result: OutcomeResult;
  evidence_tier: EvidenceTier;
  reason: string;
  evidence_ref?: string;
  supersedes_event_id?: string;
  verification?: InstrumentVerificationReceipt;
  evidence?: { payload?: Record<string, unknown>; signature?: unknown };
};

export type PossessionLifecycleEvent = EventBase & {
  type: "lifecycle";
  action: LifecycleAction;
  skill: string;
  reason: string;
};

export type PossessionEvent = PossessionDecisionEvent | PossessionOutcomeEvent | PossessionLifecycleEvent;

export type LedgerIntegrity = {
  blocked: boolean;
  ledgerSha256: string;
  rowCount: number;
  validRows: number;
  malformedRows: number;
  unknownEnumRows: number;
  excludedRows: number;
  excludedPossessionIds: string[];
  excludedDecisionPossessionIds: string[];
  orphanOutcomes: number;
  exclusionReasons: Record<ExclusionReason, number>;
};

export type SafePossessionView = {
  possessionId: string;
  taskClass: string;
  difficulty: DifficultyTier;
  action: DecisionAction;
  route: DecisionRoute;
  skill?: string;
  openedAt: number;
  result?: OutcomeResult;
  evidence: "none" | "judged" | "bound_verified";
};

export type PossessionSummary = {
  metricContract: typeof EFFICIENCY_CONTRACT.id;
  percentageDisplayThreshold: number;
  scoreStatus: ScoreStatus;
  ledgerIntegrity: "ok" | "blocked";
  ledgerSha256: string;
  ledgerRows: number;
  eligibleExposures: number;
  openedDecisions: number;
  closedDecisions: number;
  pendingDecisions: number;
  excludedDecisions: number;
  exclusionReasons: Record<ExclusionReason, number>;
  closureRatePct: number | null;
  decisions: number;
  evaluatedDecisions: number;
  scoredDecisions: number;
  repeatCappedDecisions: number;
  uniqueTaskClasses: number;
  difficultyStrata: Record<DifficultyTier, number>;
  goodDecisions: number;
  prescribed: number;
  abstained: number;
  observedInterventions: number;
  observedHelpfulInterventions: number;
  observedHarmfulInterventions: number;
  observedNeutralInterventions: number;
  observedAbstentions: number;
  observedSuccessfulAbstentions: number;
  observedFailedAbstentions: number;
  helpfulInterventions: number;
  harmfulInterventions: number;
  neutralInterventions: number;
  successfulAbstentions: number;
  failedAbstentions: number;
  verifiedSuccessfulAbstentions: number;
  verifiedEvaluatedAbstentions: number;
  judgedSuccessfulAbstentions: number;
  judgedEvaluatedAbstentions: number;
  judgedOnlyAbstentions: number;
  contextsAvoided: number;
  interferenceAbstentions: number;
  verifiedDecisions: number;
  verifiedGoodDecisions: number;
  judgedDecisions: number;
  judgedGoodDecisions: number;
  unboundVerifiedDowngraded: number;
  /** Authentic evidence found on a row it does not describe — credit theft, counted separately. */
  transplantDemoted: number;
  /** Signature valid, but the row disagreed about who or what earned it. */
  attributionMismatch: number;
  verifiedNeutralDecisions: number;
  decisionEfficiencyPct: number | null;
  verifiedEfficiencyPct: number | null;
  judgedEfficiencyPct: number | null;
  restraintEfficiencyPct: number | null;
  harmRatePct: number | null;
  skillsLearned: number;
  skillsUpdated: number;
  skillsRetired: number;
  skillsRestored: number;
  latestPendingPossession: SafePossessionView | null;
  lastPlay: SafePossessionView | null;
};

function assertSafeId(label: string, value: unknown) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${label} must be a bounded safe identifier`);
}

function assertSafeSlug(label: string, value: unknown) {
  if (typeof value !== "string" || !SAFE_SLUG.test(value)) throw new Error(`${label} must be a lowercase slug, not raw task text`);
}

function compatible(action: DecisionAction, result: OutcomeResult): boolean {
  return action === "prescribe"
    ? result === "helped" || result === "harmed" || result === "neutral"
    : result === "succeeded_unaided" || result === "failed_unaided";
}

function normalizeEvent(input: unknown, mode: "read" | "caller" | "instrument"): PossessionEvent {
  if (!input || typeof input !== "object") throw new Error("event must be an object");
  const event = input as Record<string, any>;
  if (event.schema !== POSSESSION_SCHEMA) throw new Error(`schema must be ${POSSESSION_SCHEMA}`);
  assertSafeId("event_id", event.event_id);
  assertSafeId("possession_id", event.possession_id);
  if (!Number.isFinite(event.ts) || event.ts < 0) throw new Error("ts must be a non-negative number");

  if (event.type === "decision") {
    if (!DECISION_ACTIONS.has(event.action)) throw new Error("action must be prescribe|abstain");
    if (!DECISION_ROUTES.has(event.route)) throw new Error("route is not a known decision route");
    const difficulty: DifficultyTier = event.difficulty ?? "unknown";
    if (!DIFFICULTIES.has(difficulty)) throw new Error("difficulty must be routine|standard|hard|unknown");
    assertSafeSlug("task_class", event.task_class);
    if (event.skill !== undefined) assertSafeSlug("skill", event.skill);
    if (event.action === "prescribe" && !event.skill) throw new Error("prescribe decisions require a skill");
    if (event.action === "abstain" && event.skill) throw new Error("abstain decisions cannot inject a skill");
    const verification = event.verification === undefined ? undefined : normalizeVerificationBinding(event.verification);
    if (verification && event.action !== "prescribe") throw new Error("verification binding supports prescribed-skill possessions only");
    if (verification && verification.task_class !== event.task_class) throw new Error("verification binding task_class must match the decision");
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
      ...(event.skill ? { skill: event.skill } : {}),
      ...(verification ? { verification } : {}),
    };
  }

  if (event.type === "outcome") {
    if (!OUTCOMES.has(event.result)) throw new Error("result is not a known outcome");
    if (!EVIDENCE_TIERS.has(event.evidence_tier)) throw new Error("evidence_tier is not known");
    if (mode === "caller" && event.evidence_tier === "verified") {
      throw new Error("instrument-derived verification is required; callers must use human_judged or agent_judged");
    }
    if (event.evidence_tier !== "verified" && event.verification !== undefined) {
      throw new Error("judged outcomes cannot carry a verification receipt");
    }
    let verification: InstrumentVerificationReceipt | undefined;
    if (event.evidence_tier === "verified" && event.verification !== undefined) {
      verification = normalizeInstrumentVerificationReceipt(event.verification);
    }
    if (mode === "instrument") {
      if (event.evidence_tier !== "verified" || !verification || !isInstrumentVerificationReceipt(event.verification)) {
        throw new Error("instrument-owned receipt is required for verified append");
      }
    }
    if (!String(event.reason || "").trim()) throw new Error("outcomes require a reason");
    if (event.supersedes_event_id) assertSafeId("supersedes_event_id", event.supersedes_event_id);
    return {
      schema: POSSESSION_SCHEMA,
      event_id: event.event_id,
      possession_id: event.possession_id,
      ts: event.ts,
      type: "outcome",
      result: event.result,
      evidence_tier: event.evidence_tier,
      reason: redactFragment(String(event.reason), 4, 320),
      ...(event.evidence_ref ? { evidence_ref: redactFragment(String(event.evidence_ref), 2, 180) } : {}),
      ...(event.supersedes_event_id ? { supersedes_event_id: event.supersedes_event_id } : {}),
      ...(event.evidence ? { evidence: event.evidence } : {}),
      ...(verification ? { verification } : {}),
    };
  }

  if (event.type === "lifecycle") {
    if (!LIFECYCLE_ACTIONS.has(event.action)) throw new Error("lifecycle action is not known");
    assertSafeSlug("skill", event.skill);
    if (!String(event.reason || "").trim()) throw new Error("lifecycle events require a reason");
    return {
      schema: POSSESSION_SCHEMA,
      event_id: event.event_id,
      possession_id: event.possession_id,
      ts: event.ts,
      type: "lifecycle",
      action: event.action,
      skill: event.skill,
      reason: redactFragment(String(event.reason), 4, 320),
    };
  }

  throw new Error("type is not a known possession event");
}

function classifyNormalizationError(error: unknown, raw: any): ExclusionReason {
  const message = String((error as any)?.message || error);
  if (message.includes("schema")) return "invalid_schema";
  if (message.includes("action") || message.includes("route") || message.includes("difficulty") || message.includes("result") || message.includes("evidence_tier") || message.includes("type")) return "unknown_enum";
  return raw?.type === "decision" ? "unknown_enum" : "invalid_schema";
}

export function inspectPossessionLedger(): { events: PossessionEvent[]; integrity: LedgerIntegrity } {
  const rawText = existsSync(POSSESSION_LEDGER_PATH) ? readFileSync(POSSESSION_LEDGER_PATH, "utf8") : "";
  const lines = rawText.split("\n").filter((line) => line.trim());
  const exclusions = emptyExclusions();
  const excludedPossessions = new Set<string>();
  const excludedDecisionPossessions = new Set<string>();
  const seenEventIds = new Set<string>();
  const events: PossessionEvent[] = [];
  const decisions = new Map<string, PossessionDecisionEvent>();
  const activeOutcomes = new Map<string, PossessionOutcomeEvent>();
  let malformedRows = 0;
  let unknownEnumRows = 0;

  for (const line of lines) {
    let raw: any;
    try {
      raw = JSON.parse(line);
    } catch {
      malformedRows++;
      exclusions.malformed_json++;
      continue;
    }
    let event: PossessionEvent;
    try {
      event = normalizeEvent(raw, "read");
    } catch (error) {
      const reason = classifyNormalizationError(error, raw);
      exclusions[reason]++;
      if (reason === "unknown_enum") unknownEnumRows++;
      if (typeof raw?.possession_id === "string") {
        excludedPossessions.add(raw.possession_id);
        if (raw?.type === "decision") excludedDecisionPossessions.add(raw.possession_id);
      }
      continue;
    }

    if (seenEventIds.has(event.event_id)) {
      exclusions.duplicate_event_id++;
      excludedPossessions.add(event.possession_id);
      if (event.type === "decision" || decisions.has(event.possession_id)) excludedDecisionPossessions.add(event.possession_id);
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
      ledgerSha256: createHash("sha256").update(rawText).digest("hex"),
      rowCount: lines.length,
      validRows: events.length,
      malformedRows,
      unknownEnumRows,
      excludedRows,
      excludedPossessionIds: [...excludedPossessions].sort(),
      excludedDecisionPossessionIds: [...excludedDecisionPossessions].sort(),
      orphanOutcomes: exclusions.orphan_outcome,
      exclusionReasons: exclusions,
    },
  };
}

/** Append one validated event. Existing rows are never edited or deleted. */
function appendPossessionEvent(input: PossessionEvent, mode: "caller" | "instrument"): PossessionEvent {
  const clean = normalizeEvent(input, mode);
  const inspection = inspectPossessionLedger();
  if (inspection.integrity.blocked) throw new Error("ledger integrity is BLOCKED; repair custody before appending");
  if (inspection.events.some((row) => row.event_id === clean.event_id)) throw new Error(`duplicate event_id '${clean.event_id}'`);

  const decisions = inspection.events.filter((row): row is PossessionDecisionEvent => row.type === "decision");
  const outcomes = inspection.events.filter((row): row is PossessionOutcomeEvent => row.type === "outcome");
  if (clean.type === "decision" && decisions.some((row) => row.possession_id === clean.possession_id)) {
    throw new Error(`decision already exists for possession '${clean.possession_id}'`);
  }
  if (clean.type === "outcome") {
    const decision = decisions.find((row) => row.possession_id === clean.possession_id);
    if (!decision) throw new Error(`cannot record orphan outcome for '${clean.possession_id}'`);
    if (!compatible(decision.action, clean.result)) throw new Error(`result '${clean.result}' is incompatible with decision '${decision.action}'`);
    if (clean.evidence_tier === "verified") {
      if (!decision.verification || !clean.verification || !isStoredVerificationReceiptBound(decision.verification, clean.verification, decision.possession_id, decision.event_id)) {
        throw new Error("verified outcome is not bound to the possession decision and stored manifest");
      }
      // The receipt decides the result class, not the caller. A match without procedural credit
      // is neutral: the artifact is right, but the prescription did not make it so.
      const expectedResult = !clean.verification.matched ? "harmed"
        : clean.verification.procedural_credit ? "helped" : "neutral";
      if (clean.result !== expectedResult) {
        throw new Error("verified outcome result does not match the instrument receipt");
      }
    }
    const active = outcomes.filter((row) => row.possession_id === clean.possession_id).at(-1);
    if (active && !clean.supersedes_event_id) throw new Error(`active outcome already exists for '${clean.possession_id}'`);
    if (active && clean.supersedes_event_id !== active.event_id) throw new Error("supersedes_event_id must bind the active outcome");
    if (!active && clean.supersedes_event_id) throw new Error("cannot supersede a missing outcome");
  }

  mkdirSync(dirname(POSSESSION_LEDGER_PATH), { recursive: true });
  appendFileSync(POSSESSION_LEDGER_PATH, `${JSON.stringify(clean)}\n`, "utf8");
  return clean;
}

export function recordPossessionEvent(input: PossessionEvent): PossessionEvent {
  return appendPossessionEvent(input, "caller");
}

/**
 * The instrument signs what it derived, so the row can still be trusted after a restart.
 *
 * Without this the WeakSet custody check dies at the process boundary and a reader has no way to
 * tell an instrument-derived row from a hand-written one — which is exactly how the forgery
 * worked. If no key is available the row is still appended, and simply scores as judged.
 */
export function recordInstrumentVerifiedOutcome(input: PossessionOutcomeEvent, context?: { baselineSha256?: string; baselineCapturedAt?: number; invocationReceiptId?: string; skill?: string }): PossessionOutcomeEvent {
  const key = currentInstrumentKey();
  const receipt = input.verification;
  // Never sign a hollow credit. If the receipt claims the prescription caused the change, the
  // signed payload must name the invocation that proves it. Silence here is how a legitimate
  // receipt got demoted and how an illegitimate one could have been signed.
  if (receipt && typeof receipt === "object" && (receipt as Record<string, unknown>).procedural_credit === true) {
    const namedId = String(context?.invocationReceiptId ?? "").trim();
    if (!namedId) throw new Error("procedural credit requires an observed invocation receipt id at the signing boundary");
    // The id must resolve to a MAC-authenticated observation owned by THIS possession. An id
    // alone is just a string; without this the signer notarizes an unverified claim.
    const owned = loadInvocations().some((row) => row.invocation_id === namedId && row.possession_id === input.possession_id);
    if (!owned) throw new Error("procedural credit names an invocation that is not an authenticated observation of this possession");
  }
  if (key && receipt && typeof receipt === "object") {
    const r = receipt as Record<string, unknown>;
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
      result_class: input.result,
    };
    const signed = { ...input, evidence: { payload, signature: signEvidencePayload(payload, key) } } as PossessionOutcomeEvent;
    return appendPossessionEvent(signed, "instrument") as PossessionOutcomeEvent;
  }
  return appendPossessionEvent(input, "instrument") as PossessionOutcomeEvent;
}

export function loadPossessionEvents(): PossessionEvent[] {
  return inspectPossessionLedger().events;
}

const pct = (good: number, total: number): number | null => total ? Math.round((100 * good) / total) : null;
const cleanIntegrity = (): LedgerIntegrity => ({
  blocked: false,
  ledgerSha256: createHash("sha256").update("").digest("hex"),
  rowCount: 0,
  validRows: 0,
  malformedRows: 0,
  unknownEnumRows: 0,
  excludedRows: 0,
  excludedPossessionIds: [],
  excludedDecisionPossessionIds: [],
  orphanOutcomes: 0,
  exclusionReasons: emptyExclusions(),
});

const safePossessionView = (decision: PossessionDecisionEvent, outcome?: PossessionOutcomeEvent): SafePossessionView => ({
  possessionId: decision.possession_id,
  taskClass: decision.task_class,
  difficulty: decision.difficulty ?? "unknown",
  action: decision.action,
  route: decision.route,
  ...(decision.skill ? { skill: decision.skill } : {}),
  openedAt: decision.ts,
  ...(outcome ? {
    result: outcome.result,
    evidence: claimBearingVerdict(decision, outcome).verified
      ? "bound_verified" as const
      : "judged" as const,
  } : { evidence: "none" as const }),
});

export function pendingPossessionViews(events: PossessionEvent[]): SafePossessionView[] {
  const outcomes = new Set(events.filter((event) => event.type === "outcome").map((event) => event.possession_id));
  return events
    .filter((event): event is PossessionDecisionEvent => event.type === "decision" && !outcomes.has(event.possession_id))
    .sort((a, b) => b.ts - a.ts)
    .map((decision) => safePossessionView(decision));
}

/**
 * THE claim authority. Every path that can award `verified`, `proven` or a verified `helped`
 * must go through this and nothing else.
 *
 * A previous cut added an HMAC authenticator and left the scoring path on the old structural
 * binder, so a shaped forgery still scored while the unit tests stayed green. Structural
 * binding is therefore diagnostic only from here on — it can never be the proof.
 */
export function claimBearingVerdict(
  decision: { verification?: unknown; possession_id: string; event_id: string },
  outcome: { evidence_tier?: string; verification?: unknown; evidence?: { payload?: Record<string, unknown>; signature?: unknown } },
): { verified: boolean; proceduralCredit: boolean; downgrade?: EvidenceDowngradeReason; proceduralReason?: ProceduralDenialReason; attributedSkill?: string } {
  if (outcome.evidence_tier !== "verified") return { verified: false, proceduralCredit: false };

  const key = currentInstrumentKey();
  const verdict = authenticateStoredEvidence({ evidence: outcome.evidence, key });
  if (!verdict.authenticated) return { verified: false, proceduralCredit: false, downgrade: verdict.reason };

  // Structural binding still has to hold, but only as a second gate behind authenticity.
  const structurallyBound = !!decision.verification && !!outcome.verification
    && isStoredVerificationReceiptBound(decision.verification, outcome.verification, decision.possession_id, decision.event_id);
  if (!structurallyBound) return { verified: false, proceduralCredit: false, downgrade: "bad_signature" };

  // CROSS-BIND. Authenticity and structure were two self-consistent gates that never compared
  // notes: the signature proved a payload was genuine, the binder proved a receipt belonged to
  // this decision, and nothing proved the payload and the receipt described the SAME event.
  // An authentic payload lifted from another possession therefore rode in on this row's own
  // valid receipt and was awarded credit, invisibly. The payload must now name this row.
  const payload = (outcome.evidence?.payload ?? {}) as Record<string, unknown>;
  const receipt = outcome.verification as Record<string, unknown>;
  // A non-boolean procedural_credit must never be coerced into truth.
  if (receipt.procedural_credit !== undefined && typeof receipt.procedural_credit !== "boolean") {
    return { verified: false, proceduralCredit: false, downgrade: "evidence_transplanted" };
  }
  const sameRow = String(payload.possession_id ?? "") === decision.possession_id
    && String(payload.decision_event_id ?? "") === decision.event_id;
  const sameInstrumentEvent = String(payload.task_id ?? "") === String(receipt.task_id ?? "")
    && String(payload.manifest_sha256 ?? "") === String(receipt.manifest_sha256 ?? "")
    && String(payload.expected_sha256 ?? "") === String(receipt.artifact_sha256 ?? "");
  if (!sameRow || !sameInstrumentEvent) {
    return { verified: false, proceduralCredit: false, downgrade: "evidence_transplanted" };
  }

  // ATTRIBUTION. The payload is signed; decision.skill and outcome.result are not. A ledger-only
  // edit of either leaves the signature valid while every agent-facing surface — roster, proven
  // names, status line — credits the wrong skill or the wrong outcome. Authenticated identity
  // wins, and any disagreement refuses rather than displays.
  const attributedSkill = String(payload.skill ?? "");
  const attributedResult = String(payload.result_class ?? "");
  const skillDisagrees = !!decision.skill && attributedSkill !== decision.skill;
  const resultDisagrees = !!outcome.result && !!attributedResult && attributedResult !== outcome.result;
  if (skillDisagrees || resultDisagrees) {
    return { verified: false, proceduralCredit: false, downgrade: "attribution_mismatch" };
  }
  // The invocation named in the payload must also belong to THIS possession. Without this a
  // signature could name a real invocation that happened under someone else's work.
  const namedInvocation = String(payload.invocation_receipt_id ?? "").trim();
  if (namedInvocation) {
    const owned = loadInvocations().some((row) => row.invocation_id === namedInvocation && row.possession_id === decision.possession_id);
    if (!owned) return { verified: false, proceduralCredit: false, downgrade: "evidence_transplanted" };
  }

  // `verified` is about PROVENANCE, not about whether the artifact matched. A verified negative
  // is still instrument-derived evidence and must count as verified; whether it matched decides
  // the result class, not the tier. Conflating the two suppressed genuine negatives.
  return { verified: true, proceduralCredit: verdict.proceduralCredit, proceduralReason: verdict.proceduralReason, attributedSkill };
}

/** Derive score from explicit exposures and closed outcomes. Usage and pending rows never become wins. */
export function summarizePossessions(events: PossessionEvent[], integrity: LedgerIntegrity = cleanIntegrity()): PossessionSummary {
  const decisions = events.filter((event): event is PossessionDecisionEvent => event.type === "decision");
  const activeOutcomes = new Map<string, PossessionOutcomeEvent>();
  for (const event of events) if (event.type === "outcome") activeOutcomes.set(event.possession_id, event);
  const excludedIds = new Set(integrity.excludedDecisionPossessionIds);
  const repeatCounts = new Map<string, number>();
  const difficultyStrata: Record<DifficultyTier, number> = { routine: 0, standard: 0, hard: 0, unknown: 0 };

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
    if (excludedIds.has(decision.possession_id)) continue;
    const outcome = activeOutcomes.get(decision.possession_id);
    if (!outcome || !compatible(decision.action, outcome.result)) continue;
    evaluatedDecisions++;
    if (decision.action === "prescribe") {
      observedInterventions++;
      if (outcome.result === "helped") observedHelpfulInterventions++;
      if (outcome.result === "harmed") observedHarmfulInterventions++;
      if (outcome.result === "neutral") observedNeutralInterventions++;
    } else {
      observedAbstentions++;
      if (outcome.result === "succeeded_unaided") observedSuccessfulAbstentions++;
      if (outcome.result === "failed_unaided") observedFailedAbstentions++;
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
    if (outcome.evidence_tier === "verified" && !boundVerified) unboundVerifiedDowngraded++;
    if (verdict.downgrade === "evidence_transplanted") transplantDemoted++;
    if (verdict.downgrade === "attribution_mismatch") attributionMismatch++;
    let good = false;

    if (decision.action === "prescribe") {
      prescribedEvaluated++;
      // A verified row only earns `helped` when causation was observed; a pre-existing correct
      // target proves the artifact, not the skill.
      const creditable = !boundVerified || verdict.proceduralCredit;
      if (outcome.result === "helped" && creditable) { helpfulInterventions++; good = true; }
      else if (outcome.result === "helped") { neutralInterventions++; if (boundVerified) verifiedNeutralDecisions++; }
      if (outcome.result === "harmed") harmfulInterventions++;
      // Neutral arrives two ways: the instrument derived it (artifact right, nothing caused),
      // or a helped claim was demoted above. Both are neutral; only the bound ones are verified.
      if (outcome.result === "neutral") { neutralInterventions++; if (boundVerified) verifiedNeutralDecisions++; }
    } else {
      if (outcome.result === "succeeded_unaided") {
        successfulAbstentions++;
        good = true;
      } else {
        failedAbstentions++;
      }
      if (boundVerified) {
        verifiedEvaluatedAbstentions++;
        if (good) verifiedSuccessfulAbstentions++;
      } else {
        judgedEvaluatedAbstentions++;
        judgedOnlyAbstentions++;
        if (good) judgedSuccessfulAbstentions++;
      }
    }

    if (boundVerified) {
      verifiedDecisions++;
      if (good) verifiedGood++;
    } else {
      judgedDecisions++;
      if (good) judgedGood++;
    }
  }

  const lifecycle = events.filter((event): event is PossessionLifecycleEvent => event.type === "lifecycle");
  const excludedDecisions = excludedIds.size;
  const validDecisionIds = new Set(decisions.map((decision) => decision.possession_id));
  const excludedDecisionRowsWithoutValidDecision = [...excludedIds].filter((id) => !validDecisionIds.has(id)).length;
  difficultyStrata.unknown += excludedDecisionRowsWithoutValidDecision;
  const openedDecisions = decisions.length + excludedDecisionRowsWithoutValidDecision;
  const closedDecisions = evaluatedDecisions + excludedDecisions;
  const pendingDecisions = Math.max(0, openedDecisions - closedDecisions);
  const closureRatePct = pct(closedDecisions, openedDecisions);
  const uniqueTaskClasses = new Set(decisions.map((decision) => decision.task_class)).size;
  const pendingRows = decisions
    .filter((decision) => !excludedIds.has(decision.possession_id) && !activeOutcomes.has(decision.possession_id))
    .sort((a, b) => b.ts - a.ts);
  const activityTs = (decision: PossessionDecisionEvent) => Math.max(decision.ts, activeOutcomes.get(decision.possession_id)?.ts ?? decision.ts);
  const latestActivityDecision = [...decisions].sort((a, b) => activityTs(b) - activityTs(a))[0];
  const latestPendingPossession = pendingRows[0] ? safePossessionView(pendingRows[0]) : null;
  const lastPlay = latestActivityDecision ? safePossessionView(latestActivityDecision, activeOutcomes.get(latestActivityDecision.possession_id)) : null;
  const goodDecisions = verifiedGood + judgedGood;
  const contextsAvoided = verifiedSuccessfulAbstentions;
  const blocked = integrity.blocked;
  const incomplete = openedDecisions >= EFFICIENCY_CONTRACT.percentageDisplayThreshold && (closureRatePct ?? 0) < EFFICIENCY_CONTRACT.minimumClosureRatePct;
  const exploratory = repeatCappedDecisions > 0 || uniqueTaskClasses < EFFICIENCY_CONTRACT.minimumUniqueTaskClasses || difficultyStrata.unknown > 0;
  const scoreStatus: ScoreStatus = blocked ? "blocked"
    : incomplete ? "incomplete"
      : verifiedDecisions < EFFICIENCY_CONTRACT.percentageDisplayThreshold ? (exploratory ? "exploratory" : "early_tape")
        : exploratory ? "exploratory"
          : "claim_eligible";

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
    lastPlay,
  };
}

export function summarizePossessionLedger(): PossessionSummary {
  const inspection = inspectPossessionLedger();
  return summarizePossessions(inspection.events, inspection.integrity);
}

export type ShareCardPayloadV1 = {
  schema: "mm.share-card.v1";
  metric_contract: typeof EFFICIENCY_CONTRACT.id;
  score_status: ScoreStatus;
  percentage_display_threshold: number;
  period: "EARLY TAPE" | "LAST 7 DAYS" | "LAST 30 DAYS" | "SEASON" | "ALL TIME";
  statement: string;
  opened_decisions: number;
  closed_decisions: number;
  pending_decisions: number;
  excluded_decisions: number;
  closure_rate_pct: number | null;
  eligible_exposures: number;
  scored_exposures: number;
  repeat_capped_exposures: number;
  unique_task_classes: number;
  difficulty_strata: Record<DifficultyTier, number>;
  verified_good_decisions: number;
  verified_neutral_decisions?: number;
  verified_evaluated_decisions: number;
  judged_good_decisions: number;
  judged_evaluated_decisions: number;
  verified_successful_abstentions: number;
  verified_evaluated_abstentions: number;
  judged_successful_abstentions: number;
  judged_failed_abstentions: number;
  judged_only_abstentions: number;
  helpful_interventions: number;
  harmful_interventions: number;
  neutral_interventions: number;
  ledger_integrity: "ok" | "blocked";
  exclusions: Record<ExclusionReason, number>;
  decision_efficiency_pct?: number;
};

const claimBearingShareCustody = new WeakSet<object>();
const SHARE_KEYS = new Set([
  "schema", "metric_contract", "score_status", "percentage_display_threshold", "period", "statement",
  "opened_decisions", "closed_decisions", "pending_decisions", "excluded_decisions", "closure_rate_pct",
  "eligible_exposures", "scored_exposures", "repeat_capped_exposures", "unique_task_classes", "difficulty_strata",
  "verified_good_decisions", "verified_neutral_decisions", "verified_evaluated_decisions", "judged_good_decisions", "judged_evaluated_decisions",
  "verified_successful_abstentions", "verified_evaluated_abstentions", "judged_successful_abstentions", "judged_failed_abstentions", "judged_only_abstentions",
  "helpful_interventions", "harmful_interventions", "neutral_interventions", "ledger_integrity", "exclusions", "decision_efficiency_pct",
]);
const PERIODS = new Set<ShareCardPayloadV1["period"]>(["EARLY TAPE", "LAST 7 DAYS", "LAST 30 DAYS", "SEASON", "ALL TIME"]);
const SCORE_STATUSES = new Set<ScoreStatus>(["blocked", "incomplete", "early_tape", "exploratory", "claim_eligible"]);
const safePeriod = (value: string): Exclude<ShareCardPayloadV1["period"], "EARLY TAPE"> => {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "last_7_days" || normalized === "this_week") return "LAST 7 DAYS";
  if (normalized === "last_30_days" || normalized === "this_month") return "LAST 30 DAYS";
  if (normalized === "season") return "SEASON";
  return "ALL TIME";
};

function shareStatement(card: Pick<ShareCardPayloadV1, "score_status" | "closed_decisions" | "opened_decisions" | "verified_good_decisions" | "verified_evaluated_decisions" | "judged_good_decisions" | "judged_evaluated_decisions" | "decision_efficiency_pct">): string {
  if (card.score_status === "blocked") return "ledger blocked · inspect integrity";
  if (card.score_status === "incomplete") return `${card.closed_decisions} of ${card.opened_decisions} possessions closed · incomplete tape`;
  if (card.score_status === "claim_eligible" && card.decision_efficiency_pct !== undefined) {
    return `${card.verified_good_decisions} of ${card.verified_evaluated_decisions} bound-verified good decisions · ${card.decision_efficiency_pct}%`;
  }
  if (card.verified_evaluated_decisions > 0) return `${card.verified_good_decisions} of ${card.verified_evaluated_decisions} bound-verified good decisions · early tape`;
  return `no bound-verified score · judged tape ${card.judged_good_decisions} of ${card.judged_evaluated_decisions}`;
}

const nonNegativeInt = (label: string, value: unknown) => {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer`);
};

/** Exact runtime boundary for future renderers. Unknown or caller-authored text fields are rejected. */
export function validateShareCardPayload(input: unknown): ShareCardPayloadV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("share payload must be an object");
  const raw = input as Record<string, any>;
  for (const key of Object.keys(raw)) if (!SHARE_KEYS.has(key)) throw new Error(`unexpected field '${key}'`);
  for (const key of SHARE_KEYS) if (key !== "decision_efficiency_pct" && !(key in raw)) throw new Error(`missing field '${key}'`);
  if (raw.schema !== "mm.share-card.v1") throw new Error("schema mismatch");
  if (raw.metric_contract !== EFFICIENCY_CONTRACT.id) throw new Error("metric_contract mismatch");
  if (!SCORE_STATUSES.has(raw.score_status)) throw new Error("score_status mismatch");
  if (!PERIODS.has(raw.period)) throw new Error("period is not allowlisted");
  if (raw.percentage_display_threshold !== EFFICIENCY_CONTRACT.percentageDisplayThreshold) throw new Error("percentage_display_threshold must match the metric contract");
  if (raw.ledger_integrity !== "ok" && raw.ledger_integrity !== "blocked") throw new Error("ledger_integrity mismatch");
  const numeric = [
    "percentage_display_threshold", "opened_decisions", "closed_decisions", "pending_decisions", "excluded_decisions",
    "eligible_exposures", "scored_exposures", "repeat_capped_exposures", "unique_task_classes",
    "verified_good_decisions", "verified_evaluated_decisions", "judged_good_decisions", "judged_evaluated_decisions",
    "verified_successful_abstentions", "verified_evaluated_abstentions", "judged_successful_abstentions",
    "judged_failed_abstentions", "judged_only_abstentions", "helpful_interventions", "harmful_interventions", "neutral_interventions",
  ];
  for (const key of numeric) nonNegativeInt(key, raw[key]);
  if (raw.closure_rate_pct !== null && (!Number.isInteger(raw.closure_rate_pct) || raw.closure_rate_pct < 0 || raw.closure_rate_pct > 100)) throw new Error("closure_rate_pct invalid");
  if (raw.decision_efficiency_pct !== undefined && (!Number.isInteger(raw.decision_efficiency_pct) || raw.decision_efficiency_pct < 0 || raw.decision_efficiency_pct > 100)) throw new Error("decision_efficiency_pct invalid");
  for (const key of DIFFICULTIES) nonNegativeInt(`difficulty_strata.${key}`, raw.difficulty_strata?.[key]);
  if (Object.keys(raw.difficulty_strata || {}).some((key) => !DIFFICULTIES.has(key as DifficultyTier))) throw new Error("difficulty_strata unexpected field");
  for (const key of Object.keys(emptyExclusions())) nonNegativeInt(`exclusions.${key}`, raw.exclusions?.[key]);
  if (Object.keys(raw.exclusions || {}).some((key) => !(key in emptyExclusions()))) throw new Error("exclusions unexpected field");
  const claimBearing = raw.verified_evaluated_decisions > 0 || raw.verified_good_decisions > 0 || raw.decision_efficiency_pct !== undefined;
  if (claimBearing && !claimBearingShareCustody.has(raw)) throw new Error("claim-bearing verified share payload must be constructed from the bound ledger summary");
  const statusSaysBlocked = raw.score_status === "blocked";
  const integritySaysBlocked = raw.ledger_integrity === "blocked";
  if (statusSaysBlocked !== integritySaysBlocked) throw new Error("score_status=blocked must exactly match ledger_integrity=blocked");
  if (raw.opened_decisions !== raw.closed_decisions + raw.pending_decisions) throw new Error("custody arithmetic mismatch: opened must equal closed + pending");
  if (raw.eligible_exposures !== raw.opened_decisions) throw new Error("custody arithmetic mismatch: eligible exposures must equal opened decisions");
  if (raw.closed_decisions < raw.excluded_decisions) throw new Error("custody arithmetic mismatch: excluded exceeds closed");
  if (raw.scored_exposures + raw.repeat_capped_exposures !== raw.closed_decisions - raw.excluded_decisions) throw new Error("custody arithmetic mismatch: scored + repeat-capped must equal evaluated closures");
  if (raw.verified_evaluated_decisions + raw.judged_evaluated_decisions !== raw.scored_exposures) throw new Error("custody arithmetic mismatch: evidence tiers must equal scored exposures");
  if (raw.verified_good_decisions > raw.verified_evaluated_decisions || raw.judged_good_decisions > raw.judged_evaluated_decisions) throw new Error("custody arithmetic mismatch: good decisions exceed same-tier evaluated decisions");
  if (raw.verified_successful_abstentions > raw.verified_evaluated_abstentions) throw new Error("custody arithmetic mismatch: verified abstention successes exceed evaluated abstentions");
  if (raw.judged_successful_abstentions + raw.judged_failed_abstentions !== raw.judged_only_abstentions) throw new Error("custody arithmetic mismatch: judged abstention outcomes must equal judged-only abstentions");
  // The exact-file adapter intentionally verifies prescriptions only. Any verified abstention would require a different bound instrument.
  if (raw.verified_evaluated_abstentions !== 0 || raw.verified_successful_abstentions !== 0) throw new Error("exact-file verification cannot claim verified abstentions");
  const verifiedHelpful = raw.verified_good_decisions;
  // A verified decision is good, harmful, OR verified-with-no-procedural-credit. The third
  // state exists because artifact truth and causation are separate questions.
  const verifiedHarmful = Math.max(0, raw.verified_evaluated_decisions - raw.verified_good_decisions - (raw.verified_neutral_decisions ?? 0));
  const judgedHelpful = raw.helpful_interventions - verifiedHelpful;
  const judgedHarmful = raw.harmful_interventions - verifiedHarmful;
  if (judgedHelpful < 0 || judgedHarmful < 0) throw new Error("custody arithmetic mismatch: verified intervention counts exceed totals");
  // Neutral splits by tier too: a verified decision that earned no procedural credit is recorded
  // neutral, but it belongs to the verified side of the ledger, not the judged side.
  const judgedNeutral = raw.neutral_interventions - (raw.verified_neutral_decisions ?? 0);
  if (judgedNeutral < 0) throw new Error("custody arithmetic mismatch: verified neutral exceeds neutral total");
  if (judgedHelpful + judgedHarmful + judgedNeutral + raw.judged_only_abstentions !== raw.judged_evaluated_decisions) throw new Error("custody arithmetic mismatch: judged intervention and abstention outcomes must equal judged evaluated decisions");
  if (raw.judged_good_decisions !== judgedHelpful + raw.judged_successful_abstentions) throw new Error("custody arithmetic mismatch: judged good decisions must equal judged helped prescriptions + successful abstentions");
  const difficultyTotal = Object.values(raw.difficulty_strata).reduce((sum: number, count: any) => sum + Number(count), 0);
  if (difficultyTotal !== raw.opened_decisions) throw new Error("custody arithmetic mismatch: difficulty strata must equal opened decisions");
  const expectedClosure = raw.opened_decisions ? Math.round((100 * raw.closed_decisions) / raw.opened_decisions) : null;
  if (raw.closure_rate_pct !== expectedClosure) throw new Error("custody arithmetic mismatch: closure rate does not match counts");

  const exploratory = raw.repeat_capped_exposures > 0 || raw.unique_task_classes < EFFICIENCY_CONTRACT.minimumUniqueTaskClasses || raw.difficulty_strata.unknown > 0;
  const incomplete = raw.opened_decisions >= EFFICIENCY_CONTRACT.percentageDisplayThreshold && (raw.closure_rate_pct ?? 0) < EFFICIENCY_CONTRACT.minimumClosureRatePct;
  const claimEligible = raw.verified_evaluated_decisions >= EFFICIENCY_CONTRACT.percentageDisplayThreshold && !exploratory && !incomplete && !integritySaysBlocked;
  const expectedStatus: ScoreStatus = integritySaysBlocked ? "blocked" : incomplete ? "incomplete" : claimEligible ? "claim_eligible" : exploratory ? "exploratory" : "early_tape";
  if (raw.score_status !== expectedStatus) throw new Error(`score_status mismatch: expected ${expectedStatus}`);
  if (claimEligible) {
    const expectedPct = pct(raw.verified_good_decisions, raw.verified_evaluated_decisions);
    if (raw.decision_efficiency_pct !== expectedPct) throw new Error("decision_efficiency_pct must match same-tier bound-verified counts");
    if (raw.period === "EARLY TAPE") throw new Error("claim-eligible share card requires an allowlisted reporting period");
  } else {
    if (raw.decision_efficiency_pct !== undefined) throw new Error("percentage is allowed only for claim-eligible bound-verified tape");
    if (raw.period !== "EARLY TAPE") throw new Error("non-claim-bearing share card must remain EARLY TAPE");
  }
  if (raw.statement !== shareStatement(raw as ShareCardPayloadV1)) throw new Error("statement must be derived from aggregate fields");
  return raw as ShareCardPayloadV1;
}

/** Privacy by construction: aggregate allowlist only; no free-form identity exists in the payload. */
export function buildShareCardPayload(summary: PossessionSummary, options: { period: string }): ShareCardPayloadV1 {
  if (summary.verifiedDecisions > 0) {
    const live = summarizePossessionLedger();
    if (summary.ledgerSha256 !== live.ledgerSha256
      || summary.verifiedDecisions !== live.verifiedDecisions
      || summary.verifiedGoodDecisions !== live.verifiedGoodDecisions
      || summary.scoredDecisions !== live.scoredDecisions) {
      throw new Error("claim-bearing share payload must match the current bound ledger summary");
    }
  }
  const percentageAllowed = summary.scoreStatus === "claim_eligible" && summary.verifiedDecisions >= EFFICIENCY_CONTRACT.percentageDisplayThreshold;
  const period = percentageAllowed ? safePeriod(options.period) : "EARLY TAPE";
  const base: ShareCardPayloadV1 = {
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
    ...(percentageAllowed && summary.verifiedEfficiencyPct !== null ? { decision_efficiency_pct: summary.verifiedEfficiencyPct } : {}),
  };
  base.statement = shareStatement(base);
  if (base.verified_evaluated_decisions > 0 || base.decision_efficiency_pct !== undefined) claimBearingShareCustody.add(base);
  return validateShareCardPayload(base);
}
