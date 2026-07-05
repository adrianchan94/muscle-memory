// muscle-memory · RERANK V2 LIVE BENCH — re-materializes the evaporated prototype result with
// durable, committed receipts. Runs BOTH the 16-case dev set (does 16/16 reproduce?) and the
// 8-case sealed blind holdout (does it generalize?), through the PRODUCTION routeSkillReranked.
//
// Prereg: docs/prereg-reranker-holdout.md — judges, criteria, exclusion rules, and claim
// language are FROZEN there. This script COMPUTES the prereg verdict; nobody narrates it.
//
// Lanes per case (embeddings fetched once, cached, shared across judge lanes):
//   lexical        routeSkill(lex, [])                — floor
//   canary hybrid  routeSkill(lex, hits@3)            — shipped 15/16 baseline
//   rerank strong1 routeSkillReranked(.., glm-5.2)    — prereg primary, run 1
//   rerank strong2 routeSkillReranked(.., glm-5.2)    — stability duplicate
//   rerank cheap   routeSkillReranked(.., glm-4.5-air)— caveat 6.2a
//
// Requirements: LETTA_API_KEY (Cloud embeddings) + ZAI_API_KEY (judges).
// Receipts: receipts/rerank-live-<ts>.json (IN-REPO — the /tmp evaporation bug dies here).
// Run: bun scripts/bench-rerank-live.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseJudgement, rerankUserPrompt, routeSkill, routeSkillReranked, searchSkills,
  RERANK_SYSTEM_PROMPT, type JudgeFn,
} from "../mods/autopilot";
import { canaryPassages, parseSkillHits, semanticSkillCandidates, skillPassageTag, skillPassageText, SKILL_PASSAGE_TAG, reachFn } from "../mods/engram";
import { CASES, intentSatisfied, materialize, type RoutingCase } from "../test/routing-cases";
import { HOLDOUT_CASES } from "../test/routing-holdout";

const STRONG_MODEL = "glm-5.2";
const CHEAP_MODEL = "glm-4.5-air";
const ZAI_URL = "https://api.z.ai/api/paas/v4/chat/completions";

if (!process.env.LETTA_API_KEY) { console.error("LETTA_API_KEY not set"); process.exit(2); }
if (!process.env.ZAI_API_KEY) { console.error("ZAI_API_KEY not set"); process.exit(2); }
process.env.MM_NATIVE = "passages";

async function loadClientCtor(): Promise<new (opts?: { apiKey?: string | null }) => unknown> {
  const candidates = [
    process.env.LETTA_CLIENT_PATH,
    "@letta-ai/letta-client",
    `${process.env.HOME}/.local/lib/node_modules/@letta-ai/letta-code/node_modules/@letta-ai/letta-client/index.js`,
    "/opt/homebrew/lib/node_modules/@letta-ai/letta-code/node_modules/@letta-ai/letta-client/index.js",
  ].filter((c): c is string => !!c);
  for (const spec of candidates) {
    try {
      const mod: unknown = await import(spec);
      if (mod && typeof mod === "object" && "Letta" in mod && typeof mod.Letta === "function") return mod.Letta as never;
      if (mod && typeof mod === "object" && "default" in mod && typeof mod.default === "function") return mod.default as never;
    } catch { /* next */ }
  }
  throw new Error("letta-client not resolvable — set LETTA_CLIENT_PATH");
}

// ── Judge over ZAI chat completions. Raw text + latency recorded for the receipt. Errors throw —
// routeSkillReranked catches them (graceful fallback), and we ALSO tally them per prereg. ──
type JudgeTrace = { model: string; caseId: string; skill: string; ms: number; raw: string; parsed: { same_job: boolean; confidence: number } | null; error?: string };
const traces: JudgeTrace[] = [];
let judgeErrors: Record<string, number> = {};

