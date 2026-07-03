// muscle-memory · LIVE MOD SMOKE — loads the SHIPPED bundle (mods/index.bundled.mjs), activates
// it against a faithful letta-code mod surface whose `client` is a REAL Letta server client, and
// verifies the native lane's EFFECTS on a real agent:
//   1. activation registers tools/commands/permissions/panel without throwing
//   2. tool_start/tool_end wiring records experience rows (sandboxed MM_STATE_DIR)
//   3. conversation_close with MM_NATIVE=blocks,passages actually lands
//      - the muscle_memory core-memory block on the agent (client.agents.blocks.retrieve readback)
//      - the mm:skill passage index in archival memory (passages.search readback)
//      (this is the exact path that was silently failing before reachFn bound its receiver)
//
// The event surface is a harness simulation (same contract index.ts consumes); the AGENT and all
// its memory effects are real. Creates one throwaway agent and deletes it, even on failure.
//
// Run: LETTA_API_KEY=... bun scripts/smoke-live-agent.ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Sandbox BEFORE the bundle is imported — its state paths are module-load constants.
const stateDir = mkdtempSync(join(tmpdir(), "mm-smoke-state-"));
const memDir = mkdtempSync(join(tmpdir(), "mm-smoke-mem-"));
process.env.MM_STATE_DIR = stateDir;
process.env.MEMORY_DIR = memDir;
process.env.MM_GLOBAL_SKILLS_DIR = mkdtempSync(join(tmpdir(), "mm-smoke-global-"));
process.env.MM_NATIVE = "blocks,passages";
delete process.env.MM_REFLECT; delete process.env.MM_AUTOPILOT; delete process.env.MM_GUARD;

if (!process.env.LETTA_API_KEY) { console.error("LETTA_API_KEY not set — aborting"); process.exit(2); }

// Dynamic imports by necessity: the bundle path must resolve AFTER the env sandbox above (its
// state-dir constants freeze at module load), and letta-client resolves from the host's
// letta-code install — both specifiers are runtime-conditioned, not author-time constants.
const bundle: unknown = await import("../mods/index.bundled.mjs");
const lettaClientMod: unknown = await import(
  process.env.LETTA_CLIENT_PATH ?? `${process.env.HOME}/.local/lib/node_modules/@letta-ai/letta-code/node_modules/@letta-ai/letta-client/index.js`
);

function pick(o: unknown, k: string): unknown { return o && typeof o === "object" && k in o ? Reflect.get(o, k) : undefined; }
const activate = pick(bundle, "default");
if (typeof activate !== "function") { console.error("bundle has no default activate()"); process.exit(2); }
const LettaCtor = pick(lettaClientMod, "Letta");
if (typeof LettaCtor !== "function") { console.error("letta-client Letta ctor not found"); process.exit(2); }
const client: unknown = Reflect.construct(LettaCtor, []);

const agentsApi = pick(client, "agents");
const createAgent = pick(agentsApi, "create");
if (typeof createAgent !== "function") { console.error("client.agents.create missing"); process.exit(2); }
const created: unknown = await Reflect.apply(createAgent, agentsApi, [{
  name: `mm-smoke-${Date.now()}`,
  description: "muscle-memory live mod smoke — safe to delete",
  memory_blocks: [{ label: "muscle_memory", value: "(unsynced)" }],
}]);
const agentId = String(pick(created, "id") ?? "");
if (!agentId) { console.error("agent create returned no id"); process.exit(2); }
console.log(`smoke agent: ${agentId}`);

// ── Faithful mod surface (the contract mods/index.ts consumes) ──────────────────────────────
type Handler = (event: unknown, ctx: unknown) => unknown;
const handlers = new Map<string, Handler[]>();
const registered = { tools: [] as string[], commands: [] as string[], permissions: [] as string[], panels: [] as string[] };
const letta = {
  capabilities: { tools: true, commands: true, permissions: true, ui: { panels: true }, events: { tools: true, lifecycle: true, turns: true, llm: true, compact: true } },
  events: { on: (name: string, fn: Handler) => { const l = handlers.get(name) ?? []; l.push(fn); handlers.set(name, l); return () => {}; } },
  tools: { register: (t: { name: string }) => { registered.tools.push(t.name); return () => {}; } },
  commands: { register: (c: { id: string }) => { registered.commands.push(c.id); return () => {}; } },
  permissions: { register: (p: { id: string }) => { registered.permissions.push(p.id); return () => {}; } },
  ui: { openPanel: (id: string) => { registered.panels.push(id); return { update: () => {}, close: () => {} }; } },
  diagnostics: { report: () => {} },
  client,
};

