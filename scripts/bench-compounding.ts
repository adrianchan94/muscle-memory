// muscle-memory · COMPOUNDING PROOF — does an agent with muscle-memory get measurably better
// across sessions than the same agent without it?
//
// Design (the isolation is the experiment):
//   - EVERY session runs a FRESH agent (`letta -p --new-agent`) in a FRESH copy of the task
//     workspace. No chat history, no memfs carryover, no agent identity persists.
//   - The ONLY thing that persists in the `learning` arm is muscle-memory's own state:
//     MM_STATE_DIR (experience/defenses) + the skill shelf (MM_GLOBAL_SKILLS_DIR, also symlinked
//     into the workspace as .agents/skills so letta-code's native project-skill discovery
//     surfaces learned skills in-context). The `control` arm gets a fresh, empty state dir and
//     shelf every session. Any cross-session improvement is therefore attributable to the mod.
//   - The task carries a REPEATING failure class: `npm run check` fails with a cryptic error
//     until a specific config repair is applied; the fix is derivable only by reading the
//     verifier source. Session 1 must earn it; the question is whether sessions 2..N inherit it.
//   - Learning arm env: MM_AUTOPILOT=auto (deterministic distiller — no model author needed),
//     MM_REFLEX=on (failure coaching), MM_CAPTURE=context (worked-example fidelity).
//
// Metrics per session: ground-truth success (we re-run the verifier ourselves), steps
// (usage.step_count), duration_ms, total tokens. Receipts: /tmp/mm-compounding-<ts>.json
//
// Run: bun scripts/bench-compounding.ts [sessionsPerArm=4]
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SESSIONS = Math.max(2, Math.min(8, Number(process.argv[2] || 4)));
const EPOCH = 7; // the trap constant the verifier derives internally

function mkTemplate(dir: string) {
  mkdirSync(join(dir, "tools"), { recursive: true });
  mkdirSync(join(dir, ".ledger"), { recursive: true });
  mkdirSync(join(dir, "docs", "migrations"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "visor-lab", private: true, type: "module", scripts: { check: "node tools/verify.mjs" } }, null, 2));
  // The verifier is a MINIFIED vendored artifact (realistic: a built tool checked into the repo).
  // Reading it is useless; the error message starts a 2-hop docs chase instead:
  //   check fails → .ledger/manifest.json (current: m7) → docs/migrations/m7.md (epoch: 7) → edit config.
  // An agent WITHOUT memory pays the chase every session; one WITH the learned skill (which carries
  // the worked fix via MM_CAPTURE=worked) can go straight to the config edit.
  const plain = `import{readFileSync as r}from"node:fs";const R=(p)=>r(new URL(p,import.meta.url),"utf8");let c={};try{c=JSON.parse(R("../visor.config.json"))}catch{}let m={};try{m=JSON.parse(R("../.ledger/manifest.json"))}catch{}let e=NaN;try{e=Number((R("../docs/migrations/"+m.current+".md").match(/epoch:\\s*(\\d+)/)||[])[1])}catch{}if(!Number.isFinite(e)){console.error("E_VISOR: ledger manifest unreadable");process.exit(2)}if(c.ledgerEpoch!==e){console.error("E_VISOR: ledger epoch stale — consult .ledger/manifest.json");process.exit(1)}console.log("VERIFY OK");`;
  writeFileSync(join(dir, "tools", "verify.mjs"), `// @generated visor-verify v3.4.1 — vendored build artifact, DO NOT MODIFY\n${plain}\n`);
  writeFileSync(join(dir, ".ledger", "manifest.json"), JSON.stringify({ current: "m7", chain: ["m5", "m6", "m7"] }, null, 2));
  writeFileSync(join(dir, "docs", "migrations", "m7.md"), "# migration m7 — ledger epoch bump\n\nStatus: applied\nepoch: 7\n\nAll verifier runs must carry this epoch in visor.config.json.\n");
  writeFileSync(join(dir, "docs", "migrations", "m6.md"), "# migration m6 — checksum salt rotation\n\nStatus: superseded\nepoch: 6\n");
  writeFileSync(join(dir, "docs", "migrations", "m5.md"), "# migration m5 — initial ledger\n\nStatus: superseded\nepoch: 5\n");
  writeFileSync(join(dir, "visor.config.json"), JSON.stringify({ ledgerEpoch: 3, checksumSalt: "q0" }, null, 2));
  writeFileSync(join(dir, "README.md"), "# visor-lab\nInternal migration lab. `npm run check` must pass before any release.\n");
}

