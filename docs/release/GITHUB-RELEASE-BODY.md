**Release candidate — not a stable release.** This is a prerelease for review and canary use. The final `1.0.0` has its own promotion criteria and is not implied by this tag.

Muscle Memory is verifier-gated procedural memory for Letta agents. It watches real work, distills the smallest reusable procedure, prescribes exactly one skill — or abstains — and records whether that intervention helped, harmed, or changed nothing.

> **Context is treatment, not nutrition.** Relevance earns a look. Observed outcomes earn another possession.

## What's in V1

- **One skill or abstain.** `muscle_memory_prescribe(task, gap_observed)` returns a single installed procedure or `ABSTAIN`. It never dumps the shelf, and the caller must attest an observed gap.
- **Resumable possessions.** Every prescription or abstention opens one possession; closeout records `helped` / `harmed` / `neutral` / `succeeded_unaided` / `failed_unaided`, and survives interruption.
- **Instrument-owned verification.** One narrow adapter — exact regular-file SHA-256 under a trusted root — derives its own result and fails closed on drift, traversal, symlink swap, task mismatch, forged receipts, and replay. Callers cannot self-award `verified`.
- **A referee allowed to call red.** Rotation advice requires at least three rated possessions. Nothing auto-promotes or auto-retires.
- **Update-first learning.** Existing, staged, and retired skills are searched before a sibling can be created; n=1 evidence and renamed retired clones are refused.
- **Learning from film it never watched live.** Retroactive history mining replays old tool traces through the same pipeline; opt-in reflection fires at compaction, when evidence would otherwise be evicted.
- **Safe travel.** Squad-shelf transfers are sanitized and land staged-first; Desktop catalog sync is reversible and skips evidence receipts and symlinks.
- **Lean by default.** Fresh agents see three tools. Everything else requires `MM_ADVANCED=on`.

## Install

```bash
letta install git:github.com/adrianchan94/muscle-memory
/reload
```

npm distribution under `@adrianchan94/muscle-memory` is **not published** at this tag.

## Verification

This candidate ships a self-contained review kit at [`docs/cold-review/`](../cold-review/README.md): generated package manifest with per-file hashes, a tool-surface dump taken from the packed artifact, source↔bundle parity, and deterministic commands to reproduce every number.

Gates on the release commit: `npm test`, `npm run verify`, and `node scripts/final-gate.mjs` all exit `0`; CI green on `ubuntu-latest`.

## Claim boundary

Muscle Memory V1 is the product. [*Knowing Is Not Doing: Measuring Execution-Time Governance of Learned Skills in LLM Agents*](https://muscle-memory-v1-research.vercel.app/) is the canonical research record behind its design.

The research demonstrates bounded effects in tested tool-use tasks. It does **not** establish universal model behaviour, external replication, or automatic causal efficacy for every learned skill.

This candidate does not inherit qualification from any earlier artifact. Prior tarballs and cold-review archives are preserved as history; none of their seals transfer here.

## Known limitations

See [`docs/cold-review/CLAIMS-AND-LIMITATIONS.md`](../cold-review/CLAIMS-AND-LIMITATIONS.md) — including the bounded scope of secret detection, the single verified task class, and the current `0 proven` state.
