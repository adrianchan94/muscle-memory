// Instrument-owned observation of Skill invocations.
//
// Procedural credit requires evidence that the prescribed skill actually ran. That evidence
// cannot come from a caller: any tool an agent can reach is a tool an agent can lie to. So the
// observer lives on the runtime's own tool event stream, and nothing here is exported as a
// credit-granting function - the only export is the event handler pair and a read used by the
// signer.
//
// Fail-closed everywhere: ambiguity (two open possessions for the same skill), a failed tool,
// a missing callId, or an out-of-order timestamp all yield no qualifying invocation.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { STATE_DIR } from "./core";

export const INVOCATION_LOG_PATH = join(STATE_DIR, "invocations.jsonl");

export type SkillInvocationEvent = {
  schema: "mm.invocation.v1";
  invocation_id: string;
  possession_id: string;
  decision_event_id: string;
  skill: string;
  call_id: string;
  started_at: number;
  ended_at: number;
  nonce: string;
};

const SCHEMA = "mm.invocation.v1" as const;
const SAFE = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

/** In-flight Skill calls, keyed by the runtime's call id. Bounded; same-turn only. */
const pending = new Map<string, { skill: string; startedAt: number }>();

function appendInvocation(event: SkillInvocationEvent): void {
  mkdirSync(dirname(INVOCATION_LOG_PATH), { recursive: true });
  appendFileSync(INVOCATION_LOG_PATH, `${JSON.stringify(event)}\n`, "utf8");
}

export function loadInvocations(): SkillInvocationEvent[] {
  if (!existsSync(INVOCATION_LOG_PATH)) return [];
  const rows: SkillInvocationEvent[] = [];
  for (const line of readFileSync(INVOCATION_LOG_PATH, "utf8").split("\n")) {
    const text = line.trim();
    if (!text) continue;
    try {
      const raw = JSON.parse(text);
      if (raw?.schema !== SCHEMA) continue;
      if (!SAFE.test(String(raw.possession_id ?? "")) || !SAFE.test(String(raw.invocation_id ?? ""))) continue;
      rows.push(raw as SkillInvocationEvent);
    } catch { /* a malformed line is not an invocation */ }
  }
  return rows;
}

/**
 * The one qualifying invocation for a possession, or null.
 *
 * Qualifying means: same possession, same decision event, exact skill, and the call both started
 * and finished inside the window between the baseline capture and the verification. More than one
 * match is ambiguity, and ambiguity earns nothing.
 */
export function qualifyingInvocation(opts: {
  possessionId: string;
  decisionEventId: string;
  skill: string;
  baselineAt: number;
  verifiedAt: number;
  invocations?: SkillInvocationEvent[];
}): SkillInvocationEvent | null {
  const rows = (opts.invocations ?? loadInvocations()).filter((row) =>
    row.possession_id === opts.possessionId
    && row.decision_event_id === opts.decisionEventId
    && row.skill === opts.skill
    && row.started_at >= opts.baselineAt
    && row.ended_at >= row.started_at   // a fast skill can start and finish inside one millisecond
    && row.ended_at <= opts.verifiedAt);
  return rows.length === 1 ? rows[0]! : null;
}

/**
 * Records the start of a Skill call. Observation only - it cannot grant anything, and an
 * unrecognised tool or a missing call id simply leaves nothing to match later.
 */
export function observeToolStart(event: { toolName?: unknown; toolCallId?: unknown; args?: any }, now: number = Date.now()): void {
  if (String(event?.toolName ?? "") !== "Skill") return;
  const skill = String(event?.args?.skill ?? "");
  const callId = String(event?.toolCallId ?? "");
  if (!skill || !callId || !SAFE.test(callId)) return;
  pending.set(callId, { skill, startedAt: now });
  if (pending.size > 256) {
    const first = pending.keys().next().value;
    if (first !== undefined) pending.delete(first);
  }
}

/**
 * Records a completed Skill call against exactly one open prescribed possession for that skill.
 *
 * `openPossessions` is supplied by the caller of the handler (the runtime), not by the agent.
 * Zero matches means there is nothing to credit; more than one means we cannot tell which
 * possession the call belongs to, and guessing would be the whole defect we are fixing.
 */
export function observeToolEnd(
  event: { toolCallId?: unknown; status?: unknown; ok?: unknown; isError?: unknown; error?: unknown },
  openPossessions: Array<{ possession_id: string; event_id: string; skill?: string }>,
  now: number = Date.now(),
): SkillInvocationEvent | null {
  const callId = String(event?.toolCallId ?? "");
  const started = callId ? pending.get(callId) : undefined;
  if (!started) return null;
  pending.delete(callId);

  const status = String(event?.status ?? "");
  const ok = status ? status === "success" : (event?.ok ?? !(event?.isError || event?.error));
  if (!ok) return null; // a failed or cancelled call is not an invocation

  const matches = openPossessions.filter((row) => row.skill === started.skill);
  if (matches.length !== 1) return null; // 0 = nothing open, >1 = ambiguous. Both earn nothing.

  const invocation: SkillInvocationEvent = {
    schema: SCHEMA,
    invocation_id: `inv-${randomUUID()}`,
    possession_id: matches[0]!.possession_id,
    decision_event_id: matches[0]!.event_id,
    skill: started.skill,
    call_id: callId,
    started_at: started.startedAt,
    ended_at: now,
    nonce: randomUUID(),
  };
  appendInvocation(invocation);
  return invocation;
}

/** Test seam: the runtime's own handlers, so a replay drives the same code the runtime does. */
export const __invocationSeam = { observeToolStart, observeToolEnd, pending };
