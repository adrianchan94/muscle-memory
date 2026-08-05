# Muscle Memory V1 — `1.0.0-rc.3`

> Release candidate only. This document is a draft for review; it does not authorize a tag, GitHub release, `main` merge, npm publication, or external research send.

## Skills that earn their minutes

Muscle Memory V1 is verifier-gated procedural memory for Letta agents. It turns real execution into a controlled loop:

```text
observe → diagnose a real gap → prescribe one skill or abstain → execute → close honestly → keep, revise, bench, or retire
```

The design is grounded in one bounded research finding: possessing, retrieving, or citing a correct procedure does not guarantee that the procedure governs the next action. V1 therefore treats a skill as an intervention whose value depends on the model, task, and observed knowledge gap—not as context that should always be injected.

## V1 highlights

- **One skill or abstain.** The default `muscle_memory_prescribe` tool accepts only `task` and `gap_observed`, then returns one installed skill or `ABSTAIN`.
- **Possession ledger.** Every prescription or abstention opens one resumable decision; closeout records helped, harmed, neutral, succeeded unaided, or failed unaided.
- **Honest evidence tiers.** Agent/human judgment stays distinct from instrument-owned verification. Retrievals, uses, and ratings cannot manufacture `proven` status.
- **Exact-file verifier.** The first qualified adapter binds a pre-work manifest to one regular file and derives its own SHA-256 outcome while rejecting mutation, traversal, symlinks, replay, and task mismatch.
- **Skill Plus-Minus without automatic punishment.** Outcome and field-rating tape drives conservative review guidance; no skill is auto-promoted or auto-retired.
- **Update-first anti-bloat.** Existing, staged, and retired skills are checked before creation; n=1 evidence and renamed retired clones are refused.
- **Staged and reversible lifecycle.** Skills graduate through formulation and security gates; retirement is reversible; pinned skills are protected.
- **History mining and compaction reflection.** Existing tool history can be replayed once through the same learning pipeline, and opt-in reflection can run before compaction evicts evidence.
- **Squad shelf and Desktop catalog bridge.** Sanitized skills transfer staged-first across agents, while graduated local skills can sync reversibly into Desktop without copying evidence receipts or following symlinks.
- **Privacy by construction.** Secret-shaped values block writes and shares; machine paths, private labels, and agent identifiers are sanitized.
- **Lean default surface.** Fresh agents see prescribe, close, and bounded read. Advanced mutation, research, lifecycle, referee, and verification controls require `MM_ADVANCED=on`.

## Install during review

```bash
letta install git:github.com/adrianchan94/muscle-memory
/reload
```

The npm package identity is `@adrianchan94/muscle-memory`, but it is not published while this candidate remains under review.

## Research and claim boundary

Muscle Memory V1 is the product. [Knowing Is Not Doing: Measuring Execution-Time Governance of Learned Skills in LLM Agents](https://muscle-memory-v1-research.vercel.app/) is the canonical research record behind its design.

The research demonstrates bounded effects in tested tool-use tasks. It does not establish universal model behavior, external replication, or automatic causal efficacy for every learned skill. The public manifest proves that presentation surfaces reconcile; it does not independently reproduce the experiments.

## Candidate and historical custody

- Historical reference candidate: `1.0.0-rc.2`, product tarball `e2b9c4a1…`, cold-review archive v6.
- New owner candidate: `1.0.0-rc.3`.
  - packed tarball sha256 `f44e71caffde1c402bd952caa1d2bfe0e7933716569538e7d85a2f7b415d6f7c` · 250936 B
  - bundled entry sha256: see `docs/cold-review/PACKAGE-MANIFEST.json` → `bundle.committedSha256` (derived at generation time, never restated by hand)
  - minted from the packed file set (`MOD.md`, `CHANGELOG.md`, `README.md`, `LICENSE`, `mods`) after the review bytes settled. Any further edit to those paths invalidates this hash and requires a re-mint.
  - awaiting independent custody confirmation; not yet cold-reviewed.
- RC3 requires fresh package gates, packed-consumer smoke, cold review, and independent custody. It does not inherit RC2/v6 qualification by similarity.

## Before final `1.0.0`

- CI and local release gates green on identical hermetic assumptions.
- Exact packed candidate hash minted and independently checked.
- Cold review completed on the RC3 bytes.
- Maintainer explicitly approves `main` merge, GitHub release/tag, and npm publication as separate actions.
