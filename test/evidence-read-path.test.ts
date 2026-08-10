// The read path is where three independent reviewers landed the forgery.
//
// `verified` used to be authenticated only at append time, by a WeakSet of in-process object
// identity that cannot survive JSON.parse. On read, a row was re-checked structurally and
// nothing more — so anyone who could write MM_STATE_DIR could mint `verified`, and `proven`.
//
// Case 1 below is the exact forgery my own first reproduction failed to land: correctly shaped,
// so it passes schema validation, and therefore reaches the authentication decision.
import { test, expect } from "bun:test";
import { authenticateStoredEvidence } from "../mods/possessions";
import { signEvidencePayload } from "../mods/instrument";

const KEY = { keyId: "abcd1234", secret: Buffer.from("7".repeat(64), "hex") };

const basePayload = () => ({
  schema_version: "mm.evidence.v1",
  key_id: KEY.keyId,
  nonce: "n-1",
  timestamp: 1785900000000,
  possession_id: "p-1",
  decision_event_id: "ev-d",
  skill: "fix-it",
  task_id: "task-1",
  task_class: "exact-repair",
  manifest_sha256: "a".repeat(64),
  baseline_sha256: "b".repeat(64),
  baseline_captured_at: 1785899000000,
  expected_sha256: "c".repeat(64),
  final_sha256: "c".repeat(64),
  invocation_receipt_id: "inv-1",
  verifier_id: "exact-file",
  verifier_version: "1",
  target_rel: "target.txt",
  result_class: "helped",
});

const signed = () => { const p = basePayload(); return { payload: p, signature: signEvidencePayload(p, KEY) }; };

test("1 · a correctly-shaped forged row with no signature is not verified", () => {
  // The exact gap my first repro missed: schema-valid, so strictness does not save us.
  const res = authenticateStoredEvidence({ evidence: { payload: basePayload() }, key: KEY });
  expect(res.authenticated).toBe(false);
  expect(res.reason).toBe("missing_signature");
});

test("a row signed with the wrong key is not verified", () => {
  const { payload } = signed();
  const forged = signEvidencePayload(payload, { keyId: "zzzz0000", secret: Buffer.from("9".repeat(64), "hex") });
  const res = authenticateStoredEvidence({ evidence: { payload, signature: forged }, key: KEY });
  expect(res.authenticated).toBe(false);
  expect(res.reason).toBe("bad_signature");
});

test("a tampered result_class is not verified", () => {
  const { payload, signature } = signed();
  const res = authenticateStoredEvidence({ evidence: { payload: { ...payload, result_class: "helped!" }, signature }, key: KEY });
  expect(res.authenticated).toBe(false);
});

test("a genuinely signed row authenticates", () => {
  const { payload, signature } = signed();
  const res = authenticateStoredEvidence({ evidence: { payload, signature }, key: KEY });
  expect(res.authenticated).toBe(true);
});

test("no key available means no verified evidence, with its own reason", () => {
  const { payload, signature } = signed();
  const res = authenticateStoredEvidence({ evidence: { payload, signature }, key: null });
  expect(res.authenticated).toBe(false);
  expect(res.reason).toBe("key_unavailable");
});

test("an unknown key_id does not authenticate", () => {
  const { payload, signature } = signed();
  const res = authenticateStoredEvidence({ evidence: { payload: { ...payload, key_id: "ffff9999" }, signature }, key: KEY });
  expect(res.authenticated).toBe(false);
});

test("a legacy row carrying no evidence envelope is not verified", () => {
  const res = authenticateStoredEvidence({ evidence: undefined, key: KEY });
  expect(res.authenticated).toBe(false);
  expect(res.reason).toBe("legacy_unsigned");
});

// ── procedural credit is a separate question from artifact truth ────────────

test("10 · a pre-existing correct target earns artifact_verified but never helped", () => {
  // baseline already equals expected: nothing was repaired, so nothing was caused.
  const p = { ...basePayload(), baseline_sha256: "c".repeat(64), invocation_receipt_id: "" };
  const credit = authenticateStoredEvidence({ evidence: { payload: p, signature: signEvidencePayload(p, KEY) }, key: KEY });
  expect(credit.authenticated).toBe(true);
  expect(credit.artifactVerified).toBe(true);
  expect(credit.proceduralCredit).toBe(false);
  expect(credit.proceduralReason).toBe("no_gap_to_close");
});

test("no observed invocation earns artifact_verified only", () => {
  const p = { ...basePayload(), invocation_receipt_id: "" };
  const credit = authenticateStoredEvidence({ evidence: { payload: p, signature: signEvidencePayload(p, KEY) }, key: KEY });
  expect(credit.artifactVerified).toBe(true);
  expect(credit.proceduralCredit).toBe(false);
  expect(credit.proceduralReason).toBe("no_observed_invocation");
});

test("a real gap plus an observed invocation earns procedural credit", () => {
  const { payload, signature } = signed();
  const credit = authenticateStoredEvidence({ evidence: { payload, signature }, key: KEY });
  expect(credit.artifactVerified).toBe(true);
  expect(credit.proceduralCredit).toBe(true);
});

test("an invocation recorded before the baseline earns no procedural credit", () => {
  const p = { ...basePayload(), baseline_captured_at: 1785900500000 };
  const credit = authenticateStoredEvidence({ evidence: { payload: p, signature: signEvidencePayload(p, KEY) }, key: KEY, invocationObservedAt: 1785899500000 });
  expect(credit.proceduralCredit).toBe(false);
  expect(credit.proceduralReason).toBe("invocation_precedes_baseline");
});

test("15 · a verified mismatch without an invocation is neutral, not harmed", () => {
  // Crediting harm without an observed invocation would be the same error as crediting help.
  const p = { ...basePayload(), final_sha256: "d".repeat(64), result_class: "harmed", invocation_receipt_id: "" };
  const credit = authenticateStoredEvidence({ evidence: { payload: p, signature: signEvidencePayload(p, KEY) }, key: KEY });
  expect(credit.artifactVerified).toBe(false);
  expect(credit.resultClass).toBe("neutral");
});

test("a verified mismatch with an invocation is harmed", () => {
  const p = { ...basePayload(), final_sha256: "d".repeat(64), result_class: "harmed" };
  const credit = authenticateStoredEvidence({ evidence: { payload: p, signature: signEvidencePayload(p, KEY) }, key: KEY });
  expect(credit.artifactVerified).toBe(false);
  expect(credit.resultClass).toBe("harmed");
});
