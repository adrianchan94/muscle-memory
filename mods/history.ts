// muscle-memory · E6 RETROACTIVE MINING — trace-to-skill from history the mod never saw live.
//
// The live tap (index.ts tool_start/tool_end) only learns from sessions where muscle-memory was
// installed and awake. But every Letta agent already carries its practice film: the message
// history holds tool_call_message / tool_return_message pairs with names, args, statuses, and
// timestamps. This module replays that history through the SAME deterministic pipeline the live
// tap uses — fingerprint() for step identity, classifyError() for payload-free error classes —
// and appends the results to the SAME experience/outcome JSONL streams, so repair-chain
// detection, ENGRAM consolidation, and reflection consume mined history with zero new code.
//
// Day-one value: install muscle-memory on a six-month-old agent and its first reflection already
// has months of tape. (Trace-to-skill / retroactive distillation — the Jun-2026 research wave —
// grounded in Letta's own primitives instead of a bespoke trace store.)
//
// Safety model: mining READS agent history and WRITES only local muscle-memory state. It never
// messages the agent, never mutates server state, and never re-mines the same span: a per-agent
// watermark records the newest mined message id + timestamp. Mined records carry `mined: true`
// so audits can always separate replayed tape from live capture.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl, ensureDir, hash, LOG_PATH, OUTCOME_PATH, STATE_DIR } from "./core";
import { classifyError, fingerprint } from "./detect";
import { pageItems, reachFn } from "./engram"

export const MINE_WATERMARK_PATH = join(STATE_DIR, "mined-watermark.json");

export type MinedBatch = {
  /** tool_start-equivalent rows appended to experience.jsonl */
  rows: number;
  /** tool_end-equivalent rows appended to outcomes.jsonl */
  outcomes: number;
  /** messages inspected across all fetched pages */
  scanned: number;
  /** newest message id seen (the next watermark) */
  newestId: string | null;
  newestTs: number;
};

type Watermark = Record<string, { id: string; ts: number }>;

