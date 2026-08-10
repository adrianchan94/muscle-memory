# Claims and limitations — `1.0.0-rc.3`

Written to be argued with. If a claim here is not supported by something you can run or read in this repository, that is a **P0** finding.

## The claim ceiling

**The highest thing this package claims:** on bounded, tested tool-use tasks, procedural knowledge that an agent can author, retrieve, and cite can still fail to govern its next action — and act-time governance can measurably change that behaviour without retraining.

**Everything above that line is refused**, explicitly:

- ❌ no universal law of model cognition
- ❌ no externally reproduced efficacy
- ❌ no claim that skills always help
- ❌ no claim that this generalises beyond the tested task families
- ❌ no production-readiness claim
- ❌ no "first / only / unique" component claim

## What is claimed, and what backs it

| Claim | Backed by | Strength |
|---|---|---|
| The default agent surface is 3 tools | `TOOL-SCHEMAS.json` → `assertions.defaultSurfaceIsLean`, dumped from the packed artifact | **Mechanically verified** |
| `muscle_memory_prescribe` is a dedicated two-field contract (`task`, `gap_observed`) that rejects extra fields | `TOOL-SCHEMAS.json` → `prescribeIsDedicatedTwoField`, `prescribeRejectsExtraFields` | **Mechanically verified** |
| The shipped bundle matches a rebuild from source | `PACKAGE-MANIFEST.json` → `bundle.parity` | **Mechanically verified** |
| Review docs do not leak into the npm tarball | `PACKAGE-MANIFEST.json` → `noReviewDocsInTarball` | **Mechanically verified** |
| Callers cannot self-award `verified` evidence | `test/verification-adapter.test.ts` (forged receipt, replay, traversal, symlink, manifest-drift, late-registration cases) | **Test-enforced** |
| Secrets are blocked before write/share | `test/adversarial-safety.test.ts` | **Test-enforced, with stated bounds** |
| Retrievals, uses, and ratings cannot manufacture `proven` | evidence-tier separation in the roster/box-score tests | **Test-enforced** |
| The knowing–doing findings | the canonical research record (external site), **not** this package | **Not reproducible from this repo** |

## Known limitations — stated, not discovered by you

1. **The research is not reproducible from this repository.** This repo ships the *product*. The experiments, raw traces, and custody chains are controlled artifacts held outside it. The public research manifest proves the presentation surfaces reconcile with each other — it does **not** independently reproduce the experiments.
2. **Verification covers exactly one narrow class.** The only instrument-owned adapter is exact regular-file SHA-256 under a configured trusted root. Everything else is `agent_judged` or `human_judged`. This is deliberate; it is also narrow.
3. **Secret detection is bounded and says so.** Split or concatenated tokens are not caught. High-entropy secrets with no known prefix or label are not caught. Two tests assert these *bounds* explicitly rather than pretending to completeness.
4. **`0 proven` is the honest current state.** On the live seat the resting surface shows judged outcomes only. `proven` requires bound, instrument-owned verification, and that count is currently zero. The board is designed to stay unflattering until real proof exists.
5. **Evidence volume is early.** Roster guidance requires ≥3 rated possessions precisely because current samples are small. Nothing is auto-promoted. Retirement is surfaced as a recommendation and is only performed when explicitly enabled.
6. **Not externally replicated.** Mack's audit is role-separated *within the same project*. It is not third-party replication and is not presented as such.
7. **Node 20 deprecation warning in CI.** `actions/checkout@v4` emits a Node 20 deprecation notice on the runner. Cosmetic; the job runs on Node 24.
8. **Historical commits in the PR range carry a different git identity.** Older commits use a GitHub noreply address. They are deliberately **not** rewritten (no force-push). The squash-merge strategy collapses them into one clean commit.

## Live seat evidence — early, judged, not claim-bearing

From one live Decision Report:

- 18 active skills
- 5 served · 5 helped · 0 harmed
- 20 abstentions — 19 succeeded unaided, 1 failed unaided
- **0 proven**

This is **early judged evidence from a single seat**. It is not a controlled experiment, not an efficacy result, and carries no claim. It is included because hiding the denominator would be worse.

## What would legitimately change our mind

- a path where a caller obtains `verified` without the instrument deriving it
- a secret shape inside the stated bounds that still gets written or shared
- a way to make the roster auto-promote or auto-retire
- a divergence between the shipped bundle and the source
- any private path, credential, or personal identifier in the packed tarball

## Publishing to the shared catalog

Writing a skill to the shared Custom Skills catalog is the one irreversible lifecycle action, and
it is gated two ways.

- **Per-call approval.** `lifecycle_run(action: "publish")` refuses without `approve: true`.
- **The carve-out, stated plainly.** If the operator sets `MM_PUBLISH=auto`, autopilot graduates
  publish without a per-call approval. The environment variable **is** the approval: setting it is
  a deliberate operator act, it defaults to off, and an attacker limited to writing inside the
  state directory cannot flip it. Content is sanitized on that path exactly as on the manual one.

So the honest claim is *per-call approval is required unless the operator has granted standing
approval via `MM_PUBLISH=auto`* — not *every publish is individually approved*. Both statements
were true of the manual path; only the first is true of the whole system.

A reviewer should read the default as load-bearing: off means no autonomous loop reaches the
shared catalog without a human first opting in.

## Residual threats — what the security dogfood does NOT cover

The G2 security dogfood is indexed by `docs/cold-review/THREAT-MAP.md`, which lists 25 threat
classes, the scenario exercising each, and — deliberately — the **reach** of that scenario, so a
reviewer can see which greens are red-checked and which merely assert observable behaviour.

Six threats are **residual for V1.1** and are **not claimed** by V1:

1. instrument **key rotation** retiring old claims while keeping the product working;
2. a **drifted target** — the artifact moving away from expected between registration and closeout;
3. **sealed-manifest rewrite** after binding;
4. a **failed skill call** counted as an invocation;
5. a target **already correct** at registration earning procedural credit;
6. **ledger behaviour at scale** (thousands of rows).

The historical S-numbered security suite is gone: its source lived only in ephemeral storage and
was deleted. No number from it is quoted anywhere, and the current suites make no continuity
claim to it. What replaced it is smaller, in the repo, and honest about its reach.
