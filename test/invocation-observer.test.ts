// The invocation observer decides whether a prescription can ever earn procedural credit, so
// every way it can be wrong is a way to manufacture proof. These drive the runtime's own
// handlers - the same functions the tool event stream calls - never a registered tool.
import { beforeEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { INVOCATION_LOG_PATH, loadInvocations, observeToolEnd, observeToolStart, qualifyingInvocation } from "../mods/invocation";

const open = [{ possession_id: "p-1", event_id: "d-1", skill: "the-skill" }];

beforeEach(() => {
  rmSync(INVOCATION_LOG_PATH, { force: true });
});

function run(callId: string, skill: string, status = "success", pool = open) {
  observeToolStart({ toolName: "Skill", toolCallId: callId, args: { skill } }, 1000);
  return observeToolEnd({ toolCallId: callId, status }, pool, 1500);
}

test("a successful Skill call binds to the one open possession for that skill", () => {
  const invocation = run("c1", "the-skill");
  expect(invocation).not.toBeNull();
  expect(invocation).toMatchObject({ possession_id: "p-1", decision_event_id: "d-1", skill: "the-skill", call_id: "c1" });
  expect(loadInvocations()).toHaveLength(1);
});

test("a failed Skill call is not an invocation", () => {
  expect(run("c2", "the-skill", "error")).toBeNull();
  expect(loadInvocations()).toHaveLength(0);
});

test("ambiguity earns nothing: two open possessions for the same skill", () => {
  const pool = [...open, { possession_id: "p-2", event_id: "d-2", skill: "the-skill" }];
  expect(run("c3", "the-skill", "success", pool)).toBeNull();
  expect(loadInvocations()).toHaveLength(0);
});

test("no open possession for that skill earns nothing", () => {
  expect(run("c4", "some-other-skill")).toBeNull();
});

test("a tool_end with no matching tool_start earns nothing", () => {
  expect(observeToolEnd({ toolCallId: "never-started", status: "success" }, open, 1500)).toBeNull();
});

test("a non-Skill tool is never observed as an invocation", () => {
  observeToolStart({ toolName: "Edit", toolCallId: "c5", args: { skill: "the-skill" } }, 1000);
  expect(observeToolEnd({ toolCallId: "c5", status: "success" }, open, 1500)).toBeNull();
});

test("an invocation outside the verification window does not qualify", () => {
  run("c6", "the-skill");
  const args = { possessionId: "p-1", decisionEventId: "d-1", skill: "the-skill" };
  // started before the baseline was captured: it cannot be evidence of repairing that baseline
  expect(qualifyingInvocation({ ...args, baselineAt: 1200, verifiedAt: 2000 })).toBeNull();
  // finished after verification: the artifact was already hashed
  expect(qualifyingInvocation({ ...args, baselineAt: 0, verifiedAt: 1400 })).toBeNull();
  expect(qualifyingInvocation({ ...args, baselineAt: 0, verifiedAt: 2000 })).not.toBeNull();
});

test("a skill that starts and finishes inside one millisecond still qualifies", () => {
  observeToolStart({ toolName: "Skill", toolCallId: "c7", args: { skill: "the-skill" } }, 1000);
  observeToolEnd({ toolCallId: "c7", status: "success" }, open, 1000);
  expect(qualifyingInvocation({ possessionId: "p-1", decisionEventId: "d-1", skill: "the-skill", baselineAt: 1000, verifiedAt: 1000 })).not.toBeNull();
});

test("an invocation belongs to its own possession and skill only", () => {
  run("c8", "the-skill");
  const base = { baselineAt: 0, verifiedAt: 2000 };
  expect(qualifyingInvocation({ ...base, possessionId: "p-9", decisionEventId: "d-1", skill: "the-skill" })).toBeNull();
  expect(qualifyingInvocation({ ...base, possessionId: "p-1", decisionEventId: "d-9", skill: "the-skill" })).toBeNull();
  expect(qualifyingInvocation({ ...base, possessionId: "p-1", decisionEventId: "d-1", skill: "other" })).toBeNull();
});

test("a hand-written invocation line cannot be a second qualifying invocation", () => {
  // Even if a writer forges a row, two matches are ambiguity and ambiguity earns nothing.
  run("c9", "the-skill");
  const { appendFileSync } = require("node:fs") as typeof import("node:fs");
  appendFileSync(INVOCATION_LOG_PATH, `${JSON.stringify({
    schema: "mm.invocation.v1", invocation_id: "inv-forged", possession_id: "p-1", decision_event_id: "d-1",
    skill: "the-skill", call_id: "forged", started_at: 1000, ended_at: 1100, nonce: "n",
  })}\n`, "utf8");
  expect(qualifyingInvocation({ possessionId: "p-1", decisionEventId: "d-1", skill: "the-skill", baselineAt: 0, verifiedAt: 2000 })).toBeNull();
});
