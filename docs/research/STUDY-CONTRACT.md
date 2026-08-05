# Study contract

Muscle Memory is a **research instrument** as well as a product. This file states the contract every measurement in the research program is held to. It is preserved verbatim across V1 documentation.

The category split this program insists on:

> **`Agents can learn procedures responsibly.`**
> **`Here is how to measure whether they actually did.`**

The first is a design stance. The second is the instrument. They are separate claims and must not be collapsed.

## Contract fields

Every measurement carries all eight.

| Field | Meaning |
|---|---|
| **subject** | The unit under study — the model family and the specific agent seat, named exactly, never "an LLM". |
| **baseline** | The matched control arm the subject is compared against. Without a declared baseline there is no delta, only an anecdote. |
| **assignment** | How a task was allocated to an arm, declared before the run. Post-hoc assignment invalidates the cell. |
| **outcome** | The observable that decides the result, defined before execution — not chosen after seeing the data. |
| **evidence tier** | `judged` (agent or human judgement) or `verified` (instrument-owned derivation). Never blended into one number. |
| **exclusion** | The preregistered conditions under which a cell is VOIDed. Excluded cells retain their receipts and are counted in the disclosure. |
| **amendment** | Any change to protocol after preregistration, recorded with its timestamp and reason. Silent amendment is falsification. |
| **custody** | Who holds the exact bytes, and the hash they independently recomputed. |

## Three-level reproducibility

Reproducibility is not one property. This program claims exactly three levels and refuses to blur them.

| Level | What it means | Status |
|---|---|---|
| **1 · Package reproducible** | Anyone can rebuild the exact shipped bytes from the public commit and verify every hash. | **Yes, now.** `npm ci && npm run build && npm pack` reproduces the published sha256. Verified byte-identical across repeated mints. |
| **2 · Minimal fixture reproducible** | Anyone can run a small deterministic fixture that demonstrates the instrument's core separations, with no provider calls. | **Yes, now.** See `fixtures/four-events/`. |
| **3 · Full program auditable but not yet publicly reproducible** | The complete experimental program — frozen inputs, raw traces, invocation records, custody chains — can be audited, but is not publicly re-runnable. | **Auditable, not reproducible.** Controlled artifacts are held outside this repository. This is a limitation, stated as one. |

Nothing in this repository claims level 3 reproducibility. The public research manifest proves the presentation surfaces reconcile with each other; that is presentation integrity, not experimental reproduction.

## What the instrument separates

The measurement exists because these four things are routinely conflated, and conflating them is how a memory system flatters itself:

1. **presence** — the skill exists on the shelf
2. **prescription** — the skill was selected and served for this task
3. **execution** — the agent actually invoked it and acted
4. **verified outcome** — an instrument, not the agent, derived the result

A system that reports (1) as though it were (4) is not measuring anything. `fixtures/four-events/` demonstrates the separation deterministically.

## Standing rules

- No number without a receipt.
- Nulls publish at the weight of wins.
- Evidence tiers never merge.
- A retraction travels at least as far as the claim did.
- The ledger — retractions, holds, refusals — is part of the result.
