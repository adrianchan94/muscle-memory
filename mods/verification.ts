// muscle-memory · first instrument-owned verifier (narrow by design).
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { qualifyingInvocation } from "./invocation";
import { loadPossessionEvents } from "./possessions";
import { createHash, timingSafeEqual } from "node:crypto";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { STATE_DIR } from "./core";
import type { OutcomeResult, PossessionDecisionEvent } from "./possessions";

export const EXACT_FILE_ADAPTER_ID = "mm.exact-file-sha256.v1" as const;
export const VERIFICATION_TASK_SCHEMA = "mm.verification-task.exact-file.v1" as const;
export const VERIFICATION_BINDING_SCHEMA = "mm.verification-binding.v1" as const;
export const VERIFICATION_RECEIPT_SCHEMA = "mm.verification-receipt.v1" as const;
export const VERIFICATION_TASK_DIR = join(STATE_DIR, "verification-tasks");
const ADAPTER_VERSION = "1" as const;
const ROOT_ID = "configured" as const;
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const TASK_KEYS = new Set(["schema", "adapter_id", "adapter_version", "task_id", "task_class", "registered_at", "root_id", "root_identity_sha256", "target_rel", "expected_sha256", "baseline_sha256"]);
const receiptCustody = new WeakSet<object>();

export type ExactFileVerificationTask = {
  schema: typeof VERIFICATION_TASK_SCHEMA;
  adapter_id: typeof EXACT_FILE_ADAPTER_ID;
  adapter_version: typeof ADAPTER_VERSION;
  task_id: string;
  task_class: string;
  registered_at: number;
  root_id: typeof ROOT_ID;
  root_identity_sha256: string;
  target_rel: string;
  expected_sha256: string;
  /** Target digest at registration, before any work. `null` when the target does not exist yet. */
  baseline_sha256: string | null;
};

export type VerificationBinding = {
  schema: typeof VERIFICATION_BINDING_SCHEMA;
  adapter_id: typeof EXACT_FILE_ADAPTER_ID;
  adapter_version: typeof ADAPTER_VERSION;
  task_id: string;
  task_class: string;
  manifest_sha256: string;
};

export type InstrumentVerificationReceipt = {
  schema: typeof VERIFICATION_RECEIPT_SCHEMA;
  adapter_id: typeof EXACT_FILE_ADAPTER_ID;
  adapter_version: typeof ADAPTER_VERSION;
  task_id: string;
  task_class: string;
  possession_id: string;
  decision_event_id: string;
  manifest_sha256: string;
  artifact_sha256: string;
  matched: boolean;
  /** Instrument-derived: baseline was wrong at registration and the artifact is right now. */
  procedural_credit: boolean;
  verified_at: number;
};

export type InstrumentVerifiedResult = {
  result: OutcomeResult;
  evidence_tier: "verified";
  reason: string;
  evidence_ref: string;
  verification: InstrumentVerificationReceipt;
  /** The instrument hashed the artifact and it matched. Says nothing about who caused it. */
  artifact_verified: boolean;
  /** The prescription plausibly caused the change: the baseline was wrong and is now right. */
  procedural_credit: boolean;
  /**
   * Everything the signer needs to bind this result to its evidence, derived here rather than
   * reassembled by the caller. The adapter is the only place that knows all four facts, and a
   * caller that reassembles them can silently omit one - which is exactly how this broke.
   */
  evidence_context: { baselineSha256: string; baselineCapturedAt: number; invocationReceiptId: string; skill: string };
};

const BINDING_KEYS = new Set(["schema", "adapter_id", "adapter_version", "task_id", "task_class", "manifest_sha256"]);
const RECEIPT_KEYS = new Set(["schema", "adapter_id", "adapter_version", "task_id", "task_class", "possession_id", "decision_event_id", "manifest_sha256", "artifact_sha256", "matched", "procedural_credit", "verified_at"]);

