# muscle-memory v2 · LLM Reranker (the live 16/16 fix)

**Status (updated 2026-07-05): BUILT + RE-MATERIALIZED WITH DURABLE RECEIPTS.** The original
/tmp prototype result reproduced AND generalized under prereg discipline
(`docs/prereg-reranker-holdout.md`, sealed blind holdout, judges pinned, criteria computed by
the instrument — `scripts/bench-rerank-live.ts`, receipts committed in `receipts/`):

| Lane | Dev 16 | Sealed holdout 8 |
|---|---|---|
| lexical-only | 7/16 | 4/8 |
| canary hybrid (shipped, live) | 14/16 | 7/8 |
| **rerank · glm-5.2 ×2 (stability: byte-identical)** | **16/16** | **8/8** |
| **rerank · glm-5-turbo (cheap, caveat 6.2a)** | **16/16** | **8/8** |

B1 parked on the correct twin @0.95 (prototype: 0.85). Holdout HD2 — an adversarial
domain-adjacent trap authored blind — fooled the canary lane (over-park) and was REJECTED by
the judge @0.95: the reranker fixed the exact miss class it exists for, on a case sealed before
any reranker code existed. Judge errors: 0. Production fn: `routeSkillReranked` (autopilot.ts),
18 deterministic decision-tree tests; the bench calls the production head.
**Date:** 2026-07-04 (design) · 2026-07-05 (build + re-materialization)
**Owner:** Adrian (with ULTRON / Kev / Mack)
**Sequencing:** v2 follow-up. Do NOT bundle into PR #45 (canary routing). Ship after #45
resolves + Cameron's operational feedback. NOTE (2026-07-05): miner hygiene (synthetic-tape
gate + shelf dedup, `test/miner-hygiene.test.ts`) landed AHEAD of the reranker in this branch —
routing precision is worthless if the evidence stream is contaminated; the learner must never
mine its own harness.

---

## 1. What it is (one line)

A **precision reranker stage** added after semantic recall: once the mod finds candidate existing skills for a new lesson, an LLM judges each *(evidence, skill)* pair on **"same job-to-be-done?"** — reading both texts together — and only parks/updates on a confident yes. It is the SOTA-endorsed answer ("hybrid retrieve → cross-encoder/LLM rerank") applied to skill routing.

## 2. The result (live, real Letta Cloud embeddings + real LLM judge)

Perfect split — the gold that floor-loosening and HyDE structurally could not reach:

| Lane | B-paraphrase parked /6 | D-novel stayed CREATE /4 | B1 (alembic↔schema)? |
|---|---|---|---|
| raw semantic (canary) | 4 | 4 | ✗ (create) |
| + floor-loosen | 5 | **2** ❌ | ✓ wrong twin |
| + HyDE query expansion | 5 | **2** ❌ | ✓ |
| **+ LLM reranker** | **6 — all correct twin** | **4** ✅ | **✓ conf 0.85** |

= **16/16 decision quality, live.** Wide, decisive confidence margins (not borderline):
- **B1** `alembic upgrade failed` vs `handling-broken-schema-changes` → `same_job=true, conf=0.85` → parked on the **right** twin.
- **D1 webgl** context loss vs `debugging-failing-pytest-runs` → `same_job=false, conf=0.98` → CREATE.
- **D4 sqlite/NFS** vs `reconciling-dependency-manifests` → `same_job=false, conf=0.98` → CREATE.
- All six B paraphrases parked citing the correct existing skill; all four novels stayed CREATE.

## 3. Why it works where every other lever failed (the key insight)

Floor-loosening and HyDE both move the **recall boundary** — so they trade a paraphrase catch for novel over-parks (+1 B / −2 D every time). Under the raw embedder, **B1's evidence is informationally identical to a novel CREATE** (both generic-repair-shaped, domain nouns absent from any skill) — so no recall-boundary tweak can separate them without collateral.

The reranker adds an **orthogonal precision stage**: it judges each candidate pair *independently* on job-match. "Is alembic a database-schema-migration job?" → yes. "Is webgl-context-loss a pytest job?" → no. That asymmetry is why it **gains B1 while rejecting the novels' false candidates** — the embedder never had to get smarter; we added a reader that sees both texts at once. A bi-encoder embeds query and doc separately (can't reason about the pair); a cross-encoder / LLM reranker reads them jointly. That is the whole game.

## 4. The method (reproducible — this is exactly what the prototype did)

Two stages:

**Stage A — candidate recall (existing semantic lane, canary-calibrated):**
- Embed-search the `mm:skill` passage index for the evidence.
- Take the top-K on-shelf candidates (canaries stripped). Do NOT gate on the canary floor here — recall hands the reranker a wider set; precision is the reranker's job. (In the prototype: `top_k=12`, keep top ~5 on-shelf, with each skill's name+description.)

