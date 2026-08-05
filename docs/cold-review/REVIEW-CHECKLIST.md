# Reviewer checklist and verdict format

Please work **offline and read-only**. Do not open issues, comment on the PR, push branches, or contact anyone about this candidate.

You are one of two independent reviewers. **Do not seek out or read the other reviewer's report.** Divergence between you is signal we want.

## Scope

In scope:

- the packed artifact and everything in it
- the tool surface a consuming agent actually gets
- the safety, privacy, and evidence-integrity boundaries
- whether documented claims match observable behaviour
- release readiness of this RC under the npm `next` tag

Out of scope:

- reproducing the research experiments (controlled artifacts, not in this repo)
- the research site's internal numbers
- opinions about the product's market

## Checklist

**Integrity**
- [ ] `git status --porcelain` and `git diff --check` are clean at the frozen SHA
- [ ] `npm pack` reproduces the recorded sha256 and byte count
- [ ] `PACKAGE-MANIFEST.json` regenerates identically
- [ ] shipped bundle matches a rebuild from source
- [ ] no review docs, tests, or dev scripts leak into the tarball

**Surface**
- [ ] default surface is 3 tools
- [ ] `muscle_memory_prescribe` accepts exactly `task` + `gap_observed` and rejects extras
- [ ] `MM_ADVANCED=on` extends without removing
- [ ] every registered tool has a usable description and schema

**Evidence integrity**
- [ ] a caller cannot obtain `verified` without the instrument deriving it
- [ ] forged receipts, replays, traversal, symlink swaps, and manifest drift all fail closed
- [ ] ratings/uses/retrievals cannot manufacture `proven`
- [ ] nothing auto-promotes or auto-retires

**Privacy and safety**
- [ ] no credentials, private paths, or personal identities in the packed bytes
- [ ] secret-shaped values are blocked before write and before share
- [ ] the stated detection bounds are honest (they are asserted as bounds in tests)

**Gates**
- [ ] `npm test`, `npm run verify`, `node scripts/final-gate.mjs` all exit `0`
- [ ] both GitHub Actions runs are green on `ubuntu-latest`
- [ ] fresh-temp install and runtime activation succeed

**Honesty**
- [ ] `CLAIMS-AND-LIMITATIONS.md` does not overstate
- [ ] product vs research-record naming is kept distinct throughout
- [ ] the non-inheritance statement is respected (RC3 inherits no prior seal)
- [ ] no unearned "production ready" or efficacy language

## Severity definitions

| | Meaning |
|---|---|
| **P0** | Blocks release. Security, privacy, integrity, data loss, or a false claim. |
| **P1** | Should fix before publishing under `next`. Real defect or materially misleading. |
| **P2** | Should fix eventually. Polish, clarity, minor inconsistency. |

## Return this

```
REVIEWER:            <your identifier>
CANDIDATE:           @adrianchan94/muscle-memory@1.0.0-rc.3
TARBALL SHA256:      <the sha256 you computed yourself>
BYTES:               <the byte count you computed yourself>
COMMIT REVIEWED:     <the SHA you checked out>

REPRODUCED OUR HASH: YES / NO   (if NO, give yours)

P0 FINDINGS:  <numbered, with file:line and how to reproduce; or NONE>
P1 FINDINGS:  <numbered; or NONE>
P2 FINDINGS:  <numbered; or NONE>

INSTALL VERDICT:     INSTALL / WON'T INSTALL
  reasoning:         <2-4 sentences>

PUBLISH VERDICT:     HOLD / GO   (for this RC under npm tag `next`)
  reasoning:         <2-4 sentences>

FIRST 60 LINES:      Would you install after reading only the first 60 lines
                     of README.md? YES / NO
  if NO, why:        <what was missing, unclear, or unconvincing>
  if YES, why:       <what specifically convinced you>

STRONGEST OBJECTION: <the single best argument against shipping this, even if you voted GO>
```

The last field is required. If you cannot construct an objection, say so explicitly and explain why the candidate resists one.