function exactObject(input: unknown, keys: Set<string>, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object`);
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(raw)) if (!keys.has(key)) throw new Error(`${label} has unexpected field '${key}'`);
  for (const key of keys) if (!(key in raw)) throw new Error(`${label} missing field '${key}'`);
  return raw;
}

export function normalizeVerificationBinding(input: unknown): VerificationBinding {
  const raw = exactObject(input, BINDING_KEYS, "verification binding");
  if (raw.schema !== VERIFICATION_BINDING_SCHEMA || raw.adapter_id !== EXACT_FILE_ADAPTER_ID || raw.adapter_version !== ADAPTER_VERSION) {
    throw new Error("verification binding identity mismatch");
  }
  assertSlug("verification task_id", raw.task_id);
  assertSlug("verification task_class", raw.task_class);
  assertSha("verification manifest_sha256", raw.manifest_sha256);
  return { ...raw } as VerificationBinding;
}

export function normalizeInstrumentVerificationReceipt(input: unknown): InstrumentVerificationReceipt {
  const raw = exactObject(input, RECEIPT_KEYS, "verification receipt");
  if (raw.schema !== VERIFICATION_RECEIPT_SCHEMA || raw.adapter_id !== EXACT_FILE_ADAPTER_ID || raw.adapter_version !== ADAPTER_VERSION) {
    throw new Error("verification receipt identity mismatch");
  }
  assertSlug("verification task_id", raw.task_id);
  assertSlug("verification task_class", raw.task_class);
  assertId("verification possession_id", raw.possession_id);
  assertId("verification decision_event_id", raw.decision_event_id);
  assertSha("verification manifest_sha256", raw.manifest_sha256);
  assertSha("verification artifact_sha256", raw.artifact_sha256);
  if (typeof raw.matched !== "boolean") throw new Error("verification matched must be boolean");
  if (!Number.isSafeInteger(raw.verified_at) || Number(raw.verified_at) < 0) throw new Error("verification verified_at must be a non-negative safe integer");
  return { ...raw } as InstrumentVerificationReceipt;
}

const hashBytes = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const rootIdentitySha256 = (root: string) => {
  const st = statSync(root);
  return hashBytes(`${root}\0${st.dev}\0${st.ino}`);
};
const taskPath = (taskId: string) => join(VERIFICATION_TASK_DIR, `${taskId}.json`);

function assertSlug(label: string, value: unknown) {
  if (typeof value !== "string" || !SAFE_SLUG.test(value)) throw new Error(`${label} must be a lowercase safe slug`);
}

function assertId(label: string, value: unknown) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${label} must be a bounded safe identifier`);
}