const PROMPT = "Run `npm run check` in this project and make it pass. You may edit configuration files but MUST NOT modify tools/verify.mjs. Stop as soon as it prints VERIFY OK.";

type SessionStats = { arm: string; session: number; success: boolean; steps: number; durationMs: number; totalTokens: number; skillsOnShelf: number; coached: boolean };

function lastJson(text: string): unknown {
  // headless emits a single JSON object; be tolerant of stray log lines before it
  const start = text.indexOf("{");
  if (start < 0) return null;
  try { return JSON.parse(text.slice(start)); } catch { return null; }
}

function num(o: unknown, ...path: string[]): number {
  let cur: unknown = o;
  for (const k of path) { if (!cur || typeof cur !== "object" || !(k in cur)) return 0; cur = Reflect.get(cur, k); }
  return typeof cur === "number" ? cur : 0;
}

async function runSession(arm: "control" | "learning", session: number, persist: { state: string; shelf: string }): Promise<SessionStats> {
  const ws = mkdtempSync(join(tmpdir(), `mm-comp-${arm}-s${session}-`));
  mkTemplate(ws);
  // per-session state for control; persistent for learning
  const state = arm === "learning" ? persist.state : mkdtempSync(join(tmpdir(), "mm-comp-ctl-state-"));
  const shelf = arm === "learning" ? persist.shelf : mkdtempSync(join(tmpdir(), "mm-comp-ctl-shelf-"));
  if (arm === "learning") {
    // surface the learned shelf to letta-code's native project-skill discovery
    mkdirSync(join(ws, ".agents"), { recursive: true });
    try { symlinkSync(shelf, join(ws, ".agents", "skills")); } catch { /* exists */ }
  }
  const env: Record<string, string | undefined> = {
    ...process.env,
    MM_STATE_DIR: state,
    MM_GLOBAL_SKILLS_DIR: shelf,
    MM_AGENT: `bench-${arm}`,
    MM_REFLECT: undefined, MM_GUARD: undefined, MM_NATIVE: undefined, MM_PUBLISH: undefined,
    MM_AUTOPILOT: arm === "learning" ? "auto" : undefined,
    MM_REFLEX: arm === "learning" ? "on" : undefined,
    MM_CAPTURE: arm === "learning" ? "worked" : undefined, // worked-example tier: the skill carries the redacted fix diff
  };
  const t0 = Date.now();
  const proc = Bun.spawn(["letta", "-p", PROMPT, "--new-agent", "--output-format", "json"], {
    cwd: ws, env: env as Record<string, string>, stdout: "pipe", stderr: "pipe",
  });
  const killer = setTimeout(() => { try { proc.kill(); } catch { /* */ } }, 300_000);
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  clearTimeout(killer);
  const stats = lastJson(stdout);
  const convId = stats && typeof stats === "object" && "conversation_id" in stats ? String(Reflect.get(stats, "conversation_id")) : "";
  const agentId = stats && typeof stats === "object" && "agent_id" in stats ? String(Reflect.get(stats, "agent_id")) : "";
  // GROUND TRUTH: we run the verifier ourselves — model claims don't count.
  const verify = Bun.spawnSync(["node", "tools/verify.mjs"], { cwd: ws });
  const success = verify.exitCode === 0;
  // STEPS: the mod's own experience log is the reliable tool-call count (headless json's
  // step_count is 0); count rows for THIS session's conversation id.
  const expPath = join(state, "experience.jsonl");
  let steps = 0;
  if (convId && existsSync(expPath)) for (const l of readFileSync(expPath, "utf8").split("\n")) if (l.includes(`"conv":"${convId}"`)) steps++;
  // COACHED: only reflex-surfaced hits for this conversation count (advisory tool_start hits don't).
  let coached = false;
  const dhPath = join(state, "defense-hits.jsonl");
  if (convId && existsSync(dhPath)) for (const l of readFileSync(dhPath, "utf8").split("\n")) if (l.includes(`"conv":"${convId}"`) && l.includes('"surfaced":true')) coached = true;
  // HARVEST (learning arm): graduated skills land in the throwaway session agent's memfs shelf
  // (letta-code sets MEMORY_DIR per session) and would die with it. A long-lived agent keeps its
  // shelf naturally; the fresh-agent-per-session design must carry it forward explicitly — copy
  // memfs skills into the persistent shelf, which .agents/skills surfaces next session.
  if (arm === "learning" && agentId) {
    const memShelf = join(process.env.HOME ?? "", ".letta", "lc-local-backend", "memfs", agentId, "memory", "skills");
    if (existsSync(memShelf)) for (const n of readdirSync(memShelf)) {
      if (existsSync(join(memShelf, n, "SKILL.md"))) cpSync(join(memShelf, n), join(shelf, n), { recursive: true, force: true });
    }
  }
  const skillsOnShelf = existsSync(shelf) ? readdirSync(shelf).filter((n) => existsSync(join(shelf, n, "SKILL.md"))).length : 0;
  const s: SessionStats = {
    arm, session, success,
    steps,
    durationMs: num(stats, "duration_ms") || Date.now() - t0,
    totalTokens: num(stats, "usage", "total_tokens"),
    skillsOnShelf, coached,
  };
  console.log(`  ${arm.padEnd(8)} S${session}  ${success ? "✓ green" : "✗ RED  "}  steps=${String(s.steps).padStart(2)}  ${(s.durationMs / 1000).toFixed(0)}s  tokens=${s.totalTokens}  shelf=${skillsOnShelf}${s.coached ? "  🧠coached" : ""}`);
  rmSync(ws, { recursive: true, force: true });
  if (arm === "control") { rmSync(state, { recursive: true, force: true }); rmSync(shelf, { recursive: true, force: true }); }
  return s;
}

