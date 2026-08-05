import { afterEach, beforeEach, expect, test } from "bun:test";
import { initInstrumentKey } from "../mods/instrument";
import { __resetInstrumentKeyCache } from "../mods/possessions";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  POSSESSION_LEDGER_PATH,
  buildShareCardPayload,
  loadPossessionEvents,
  recordInstrumentVerifiedOutcome,
  recordPossessionEvent,
  summarizePossessionLedger,
} from "../mods/possessions";
import {
  EXACT_FILE_ADAPTER_ID,
  VERIFICATION_TASK_DIR,
  bindExactFileVerificationTask,
  createExactFileVerificationTask,
  verifyExactFilePossession,
} from "../mods/verification";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
let workspace = "";

beforeEach(() => {
  // verified evidence now requires an initialised instrument key, kept outside the state dir
  const keyHome = mkdtempSync(join(tmpdir(), "mm-vk-"));
  process.env.MM_INSTRUMENT_KEY_FILE = join(keyHome, "k.key");
  initInstrumentKey({ keyPath: process.env.MM_INSTRUMENT_KEY_FILE, stateDir: process.env.MM_STATE_DIR || "/nonexistent" });
  __resetInstrumentKeyCache();
  rmSync(POSSESSION_LEDGER_PATH, { force: true });
  rmSync(VERIFICATION_TASK_DIR, { recursive: true, force: true });
  workspace = mkdtempSync(join(tmpdir(), "mm-exact-file-"));
  process.env.MM_EXACT_FILE_ROOT = workspace;
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(VERIFICATION_TASK_DIR, { recursive: true, force: true });
  delete process.env.MM_EXACT_FILE_ROOT;
});

function openBoundDecision(taskId: string, taskClass = "exact-file-repair") {
  const binding = bindExactFileVerificationTask(taskId);
  return recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: `decision-${taskId}`,
    possession_id: `possession-${taskId}`,
    ts: 200,
    type: "decision",
    agent: "test-agent",
    model: "test-model",
    action: "prescribe",
    task_class: taskClass,
    difficulty: "standard",
    eligible: true,
    gap_observed: true,
    route: "matched",
    skill: "recovering-failed-exact-match-edits",
    verification: binding,
  });
}

test("A · a pre-existing correct target is artifact-verified but earns no procedural credit", () => {
  // The target is already correct BEFORE the task is registered, and no skill is invoked.
  // The instrument can honestly say the artifact matches; it cannot say anything caused it.
  // Crediting `helped` here was P0-B.
  writeFileSync(join(workspace, "target.txt"), "repaired\n");
  createExactFileVerificationTask({
    taskId: "repair-success",
    taskClass: "exact-file-repair",
      targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 100,
  });
  const decision = openBoundDecision("repair-success");
  const verified = verifyExactFilePossession(decision);
  expect(verified).toMatchObject({
    result: "neutral",             // artifact is right, but the prescription did not make it so
    evidence_tier: "verified",     // the instrument still derived this - provenance is intact
    artifact_verified: true,
    procedural_credit: false,
  });
  expect(verified.reason).toContain("already matched before the prescription");
  expect(verified.verification).toMatchObject({
    adapter_id: EXACT_FILE_ADAPTER_ID,
    task_id: "repair-success",
    matched: true,
    procedural_credit: false,   // the target was already correct at registration
  });

  recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "outcome-repair-success",
    possession_id: decision.possession_id,
    ts: 300,
    type: "outcome",
    ...verified,
  });

  const summary = summarizePossessionLedger();
  expect(summary).toMatchObject({
    verifiedDecisions: 1,          // provenance: the instrument derived this
    verifiedGoodDecisions: 0,      // but nothing was caused, so no credit
    judgedDecisions: 0,
    judgedGoodDecisions: 0,
    unboundVerifiedDowngraded: 0,
    helpfulInterventions: 0,
  });
  expect(summary.lastPlay).toMatchObject({ evidence: "bound_verified", result: "neutral" });
  const card = buildShareCardPayload(summary, { period: "all_time" });
  expect(card).toMatchObject({
    period: "EARLY TAPE",
    verified_good_decisions: 0,        // artifact verified, nothing caused
    verified_neutral_decisions: 1,     // the third state: verified, no procedural credit
    verified_evaluated_decisions: 1,
  });
});

