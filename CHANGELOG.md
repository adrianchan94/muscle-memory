# Changelog

All notable changes to `@adrianchan94/muscle-memory`. Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Release candidates remain reviewable and reversible until the final `1.0.0` release.

## [Unreleased]

- Final `1.0.0` tag, GitHub release, `main` merge, and npm publication remain separately gated.

## [1.0.0-rc.3] — 2026-08-05

### Release-candidate purpose
- Establishes the author-owned V1 release candidate under `@adrianchan94/muscle-memory` and `github.com/adrianchan94/muscle-memory`.
- Reframes the public surface around the shipped causal loop: one-skill-or-abstain prescription, resumable possessions, honest closeout, evidence-aware roster review, narrow instrument-owned verification, update-first learning, staged/reversible lifecycle, history mining, compaction reflection, sanitized squad transfer, and Desktop catalog sync.
- Keeps research claims bounded and points readers to the canonical [Muscle Memory V1 Research](https://muscle-memory-v1-research.vercel.app/) ledger.
- This RC is a new candidate. It does not overwrite the historical `e2b9c4a1…` / cold-review v6 baseline and cannot inherit that baseline's seal.

### Fixed — clean-Linux CI
- Resolves the shared global skill shelf on every call instead of freezing it at module load. The captured constant made the shelf depend on which file imported `mods/core` first, so a test that set `MM_GLOBAL_SKILLS_DIR` at module scope silently redirected the runtime for every file loaded afterwards — order-dependent, and therefore green on macOS and red on clean Linux.
- Stops `test/graduation-truth.test.ts` leaking its sandbox env into every test file that loads after it.
- Binds the packed-artifact test to the shipped `package.json` version instead of a hard-coded literal that rots on each candidate bump.
- Corrects a stale roster assertion that demanded the zero-signal disclosure footer even when nothing was hidden; the shipped behaviour deliberately suppresses `hidden: 0` as noise.

### Fixed — privacy
- The publish sanitizer hardcoded the author's local username and personal name into the shipped package in order to redact them. Those literals are removed. Operator identity is derived at runtime from `userInfo()` and git config, which already ran on the next line — so redaction now covers **every** user instead of one, and no personal handle ships to consumers.

### Added — research instrument kit
- `docs/research/STUDY-CONTRACT.md` — the eight fields every measurement carries, and the three-level reproducibility table (package reproducible · minimal fixture reproducible · full program auditable but not publicly reproducible).
- `docs/research/protocol.schema.json` — machine-checkable preregistration requiring exact model identifier, provider and date, sampling parameters, system-prompt hash, tool schema hash, and verifier version.
- `docs/research/fixtures/four-events/run.mjs` — deterministic, no-provider fixture separating presence, prescription, execution, and verified outcome. Permanently labelled: it demonstrates the instrument, it does not reproduce the sealed findings.
- `CITATION.cff` — cites the research record under the title *Knowing Is Not Doing*.

### Research surface alias remap
- Canonical live research URL is now `https://muscle-memory-v1-research.vercel.app/` (report title: *Knowing Is Not Doing…*; product name unchanged). `muscle-memory-story.vercel.app` remains a temporary alias to the same production deploy. July (H) history stays on the superseded deployment URL.

### Owner-route release prep
- Migrates package identity from `@letta-ai/muscle-memory` to author-owned `@adrianchan94/muscle-memory` (npm publish still separately gated / not authorized by this branch).
- Points repository / homepage / bugs metadata at `adrianchan94/muscle-memory`.
- Fixes the canonical `muscle_memory_prescribe` onboarding example to the dedicated two-field contract (`task` + `gap_observed` only).
- Points public research surfaces at the live V1 research site (`muscle-memory-v1-research.vercel.app`; temporary legacy alias `muscle-memory-story.vercel.app`) while preserving the July historical deploy as precursor evidence.
- Adds SECURITY / CONTRIBUTING / CODE_OF_CONDUCT trust docs for the author-owned landing experience.
- Keeps frozen candidate `e2b9c4a1…` / cold archive v6 as historical custody; this branch does not overwrite those baselines.

### Final preseason hardening
- Adds a dedicated two-field `muscle_memory_prescribe` tool for first-contact task routing. It wraps the same caller-attested one-skill-or-`ABSTAIN` path as legacy `action:prescribe`, but removes the overloaded action-router and research-metadata tax for fresh agents; it still requires an explicit observed/known gap, opens one possession, and never creates, publishes, or dumps the shelf. Exact-file verification binding remains on the advanced legacy action where its pre-work metadata is explicit.
- Adds `muscle_memory_close`, a three-field default agent closeout (`possession_id`, observed `result`, concrete `reason`). It fixes the evidence tier to `agent_judged`, reports judged-versus-verified state immediately, and leaves human judgment, evidence references, corrections, and instrument proof on their advanced dedicated surfaces. Failed unaided abstentions now say the task failed instead of incorrectly awarding “smart restraint.”
- Removes the self-referential product phrase `Muscle Memory` from task-time prescription search only, preventing live dogfood prompts about the product itself from boosting unrelated memory-management skills and drowning an otherwise exact procedure match. Durable update/create evidence remains untouched.
- Makes the default agent tool surface context-budgeted: fresh installs expose only prescribe, close, and a lean read tool (`report`, pending work, Skill Review, one known skill). `MM_ADVANCED=on` explicitly restores verification adapters, human/correction closeout, direct lifecycle/write/referee tools, reflection planning, Coverage, share cards, registry, and diagnostics. Human slash commands and the full product remain available in both modes.
- Reconciles Skill Review with actual prescribed work: installed-shelf skills now appear after they are prescribed, possession outcomes (`helped / harmed / neutral`) and evidence (`judged / verified`) remain distinct from field plus-minus ratings, and one judged win reads as early positive evidence that needs replication rather than disappearing from the managed-only roster. The lean agent view collapses zero-signal shelf rows into one honest hidden count; human commands and advanced mode retain the full rotation.
- Rewrites the packaged agent guide around a concrete first possession: Decision Report → observed gap → one prescription or abstention → real `Skill` invocation → same-possession closeout → interruption-safe resume. Research machinery and noisy Coverage diagnostics move behind the primary journey.
- Renames the passive armed panel state from ambiguous `watching` to `ready`. Active lifecycle states retain explicit bounded verbs (`learning`, `checking`, `testing`, `saving`), so idle no longer looks like a stuck background job.
- Adds a permanent, isolated claim-to-experience gate covering 16 agent journeys and 100 assertions: clean discovery, update-first folding, staged creation, graduation, catalog publishing, retire/restore, legacy history mining, compaction reflection, squad transfer, Reflex/guard behavior, unsafe-content rejection, portable publishing, model-aware prescribe/abstain, evidence-floor roster guidance, and next-possession ratings.
- Refuses ratings for typo or uninstalled skill names on both the agent tool and manual command paths, so the referee ledger cannot award minutes to a nonexistent skill.
- Isolates the cross-agent feed whenever `MM_STATE_DIR` is sandboxed (with `MM_MESH_FEED` as an explicit shared override), preventing tests and disposable agents from reading or writing the operator's real squad feed.
- Makes ratings and lifecycle state visible from the default dashboard, adds a read-only ratings scoreboard, and returns explicit Staged, Graduated, Published, Retired, Restored, and update-first outcomes.
- Adds task-time `prescribe`: it requires a caller-attested observed/known gap and returns exactly one safely dominant installed skill or `ABSTAIN`, never the full shelf. Runtime-model field evidence can force abstention; untested model/skill pairings are labeled unproven rather than guessed.
- Adds a read-only `roster` surface that converts usage + associative field ratings into explicit evidence states without auto-promoting or auto-retiring anything; rotation/bench advice requires at least three rated possessions, so a single vote remains insufficient evidence.
- Tightens graduation admission: procedural skills must carry a fenced example with a real command, file, code fragment, or diff (generic arrow prose is refused), deterministic repair drafts render one even with `MM_CAPTURE=off`, and the diagnostic-TELL referee now scopes only the actual Pitfalls section instead of miscounting later Verification bullets.
- Extends publish sanitization to configured private agent labels through `MM_PRIVATE_IDENTIFIERS`, in addition to machine paths, user identifiers, and agent IDs.
- Strengthens the separate product-byte gate: package smoke directly requires a non-empty tarball with a 64-hex SHA-256, installed/staged bundle hash equality, runtime surface activation, and zero private-path hits; catalog sync now has a direct before/after byte-identity assertion for its no-op success path.
- Serializes the stateful Bun test suite with `--max-concurrency=1` so files sharing one sandbox ledger/verification-task root cannot race, and makes the Box Score integration expectation honor the runtime `MM_AGENT` precedence used by the final-gate environment.
- Adds the first instrument-owned verification adapter for one narrow, machine-checkable class: exact regular-file SHA-256 under a configured trusted root. `register_exact_file_verification` freezes a create-once read-only pre-work manifest; `prescribe` binds its hash into the possession decision; `verify_agent_possession` accepts only `possession_id`, derives the result and receipt, and fails closed on late registration, manifest drift, traversal, symlinks, task mismatch, forged receipts, or cross-possession replay. Generic callers still cannot self-award `verified`; unbound legacy rows remain judged.

## [1.0.0-rc.2] — 2026-07-20

### Candidate re-freeze
- Re-freezes the reviewed V1 runtime with corrected README, MOD, and changelog boundaries after RC1 documentation drift was detected. Runtime source and bundled executable behavior are unchanged from RC1; RC2 exists so the exact packed bytes can be independently validated and canaried without rewriting RC1 history.

## [1.0.0-rc.1] — 2026-07-20

### Release-candidate contract
- **Skills that earn their minutes** — the v1 package connects observed work → verifier-gated distillation/update → selective routing → reasoned field ratings → reversible roster decisions. Context is treated as a model- and task-conditioned intervention, not an automatically beneficial payload.
- **Truthful field referee** — `rate_skill` and `/muscle-memory rate` accept `up`, `down`, and `no_rate`; write an append-only reason event with runtime model/provider attribution; preserve the legacy plus-minus ledger; refuse to claim a rating when the sidecar cannot persist; and surface aggregate failures as explicit partial outcomes.
- **Graduation truth guard** — active-shelf presence and matching `SKILL.md` frontmatter are required before UI/feed surfaces may claim a graduation.
- **Release proof** — the candidate adds packed-tarball installation smoke, isolated runtime activation, private-path scan, source/bundle parity, deterministic final-gate receipts, and a role-separated review lane inside the project. No npm publication, GitHub push, or live replacement is implied by the RC label.
- **Research and prior-art boundary** — the release packet now foregrounds five bounded contributions, a six-line related-work matrix, and a 25-source primary bibliography. It explicitly refuses component-level “first/only/unique” claims and separates prior-bundle research/product evidence from exact-RC1 certification.
- **Noise and bloat controls** — read-only inspection templates cannot mature into skills, registry mirrors deduplicate by shelf precedence, synthetic `ref-skill-*` fixtures stay off user-facing boards, and hidden review forks are reused per purpose.

### Added
- **E6 · Retroactive mining (`/muscle-memory mine [agent-id]`)** — trace-to-skill from history the
  mod never saw live (`mods/history.ts`). The agent's message history (tool_call_message /
  tool_return_message pairs) is replayed through the SAME deterministic pipeline as live capture
  (`fingerprint()` step identity, `classifyError()` payload-free error classes) into the same
  experience/outcome streams — repair-chain detection and reflection consume mined tape with zero
  new pipeline code. Read-only on the server; per-agent watermark prevents re-mining; records carry
  `mined: true` for auditability. Day-one value: install on an old agent, its first reflection has
  months of tape. Live receipt (Letta Cloud, GLM 5.2 BYOK throwaway agent): 20 messages scanned →
  3 step rows + 3 outcomes correlated through `loadExperience()`; chain thresholds correctly refused
  an n=1 pattern from history (the same born-hard gate as live).
