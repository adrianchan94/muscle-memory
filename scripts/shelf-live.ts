// muscle-memory · E8 SQUAD SHELF — live receipt runner.
//
// Proves the full cross-agent inheritance loop against real Letta archives:
//   ensure shelf archive → publish sanitized skill (provenance-tagged) → attach shelf to a
//   fresh agent → pull → staged copy on disk (NEVER the active shelf) → verify content+provenance.
// No LLM turns — archives/passages only. The throwaway agent is deleted; the shelf archive
// PERSISTS by design (it is the squad's shared artifact).
//
// Run: MM_STATE_DIR=$(mktemp -d) LETTA_API_KEY=... bun scripts/shelf-live.ts
import { readFileSync } from "node:fs";
import { pageItems, reachFn } from "../mods/engram";
import { attachSquadShelf, ensureSquadArchive, publishSkillToShelf, pullShelfSkill, SQUAD_ARCHIVE_NAME } from "../mods/shelf";

// Dynamic import by necessity: this package ships with ZERO dependencies, so the letta-client
// module cannot be a static import — it resolves from the host's letta-code install (or an
// explicit override), i.e. the specifier is genuinely runtime-selected per machine.
async function loadClientCtor(): Promise<new (opts?: { apiKey?: string | null }) => unknown> {
  const candidates = [
    process.env.LETTA_CLIENT_PATH,
    "@letta-ai/letta-client",
    `${process.env.HOME}/.local/lib/node_modules/@letta-ai/letta-code/node_modules/@letta-ai/letta-client/index.js`,
  ].filter((c): c is string => !!c);
  for (const spec of candidates) {
    try {
      const mod: unknown = await import(spec);
      if (mod && typeof mod === "object" && "Letta" in mod && typeof mod.Letta === "function") {
        return mod.Letta as new (opts?: { apiKey?: string | null }) => unknown;
      }
    } catch { /* try next */ }
  }
  throw new Error("letta-client not resolvable — set LETTA_CLIENT_PATH to its index.js");
}

if (!process.env.LETTA_API_KEY) { console.error("LETTA_API_KEY not set — aborting"); process.exit(2); }
if (!process.env.MM_STATE_DIR) { console.error("Refusing a live run against the REAL state dir — set MM_STATE_DIR to a sandbox"); process.exit(2); }

const LettaCtor = await loadClientCtor();
const client: unknown = new LettaCtor();

const SKILL_NAME = "recovering-from-flaky-verifications";
const SKILL_DOC = `---
name: ${SKILL_NAME}
description: Use when an automated verification passes locally but fails intermittently elsewhere - isolate the unstable case, remove timing races, make waits explicit, re-run to confirm.
---
# ${SKILL_NAME}

<!-- muscle-memory provenance: squad-shelf live receipt sample -->

## Symptoms
A verification command succeeds on one machine and intermittently fails on another with no code change.

## Procedure
1. Reproduce with repetition (run the failing case in a loop) before touching anything.
2. Isolate the unstable case; remove shared-state and timing dependencies.
3. Replace sleeps with explicit condition waits.
4. Re-run the SAME verification until stable across consecutive runs.

## Verification
Consecutive green runs on the previously flaky environment.
`;

const archiveId = await ensureSquadArchive(client);
if (!archiveId) { console.error("SHELF FAILURE: could not ensure squad archive"); process.exit(1); }
console.log(`shelf archive: ${archiveId} (${SQUAD_ARCHIVE_NAME})`);

const pub = await publishSkillToShelf(client, archiveId, SKILL_NAME, SKILL_DOC, "ultron");
console.log(`publish: ${pub.ok ? "OK" : "FAIL"} — ${pub.reason}`);
if (!pub.ok) process.exit(1);

const createAgent = reachFn(client, ["agents", "create"]);
const deleteAgent = reachFn(client, ["agents", "delete"]);
if (!createAgent || !deleteAgent) { console.error("client missing agents.create/delete"); process.exit(2); }
const created: unknown = await createAgent({ name: `mm-shelf-receipt-${Date.now()}`, description: "muscle-memory E8 shelf receipt — safe to delete" });
const agentId = created && typeof created === "object" && "id" in created && typeof (created as Record<string, unknown>).id === "string" ? String((created as Record<string, unknown>).id) : "";
if (!agentId) { console.error("agent create returned no id"); process.exit(2); }
console.log(`receipt agent: ${agentId}`);

try {
  const attached = await attachSquadShelf(client, agentId, archiveId);
  console.log(`attach: ${attached ? "OK" : "FAIL"}`);
  if (!attached) process.exit(1);

  const pull = await pullShelfSkill(client, agentId, SKILL_NAME);
  console.log(`pull: ${pull.ok ? "OK" : "FAIL"} — ${pull.reason} (publisher: ${pull.publisher ?? "?"})`);
  if (!pull.ok || !pull.stagedPath) process.exit(1);

  const staged = readFileSync(pull.stagedPath, "utf8");
  const provenanceOk = staged.includes("shelf pull · publisher: ultron") && staged.includes("REVIEW BEFORE PROMOTION");
  const contentOk = staged.includes("## Procedure") && staged.includes(SKILL_NAME);
  console.log(`staged copy: ${pull.stagedPath}`);
  console.log(`  provenance header: ${provenanceOk ? "OK" : "MISSING"}`);
  console.log(`  content integrity: ${contentOk ? "OK" : "CORRUPTED"}`);
  // Guard the guarantee, not just the happy path: the pull must NOT have touched an active shelf.
  const activeLeak = pull.stagedPath.includes("publish-staged");
  console.log(`  staged-first boundary: ${activeLeak ? "OK (publish-staged)" : "VIOLATED"}`);
  if (!provenanceOk || !contentOk || !activeLeak) process.exit(1);
  console.log("E8 squad shelf: LIVE RECEIPT OK");
  // Verify what the extraction relies on once more, against the live archive listing.
  const list = reachFn(client, ["archives", "passages", "list"]);
  if (list) {
    const passages = pageItems(await list(archiveId, { limit: 10 }));
    console.log(`shelf now holds ${passages.length} passage(s) — persistent squad artifact`);
  }
} finally {
  try { await deleteAgent(agentId); console.log(`receipt agent deleted: ${agentId}`); }
  catch (e) { console.error(`CLEANUP FAILED — delete agent ${agentId} manually:`, e); }
}