test("adapter determines a verified negative when the artifact does not match", () => {
  writeFileSync(join(workspace, "target.txt"), "still broken\n");
  createExactFileVerificationTask({
    taskId: "repair-failed",
    taskClass: "exact-file-repair",
      targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 100,
  });
  const decision = openBoundDecision("repair-failed");
  const verified = verifyExactFilePossession(decision);
  expect(verified).toMatchObject({ result: "harmed", evidence_tier: "verified" });
  expect(verified.verification.matched).toBe(false);
  recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "outcome-repair-failed",
    possession_id: decision.possession_id,
    ts: 300,
    type: "outcome",
    ...verified,
  });
  expect(summarizePossessionLedger()).toMatchObject({
    verifiedDecisions: 1,
    verifiedGoodDecisions: 0,
    judgedDecisions: 0,
    harmfulInterventions: 1,
  });
});

test("instrument append rejects a caller-flipped result even with an authentic receipt", () => {
  writeFileSync(join(workspace, "target.txt"), "repaired\n");
  createExactFileVerificationTask({
    taskId: "flipped-result",
    taskClass: "exact-file-repair",
    targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 100,
  });
  const decision = openBoundDecision("flipped-result");
  const verified = verifyExactFilePossession(decision);
  expect(() => recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "flipped-result-outcome",
    possession_id: decision.possession_id,
    ts: 300,
    type: "outcome",
    ...verified,
    result: "harmed",
  })).toThrow("result does not match");
});

test("regular callers cannot append verified evidence even with an authentic adapter receipt", () => {
  writeFileSync(join(workspace, "target.txt"), "repaired\n");
  createExactFileVerificationTask({
    taskId: "caller-blocked",
    taskClass: "exact-file-repair",
      targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 100,
  });
  const decision = openBoundDecision("caller-blocked");
  const verified = verifyExactFilePossession(decision);
  expect(() => recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "caller-forgery",
    possession_id: decision.possession_id,
    ts: 300,
    type: "outcome",
    ...verified,
  })).toThrow("instrument-derived verification");
  expect(loadPossessionEvents().filter((event) => event.type === "outcome")).toHaveLength(0);
});

test("a structurally plausible forged receipt is rejected by the instrument boundary", () => {
  writeFileSync(join(workspace, "target.txt"), "repaired\n");
  const task = createExactFileVerificationTask({
    taskId: "forged-receipt",
    taskClass: "exact-file-repair",
      targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 100,
  });
  const decision = openBoundDecision("forged-receipt");
  expect(() => recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "forged-instrument-outcome",
    possession_id: decision.possession_id,
    ts: 300,
    type: "outcome",
    result: "helped",
    evidence_tier: "verified",
    reason: "caller fabricated a receipt-shaped object",
    evidence_ref: `adapter:${EXACT_FILE_ADAPTER_ID}:${task.manifestSha256}`,
    verification: {
      schema: "mm.verification-receipt.v1",
      adapter_id: EXACT_FILE_ADAPTER_ID,
      adapter_version: "1",
      task_id: "forged-receipt",
      task_class: "exact-file-repair",
      possession_id: decision.possession_id,
      decision_event_id: decision.event_id,
      manifest_sha256: task.manifestSha256,
      artifact_sha256: sha("repaired\n"),
      matched: true,
      procedural_credit: true,
      verified_at: 250,
    },
  } as any)).toThrow("instrument-owned receipt");
});

test("manifest tampering after decision binding fails closed", () => {
  writeFileSync(join(workspace, "target.txt"), "repaired\n");
  const task = createExactFileVerificationTask({
    taskId: "tamper-check",
    taskClass: "exact-file-repair",
      targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 100,
  });
  const decision = openBoundDecision("tamper-check");
  chmodSync(task.path, 0o644);
  writeFileSync(task.path, JSON.stringify({
    schema: "mm.verification-task.exact-file.v1",
    adapter_id: EXACT_FILE_ADAPTER_ID,
    adapter_version: "1",
    task_id: "tamper-check",
    task_class: "exact-file-repair",
    registered_at: 100,
    root_id: "configured",
    root_identity_sha256: task.task.root_identity_sha256,
    target_rel: "target.txt",
    expected_sha256: sha("repaired but forged\n"),
    baseline_sha256: task.task.baseline_sha256,
  }));
  chmodSync(task.path, 0o444);
  expect(() => verifyExactFilePossession(decision)).toThrow("manifest hash mismatch");
});

