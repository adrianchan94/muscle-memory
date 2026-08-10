// muscle-memory · SHELF-CONSULT nudge tests (mods/nudge.ts + tool_end wiring) — G3 INVOCATION.
//
// EVIDENCE UNDER TEST (measured 2026-08-09): across 21 SkillsBench conversations there were ZERO
// muscle_memory_* calls. Audit showed WHY: every existing passive channel is dead in a fresh
// one-shot conversation — MM_NATIVE=blocks syncs only at conversation_close (and silently no-ops
// on the local backend: reachFn(client.agents.blocks.update) is unreachable), MM_CTX_QUERY only
// shapes a prescribe the agent never issues, MM_REFLEX/MM_CLOSE_NUDGE need prior defenses or an
// open possession. Nothing ever TELLS a fresh agent, in-context, that a routing consult exists.
//
// The fix under test: MM_PRESCRIBE_NUDGE=on (default OFF) appends ONE advisory <system-reminder>
// to the FIRST successful ordinary tool result of a conversation, only when the shelf is
// non-empty and the agent has not already consulted MM or invoked a Skill. Advisory only: it
// names muscle_memory_skill_read and explicitly licenses continuing unaided. It never invokes
// anything and never fires twice.
//
// Wiring tests drive activate()'s real tool_end handler and assert on its RETURN VALUE, exactly
// like test/close-nudge.test.ts. Before the change, prescribeNudgeEnabled/prescribeNudge do not
// exist (import fails) and the wiring test returns undefined — both fail by construction.
// Run: `bun test test/prescribe-nudge.test.ts`
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prescribeNudgeEnabled, prescribeNudge } from "../mods/nudge";
import activate from "../mods/index";

// ── pure contract ────────────────────────────────────────────────────────────────────────────

test("gate · default OFF (advisory surfacing is an operator decision), MM_PRESCRIBE_NUDGE=on opts in", () => {
  expect(prescribeNudgeEnabled({})).toBe(false);
  expect(prescribeNudgeEnabled({ MM_PRESCRIBE_NUDGE: "off" })).toBe(false);
  expect(prescribeNudgeEnabled({ MM_PRESCRIBE_NUDGE: "on" })).toBe(true);
  expect(prescribeNudgeEnabled({ MM_PRESCRIBE_NUDGE: "ON" })).toBe(true);
});

test("nudge text · advisory only: names the consult tool, licenses working unaided, invokes nothing", () => {
  const text = prescribeNudge(4);
  expect(text).toContain("<system-reminder>");
  expect(text).toContain("</system-reminder>");
  expect(text).toContain("muscle_memory_skill_read");
  expect(text).toContain("4 installed skill");
  expect(text).toMatch(/continue unaided/i);          // never coerces an invocation
  expect(text).not.toMatch(/skill="/);                 // never names or pre-fills a specific skill
});

// ── activate() wiring · the real tool_end handler ────────────────────────────────────────────

const MM_ENV_KEYS = ["MM_REFLEX", "MM_AUTOPILOT", "MM_REFLECT", "MM_NATIVE", "MM_GUARD", "MM_CAPTURE", "MM_CLOSE_NUDGE", "MM_PRESCRIBE_NUDGE", "MM_AGENT_SKILLS_DIR"] as const;
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
    for (const fn of handlers.get(name) ?? []) last = fn(event, { agent: { id: "prescribe-nudge-test-agent" } });
    return last;
  };
  return { letta, emit };
}

let shelf = "";
beforeEach(() => {
  shelf = mkdtempSync(join(tmpdir(), "mm-pn-shelf-"));
  mkdirSync(join(shelf, "sample-skill"), { recursive: true });
  writeFileSync(join(shelf, "sample-skill", "SKILL.md"), "---\nname: sample-skill\ndescription: a sample\n---\n# sample-skill\n");
});
afterEach(() => { rmSync(shelf, { recursive: true, force: true }); });