// Transport hardening (2026-07-05, after run 1783255233087 BLOCKED itself on 42x http 429):
// serial pacing + exponential backoff on 429/5xx. PURELY transport — prompt, threshold, models
// and decision logic are prereg-frozen and untouched; run 1 leaked zero judge verdicts.
const PACE_MS = 1_500;
const BACKOFFS = [4_000, 10_000, 25_000, 60_000];
let lastCall = 0;
async function paced(): Promise<void> {
  const wait = lastCall + PACE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

function makeJudge(model: string, caseId: () => string): JudgeFn {
  return async (evidence, skill) => {
    const t0 = Date.now();
    let lastErr = "";
    for (let attempt = 0; attempt <= BACKOFFS.length; attempt++) {
      try {
        await paced();
        const res = await fetch(ZAI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZAI_API_KEY}` },
          body: JSON.stringify({
            model, temperature: 0, max_tokens: 200,
            messages: [
              { role: "system", content: RERANK_SYSTEM_PROMPT },
              { role: "user", content: rerankUserPrompt(evidence, skill.name, skill.description) },
            ],
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = `http ${res.status}`;
          if (attempt < BACKOFFS.length) { await new Promise((r) => setTimeout(r, BACKOFFS[attempt])); continue; }
          throw new Error(lastErr);
        }
        if (!res.ok) throw new Error(`http ${res.status}`);
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = String(data?.choices?.[0]?.message?.content ?? "");
        const parsed = parseJudgement(raw);
        traces.push({ model, caseId: caseId(), skill: skill.name, ms: Date.now() - t0, raw: raw.slice(0, 500), parsed });
        if (!parsed) { judgeErrors[model] = (judgeErrors[model] ?? 0) + 1; }
        return parsed;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        if (/http (429|5\d\d)/.test(lastErr) && attempt < BACKOFFS.length) continue;
        break;
      }
    }
    traces.push({ model, caseId: caseId(), skill: skill.name, ms: Date.now() - t0, raw: "", parsed: null, error: lastErr });
    judgeErrors[model] = (judgeErrors[model] ?? 0) + 1;
    throw new Error(lastErr);
  };
}

const LettaCtor = await loadClientCtor();
const client: unknown = new LettaCtor();
const createAgent = reachFn(client, ["agents", "create"]);
const deleteAgent = reachFn(client, ["agents", "delete"]);
const createPassage = reachFn(client, ["agents", "passages", "create"]);
if (!createAgent || !deleteAgent || !createPassage) { console.error("client missing agents/passages surface"); process.exit(2); }

function fieldStr(o: unknown, k: string): string {
  return o && typeof o === "object" && k in o && typeof Reflect.get(o, k) === "string" ? String(Reflect.get(o, k)) : "";
}

const ALL: Array<{ set: "dev" | "holdout"; c: RoutingCase }> = [
  ...CASES.map((c) => ({ set: "dev" as const, c })),
  ...HOLDOUT_CASES.map((c) => ({ set: "holdout" as const, c })),
];

const created: unknown = await createAgent({ name: `mm-rerank-bench-${Date.now()}`, description: "muscle-memory rerank v2 live bench — safe to delete" });
const agentId = fieldStr(created, "id");
if (!agentId) { console.error("agent create returned no id"); process.exit(2); }
console.log(`bench agent: ${agentId}`);

type Row = {
  id: string; set: string; cls: string;
  lex: string; canary: string; strong1: string; strong2: string; cheap: string;
  lexOk: boolean; canaryOk: boolean; strong1Ok: boolean; strong2Ok: boolean; cheapOk: boolean;
  strongTarget: string | null; conf1: number | null; conf2: number | null; confCheap: number | null;
  searchMs: number; liveTop: string[];
};
const rows: Row[] = [];

try {
  // Union shelf: every skill from BOTH sets competes in one index + canaries (production shape).
  const seen = new Set<string>();
  let seeded = 0;
  for (const { c } of ALL) for (const [name, desc] of c.shelf) {
    if (seen.has(name)) continue; seen.add(name);
    await createPassage(agentId, { text: skillPassageText(name, desc), tags: [SKILL_PASSAGE_TAG, skillPassageTag(name)] });
    seeded++;
  }
  for (const cp of canaryPassages()) await createPassage(agentId, { text: cp.text, tags: [SKILL_PASSAGE_TAG, skillPassageTag(cp.name)] });
  console.log(`seeded union index: ${seeded} skills + ${canaryPassages().length} canaries (dev+holdout compete together)`);

  let currentCase = "";
  const strong1 = makeJudge(STRONG_MODEL, () => `${currentCase}#s1`);
  const strong2 = makeJudge(STRONG_MODEL, () => `${currentCase}#s2`);
  const cheap = makeJudge(CHEAP_MODEL, () => `${currentCase}#c`);

  for (const { set, c } of ALL) {
    currentCase = c.id;
    const t0 = Date.now();
    const hits3 = await semanticSkillCandidates(client, agentId, c.evidence, 3);   // shipped canary lane
    const hits12 = await semanticSkillCandidates(client, agentId, c.evidence, 12); // wide rerank recall
    const searchMs = Date.now() - t0;
    const dir = materialize(c.shelf);
    const onShelf = (n: string) => c.shelf.some(([name]) => name === n);
    const descOf = (n: string) => c.shelf.find(([name]) => name === n)?.[1] ?? "";
    const lexical = searchSkills([dir], c.evidence, 3);

    const dl = routeSkill(lexical, [], onShelf);
    const dc = routeSkill(lexical, hits3, onShelf);
    const r1 = await routeSkillReranked(c.evidence, lexical, hits12, onShelf, descOf, strong1);
    const r2 = await routeSkillReranked(c.evidence, lexical, hits12, onShelf, descOf, strong2);
    const rc = await routeSkillReranked(c.evidence, lexical, hits12, onShelf, descOf, cheap);

    // For B-class intent, parking must cite the CORRECT twin — a park on the wrong skill is a miss.
    const strongParkOk = c.cls !== "B-paraphrase-dupe" || r1.route !== "park-semantic" || r1.suspect === c.shelf[0]?.[0];
    rows.push({
      id: c.id, set, cls: c.cls,
      lex: dl.route, canary: dc.route, strong1: r1.route, strong2: r2.route, cheap: rc.route,
      lexOk: intentSatisfied(c, dl.route, dl.target?.name ?? null),
      canaryOk: intentSatisfied(c, dc.route, dc.target?.name ?? null),
      strong1Ok: intentSatisfied(c, r1.route, r1.target?.name ?? null) && strongParkOk,
      strong2Ok: intentSatisfied(c, r2.route, r2.target?.name ?? null),
      cheapOk: intentSatisfied(c, rc.route, rc.target?.name ?? null),
      strongTarget: r1.suspect ?? r1.target?.name ?? null,
      conf1: r1.judged?.confidence ?? null, conf2: r2.judged?.confidence ?? null, confCheap: rc.judged?.confidence ?? null,
      searchMs, liveTop: hits12.slice(0, 4).map((h) => h.name),
    });
    console.log(`  ${c.id.padEnd(24)} [${set}] lex=${dl.route.padEnd(13)} canary=${dc.route.padEnd(13)} rerank=${r1.route.padEnd(13)} conf=${r1.judged?.confidence ?? "-"} → ${r1.suspect ?? r1.target?.name ?? "-"}`);
  }
} finally {
  try { await deleteAgent(agentId); console.log(`bench agent deleted: ${agentId}`); }
  catch (e) { console.error(`CLEANUP FAILED — delete agent ${agentId} manually:`, e); }
}

// ── PREREG VERDICT (computed, not narrated) ──
const dev = rows.filter((r) => r.set === "dev");
const hold = rows.filter((r) => r.set === "holdout");
const n = (xs: Row[], k: keyof Row) => xs.filter((r) => r[k] === true).length;
const b1 = dev.find((r) => r.id === "B1-migration-paraphrase");
const holdA = hold.filter((r) => r.cls === "A-strong-lexical");
const holdB = hold.filter((r) => r.cls === "B-paraphrase-dupe");
const holdD = hold.filter((r) => r.cls === "D-novel");
const stability = rows.every((r) => r.strong1 === r.strong2);
const totalErrs = Object.values(judgeErrors).reduce((a, b) => a + b, 0);
const blocked = (judgeErrors[STRONG_MODEL] ?? 0) > 2;

const criteria = {
  dev_rerank_ge_15: n(dev, "strong1Ok") >= 15,
  dev_B1_parked_correct: !!b1 && b1.strong1 === "park-semantic" && b1.strongTarget === "handling-broken-schema-changes",
  holdout_A: `${n(holdA, "strong1Ok")}/${holdA.length}`, holdout_A_pass: n(holdA, "strong1Ok") === holdA.length,
  holdout_B: `${n(holdB, "strong1Ok")}/${holdB.length}`, holdout_B_pass: n(holdB, "strong1Ok") >= 3,
  holdout_D: `${n(holdD, "strong1Ok")}/${holdD.length}`, holdout_D_pass: n(holdD, "strong1Ok") === holdD.length,
  stability_identical_runs: stability,
  judge_errors: judgeErrors, blocked,
};
const pass = !blocked && criteria.dev_rerank_ge_15 && criteria.dev_B1_parked_correct && criteria.holdout_A_pass && criteria.holdout_B_pass && criteria.holdout_D_pass;

console.log(`\n════ RERANK V2 LIVE — prereg verdict ════`);
console.log(`  DEV  (16): lexical ${n(dev, "lexOk")}/16 · canary ${n(dev, "canaryOk")}/16 · rerank-strong ${n(dev, "strong1Ok")}/16 · rerank-cheap ${n(dev, "cheapOk")}/16`);
console.log(`  HOLD (8) : lexical ${n(hold, "lexOk")}/8 · canary ${n(hold, "canaryOk")}/8 · rerank-strong ${n(hold, "strong1Ok")}/8 · rerank-cheap ${n(hold, "cheapOk")}/8`);
console.log(`  B1 parked on correct twin: ${criteria.dev_B1_parked_correct} · holdout A ${criteria.holdout_A} B ${criteria.holdout_B} D ${criteria.holdout_D}`);
console.log(`  stability (strong x2 identical): ${stability} · judge errors: ${JSON.stringify(judgeErrors)} (${totalErrs} total)`);
console.log(`  VERDICT: ${blocked ? "BLOCKED (judge error budget exceeded)" : pass ? "PASS — prereg criteria met" : "FAIL — report as-is, no external claim"}`);

mkdirSync(join(import.meta.dir, "..", "receipts"), { recursive: true });
const out = join(import.meta.dir, "..", "receipts", `rerank-live-${Date.now()}.json`);
writeFileSync(out, JSON.stringify({
  ts: new Date().toISOString(), agentId, prereg: "docs/prereg-reranker-holdout.md",
  judges: { strong: STRONG_MODEL, cheap: CHEAP_MODEL, endpoint: ZAI_URL }, criteria, pass, rows, traces,
}, null, 2));
console.log(`  receipts (IN-REPO, commit them): ${out}`);
process.exit(blocked ? 18 : pass ? 0 : 1);
