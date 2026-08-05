# Cold review — Muscle Memory `1.0.0-rc.3`

This directory is **self-contained**. Everything a reviewer needs is either in this repository or reproducible from it with the commands below. No external worktree, no private receipts, no machine-specific paths.

You are reviewing a **release candidate**, not a release. Nothing here is published.

## What this package is

`@adrianchan94/muscle-memory` is verifier-gated procedural memory for Letta agents. It observes real agent work, distills the smallest reusable procedure, prescribes **exactly one** skill at task time — or abstains — and then records whether that intervention helped, harmed, or changed nothing.

- **Muscle Memory V1** is the product.
- ***Knowing Is Not Doing: Measuring Execution-Time Governance of Learned Skills in LLM Agents*** is the canonical research record behind its design: <https://muscle-memory-v1-research.vercel.app/>

These two names are distinct and must not be merged.

## Review artifacts in this directory

| File | What it answers |
|---|---|
| `CLAIMS-AND-LIMITATIONS.md` | Exactly what is claimed, what is refused, and the claim ceiling |
| `PACKAGE-MANIFEST.json` | Every shipped file with sha256, tarball hash/bytes, source↔bundle parity |
| `TOOL-SCHEMAS.json` | The agent-facing tool surface dumped from the packed artifact |
| `VERIFY-REPRODUCTION.md` | Deterministic commands to reproduce every hash and gate yourself |
| `REVIEW-CHECKLIST.md` | The verdict format we are asking you to return |

The research instrument kit is at [`../research/`](../research/README.md): the study contract, the preregistration schema, and a deterministic fixture you can run in under a second.

Both JSON files are **generated**, not hand-written. Regenerate them with:

```bash
node scripts/dump-package-manifest.mjs
node scripts/dump-tool-schemas.mjs
```

Both scripts exit non-zero if their embedded assertions fail.

## The candidate

| | |
|---|---|
| Version | `1.0.0-rc.3` |
| Commit | see `VERIFY-REPRODUCTION.md` (frozen SHA) |
| Packed tarball sha256 | `6a6fcdf88e2c6568e4ddfb789e77754346d0f1b0e8bb2d6c8b1825036d3d1069` |
| Tarball bytes | `264782` |
| Bundled entry sha256 | see `PACKAGE-MANIFEST.json` → `bundle.committedSha256` (derived, not restated) |

The tarball is **not committed** to this repository. Reproduce it with `npm pack` — see `VERIFY-REPRODUCTION.md`.

## Non-inheritance — read this before comparing to older artifacts

RC3 is a **new candidate identity**. It does **not** inherit qualification from any earlier artifact:

- historical product tarball `e2b9c4a1…` (the `1.0.0-rc.2` era reference candidate)
- cold-review archive **v6** `cb951cbe…`
- owner-route candidate `d97875fa…`

Those exist and are preserved as history. **None of their reviews, seals, or approvals transfer to RC3.** If you have seen them, treat RC3 as unreviewed.

## Blocked actions — none of these have happened

- no git tag
- no GitHub release (draft or published)
- no npm publish
- no merge to `main`
- no external research send

See `../release/` for the *prepared but unexecuted* release surface.

## What we are asking you for

Read `REVIEW-CHECKLIST.md`. In short: severity-ranked findings (P0/P1/P2), an **INSTALL / WON'T INSTALL** call, and a **publish HOLD / GO** recommendation for shipping this RC under the npm `next` tag.

Be hostile. A finding that stops the release is worth more to us than a compliment.