const emit = (name: string, event: unknown, ctx: unknown = { agent: { id: agentId } }) => { for (const fn of handlers.get(name) ?? []) fn(event, ctx); };

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; };

try {
  // 1 · activation
  const dispose: unknown = activate(letta);
  check("activate() returned without throwing", true);
  check("tools registered", registered.tools.length >= 3, registered.tools.join(", "));
  check("command registered", registered.commands.includes("muscle-memory"), registered.commands.join(", "));
  check("permission guard registered", registered.permissions.includes("muscle-memory-guard"));

  // 2 · seed the sandbox agent shelf with two managed skills (what the sync should project)
  for (const [n, d] of [["debugging-failing-pytest-runs", "Use when pytest goes red: read the failure, fix the source, re-run."],
                        ["optimizing-docker-build-cache", "Use when docker build is slow: order layers so deps install before source COPY."]] as const) {
    const dir = join(memDir, "skills", n);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${n}\ndescription: ${d}\n---\n## Procedure\n1. Do it.\n<!-- muscle-memory provenance: smoke -->\n`);
  }

  // 3 · event wiring: a fail→edit→pass arc lands in the experience log
  emit("tool_start", { toolName: "Bash", toolCallId: "t1", args: { command: "python -m pytest tests/" }, conversationId: "smoke-conv" });
  emit("tool_end", { toolName: "Bash", toolCallId: "t1", status: "error", output: "AssertionError: boom", conversationId: "smoke-conv" });
  emit("tool_start", { toolName: "Edit", toolCallId: "t2", args: { file_path: "src/app.py" }, conversationId: "smoke-conv" });
  emit("tool_end", { toolName: "Edit", toolCallId: "t2", status: "success", conversationId: "smoke-conv" });
  emit("tool_start", { toolName: "Bash", toolCallId: "t3", args: { command: "python -m pytest tests/" }, conversationId: "smoke-conv" });
  emit("tool_end", { toolName: "Bash", toolCallId: "t3", status: "success", conversationId: "smoke-conv" });
  const expPath = join(stateDir, "experience.jsonl");
  check("experience rows recorded", existsSync(expPath) && readFileSync(expPath, "utf8").trim().split("\n").length >= 3);

  // 4 · conversation_close → native sync (block + passages) against the REAL agent
  emit("conversation_close", { conversationId: "smoke-conv", agentId, reason: "smoke" });
  await delay(8000); // the sync is fire-and-forget; give the round trips time to land

  const blocksApi = pick(agentsApi, "blocks");
  const retrieveBlock = pick(blocksApi, "retrieve");
  const blk: unknown = typeof retrieveBlock === "function" ? await Reflect.apply(retrieveBlock, blocksApi, ["muscle_memory", { agent_id: agentId }]) : null;
  const blockValue = String(pick(blk, "value") ?? "");
  check("neocortex block synced to real agent", blockValue.includes("debugging-failing-pytest-runs") && blockValue.includes("optimizing-docker-build-cache"),
    `block length ${blockValue.length}`);

  const passagesApi = pick(agentsApi, "passages");
  const searchPassages = pick(passagesApi, "search");
  const found: unknown = typeof searchPassages === "function" ? await Reflect.apply(searchPassages, passagesApi, [agentId, { query: "docker build cache", tags: ["mm:skill"], tag_match_mode: "all", top_k: 5 }]) : null;
  const results = pick(found, "results");
  const names = Array.isArray(results) ? results.map((r) => String(pick(r, "content") ?? "").split("\n")[0]) : [];
  check("mm:skill passage index synced to real agent", Array.isArray(results) && results.length >= 2, names.join(" | "));

  if (typeof dispose === "function") dispose();
} finally {
  const deleteAgent = pick(agentsApi, "delete");
  try { if (typeof deleteAgent === "function") { await Reflect.apply(deleteAgent, agentsApi, [agentId]); console.log(`smoke agent deleted: ${agentId}`); } }
  catch (e) { console.error(`CLEANUP FAILED — delete agent ${agentId} manually:`, e); }
}

console.log(failures === 0 ? "\nSMOKE PASS — mod live against a real Letta agent" : `\nSMOKE FAIL — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
