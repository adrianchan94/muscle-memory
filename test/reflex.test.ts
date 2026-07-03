// muscle-memory · E5 REFLEX tests — the failure-time coach (opt-in MM_REFLEX=on).
//
// CONTRACT UNDER TEST
//  Pure (coachOnFailure): a failing step is coached ONLY when it matches a learned
//  kind:"fix" defense proven ≥2× AND the current failure classifies like the learned
//  one — a step failing a NEW way never gets stale advice; "avoid" defenses never
//  coach (prevention is MM_GUARD's job).
//  Wiring (activate): with MM_REFLEX=on, a failure matching a matured repair chain
//  gets the known fix appended to the failing tool's own output as a <system-reminder>,
//  surfaced as { result: { status, output } } FROM the tool_end handler's return value,
//  at most once per conversation per trigger. With MM_REFLEX unset, the identical
//  event passes through untouched (undefined).
//
// NOTE: activate() reads/writes the module's STATE_DIR (a module-load constant), so the
// wiring tests assert ONLY on handler RETURN VALUES and nonce the command (Date.now())
// so nothing already in the persistent log can pre-match this run; appends to the state
// log are out-of-assertion side effects, as elsewhere in the suite.
// Run: `bun test test/reflex.test.ts`
import { test, expect } from "bun:test";
import type { Row } from "../mods/core";
import { buildDefenses, coachOnFailure, type Defense } from "../mods/engram";
import { fingerprint } from "../mods/detect";
import activate from "../mods/index";

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────

const T0 = 1_700_000_000_000;
let seq = 0;
function R(tool: string, tmpl: string, ok: boolean | undefined, opts: { conv?: string; err?: string } = {}): Row {
  return { tool, tmpl, fp: tmpl, h: tmpl, ok, ts: T0 + seq++ * 1000, conv: opts.conv ?? "c1", ...(opts.err ? { err: opts.err } : {}) };
}

/** A step exactly as the wiring builds it at tool_start (same fingerprint path). */
function bashStep(command: string): { tool: string; fp: string; tmpl: string | null } {
  const { fp, tmpl } = fingerprint("Bash", { command });
  return { tool: "Bash", fp, tmpl };
}

/** Defense whose trigger matches stepSig of `pytest tests/` ("pytest"). */
const D = (over: Partial<Defense> = {}): Defense => ({
  trigger: "pytest",
  errClass: "enoent",
  consequence: "fails until the known fix is applied",
  defense: "apply Edit.py, then re-run pytest tests/",
  severity: 3,
  count: 2,
  kind: "fix",
  ...over,
});

/** Decoy defense for an unrelated step — selection must pick the matching trigger, not any fix. */
const DECOY = D({ trigger: "cargo build", defense: "apply Cargo.toml, then re-run cargo build" });

const ENOENT_OUT = "ENOENT: no such file or directory";

// ── coachOnFailure · the pure contract ───────────────────────────────────────────────────────

test("coach · matching fix defense (count at the ≥2 boundary, same error class) returns the reminder", () => {
  const c = coachOnFailure(bashStep("pytest tests/"), ENOENT_OUT, [DECOY, D()]);
  expect(c).not.toBeNull();
  expect(c!.hit.trigger).toBe("pytest"); // selected the MATCHING defense, not the decoy
  expect(c!.reminder).toContain("<system-reminder>");
  expect(c!.reminder).toContain("recovered 2×"); // the proven count, interpolated
  expect(c!.reminder).toContain("apply Edit.py, then re-run pytest tests/"); // the learned fix, verbatim
});

test("coach · an 'avoid' defense never coaches — only proven recoveries do", () => {
  expect(coachOnFailure(bashStep("pytest tests/"), ENOENT_OUT, [D({ kind: "avoid" })])).toBeNull();
});

test("coach · a once-seen fix (count 1) is not proven — no coaching", () => {
  expect(coachOnFailure(bashStep("pytest tests/"), ENOENT_OUT, [D({ count: 1 })])).toBeNull();
});

test("coach · stale-coaching guard: a step failing a NEW way gets no old advice", () => {
  // learned class: enoent; failing now as permission-denied → different class → stay silent
  expect(coachOnFailure(bashStep("pytest tests/"), "permission denied: /etc/hosts", [D()])).toBeNull();
});

test("coach · an unclassifiable failure still coaches when the step matches", () => {
  // a generic failure (fallback class) against a defense learned from an equally unclassified failure
  const generic = coachOnFailure(bashStep("pytest tests/"), "the operation exploded catastrophically", [D({ errClass: "error" })]);
  expect(generic).not.toBeNull();
  expect(generic!.reminder).toContain("<system-reminder>");
  // a defense learned WITHOUT an error class never blocks on the current classification
  const untyped = coachOnFailure(bashStep("pytest tests/"), ENOENT_OUT, [D({ errClass: "" })]);
  expect(untyped).not.toBeNull();
});

test("coach · no step match → null (never coaches an unrelated step)", () => {
  expect(coachOnFailure(bashStep("cargo run --release"), ENOENT_OUT, [D()])).toBeNull();
});

test("coach · end-to-end over buildDefenses: a fail→fix→pass chain across 2 conversations coaches with the learned fix", () => {
  const arc = (conv: string): Row[] => [
    R("Bash", "pytest tests/", false, { conv, err: "assertion" }),
    R("Edit", "Edit <path>.py", true, { conv }),
    R("Bash", "pytest tests/", true, { conv }),
  ];
  const defenses = buildDefenses([...arc("c1"), ...arc("c2")]);
  const c = coachOnFailure(bashStep("pytest tests/"), "assertion failed: expected 2, got 3", defenses);
  expect(c).not.toBeNull();
  expect(c!.hit.kind).toBe("fix");
  expect(c!.hit.count).toBe(2); // one recovery per conversation
  expect(c!.reminder).toContain("apply Edit.py, then re-run pytest");
});