test("configured trusted root cannot be swapped after registration", () => {
  writeFileSync(join(workspace, "target.txt"), "repaired\n");
  createExactFileVerificationTask({
    taskId: "root-swap",
    taskClass: "exact-file-repair",
    targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 100,
  });
  const decision = openBoundDecision("root-swap");
  const otherRoot = mkdtempSync(join(tmpdir(), "mm-other-root-"));
  try {
    writeFileSync(join(otherRoot, "target.txt"), "repaired\n");
    process.env.MM_EXACT_FILE_ROOT = otherRoot;
    expect(() => verifyExactFilePossession(decision)).toThrow("root changed");
  } finally {
    process.env.MM_EXACT_FILE_ROOT = workspace;
    rmSync(otherRoot, { recursive: true, force: true });
  }
});

test("a regular target replaced by a symlink after registration fails closed", () => {
  const target = join(workspace, "target.txt");
  const outside = join(workspace, "outside.txt");
  writeFileSync(target, "before\n");
  writeFileSync(outside, "repaired\n");
  createExactFileVerificationTask({
    taskId: "post-register-symlink",
    taskClass: "exact-file-repair",
    targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 100,
  });
  const decision = openBoundDecision("post-register-symlink");
  unlinkSync(target);
  symlinkSync(outside, target);
  expect(() => verifyExactFilePossession(decision)).toThrow("symlink");
});

test("task registration rejects traversal, duplicates, malformed values, symlink targets, unknown fields, and mutable manifests", () => {
  writeFileSync(join(workspace, "outside.txt"), "outside\n");
  const badPaths = ["../outside.txt", "a/../../outside.txt", "/tmp/outside.txt", "C:\\outside.txt", "a\\b", "a//b", "./outside.txt", ""];
  for (const [index, targetRel] of badPaths.entries()) {
    expect(() => createExactFileVerificationTask({
      taskId: `bad-path-${index}`,
      taskClass: "exact-file-repair",
      targetRel,
      expectedSha256: sha("outside\n"),
      registeredAt: 100,
    })).toThrow("target_rel");
  }
  expect(() => createExactFileVerificationTask({
    taskId: "uppercase-hash",
    taskClass: "exact-file-repair",
    targetRel: "outside.txt",
    expectedSha256: sha("outside\n").toUpperCase(),
    registeredAt: 100,
  })).toThrow("canonical lowercase SHA-256");
  expect(() => createExactFileVerificationTask({
    taskId: "nonfinite-time",
    taskClass: "exact-file-repair",
    targetRel: "outside.txt",
    expectedSha256: sha("outside\n"),
    registeredAt: Number.POSITIVE_INFINITY,
  })).toThrow("safe integer");
  createExactFileVerificationTask({
    taskId: "duplicate-task",
    taskClass: "exact-file-repair",
    targetRel: "outside.txt",
    expectedSha256: sha("outside\n"),
    registeredAt: 100,
  });
  expect(() => createExactFileVerificationTask({
    taskId: "duplicate-task",
    taskClass: "exact-file-repair",
    targetRel: "outside.txt",
    expectedSha256: sha("outside\n"),
    registeredAt: 100,
  })).toThrow();

  symlinkSync(join(workspace, "outside.txt"), join(workspace, "link.txt"));
  expect(() => createExactFileVerificationTask({
    taskId: "symlink",
    taskClass: "exact-file-repair",
      targetRel: "link.txt",
    expectedSha256: sha("outside\n"),
    registeredAt: 100,
  })).toThrow("symlink");

  mkdirSync(VERIFICATION_TASK_DIR, { recursive: true });
  const rogue = join(VERIFICATION_TASK_DIR, "rogue.json");
  writeFileSync(rogue, JSON.stringify({
    schema: "mm.verification-task.exact-file.v1",
    adapter_id: EXACT_FILE_ADAPTER_ID,
    adapter_version: "1",
    task_id: "rogue",
    task_class: "exact-file-repair",
    registered_at: 100,
    target_rel: "outside.txt",
    expected_sha256: sha("outside\n"),
    surprise: true,
  }), { mode: 0o444 });
  expect(() => bindExactFileVerificationTask("rogue")).toThrow("unexpected field");
  chmodSync(rogue, 0o644);
  expect(() => bindExactFileVerificationTask("rogue")).toThrow("read-only");
});

