/**
 * muscle-memory — turns repeated reps into skills, and forgets the ones that don't earn their context.
 *
 * A Letta Code mod that watches your real tool-use, mines recurring workflows/fixes,
 * drafts SKILL.md playbooks (with receipts), keeps writes behind an approval gate, and runs a full
 * anti-bloat lifecycle (born-hard -> usage-tracked -> retired/merged -> capped).
 *
 * ── D1: OBSERVE ──────────────────────────────────────────────────────────────
 * tool_start  -> append a REDACTED fingerprint of every tool call to an experience log.
 * conversation_close -> write a session summary row.
 *
 * ── D2: DETECT ───────────────────────────────────────────────────────────────
 * Deterministic miner over the experience log:
 *  - command-template clustering (recurring Bash/file templates)
 *  - tool n-gram sequences (recurring multi-step workflows within a conversation)
 *  - maturity score = frequency x cross-session spread x resolved-friction (fix patterns)
 * /muscle-memory -> shows stats + the current mature skill candidates.
 *
 * Privacy/safety: does not intentionally store raw args or secret values — only a structural fingerprint,
 * a normalized command template, and a hash. Fire-and-forget; never blocks/transforms.
 *
 * Later (D3-D5): distill (fork -> draft SKILL.md to _proposed/), graduate/retire gate.
 */
