---
name: "@adrianchan94/muscle-memory"
description: "Verifier-gated procedural memory for Letta agents: prescribe exactly one installed skill or abstain after a real gap, close the same possession with observed evidence, and improve the skill shelf through staged, reversible, update-first learning."
---

# Muscle Memory — agent guide

**Every session becomes practice film. Skills earn their minutes.**

> **Skill Plus-Minus ceiling (canonical):** SPM ships as an associative tape plus conservative review recommendations — **no automatic bench or retire** — and verified efficacy remains a separate instrument.

Muscle Memory helps you use learned procedures only when they earn context. The hardwood language is the product identity; the execution contract stays precise. The Decision Report is your box score, `rate_skill` maintains associative plus-minus tape, and neither is causal proof.

It is not a shelf browser and it does not preload every skill. After a real procedural miss—or when you know you lack the procedure—ask for one intervention. Muscle Memory returns exactly one installed skill or `ABSTAIN`, opens a private possession, and waits for an honest outcome.

## Your first possession

### 1. Orient

Start with the private Decision Report:

```text
muscle_memory_skill_read(action: "report")
```

The report separates interventions from abstentions, shows the latest activity, exposes pending closeouts, and labels the evidence boundary. Early judged outcomes are not verified or claim-bearing.

### 2. Wait for a real gap

Do not call Muscle Memory just because a skill sounds relevant. Use it after:

- a tool or procedure fails and you do not know the safe recovery;
- the task requires a procedure you know you are missing; or
- an explicit pre-work verification protocol requires a bound possession.

If you already know the recovery, continue unaided.

### 3. Ask for one intervention

Use the dedicated task-time tool:

```text
muscle_memory_prescribe(
  task: "An exact-match edit failed because the target text is stale.",
  gap_observed: true
)
```

The dedicated tool accepts only `task` + `gap_observed` (`additionalProperties: false`). Privacy-safe `task_class` / `difficulty` strata are assigned by the router (one-way hash label + `unknown` unless an advanced surface supplies them). Do not invent strata at call time.

Muscle Memory never infers your hidden model capability. `gap_observed` is your explicit diagnosis. The result is one of:

- `PRESCRIBE "<skill>"` — invoke that exact skill with the normal `Skill` tool;
- `ABSTAIN` — no single installed skill safely cleared the match gate.

Never load sibling skills or the full shelf “just in case.”

### 4. Execute the procedure

When prescribed:

```text
Skill(skill: "recovering-failed-exact-match-edits")
```

Then perform the task. Retrieval alone is not use: the normal `Skill` invocation is the observable handoff.

### 5. Close the same possession

Use the `possession_id` returned by `muscle_memory_prescribe`.

For a prescription:

```text
muscle_memory_close(
  possession_id: "<id>",
  result: "helped",
  reason: "The re-anchor procedure resolved the failed edit and the original check passed."
)
```

Allowed prescription outcomes: `helped`, `harmed`, `neutral`.

For an abstention, complete the task unaided and close with `succeeded_unaided` or `failed_unaided`.

`muscle_memory_close` records `agent_judged` automatically and tells you whether verified evidence remains zero. Use the advanced `record_agent_possession` tool only when a human owns the judgment, an evidence reference is needed, or an append-only correction must supersede a prior outcome. Never self-award `verified`.

### 6. Resume instead of duplicating

If work is interrupted:

```text
muscle_memory_skill_read(action: "pending_possessions")
```

The pending view returns the original task, prescribed skill when present, exact next move, and same-possession closeout command. Resume that possession; do not open a duplicate.

## What the live panel means

- `ready` — idle and armed; no learning job is stuck;
- `learning`, `checking`, `testing`, `saving` — a bounded lifecycle operation is active;
- `skill helped`, `no skill needed`, `skill learned`, `skill improved` — a short completed outcome beat;
- `blocked` — a safety or integrity alarm that remains visible until cleared.

`0 proven` can be correct even with useful early tape. “Proven” is intentionally stricter than installed, used, or judged helpful.

## Default agent surface

A normal install exposes three tools only: `muscle_memory_prescribe`, `muscle_memory_close`, and a lean `muscle_memory_skill_read`. The research console, mutation controls, verification adapters, and referee tools do not consume fresh-agent context.

### `muscle_memory_skill_read` — bounded state

Use:

- `report` — canonical private Decision Report;
- `pending_possessions` — resume open work;
- `roster` — conservative Skill Review using `helped / missed / rated` outcomes;
- `load` — inspect one known skill by name.

