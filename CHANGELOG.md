# Changelog

All notable changes to `@letta-ai/muscle-memory`. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); this mod is pre-1.0, so the API may still change.

## [0.7.0] — 2026-06-29

Hermes-grade closing levers, native to Letta and all OPT-IN (default behavior unchanged): semantic
update-first routing, cheap-model review forks, and a MEASURED skill-efficacy loop.

### Added
- **Semantic routing + SemDeDup (opt-in, `MM_EMBED`).** One skill-embedding index re-ranks update-first
  candidates by meaning so a semantically-equivalent skill the lexical router missed routes to UPDATE
  (Voyager-style) instead of spawning a near-duplicate, and powers pairwise semantic dedup (SemDeDup). Uses
  the Node ≥20 global `fetch` against any OpenAI-compatible `/embeddings` endpoint, cached by content hash —
  **zero new dependencies**. Disabled by default → the lexical router is preserved byte-for-byte.
- **Cheap-model review forks (opt-in, `MM_REVIEW_MODEL`).** Routes the background distillation/review fork to
  a cheaper model (`updateLlmConfig`, conversation-scoped) and replays a compact digest — mirrors Hermes's
  `auxiliary.background_review`. Best-effort + guarded; unset → the fork stays on the parent model + warm cache.
- **Measured efficacy + non-regression guard (`mods/efficacy.ts`).** Scores how many of the failure classes the
  agent actually re-hits the current library covers, at what context cost (CPG), measured against the agent's
  own matured repair chains — not opinion. The autonomous prune now KEEPS a 0-use skill when removing it would
  drop coverage of a still-recurring failure (a "misevolution" guardrail: tidy-up can never lower coverage).

### Verification
- `npm run verify`: 80 unit tests (+14 across new `embed` / `efficacy` / `routing` / `review-runtime` suites)
  + bench + 150-seed eval + full-lifecycle demo, all green. New tests are offline/deterministic; the live
  embedding + fork-routing adapters are guarded (null / no-op on failure) exactly like the model-author fork.

### Notes
- The semantic layer is a routing/dedup PRECISION upgrade, not a new skill primitive — the wedge stays
  autonomy + maintenance. Maintenance-at-scale remains Bounded (see README Limitations).

## [0.6.0] — 2026-06-28

The "skill library that maintains itself" release. Observe → distill/update → quality-gate → graduate →
preflight → publish → prune, end to end, with receipts.

### Added
- **SOTA quality gate** (`sotaQualityGaps`) — proves a distilled skill is top-tier (concrete symptoms,
  diagnostic TELLs, safe-first procedure, verification), not just structurally valid. Regenerates sub-SOTA drafts.
- **Library audit** (`/muscle-memory audit`) — scores every skill in the library and flags what to upgrade.
- **Cross-shelf duplicate detection** — flags the same skill name diverging across the agent + global shelves
  (the anti-bloat the audit used to silently skip).
- **Publish supply chain** — `/muscle-memory publish` preflight (publishability score + tier), `publish stage`
  (sanitized review copy + provenance metadata), `publish approve` (promote to shared Custom Skills with a
  tamper guard), plus a best-effort live `letta skills list` visibility receipt. Never auto-publishes by default.
- **Adaptive distillation depth** — diversity-scaled directive + retry-enforced Pitfalls/Worked-examples so
  distilled skills carry concrete, breadth-preserving worked examples.

### Changed
- **Modular source** — split the single `mods/index.ts` into 9 layered single-responsibility modules
  (`core ← detect ← gate/publish/engram/lifecycle ← autopilot ← index`). Behavior-preserving; the package
  ships the source modules and the Letta CLI bundles them on load.
- **Intentional public API** — the surface is the mod entry plus a `__mm` test object, not every internal symbol.

### Fixed
- Security scanner no longer hard-blocks legitimate destructive workflow ops (e.g. `git push --force-with-lease`);
  safety for those is the SAFE-FIRST quality gate's job, which unblocked distilling git/deploy skills.
- Diverse failures of one class no longer collapse to a single fingerprint (worked-example cap raised).

### Packaging
- Hero GIF removed from the npm tarball (~1.2 MB → ~108 KB); it lives in the repo/README only.
- Declared `engines.node >= 20` and explicit `dependencies: {}` (zero runtime dependencies).

### Verification
- `npm run verify`: 41 unit tests + 5-axis bench + 150-seed eval + full-lifecycle demo, all green.