- **E7 · Referee hook (`/muscle-memory rate <skill> up|down [step-id]`)** — skill plus-minus over
  Letta's NATIVE rating primitive (`mods/referee.ts`): every rating lands in a local plus-minus
  ledger (per-skill +/- counts, timestamps) the lifecycle can consume for utility-weighted pruning,
  and — when a step id is given — is ALSO posted to `steps.feedback.create` so the signal lives in
  Letta's own surface. Honest v1: ratings come from the agent/user; automatic outcome attribution
  over step windows is v0.8 work and is not faked with guessing heuristics. Absence of ratings is
  never treated as a minus (`skillUtility` returns null on no evidence).
- **E8 · Squad shelf (`/muscle-memory shelf publish|attach|pull`)** — cross-agent skill inheritance
  over a shared Letta archive (`mods/shelf.ts`, archive `mm-squad-shelf`): archives are
  multi-agent-attachable, so one agent's sanitized, provenance-tagged skill becomes pullable by the
  whole squad. Non-negotiables built in: shelf publish only accepts the SANITIZED staged copy
  (publish-stage first), pulls land STAGED-FIRST (publish-staged dir, provenance header, "REVIEW
  BEFORE PROMOTION") and never touch an active shelf, and secret-shaped content is hard-blocked in
  both directions. Wire-truth note: tags on archive-created passages do not survive the wire
  (verified live 2026-07-03 — search returns them tagless and tag filters match nothing), so shelf
  identity + provenance ride IN THE TEXT via a canonical marker; multiple published versions resolve
  to the newest marker timestamp. Live receipt: full publish → attach → pull → staged loop green on
  Letta Cloud, provenance + content integrity + staged-first boundary all verified.
- **E9 · Distill at the moment of forgetting** — `compact_start` now triggers the opt-in reflective
  review (MM_REFLECT=staged|auto), not just a receipt: compaction is when evicted evidence dies, so
  the reflect fires while the experience log still holds the full tape. Fire-and-forget with an
  in-flight guard; can never delay or break compaction. (Local-backend event; guarded by the compact
  capability as before.)
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