import { appendFileSync, mkdirSync, readFileSync, existsSync, writeFileSync, readdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
// ── public API — intentional surface, not the whole internals. The mod entry is the default export
// (activate); `__mm` is the test surface; the rest are the few symbols the test suite imports directly.
// Everything else stays internal to its module.
export type { Row } from "./core";
export type { Defense } from "./engram";
export { detect, detectRepairChains, isSkillWorthy } from "./detect";
export { draftWithRepair } from "./gate";
export { preserveExistingFrontmatterMetadata, isAmbiguousExistingRoute, compareSkillSections } from "./autopilot";
import { globalSkillsDir, LOG_PATH, MM, MM_TAG, NEOCORTEX_BLOCK, OUTCOME_PATH, RECEIPTS_DIR, SESSIONS_PATH, STAGED_DIR, STATE_DIR, TELEMETRY_PATH, agentSkillsDir, appendJsonl, appendMeshFeed, appendUiEvent, createDedupeSurface, ensureDir, hash, isManaged, listSkillNames, loadExperience, loadMeshFeed, meshAgentLabel, loadRows, loadUiEvents, readSkill, readUiState, redactFragment, removeSupportFile, renderMeshFeed, scanDirs, scanSkillContent, scanSupportFile, setLivePanel, skillDesc, slug, syncSkillToDesktopCatalog, validateSupportPath, writeSkill, writeSupportFile, writeUiState } from "./core";
import { buildCrossConversationEvidence, classifyError, commandTemplate, correlateOutcomes, detect, detectAntiPatterns, detectInvocationGotchas, detectRepairChains, detectSequences, detectTemplates, fingerprint, impactScore, inferOutcomes, isDurableLesson, isValidSkillName, maturityScore, mergeOutcomes, stepSig } from "./detect";
import { auditSkills, buildDiffFragment, candidateDescription, candidateName, crossShelfDuplicates, dedupCheck, draftSkillFromCandidate, draftWithRepair, effectivenessVerdict, findCandidate, lintSkillDraft, repairForCandidate, sotaQualityGaps } from "./gate";
import { approveStagedPublish, catalogPrivacyScan, findSimilarSkills, liveSkillVisible, publishHardBlocks, publishMetadata, publishPlan, publishSkillToCatalog, publishTier, publishVisibilityReceipt, publishabilityScore, sanitizeForPublish, stageSanitizedPublish } from "./publish";
import { Defense, ENGRAM, GuardMode, buildDefenses, buildNeocortexBlock, captureTagged, coachOnFailure, engramConsolidate, expectationFor, guardDecision, interleave, labileSkills, nativeEnabled, preActionDefense, predictionError, renderEngramDigest, replayQueue, reverseReplay, semanticSkillCandidates, skillRetrieved, syncNeocortexBlock, syncSkillPassages, tagExperience } from "./engram";
import { CURATOR, aggregateTelemetry, buildRegistry, bumpUsage, churnSignal, coverageMap, curateManagedSkills, curatorPass, isPinned, lifecycleTransition, managedSkillUsage, restoreManagedSkill, retireManagedSkill, retiredSkillBlocker, runAutonomousPrune, setPinned, skillVerbs, specDrift } from "./lifecycle";
import { AUTOPILOT_DEFAULT, AutopilotMode, REVIEW_PROMPT, SemanticFn, applySemanticEvidence, autopilotPlan, buildEvidenceManifest, executeAutopilotPlan, forkAuthor, graduateStagedSkill, isHighConfidenceCreate, loadHandledReflects, managedView, normalizePrescriptionQuery, pickUpdateTarget, reflectSignature, retrievePreferences, reviewAndAuthor, routeSkill, runAutopilot, runReflectiveReview, searchSkills, streamChunkText } from "./autopilot";
import { friendlyRouteLabel, renderAgentBoxScore, renderMuscleMemoryPanel, summarizeReflectActions } from "./ui";
import { buildShareCardPayload, loadPossessionEvents, pendingPossessionViews, recordInstrumentVerifiedOutcome, recordPossessionEvent, summarizePossessionLedger, type DecisionRoute, type DifficultyTier, type OutcomeResult, type EvidenceTier, type LifecycleAction, type PossessionDecisionEvent } from "./possessions";
import { bindExactFileVerificationTask, createExactFileVerificationTask, isStoredVerificationReceiptBound, verifyExactFilePossession } from "./verification";
import { collectWins, renderWins } from "./wins";
import { mineAgentHistory } from "./history";
import { loadPlusMinus, loadRatingEvents, modelIdentity, providerIdentity, rateSkill, renderPlusMinus } from "./referee";
import { attachSquadShelf, ensureSquadArchive, publishSkillToShelf, pullShelfSkill, SQUAD_ARCHIVE_NAME } from "./shelf";


// Test hook (deterministic validation without live data).
export const __mm = { meshAgentLabel, commandTemplate, fingerprint, redactFragment, buildDiffFragment, detect, detectTemplates, detectSequences, maturityScore, MM, loadRows, dedupCheck, slug, draftSkillFromCandidate, candidateName, candidateDescription, curateManagedSkills, managedSkillUsage,
  streamChunkText, isDurableLesson, isValidSkillName, buildCrossConversationEvidence, REVIEW_PROMPT, reviewAndAuthor, searchSkills, pickUpdateTarget, runReflectiveReview, graduateStagedSkill, publishSkillToCatalog, catalogPrivacyScan, isHighConfidenceCreate, runAutonomousPrune,
  buildEvidenceManifest, retrievePreferences, coverageMap, churnSignal, summarizeReflectActions, renderMuscleMemoryPanel, loadMeshFeed, renderMeshFeed,
  buildRegistry, curatorPass, skillVerbs, specDrift, lifecycleTransition, CURATOR, setPinned, isPinned, buildDefenses, preActionDefense,
  autopilotPlan, executeAutopilotPlan, AUTOPILOT_DEFAULT, managedView, forkAuthor,
  scanSkillContent, scanSupportFile, validateSupportPath, writeSupportFile, removeSupportFile, restoreManagedSkill,
  // v2
  classifyError, mergeOutcomes, correlateOutcomes, inferOutcomes, detectInvocationGotchas, loadExperience, detectRepairChains, detectAntiPatterns, impactScore, lintSkillDraft, aggregateTelemetry, effectivenessVerdict, draftWithRepair, stepSig, sotaQualityGaps, auditSkills, crossShelfDuplicates, publishabilityScore, sanitizeForPublish, publishHardBlocks, publishPlan, publishTier, publishMetadata, findSimilarSkills, stageSanitizedPublish, approveStagedPublish, publishVisibilityReceipt, liveSkillVisible,
  // lifecycle file helpers (for end-to-end manage proof)
  writeSkill, isManaged, listSkillNames, readSkill, retireManagedSkill, agentSkillsDir, scanDirs, syncSkillToDesktopCatalog, MM_TAG,
  // v5 ENGRAM — CLS loop core (pure)
  ENGRAM, expectationFor, predictionError, tagExperience, captureTagged, skillRetrieved, labileSkills, replayQueue, reverseReplay, interleave, engramConsolidate, renderEngramDigest,
  guardDecision, buildNeocortexBlock, nativeEnabled, NEOCORTEX_BLOCK,
  applySemanticEvidence, semanticSkillCandidates, syncSkillPassages, coachOnFailure, collectWins, renderWins };


export default function activate(letta: any) {
  const disposers: Array<() => void> = [];
  let panel: any = null; // live scoreboard panel (assigned below; referenced by event handlers)
  let panelBeatTimer: ReturnType<typeof setTimeout> | null = null;
  const flashEarnedMinute = (label: string, skill = "") => {
    if (panelBeatTimer) clearTimeout(panelBeatTimer);
    writeUiState({ phase: "earned", last: label, skill, route: "" });
    panelBeatTimer = setTimeout(() => {
      panelBeatTimer = null;
      const state = readUiState();
      if (state?.phase === "earned") writeUiState({ phase: "idle", last: "", skill: "", route: "" });
    }, 12_000);
  };
  disposers.push(() => { if (panelBeatTimer) clearTimeout(panelBeatTimer); panelBeatTimer = null; });
  const DEFENSE_HITS = join(STATE_DIR, "defense-hits.jsonl");
  // Defenses are computed lazily (off the hot path): rebuilt at activate + on conversation_close.
  let defensesCache: Defense[] = [];
  const refreshDefenses = () => { try { defensesCache = buildDefenses(loadExperience()); } catch { defensesCache = []; } };
  const isInstalledSkill = (name: string, ctx: any) => scanDirs(ctx).some((dir) => existsSync(join(dir, name, "SKILL.md")));
  const recordLifecycle = (action: LifecycleAction, skill: string, reason: string): string => {
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
        reason,
      });
      return "";
    } catch (error: any) {
      return `\n⚠ lifecycle event not recorded — ${String(error?.message || error)}`;
    }
  };
  const renderRosterSnapshot = (ctx?: any) => {
    const events = loadPossessionEvents();
    const active = new Set(curateManagedSkills(ctx).map((row) => row.name));
    for (const event of events) {
      if (event.type === "decision" && event.action === "prescribe" && event.skill && isInstalledSkill(event.skill, ctx)) active.add(event.skill);
    }
    const decisions = new Map(events.filter((event) => event.type === "decision").map((event) => [event.possession_id, event]));
    const outcomes = new Map<string, any>();
    for (const event of events) if (event.type === "outcome") outcomes.set(event.possession_id, event);
    const provenNames = new Set<string>();
    let helped = 0;
    for (const [possessionId, decision] of decisions) {
      if (decision.type !== "decision" || decision.action !== "prescribe" || !decision.skill || !active.has(decision.skill)) continue;
      const outcome = outcomes.get(possessionId);
      if (!outcome || outcome.result !== "helped") continue;
      // Qualifying closed helped prescriptions only — not ratings, uses, abstentions, or proof claims.
      helped++;
      if (outcome.evidence_tier !== "verified" || !decision.verification || !outcome.verification) continue;
      if (isStoredVerificationReceiptBound(decision.verification, outcome.verification, decision.possession_id, decision.event_id)) provenNames.add(decision.skill);
    }
    return { total: active.size, proven: provenNames.size, provenNames: [...provenNames].sort(), helped };
  };
  const renderDecisionReport = (summary: ReturnType<typeof summarizePossessionLedger>, ctx?: any) => {
    const roster = renderRosterSnapshot(ctx);
    return renderAgentBoxScore(summary, {
      agent: String(process.env.MM_AGENT || ctx?.agent?.name || "Agent"),
      period: "All time",
      skills: { active: roster.total, proven: roster.proven },
    });
  };
  let possessionCounter = 0;
  const prescribeForTask = (task: string, gapDeclared: boolean, ctx: any, taskClassInput?: string, difficultyInput?: DifficultyTier, verificationTaskId?: string) => {
    const query = String(task || "").trim();
    if (!query) return "ABSTAIN — describe the observed task/procedure gap before requesting a prescription.";
    const taskClass = /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(taskClassInput || ""))
      ? String(taskClassInput)
      : `task-${hash(query)}`;
    const track = (message: string, action: "prescribe" | "abstain", route: DecisionRoute, skill?: string) => {
      const stamp = Date.now();
      const possessionId = `p-${stamp.toString(36)}-${++possessionCounter}-${hash(`${taskClass}:${route}:${stamp}`)}`;
      try {
        const verification = action === "prescribe" && verificationTaskId
          ? bindExactFileVerificationTask(String(verificationTaskId))
          : undefined;
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
          route,
          ...(skill ? { skill } : {}),
          ...(verification ? { verification } : {}),
        });
        const closeout = verification
          ? `run verify_agent_possession possession_id=\"${possessionId}\"; the bound instrument derives the outcome`
          : "record the observed outcome with muscle_memory_close";
        return `${message}\npossession: ${possessionId} · after the task, ${closeout}`;
      } catch (error: any) {
        return `${message}\ntracking: decision not recorded — ${String(error?.message || error)}`;
      }
    };
    if (!gapDeclared) return track("ABSTAIN — no observed/known procedure gap was declared. Relevance alone is not an indication; let the model work unaided.", "abstain", "no-gap");
    const dirs = scanDirs(ctx);
    const top = searchSkills(dirs, normalizePrescriptionQuery(query), 3);
    const decision = routeSkill(top, [], (name) => dirs.some((dir) => existsSync(join(dir, name, "SKILL.md"))), 18);
    if (decision.route === "update" && decision.target) {
      const t = decision.target;
      const model = modelIdentity(ctx?.model);
      const modelEvents = loadRatingEvents().filter((ev) => ev.skill === t.name && ev.rating !== "no_rate" && model !== "unknown" && ev.model === model);
      const modelNet = modelEvents.reduce((sum, ev) => sum + (ev.rating === "up" ? 1 : -1), 0);
      if (modelEvents.length && modelNet < 0) {
        return track(`ABSTAIN — "${t.name}" matches the task but has negative field evidence for runtime model ${model} (${modelNet}, n=${modelEvents.length}). Review/reformulate instead of repeating observed harm.`, "abstain", "negative-field");
      }
      const modelLine = model === "unknown"
        ? "runtime model: unknown (selection is task-conditioned only; capability is not inferred)"
        : modelEvents.length
          ? `runtime model ${model}: field ${modelNet >= 0 ? "+" : ""}${modelNet} across ${modelEvents.length} rated possession${modelEvents.length === 1 ? "" : "s"}`
          : `runtime model ${model}: unproven for this skill; caller owns the gap diagnosis`;
      return track(`PRESCRIBE "${t.name}" — one smallest matching installed skill (score ${t.score}, ${t.matched} distinctive terms)\nNEXT · invoke the normal Skill tool with skill="${t.name}", perform the task, then call muscle_memory_close with the observed result\n${modelLine}\ngap diagnosis: caller-attested observed/known procedure gap; the router does not infer hidden model capability\ncontrol: do not inject sibling skills or the full shelf`, "prescribe", "matched", t.name);
    }
    const strongTie = top.length > 1 && top[0].score >= 18 && top[1].score >= 18 && Math.abs(top[0].score - top[1].score) <= 3;
    const route: DecisionRoute = decision.route === "park-ambiguous" || strongTie ? "ambiguous" : decision.route === "park-semantic" ? "weak-match" : "no-safe-match";
    const why = route === "ambiguous"
      ? "two candidates tied for the strongest match, so no single skill had enough dominance to inject safely"
      : decision.route === "park-semantic"
        ? `possible duplicate/neighbor "${decision.suspect}" without enough lexical proof`
        : "no installed skill cleared the safe-match gate";
    const closest = top.length
      ? top.map((m, index) => `${index + 1}. ${m.name} — ${index === 0 ? "strongest" : m.score === top[0].score ? "tied strongest" : "close neighbor"}; ${m.matched} distinctive term${m.matched === 1 ? "" : "s"}`).join("\n")
      : "none";
    return track(`ABSTAIN — ${why}.\n\nClosest:\n${closest}\n\nNext: continue unaided, or inspect one candidate without loading the full shelf.`, "abstain", route);
  };
  const renderPendingPossessions = () => {
    const rows = pendingPossessionViews(loadPossessionEvents());
    if (!rows.length) return "NONE OPEN · continue work, or run /muscle-memory for the report";
    return rows.slice(0, 10).map((row) => {
      const ageMinutes = Math.max(0, Math.floor((Date.now() - row.openedAt) / 60_000));
      const skill = row.skill ? `\nSKILL · ${row.skill}` : "";
      const next = row.skill
        ? `NEXT · invoke Skill(\"${row.skill}\"), finish the task, then close this same possession`
        : "NEXT · finish the task unaided, then close this same possession";
      return `PENDING · ${row.difficulty.toUpperCase()} · ${row.action.toUpperCase()} · ${friendlyRouteLabel(row.route).toUpperCase()} · ${row.taskClass} · ${ageMinutes}m ago${skill}\n${next}\nCLOSE · muscle_memory_close possession_id=\"${row.possessionId}\"`;
    }).join("\n\n");
  };
  const renderRosterReport = (ctx: any, compact = false) => {
    const managedRows = curateManagedSkills(ctx);
    const managed = new Map(managedRows.map((row) => [row.name, row]));
    const events = loadPossessionEvents();
    const outcomes = new Map<string, any>();
    for (const event of events) if (event.type === "outcome") outcomes.set(event.possession_id, event);
    const stats = new Map<string, { helped: number; harmed: number; neutral: number; judged: number; verified: number }>();
    for (const event of events) {
      if (event.type !== "decision" || event.action !== "prescribe" || !event.skill || !isInstalledSkill(event.skill, ctx)) continue;
      const row = stats.get(event.skill) || { helped: 0, harmed: 0, neutral: 0, judged: 0, verified: 0 };
      const outcome = outcomes.get(event.possession_id);
      if (outcome?.result === "helped") row.helped++;
      else if (outcome?.result === "harmed") row.harmed++;
      else if (outcome?.result === "neutral") row.neutral++;
      if (outcome?.evidence_tier === "verified" && outcome.result === "helped" && event.verification && outcome.verification
        && isStoredVerificationReceiptBound(event.verification, outcome.verification, event.possession_id, event.event_id)) row.verified++;
      else if (outcome?.evidence_tier === "agent_judged" || outcome?.evidence_tier === "human_judged") row.judged++;
      stats.set(event.skill, row);
    }
    const field = loadPlusMinus();
    const allNames = [...new Set([...managed.keys(), ...stats.keys()])].sort((a, b) => {
      const ar = stats.get(a); const br = stats.get(b);
      const at = ar ? ar.helped + ar.harmed + ar.neutral : 0;
      const bt = br ? br.helped + br.harmed + br.neutral : 0;
      return bt - at || a.localeCompare(b);
    });
    const hasSignal = (name: string) => {
      const row = stats.get(name);
      const possessionTotal = row ? row.helped + row.harmed + row.neutral : 0;
      const fieldTotal = field[name] ? field[name].plus + field[name].minus : 0;
      return possessionTotal > 0 || fieldTotal > 0 || (managed.get(name)?.uses || 0) > 0;
    };
    const names = compact ? allNames.filter(hasSignal) : allNames;
    const hidden = allNames.length - names.length;
    if (!names.length) return compact
      ? `(no observed skill outcomes yet · ${hidden} skill${hidden === 1 ? "" : "s"} with no possessions or field ratings hidden)`
      : "NONE YET · skills appear here once work is observed";
    const lines = names.map((name) => {
      const managedRow = managed.get(name);
      const possession = stats.get(name) || { helped: 0, harmed: 0, neutral: 0, judged: 0, verified: 0 };
      const score = field[name];
      const net = score ? score.plus - score.minus : 0;
      const sample = score ? score.plus + score.minus : 0;
      const fieldLine = score ? `field ${score.plus} helped / ${score.minus} missed · ${sample} rated` : "field unrated (n=0)";
      const possessionLine = `possessions ${possession.helped} helped / ${possession.harmed} harmed / ${possession.neutral} neutral`;
      const evidenceLine = `evidence ${possession.judged} judged / ${possession.verified} verified`;
      const verdict = sample >= 3 && net >= 2
        ? "PROMOTION REVIEW"
        : sample >= 3 && net <= -2
          ? "RETIREMENT REVIEW"
          : possession.harmed > 0
            ? "REVIEW · HARM OBSERVED"
            : possession.helped > 0
              ? "EARLY POSITIVE · NEEDS REPLICATION"
              : sample >= 2
                ? "REVIEW · MIXED OUTCOMES"
                : possession.neutral > 0
                  ? "HOLD · NEUTRAL OBSERVED"
                  : (managedRow?.uses || 0) === 0 && sample === 0
                    ? "UNPROVEN · NEEDS OUTCOMES"
                    : "HOLD · INSUFFICIENT EVIDENCE";
      const reason = managedRow?.reason || "prescribed from the installed shelf; possession history is now traceable";
      return `${verdict} · ${name} · ${possessionLine} · ${evidenceLine} · ${fieldLine} — ${reason}`;
    });
    const compactNote = compact && hidden > 0 ? `\nskills with no possessions or field ratings yet hidden: ${hidden} · full rotation remains available through /muscle-memory roster` : "";
    return `MUSCLE MEMORY · SKILL REVIEW\n${lines.join("\n")}${compactNote}\n\nminimum 3 rated tasks before promotion or retirement advice · possession evidence and field ratings stay separate · no automatic lifecycle changes`;
  };
  const renderRatingReceipt = (res: any) => {
    const observed = res.ratingKind === "up" ? "helped" : res.ratingKind === "down" ? "missed" : "neutral";
    const sample = res.rating.plus + res.rating.minus;
    const heading = res.partial ? "RATING PARTIAL" : "RATING RECORDED";
    return `${heading} · ${res.skill} · ${observed}\nOUTCOMES · ${res.rating.plus} helped · ${res.rating.minus} missed · ${sample} rated\nSTATUS · ${res.reason}`;
  };
  refreshDefenses();

  // E4 SEMANTIC ROUTING: embedding recall over the mm:skill passage index (opt-in MM_NATIVE=passages).
  // semanticSkillCandidates self-gates on env + agent id + client reachability → zero-cost no-op when off.
  const semanticFnFor = (agentId: string | null | undefined): SemanticFn => (q, k) => semanticSkillCandidates(letta.client, agentId, q, k);

  // E3: ENFORCED DEFENSE OVERLAY — opt-in via MM_GUARD=ask|deny (default off). A recurring,
  // unrecovered failure muscle-memory has learned becomes a real ask/deny BEFORE the tool runs
  // (reconsolidated anti-pattern → prevention — the hook ACE/Hermes lack). Never throws; gated
  // to the approval phase so it can never interfere with execution it didn't block.
  if (typeof letta.permissions?.register === "function") {
    type GuardEvent = { toolName?: string; args?: Record<string, unknown>; phase?: string };
    disposers.push(letta.permissions.register({
      id: "muscle-memory-guard",
      description: "Ask/deny before a tool that recurs into a learned, unrecovered failure (set MM_GUARD=ask|deny).",
      check: (event: GuardEvent) => {
        try {
          const mode: GuardMode = process.env.MM_GUARD === "deny" ? "deny" : process.env.MM_GUARD === "ask" ? "ask" : "off";
          if (mode === "off" || event?.phase !== "approval") return undefined;
          const d = guardDecision(String(event?.toolName ?? ""), event?.args ?? {}, defensesCache, mode);
          return d ? { decision: d.decision, reason: d.reason } : undefined;
        } catch { return undefined; }
      },
    }));
  }

  if (letta.capabilities?.events?.tools) {
    // E5 REFLEX support: tool_end events don't carry args, so tool_start caches the computed
    // step fingerprint by callId (bounded — reflex lookups are same-turn, never historical).
    const stepByCallId = new Map<string, { tool: string; fp: string; tmpl: string | null }>();
    const coachedOnce = new Set<string>(); // one coaching per conversation per trigger — never spam
    disposers.push(letta.events.on("tool_start", (event: any) => {
      try {
        const tool = String(event?.toolName ?? "");
        if (!tool) return;
        const { fp, tmpl } = fingerprint(tool, event?.args ?? {});
        const callId = String(event?.toolCallId ?? "");
        if (callId) {
          stepByCallId.set(callId, { tool, fp, tmpl });
          if (stepByCallId.size > 256) { const first = stepByCallId.keys().next().value; if (first !== undefined) stepByCallId.delete(first); }
        }
        const cap = process.env.MM_CAPTURE;
        const fix = (cap === "worked" && (tool === "Edit" || tool === "Write" || tool === "fast_apply")) ? buildDiffFragment(event?.args ?? {}) : undefined;
        appendJsonl(LOG_PATH, { ts: Date.now(), conv: event?.conversationId ?? null, agent: event?.agentId ?? null, tool, fp, tmpl, h: hash(fp), id: event?.toolCallId ?? null, ...(fix ? { fix } : {}) });
        // v2 edge: Skill-usage tracking (curator) + PRE-ACTION defense (the tool_start hook Hermes lacks).
        if (tool === "Skill" && typeof event?.args?.skill === "string") bumpUsage(slug(String(event.args.skill)));
        if (defensesCache.length) {
          const hit = preActionDefense(stepSig({ tool, fp, tmpl }), defensesCache);
          if (hit && hit.severity >= 2) appendJsonl(DEFENSE_HITS, { ts: Date.now(), conv: event?.conversationId ?? null, step: hit.trigger, kind: hit.kind, errClass: hit.errClass, defense: hit.defense, severity: hit.severity });
        }
      } catch { /* best-effort */ }
      return; // OBSERVE only — never transform args
    }));

    // v2: OUTCOME CAPTURE via tool_end (read-only) + E5 REFLEX (opt-in MM_REFLEX=on): on a failure
    // matching a learned repair chain, append the known fix to the failing tool's own output as a
    // <system-reminder> — the model reads the recovery with the failure. Cache-safe (per-turn tool
    // result, never a system-prompt edit). Everything else stays observe-only.
    try {
      disposers.push(letta.events.on("tool_end", (event: any) => {
        let coached: { status: string; output: string } | null = null;
        try {
          // Real Letta tool_end contract (src/mods/types.ts): { status:"success"|"error", output }.
          const status = String(event?.status ?? "");
          const ok = status ? status === "success" : (event?.ok ?? !(event?.isError || event?.error));
          const outText = String(event?.output ?? event?.resultText ?? event?.error ?? "");
          const err = ok ? null : classifyError(outText, false);
          const cap = process.env.MM_CAPTURE;
          const errMsg = (!ok && (cap === "context" || cap === "worked")) ? redactFragment(outText, 8, 320) : undefined;
          appendJsonl(OUTCOME_PATH, { ts: Date.now(), id: event?.toolCallId ?? null, tool: event?.toolName ?? null, conv: event?.conversationId ?? null, ok, err, ...(errMsg ? { errMsg } : {}) });
          if (process.env.MM_REFLEX === "on" && !ok && defensesCache.length) {
            const step = stepByCallId.get(String(event?.toolCallId ?? ""));
            const c = step ? coachOnFailure(step, outText, defensesCache) : null;
            const onceKey = c ? `${event?.conversationId ?? "?"}::${c.hit.trigger}` : "";
            if (c && !coachedOnce.has(onceKey)) {
              coachedOnce.add(onceKey);
              appendJsonl(DEFENSE_HITS, { ts: Date.now(), conv: event?.conversationId ?? null, step: c.hit.trigger, kind: c.hit.kind, errClass: c.hit.errClass, defense: c.hit.defense, severity: c.hit.severity, surfaced: true });
              appendUiEvent({ phase: "reflex_coached", summary: `🧠 reflex: surfaced known fix for '${c.hit.trigger.slice(0, 60)}'` });
              coached = { status: status || "error", output: outText + c.reminder };
            }
          }
        } catch { /* best-effort */ }
        return coached ? { result: coached } : undefined; // reflex-coached result, or untouched
      }));
    } catch { /* tool_end not available on this surface */ }
  }

  // v2: LLM telemetry (aggregate ONLY — never raw prompts/messages). Guarded by the llm event capability.
  if (letta.capabilities?.events?.llm) {
    const spanByConv = new Map<string, number>();
    disposers.push(letta.events.on("llm_start", (event: any) => { try { spanByConv.set(String(event?.conversationId ?? "?"), Date.now()); } catch {} }));
    disposers.push(letta.events.on("llm_end", (event: any) => {
      try {
        const started = spanByConv.get(String(event?.conversationId ?? "?")) ?? Date.now();
        const span = { tokensIn: event?.usage?.promptTokens ?? event?.tokensIn, tokensOut: event?.usage?.completionTokens ?? event?.tokensOut, ms: Date.now() - started, stop: event?.stopReason };
        let t: any = {}; try { if (existsSync(TELEMETRY_PATH)) t = JSON.parse(readFileSync(TELEMETRY_PATH, "utf8")); } catch {}
        const agg = aggregateTelemetry([span]);
        t.calls = (t.calls || 0) + agg.calls; t.tokensIn = (t.tokensIn || 0) + agg.tokensIn; t.tokensOut = (t.tokensOut || 0) + agg.tokensOut; t.ms = (t.ms || 0) + agg.ms;
        try { ensureDir(); writeFileSync(TELEMETRY_PATH, JSON.stringify(t)); } catch {}
      } catch { /* best-effort */ }
    }));
  }

  // v2: COMPACTION hooks — flush + write a tiny receipt. Guarded by the compact event capability.
  // E9 upgrade: compaction is the moment evidence DIES — messages evicted at compact_start are
  // gone from context forever. So opt-in reflection (MM_REFLECT=staged|auto) fires HERE too, not
  // only at session end: distill at the moment of forgetting, while the experience log still
  // holds the full tape. Fire-and-forget; a reflect can never delay or break compaction.
  if (letta.capabilities?.events?.compact) {
    let compactReflectInFlight = false;
    disposers.push(letta.events.on("compact_start", (event: any, ctx: any) => {
      try { ensureDir(); mkdirSync(RECEIPTS_DIR, { recursive: true });
        const { candidates } = detect(loadExperience());
        writeFileSync(join(RECEIPTS_DIR, `compact-${Date.now()}.json`), JSON.stringify({ phase: "start", conv: event?.conversationId ?? null, trigger: event?.trigger ?? null, candidatesPreserved: candidates.length, ts: Date.now() }));
      } catch {}
      const rfMode = process.env.MM_REFLECT;
      if ((rfMode !== "staged" && rfMode !== "auto") || compactReflectInFlight) return;
      compactReflectInFlight = true;
      appendUiEvent({ phase: "compact_reflect_started", summary: "compaction boundary → reflective review started before context eviction" });
      runReflectiveReview(ctx ?? { agentId: event?.agentId }, { mode: rfMode, semanticFn: semanticFnFor(event?.agentId ?? ctx?.agent?.id) })
        .then(() => { try { panel?.update(); } catch { /* */ } })
        .catch(() => { /* reflection must never break compaction */ })
        .finally(() => { compactReflectInFlight = false; });
    }));
    disposers.push(letta.events.on("compact_end", (event: any) => {
      try { ensureDir(); mkdirSync(RECEIPTS_DIR, { recursive: true });
        writeFileSync(join(RECEIPTS_DIR, `compact-end-${Date.now()}.json`), JSON.stringify({ phase: "end", conv: event?.conversationId ?? null, trigger: event?.trigger ?? null, messagesBefore: event?.messagesBefore ?? null, messagesAfter: event?.messagesAfter ?? null, contextTokensBefore: event?.contextTokensBefore ?? null, contextTokensAfter: event?.contextTokensAfter ?? null, ts: Date.now() }));
      } catch {}
    }));
  }

  if (letta.capabilities?.events?.lifecycle) {
    disposers.push(letta.events.on("conversation_close", (event: any, ctx: any) => {
      appendJsonl(SESSIONS_PATH, { ts: Date.now(), conv: event?.conversationId ?? null, agent: event?.agentId ?? null, reason: event?.reason ?? null, toolCalls: event?.toolCallCount ?? null, messages: event?.messageCount ?? null, durationMs: event?.durationMs ?? null });
      refreshDefenses(); // rebuild the pre-action defense set off the hot path
      // E3.5 NATIVE NEOCORTEX: project the consolidated skill index into the agent's core memory
      // block so it is in-context every turn (opt-in MM_NATIVE=blocks). Best-effort; never blocks close.
      if (nativeEnabled("blocks") || nativeEnabled("passages")) {
        try {
          const managed = managedView(scanDirs(ctx ?? {})).map((m) => ({ name: m.name, description: m.description }));
          if (nativeEnabled("blocks")) void syncNeocortexBlock(letta.client, event?.agentId ?? null, buildNeocortexBlock(managed));
          // E4: keep the mm:skill passage index fresh so semantic routing searches current shelves.
          if (nativeEnabled("passages")) void syncSkillPassages(letta.client, event?.agentId ?? null, managed);
        } catch { /* best-effort */ }
      }
      // AUTOPILOT trigger — opt-in only (MM_AUTOPILOT=staged|auto), at session end (idle, never mid-work).
      const apMode = process.env.MM_AUTOPILOT;
      if (apMode === "staged" || apMode === "auto") { runAutopilot(ctx ?? { agentId: event?.agentId }, { ...AUTOPILOT_DEFAULT, mode: apMode }).catch(() => { /* autopilot must never break the app */ }); }
      // v3.1 REFLECTIVE REVIEW trigger — opt-in (MM_REFLECT=staged|auto): the cross-conversation
      // reviewer authors/updates a class-level skill autonomously at session end. Default OFF.
      const rfMode = process.env.MM_REFLECT;
      if (rfMode === "staged" || rfMode === "auto") {
        runReflectiveReview(ctx ?? { agentId: event?.agentId }, { mode: rfMode, semanticFn: semanticFnFor(event?.agentId ?? ctx?.agent?.id) })
          .then(() => { runAutonomousPrune(ctx ?? { agentId: event?.agentId }, { maxRetire: 1 }); try { panel?.update(); } catch { /* */ } })
          .catch(() => { /* reflection/prune must never break the app */ });
      }
    }));
  }

  // turn_end is gated at runtime by capabilities.events.turns (NOT lifecycle) — guard it separately so the
  // in-session autonomous loop registers correctly on backends where turns and lifecycle diverge.
  if (letta.capabilities?.events?.turns) {
    // ── AUTONOMOUS DISTILLATION (Hermes-style background review) ──────────────────────────────────
    // conversation_close (above) only fires at SESSION END. Hermes also nudges DURING a session
    // ("periodic nudge ... fires without user input"). Mirror that: after EACH turn, cheaply check
    // whether a mature, not-yet-distilled cross-session pattern has emerged — if so, distill it ON OUR
    // OWN, with no user command. The maturity gate (≥2 durable signals) + signature dedup mean it fires
    // exactly once per newly-matured pattern, never every turn. Opt-in (MM_REFLECT=staged|auto); runs in
    // the background (fire-and-forget) so it never blocks a turn. THIS is what makes it truly autonomous.
    let autoReflectInFlight = false;
    disposers.push(letta.events.on("turn_end", (event: any, ctx: any) => {
      const rfMode = process.env.MM_REFLECT;
      if ((rfMode !== "staged" && rfMode !== "auto") || autoReflectInFlight) return;
      try {
        const ev = buildCrossConversationEvidence(loadExperience());
        if (ev.items < 2 || loadHandledReflects()[reflectSignature(ev)]) return; // nothing new + mature → stay quiet
      } catch { return; }
      autoReflectInFlight = true;
      runReflectiveReview(ctx ?? { agentId: event?.agentId }, { mode: rfMode, semanticFn: semanticFnFor(event?.agentId ?? ctx?.agent?.id) })
        .then(() => { runAutonomousPrune(ctx ?? { agentId: event?.agentId }, { maxRetire: 1 }); try { panel?.update(); } catch { /* */ } })
        .catch(() => { /* reflection must never break the app */ })
        .finally(() => { autoReflectInFlight = false; });
    }));
  }

  // v3.3 HERMES-VISIBLE PANEL — a compact self-improvement summary around the input bar (the supported
  // mod UI surface). Cheap, churn-free render (reads a small JSON); updates on reflect + a slow interval.
  if (letta.capabilities?.ui?.panels && letta.ui?.openPanel) {
    try {
      panel = letta.ui.openPanel({
        id: "muscle-memory-live",
        order: 20,
        render: (renderCtx: any = {}) => {
          try {
            return renderMuscleMemoryPanel({
              ...readUiState(),
              roster: renderRosterSnapshot(renderCtx),
              field: loadPlusMinus(),
            });
          } catch { return []; }
        },
      });
      setLivePanel(panel); // enable LIVE re-render on every state change
      // SELF-HEAL on (re)load: a reflect cannot survive a reload, so any transient phase persisted here
      // is necessarily stale (interrupted mid-author). Reset it to idle so the panel never opens stuck on
      // "✍️ writing skill…" (guards the hour-long freeze observed 2026-06-27). Then repaint immediately.
      try {
        const s = readUiState();
        if (["reviewing", "routing", "writing", "shaping", "checking", "saving", "testing", "earned", "learned", "updated", "rotation", "benched", "done"].includes(String(s?.phase || ""))) {
          writeUiState({ phase: "idle", last: "", skill: "", route: "" });
        }
      } catch { /* */ }
      const t = setInterval(() => { try { panel?.update(); } catch { /* */ } }, 5_000);
      disposers.push(() => { clearInterval(t); try { panel?.close(); } catch { /* */ } });
    } catch { /* UI optional */ }
  }

  if (letta.capabilities?.commands) {
    disposers.push(letta.commands.register({
      id: "muscle-memory",
      description: "Show the Muscle Memory Decision Report or inspect learning details",
      async run(ctx: any = {}) {
        const argv = Array.isArray(ctx?.argv) ? ctx.argv : String(ctx?.args || "").trim().split(/\s+/).filter(Boolean);
        const sub = String(argv?.[0] || "").toLowerCase();
        if (!sub || sub === "report" || sub === "boxscore") {
          const summary = summarizePossessionLedger();
          return { type: "output", output: renderDecisionReport(summary, ctx) };
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
          const events = loadUiEvents(n);
          const lines = events.map((e) => `💾 muscle-memory review: ${e.summary}`);
          return { type: "output", output: lines.join("\n") || "NONE YET · review events appear after a possession closes" };
        }
        if (sub === "wins") {
          // The dopamine surface: receipt-backed value ledger (deterministic; no model, no new state).
          return { type: "output", output: renderWins(collectWins()) };
        }
        if (sub === "squad") {
          const feed = loadMeshFeed(10);
          return { type: "output", output: feed.length ? "💾 squad distillations (cross-agent):\n" + renderMeshFeed(feed).map((l) => `  ${l}`).join("\n") : "(no squad distillations yet — other agents sharing this feed appear here as they distill)" };
        }
        if (sub === "prescribe") {
          const hasGap = String(argv?.[1] || "").toLowerCase() === "--gap";
          const task = argv.slice(hasGap ? 2 : 1).join(" ").trim();
          return { type: "output", output: prescribeForTask(task, hasGap, ctx) };
        }
        if (sub === "ratings" || sub === "scoreboard") {
          return { type: "output", output: `FIELD RATINGS · next-task outcomes\n${renderPlusMinus(loadPlusMinus())}` };
        }
        if (sub === "roster") {
          return { type: "output", output: renderRosterReport(ctx) };
        }
        if (sub === "staged") {
          let s: string[] = []; try { s = existsSync(STAGED_DIR) ? readdirSync(STAGED_DIR).filter((n) => existsSync(join(STAGED_DIR, n, "SKILL.md"))) : []; } catch { /* */ }
          return { type: "output", output: s.length ? "staged skills (1-tap to graduate):\n" + s.map((n) => `  · ${n}`).join("\n") : "(no staged skills yet — set MM_REFLECT=staged, work a few sessions)" };
        }
        if (sub === "coverage") {
          const cov = coverageMap(loadExperience(), scanDirs(ctx));
          const icon = (st: string) => st === "covered" ? "✓" : st === "uncovered" ? "＋" : st === "over-covered" ? "⧉" : "✗";
          return { type: "output", output: cov.length ? cov.map((c) => `${icon(c.status)} [${c.status}] ${c.domain}${c.skill ? ` → ${c.skill}` : ""}`).join("\n") : "NONE YET · task-classes appear once a pattern repeats" };
        }
        if (sub === "audit") {
          // LIBRARY-WIDE SOTA AUDIT (read-only): score EVERY skill (installed/hand-authored/distilled),
          // not just mm's own — the gate is a pure function. Flags sub-SOTA skills + their exact gaps.
          const dirs = scanDirs(ctx);
          const entries: Array<{ name: string; shelf: string; body: string; description: string }> = [];
          for (const d of dirs) { const shelf = d === globalSkillsDir() ? "global" : "agent"; for (const n of listSkillNames(d)) { try { entries.push({ name: n, shelf, body: readSkill(d, n), description: skillDesc(d, n) }); } catch { /* */ } } }
          const seen = new Set<string>(); const skills: Array<{ name: string; description: string; body: string }> = [];
          for (const e of entries) { if (seen.has(e.name)) continue; seen.add(e.name); skills.push({ name: e.name, description: e.description, body: e.body }); }
          const r = auditSkills(skills);
          const dups = crossShelfDuplicates(entries).filter((x) => x.divergent);
          const pct = r.total ? Math.round((100 * r.clean) / r.total) : 0;
          const gapline = Object.entries(r.gapCounts).sort((a, b) => b[1] - a[1]).map(([g, c]) => `${g} ×${c}`).join("  ") || "—";
          const top = r.flagged.slice(0, 20).map((f) => `  ⚠ ${f.name.slice(0, 46).padEnd(48)} ${f.gaps.map((g) => g.split(":")[0]).join(", ")}`).join("\n");
          const dupline = dups.length ? `\n⧉ cross-shelf duplicates (consolidate — stale copy diverging): ${dups.map((x) => `${x.name} [${x.shelves.join("+")}]`).join(", ")}` : "";
          return { type: "output", output: `🏅 SOTA library audit — ${r.total} skills · ${r.clean} top-tier (${pct}%) · ${r.flagged.length} to upgrade${dups.length ? ` · ${dups.length} dup` : ""}\ngaps: ${gapline}\n${top}${r.flagged.length > 20 ? `\n  …and ${r.flagged.length - 20} more` : ""}${dupline}` };
        }
        if (sub === "publish") {
          // SUPPLY CHAIN: preflight (default) → stage (sanitized review copy) → approve (publish to Custom
          // Skills). NEVER auto-publishes; sanitizes identifiers only; dedup-aware; tiered.
          const v1 = String(argv?.[1] || "").toLowerCase();
          const action = (v1 === "stage" || v1 === "approve") ? v1 : "preflight";
          const target = String((action === "preflight" ? argv?.[1] : argv?.[2]) || "").trim();
          if (!target) return { type: "output", output: "usage: /muscle-memory publish <skill> | publish stage <skill> | publish approve <skill>  (never auto-publishes)" };
          const dirs = scanDirs(ctx); let found: { dir: string; name: string } | null = null;
          for (const d of dirs) for (const n of listSkillNames(d)) if (n.toLowerCase() === target.toLowerCase()) { found = { dir: d, name: n }; break; }
          if (action === "approve") {
            const res = approveStagedPublish(target, globalSkillsDir());
            if (!res.published) return { type: "output", output: `🚫 not published — ${res.reason}` };
            try { appendUiEvent({ phase: "skill_published", summary: `published '${target}' to Custom Skills`, skill: target, action: "publish" }); appendMeshFeed({ type: "skill_published", skill: target, route: "PUBLISH", signals: 0 }); } catch { /* */ }
            const vis = publishVisibilityReceipt(target, globalSkillsDir());
            const live = liveSkillVisible(slug(target), ctx?.agent?.id || ctx?.agentId);
            return { type: "output", output: `✅ published — ${res.path}\n  on disk: ${vis.exists ? "yes ✓" : "NO ❌"}\n  live index: ${live.checked ? (live.visible ? "✓ visible to the agent now" : "not loaded yet") : "not queried"}  ·  ${live.note}` };
          }
          if (!found) return { type: "output", output: `skill "${target}" not found (try /muscle-memory audit to list)` };
          const skill = { name: found.name, description: skillDesc(found.dir, found.name), body: readSkill(found.dir, found.name), shelf: "agent" };
          const plan = publishPlan(skill); const tier = publishTier(plan);
          const existing = listSkillNames(globalSkillsDir()).filter((n) => n !== found!.name).map((n) => ({ name: n, description: skillDesc(globalSkillsDir(), n) }));
          const dups = findSimilarSkills(found.name, skill.description, existing);
          if (action === "stage") {
            const st = stageSanitizedPublish(skill);
            if (!st.staged) return { type: "output", output: `🚫 not staged — ${st.reason}` };
            try { appendUiEvent({ phase: "skill_publish_staged", summary: `staged '${found.name}' (tier=${st.tier}, ${plan.publishability}/100)`, skill: found.name, action: "stage" }); } catch { /* */ }
            const dupline = dups.length ? `\n⚠ similar Custom Skills: ${dups.map((d) => `${d.name} (${d.why})`).join("; ")}` : "";
            return { type: "output", output: `📦 staged SANITIZED publish — ${found.name}\n  ${st.dir}/SKILL.md  +  PUBLISH-PLAN.json\n  tier: ${st.tier}  ·  publishability ${plan.publishability}/100${dupline}\n  next: review the sanitized SKILL.md, then \`/muscle-memory publish approve ${found.name}\`` };
          }
          try { appendUiEvent({ phase: "skill_publish_preflight", summary: `${plan.skill}: ${plan.publishability}/100 · tier=${tier} · ${plan.recommended}`, skill: found.name }); } catch { /* */ }
          const blocks = plan.hardBlocks.length ? `\n🚫 HARD BLOCKS (never publish): ${plan.hardBlocks.join("; ")}` : "";
          const issues = plan.issues.length ? plan.issues.map((i) => `  - [${i.axis}] ${i.detail}`).join("\n") : "  (none)";
          const reps = plan.replacements.length ? `\nsanitize: ${plan.replacements.map((r) => `${r.from.slice(0, 22)} → ${r.to}`).join(", ")}` : "";
          const dupline = dups.length ? `\n⚠ similar Custom Skills (consider merge/update): ${dups.map((d) => d.name).join(", ")}` : "";
          const act = plan.recommended === "publish" ? "✅ publish as-is (clean)" : plan.recommended === "stage-sanitized" ? "📦 stage SANITIZED (run `publish stage`)" : "🚫 block";
          return { type: "output", output: `🚢 publish preflight — ${plan.skill}\n  ${plan.currentShelf} → ${plan.recommendedShelf}  ·  tier: ${tier}  ·  publishability ${plan.publishability}/100  ·  ${act}${blocks}\nissues:\n${issues}${reps}${dupline}\n(dry-run — nothing published.)` };
        }
        if (sub === "mine") {
          // E6 RETROACTIVE MINING: replay this agent's message history through the live pipeline —
          // repair chains from sessions the mod never saw. Read-only on the server; watermarked.
          const agentId = String(argv?.[1] || ctx?.agent?.id || ctx?.agentId || "").trim();
          if (!agentId) return { type: "output", output: "usage: /muscle-memory mine [agent-id]  (defaults to the current agent)" };
          const batch = await mineAgentHistory(letta.client, agentId);
          const chains = detectRepairChains(loadExperience());
          return { type: "output", output: `⛏️ mined ${batch.scanned} messages → ${batch.rows} steps + ${batch.outcomes} outcomes (watermark ${batch.newestId ? "advanced" : "unchanged"})\n  repair chains in experience now: ${chains.length}` };
        }
        if (sub === "shelf") {
          // E8 SQUAD SHELF: cross-agent inheritance over a shared archive. Pull-only + staged-first:
          // a pulled skill lands in publish-staged for review; promotion uses the normal approve gate.
          const v1 = String(argv?.[1] || "").toLowerCase();
          const agentId = String(ctx?.agent?.id || ctx?.agentId || "");
          if (v1 === "publish") {
            const target = String(argv?.[2] || "").trim();
            if (!target) return { type: "output", output: "usage: /muscle-memory shelf publish <skill>  (publishes the SANITIZED staged copy — run `publish stage <skill>` first)" };
            const stagedPath = join(STATE_DIR, "publish-staged", slug(target), "SKILL.md");
            if (!existsSync(stagedPath)) return { type: "output", output: `🚫 no sanitized staged copy for '${target}' — run \`/muscle-memory publish stage ${target}\` first (the shelf only ever receives sanitized content)` };
            const archiveId = await ensureSquadArchive(letta.client);
            if (!archiveId) return { type: "output", output: "🚫 could not ensure the squad shelf archive (client lacks the archives surface?)" };
            const res = await publishSkillToShelf(letta.client, archiveId, slug(target), readFileSync(stagedPath, "utf8"), String(process.env.MM_AGENT || "agent"));
            return { type: "output", output: res.ok ? `📡 shelf-published '${target}' → ${SQUAD_ARCHIVE_NAME} (${archiveId})\n  squad agents: attach once, then \`/muscle-memory shelf pull ${target}\`` : `🚫 shelf publish failed — ${res.reason}` };
          }
          if (v1 === "attach") {
            const archiveId = await ensureSquadArchive(letta.client);
            if (!archiveId || !agentId) return { type: "output", output: "🚫 shelf attach needs an agent context + archives surface" };
            const ok = await attachSquadShelf(letta.client, agentId, archiveId);
            return { type: "output", output: ok ? `🔗 squad shelf attached (${SQUAD_ARCHIVE_NAME} → this agent)` : "🚫 attach failed" };
          }
          if (v1 === "pull") {
            const target = String(argv?.[2] || "").trim();
            if (!target) return { type: "output", output: "usage: /muscle-memory shelf pull <skill>" };
            const res = await pullShelfSkill(letta.client, agentId, slug(target));
            return { type: "output", output: res.ok ? `📥 pulled '${target}' from ${res.publisher ?? "?"} → STAGED (review before promotion):\n  ${res.stagedPath}` : `🚫 pull failed — ${res.reason}` };
          }
          return { type: "output", output: "usage: /muscle-memory shelf publish <skill> | shelf attach | shelf pull <skill>  (pull-only + staged-first by design)" };
        }
        if (sub === "rate") {
          // E7 REFEREE + v0.8.3 field sidecar: aggregate (up/down) + append-only reason event
          // (no_rate = sidecar only). The learner does not grade its own homework: ratings come
          // from outcomes you saw. reason is REQUIRED for down/no_rate.
          const target = String(argv?.[1] || "").trim();
          const dir = String(argv?.[2] || "").toLowerCase();
          const reason = (argv?.slice(3).join(" ") || "").trim();
          if (!target || (dir !== "up" && dir !== "down" && dir !== "no_rate"))
            return { type: "output", output: "usage: /muscle-memory rate <skill> up|down|no_rate [reason...]   (reason required for down/no_rate)" };
          const skill = slug(target);
          if (!isInstalledSkill(skill, ctx)) return { type: "output", output: `🚫 not recorded — skill '${skill}' is not installed on this agent` };
          const res = await rateSkill(letta.client, skill, dir as "up" | "down" | "no_rate", null, {
            reason,
            rater: process.env.MM_AGENT ?? "user",
            source: "manual",
            model: modelIdentity(ctx?.model),
            provider: providerIdentity(ctx?.model),
          });
          if (!res.recorded) return { type: "output", output: `🚫 not recorded — ${res.reason}` };
          return { type: "output", output: `${renderRatingReceipt(res)}\n\nFIELD RATINGS · next-task outcomes\n${renderPlusMinus(loadPlusMinus())}` };
        }
        if (sub === "engram") {
          // The CLS loop, observable (read-only): salience-ranked replay + reverse-replay credit +
          // synaptic rescue + labile (reconsolidation) skills — the prioritized "dream".
          const dirs = scanDirs(ctx);
          const plan = engramConsolidate(loadExperience(), managedView(dirs).map((m) => ({ name: m.name, body: m.body })));
          const head = `🧠 ENGRAM (CLS loop) · hippocampus ${plan.hippoSize} reps · ${plan.replay.length} replay · ${plan.rescued.length} rescued · ${plan.labile.length} labile`;
          return { type: "output", output: `${head}\n\n${plan.digest}` };
        }
        if (sub === "lifecycle" || sub === "skills") {
          // The whole cycle, read-only: creation (staged) → use (earning) → idle (prune candidates) → retired (reversible).
          const dirs = scanDirs(ctx);
          const reg = buildRegistry(dirs);
          let staged: string[] = []; try { staged = existsSync(STAGED_DIR) ? readdirSync(STAGED_DIR).filter((n) => existsSync(join(STAGED_DIR, n, "SKILL.md"))) : []; } catch { /* */ }
          const used = reg.skills.filter((s) => s.uses > 0);
          const idle = reg.skills.filter((s) => s.uses === 0 && s.state !== "archived");
          const archived = reg.skills.filter((s) => s.state === "archived");
          const field = loadPlusMinus();
          const fieldScore = (name: string) => {
            const row = field[name];
            if (!row) return "";
            return ` · outcomes ${row.plus} helped / ${row.minus} missed`;
          };
          const distribution = (name: string) => existsSync(join(globalSkillsDir(), name, "SKILL.md")) ? " · 📡 catalog" : "";
          const L = ["💾 muscle-memory · skill lifecycle (creation → use → prune)"];
          L.push(`\n🌱 staged · 1-tap to graduate (${staged.length})`); staged.slice(0, 8).forEach((n) => L.push(`   · ${n}`));
          L.push(`\n✅ active · earning context (${used.length})`); used.slice(0, 10).forEach((s) => L.push(`   · ${s.name} — ${s.uses} uses${fieldScore(s.name)}${distribution(s.name)}${s.pinned ? " 📌" : ""}`));
          L.push(`\n💤 idle · prune candidates (${idle.length})`); idle.slice(0, 10).forEach((s) => L.push(`   · ${s.name}${fieldScore(s.name)}${distribution(s.name)}${s.pinned ? " 📌 pinned (protected)" : " — retires after 30d unused (reversible)"}`));
          if (archived.length) { L.push(`\n🗄 retired · reversible quarantine (${archived.length})`); archived.slice(0, 6).forEach((s) => L.push(`   · ${s.name}${fieldScore(s.name)}${distribution(s.name)}${s.absorbedInto ? ` → absorbed into ${s.absorbedInto}` : ""}`)); }
          return { type: "output", output: L.join("\n") };
        }
        if (sub !== "filmroom") {
          return {
            type: "output",
            output: [
              "usage: /muscle-memory                → Decision Report (home)",
              "       /muscle-memory pending        → resume open possessions",
              "       /muscle-memory prescribe --gap <task>",
              "       /muscle-memory roster|wins|ratings|lifecycle|staged",
              "       /muscle-memory filmroom       → tape / coverage / candidates (debug)",
              "loop:  muscle_memory_prescribe → Skill(exact name) → muscle_memory_close → /muscle-memory",
            ].join("\n"),
          };
        }
        const rows = loadExperience();
        const byTool: Record<string, number> = {};
        for (const r of rows) byTool[r.tool] = (byTool[r.tool] || 0) + 1;
        const { candidates, templates, sequences } = detect(rows);
        const toolLine = Object.entries(byTool).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join("  ");
        const cand = candidates.slice(0, 6).map((c) => `  [${c.maturity}] ${c.kind} ×${c.count}/${c.convs}conv${c.fixes ? ` (${c.fixes} fixes)` : ""}  ${c.key.slice(0, 90)}`).join("\n");
        // Explicit filmroom only: reflect mode + review summary + library/tape (not the default home).
        const mode = process.env.MM_REFLECT === "auto" ? "auto" : process.env.MM_REFLECT === "staged" ? "staged" : "off (set MM_REFLECT=staged to enable)";
        const events = loadUiEvents(8);
        const lastReview = events.length ? summarizeReflectActions(events) : "NONE YET · review appears once a skill has rated possessions";
        let managed = 0, staged = 0;
        try { for (const d of scanDirs(ctx)) for (const n of listSkillNames(d)) if (isManaged(d, n)) managed++; } catch { /* */ }
        try { staged = existsSync(STAGED_DIR) ? readdirSync(STAGED_DIR).filter((n) => existsSync(join(STAGED_DIR, n, "SKILL.md"))).length : 0; } catch { /* */ }
        const cov = (() => { try { const c = coverageMap(rows, scanDirs(ctx)); return `${c.filter((x) => x.status === "covered").length} covered / ${c.filter((x) => x.status === "uncovered").length} uncovered / ${c.filter((x) => x.status === "over-covered").length} over-covered`; } catch { return "n/a"; } })();
        const out = [
          `💾 muscle-memory · filmroom · reflect ${mode}`,
          `last review: ${lastReview}`,
          `library: ${managed} managed · ${staged} staged · coverage ${cov}`,
          ``,
          `recent review events:`,
          events.slice(-5).map((e) => `  · ${e.summary}`).join("\n") || `  (none yet — set MM_REFLECT=staged, work a few sessions)`,
          ...(() => { const feed = loadMeshFeed(4); return feed.length ? [``, `squad distillations (cross-agent):`, ...renderMeshFeed(feed).map((l) => `  ${l}`)] : []; })(),
          ``,
          `${rows.length} reps observed${toolLine ? ` · tools ${toolLine}` : ""}`,
          `mature candidates: ${candidates.length} (${templates.length} templates, ${sequences.length} sequences)`,
          cand || `  (none mature yet — need ≥${MM.MIN_COUNT}× across ≥${MM.MIN_CONVS} conversations)`,
          ``,
          `inspect: wins · ratings · roster · prescribe · lifecycle · coverage · engram · audit`,
          `act: rate · mine · publish · shelf`,
          `home: /muscle-memory  ·  loop: prescribe → Skill → close`,
        ].join("\n");
        return { type: "output", output: out };
      },
    }));
  }

  // D3: skill lifecycle management (read actions stay smooth; mutating actions are approval-gated).
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
        mode: { type: "string", enum: ["staged", "auto"], description: "autopilot mode preview — for autopilot_plan" },
      },
      required: ["action"],
      additionalProperties: false,
    };
    const leanReadParams = {
      type: "object",
      properties: {
        action: { type: "string", enum: ["report", "pending_possessions", "roster", "load"], description: "report current evidence, resume one pending possession, review the skill roster, or load one known skill" },
        name: { type: "string", description: "skill name — required only for load" },
      },
      required: ["action"],
      additionalProperties: false,
    };
    const prescribeParams = {
      type: "object",
      properties: {
        task: { type: "string", description: "the current procedural miss or known missing procedure; raw task text is never persisted" },
        gap_observed: { type: "boolean", description: "caller attests a concrete miss or known missing procedure; false means abstain. Muscle Memory never infers hidden model capability" },
      },
      required: ["task", "gap_observed"],
      additionalProperties: false,
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
        force: { type: "boolean", description: "for catalog_sync: manually replace an existing catalog copy after approval" },
      },
      required: ["action"],
      additionalProperties: false,
    };

    const readRun = async (ctx: any) => {
      const a = ctx?.args || {};
      const dirs = scanDirs(ctx);
      const findSkillDir = (name: string) => dirs.find((d) => existsSync(join(d, name, "SKILL.md")));
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
          return prescribeForTask(String(a.task || ""), a.gap_observed === true || a.verified_gap === true, ctx, a.task_class ? String(a.task_class) : undefined, a.difficulty ? String(a.difficulty) as DifficultyTier : "unknown", a.verification_task_id ? String(a.verification_task_id) : undefined);
        }
        if (a.action === "roster") {
          return renderRosterReport(ctx, !advancedAgentSurface);
        }
        if (a.action === "candidates") {
          const rows = loadExperience();
          const { candidates } = detect(rows);
          return candidates.slice(0, 10).map((c) => `[impact ${impactScore(c).score} | mat ${c.maturity}] ${c.kind} ×${c.count}/${c.convs}conv${c.fixes ? ` (${c.fixes}fix)` : ""}  ${c.key}`).join("\n") || "(no mature candidates yet — keep working)";
        }
        if (a.action === "repairs") {
          const rs = detectRepairChains(loadExperience());
          return rs.slice(0, 10).map((r) => `×${r.count}/${r.convs}conv  FAIL[${r.trigger}] (${r.errClass}) → ${r.fixStep} → PASS`).join("\n") || "NONE YET · repair chains appear once a failure recurs";
        }
        if (a.action === "antipatterns") {
          const aps = detectAntiPatterns(loadExperience());
          return aps.slice(0, 10).map((p) => `×${p.fails}fails/${p.convs}conv  AVOID[${p.step}] — ${p.errClass}`).join("\n") || "NONE OBSERVED · no repeated unrecovered failures in the tape";
        }
        if (a.action === "defenses") {
          // The failure-defense set Hermes lacks: [trigger → error → consequence → defense].
          const ds = buildDefenses(loadExperience());
          return ds.slice(0, 12).map((d) => `[sev${d.severity} ${d.kind}] ${d.trigger} → ${d.errClass} ⇒ ${d.defense}`).join("\n") || "NONE YET · defenses appear once a failure repeats and is recovered";
        }
        if (a.action === "defense_hits") {
          // Advisory pre-action defense receipts recorded at tool_start (read-only; no enforcement).
          const hits: any[] = [];
          if (existsSync(DEFENSE_HITS)) for (const l of readFileSync(DEFENSE_HITS, "utf8").trim().split("\n").slice(-20)) { if (l) try { hits.push(JSON.parse(l)); } catch { /* */ } }
          return hits.length ? hits.map((h) => `[sev${h.severity} ${h.kind}] ${h.step} → ${h.errClass} ⇒ ${h.defense}`).join("\n") : "NONE YET · hits appear when a learned defense fires before an action";
        }
        if (a.action === "registry") {
          const reg = buildRegistry(dirs);
          return reg.count ? `${reg.count} managed skills:\n` + reg.skills.map((s) => `- ${s.name}: ${s.description}`).join("\n") : "(registry empty)";
        }
        if (a.action === "autopilot_plan") {
          // DRY-RUN preview of the self-driving loop — no writes.
          const rows = loadExperience();
          const plan = autopilotPlan({ rows, managed: managedView(dirs), dirsForDedup: dirs, config: { ...AUTOPILOT_DEFAULT, mode: a.mode === "auto" ? "auto" : "staged" } });
          const lines = plan.decisions.map((d) => d.op === "distill" ? `  DISTILL ${d.name} [${d.gate}] — ${d.reason}` : d.op === "refine" ? `  REFINE ${d.skill} — ${d.reason}` : `  RETIRE ${d.skill} — ${d.reason}`);
          return `autopilot mode=${plan.mode} budget=${plan.budget.used}/${plan.budget.limit}\n${lines.join("\n") || "  (no decisions)"}\nskipped: ${plan.skipped.length}`;
        }
        if (a.action === "reflect_plan") {
          // v3.1 DRY-RUN: show the cross-conversation evidence + the MemFS update-first routing (no model call, no write).
          const ev = buildCrossConversationEvidence(loadExperience());
          const reviewDirs = [...new Set([...dirs, STAGED_DIR])];
          const top = searchSkills(reviewDirs, ev.digest, 3);
          const decision = routeSkill(top, [], (name) => reviewDirs.some((dir) => existsSync(join(dir, name, "SKILL.md"))), 18);
          const route = decision.route === "update" && decision.target
            ? `UPDATE-FIRST → "${decision.target.name}" (score ${decision.target.score}, ${decision.target.matched} distinctive terms, dominant)`
            : decision.route === "park-ambiguous"
              ? "PARK (ambiguous overlap — refusing autonomous create)"
              : decision.route === "park-semantic"
                ? `PARK (possible semantic duplicate of "${decision.suspect}")`
                : "CREATE (no existing skill safely covers this)";
          return `reflective review preview — ${ev.convs} sessions, ${ev.items} durable signals\nrouting: ${route}\ntop matches: ${top.map((t) => `${t.name}(s${t.score}/m${t.matched})`).join(", ") || "none"}\n\n${ev.digest.slice(0, 700)}`;
        }
        if (a.action === "coverage") {
          // SKILL COVERAGE MAP: which task-classes have a defender, which are uncovered, which are over-covered.
          const cov = coverageMap(loadExperience(), dirs);
          if (!cov.length) return "NONE YET · task-classes appear once a pattern repeats";
          const icon = (s: string) => s === "covered" ? "✓" : s === "uncovered" ? "＋" : s === "over-covered" ? "⧉" : "✗";
          return cov.map((c) => `${icon(c.status)} [${c.status}] ${c.domain}${c.skill ? ` → ${c.skill}` : ""} (${c.signals} signals)`).join("\n");
        }
        if (a.action === "list") {
          const managed = buildRegistry(dirs).skills;
          return managed.length ? managed.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n") : "(no muscle-memory-managed skills yet — use muscle_memory_skill_write action:create)";
        }
        if (a.action === "curate") {
          const rows = curateManagedSkills(ctx);
          if (!rows.length) return "(no muscle-memory-managed skills yet — create one first)";
          return rows.map((r) => `${r.verdict.toUpperCase()} uses=${r.uses} ${r.name} — ${r.reason}`).join("\n");
        }
        if (a.action === "load") {
          if (!a.name) return { status: "error", content: "name required" };
          const d = findSkillDir(a.name);
          if (!d) return { status: "error", content: `no skill '${a.name}'` };
          return readSkill(d, a.name);
        }
        if (a.action === "draft") {
          const c = findCandidate(a.candidate_key);
          if (!c) return { status: "error", content: "no matching mature candidate — run action:candidates first or keep working" };
          const repair = repairForCandidate(c);
          const d = draftWithRepair(c, repair);
          const lint = lintSkillDraft(d, { needsPitfalls: !!c.fixes });
          return { candidate: c, ...d, repair: repair ?? null, lint, content: `---\nname: ${d.name}\ndescription: ${d.description}\n---\n\n${d.body}` };
        }
        return { status: "error", content: "unknown read action" };
      } catch (e: any) {
        return { status: "error", content: String(e?.message ?? e) };
      }
    };

    const writeRun = async (ctx: any) => {
      const a = ctx?.args || {};
      const dir = agentSkillsDir(ctx);
      const dirs = scanDirs(ctx);
      const findSkillDir = (name: string) => dirs.find((d) => existsSync(join(d, name, "SKILL.md")));
      try {
        if (a.action === "autopilot_run") {
          const cfg = { ...AUTOPILOT_DEFAULT, mode: (a.mode === "auto" ? "auto" : "staged") as AutopilotMode };
          const r = await runAutopilot(ctx, cfg);
          const res = r.result || { graduated: [], staged: [], refined: [], retired: [] };
          const ledgerWarnings = [
            ...res.graduated.map((name: string) => recordLifecycle("graduate", slug(name), "autopilot graduated skill after gates")),
            ...res.refined.map((name: string) => recordLifecycle("update", slug(name), "autopilot refined existing skill after gates")),
            ...res.retired.map((name: string) => recordLifecycle("retire", slug(name), "autopilot retired skill after evidence gate")),
          ].join("");
          return `autopilot ${cfg.mode}: graduated ${res.graduated.length} ${JSON.stringify(res.graduated)}, staged ${res.staged.length}, refined ${res.refined.length} ${JSON.stringify(res.refined)}, retired ${res.retired.length} ${JSON.stringify(res.retired)}. budget ${r.budget.used + res.graduated.length + res.staged.length}/${r.budget.limit}.${ledgerWarnings}`;
        }
        if (a.action === "reflect") {
          // v3.1 reflective review: cross-conversation evidence → forked reviewer → update-first + gates → write.
          const r = await runReflectiveReview(ctx, { mode: a.mode === "auto" ? "auto" : "staged", semanticFn: semanticFnFor(ctx?.agent?.id) });
          if (r.action === "none" || r.action === "reject") return `reflect: ${r.action} — ${r.reason || ""}`;
          const graduated = !!r.wrote && !String(r.wrote).startsWith(STAGED_DIR);
          const ledgerWarning = r.wrote && r.updateTarget
            ? recordLifecycle("update", slug(r.name), "reflect updated existing skill after evidence review")
            : graduated
              ? recordLifecycle("graduate", slug(r.name), "reflect graduated a new skill to the active shelf")
              : "";
          return `reflect: ${r.action} skill "${r.name}"${r.updateTarget ? ` (updated existing — anti-bloat)` : ""}${graduated ? " (graduated)" : ""} → ${r.wrote || "(write failed)"}${ledgerWarning}`;
        }
        if (a.action === "graduate") {
          if (!a.name) return { status: "error", content: "name required" };
          const p = graduateStagedSkill(String(a.name), ctx);
          const ledgerWarning = recordLifecycle("graduate", slug(a.name), "graduated staged skill to active shelf");
          return `graduated '${slug(a.name)}' -> ${p}${ledgerWarning}`;
        }
        if (a.action === "catalog_sync") {
          if (!a.name) return { status: "error", content: "name required" };
          const r = syncSkillToDesktopCatalog(String(a.name), ctx, { dryRun: !!a.dry_run, force: !!a.force });
          return r;
        }
        if (a.action === "pin") {
          if (!a.name) return { status: "error", content: "name required" };
          setPinned(slug(a.name), true);
          return `pinned '${slug(a.name)}' — protected from auto-retire/consolidation (patches still allowed)`;
        }
        if (a.action === "unpin") {
          if (!a.name) return { status: "error", content: "name required" };
          setPinned(slug(a.name), false);
          return `unpinned '${slug(a.name)}'`;
        }
        if (a.action === "retire") {
          if (!a.name) return { status: "error", content: "name required" };
          const reason = String(a.reason || "retired by muscle-memory");
          const target = retireManagedSkill(slug(a.name), reason, ctx, a.absorbed_into ? slug(a.absorbed_into) : undefined);
          const ledgerWarning = recordLifecycle("retire", slug(a.name), reason);
          return `Retired '${slug(a.name)}'${a.absorbed_into ? ` (absorbed into ${slug(a.absorbed_into)})` : ""} → ${target} (reversible quarantine)${ledgerWarning}`;
        }
        if (a.action === "create_from_candidate") {
          const c = findCandidate(a.candidate_key);
          if (!c) return { status: "error", content: "no matching mature candidate — run muscle_memory_skill_read action:candidates first or keep working" };
          const repair = repairForCandidate(c);
          const d = draftWithRepair(c, repair);
          const nm = slug(a.name || d.name);
          const retiredBlock = retiredSkillBlocker(nm, ctx);
          if (retiredBlock) return { status: "error", content: `retire-sticky blocked: ${retiredBlock}`, candidate: c };
          const desc = String(a.description || d.description);
          const dc = dedupCheck(nm, desc, createDedupeSurface(ctx)); // P0 2b: active + staged + retired-quarantine surface
          if (dc.dup) return { status: "error", content: `anti-bloat blocked: ${dc.reason}. Use action:patch on '${dc.name}' instead.`, candidate: c };
          const lint = lintSkillDraft({ name: nm, description: desc, body: d.body }, { needsPitfalls: !!c.fixes });
          if (!lint.ok) return { status: "error", content: `authoring-linter blocked: ${lint.issues.join("; ")}`, candidate: c };
          const secC = scanSkillContent(d.body); if (!secC.ok) return { status: "error", content: `security blocked: ${secC.issues.join("; ")}`, candidate: c };
          const prov = `\n<!-- ${MM_TAG}: distilled ${new Date().toISOString().slice(0, 10)}; candidate=${c.kind}:${c.key}; reps=${c.count}; convs=${c.convs}; fixes=${c.fixes}; impact=${impactScore(c).score} -->\n`;
          const content = `---\nname: ${nm}\ndescription: ${desc}\n---\n\n${d.body}${prov}\n`;
          const p = writeSkill(dir, nm, content);
          syncSkillToDesktopCatalog(nm, ctx);
          const ledgerWarning = recordLifecycle("learn", nm, `created from mature candidate ${c.kind}`);
          return `created '${nm}' from candidate '${c.key}'${repair ? ` (w/ observed Pitfall: ${repair.errClass})` : ""} -> ${p}\nLoad with muscle_memory_skill_read action:load, then invoke the normal Skill tool with skill="${nm}". Dedup max overlap ${Math.round(dc.overlap * 100)}% (${dc.name || "none"}); lint OK.${ledgerWarning}`;
        }
        if (a.action === "create") {
          if (!a.name || !a.description || !a.body) return { status: "error", content: "need name, description, body" };
          const nm = slug(a.name);
          const retiredBlock = retiredSkillBlocker(nm, ctx);
          if (retiredBlock) return { status: "error", content: `retire-sticky blocked: ${retiredBlock}` };
          const dc = dedupCheck(nm, a.description, createDedupeSurface(ctx)); // P0 2b: active + staged + retired-quarantine surface
          if (dc.dup) return { status: "error", content: `anti-bloat blocked: ${dc.reason}. Use action:patch on '${dc.name}' instead.` };
          const lint = lintSkillDraft({ name: nm, description: a.description, body: a.body });
          if (!lint.ok) return { status: "error", content: `authoring-linter blocked: ${lint.issues.join("; ")}` };
          const sec0 = scanSkillContent(a.body); if (!sec0.ok) return { status: "error", content: `security blocked: ${sec0.issues.join("; ")}` };
          const prov = `\n<!-- ${MM_TAG}: distilled ${new Date().toISOString().slice(0, 10)} -->\n`;
          const body = a.body.includes(MM_TAG) ? a.body : a.body + prov;
          const content = `---\nname: ${nm}\ndescription: ${a.description}\n---\n\n${body}\n`;
          const p = writeSkill(dir, nm, content);
          syncSkillToDesktopCatalog(nm, ctx);
          const ledgerWarning = recordLifecycle("learn", nm, "created after authoring and anti-bloat gates");
          return `created '${nm}' -> ${p}\nLoad with muscle_memory_skill_read action:load, then invoke the normal Skill tool with skill="${nm}" when you want to use it. Dedup max overlap ${Math.round(dc.overlap * 100)}% (${dc.name || "none"}).${ledgerWarning}`;
        }
        if (a.action === "patch") {
          if (!a.name || a.old == null || a.replacement == null) return { status: "error", content: "need name, old, replacement" };
          const d = findSkillDir(a.name);
          if (!d) return { status: "error", content: `no skill '${a.name}'` };
          const t = readSkill(d, a.name);
          if (!t.includes(a.old)) return { status: "error", content: "old text not found in skill" };
          const nt = t.replace(a.old, a.replacement);
          const secP = scanSkillContent(nt); if (!secP.ok) return { status: "error", content: `security blocked: ${secP.issues.join("; ")}` };
          writeSkill(d, a.name, nt); // pinned skills allow patch (Hermes: pin guards delete, not edit)
          syncSkillToDesktopCatalog(String(a.name), ctx);
          const ledgerWarning = recordLifecycle("update", slug(a.name), "patched active skill after review");
          return `patched '${a.name}' in ${d}${ledgerWarning}`;
        }
        if (a.action === "edit_full") {
          if (!a.name || !a.body) return { status: "error", content: "need name, body (full SKILL.md)" };
          const d = findSkillDir(a.name); if (!d) return { status: "error", content: `no skill '${a.name}'` };
          const desc = (a.body.match(/description:\s*(.+)/)?.[1] || a.description || "").trim();
          const lint = lintSkillDraft({ name: slug(a.name), description: desc, body: a.body }); if (!lint.ok) return { status: "error", content: `linter blocked: ${lint.issues.join("; ")}` };
          const sec = scanSkillContent(a.body); if (!sec.ok) return { status: "error", content: `security blocked: ${sec.issues.join("; ")}` };
          writeSkill(d, a.name, a.body.includes(MM_TAG) ? a.body : a.body + `\n<!-- ${MM_TAG}: edited ${new Date().toISOString().slice(0, 10)} -->\n`);
          syncSkillToDesktopCatalog(String(a.name), ctx);
          const ledgerWarning = recordLifecycle("update", slug(a.name), "full skill rewrite passed authoring gates");
          return `full-rewrote '${a.name}'${ledgerWarning}`;
        }
        if (a.action === "write_file") {
          if (!a.name || !a.file_path || a.file_content == null) return { status: "error", content: "need name, file_path, file_content" };
          const full = writeSupportFile(slug(a.name), String(a.file_path), String(a.file_content), ctx);
          return `wrote support file ${a.file_path} -> ${full}`;
        }
        if (a.action === "remove_file") {
          if (!a.name || !a.file_path) return { status: "error", content: "need name, file_path" };
          const grave = removeSupportFile(slug(a.name), String(a.file_path), ctx);
          return `removed ${a.file_path} (reversible quarantine -> ${grave})`;
        }
        if (a.action === "restore") {
          if (!a.name) return { status: "error", content: "name required" };
          const p = restoreManagedSkill(slug(a.name), ctx);
          const ledgerWarning = recordLifecycle("restore", slug(a.name), "restored quarantined skill to active shelf");
          return `Restored '${slug(a.name)}' to the active shelf → ${p}${ledgerWarning}`;
        }
        return { status: "error", content: "unknown write action" };
      } catch (e: any) {
        return { status: "error", content: String(e?.message ?? e) };
      }
    };

    const lifecycleParams = {
      type: "object",
      properties: {
        action: { type: "string", enum: ["reflect", "graduate", "publish", "prune"], description: "Safe no-approval lifecycle action" },
        mode: { type: "string", enum: ["staged", "auto"], description: "reflect mode; staged still auto-graduates trusted updates/high-confidence creates" },
        name: { type: "string", description: "staged skill name — for graduate" }
      },
      required: ["action"]
    };

    const lifecycleRun = async (ctx: any) => {
      const a = ctx?.args || {};
      try {
        if (a.action === "reflect") {
          const r = await runReflectiveReview(ctx, { mode: a.mode === "auto" ? "auto" : "staged", semanticFn: semanticFnFor(ctx?.agent?.id) });
          if (r.action === "none" || r.action === "reject") return `reflect: ${r.action} — ${r.reason || ""}`;
          const graduated = !!r.wrote && !String(r.wrote).startsWith(STAGED_DIR);
          if (r.updateTarget) {
            const ledgerWarning = r.wrote ? recordLifecycle("update", slug(r.name), "autonomous reflect updated existing skill") : "";
            return `reflect: Updated existing skill "${r.name}" — anti-bloat, live → ${r.wrote || "(write failed)"}${ledgerWarning}`;
          }
          if (graduated) {
            const ledgerWarning = recordLifecycle("graduate", slug(r.name), "autonomous reflect graduated new skill")
            return `reflect: Graduated new skill "${r.name}" to the active shelf → ${r.wrote || "(write failed)"}${ledgerWarning}`;
          }
          return `reflect: Staged new skill "${r.name}" for review → ${r.wrote || "(write failed)"}`;
        }
        if (a.action === "graduate") {
          if (!a.name) return { status: "error", content: "name required" };
          const p = graduateStagedSkill(String(a.name), ctx);
          const ledgerWarning = recordLifecycle("graduate", slug(a.name), "graduated staged skill to active shelf");
          return `Graduated '${slug(a.name)}' to the active shelf → ${p}${ledgerWarning}`;
        }
        if (a.action === "publish") {
          if (!a.name) return { status: "error", content: "name required" };
          const p = publishSkillToCatalog(String(a.name), ctx);
          return `Published '${slug(a.name)}' to the shared Custom Skills catalog → ${p}`;
        }
        if (a.action === "prune") {
          const r = runAutonomousPrune(ctx, { maxRetire: 1 });
          const ledgerWarnings = r.retired.map((name: string) => recordLifecycle("retire", slug(name), "autonomous prune retired skill after evidence gate")).join("");
          return `prune: retired ${r.retired.length} ${JSON.stringify(r.retired)}, flagged ${r.flagged.length}, kept ${r.kept.length}${ledgerWarnings}`;
        }
        return { status: "error", content: "unknown lifecycle action" };
      } catch (e: any) {
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
        step_id: { type: "string", description: "optional Letta step id — when present the rating also posts to native steps.feedback" },
      },
      required: ["skill", "rating"],
      additionalProperties: false,
    };
    const rateRun = async (ctx: any): Promise<string> => {
      const a = ctx?.args || {};
      const skill = slug(String(a.skill || "").trim());
      const rating = String(a.rating || "").toLowerCase();
      if (!skill) return "🚫 skill is required";
      if (rating !== "up" && rating !== "down" && rating !== "no_rate") return "🚫 rating must be up|down|no_rate";
      if (!isInstalledSkill(skill, ctx)) return `🚫 not recorded — skill '${skill}' is not installed on this agent`;
      const res = await rateSkill(letta.client, skill, rating as "up" | "down" | "no_rate", a.step_id ? String(a.step_id) : null, {
        reason: a.reason ? String(a.reason) : "",
        rater: process.env.MM_AGENT || "agent",
        evidenceRef: a.evidence_ref ? String(a.evidence_ref) : "",
        task: a.task ? String(a.task) : "",
        source: "agent",
        model: modelIdentity(ctx?.model),
        provider: providerIdentity(ctx?.model),
      });
      if (!res.recorded) return `🚫 not recorded — ${res.reason}`;
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
        supersedes_event_id: { type: "string", description: "optional exact active outcome event ID when correcting a prior judged outcome; append-only correction, never overwrite" },
      },
      required: ["possession_id", "result", "evidence_tier", "reason"],
      additionalProperties: false,
    };
    const outcomeRun = async (ctx: any): Promise<string> => {
      const a = ctx?.args || {};
      const possessionId = String(a.possession_id || "").trim();
      const result = String(a.result || "") as OutcomeResult;
      const tier = String(a.evidence_tier || "") as EvidenceTier;
      const events = loadPossessionEvents();
      const decision = events.find((event) => event.type === "decision" && event.possession_id === possessionId);
      if (!decision || decision.type !== "decision") return `🚫 not recorded — unknown possession '${possessionId}'`;
      const activeOutcome = events.filter((event) => event.type === "outcome" && event.possession_id === possessionId).at(-1);
      const supersedes = String(a.supersedes_event_id || "").trim();
      if (activeOutcome && !supersedes) return `🚫 not recorded — possession '${possessionId}' already has an outcome; correction requires supersedes_event_id='${activeOutcome.event_id}'`;
      if (!activeOutcome && supersedes) return `🚫 not recorded — cannot supersede a missing outcome for '${possessionId}'`;
      const prescribeResult = result === "helped" || result === "harmed" || result === "neutral";
      const abstainResult = result === "succeeded_unaided" || result === "failed_unaided";
      if ((decision.action === "prescribe" && !prescribeResult) || (decision.action === "abstain" && !abstainResult)) {
        return `🚫 not recorded — result '${result}' is incompatible with decision '${decision.action}'`;
      }
      if (tier !== "human_judged" && tier !== "agent_judged") return "🚫 not recorded — callers cannot self-award verified; evidence_tier must be human_judged|agent_judged";
      if (!String(a.reason || "").trim()) return "🚫 not recorded — reason is required";
      try {
        const recorded = recordPossessionEvent({
          schema: "mm.possession.v1",
          event_id: `o-${possessionId}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
          possession_id: possessionId,
          ts: Date.now(),
          type: "outcome",
          result,
          evidence_tier: tier,
          reason: String(a.reason),
          ...(a.evidence_ref ? { evidence_ref: String(a.evidence_ref) } : {}),
          ...(supersedes ? { supersedes_event_id: supersedes } : {}),
        });
        const earned = !supersedes && (result === "helped" || result === "succeeded_unaided");
        const affectedSkill = decision.action === "prescribe" ? String(decision.skill || "") : "";
        if (earned) flashEarnedMinute(affectedSkill || "smart restraint", affectedSkill);
        else writeUiState({ phase: "idle", last: "", skill: "", route: "" });
        const beat = !supersedes && result === "helped"
          ? `✓ skill helped · ${String(decision.skill || "prescribed skill")}`
          : !supersedes && result === "succeeded_unaided"
            ? "✓ no skill needed · task completed"
            : "";
        const receipt = `recorded ${tier.toUpperCase()} outcome '${result}' for ${possessionId}${supersedes ? ` · superseded ${supersedes}` : ""} · event ${recorded.event_id} · Decision Report updated from observed evidence`;
        return beat ? `${beat}\n${receipt}` : receipt;
      } catch (error: any) {
        return `🚫 not recorded — ${String(error?.message || error)}`;
      }
    };

    const closeParams = {
      type: "object",
      properties: {
        possession_id: { type: "string", description: "possession ID returned by muscle_memory_prescribe" },
        result: { type: "string", enum: ["helped", "harmed", "neutral", "succeeded_unaided", "failed_unaided"], description: "observed result; prescriptions use helped|harmed|neutral and abstentions use succeeded_unaided|failed_unaided" },
        reason: { type: "string", description: "one concrete sentence describing the observed task outcome" },
      },
      required: ["possession_id", "result", "reason"],
      additionalProperties: false,
    };
    const closeRun = async (ctx: any): Promise<string> => {
      const a = ctx?.args || {};
      const possessionId = String(a.possession_id || "").trim();
      const result = String(a.result || "") as OutcomeResult;
      const recorded = await outcomeRun({
        ...ctx,
        args: {
          possession_id: possessionId,
          result,
          evidence_tier: "agent_judged",
          reason: String(a.reason || ""),
        },
      });
      if (recorded.startsWith("🚫")) return recorded;

      const events = loadPossessionEvents();
      const decision = events.find((event): event is PossessionDecisionEvent => event.type === "decision" && event.possession_id === possessionId);
      const outcome = [...events].reverse().find((event) => event.type === "outcome" && event.possession_id === possessionId);
      const receipt = outcome?.event_id ? `\nRECEIPT · ${outcome.event_id}` : "";
      if (!decision) return recorded;
      if (decision.action === "abstain") {
        const abstentionRead = result === "succeeded_unaided"
          ? "smart restraint confirmed"
          : "task failed unaided";
        return `OUTCOME RECORDED · ${result.replace(/_/g, " ")} · agent-judged\nDECISION · abstained · ${abstentionRead}\nEVIDENCE · judged result added · not verified${receipt}`;
      }

      const skill = String(decision.skill || "prescribed skill");
      const decisions = new Map(events.filter((event): event is PossessionDecisionEvent => event.type === "decision").map((event) => [event.possession_id, event]));
      let judged = 0;
      let verified = 0;
      for (const event of events) {
        if (event.type !== "outcome") continue;
        const source = decisions.get(event.possession_id);
        if (!source || source.action !== "prescribe" || source.skill !== skill) continue;
        if (event.evidence_tier === "verified" && event.result === "helped" && source.verification && event.verification
          && isStoredVerificationReceiptBound(source.verification, event.verification, source.possession_id, source.event_id)) verified++;
        else if (event.evidence_tier === "agent_judged" || event.evidence_tier === "human_judged") judged++;
      }
      const proven = renderRosterSnapshot(ctx).provenNames.includes(skill);
      return `OUTCOME RECORDED · ${result} · agent-judged\nSKILL · ${skill}\nEVIDENCE · ${judged} judged · ${verified} verified · ${proven ? "proven" : "still unproven"}${receipt}`;
    };

    const verifierRegistrationParams = {
      type: "object",
      properties: {
        task_id: { type: "string", description: "unique lowercase verification task slug" },
        task_class: { type: "string", description: "lowercase task-class slug that must match the later possession" },
        target_rel: { type: "string", description: "canonical relative path under the trusted MM_EXACT_FILE_ROOT; absolute/traversing/symlink targets are refused" },
        expected_sha256: { type: "string", description: "canonical lowercase SHA-256 of the expected final file bytes" },
      },
      required: ["task_id", "task_class", "target_rel", "expected_sha256"],
      additionalProperties: false,
    };
    const verifierRegistrationRun = async (ctx: any): Promise<string> => {
      const a = ctx?.args || {};
      try {
        const created = createExactFileVerificationTask({
          taskId: String(a.task_id || ""),
          taskClass: String(a.task_class || ""),
          targetRel: String(a.target_rel || ""),
          expectedSha256: String(a.expected_sha256 || ""),
        });
        return `🔒 verification task registered read-only · ${created.task.task_id} · ${created.task.task_class} · manifest ${created.manifestSha256.slice(0, 12)}… · bind it during prescribe before work begins`;
      } catch (error: any) {
        return `🚫 verification task refused — ${String(error?.message || error)}`;
      }
    };

    const verifierParams = {
      type: "object",
      properties: {
        possession_id: { type: "string", description: "possession ID whose pre-work exact-file manifest binding will be verified; no caller-supplied result/path/hash/tier is accepted" },
      },
      required: ["possession_id"],
      additionalProperties: false,
    };
    const verifierRun = async (ctx: any): Promise<string> => {
      const possessionId = String(ctx?.args?.possession_id || "").trim();
      const events = loadPossessionEvents();
      const decision = events.find((event): event is PossessionDecisionEvent => event.type === "decision" && event.possession_id === possessionId);
      if (!decision) return `🚫 verification refused — unknown possession '${possessionId}'`;
      if (!decision.verification) return `🚫 verification refused — possession '${possessionId}' has no pre-work instrument binding`;
      if (events.some((event) => event.type === "outcome" && event.possession_id === possessionId)) {
        return `🚫 verification refused — possession '${possessionId}' already has an outcome`;
      }
      try {
        const verified = verifyExactFilePossession(decision);
        const stamp = Date.now();
        const recorded = recordInstrumentVerifiedOutcome({
          schema: "mm.possession.v1",
          event_id: `o-${possessionId}-${stamp.toString(36)}-${randomBytes(4).toString("hex")}`,
          possession_id: possessionId,
          ts: stamp,
          type: "outcome",
          ...verified,
        });
        if (verified.result === "helped") {
          const affectedSkill = String(decision.skill || "");
          flashEarnedMinute(affectedSkill || "prescribed skill", affectedSkill);
        } else writeUiState({ phase: "idle", last: "", skill: "", route: "" });
        return `🔬 BOUND-VERIFIED '${verified.result}' for ${possessionId} · adapter ${verified.verification.adapter_id} · manifest ${verified.verification.manifest_sha256.slice(0, 12)}… · event ${recorded.event_id}`;
      } catch (error: any) {
        return `🚫 verification refused — ${String(error?.message || error)}`;
      }
    };

    disposers.push(letta.tools.register({
      name: "muscle_memory_skill_read",
      description: advancedAgentSurface
        ? "Read Muscle Memory state. START with action:report for the private Decision Report (boxscore is a legacy alias). Use action:pending_possessions to resume open work, action:roster for conservative outcome review, and action:reflect_plan before learning. For a current task gap, prefer the dedicated muscle_memory_prescribe tool; legacy action:prescribe remains compatible. Coverage and low-level tape are diagnostics, not the primary workflow."
        : "Read the private Decision Report, resume a pending possession, review the skill roster, or load one known skill. For a current task gap, use muscle_memory_prescribe.",
      parameters: advancedAgentSurface ? readParams : leanReadParams,
      requiresApproval: false,
      async run(ctx: any) { return readRun(ctx); },
    }));

    disposers.push(letta.tools.register({
      name: "muscle_memory_prescribe",
      description: "Use after you observe a real procedural miss, or when you know you lack the procedure for the current task. Provide only the task and your explicit gap attestation. Returns exactly ONE installed Skill or ABSTAIN and opens one private possession. It never dumps the shelf, creates a skill, or infers hidden model capability. If you already know the recovery, do not call this tool; continue unaided. After a prescription, invoke the exact Skill tool, complete the task, then use muscle_memory_close.",
      parameters: prescribeParams,
      requiresApproval: false,
      async run(ctx: any) {
        return readRun({ ...ctx, args: { task: ctx?.args?.task, gap_observed: ctx?.args?.gap_observed, action: "prescribe" } });
      },
    }));

    disposers.push(letta.tools.register({
      name: "muscle_memory_close",
      description: "Lightweight default closeout for a Muscle Memory possession. Provide the returned possession_id, the observed result, and one concrete reason. The tool records agent_judged evidence automatically, reports whether the skill remains unproven, and cannot accept or self-award verified evidence. Use record_agent_possession only for human-judged closeout, evidence references, or append-only corrections; use verify_agent_possession for pre-bound instrument proof.",
      parameters: closeParams,
      requiresApproval: false,
      async run(ctx: any) { return closeRun(ctx); },
    }));

    if (advancedAgentSurface) {
      disposers.push(letta.tools.register({
      name: "record_agent_possession",
      description: "Advanced judged closeout and correction surface. Prefer muscle_memory_close for ordinary agent-judged outcomes. Use this full tool when a human owns the judgment, an evidence reference must be attached, or an append-only correction must supersede the exact active outcome event. Caller-recorded evidence remains human_judged or agent_judged only; verified is reserved for an instrument-owned adapter and cannot be self-awarded. Never promotes, publishes, or mutates a skill.",
      parameters: outcomeParams,
      requiresApproval: false,
      async run(ctx: any) { return outcomeRun(ctx); },
    }));

    disposers.push(letta.tools.register({
      name: "register_exact_file_verification",
      description: "Pre-register one immutable exact-file SHA-256 verification task before a prescribed edit begins. The caller defines the task class, trusted-root-relative target, and expected final digest; the mod writes a read-only manifest and returns its hash. It accepts no outcome/evidence tier and cannot close a possession.",
      parameters: verifierRegistrationParams,
      requiresApproval: false,
      async run(ctx: any) { return verifierRegistrationRun(ctx); },
    }));

    disposers.push(letta.tools.register({
      name: "verify_agent_possession",
      description: "Instrument-owned exact-file SHA-256 closeout for a possession that was bound to a pre-registered immutable verification task before work began. Accepts only possession_id; the adapter derives the trusted root, task, manifest, target, hash, result, evidence tier, reason, and receipt. Refuses unbound, tampered, replayed, symlinked, traversing, or already-closed possessions.",
      parameters: verifierParams,
      requiresApproval: false,
      async run(ctx: any) { return verifierRun(ctx); },
    }));

    disposers.push(letta.tools.register({
      name: "muscle_memory_skill_write",
      description: "muscle-memory writes (approval-gated, reversible). THE CORE LOOP: action:reflect distills a class-level skill from your cross-conversation work → update-first anti-bloat, security/lint-gated, staged by default. graduate promotes a staged skill to your active skill shelf. Plus create/patch/edit_full/retire/restore/pin lifecycle + write_file for support files. Preview first with reflect_plan (the read tool). For no-approval reflect/graduate/publish/prune, use muscle_memory_lifecycle_run.",
      parameters: writeParams,
      requiresApproval: true,
      async run(ctx: any) { return writeRun(ctx); },
    }));

    disposers.push(letta.tools.register({
      name: "muscle_memory_lifecycle_run",
      description: "muscle-memory autonomous lifecycle (no-approval, safe, reversible): reflect (distill a skill from your work), graduate (promote a staged skill → active shelf), publish (mirror a skill → shared Custom Skills catalog), prune (retire stale/unused skills). This is the full self-improvement loop. Broad/manual skill edits → muscle_memory_skill_write; preview → reflect_plan in muscle_memory_skill_read.",
      parameters: lifecycleParams,
      requiresApproval: false,
      async run(ctx: any) { return lifecycleRun(ctx); },
    }));

    disposers.push(letta.tools.register({
      name: "rate_skill",
      description: "Rate a muscle-memory skill from YOUR experience of whether it helped the NEXT possession — the field-referee signal (both agents rate at their own natural boundaries). rating: up (it helped), down (it misled / wasted time / added drag), no_rate (you used it but it was genuinely neutral). reason REQUIRED for down/no_rate — state the OUTCOME you saw; never rate because you remembered the skill or to self-congratulate (that is Goodhart on our own instrument). rater is auto-set to the calling agent. Writes an append-only reasoned event (rating-reasons.jsonl) + the backward-compatible plus-minus aggregate, feeding the read-only roster recommendations. Field ratings are ASSOCIATIONAL — they can flag a skill for patch/bench, never auto-promote or auto-retire it.",
      parameters: rateParams,
      requiresApproval: false,
      async run(ctx: any) { return rateRun(ctx); },
    }));
    }
  }

  return () => { for (const d of disposers.reverse()) d(); };
}
