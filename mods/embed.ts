// muscle-memory · embed module — OPT-IN semantic routing + dedup over ONE skill-embedding index.
//
// Default OFF. With no embedding backend configured (env `MM_EMBED` unset), every live export degrades to
// `null` and the lexical router/dedup behave EXACTLY as before — the zero-dependency default is preserved.
// When configured, a single embedding index powers BOTH Voyager-style update-first routing (retrieval) and
// SemDeDup-style semantic dedup (clustering by cosine), the two capabilities the lexical router cannot do.
//
// The PURE functions (cosine, rankByVector, semanticDuplicatePairs, blendRoute, embedConfig) are unit-tested
// offline with stub vectors. `embedTexts`/`semanticRoute` are the thin guarded LIVE adapters (untested by
// unit tests, exactly like forkAuthor): any failure → null → caller falls back to lexical. Zero new deps —
// uses the Node ≥20 global `fetch` against any OpenAI-compatible `/embeddings` endpoint.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR, ensureDir, hash } from "./core";

export type EmbedConfig = { enabled: boolean; url: string; model: string; apiKey: string };

/** Resolve the opt-in embedding backend from env. Pure given `env`. Disabled unless `MM_EMBED` is truthy. */
export function embedConfig(env: NodeJS.ProcessEnv = process.env): EmbedConfig {
  const flag = String(env.MM_EMBED ?? "").trim().toLowerCase();
  const enabled = flag !== "" && flag !== "0" && flag !== "off" && flag !== "false";
  const url = String(env.MM_EMBED_URL ?? "").trim() || "https://api.openai.com/v1/embeddings";
  const model = String(env.MM_EMBED_MODEL ?? "").trim() || "text-embedding-3-small";
  const apiKey = String(env.MM_EMBED_KEY ?? env.MM_EMBED_API_KEY ?? env.OPENAI_API_KEY ?? "").trim();
  return { enabled, url, model, apiKey };
}

/** Cosine similarity. Returns 0 for empty / zero-norm / length-mismatched vectors. Pure. */
export function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Rank candidate skills by cosine to a query vector (descending). Pure. */
export function rankByVector(queryVec: number[], items: Array<{ name: string; vec: number[] }>): Array<{ name: string; sim: number }> {
  return items.map((it) => ({ name: it.name, sim: cosine(queryVec, it.vec) })).sort((a, b) => b.sim - a.sim);
}

/** SemDeDup-style near-duplicate pairs: every pair with cosine ≥ `threshold`, highest similarity first.
 * Catches semantic duplicates that exact/lexical token overlap misses. Pure. */
export function semanticDuplicatePairs(items: Array<{ name: string; vec: number[] }>, threshold = 0.86): Array<{ a: string; b: string; sim: number }> {
  const out: Array<{ a: string; b: string; sim: number }> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = cosine(items[i].vec, items[j].vec);
      if (sim >= threshold) out.push({ a: items[i].name, b: items[j].name, sim });
    }
  }
  return out.sort((x, y) => y.sim - x.sim);
}

export type BlendedMatch = { name: string; score: number; matched: number; description?: string; semSim: number };

/** Blend a lexical match list with semantic similarity so UPDATE-FIRST routing fires even when the lexical
 * router missed a semantically-equivalent skill (the 71%→higher lever). Conservative + additive:
 *   - existing lexical matches: `score *= (1 + semWeight*sim)` (agreement boosts the right target);
 *   - a semantically-strong skill (sim ≥ `injectAt`) absent from the lexical matches is INJECTED with a
 *     synthesized score above the routing threshold + `injectMatched` distinctive hits, so `pickUpdateTarget`
 *     can select it (lexical alone would have produced a duplicate).
 * With no `semRanked` (semantic disabled / backend failed) returns `lexMatches` UNCHANGED — lexical behavior
 * is preserved byte-for-byte. Pure. */
