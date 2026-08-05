// Evidence-instrument key custody.
//
// The signing key authenticates persisted `verified` evidence. A cold review proved that
// without it, anyone who can write to MM_STATE_DIR can mint `verified` and therefore `proven`
// with no verifier ever running: receipt authenticity was enforced only at append time, by a
// WeakSet of in-process object identity, which cannot survive JSON.parse.
//
// The key must therefore live somewhere the state-directory attacker cannot reach. That is a
// runtime control here, not a convention in a document — an earlier draft of this design put
// the key inside the default state directory while claiming it was outside.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

export type KeyUnavailableReason = "key_absent" | "key_permissions" | "key_inside_state_dir" | "key_malformed" | "key_dir_permissions";

export type LoadedInstrumentKey =
  | { available: true; keyId: string; secret: Buffer; keyPath: string }
  | { available: false; reason: KeyUnavailableReason; keyPath: string; detail?: string };

/** Sibling of the state tree, never inside it. */
export function defaultInstrumentKeyPath(home: string = homedir()): string {
  return join(home, ".letta", "instrument", "muscle-memory.key");
}

export function resolveInstrumentKeyPath(opts: { home?: string; env?: Record<string, string | undefined> } = {}): string {
  const env = opts.env ?? process.env;
  const override = String(env.MM_INSTRUMENT_KEY_FILE || "").trim();
  return override ? resolve(override) : defaultInstrumentKeyPath(opts.home ?? homedir());
}

/**
 * True when `candidate` is the state dir or sits underneath it.
 *
 * Both sides are resolved through realpath where they exist, so a symlink cannot be used to
 * present an inside path as an outside one. Non-existent paths fall back to lexical resolution,
 * which is correct for the "about to be created" case.
 */
function isInsideStateDir(candidate: string, stateDir: string): boolean {
  const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
  const key = real(candidate);
  const keyDir = real(dirname(candidate));
  const state = real(stateDir);
  const under = (p: string) => p === state || p.startsWith(state + sep);
  return under(key) || under(keyDir);
}

export function loadInstrumentKey(opts: { keyPath?: string; stateDir: string; env?: Record<string, string | undefined> }): LoadedInstrumentKey {
  const keyPath = opts.keyPath ?? resolveInstrumentKeyPath({ env: opts.env });

  // Containment is checked before existence: a key in the wrong place is refused whether or
  // not it happens to be there yet, and the reason never leaks which is which.
  if (isInsideStateDir(keyPath, opts.stateDir)) return { available: false, reason: "key_inside_state_dir", keyPath };
  if (!existsSync(keyPath)) return { available: false, reason: "key_absent", keyPath };

  const mode = statSync(keyPath).mode & 0o777;
  if (mode !== 0o600) return { available: false, reason: "key_permissions", keyPath, detail: mode.toString(8) };

  const dirMode = statSync(dirname(keyPath)).mode & 0o777;
  if (dirMode & 0o077) return { available: false, reason: "key_dir_permissions", keyPath, detail: dirMode.toString(8) };

  const raw = readFileSync(keyPath, "utf8").trim();
  const [keyId, material] = raw.split(".");
  if (!keyId || !material || !/^[a-z0-9]{8}$/.test(keyId)) return { available: false, reason: "key_malformed", keyPath };

  return { available: true, keyId, secret: Buffer.from(material, "base64url"), keyPath };
}

