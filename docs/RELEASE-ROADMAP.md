# HARDWOOD · Release Roadmap — muscle-memory × Skill Plus-Minus
*Every release ships with its receipts or it doesn't ship. Claim language is pre-committed
per release; exceeding it anywhere (README, landing, Discord) is a bug.*

## v0.6.x — The Challenge Build ✅ SHIPPED (+ v0.6.1 pending publish)
**Shipped:** core loop (distill · dedup · quality-gate · sanitize · prune), staged-first, opt-in.
First place, Letta Mod Challenge; running on Letta's internal agents.
**v0.6.1 (napkin-sized, HIGH priority):** npm refresh — the published 0.6.0 predates the local-CLI
bundle fix (#36) and duplicate-create gates (#40). Gate: Cameron/publish workflow. Receipt: npm
version bump visible. *Everything downstream funnels through a working npm install.*
**Allowed claims:** "challenge winner", "runs on Letta's agents". NOT "proven learning gains".

## v0.7 — The Routing Release 🔄 IN REVIEW
**Ships:** semantic update-first routing + canary calibration (#45, live 15/16 vs 7/16 lexical) ·
passage-sync hygiene (unchanged-skip, removed-skill reconciliation) · miner synthetic-tape gate +
shelf dedup (the learner can never mine its own harness).
**Gates:** maintainer review of #45 · routing eval CI-gated 16/16 · full suite green.
**Receipts:** PR #45 diff + bench receipts · miner-hygiene regression tests (mixing invariant).
**Allowed claims:** "routing 44%→94% on the labeled set (live, CI-gated)". NOT "solves dedup".

## v0.8 — The Referee Release 🧱 BUILT, STAGED (ships after v0.7 resolves)
**Ships:** LLM reranker — judge reads (lesson, skill) together; dev 16/16 + sealed blind holdout
8/8, judge-stable ×2, cheap-judge parity, judgeViaFork zero-dep · THE FILM ROOM — bounded
PATCH_NOTE maintenance of existing skills at compact boundaries (summary-fed, step-budgeted,
staged-first, tenure-protected, referee-coupled auto-revert; 15 tests) · E7 live plus-minus —
ledger + native steps.feedback (rail live-verified on self-hosted, receipt committed) ·
SPM feedback puller (ledger-indexed, server-truth).
**Gates:** v0.7 merged · fresh mods-package port + bundle regen · install smoke incl.
`/muscle-memory rate` · Kev's keep/kill receipt · new sealed holdout by ULTRON for any
routing-lever change (current holdout SPENT).
**Receipts required before "live":** rating flowing on ≥2 real agents · film-room shadow diffs
reviewed ≥1 week · zero unreviewed live patches.
**Allowed claims:** "reranker 24/24 under prereg incl. sealed holdout" · "skills accumulate real
win/loss records". NOT "auto-attribution" (explicit ratings only in this release).

## v0.9 — The Transfer Release 📐 DESIGNED
**Ships:** scorecard passports (provenance, env assumptions, sanitization report, win/loss
record) · quarantined import + reverify-before-trust (built SPM-side, 9 tests — needs MM-side
import command + UX) · squad shelf via shared archives/blocks (primitives verified in SDK) ·
Desktop catalog-sync (Kev's build, in progress).
**Gates:** zero-trust import proven (no path grants trust at import — already test-pinned) ·
privacy scan on every transferred file · cross-agent collision guards (two-MM-one-box tested).
**Allowed claims:** "skills travel with their box scores; trust is earned by reverification".

## v1.0 — The Proof 🎯 THE SEASON FINALE
**Ships:** the compounding-proof benchmark — n≥30 valid pairs per skill · ≥2 model families ·
≥2 machines · placebo arm standard · real (non-purpose-built) skills included · the published
chart + methodology write-up (Tier 1 → Tier 2 ladder) · possible canary-calibration research note
(systematic lit search first).
**Gates:** every run pre-registered · holdout authors rotate (never the lever-tuner) · external
replication invited before "benchmark" is used unqualified · crew review + maintainer heads-up
before anything public.
**Current receipts toward it:** the founding arc — junk +0.50 (caught) → generic +0.03 (ceiling)
→ leaky +0.14 → leak-gated +0.64 [+0.44,+0.84], 16W/0L, placebo≈OFF (n=25, n≥30 top-up running
tonight under declared addendum).
**Allowed claims when gates pass:** "the first pre-registered, placebo-controlled skill-value
benchmark." Until then: "directional", always with n.

## Standing laws over all releases
One tight PR at a time · learner and referee never merge · every burn becomes a mechanical gate ·
nothing external without Kev/Adrian review · the label the engine prints is the label we use.
*Train hard. Keep score. Ball don't lie.* 🏀