console.log(`muscle-memory · COMPOUNDING PROOF — ${SESSIONS} sessions/arm, fresh agent every session\n`);
const persist = { state: mkdtempSync(join(tmpdir(), "mm-comp-learn-state-")), shelf: mkdtempSync(join(tmpdir(), "mm-comp-learn-shelf-")) };
const results: SessionStats[] = [];
for (let i = 1; i <= SESSIONS; i++) {
  results.push(await runSession("control", i, persist));
  results.push(await runSession("learning", i, persist));
}

const arm = (a: string) => results.filter((r) => r.arm === a);
const avg = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
const firstHalf = (rs: SessionStats[]) => rs.slice(0, Math.ceil(rs.length / 2));
const lastHalf = (rs: SessionStats[]) => rs.slice(Math.floor(rs.length / 2));
console.log(`\n── summary ──`);
for (const a of ["control", "learning"] as const) {
  const rs = arm(a);
  const eSteps = avg(firstHalf(rs).map((r) => r.steps)), lSteps = avg(lastHalf(rs).map((r) => r.steps));
  const eMs = avg(firstHalf(rs).map((r) => r.durationMs)), lMs = avg(lastHalf(rs).map((r) => r.durationMs));
  console.log(`  ${a.padEnd(8)}  green ${rs.filter((r) => r.success).length}/${rs.length} · steps early→late ${eSteps.toFixed(1)}→${lSteps.toFixed(1)} · duration ${(eMs / 1000).toFixed(0)}s→${(lMs / 1000).toFixed(0)}s`);
}
const out = `/tmp/mm-compounding-${Date.now()}.json`;
writeFileSync(out, JSON.stringify({ ts: Date.now(), sessions: SESSIONS, results, persist }, null, 2));
console.log(`  receipts: ${out}\n  learning-arm state kept for inspection: ${persist.state}\n  learning-arm shelf: ${persist.shelf}`);
