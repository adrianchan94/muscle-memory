// Forced loop-closure nudge.
//
// WHY THIS EXISTS (measured, not assumed): agents close the learning loop 0/9 when merely
// hoped for and 9/9 when explicitly asked, at identical task success. And when they DO report,
// free-prose asks fail a different way: 12/22 narrated a failure in prose and then wrote "none"
// in the adjacent machine-readable field of the same message. So MM stops hoping. The moment
// the instrument witnesses the prescribed skill actually run (observeToolEnd binds the call to
// exactly ONE open possession), the ask rides back on that tool's own output as a
// <system-reminder> — the same cache-safe channel the reflex coach uses — and the ask is
// ENUMERATED: exact tool, exact possession_id, exact result vocabulary. Prose does not count.
//
// This module is pure text composition. It grants nothing, signs nothing, and closes nothing:
// the close itself still lands as agent_judged evidence through muscle_memory_close, with all
// existing ledger validation. A nudge can only make the ask happen; it cannot mint an outcome.

/** Default ON — the 0/9 unforced number IS the case for forcing. MM_CLOSE_NUDGE=off opts out. */
export function closeNudgeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.MM_CLOSE_NUDGE || "").toLowerCase() !== "off";
}

/**
 * The reminder appended to a successful prescribed-Skill invocation's own output.
 *
 * Wording is deliberate:
 *  - names the exact possession_id, so the close cannot bind to the wrong possession;
 *  - enumerates the prescription result vocabulary (helped | harmed | neutral) — the
 *    machine-readable field is what the ledger reads, and the disclosure data says the
 *    field goes empty precisely when it is left open-ended;
 *  - permits deferring past the current step but never past the turn, so "later" cannot
 *    quietly become "never" (the observed unforced steady state).
 */
export function closeoutNudge(opts: { skill: string; possessionId: string }): string {
  return [
    "\n\n<system-reminder>",
    `muscle-memory OPEN POSSESSION · the prescribed skill "${opts.skill}" just ran under possession ${opts.possessionId}.`,
    "CLOSE THE LOOP NOW · call muscle_memory_close with:",
    `  possession_id="${opts.possessionId}"`,
    "  result = exactly ONE of: helped | harmed | neutral",
    "  reason = one concrete sentence about the observed task outcome",
    "The ledger reads ONLY the machine-readable result field — narrating the outcome in prose does not record it.",
    "If the outcome is not observable yet, finish the task first, then close before this turn ends.",
    "</system-reminder>",
  ].join("\n");
}


// ── SHELF-CONSULT nudge (G3 · INVOCATION) ────────────────────────────────────────────────────
//
// WHY THIS EXISTS (measured, not assumed): across 21 benchmark conversations there were ZERO
// muscle_memory_* calls — MM was loaded, its 9 tools registered, and it was never once asked.
// The audit found no channel that tells a FRESH agent, in-context, that a routing consult even
// exists: MM_NATIVE=blocks syncs only at conversation_close (too late for a one-shot run, and
// the local backend's client cannot reach agents.blocks.update — verified silent no-op),
// MM_CTX_QUERY only shapes a prescribe the agent never issues, and MM_REFLEX/MM_CLOSE_NUDGE
// require prior defenses or an already-open possession. So the one thing MM may do is SAY,
// once, that it can be consulted — and then get out of the way.
//
// Contract: opt-in (default OFF), fires at most ONCE per conversation, only on a SUCCESSFUL
// ordinary tool result, only when the shelf is non-empty, and never after the agent has already
// consulted MM or invoked a Skill on its own. Advisory text only: it names no specific skill,
// pre-fills nothing, and explicitly licenses continuing unaided. When MM would abstain, the
// agent that follows the advisory gets an ABSTAIN and loses one tool call — which is why the
// default stays OFF and the trigger is once-ever.

/** Default OFF — surfacing advice into an agent's context is an operator decision. MM_PRESCRIBE_NUDGE=on opts in. */
export function prescribeNudgeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.MM_PRESCRIBE_NUDGE || "").toLowerCase() === "on";
}

/** The one-time advisory appended to the first successful ordinary tool result. Pure text.
 *
 * PHRASING IS THE MECHANISM, and it is measured — not a style choice.
 * Adrian's burst-possession runs held everything constant (same task, same mounted mod, same
 * MM_REFLEX=on) and varied ONLY the wording of the ask:
 *   FREE   "use them when you hit a real procedural miss / otherwise recover however you can"
 *          -> prescribe 0/9, loop closed 0/9  (at IDENTICAL 9/9 task success)
 *   FORCED exact tool name + exact argument names + branch semantics + ENUMERATED outcomes
 *          -> prescribe 9/9, loop closed 9/9 across terra/luna/glm
 * burst-unprompt (n=114) is the same law as a dial: a bare section header buys ~18% disclosure,
 * adding an ENUMERATION CLAUSE buys ~87%. Vague asks are ignored; specific ones are answered.
 *
 * The first version of this advisory shipped the FREE phrasing verbatim ("you may call ...",
 * "no reply is needed") — i.e. the arm measured at zero.
 *
 * WHAT WE DELIBERATELY DO NOT COPY: the study arm was a numbered REQUIRED protocol with an
 * anti-skip clause. That is legitimate inside an experiment prompt and coercive inside a product:
 * an imperative injected into every tool result would compete with the user's actual task. The
 * transferable ingredient is SPECIFICITY (name the tool, name the arguments, spell out both
 * branches, enumerate the outcome vocabulary), not compulsion. This stays advisory: the agent may
 * ignore it, and silence is a valid response.
 */
