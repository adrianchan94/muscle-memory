// muscle-memory · FORCED LOOP-CLOSURE nudge tests (mods/nudge.ts + tool_end wiring).
//
// EVIDENCE UNDER TEST: agents close the learning loop 0/9 unforced vs 9/9 when explicitly
// asked, at identical task success — and free-prose asks lose the disclosure anyway (12/22
// narrate a failure in prose then write "none" in the machine-readable field). So when the
// instrument witnesses the prescribed skill run inside an open possession, MM must DELIVER
// the ask itself: an enumerated <system-reminder> on the Skill call's own output, naming the
// exact possession_id and the exact result vocabulary.
//
// The wiring tests drive activate()'s real tool_end handler and assert on its RETURN VALUE,
// exactly like test/reflex.test.ts. Before this change, a SUCCESSFUL Skill call always
// returned undefined from tool_end — the "wiring · successful prescribed Skill call" test
// fails on the old code by construction.
// Run: `bun test test/close-nudge.test.ts`
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeNudgeEnabled, closeoutNudge } from "../mods/nudge";
import { POSSESSION_LEDGER_PATH, recordPossessionEvent } from "../mods/possessions";
import { INVOCATION_LOG_PATH } from "../mods/invocation";
import { initInstrumentKey } from "../mods/instrument";
import { STATE_DIR } from "../mods/core";
import activate from "../mods/index";

// ── pure contract ────────────────────────────────────────────────────────────────────────────

test("nudge text · names the exact tool, possession, and ENUMERATED result vocabulary", () => {
  const text = closeoutNudge({ skill: "repairing-stale-edits", possessionId: "p-nudge-1" });
  expect(text).toContain("<system-reminder>");
  expect(text).toContain("</system-reminder>");
  expect(text).toContain("muscle_memory_close");
  expect(text).toContain('possession_id="p-nudge-1"');
  expect(text).toContain('"repairing-stale-edits"');
  // the enumerated ask — the disclosure data says an open-ended field goes empty
  expect(text).toContain("helped | harmed | neutral");
  // and the machine-readable emphasis: prose narration must not count as a close
  expect(text).toMatch(/machine-readable/i);
});

test("nudge gate · default ON (the 0/9 unforced number IS the case), MM_CLOSE_NUDGE=off opts out", () => {
  expect(closeNudgeEnabled({})).toBe(true);
  expect(closeNudgeEnabled({ MM_CLOSE_NUDGE: "off" })).toBe(false);
  expect(closeNudgeEnabled({ MM_CLOSE_NUDGE: "OFF" })).toBe(false);
  expect(closeNudgeEnabled({ MM_CLOSE_NUDGE: "on" })).toBe(true);
});

// ── activate() wiring · the real tool_end handler ────────────────────────────────────────────

const MM_ENV_KEYS = ["MM_REFLEX", "MM_AUTOPILOT", "MM_REFLECT", "MM_NATIVE", "MM_GUARD", "MM_CAPTURE", "MM_CLOSE_NUDGE"] as const;
function withScrubbedEnv<T>(overrides: Record<string, string>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of MM_ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  try { return fn(); }
  finally { for (const k of MM_ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

type Emit = (name: string, event: unknown) => unknown;
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
    for (const fn of handlers.get(name) ?? []) last = fn(event, { agent: { id: "close-nudge-test-agent" } });
    return last;
  };
  return { letta, emit };
}

const NONCE = Date.now();
const SKILL = `close-nudge-skill-${NONCE}`.slice(0, 60).toLowerCase();
let keyHome = "";
let savedKeyFile: string | undefined;

beforeEach(() => {
  savedKeyFile = process.env.MM_INSTRUMENT_KEY_FILE;
  keyHome = mkdtempSync(join(tmpdir(), "mm-close-nudge-key-"));
  process.env.MM_INSTRUMENT_KEY_FILE = join(keyHome, "mm.key");
  initInstrumentKey({ keyPath: process.env.MM_INSTRUMENT_KEY_FILE, stateDir: STATE_DIR });
  rmSync(POSSESSION_LEDGER_PATH, { force: true });
  rmSync(INVOCATION_LOG_PATH, { force: true });
});

afterEach(() => {
  if (savedKeyFile === undefined) delete process.env.MM_INSTRUMENT_KEY_FILE; else process.env.MM_INSTRUMENT_KEY_FILE = savedKeyFile;
  rmSync(keyHome, { recursive: true, force: true });
  rmSync(POSSESSION_LEDGER_PATH, { force: true });
  rmSync(INVOCATION_LOG_PATH, { force: true });
});

/** One open prescribed possession for SKILL, written through the real ledger path. */
function openPrescription(pid: string): void {
  recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: `d-${pid}`,
    possession_id: pid,
    ts: 200,
    type: "decision",
    agent: "close-nudge-test-agent",
    model: "test/close-nudge-model",
    action: "prescribe",
    task_class: "close-nudge-test",
    gap_observed: true,
    route: "matched",
    skill: SKILL,
  });
}