type ToolEndReturn = { result?: { status: string; output: string } } | undefined;
function emitTool(emit: Emit, conv: string, tid: string, tool = "exec_command", status = "success"): ToolEndReturn {
  emit("tool_start", { toolName: tool, toolCallId: tid, args: {}, conversationId: conv });
  return emit("tool_end", { toolName: tool, toolCallId: tid, status, output: "ran fine", conversationId: conv }) as ToolEndReturn;
}

test("wiring · ON + non-empty shelf: FIRST successful tool result carries the advisory, exactly once", () => {
  withScrubbedEnv({ MM_PRESCRIBE_NUDGE: "on", MM_AGENT_SKILLS_DIR: shelf }, () => {
    const { letta, emit } = fakeLetta();
    const dispose = activate(letta as any);
    try {
      const conv = `pn-once-${Date.now()}`;
      const first = emitTool(emit, conv, `${conv}-t1`);
      expect(first?.result).toBeDefined();                      // FAILS pre-change: undefined
      expect(first!.result!.output.startsWith("ran fine")).toBe(true); // real output survives
      expect(first!.result!.output).toContain("muscle_memory_skill_read");
      const second = emitTool(emit, conv, `${conv}-t2`);
      expect(second).toBeUndefined();                           // once per conversation, ever
    } finally { dispose(); }
  });
});

test("wiring · default OFF: byte-identical to shipped behaviour (undefined return)", () => {
  withScrubbedEnv({ MM_AGENT_SKILLS_DIR: shelf }, () => {
    const { letta, emit } = fakeLetta();
    const dispose = activate(letta as any);
    try { expect(emitTool(emit, `pn-off-${Date.now()}`, "t1")).toBeUndefined(); }
    finally { dispose(); }
  });
});

test("wiring · silent when the agent already went to the shelf itself (first call IS a Skill/MM call)", () => {
  withScrubbedEnv({ MM_PRESCRIBE_NUDGE: "on", MM_AGENT_SKILLS_DIR: shelf }, () => {
    const { letta, emit } = fakeLetta();
    const dispose = activate(letta as any);
    try {
      const conv = `pn-skill-${Date.now()}`;
      expect(emitTool(emit, conv, `${conv}-t1`, "Skill")).toBeUndefined();          // no drag on a self-starter
      expect(emitTool(emit, conv, `${conv}-t2`)).toBeUndefined();                   // and consult already happened
      const conv2 = `pn-mm-${Date.now()}`;
      expect(emitTool(emit, conv2, `${conv2}-t1`, "muscle_memory_skill_read")).toBeUndefined();
      expect(emitTool(emit, conv2, `${conv2}-t2`)).toBeUndefined();
    } finally { dispose(); }
  });
});

test("wiring · silent on an EMPTY shelf and on a failed first tool", () => {
  const empty = mkdtempSync(join(tmpdir(), "mm-pn-empty-"));
  try {
    withScrubbedEnv({ MM_PRESCRIBE_NUDGE: "on", MM_AGENT_SKILLS_DIR: empty }, () => {
      const { letta, emit } = fakeLetta();
      const dispose = activate(letta as any);
      try { expect(emitTool(emit, `pn-empty-${Date.now()}`, "t1")).toBeUndefined(); }
      finally { dispose(); }
    });
    withScrubbedEnv({ MM_PRESCRIBE_NUDGE: "on", MM_AGENT_SKILLS_DIR: shelf }, () => {
      const { letta, emit } = fakeLetta();
      const dispose = activate(letta as any);
      try {
        const conv = `pn-fail-${Date.now()}`;
        expect(emitTool(emit, conv, `${conv}-t1`, "exec_command", "error")).toBeUndefined(); // failure lane belongs to reflex
        const after = emitTool(emit, conv, `${conv}-t2`);
        expect(after?.result?.output ?? "").toContain("muscle_memory_skill_read"); // still pending until a success lands
      } finally { dispose(); }
    });
  } finally { rmSync(empty, { recursive: true, force: true }); }
});
