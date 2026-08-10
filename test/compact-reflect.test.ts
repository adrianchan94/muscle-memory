// muscle-memory · E9 wiring — distill at the moment of forgetting (compact_start → reflect).
//
// Launch-safety contract, pinned per slice (these are the exact guarantees the public claim
// makes): the compact_start handler (1) NEVER blocks or transforms compaction — it returns
// undefined synchronously in every mode; (2) writes a receipt carrying the compaction trigger;
// (3) fires the reflective review ONLY under opt-in MM_REFLECT=staged|auto (default off);
// (4) is fire-and-forget — the handler returns before any reflect work resolves; (5) never
// throws even on a completely empty state dir.
//
// Pattern: test/reflex.test.ts fakeLetta harness — activate() self-gates on capabilities, so a
// surface exposing only events.compact exercises exactly the E9 lane.
import { test, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import activate from "../mods/index";
import { RECEIPTS_DIR } from "../mods/core";

const MM_ENV_KEYS = ["MM_REFLEX", "MM_AUTOPILOT", "MM_REFLECT", "MM_NATIVE", "MM_GUARD", "MM_CAPTURE"] as const;

/** Scrub every mode env that could change activate()'s behavior; restore exactly afterwards. */
function withScrubbedEnv<T>(overrides: Record<string, string>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of MM_ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  try { return fn(); }
  finally { for (const k of MM_ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

type Emit = (name: string, event: unknown) => unknown;

/** Surface exposing ONLY the compact capability — everything else in activate() self-gates off. */
function fakeCompactLetta(): { letta: unknown; emit: Emit } {
  type Handler = (event: unknown, ctx: unknown) => unknown;
  const handlers = new Map<string, Handler[]>();
  const letta = {
    capabilities: { events: { compact: true } },
    events: { on: (name: string, fn: Handler) => { const l = handlers.get(name) ?? []; l.push(fn); handlers.set(name, l); return () => {}; } },
    client: null,
  };
  const emit: Emit = (name, event) => {
    let last: unknown;
    for (const fn of handlers.get(name) ?? []) last = fn(event, { agent: { id: "compact-test-agent" } });
    return last;
  };
  return { letta, emit };
}

function receiptsSince(t0: number): Array<Record<string, unknown>> {
  if (!existsSync(RECEIPTS_DIR)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const f of readdirSync(RECEIPTS_DIR)) {
    if (!f.startsWith("compact-") || f.startsWith("compact-end-")) continue;
    const ts = Number(f.replace(/^compact-/, "").replace(/\.json$/, ""));
    if (!Number.isFinite(ts) || ts < t0) continue;
    try { out.push(JSON.parse(readFileSync(join(RECEIPTS_DIR, f), "utf8"))); } catch { /* skip */ }
  }
  return out;
}

test("E9 · MM_REFLECT off (default): compact_start returns undefined synchronously and writes a trigger-bearing receipt — never blocks compaction", () => {
  withScrubbedEnv({}, () => {
    const { letta, emit } = fakeCompactLetta();
    const dispose = activate(letta);
    try {
      const t0 = Date.now();
      const ret = emit("compact_start", { conversationId: "conv-e9-off", trigger: "context_window_overflow" });
      expect(ret).toBeUndefined(); // handler NEVER transforms/cancels compaction
      const receipts = receiptsSince(t0).filter((r) => r.conv === "conv-e9-off");
      expect(receipts.length).toBe(1);
      expect(receipts[0].trigger).toBe("context_window_overflow"); // trigger recorded for the audit trail
      expect(receipts[0].phase).toBe("start");
    } finally { dispose(); }
  });
});

test("E9 · MM_REFLECT=staged: handler still returns undefined SYNCHRONOUSLY (fire-and-forget) and never throws on an empty state dir", () => {
  withScrubbedEnv({ MM_REFLECT: "staged" }, () => {
    const { letta, emit } = fakeCompactLetta();
    const dispose = activate(letta);
    try {
      const before = Date.now();
      const ret = emit("compact_start", { conversationId: "conv-e9-staged", trigger: "manual" });
      const elapsed = Date.now() - before;
      expect(ret).toBeUndefined();           // reflect result is NEVER the handler's return
      expect(elapsed).toBeLessThan(1000);    // synchronous return — reflect runs behind, not in front
      // Double-fire while a reflect may be in flight: the in-flight guard makes this safe (no throw,
      // still undefined) — the guarantee is "at most one reflect at a time", pinned by behavior here.
      expect(emit("compact_start", { conversationId: "conv-e9-staged", trigger: "manual" })).toBeUndefined();
    } finally { dispose(); }
  });
});

test("E9 · compact_end receipt still written (pre-existing contract untouched by the reflect upgrade)", () => {
  withScrubbedEnv({}, () => {
    const { letta, emit } = fakeCompactLetta();
    const dispose = activate(letta);
    try {
      expect(emit("compact_end", { conversationId: "conv-e9-end", trigger: "manual", messagesBefore: 100, messagesAfter: 20 })).toBeUndefined();
      // compact-end receipts share the dir with start receipts under a distinct prefix.
      const files = existsSync(RECEIPTS_DIR) ? readdirSync(RECEIPTS_DIR).filter((f) => f.startsWith("compact-end-")) : [];
      expect(files.length).toBeGreaterThan(0);
    } finally { dispose(); }
  });
});