**Stage B — precision judge (the reranker, LLM pointwise):**
For the top candidate (or top-N), one LLM call:

- **System:** *"You are a precision gate for a skill library. Decide whether a coding-session incident should be filed UNDER an existing skill (same underlying job-to-be-done, so the skill's procedure would actually resolve THIS incident) or logged as a NEW skill. Be strict: same_job=true ONLY if a good engineer would say 'that existing skill already covers this.' Reply STRICT JSON only: {\"same_job\": true|false, \"confidence\": 0.0-1.0}."*
- **User:** `Incident: <evidence>\nExisting skill — name: <name>; description: <desc>\nSame job?`
- **Decision:** park/update only if `same_job && confidence >= 0.6`; else CREATE. (0.6 threshold held cleanly; margins were 0.85–0.98 so it's not sensitive.)

"Don't overthink" (2025 reranking research): keep it **pointwise / minimal-reasoning**, not heavy chain-of-thought. Setwise if judging N>1.

## 5. How it plugs into muscle-memory

- **Where:** a new precision step inside `routeSkill()` / `applySemanticEvidence()` (autopilot.ts). After semantic recall produces on-shelf candidates, run the reranker to confirm the suspect before `park-semantic` / update; otherwise CREATE.
- **Model access:** the reflect lane already has a model via `ctx.conversation.fork` (the reflective-review author). Reuse it — **zero new dependency**.
- **Opt-in:** gate behind a flag (e.g. `MM_NATIVE=passages,rerank` or `MM_RERANK=on`). Off → current canary behavior (15/16). Never on the hot path — reflect lane only.
- **Relationship to canary:** canary widens recall honestly (nearest ≠ relevant); the reranker sharpens precision (nearest ≠ same-job). They compose — keep both.

## 6. Honest caveats (status at 2026-07-05 re-materialization)

1. **Cost + latency:** one LLM call per reflect *when a candidate exists*. Off the hot path, so acceptable — but real. glm-5.2 thinks 10–40s/call; glm-5-turbo is fast and matched it 24/24.
2. **Nondeterminism:** ~~unproven~~ **RESOLVED for this set:** (a) cheap model (glm-5-turbo) held every margin, 24/24; (b) strong judge ×2 byte-identical routes; (c) the deterministic fixture eval (`test/rerank.test.ts`, fake judges) stays the CI gate — the live judge is a quality booster, never a CI dependency.
3. **Prototype evaporated:** ~~receipts gone~~ **RESOLVED:** durable bench (`scripts/bench-rerank-live.ts`) + committed receipts (`receipts/rerank-live-1783256190811.json`, PASS; plus the honest BLOCKED run `1783255233087` that self-refused on a dead judge).
4. **Cross-encoder alternative:** unchanged — LLM-via-fork remains the pragmatic zero-dep cut.
5. **NEW — n is still small:** 24 labeled cases (16 dev + 8 sealed holdout), one embedder, one judge family. The holdout answers *dev-set exhaustion*, not scale. Next holdout must be authored by a different referee (rotate: ULTRON), and the burn rule applies: this holdout is now SPENT for any future lever tuning.
6. **NEW — judge-family provenance:** judges rode the ZAI coding-plan anthropic-compat lane, which REMAPS unservable model ids silently (`glm-4.5-air`→`glm-4.7`). Receipts record the SERVED model per call; any future judge swap must re-probe the mapping.

## 7. Sequencing / the queue

```
PR #45   canary routing (semantic + canary)   — OPEN, offline 16/16, live 15/16
  →      miner hygiene (synthetic-tape gate)   — DONE 2026-07-05 in this branch: the learner
                                                 must never mine its own harness (observed live:
                                                 mmreflex nonces counted 11× as experience)
  →      incremental-edit (surgical patch)     — Cameron's edit-quality ask; design in mm-incremental-edit-design.md
  →      reranker v2 (THIS doc)                — BUILT + re-materialized 2026-07-05; ships after
                                                 #45 resolves + Cameron's operational feedback
```
All separate layers, one tight PR at a time. Miner hygiene = "is this evidence real"; reranker = "which skill"; incremental-edit = "how to edit it." Ship shaped by Cameron's operational traces, not all at once.

## 8. Cameron framing (when it eventually ships)

Not "we hit 16/16" (a 16-case set). Frame it as: *the semantic lane now confirms a duplicate suspect by reading the lesson and the candidate skill together (job-to-be-done), so paraphrase duplicates get folded in while genuinely novel lessons still create — precision without over-parking.* Aligns with the SOTA hybrid-retrieve → rerank pattern and directly serves the refine-existing-over-create direction.

---
*Receipts of record: live run showed B 6/6 (all correct twin) + D 4/4 create; confidences 0.85–0.98; B1 flipped to handling-broken-schema-changes @ 0.85. Method above reproduces it.*
