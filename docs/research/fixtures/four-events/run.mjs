#!/usr/bin/env node
/**
 * FOUR EVENTS — minimal deterministic instrument fixture.
 *
 *   node docs/research/fixtures/four-events/run.mjs
 *
 * This demonstrates the instrument; it does not reproduce the sealed findings.
 *
 * It separates four things that are routinely conflated when people claim a memory
 * system "worked":
 *
 *   1. presence          the skill exists on the shelf
 *   2. prescription      the skill was selected and served for this task
 *   3. execution         the agent actually invoked it and acted
 *   4. verified outcome  an INSTRUMENT, not the caller, derived the result
 *
 * A system that reports (1) as if it were (4) is measuring nothing.
 *
 * Fully deterministic: no network, no provider calls, no model, no clock in the
 * comparison. Runs in well under a second. Exits non-zero if any separation
 * collapses.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LABEL = "This demonstrates the instrument; it does not reproduce the sealed findings.";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const root = mkdtempSync(join(tmpdir(), "mm-four-events-"));
const shelf = join(root, "shelf");
const workspace = join(root, "workspace");
mkdirSync(shelf, { recursive: true });
mkdirSync(workspace, { recursive: true });

const SKILL = "recovering-failed-exact-match-edits";
const events = [];
const record = (event, detail) => events.push({ event, ...detail });

// ── 1 · PRESENCE ─────────────────────────────────────────────────────────────
// The skill is on the shelf. This is the weakest possible signal: it says nothing
// about whether anything used it.
mkdirSync(join(shelf, SKILL), { recursive: true });
writeFileSync(
  join(shelf, SKILL, "SKILL.md"),
  `---\nname: ${SKILL}\ndescription: Use when an exact-match edit fails because the target text is stale.\n---\n## Procedure\n1. Re-read the current file content.\n2. Re-anchor the match on text that still exists.\n3. Re-run the original check.\n`,
);
record("presence", { skill: SKILL, onShelf: existsSync(join(shelf, SKILL, "SKILL.md")) });

// ── 2 · PRESCRIPTION ─────────────────────────────────────────────────────────
// A gap must be attested. Relevance alone is not an indication — so the same
// router that serves a skill also refuses to serve one.
function prescribe({ gapObserved }) {
  if (!gapObserved) return { action: "abstain", reason: "no observed gap declared" };
  return { action: "prescribe", skill: SKILL };
}
const refused = prescribe({ gapObserved: false });
const served = prescribe({ gapObserved: true });
record("prescription", { refusedWithoutGap: refused.action === "abstain", served: served.action === "prescribe", skill: served.skill });

// ── 3 · EXECUTION ────────────────────────────────────────────────────────────
// Serving is not doing. Execution is a separate, separately recorded event — and
// it is entirely possible to serve without executing.
const servedButNotExecuted = { invoked: false };
const target = join(workspace, "target.txt");
writeFileSync(target, "stale\n");
// the agent applies the procedure
writeFileSync(target, "repaired\n");
const executed = { invoked: true };
record("execution", { servedWithoutExecuting: servedButNotExecuted.invoked === false, executed: executed.invoked });

// ── 4 · VERIFIED OUTCOME ─────────────────────────────────────────────────────
// The instrument derives the result itself from a pre-registered expectation.
// The caller's opinion is accepted as JUDGED, never as VERIFIED.
const expected = sha256(Buffer.from("repaired\n"));
const verify = (path, expectedSha) => {
  const actual = sha256(readFileSync(path));
  return { tier: "verified", pass: actual === expectedSha, derivedBy: "instrument", actual };
};
const claimedByCaller = { tier: "judged", pass: true, derivedBy: "caller" };
const derived = verify(target, expected);

// a caller asserting success on a file that does not match must still fail
writeFileSync(join(workspace, "wrong.txt"), "not repaired\n");
const forged = verify(join(workspace, "wrong.txt"), expected);

record("verified_outcome", {
  callerClaimIsJudgedOnly: claimedByCaller.tier === "judged",
  instrumentDerived: derived.derivedBy === "instrument" && derived.pass === true,
  callerCannotForgeVerified: forged.pass === false,
});

// ── separations must hold ────────────────────────────────────────────────────
const checks = {
  "presence does not imply prescription": events[0].onShelf === true && refused.action === "abstain",
  "prescription does not imply execution": served.action === "prescribe" && servedButNotExecuted.invoked === false,
  "execution does not imply verification": executed.invoked === true && claimedByCaller.tier !== "verified",
  "verification is instrument-derived": derived.derivedBy === "instrument" && derived.pass === true,
  "a caller cannot forge a verified pass": forged.pass === false,
};

const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);

console.log(`FOUR EVENTS — deterministic instrument fixture\n${LABEL}\n`);
for (const [name, ok] of Object.entries(checks)) console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
console.log(`\nevents: ${events.map((e) => e.event).join(" → ")}`);
console.log(`fixture digest: ${sha256(Buffer.from(JSON.stringify(events)))}`);
console.log(`\n${LABEL}`);

rmSync(root, { recursive: true, force: true });

if (failed.length) {
  console.error(`\nSEPARATION COLLAPSED: ${failed.join("; ")}`);
  process.exit(1);
}
