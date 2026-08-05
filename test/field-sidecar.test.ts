// muscle-memory · v0.8.3 SPM field sidecar tests.
//
// CONTRACT: rate_skill accepts rating up|down|no_rate + reason/rater/evidence_ref/task.
//   - AGGREGATE (skill-plusminus.json): up→plus++, down→minus++, no_rate→UNCHANGED (backward-compatible).
//   - SIDECAR (rating-reasons.jsonl): full event ALWAYS appended (append-only).
//   - reason REQUIRED for down/no_rate on the string API; legacy boolean callers exempt (compat).
//   - evidence_ref stored as a DISPLAY STRING ONLY — never opened.
// Run: `MM_STATE_DIR=$(mktemp -d) MM_GLOBAL_SKILLS_DIR=$(mktemp -d) bun test test/field-sidecar.test.ts`
import { test, expect, beforeEach } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rateSkill, loadPlusMinus, PLUSMINUS_PATH, RATING_REASONS_PATH, modelIdentity } from "../mods/referee";
import { globalSkillsDir, STATE_DIR } from "../mods/core";
import activate from "../mods/index";

function sidecar(): any[] {
  if (!existsSync(RATING_REASONS_PATH)) return [];
  return readFileSync(RATING_REASONS_PATH, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

beforeEach(() => {
  process.env.MM_ADVANCED = "on";
  try { rmSync(PLUSMINUS_PATH, { force: true }); } catch { /* */ }
  try { rmSync(RATING_REASONS_PATH, { force: true }); } catch { /* */ }
});

test("up: aggregate plus++ AND a sidecar event is appended (with rater/source)", async () => {
  const res = await rateSkill({}, "sidecar-up", "up", null, { reason: "caught a stale bundle", rater: "mack" });
  expect(res.recorded).toBe(true);
  expect(loadPlusMinus()["sidecar-up"]).toMatchObject({ plus: 1, minus: 0 });
  const ev = sidecar();
  expect(ev.length).toBe(1);
  expect(ev[0]).toMatchObject({ skill: "sidecar-up", rating: "up", reason: "caught a stale bundle", rater: "mack", source: "rate_skill" });
});

test("down WITH reason: aggregate minus++ AND event appended", async () => {
  const res = await rateSkill({}, "sidecar-down", "down", null, { reason: "misled me into a clarify-stall" });
  expect(res.recorded).toBe(true);
  expect(loadPlusMinus()["sidecar-down"]).toMatchObject({ plus: 0, minus: 1 });
  expect(sidecar()[0]).toMatchObject({ rating: "down", reason: "misled me into a clarify-stall" });
});

test("down WITHOUT reason: NOT recorded — no aggregate entry, no sidecar event", async () => {
  const res = await rateSkill({}, "sidecar-nodown", "down", null, {});
  expect(res.recorded).toBe(false);
  expect(loadPlusMinus()["sidecar-nodown"]).toBeUndefined();
  expect(sidecar().length).toBe(0);
});

test("no_rate WITH reason: aggregate UNCHANGED (no plus/minus entry), sidecar event appended", async () => {
  const res = await rateSkill({}, "sidecar-neutral", "no_rate", null, { reason: "used it, genuinely neutral" });
  expect(res.recorded).toBe(true);
  expect(loadPlusMinus()["sidecar-neutral"]).toBeUndefined(); // no_rate never touches the aggregate
  const ev = sidecar();
  expect(ev.length).toBe(1);
  expect(ev[0]).toMatchObject({ rating: "no_rate", reason: "used it, genuinely neutral" });
});

test("no_rate WITHOUT reason: NOT recorded", async () => {
  const res = await rateSkill({}, "sidecar-nn", "no_rate", null, {});
  expect(res.recorded).toBe(false);
  expect(sidecar().length).toBe(0);
});

test("evidence_ref is stored verbatim as a display string and NEVER opened (bogus path is fine)", async () => {
  const res = await rateSkill({}, "sidecar-ev", "down", null, { reason: "flaky", evidenceRef: "/definitely/not/here/secret.txt" });
  expect(res.recorded).toBe(true); // did NOT try to stat/read the path — no exfil lane
  expect(sidecar()[0].evidence_ref).toBe("/definitely/not/here/secret.txt");
});

test("legacy boolean signature still works and stays lenient (true=up, false=down, no reason needed)", async () => {
  await rateSkill({}, "sidecar-legacy", true);
  await rateSkill({}, "sidecar-legacy", false); // legacy down without reason: exempt
  expect(loadPlusMinus()["sidecar-legacy"]).toMatchObject({ plus: 1, minus: 1 });
});

test("agent-sourced rating records source=agent + rater (the self-referee path via rate_skill tool)", async () => {
  const res = await rateSkill({}, "sidecar-agent", "up", null, { reason: "helped the next possession", rater: "kev", source: "agent", model: "chatgpt-plus-pro/gpt-5.6-sol" });
  expect(res.recorded).toBe(true);
  expect(sidecar()[0]).toMatchObject({ source: "agent", rater: "kev", rating: "up", skill: "sidecar-agent", model: "chatgpt-plus-pro/gpt-5.6-sol" });
});

test("modelIdentity resolves dynamic mod ctx.model shapes without storing the whole object", () => {
  expect(modelIdentity("chatgpt-plus-pro/gpt-5.6-sol")).toBe("chatgpt-plus-pro/gpt-5.6-sol");
  expect(modelIdentity({ handle: "chatgpt-plus-pro/gpt-5.6-sol", id: "ignored" })).toBe("chatgpt-plus-pro/gpt-5.6-sol");
  expect(modelIdentity({ provider: "openai-codex", id: "gpt-5.6-sol" })).toBe("openai-codex/gpt-5.6-sol");
  expect(modelIdentity(undefined)).toBe("unknown");
});

test("aggregate row shape stays backward-compatible {plus,minus,lastTs,lastStepId}", async () => {
  await rateSkill({}, "sidecar-shape", "up", "step-9", { reason: "ok" });
  const line: any = loadPlusMinus()["sidecar-shape"];
  expect(Object.keys(line).sort()).toEqual(["lastStepId", "lastTs", "minus", "plus"]);
  expect(line.lastStepId).toBe("step-9");
});

test("referee truth: unwritable sidecar records nothing and reports failure", async () => {
  chmodSync(STATE_DIR, 0o500);
  let res: any;
  try {
    res = await rateSkill({}, "sidecar-unwritable", "up", null, { reason: "must not fabricate" });
  } finally {
    chmodSync(STATE_DIR, 0o755);
  }
  expect(res.recorded).toBe(false);
  expect(res.sidecarWritten).toBe(false);
  expect(res.partial).toBe(false);
  expect(loadPlusMinus()["sidecar-unwritable"]).toBeUndefined();
});

test("referee truth: aggregate write failure is explicit partial with sidecar preserved", async () => {
  mkdirSync(PLUSMINUS_PATH);
  let res: any;
  try {
    res = await rateSkill({}, "sidecar-partial", "up", null, { reason: "sidecar landed" });
  } finally {
    rmSync(PLUSMINUS_PATH, { recursive: true, force: true });
  }
  expect(res.recorded).toBe(true);
  expect(res.sidecarWritten).toBe(true);
  expect(res.aggregatePersisted).toBe(false);
  expect(res.partial).toBe(true);
  expect(res.reason).toContain("PARTIAL");
  expect(sidecar()[0]).toMatchObject({ skill: "sidecar-partial", rating: "up" });
});

test("rate_skill takes model attribution from runtime context and ignores spoofed args", async () => {
  const skillDir = join(globalSkillsDir(), "sidecar-runtime-model");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: sidecar-runtime-model\ndescription: Use when testing runtime model attribution on an installed skill\n---\n\n## Procedure\n1. Rate the installed skill.\n\n## Verification\n- Attribution comes from runtime context.\n");
  const tools = new Map<string, any>();
  const letta = {
    capabilities: { tools: true },
    tools: { register(def: any) { tools.set(def.name, def); return () => {}; } },
    client: {},
  };
  const dispose = activate(letta as any);
  try {
    const output = String(await tools.get("rate_skill").run({
      args: {
        skill: "sidecar-runtime-model",
        rating: "up",
        reason: "helped the possession",
        model: "evil/spoofed",
        provider: "evil",
      },
      model: { id: "gpt-5.6-sol", provider: "openai-codex" },
    }));
    expect(output).toContain("sidecar-runtime-model");
    expect(sidecar()[0]).toMatchObject({
      skill: "sidecar-runtime-model",
      model: "openai-codex/gpt-5.6-sol",
      provider: "openai-codex",
    });
  } finally {
    dispose();
    rmSync(skillDir, { recursive: true, force: true });
  }
});