export function blendRoute<T extends { name: string; score: number; matched: number; description?: string }>(
  lexMatches: T[],
  semRanked: Array<{ name: string; sim: number }> | null | undefined,
  opts: { semWeight?: number; injectAt?: number; injectScore?: number; injectMatched?: number; descByName?: Record<string, string> } = {},
): Array<T | BlendedMatch> {
  if (!semRanked || semRanked.length === 0) return lexMatches;
  const semWeight = opts.semWeight ?? 1.0;
  const injectAt = opts.injectAt ?? 0.83;
  const injectScore = opts.injectScore ?? 20;
  const injectMatched = opts.injectMatched ?? 3;
  const simOf = new Map(semRanked.map((s) => [s.name, s.sim] as const));
  const byName = new Map<string, T | BlendedMatch>();
  for (const m of lexMatches) {
    const sim = simOf.get(m.name) ?? 0;
    const boosted = m.score * (1 + semWeight * sim);
    const semanticFloor = injectScore * (1 + semWeight * sim);
    byName.set(m.name, { ...m, score: sim >= injectAt ? Math.max(boosted, semanticFloor) : boosted, matched: sim >= injectAt ? Math.max(m.matched, injectMatched) : m.matched, semSim: sim });
  }
  for (const s of semRanked) {
    if (s.sim < injectAt || byName.has(s.name)) continue;
    byName.set(s.name, { name: s.name, score: injectScore * (1 + semWeight * s.sim), matched: injectMatched, description: opts.descByName?.[s.name] ?? "", semSim: s.sim });
  }
  return [...byName.values()].sort((a, b) => {
    const simA = "semSim" in a ? a.semSim : 0;
    const simB = "semSim" in b ? b.semSim : 0;
    return b.score - a.score || simB - simA;
  });
}

// ── Live, opt-in embedding backend (guarded; returns null on ANY failure — like forkAuthor). ──
const CACHE_PATH = join(STATE_DIR, "embed-cache.json");

function loadCache(): Record<string, number[]> {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    const parsed: unknown = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number[]>) : {};
  } catch { return {}; }
}

function saveCache(c: Record<string, number[]>): void {
  try { ensureDir(); writeFileSync(CACHE_PATH, JSON.stringify(c)); } catch { /* cache write is best-effort */ }
}

/** Parse an OpenAI-compatible embeddings response into exactly `n` numeric vectors, or null. Pure guard. */
function extractEmbeddings(body: unknown, n: number): number[][] | null {
  if (!body || typeof body !== "object" || !("data" in body)) return null;
  const data = body.data;
  if (!Array.isArray(data) || data.length !== n) return null;
  const out: number[][] = [];
  for (const row of data) {
    if (!row || typeof row !== "object" || !("embedding" in row)) return null;
    const emb: unknown = row.embedding;
    if (!Array.isArray(emb)) return null;
    const vec: unknown[] = emb;
    if (!vec.every((x): x is number => typeof x === "number")) return null;
    out.push(vec);
  }
  return out;
}

/** Embed texts via an OpenAI-compatible `/embeddings` endpoint, cached by content hash (offline-replayable).
 * Returns null when disabled, unconfigured, or on ANY failure — callers fall back to the lexical path. */
export async function embedTexts(texts: string[], cfg: EmbedConfig = embedConfig()): Promise<number[][] | null> {
  if (!cfg.enabled || !cfg.apiKey || texts.length === 0) return null;
  const cache = loadCache();
  const keyOf = (t: string): string => hash(`${cfg.model}\n${t}`);
  const missing = [...new Set(texts.filter((t) => !cache[keyOf(t)]))];
  if (missing.length > 0) {
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, input: missing }),
      });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      const vecs = extractEmbeddings(body, missing.length);
      if (!vecs) return null;
      missing.forEach((t, i) => { cache[keyOf(t)] = vecs[i]; });
      saveCache(cache);
    } catch { return null; }
  }
  const out: number[][] = [];
  for (const t of texts) { const v = cache[keyOf(t)]; if (!Array.isArray(v)) return null; out.push(v); }
  return out;
}

/** High-level LIVE helper: semantic ranking of candidate skills against a query, over ONE embedding call
 * (query + every candidate text). Null when disabled / failed. The single index reused for routing + dedup. */
export async function semanticRoute(query: string, items: Array<{ name: string; text: string }>, cfg: EmbedConfig = embedConfig()): Promise<Array<{ name: string; sim: number }> | null> {
  if (!cfg.enabled || items.length === 0) return null;
  const vecs = await embedTexts([query, ...items.map((i) => i.text)], cfg);
  if (!vecs) return null;
  const [q, ...rest] = vecs;
  return rankByVector(q, items.map((it, i) => ({ name: it.name, vec: rest[i] })));
}