test("an authentic receipt cannot be replayed across a second bound possession", () => {
  writeFileSync(join(workspace, "target.txt"), "repaired\n");
  createExactFileVerificationTask({
    taskId: "cross-possession",
    taskClass: "exact-file-repair",
    targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 100,
  });
  const binding = bindExactFileVerificationTask("cross-possession");
  const first = recordPossessionEvent({
    schema: "mm.possession.v1", event_id: "cross-d1", possession_id: "cross-p1", ts: 200,
    type: "decision", agent: "test", model: "test", action: "prescribe", task_class: "exact-file-repair",
    difficulty: "standard", gap_observed: true, route: "matched", skill: "recovering-failed-exact-match-edits", verification: binding,
  });
  const second = recordPossessionEvent({
    schema: "mm.possession.v1", event_id: "cross-d2", possession_id: "cross-p2", ts: 201,
    type: "decision", agent: "test", model: "test", action: "prescribe", task_class: "exact-file-repair",
    difficulty: "standard", gap_observed: true, route: "matched", skill: "recovering-failed-exact-match-edits", verification: binding,
  });
  const verified = verifyExactFilePossession(first);
  recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1", event_id: "cross-o1", possession_id: first.possession_id, ts: 300, type: "outcome", ...verified,
  });
  expect(() => recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1", event_id: "cross-o2", possession_id: second.possession_id, ts: 301, type: "outcome", ...verified,
  })).toThrow("not bound to the possession decision");
});

test("decision binding rejects wrong task class, late registration, and replayed outcome", () => {
  writeFileSync(join(workspace, "target.txt"), "repaired\n");
  createExactFileVerificationTask({
    taskId: "binding-check",
    taskClass: "exact-file-repair",
      targetRel: "target.txt",
    expectedSha256: sha("repaired\n"),
    registeredAt: 250,
  });
  const late = openBoundDecision("binding-check");
  expect(() => verifyExactFilePossession(late)).toThrow("registered before the decision");

  rmSync(POSSESSION_LEDGER_PATH, { force: true });
  const binding = bindExactFileVerificationTask("binding-check");
  expect(() => recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "wrong-class-decision",
    possession_id: "wrong-class-possession",
    ts: 300,
    type: "decision",
    agent: "test-agent",
    model: "test-model",
    action: "prescribe",
    task_class: "other-task",
    difficulty: "standard",
    gap_observed: true,
    route: "matched",
    skill: "recovering-failed-exact-match-edits",
    verification: binding,
  })).toThrow("task_class must match");

  rmSync(POSSESSION_LEDGER_PATH, { force: true });
  const valid = recordPossessionEvent({
    schema: "mm.possession.v1",
    event_id: "valid-replay-decision",
    possession_id: "valid-replay-possession",
    ts: 300,
    type: "decision",
    agent: "test-agent",
    model: "test-model",
    action: "prescribe",
    task_class: "exact-file-repair",
    difficulty: "standard",
    gap_observed: true,
    route: "matched",
    skill: "recovering-failed-exact-match-edits",
    verification: binding,
  });
  const verified = verifyExactFilePossession(valid);
  recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "replay-first",
    possession_id: valid.possession_id,
    ts: 400,
    type: "outcome",
    ...verified,
  });
  const second = verifyExactFilePossession(valid);
  expect(() => recordInstrumentVerifiedOutcome({
    schema: "mm.possession.v1",
    event_id: "replay-second",
    possession_id: valid.possession_id,
    ts: 500,
    type: "outcome",
    ...second,
  })).toThrow("active outcome already exists");
});