function emitSkillCall(emit: Emit, tid: string, status: string): unknown {
  emit("tool_start", { toolName: "Skill", toolCallId: tid, args: { skill: SKILL }, conversationId: `cn-${NONCE}` });
  return emit("tool_end", { toolName: "Skill", toolCallId: tid, status, output: "skill body loaded", conversationId: `cn-${NONCE}` });
}

test("wiring · successful prescribed Skill call returns the output WITH the forced close ask", () => {
  withScrubbedEnv({}, () => {
    const { letta, emit } = fakeLetta();
    const dispose = activate(letta as any);
    try {
      const pid = `p-cn-${NONCE}-1`;
      openPrescription(pid);
      const out = emitSkillCall(emit, `cn-${NONCE}-t1`, "success") as { result?: { status: string; output: string } } | undefined;
      expect(out?.result).toBeDefined();                       // FAILS pre-change: was undefined
      expect(out!.result!.status).toBe("success");
      expect(out!.result!.output.startsWith("skill body loaded")).toBe(true); // real output survives
      expect(out!.result!.output).toContain("<system-reminder>");
      expect(out!.result!.output).toContain("muscle_memory_close");
      expect(out!.result!.output).toContain(`possession_id="${pid}"`);
      expect(out!.result!.output).toContain("helped | harmed | neutral");
    } finally { dispose(); }
  });
});

test("wiring · a FAILED Skill call is never nudged (no invocation, no ask)", () => {
  withScrubbedEnv({}, () => {
    const { letta, emit } = fakeLetta();
    const dispose = activate(letta as any);
    try {
      openPrescription(`p-cn-${NONCE}-2`);
      expect(emitSkillCall(emit, `cn-${NONCE}-t2`, "error")).toBeUndefined();
    } finally { dispose(); }
  });
});

test("wiring · a Skill call with NO open possession passes through untouched", () => {
  // MM_APPLY_NUDGE scrubbed off: this test isolates CLOSE-nudge wiring. The apply nudge deliberately
  // hooks the Skill tool (2 of 12 measured cells reached their skill that way), so leaving it ON here
  // would test two mechanisms at once. Its own firing is asserted in apply-nudge-skilltool.test.ts.
  withScrubbedEnv({ MM_APPLY_NUDGE: "off" }, () => {
    const { letta, emit } = fakeLetta();
    const dispose = activate(letta as any);
    try {
      expect(emitSkillCall(emit, `cn-${NONCE}-t3`, "success")).toBeUndefined();
    } finally { dispose(); }
  });
});

test("wiring · MM_CLOSE_NUDGE=off: the identical successful call passes through untouched", () => {
  withScrubbedEnv({ MM_CLOSE_NUDGE: "off", MM_APPLY_NUDGE: "off" }, () => {
    const { letta, emit } = fakeLetta();
    const dispose = activate(letta as any);
    try {
      openPrescription(`p-cn-${NONCE}-4`);
      expect(emitSkillCall(emit, `cn-${NONCE}-t4`, "success")).toBeUndefined();
    } finally { dispose(); }
  });
});