export function loadWatermarks(): Watermark {
  try {
    if (!existsSync(MINE_WATERMARK_PATH)) return {};
    const parsed: unknown = JSON.parse(readFileSync(MINE_WATERMARK_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Watermark) : {};
  } catch { return {}; }
}

function saveWatermark(agentId: string, id: string, ts: number): void {
  try {
    ensureDir();
    const all = loadWatermarks();
    all[agentId] = { id, ts };
    writeFileSync(MINE_WATERMARK_PATH, JSON.stringify(all, null, 2));
  } catch { /* best-effort — a failed watermark only risks a duplicate mine, never data loss */ }
}

/** Narrow an unknown wire message into the two shapes mining consumes. Pure. */
export type MinedEvent =
  | { kind: "call"; ts: number; id: string; conv: string | null; tool: string; args: Record<string, unknown> }
  | { kind: "return"; ts: number; id: string; conv: string | null; tool: string | null; ok: boolean; text: string };

export function parseHistoryMessage(m: unknown): MinedEvent[] {
  if (!m || typeof m !== "object") return [];
  const msg = m as Record<string, unknown>;
  const ts = typeof msg.date === "string" ? Date.parse(msg.date) || Date.now() : Date.now();
  const conv = typeof msg.conversation_id === "string" ? msg.conversation_id : null;
  const out: MinedEvent[] = [];
  const mtype = typeof msg.message_type === "string" ? msg.message_type : "";
  if (mtype === "tool_call_message") {
    // tool_call may be a single call; tool_calls an array — handle both, skip deltas without names.
    const calls: unknown[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : msg.tool_call ? [msg.tool_call] : [];
    for (const c of calls) {
      if (!c || typeof c !== "object") continue;
      const call = c as Record<string, unknown>;
      const tool = typeof call.name === "string" ? call.name : "";
      const id = typeof call.tool_call_id === "string" ? call.tool_call_id : "";
      if (!tool || !id) continue;
      let args: Record<string, unknown> = {};
      if (typeof call.arguments === "string") {
        try { const parsed: unknown = JSON.parse(call.arguments); if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>; } catch { /* unparseable args → empty fp basis */ }
      }
      out.push({ kind: "call", ts, id, conv, tool, args });
    }
  } else if (mtype === "tool_return_message") {
    const id = typeof msg.tool_call_id === "string" ? msg.tool_call_id : "";
    if (id) {
      const status = typeof msg.status === "string" ? msg.status : "";
      const ret: unknown = msg.tool_return;
      const text = typeof ret === "string" ? ret : Array.isArray(ret) ? ret.map((p) => (p && typeof p === "object" && "text" in p && typeof (p as Record<string, unknown>).text === "string" ? String((p as Record<string, unknown>).text) : "")).join("\n") : "";
      out.push({ kind: "return", ts, id, conv, tool: typeof msg.name === "string" ? msg.name : null, ok: status === "success", text });
    }
  }
  return out;
}

/** Convert mined events into the exact JSONL records the live tap writes. Pure — the append is
 * the caller's. Records carry mined:true so audits can separate tape from live capture. */
export function minedRecords(events: MinedEvent[]): { rows: Array<Record<string, unknown>>; outcomes: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  const outcomes: Array<Record<string, unknown>> = [];
  for (const e of events) {
    if (e.kind === "call") {
      const { fp, tmpl } = fingerprint(e.tool, e.args);
      rows.push({ ts: e.ts, conv: e.conv, tool: e.tool, fp, tmpl, h: hash(fp), id: e.id, mined: true });
    } else {
      outcomes.push({ ts: e.ts, id: e.id, tool: e.tool, conv: e.conv, ok: e.ok, err: e.ok ? null : classifyError(e.text, false), mined: true });
    }
  }
  return { rows, outcomes };
}

/** Mine an agent's message history into local experience state. Paginated, watermarked,
 * read-only on the server. Never throws; returns zeroed counts on any failure. */
export async function mineAgentHistory(client: unknown, agentId: string, opts?: { maxPages?: number; pageSize?: number; stateDirOverride?: { log: string; outcomes: string } }): Promise<MinedBatch> {
  const empty: MinedBatch = { rows: 0, outcomes: 0, scanned: 0, newestId: null, newestTs: 0 };
  if (!agentId) return empty;
  const list = reachFn(client, ["agents", "messages", "list"]); // client.agents.messages.list(agentId, params)
  if (!list) return empty;
  const mark = loadWatermarks()[agentId];
  const maxPages = opts?.maxPages ?? 10;
  const pageSize = opts?.pageSize ?? 100;
  const logPath = opts?.stateDirOverride?.log ?? LOG_PATH;
  const outPath = opts?.stateDirOverride?.outcomes ?? OUTCOME_PATH;
  let scanned = 0, rowsWritten = 0, outcomesWritten = 0;
  let newestId: string | null = null, newestTs = 0;
  let after: string | undefined; // ascending cursor — resume from the watermark, walk forward
  if (mark) after = mark.id;
  try {
    for (let page = 0; page < maxPages; page++) {
      const resp: unknown = await list(agentId, { limit: pageSize, ...(after ? { after } : {}), order: "asc" });
      // Stainless pages expose the items on `.data`; plain arrays come back on some surfaces.
      const items: unknown[] = pageItems(resp)
      if (!items.length) break;
      for (const m of items) {
        scanned++;
        const events = parseHistoryMessage(m);
        const { rows, outcomes } = minedRecords(events);
        for (const r of rows) { appendJsonl(logPath, r); rowsWritten++; }
        for (const o of outcomes) { appendJsonl(outPath, o); outcomesWritten++; }
        const mid = m && typeof m === "object" && "id" in m && typeof (m as Record<string, unknown>).id === "string" ? String((m as Record<string, unknown>).id) : null;
        const mts = m && typeof m === "object" && "date" in m && typeof (m as Record<string, unknown>).date === "string" ? Date.parse(String((m as Record<string, unknown>).date)) || 0 : 0;
        if (mid) { newestId = mid; newestTs = mts; }
      }
      const last = items[items.length - 1];
      const cursor = last && typeof last === "object" && "id" in last && typeof (last as Record<string, unknown>).id === "string" ? String((last as Record<string, unknown>).id) : undefined;
      if (!cursor || items.length < pageSize) { after = cursor; break; }
      after = cursor;
    }
  } catch { /* best-effort — partial mining is still valid tape; watermark only advances over what landed */ }
  if (newestId && !opts?.stateDirOverride) saveWatermark(agentId, newestId, newestTs);
  return { rows: rowsWritten, outcomes: outcomesWritten, scanned, newestId, newestTs };
}
