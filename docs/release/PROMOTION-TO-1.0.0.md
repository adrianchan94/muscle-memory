# Promotion criteria — stable `1.0.0`

**`1.0.0-rc.3` is not stable and must not be described as stable.** It is a release candidate. This document is the contract for what would earn the stable tag.

Shipping `1.0.0` is a promise about interface stability and operational trust. We do not make it on the strength of a green CI run.

## Hard gates — all required

**Review**
- [ ] two independent hostile cold reviews returned, blind and separate
- [ ] every P0 closed, with the fix re-reviewed (not self-certified)
- [ ] every P1 either closed or explicitly accepted in writing by the maintainer
- [ ] final candidate bytes custody-pinned by an independent recompute

**Field evidence — the one that actually gates us**
- [ ] `proven > 0`: at least one closed possession with **instrument-owned, bound verification**, not agent judgement
- [ ] a meaningful run of possessions across more than one model family
- [ ] at least one recorded `harmed` or `failed_unaided` outcome handled correctly — a system that has only ever seen wins has not been tested
- [ ] roster guidance observed to refuse advice below its evidence floor in real use

`0 proven` is the current state. That alone blocks stable.

**Interface**
- [ ] tool names and parameter schemas declared frozen for the `1.x` line
- [ ] a documented deprecation policy for tool/schema changes
- [ ] `MM_ADVANCED` boundary confirmed stable
- [ ] state and receipt formats forward-compatible, with a migration story

**Operational**
- [ ] canary completed with no aborts (`CANARY-AND-ROLLBACK.md`)
- [ ] a published rollback path that does not depend on `npm unpublish`
- [ ] CI green on clean Linux across the supported Node range
- [ ] install verified on a machine that has never had the package

**Honesty**
- [ ] `CLAIMS-AND-LIMITATIONS.md` re-audited against the shipped behaviour
- [ ] no claim in README/release notes unsupported by something runnable
- [ ] research boundaries unchanged: bounded tool-use findings, no universal claim
- [ ] product vs research-record naming still distinct

## Explicitly NOT criteria

These do not earn stable, and must never be cited as if they do:

- the Mod Challenge result — provenance, not validation
- download counts, stars, or adoption
- the research findings — they motivated the design; they do not qualify the bytes
- "it has been running for a while without complaints"
- passing our own tests — that is the floor, not the bar

## Versioning path

| Version | Meaning |
|---|---|
| `1.0.0-rc.3` | current candidate, `next` tag, review only |
| `1.0.0-rc.N` | further candidates if review forces byte changes |
| `1.0.0` | stable, `latest` tag — **only** when every gate above is met |

Each RC that changes bytes gets a **new candidate identity** and inherits no prior seal. That rule has already been enforced twice in this cycle.

## Who decides

Adrian. Not CI, not a reviewer, and not an agent. The gates above make the decision legible; they do not make it automatic.
