# Research instrument kit

Muscle Memory is a product **and** the instrument used to measure it. This directory is the public, reproducible part of that instrument.

> **`Agents can learn procedures responsibly.`**
> **`Here is how to measure whether they actually did.`**

Two separate claims. The first is a design stance; the second is this kit. Collapsing them is the failure mode this whole program exists to avoid.

## Contents

| File | What it is |
|---|---|
| `STUDY-CONTRACT.md` | The eight fields every measurement must carry, and the three-level reproducibility table |
| `protocol.schema.json` | Machine-checkable preregistration record — exact model identifier, provider + date, sampling, system-prompt hash, tool schema, verifier version, plus the contract fields |
| `fixtures/four-events/run.mjs` | Deterministic fixture demonstrating the instrument's core separation |
| `../../CITATION.cff` | How to cite the research record |

## Run the fixture

```bash
node docs/research/fixtures/four-events/run.mjs
```

No network. No provider calls. No model. Sub-second. Exits non-zero if any separation collapses, and prints a stable digest so you can confirm determinism by running it twice.

**This demonstrates the instrument; it does not reproduce the sealed findings.**

It shows that these four things are distinct, and that the system refuses to conflate them:

```txt
presence  ≠  prescription  ≠  execution  ≠  verified outcome
```

- a skill sitting on the shelf proves nothing
- serving a skill is not the same as executing it
- executing it is not the same as verifying the outcome
- and a caller cannot forge a `verified` result — only the instrument derives that

## Three levels of reproducibility

Stated separately because they are genuinely different, and blurring them would be the easiest lie in this repository:

| Level | Status |
|---|---|
| Package reproducible | **Yes** — rebuild the exact shipped bytes from the public commit; verified byte-identical across repeated mints |
| Minimal fixture reproducible | **Yes** — the fixture above |
| Full program publicly reproducible | **No** — auditable, but the frozen inputs, raw traces, and custody chains are controlled artifacts held outside this repository |

The public research manifest proves the presentation surfaces reconcile with one another. That is presentation integrity, **not** experimental reproduction. See `STUDY-CONTRACT.md`.