export function initInstrumentKey(opts: { keyPath?: string; stateDir: string; env?: Record<string, string | undefined> }): { created: boolean; keyId: string; keyPath: string } {
  // A key that has just been created must be usable immediately, including by a process
  // that already looked and found nothing.
  onKeyChanged();
  const keyPath = opts.keyPath ?? resolveInstrumentKeyPath({ env: opts.env });
  if (isInsideStateDir(keyPath, opts.stateDir)) {
    throw new Error("refusing to create the instrument key inside the state directory; it must live outside the directory whose contents it authenticates");
  }

  const existing = loadInstrumentKey({ keyPath, stateDir: opts.stateDir });
  // Rotating on a plain re-run would silently invalidate every receipt already signed.
  if (existing.available) return { created: false, keyId: existing.keyId, keyPath };

  mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(keyPath), 0o700);
  const material = randomBytes(32);
  const keyId = createHash("sha256").update(material).digest("hex").slice(0, 8);
  writeFileSync(keyPath, `${keyId}.${material.toString("base64url")}\n`, { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  return { created: true, keyId, keyPath };
}

/** Human-readable state for the Decision Report; never contains key material. */
export function instrumentStatusLine(loaded: LoadedInstrumentKey): string | null {
  if (loaded.available) return null;
  if (loaded.reason === "key_inside_state_dir") return "INSTRUMENT KEY REFUSED · key must not live inside the state directory · verified disabled (judged still works)";
  if (loaded.reason === "key_absent") return "INSTRUMENT UNAVAILABLE · run /muscle-memory instrument init · verified disabled (judged still works)";
  return `INSTRUMENT KEY REFUSED · ${loaded.reason.replace(/_/g, " ")} · verified disabled (judged still works)`;
}

/**
 * The status line, at most once per session, for the verified path only.
 *
 * A refused or uninitialised key disables verified evidence silently otherwise - the row simply
 * lands unsigned and the operator finds out much later. Judged closeouts never see this: they
 * work exactly as designed without a key, and nagging them would train people to ignore it.
 */
let noticeShown = false;
/** Invalidate anything derived from "there is no key" the moment a key appears. */
const keyChangeListeners: Array<() => void> = [];
export function onInstrumentKeyChange(fn: () => void): void { keyChangeListeners.push(fn); }
function onKeyChanged(): void { noticeShown = false; for (const fn of keyChangeListeners) { try { fn(); } catch { /* a listener must not break init */ } } }
export function instrumentSessionNotice(stateDir: string): string | null {
  if (noticeShown) return null;
  const line = instrumentStatusLine(loadInstrumentKey({ stateDir }));
  if (!line) return null;
  noticeShown = true;
  return line;
}
export function __resetInstrumentNotice(): void { noticeShown = false; }

// ── Signed evidence payload ─────────────────────────────────────────────────
// Exact field set: an unknown or missing key fails verification rather than being ignored,
// so nothing can ride along unsigned.
const EVIDENCE_FIELDS = [
  "schema_version", "key_id", "nonce", "timestamp",
  "possession_id", "decision_event_id", "skill",
  "task_id", "task_class", "manifest_sha256",
  "baseline_sha256", "baseline_captured_at",
  "expected_sha256", "final_sha256",
  "invocation_receipt_id", "verifier_id", "verifier_version",
  "target_rel", "result_class",
] as const;

export type EvidencePayload = Record<(typeof EVIDENCE_FIELDS)[number], string | number>;

/** Sorted-key JSON over the exact field set. Order-independent, so re-serialisation is safe. */
export function canonicalEvidenceBytes(payload: unknown): Buffer {
  if (!payload || typeof payload !== "object") throw new Error("evidence payload must be an object");
  const raw = payload as Record<string, unknown>;
  if (Object.keys(raw).length !== EVIDENCE_FIELDS.length) throw new Error("evidence payload field count mismatch");
  const canonical: Record<string, unknown> = {};
  for (const field of [...EVIDENCE_FIELDS].sort()) {
    if (!(field in raw)) throw new Error(`evidence payload missing '${field}'`);
    canonical[field] = raw[field];
  }
  return Buffer.from(JSON.stringify(canonical), "utf8");
}

export function signEvidencePayload(payload: unknown, key: { keyId: string; secret: Buffer }): string {
  return createHmac("sha256", key.secret).update(canonicalEvidenceBytes(payload)).digest("hex");
}

export function verifyEvidenceSignature(payload: unknown, signature: unknown, key: { keyId: string; secret: Buffer }): { ok: boolean; reason?: string } {
  let expected: Buffer;
  try {
    expected = Buffer.from(signEvidencePayload(payload, key), "hex");
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "malformed payload" };
  }
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return { ok: false, reason: "malformed signature" };
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length) return { ok: false, reason: "length mismatch" };
  return timingSafeEqual(actual, expected) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