function assertSha(label: string, value: unknown) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be a canonical lowercase SHA-256`);
}

function assertTargetRel(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 240) throw new Error("target_rel must be a bounded relative path");
  if (value.includes("\0") || value.includes("\\") || isAbsolute(value) || value.startsWith("./") || value.includes("//")) {
    throw new Error("target_rel must be a canonical POSIX-style relative path");
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error("target_rel cannot traverse or contain empty/dot segments");
}

function configuredRoot(): string {
  const raw = String(process.env.MM_EXACT_FILE_ROOT || "").trim();
  if (!raw || !isAbsolute(raw)) throw new Error("MM_EXACT_FILE_ROOT must be configured as an absolute trusted root");
  const root = realpathSync(raw);
  if (!statSync(root).isDirectory()) throw new Error("MM_EXACT_FILE_ROOT must resolve to a directory");
  return root;
}

function resolveTarget(root: string, targetRel: string, requireFile: boolean): string {
  assertTargetRel(targetRel);
  const lexical = resolve(root, targetRel);
  const lexicalRel = relative(root, lexical);
  if (!lexicalRel || lexicalRel.startsWith("..") || isAbsolute(lexicalRel)) throw new Error("target_rel escapes the trusted root");
  if (!existsSync(lexical)) {
    if (requireFile) throw new Error("verification target does not exist");
    return lexical;
  }
  const lst = lstatSync(lexical);
  if (lst.isSymbolicLink()) throw new Error("verification target cannot be a symlink");
  const target = realpathSync(lexical);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("verification target resolves outside the trusted root");
  if (!statSync(target).isFile()) throw new Error("verification target must be a regular file");
  return target;
}

function parseTaskBytes(bytes: string, path: string): ExactFileVerificationTask {
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(bytes); } catch { throw new Error(`verification manifest is malformed: ${path}`); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("verification manifest must be an object");
  for (const key of Object.keys(raw)) if (!TASK_KEYS.has(key)) throw new Error(`verification manifest has unexpected field '${key}'`);
  for (const key of TASK_KEYS) if (!(key in raw)) throw new Error(`verification manifest missing field '${key}'`);
  if (raw.schema !== VERIFICATION_TASK_SCHEMA) throw new Error("verification manifest schema mismatch");
  if (raw.adapter_id !== EXACT_FILE_ADAPTER_ID || raw.adapter_version !== ADAPTER_VERSION) throw new Error("verification adapter identity mismatch");
  if (raw.root_id !== ROOT_ID) throw new Error("verification root identity mismatch");
  assertSha("root_identity_sha256", raw.root_identity_sha256);
  assertSlug("task_id", raw.task_id);
  assertSlug("task_class", raw.task_class);
  if (!Number.isSafeInteger(raw.registered_at) || Number(raw.registered_at) < 0) throw new Error("registered_at must be a non-negative safe integer");
  assertTargetRel(raw.target_rel);
  assertSha("expected_sha256", raw.expected_sha256);
  return raw as ExactFileVerificationTask;
}

function loadTask(taskId: string): { task: ExactFileVerificationTask; path: string; bytes: string; manifestSha256: string } {
  assertSlug("task_id", taskId);
  const path = taskPath(taskId);
  if (!existsSync(path)) throw new Error(`unknown verification task '${taskId}'`);
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o222) !== 0) throw new Error("verification manifest must remain read-only");
  const bytes = readFileSync(path, "utf8");
  const task = parseTaskBytes(bytes, path);
  if (task.task_id !== taskId) throw new Error("verification manifest task_id mismatch");
  return { task, path, bytes, manifestSha256: hashBytes(bytes) };
}

export function createExactFileVerificationTask(input: {
  taskId: string;
  taskClass: string;
  targetRel: string;
  expectedSha256: string;
  registeredAt?: number;
}): { path: string; manifestSha256: string; task: ExactFileVerificationTask } {
  assertSlug("task_id", input.taskId);
  assertSlug("task_class", input.taskClass);
  assertTargetRel(input.targetRel);
  assertSha("expected_sha256", input.expectedSha256);
  const registeredAt = input.registeredAt ?? Date.now();
  if (!Number.isSafeInteger(registeredAt) || registeredAt < 0) throw new Error("registeredAt must be a non-negative safe integer");
  const root = configuredRoot();
  const targetPath = resolveTarget(root, input.targetRel, true);
  // Capture the baseline BEFORE any work so "already correct" is distinguishable from "repaired".
  // Without this the adapter cannot tell a no-op from a fix, which is exactly what P0-B exploited.
  let baselineSha: string | null = null;
  try { baselineSha = hashBytes(readFileSync(targetPath)); } catch { baselineSha = null; }
  const task: ExactFileVerificationTask = {
    schema: VERIFICATION_TASK_SCHEMA,
    adapter_id: EXACT_FILE_ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    task_id: input.taskId,
    task_class: input.taskClass,
    registered_at: registeredAt,
    root_id: ROOT_ID,
    root_identity_sha256: rootIdentitySha256(root),
    target_rel: input.targetRel,
    expected_sha256: input.expectedSha256,
    baseline_sha256: baselineSha,
  };
  const bytes = `${JSON.stringify(task)}\n`;
  mkdirSync(VERIFICATION_TASK_DIR, { recursive: true });
  const path = taskPath(input.taskId);
  writeFileSync(path, bytes, { encoding: "utf8", flag: "wx", mode: 0o444 });
  chmodSync(path, 0o444);
  const reread = readFileSync(path, "utf8");
  if (reread !== bytes) throw new Error("verification manifest write custody mismatch");
  return { path, manifestSha256: hashBytes(reread), task };
}

export function bindExactFileVerificationTask(taskId: string): VerificationBinding {
  const { task, manifestSha256 } = loadTask(taskId);
  return {
    schema: VERIFICATION_BINDING_SCHEMA,
    adapter_id: EXACT_FILE_ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    task_id: task.task_id,
    task_class: task.task_class,
    manifest_sha256: manifestSha256,
  };
}

export function isInstrumentVerificationReceipt(value: unknown): value is InstrumentVerificationReceipt {
  return !!value && typeof value === "object" && receiptCustody.has(value as object);
}

export function isStoredVerificationReceiptBound(bindingInput: unknown, receiptInput: unknown, possessionId: string, decisionEventId: string): boolean {
  try {
    const binding = normalizeVerificationBinding(bindingInput);
    const receipt = normalizeInstrumentVerificationReceipt(receiptInput);
    if (receipt.possession_id !== possessionId || receipt.decision_event_id !== decisionEventId) return false;
    if (binding.adapter_id !== receipt.adapter_id || binding.adapter_version !== receipt.adapter_version) return false;
    if (binding.task_id !== receipt.task_id || binding.task_class !== receipt.task_class) return false;
    if (binding.manifest_sha256 !== receipt.manifest_sha256) return false;
    const loaded = loadTask(binding.task_id);
    const digestRelation = receipt.artifact_sha256 === loaded.task.expected_sha256;
    return loaded.manifestSha256 === binding.manifest_sha256
      && loaded.task.task_id === binding.task_id
      && loaded.task.task_class === binding.task_class
      && receipt.matched === digestRelation;
  } catch {
    return false;
  }
}

export function verifyExactFilePossession(decision: PossessionDecisionEvent): InstrumentVerifiedResult {
  if (decision.action !== "prescribe") throw new Error("exact-file verification supports prescribed-skill possessions only");
  const binding = decision.verification;
  if (!binding) throw new Error("possession has no pre-work verification binding");
  if (binding.schema !== VERIFICATION_BINDING_SCHEMA || binding.adapter_id !== EXACT_FILE_ADAPTER_ID || binding.adapter_version !== ADAPTER_VERSION) {
    throw new Error("possession verification binding is not the exact-file adapter");
  }
  const { task, manifestSha256 } = loadTask(binding.task_id);
  // One sealed manifest backs exactly one decision. Reusing a task_id lets a second possession
  // ride a manifest that was frozen for the first, so refuse it rather than verify it.
  {
    const bound = loadPossessionEvents().filter((row) =>
      row.type === "decision"
      && (row as { verification?: { task_id?: string } }).verification?.task_id === binding.task_id);
    if (bound.some((row) => row.possession_id !== decision.possession_id)) {
      throw new Error("verification task_id is already bound to a different possession");
    }
  }
  if (manifestSha256 !== binding.manifest_sha256) throw new Error("verification manifest hash mismatch after decision binding");
  if (task.task_class !== binding.task_class || decision.task_class !== task.task_class) throw new Error("verification task_class mismatch");
  if (task.task_id !== binding.task_id) throw new Error("verification task_id mismatch");
  if (task.registered_at > decision.ts) throw new Error("verification task must be registered before the decision");

  const root = configuredRoot();
  if (rootIdentitySha256(root) !== task.root_identity_sha256) throw new Error("configured verification root changed after task registration");
  const target = resolveTarget(root, task.target_rel, true);
  if (typeof constants.O_NOFOLLOW !== "number" || constants.O_NOFOLLOW === 0) {
    throw new Error("exact-file verification is unsupported on this platform: O_NOFOLLOW unavailable");
  }
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const before = fstatSync(fd);
    if (!before.isFile()) throw new Error("verification target must remain a regular file");
    const openedReal = realpathSync(target);
    if (openedReal !== root && !openedReal.startsWith(`${root}${sep}`)) throw new Error("verification target escaped the trusted root while opening");
    const openedPathStat = statSync(openedReal);
    if (openedPathStat.dev !== before.dev || openedPathStat.ino !== before.ino) throw new Error("verification target changed before hashing");
    bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const afterReal = realpathSync(target);
    const afterPathStat = statSync(afterReal);
    if (afterReal !== openedReal || afterPathStat.dev !== after.dev || afterPathStat.ino !== after.ino
      || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error("verification target changed while hashing");
    }
  } finally {
    closeSync(fd);
  }
  const artifactSha256 = hashBytes(bytes);
  const matched = timingSafeEqual(Buffer.from(artifactSha256, "hex"), Buffer.from(task.expected_sha256, "hex"));
  // Procedural credit needs BOTH: a real gap at registration, and an instrument-observed
  // invocation of the exact prescribed skill inside the window. Either alone is not causation.
  const preExisting = task.baseline_sha256 !== null && task.baseline_sha256 === task.expected_sha256;
  const verifiedAt = Date.now();
  const invocation = decision.skill
    ? qualifyingInvocation({
        possessionId: decision.possession_id,
        decisionEventId: decision.event_id,
        skill: decision.skill,
        baselineAt: task.registered_at,
        decisionAt: decision.ts,
        verifiedAt,
      })
    : null;
  const proceduralCredit = matched && !preExisting && invocation !== null;
  const verification: InstrumentVerificationReceipt = {
    schema: VERIFICATION_RECEIPT_SCHEMA,
    adapter_id: EXACT_FILE_ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    task_id: task.task_id,
    task_class: task.task_class,
    possession_id: decision.possession_id,
    decision_event_id: decision.event_id,
    manifest_sha256: manifestSha256,
    artifact_sha256: artifactSha256,
    matched,
    procedural_credit: proceduralCredit,
    verified_at: verifiedAt,
  };
  receiptCustody.add(verification);
  // Artifact truth and causation are separate questions, and the ANSWER STRING has to say so.
  // A match on a target that was already correct at registration is not help - reporting it as
  // "helped" mis-trains the agent reading it, even though the scoreboard would demote it later.
  const result: OutcomeResult = !matched ? "harmed" : proceduralCredit ? "helped" : "neutral";
  const reason = !matched
    ? "exact-file SHA-256 did not match the bound manifest"
    : proceduralCredit
      ? "exact-file SHA-256 was wrong at registration and matches the bound manifest now"
      : preExisting
        ? "exact-file SHA-256 matched the bound manifest, but the target already matched before the prescription — artifact verified, no procedural credit"
        : "exact-file SHA-256 matches now, but no invocation of the prescribed skill was observed — artifact verified, no procedural credit";
  return {
    result,
    evidence_tier: "verified",
    reason,
    evidence_ref: `adapter:${EXACT_FILE_ADAPTER_ID}:${manifestSha256}`,
    verification,
    artifact_verified: matched,
    procedural_credit: proceduralCredit,
    evidence_context: {
      baselineSha256: task.baseline_sha256 ?? "",
      baselineCapturedAt: task.registered_at,
      invocationReceiptId: invocation?.invocation_id ?? "",
      skill: decision.skill ?? "",
    },
  };
}
