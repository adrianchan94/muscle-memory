# Changelog

All notable changes to `@letta-ai/muscle-memory`. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); this mod is pre-1.0, so the API may still change.

## [Unreleased]

### Added
- **E5 · The Reflex (opt-in `MM_REFLEX=on`)** — learned scar tissue now fires **in context**, not in a
  log. When a tool FAILS and both the step signature and the error class match a learned repair chain
  (`coachOnFailure`, kind `fix`, observed ≥2×), the known fix is appended to the failing tool's own
  output as a `<system-reminder>` — the model reads the recovery in the same breath as the failure.
  Cache-safe by construction (per-turn tool-result content, never a system-prompt edit; grounded in
  letta-code's `tool_end → {result}` override contract). Double-corroborated (step AND error class) so
  a step failing a *new* way never gets stale advice; once per conversation per trigger; `avoid`-kind
  defenses remain `MM_GUARD`'s job. Each coaching writes a `surfaced: true` defense-hit receipt.
- **`/muscle-memory wins`** — the receipt-backed value ledger (`mods/wins.ts`): reps watched, skills
  earned (graduated/staged split), lessons folded into existing skills, repeat-failures recognized
  pre-action (with known-fix count), learned-skill invocations, env-noise kept out, and first-rep →
  first-skill time. Deterministic arithmetic over receipts the lifecycle already writes — the surface
  cannot claim anything a receipt doesn't back.
- **`scripts/bench-compounding.ts`** — the with/without compounding proof: fresh agent EVERY session
  in both arms; the only persistent artifact in the learning arm is muscle-memory's state + shelf
  (surfaced to native project-skill discovery via `.agents/skills`). Ground truth re-verified by the
  harness, never taken from model claims.
- **E4 · Semantic routing (hybrid recall/precision, opt-in `MM_NATIVE=passages`)** — the managed-skill
  index is mirrored into Letta archival memory as `mm:skill`-tagged passages (`syncSkillPassages`,
  refreshed at `conversation_close`), and update-first routing gains an embedding-search recall lane
  (`semanticSkillCandidates` → `client.agents.passages.search`). Embedding results carry rank order but
  no absolute score (verified against the live wire), so semantic evidence can only (a) **boost** a
  candidate the lexical scorer already found distinctive overlap for (`SEMANTIC_RANK_BONUS`,
  corroboration — a boost alone can never route an update), or (b) **park** an autonomous CREATE as a
  semantic-duplicate suspect (`park-semantic`) — the paraphrase-duplicate class lexical routing misses
  by construction (previously "0% semantic-only duplicate catch"). It never auto-patches on semantic
  evidence alone. The full decision head is the pure `routeSkill()`, consumed by `reviewAndAuthor` and
  measured by the eval so the benchmark cannot drift from shipped behavior. Fallback: without
  `MM_NATIVE=passages`, a client, or on any passages error, routing is byte-identical to lexical-only.
- **Canary calibration (rank → relevance)** — `passages.search` returns the k *nearest* passages with
  no score, and "nearest" is not "relevant": in a production-shaped index (index ≡ shelf) every novel
  query still nominates *some* nearest managed skill, so a rank-trusting suspect rule would park every
  novel CREATE once a few skills exist. `syncSkillPassages` now seeds two fixed **canary reference
  passages** (generic software work / the bare repair shape with no domain nouns) alongside the skill
  index; `calibrateSkillHits` marks each real hit `aboveCanary` iff it out-ranked every canary in the
  same window. A calibrated window trusts the highest-ranked on-shelf above-canary hit as the
  duplicate suspect at ANY rank (stale off-shelf hits are transparent); a hit below the canary line is
  never a suspect even at rank 0 — killing the novel-evidence over-park by construction. Uncalibrated
  windows (no canary present — e.g. sync hasn't run) keep the legacy conservative rank-0-only rule.
  Live receipts (Letta Cloud, 3 consecutive runs, byte-identical routes): decision quality vs class
  intent **lexical 7/16 → hybrid 15/16 (93.8%)**, up from 13/16 pre-calibration; all four novel cases
  still CREATE; the one standing miss (B1, alembic ↔ schema-change twin) is an embedding-model limit —
  the live embedder ranks generic-repair prose above the twin for that evidence, and the median-floor
  alternative that would flip it also over-parks two novel cases, so the strict floor stays. Offline
  eval remains 16/16; semantic recall@1 8/12 (unchanged — an embedder diagnostic, not the decision
  metric). Skill passages also embed the de-hyphenated name words (densest domain vocabulary).
- **`npm run eval:routing`** (now part of `verify`) — a 16-case labeled routing eval across four classes
  (strong-lexical dupes / paraphrase dupes / borderline corroboration / genuinely novel). Decision
  quality vs class intent on this deliberately failure-weighted set: **lexical-only 7/16 (43.8%) →
  hybrid 16/16 (100%)**, with zero regressions on the classes lexical already handled. Offline semantic
  neighbors are hand-labeled fixtures standing in for `passages.search` rank order; embedding quality
  itself is validated separately against a live Letta agent.
- **n=1 CREATE gate** (`multiInstanceSupport`, wired into the reflect lane) — a reflect-lane CREATE must
  be topically grounded in an evidence signal observed **≥2 distinct instances** (count or conversation
  spread). The aggregate items floor was not enough: an n=1 repair could ride in on an unrelated recurring
  workflow and become a command-shaped skill (live receipt: `recovering-from-npx-failures`, "Observed 1×
  across 1 session", created twice on consecutive days and retired twice). Parked creates never block a
  pattern permanently — a second observed instance changes the evidence signature and re-opens the route.
- **Structured evidence signals** — `buildCrossConversationEvidence` now returns `signals[]` (per-signal
  `label`/`kind`/`count`/`convs`) alongside the prose digest, so create-gates count instances instead of
  guessing from text.
- **Staged shelf in the CREATE dedupe surface** (`createDedupeSurface`) — manual `create` and
  `create_from_candidate` now dedupe against agent + global + **staged** shelves, so a near-duplicate of a
  not-yet-graduated skill routes to PATCH instead of spraying siblings.
- **Retired-skill quarantine in `dedupCheck`** — near-duplicates of *retired* skills under a **different
  name** are refused with a restore/absorb hint (`retiredSkillBlocker` already caught same-name recreates;
  this catches renamed clones).
- **`test/create-gates.test.ts`** — deterministic regression suite for the duplicate-create class: the
  n=1 hole, instance borrowing from unrelated signals, ungrounded creates, staged-sibling dedupe, and
  retired-clone quarantine.

### Changed
- **Hermetic reflect-lane testing** — `runReflectiveReview` now accepts injectable `dirs`/`stagedDir`
  (same pattern as `experience`). The n=1 wiring test previously scanned the HOST's real skill shelves
  (`~/.letta/skills`): on a populated machine the ambiguous-route guard fired before the n=1 gate and
  the test failed — green only on an empty shelf. The test now pins empty tmp shelves.
- **`HIGH_SIGNAL_TOOL_SET` is configuration, not hardcoded vocabulary** — the shipped set contained
  deployment-specific tool names from the authors' own rigs. It now defaults to empty and is populated
  via `MM_HIGH_SIGNAL_TOOLS` (comma-separated tool names); configured tools get a stable arg-shape
  fingerprint template. The per-tool template special-cases for those private tools were removed.

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
