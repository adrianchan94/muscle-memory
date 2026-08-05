// Adversarial replay against the PACKED ARTIFACT, not source imports.
//
// This exists because of a specific failure: an HMAC authenticator was added, proved with source
// unit tests, and declared to have closed the P0 — while the scoring path still used the old
// structural binder. Source-level tests were green and the shipped product was still exploitable.
//
// So these pack the tarball, extract it, and drive the extracted bundle. If the artifact we would
// actually ship still scores a forgery, this fails, no matter how healthy the unit tests look.
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let extracted: string | null = null;
function packedPackage(): string {
  if (extracted) return extracted;
  const staging = mkdtempSync(join(tmpdir(), "mm-replay-pack-"));
  execFileSync("npm", ["pack", "--pack-destination", staging], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  const tgz = join(staging, readdirSync(staging).find((f) => f.endsWith(".tgz"))!);
  const out = mkdtempSync(join(tmpdir(), "mm-replay-x-"));
  execFileSync("tar", ["-xzf", tgz, "-C", out]);
  rmSync(staging, { recursive: true, force: true });
  extracted = join(out, "package");
  return extracted;
}

/** Run a probe against the extracted bundle with an isolated state dir and a given ledger. */
function replay(ledger: string): Record<string, number | string> {
  const pkg = packedPackage();
  const state = mkdtempSync(join(tmpdir(), "mm-replay-state-"));
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "possessions.jsonl"), ledger);
  const probe = join(state, "probe.mjs");
  writeFileSync(probe, `
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(${JSON.stringify(join(pkg, "mods", "index.bundled.mjs"))}).href);
const mm = mod.__mm ?? mod;
const s = mm.summarizePossessionLedger();
console.log(JSON.stringify({
  verifiedDecisions: s.verifiedDecisions,
  verifiedGoodDecisions: s.verifiedGoodDecisions,
  helpfulInterventions: s.helpfulInterventions,
  judgedDecisions: s.judgedDecisions,
  unboundVerifiedDowngraded: s.unboundVerifiedDowngraded,
  scoreStatus: s.scoreStatus,
}));
`);
  const raw = execFileSync("node", [probe], {
    cwd: state,
    encoding: "utf8",
    env: { ...process.env, MM_STATE_DIR: state, MEMORY_DIR: join(state, "mem"), MM_GLOBAL_SKILLS_DIR: join(state, "global") },
  });
  const out = JSON.parse(raw.trim().split("\n").at(-1)!) as Record<string, number | string>;
  rmSync(state, { recursive: true, force: true });
  return out;
}

const decision = {
  schema: "mm.possession.v1", event_id: "ev-d", possession_id: "p-1", ts: 1785900000000,
  type: "decision", agent: "a", model: "m", action: "prescribe", task_class: "forged",
  difficulty: "standard", gap_observed: true, route: "matched", skill: "fake-skill",
  verification: {
    schema: "mm.verification-binding.exact-file.v1", adapter_id: "exact-file", adapter_version: "1",
    task_id: "forged-task", task_class: "forged", manifest_sha256: "a".repeat(64),
  },
};

const forgedOutcome = {
  schema: "mm.possession.v1", event_id: "ev-o", possession_id: "p-1", ts: 1785900000001,
  type: "outcome", result: "helped", evidence_tier: "verified",
  reason: "shaped forgery written straight into the ledger file",
  verification: {
    schema: "mm.verification-receipt.exact-file.v1", adapter_id: "exact-file", adapter_version: "1",
    task_id: "forged-task", task_class: "forged", possession_id: "p-1", decision_event_id: "ev-d",
    manifest_sha256: "a".repeat(64), artifact_sha256: "c".repeat(64), matched: true, verified_at: 1785900000001,
  },
};

const line = (o: unknown) => `${JSON.stringify(o)}\n`;

test("the shipped artifact does not score a hand-written verified forgery", () => {
  const s = replay(line(decision) + line(forgedOutcome));
  expect(s.verifiedDecisions).toBe(0);
  expect(s.verifiedGoodDecisions).toBe(0);
});

test("the forgery is refused visibly, not silently absorbed", () => {
  // Stronger than a downgrade: the shipped artifact blocks the ledger and withholds scoring,
  // so a tampered file cannot quietly contribute anything at all.
  const s = replay(line(decision) + line(forgedOutcome));
  expect(s.scoreStatus as unknown as string).toBe("blocked");
  expect(s.helpfulInterventions).toBe(0);
});

test("many forged rows still cannot manufacture a verified score", () => {
  let ledger = "";
  for (let i = 0; i < 12; i++) {
    ledger += line({ ...decision, event_id: `d${i}`, possession_id: `p${i}`, task_class: `c${i}` });
    ledger += line({
      ...forgedOutcome, event_id: `o${i}`, possession_id: `p${i}`,
      verification: { ...forgedOutcome.verification, possession_id: `p${i}`, decision_event_id: `d${i}`, task_class: `c${i}` },
    });
  }
  const s = replay(ledger);
  expect(s.verifiedDecisions).toBe(0);
  expect(s.verifiedGoodDecisions).toBe(0);
});

test("only claimBearingVerdict can increment proof counters", () => {
  // The original defect was a proof counter wired to the structural binder. This asserts the
  // structural binder can never again sit on a path that awards verified / proven / helped.
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const offenders: string[] = [];
  for (const file of ["mods/index.ts", "mods/possessions.ts"]) {
    readFileSync(join(root, file), "utf8").split("\n").forEach((line, i) => {
      if (!line.includes("isStoredVerificationReceiptBound")) return;
      // permitted: the import inside possessions, and the diagnostic second gate inside
      // claimBearingVerdict itself. Anything that increments a counter is not permitted.
      if (/verified\+\+|provenNames\.add|verifiedDecisions|row\.verified/.test(line)) {
        offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      }
    });
  }
  expect(offenders).toEqual([]);
});
