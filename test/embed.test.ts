// muscle-memory · embed tests — the PURE semantic-routing core (cosine, ranking, SemDeDup, blend, config).
// Offline + deterministic with stub vectors; the live fetch backend (embedTexts/semanticRoute) is guarded
// like forkAuthor and not exercised here. Proves the OPT-IN semantic layer is correct AND that with the
// backend disabled the lexical path is preserved byte-for-byte.
import { test, expect } from "bun:test";
import { cosine, rankByVector, semanticDuplicatePairs, blendRoute, embedConfig } from "../mods/embed";

test("cosine: identical=1, orthogonal=0, length-mismatch/empty/zero-norm=0", () => {
  expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  expect(cosine([1, 2, 3], [1, 2])).toBe(0);
  expect(cosine([], [])).toBe(0);
  expect(cosine([0, 0], [1, 1])).toBe(0);
});

test("rankByVector orders candidates by cosine to the query (nearest first)", () => {
  const ranked = rankByVector([1, 0, 0], [{ name: "far", vec: [0, 1, 0] }, { name: "near", vec: [0.9, 0.1, 0] }, { name: "mid", vec: [0.6, 0.6, 0] }]);
  expect(ranked[0].name).toBe("near");
  expect(ranked[ranked.length - 1].name).toBe("far");
});

test("semanticDuplicatePairs flags near-duplicates ABOVE threshold only (SemDeDup)", () => {
  const items = [{ name: "a", vec: [1, 0, 0] }, { name: "a-twin", vec: [0.99, 0.01, 0] }, { name: "b", vec: [0, 1, 0] }];
  const pairs = semanticDuplicatePairs(items, 0.9);
  expect(pairs.length).toBe(1);
  expect(new Set([pairs[0].a, pairs[0].b])).toEqual(new Set(["a", "a-twin"]));
});

test("blendRoute: null/empty semRanked returns the lexical matches UNCHANGED (zero-dep default preserved)", () => {
  const lex = [{ name: "x", description: "d", dir: "/d", score: 10, matched: 2 }];
  expect(blendRoute(lex, null)).toBe(lex);
  expect(blendRoute(lex, [])).toBe(lex);
});

test("blendRoute INJECTS a semantically-strong skill the lexical router missed (the 71%→ routing lever)", () => {
  const lex = [{ name: "lexical-only", description: "d", dir: "/d", score: 8, matched: 2 }];
  const sem = [{ name: "semantic-match", sim: 0.93 }, { name: "lexical-only", sim: 0.2 }];
  const blended = blendRoute(lex, sem);
  const injected = blended.find((m) => m.name === "semantic-match");
  expect(injected).toBeTruthy();
  expect(injected!.score).toBeGreaterThan(18);            // above the routing threshold → pickUpdateTarget can select it
  expect(injected!.matched).toBeGreaterThanOrEqual(3);    // enough distinctive hits for SEARCH_DISTINCT_MIN
  expect(blended[0].name).toBe("semantic-match");         // the strong semantic match outranks the weak lexical one
});

test("blendRoute boosts a lexical match that ALSO has high semantic similarity (agreement breaks ties)", () => {
  const lex = [{ name: "a", description: "", dir: "/d", score: 10, matched: 3 }, { name: "b", description: "", dir: "/d", score: 10, matched: 3 }];
  const blended = blendRoute(lex, [{ name: "a", sim: 0.9 }, { name: "b", sim: 0.1 }]);
  expect(blended[0].name).toBe("a");
});

test("blendRoute gives a high-semantic existing lexical match the matched floor needed for update-first", () => {
  const lex = [{ name: "debugging-failing-tests", description: "", dir: "/d", score: 19, matched: 2 }];
  const blended = blendRoute(lex, [{ name: "debugging-failing-tests", sim: 0.95 }]);
  expect(blended[0].name).toBe("debugging-failing-tests");
  expect(blended[0].score).toBeGreaterThan(18);
  expect(blended[0].matched).toBeGreaterThanOrEqual(3);
});

test("blendRoute gives a high-semantic weak lexical match the same score floor as a semantic injection", () => {
  const lex = [{ name: "safe-batch-rename-files", description: "", dir: "/d", score: 6, matched: 1 }];
  const blended = blendRoute(lex, [{ name: "safe-batch-rename-files", sim: 0.75 }], { injectAt: 0.7 });
  expect(blended[0].name).toBe("safe-batch-rename-files");
  expect(blended[0].score).toBeGreaterThan(18);
  expect(blended[0].matched).toBeGreaterThanOrEqual(3);
});

test("embedConfig: disabled unless MM_EMBED is truthy; reads url/model/key when enabled", () => {
  expect(embedConfig({}).enabled).toBe(false);
  expect(embedConfig({ MM_EMBED: "off" }).enabled).toBe(false);
  expect(embedConfig({ MM_EMBED: "0" }).enabled).toBe(false);
  const c = embedConfig({ MM_EMBED: "1", MM_EMBED_MODEL: "m", MM_EMBED_KEY: "k", MM_EMBED_URL: "http://x/v1/embeddings" });
  expect(c.enabled).toBe(true);
  expect(c.model).toBe("m");
  expect(c.apiKey).toBe("k");
  expect(c.url).toBe("http://x/v1/embeddings");
});