Human `/muscle-memory ...` commands remain available. Set `MM_ADVANCED=on` only when an agent needs direct access to reflection planning, exact-file binding, lifecycle writes, plus-minus ratings, or diagnostics such as Coverage, candidates, repairs, defenses, registry, and share cards. Coverage is investigation tape, never the primary first-contact view.

### `muscle_memory_prescribe` — current task

Use only after a caller-attested miss or known missing procedure. It returns one installed skill or abstains and opens one private possession. It never writes, publishes, or creates a skill.

With `MM_ADVANCED=on`, legacy `muscle_memory_skill_read(action: "prescribe", ...)` remains available for pre-bound verification metadata. The dedicated tool is the preferred first-contact route.

### `muscle_memory_close` — lightweight default closeout

Provide only the possession ID, observed result, and one concrete reason. It records `agent_judged` evidence, reports the skill's judged/verified boundary, and cannot accept verified evidence.

### `record_agent_possession` — advanced judged closeout

Use for human-owned judgment, evidence references, or append-only corrections. It rejects caller-supplied `verified` evidence; corrections must supersede the exact active outcome event.

### Exact-file verification — narrow instrument-owned proof

For a task with an independently knowable final byte target, enable `MM_ADVANCED=on`, then:

1. Set `MM_EXACT_FILE_ROOT` to an absolute trusted workspace root.
2. Before work, call `register_exact_file_verification` with a unique task ID, task class, root-relative target, and expected lowercase SHA-256.
3. Use the advanced `muscle_memory_skill_read(action: "prescribe", ..., verification_task_id: "<id>")` path. The lightweight task tool intentionally omits verification metadata.
4. After work, call `verify_agent_possession(possession_id)`.

The adapter owns the root, manifest, target, digest comparison, result, evidence tier, and receipt. It rejects late registration, mutation, traversal, symlinks, replay, and task mismatch.

It proves exact final bytes only. It does not prove semantic correctness, causal skill impact, or unaided abstention quality.

## Learning from completed work

Task-time prescription and skill mutation are separate paths. Automatic reflection remains controlled by `MM_REFLECT`; direct agent mutation tools require `MM_ADVANCED=on`.

1. Preview with `muscle_memory_skill_read(action: "reflect_plan")`.
2. Prefer updating an existing skill over creating a sibling.
3. Use `muscle_memory_skill_write(action: "reflect")` for approval-gated authoring, or `muscle_memory_lifecycle_run(action: "reflect", mode: "staged")` for the safe staged lifecycle.
4. Graduate only after security, structure, and execution-shaped example gates pass.
5. Retire reversibly; pinned skills stay protected.
6. Publishing is explicit, sanitized, and separately approved. Muscle Memory never commits, pushes, or remotely publishes on its own.

A new skill requires repeated, class-level evidence. One command failure is not automatically a reusable procedure.

## Worked examples are part of learning

Research showed that faithful prose can still be unusable. When privacy permits, `MM_CAPTURE` can preserve redacted execution-shaped examples:

- unset — structural fingerprints only;
- `context` — redacted error context and touched symbol;
- `worked` — redacted before/after repair fragments.

Every fragment is scrubbed at capture and the final skill is rescanned before write. Concrete examples improve formulation; they do not waive verification.

## Plus-minus and roster review

With `MM_ADVANCED=on`, `rate_skill` records associative plus-minus tape from your observed experience: `up`, `down`, or `no_rate`. The agent-facing Skill Review renders the evidence as `helped / missed / rated` so models do not mistake a sports score for verified efficacy. Reasons are required for `down` and `no_rate`. Ratings can trigger review advice but never automatic promotion or retirement.

The Skill Review includes managed skills plus any installed skill that actually entered a prescription. It shows possession outcomes and judged/verified evidence separately from field plus-minus ratings. The default lean read collapses zero-signal rows into one hidden count; `/muscle-memory roster` and advanced mode retain the full rotation. One judged helpful possession reads `EARLY POSITIVE · NEEDS REPLICATION`; promotion or retirement advice still requires at least three field-rated tasks.

## Safety and evidence contract

- One skill or abstain; never dump the shelf.
- Caller owns the gap diagnosis; the router does not inspect hidden parametric knowledge.
- Same-model negative field evidence forces abstention.
- Skill use requires a real `Skill` invocation.
- Possession outcomes are append-only and type-compatible.
- Callers cannot self-award verified evidence.
- Writes are security-scanned, quality-gated, atomic, staged by default, and reversible.
- Agent-local shelves may evolve autonomously when enabled; shared shelves require explicit approval.
- Mechanism and product-path success do not establish causal efficacy or universal model improvement.

The goal is not to store more context. It is to deliver the smallest useful procedure to the matching gap, observe what happened, and let the skill earn another possession.
