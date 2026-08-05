// Authenticating persisted verified evidence.
//
// The forgery three independent reviewers reproduced worked because a `verified` row read back
// from disk was re-validated structurally and nothing more. These tests pin the replacement:
// the row carries a MAC over an exact canonical payload, and every field in it is covered.
import { test, expect } from "bun:test";
import { canonicalEvidenceBytes, signEvidencePayload, verifyEvidenceSignature } from "../mods/instrument";

const KEY = { keyId: "abcd1234", secret: Buffer.from("0".repeat(64), "hex") };
const OTHER = { keyId: "99998888", secret: Buffer.from("1".repeat(64), "hex") };

const payload = () => ({
  schema_version: "mm.evidence.v1",
  key_id: KEY.keyId,
  nonce: "n-0001",
  timestamp: 1785900000000,
  possession_id: "p-1",
  decision_event_id: "ev-d",
  skill: "recovering-failed-exact-match-edits",
  task_id: "task-1",
  task_class: "exact-repair",
  manifest_sha256: "a".repeat(64),
  baseline_sha256: "b".repeat(64),
  baseline_captured_at: 1785899999000,
  expected_sha256: "c".repeat(64),
  final_sha256: "c".repeat(64),
  invocation_receipt_id: "inv-1",
  verifier_id: "exact-file",
  verifier_version: "1",
  target_rel: "target.txt",
  result_class: "helped",
});

test("a signed payload verifies under the same key", () => {
  const p = payload();
  expect(verifyEvidenceSignature(p, signEvidencePayload(p, KEY), KEY).ok).toBe(true);
});

test("a different key does not verify", () => {
  const p = payload();
  expect(verifyEvidenceSignature(p, signEvidencePayload(p, KEY), OTHER).ok).toBe(false);
});

test("every payload field is covered by the signature", () => {
  const p = payload();
  const sig = signEvidencePayload(p, KEY);
  // If any field were excluded from canonicalisation, an attacker could rewrite it freely —
  // which is exactly the failure being fixed. Tamper with each in turn.
  for (const field of Object.keys(p)) {
    const tampered: Record<string, unknown> = { ...p };
    tampered[field] = typeof p[field as keyof typeof p] === "number" ? 424242 : "tampered";
    expect(verifyEvidenceSignature(tampered, sig, KEY).ok).toBe(false);
  }
});

test("an unexpected extra field is rejected rather than ignored", () => {
  const p = payload();
  expect(verifyEvidenceSignature({ ...p, smuggled: "value" }, signEvidencePayload(p, KEY), KEY).ok).toBe(false);
});

test("a missing field is rejected", () => {
  const p = payload();
  const sig = signEvidencePayload(p, KEY);
  const partial: Record<string, unknown> = { ...p };
  delete partial.nonce;
  expect(verifyEvidenceSignature(partial, sig, KEY).ok).toBe(false);
});

test("canonicalisation is key-order independent", () => {
  const p = payload();
  const reordered = Object.fromEntries(Object.entries(p).reverse());
  expect(canonicalEvidenceBytes(reordered)).toEqual(canonicalEvidenceBytes(p));
  expect(verifyEvidenceSignature(reordered, signEvidencePayload(p, KEY), KEY).ok).toBe(true);
});

test("a malformed signature is rejected without throwing", () => {
  const p = payload();
  for (const bad of ["", "not-hex", "ab", "z".repeat(64)]) {
    expect(verifyEvidenceSignature(p, bad, KEY).ok).toBe(false);
  }
});