export function prescribeNudge(skillCount: number): string {
  return [
    "\n\n<system-reminder>",
    `muscle-memory · ${skillCount} installed skill${skillCount === 1 ? "" : "s"} on this agent's shelf (shown once).`,
    "If any part of the current task hits a procedure you do not already know:",
    "  call muscle_memory_skill_read with action=\"prescribe\", task=<one sentence describing the gap>, gap_observed=true",
    "It returns exactly ONE of:",
    "  PRESCRIBE <skill> — invoke that skill with the Skill tool, then apply its procedure",
    "  ABSTAIN — no installed skill fits; continue unaided, which is a correct outcome",
    "If you already know the procedure, continue unaided and ignore this note.",
    "</system-reminder>",
  ].join("\n");
}

/* ── APPLY NUDGE ───────────────────────────────────────────────────────────────
 * MEASURED 2026-08-09 on Skill-Use. Letta opens a skill with a plain `Read` of SKILL.md, which
 * frames it as A DOCUMENT TO EVALUATE. Claude Code opens it via the `Skill` tool, which frames it
 * as AN SOP TO APPLY. Same model, opposite stance — and Letta trails CC on content compliance by
 * 0.33-0.46 on exactly the tasks where the skill prescribes a procedure.
 *
 * Worse, MM could not even SEE it: index.ts shelfConsulted only fires on tool==="Skill", so a Read
 * of SKILL.md was invisible to every MM channel. MM was in-context INERT on all three losing tasks.
 *
 * The literature says the same thing causally: omission-type constraints (prohibitions) decay
 * 73% -> 33% by turn 16 (arXiv 2604.20911, 4416 trials, 12 models, p<1e-33), while commission-type
 * constraints persist. Our football failure was a prohibition ("never hardcode a season_id")
 * broken at call ~10-16. Re-injection before that depth restores compliance without retraining.
 *
 * The three failure modes below are the ones we actually measured, not a generic reminder.
 */
export function applyNudgeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.MM_APPLY_NUDGE ?? "on").toLowerCase() !== "off";
}

export type FieldRecord = { plus: number; minus: number; lastStepId?: string | null } | null | undefined;

// GOVERNANCE ACTUATOR (2026-08-10). Until now every loadPlusMinus() call site was DISPLAY-ONLY and
// skillUtility() had NO callers: MM accumulated a scoreboard nobody played off. Measured in the
// episode pilot — arm B carried 4 ratings forward and produced a slope IDENTICAL to four decimals
// against the arm that wiped its library every task. A library with no consumer cannot change
// behaviour. This is the read path: accumulated field evidence alters the injected contract.
export function applyNudge(skill: string, field?: FieldRecord): string {
  // trim FIRST: a whitespace-only name is falsy only after trimming, and "   " must not leak
  // into the prompt as a blank skill reference.
  const name = String(skill ?? "").trim() || "this skill";
  const plus = Number(field?.plus ?? 0), minus = Number(field?.minus ?? 0);
  // RATE, NOT COUNT (2026-08-10, measured on ToolBench G3). A COUNT-based penalty is nearly
  // indistinguishable from "this skill gets used a lot": corr(miss_count, retrieval_count) = 0.995,
  // and a count penalty was 88% explained by a gold-BLIND frequency baseline (+0.0594 of +0.0675).
  // Normalising by attempts drops that correlation to 0.409 and beats the gold-blind confound 4/4.
  // The attempts floor stops one unlucky run from condemning a skill.
  const attempts = plus + minus;
  const failRate = attempts > 0 ? minus / attempts : 0;
  // FIELD TAPE (2026-08-10) — UNGATED raw record at n>=1, requested by the consumer (Kev) after the
  // P1 sweep showed the caution gate is unreachable: swept minAttempts x {2,3,5,8} against
  // minFailRate x {0.3,0.5,0.667,0.8} over the live 16-skill ledger and ALL 16 SETTINGS FIRED ON
  // ZERO SKILLS, because minus=0 everywhere. Below the gate `caution` is [] — the agent saw NO field
  // data at any n<5, ever. Raw counts are the only channel reachable with today's ledger.
  // The consumer asked to judge the tape himself rather than be handed a verdict.
  // EVIDENCE TIER is not decoration: autorate stamps lastStepId with the toolCallId, manual
  // rateSkill leaves it null. That is the only discriminator between an outcome observed from a
  // tool result and one an agent asserted about itself — and 5/5 historical "helped" ratings were
  // agent-judged, so an unlabelled tape would launder self-assessment as measurement.
  const tier = field?.lastStepId ? "tool-observed" : "agent-judged";
  const tape = attempts >= 1
    ? [`- FIELD TAPE · ${plus} helped / ${minus} missed · n=${attempts} · evidence=${tier}`]
    : [];
  const caution = (attempts >= 5 && failRate >= 0.5)
    ? [`- FIELD RECORD: this skill has failed ${minus} of ${attempts} attempts on this runtime (${Math.round(failRate * 100)}%). Follow it, but verify each step's effect before moving on, and say so if it misleads you.`]
    : [];
  return [
    `[muscle-memory] You just opened **${name}**. Treat it as a procedure to APPLY, not a document to review.`,
    `- Follow its steps IN ORDER. If you deviate, say so explicitly and say why.`,
    `- Never hardcode a value the procedure says to DERIVE. Pipe the derived value through.`,
    `- If it prescribes framings or checks to cover, cover EACH ONE before you finish.`,
    ...tape,
    ...caution,
    `Disagreeing with the skill is allowed. Silently substituting your own approach is not.`,
  ].join("\n");
}
