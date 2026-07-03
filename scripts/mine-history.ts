// muscle-memory · E6 RETROACTIVE MINING — live receipt runner.
//
// Mines a REAL agent's message history into a sandbox muscle-memory state and reports what the
// existing deterministic pipeline finds in it (repair chains the mod never saw live). Read-only
// on the server: no messages sent, no agent state mutated; writes land only under MM_STATE_DIR.
//
// Run (sandboxed): MM_STATE_DIR=$(mktemp -d) LETTA_API_KEY=... bun scripts/mine-history.ts [agent-id]
// Without an agent id it picks the most recently updated agent that has message history.
import { loadExperience } from "../mods/core";
import { detectRepairChains } from "../mods/detect";
import { pageItems, reachFn } from "../mods/engram"
import { mineAgentHistory } from "../mods/history";

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
if (!process.env.MM_STATE_DIR) { console.error("Refusing to mine into the REAL state dir — set MM_STATE_DIR to a sandbox"); process.exit(2); }

const LettaCtor = await loadClientCtor();
const client: unknown = new LettaCtor();

let agentId = process.argv[2] ?? "";
let ownedAgent = false; // created by this run → deleted by this run
if (!agentId) {
  const listAgents = reachFn(client, ["agents", "list"]);
  if (!listAgents) { console.error("client missing agents.list"); process.exit(2); }
  const resp: unknown = await listAgents({ limit: 10 });
  const items: unknown[] = pageItems(resp)
  for (const a of items) {
    if (a && typeof a === "object" && "id" in a && typeof (a as Record<string, unknown>).id === "string") { agentId = String((a as Record<string, unknown>).id); break; }
  }
}
if (!agentId) {
  // No history anywhere on this key: manufacture some. Create a throwaway agent and drive two
  // REAL tool-calling turns (core memory tools), so mining runs against genuine wire shapes,
  // not mocks. The agent is deleted at the end regardless of outcome.
  const createAgent = reachFn(client, ["agents", "create"]);
  const sendMessage = reachFn(client, ["agents", "messages", "create"]);
  if (!createAgent || !sendMessage) { console.error("client missing agents.create/messages.create"); process.exit(2); }
  const model = process.env.MM_RECEIPT_MODEL || "zai-coding/glm-5.2"; // BYOK lane — LLM turns bill the provider, not Letta credits
  const created: unknown = await createAgent({ name: `mm-mine-receipt-${Date.now()}`, description: "muscle-memory E6 mining receipt — safe to delete", model });
  agentId = created && typeof created === "object" && "id" in created && typeof (created as Record<string, unknown>).id === "string" ? String((created as Record<string, unknown>).id) : "";
  if (!agentId) { console.error("agent create returned no id"); process.exit(2); }
  ownedAgent = true;
  console.log(`created receipt agent: ${agentId} — driving real tool turns`);
  await sendMessage(agentId, { input: "Use your archival memory insert tool to store exactly this note: 'mm mining receipt alpha'. Then stop.", max_steps: 4 });
  await sendMessage(agentId, { input: "Search your archival memory for 'mining receipt' and tell me what you find.", max_steps: 4 });
}
console.log(`mining agent: ${agentId} (read-only on server; sandbox state: ${process.env.MM_STATE_DIR})`);

try {
  const t0 = Date.now();
  const batch = await mineAgentHistory(client, agentId, { maxPages: 20, pageSize: 100 });
  console.log(`  scanned ${batch.scanned} messages in ${Date.now() - t0}ms → ${batch.rows} step rows + ${batch.outcomes} outcomes (watermark: ${batch.newestId ?? "none"})`);

  // The whole point: the EXISTING pipeline consumes mined tape with zero new code.
  const experience = loadExperience();
  const chains = detectRepairChains(experience);
  console.log(`  experience rows after correlation: ${experience.length}`);
  console.log(`  repair chains detected in history the mod never saw live: ${chains.length}`);
  for (const c of chains.slice(0, 5)) {
    const chain = c as unknown as Record<string, unknown>;
    console.log(`    · "${String(chain.trigger ?? "?").slice(0, 70)}" (${String(chain.errClass ?? "?")}) ×${String(chain.count ?? "?")} across ${String(chain.convs ?? "?")} conv`);
  }
  if (batch.scanned === 0 || batch.rows === 0) { console.error("MINE FAILURE: no tool history captured"); process.exit(1); }
  console.log("E6 retroactive mining: LIVE RECEIPT OK");
} finally {
  if (ownedAgent) {
    const deleteAgent = reachFn(client, ["agents", "delete"]);
    if (deleteAgent) { try { await deleteAgent(agentId); console.log(`receipt agent deleted: ${agentId}`); } catch (e) { console.error(`CLEANUP FAILED — delete agent ${agentId} manually:`, e); } }
  }
}