// ── activate() wiring · the reflex lane through real event flow ──────────────────────────────

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

/** Minimal faithful mod surface (pattern: scripts/smoke-live-agent.ts): an events.on registry
 *  exposing only the capabilities the reflex lane needs — everything else in activate() self-gates. */
function fakeLetta(): { letta: unknown; emit: Emit } {
  type Handler = (event: unknown, ctx: unknown) => unknown;
  const handlers = new Map<string, Handler[]>();
  const letta = {
    capabilities: { events: { tools: true, lifecycle: true } },
    events: { on: (name: string, fn: Handler) => { const l = handlers.get(name) ?? []; l.push(fn); handlers.set(name, l); return () => {}; } },
    client: null,
  };
  const emit: Emit = (name, event) => {
    let last: unknown;
    for (const fn of handlers.get(name) ?? []) last = fn(event, { agent: { id: "reflex-test-agent" } });
    return last;
  };
  return { letta, emit };
}

// Nonce the command so nothing in the persistent state log can pre-match this run. The token
// "mmreflex<13 digits>" survives commandTemplate verbatim (digits glued to letters dodge NUM's
// leading \b; 21 chars stays under LONG_OPAQUE's 24) and is its own stepSig / defense trigger.
const NONCE = Date.now();
const CMD = `mmreflex${NONCE}`;
const FAIL_OUT = "ENOENT: no such file or directory";

/** One fail→fix→pass repair arc for CMD, emitted through the real handlers. */
function emitRepairArc(emit: Emit, conv: string) {
  emit("tool_start", { toolName: "Bash", toolCallId: `${conv}-t1`, args: { command: CMD }, conversationId: conv });
  emit("tool_end", { toolName: "Bash", toolCallId: `${conv}-t1`, status: "error", output: FAIL_OUT, conversationId: conv });
  emit("tool_start", { toolName: "Edit", toolCallId: `${conv}-t2`, args: { file_path: "src/app.py" }, conversationId: conv });
  emit("tool_end", { toolName: "Edit", toolCallId: `${conv}-t2`, status: "success", output: "ok", conversationId: conv });
  emit("tool_start", { toolName: "Bash", toolCallId: `${conv}-t3`, args: { command: CMD }, conversationId: conv });
  emit("tool_end", { toolName: "Bash", toolCallId: `${conv}-t3`, status: "success", output: "ok", conversationId: conv });
}

/** Emit a failing run of CMD (start + end) and return the tool_end handler's RETURN VALUE. */
function emitFailure(emit: Emit, conv: string, tid: string): unknown {
  emit("tool_start", { toolName: "Bash", toolCallId: tid, args: { command: CMD }, conversationId: conv });
  return emit("tool_end", { toolName: "Bash", toolCallId: tid, status: "error", output: FAIL_OUT, conversationId: conv });
}

test("wiring · MM_REFLEX=on: a matured repair chain coaches the next failure, once per conversation", () => {
  withScrubbedEnv({ MM_REFLEX: "on" }, () => {
    const { letta, emit } = fakeLetta();
    const dispose = activate(letta);
    try {
      // the chain matures across two conversations (count reaches the ≥2 floor)…
      emitRepairArc(emit, `rx${NONCE}-a`);
      emitRepairArc(emit, `rx${NONCE}-b`);
      emit("conversation_close", { conversationId: `rx${NONCE}-a`, reason: "test" }); // rebuilds defensesCache
      // …then the same distinctive step fails the same way in a FRESH conversation → coached in the return value
      const coached = emitFailure(emit, `rx${NONCE}-c`, `rx${NONCE}-c-t1`) as { result?: { status: string; output: string } } | undefined;
      expect(coached?.result).toBeDefined();
      const res = coached!.result!;
      expect(res.status).toBe("error");
      expect(res.output.startsWith(FAIL_OUT)).toBe(true); // the real output survives; the reminder is appended
      expect(res.output).toContain("<system-reminder>");
      expect(res.output).toContain("recovered 2×"); // exactly the two observed recoveries
      expect(res.output).toContain(`apply Edit.py, then re-run ${CMD}`); // the known fix, verbatim
      // the SAME failure again in the SAME conversation → no repeat coaching
      expect(emitFailure(emit, `rx${NONCE}-c`, `rx${NONCE}-c-t2`)).toBeUndefined();
    } finally { dispose(); }
  });
});

test("wiring · MM_REFLEX unset: the identical failing event passes through untouched", () => {
  withScrubbedEnv({}, () => {
    const { letta, emit } = fakeLetta();
    const dispose = activate(letta);
    try {
      // mature the SAME chain on this fresh surface too, so the ONLY thing between
      // the failure and a coach is the env gate — not an absent defense
      emitRepairArc(emit, `rx${NONCE}-d`);
      emitRepairArc(emit, `rx${NONCE}-e`);
      emit("conversation_close", { conversationId: `rx${NONCE}-d`, reason: "test" });
      expect(emitFailure(emit, `rx${NONCE}-f`, `rx${NONCE}-f-t1`)).toBeUndefined();
    } finally { dispose(); }
  });
});
