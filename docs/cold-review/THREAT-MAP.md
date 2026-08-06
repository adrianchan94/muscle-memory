# Threat map and coverage matrix

The security dogfood used to be a numbered list of scenarios whose source lived in `/tmp`. It was
deleted, and with it any way to say what "17/17" had actually covered. **S-numbered continuity is
dead.** Nobody quotes those numbers again.

This document replaces them. It is the spine: the threat classes we claim to defend, which
scenario exercises each, **what that scenario actually reaches**, and **what backs it up if the
scenario is weaker than it looks**.

## Why the reach column exists

Two scenarios in this suite passed for reasons that had nothing to do with the defence they were
named after.

- The evidence-tier forgery test asserted `scoreStatus !== "verified"`. That status is
  `exploratory` for unrelated reasons, so the test would have passed against a product with **no
  defence at all**. The real defence — forged rows counted as `unboundVerifiedDowngraded`, never
  `verifiedDecisions` — is stronger than what was being asserted.
- The replay test does not go red when the ledger's duplicate-outcome guard is disabled, because
  a second guard on the close path still refuses.

Both were found by asking *why* a test was green, not whether it was. Every row below therefore
declares its reach. A green whose reach is unmeasured is worth no more than a guard whose green
path is unexercised.

## Coverage matrix

Legend — **Reach**: `red-checked` = disabling the named defence turns the scenario red.
`behaviour` = asserts the observable contract; more than one guard can satisfy it.
`structural` = asserts code shape, not runtime behaviour.

| # | Threat class | Scenario | Reach | Redundancy / notes |
|---|---|---|---|---|
| T1 | Support-file write escapes the skill root via a directory symlink | `packed-containment-vectors` · dir-symlink write + remove | **red-checked** (`assertContained` symlink refusal) | write and remove tested separately; victim byte-checked |
| T2 | Containment refuses legitimate work on a symlinked shelf prefix | `packed-containment-vectors` · non-canonical root `write_file` | **red-checked** (lexical-vs-canonical comparison) | driven through the shipped advanced tool, not the library |
| T3 | Skill directory is itself a symlink out of the shelf | `packed-containment-vectors` · symlinked skill dir | **red-checked** (`resolveSkillDir` refusal) | read, list and tool-surface load all asserted |
| T4 | `../` skill name reads a file outside the shelf | `packed-containment-vectors` · traversal load | **red-checked** (`assertSafeSkillName`) | four hostile names; planted secret never returned |
| T5 | Containment breaks the green path | `packed-containment-vectors` · real dirs read/write/list | **behaviour** | the positive control for T1–T4; without it a refuse-everything build passes them all |
| T6 | Credit invented when nothing is installed | `g2-security-v2` · empty-shelf abstain | **behaviour** | close refuses `helped` against an `abstain` decision |
| T7 | A refuse-everything build passes a refusal-only suite | `g2-security-v2` · positive control | **behaviour** | guards every other row in this file |
| T8 | One authentic closure replayed onto a second possession | `g2-security-v2` · replay refused | **behaviour** — *not* red-checked | **two** guards: ledger rejects a second active outcome, close path rejects an already-closed possession. Disabling either alone leaves this green. Documented in-file. |
| T9 | On-disk `evidence_tier` upgraded to `verified` | `g2-security-v2` · tier forgery | **red-checked** (`unboundVerifiedDowngraded`) | asserts the counter moves *and* `verifiedDecisions` stays 0 |
| T10 | Hand-written outcome row mints credit | `g2-security-v2` · forged row | **behaviour** | ledger integrity goes `blocked`; closed count does not rise |
| T11 | In-memory state masquerading as a ledger | `g2-security-v2` · restart survival | **behaviour** | second process re-reads from disk |
| T12 | Absence of an instrument key presented as success | `g2-security-v2` · no-key status | **behaviour** | status must not read `verified` |
| T13 | Credit attributed to a skill that never ran | `g2-security-v2` · attribution | **behaviour** | asserts the ledger's recorded `skill`, the field that can vary. `verifiedDecisions` deliberately **not** asserted — it is 0 in every fixture here, so it would prove nothing |
| T14 | Key loss destroys history, or history lies | `g2-security-v2` · key removal | **behaviour** | rows and closed count preserved; nothing verified without the key |
| T15 | The loop only works on a fully featured host | `g2-security-v2` · AX1 tools-only | **behaviour** | prescribe + close complete with no commands/UI/events |
| T16 | Abstention presented as breakage | `g2-security-v2` · AX2 | **behaviour** | abstain must still carry a next step |
| T17 | The loop is too expensive to be worth it | `g2-security-v2` · AX3 | **behaviour** | bounded tool-call budget |
| T18 | Documented commands drift from the dispatcher | `documented-surface-contract` | **red-checked** | found `filmroom` on its first run |
| T19 | Claims table drifts from behaviour | `lifecycle-claims` | **red-checked** ×2 | auto-retire and turn_end choke point |
| T20 | Packed bundle differs from source; forgery/replay on shipped bytes | `packed-forgery-replay` (14) | **behaviour** | runs against the packed artifact |
| T21 | Smoke passes without the documented init path | `package-smoke` + K4 | **red-checked** by sabotage | bogus subcommand ⇒ smoke fails |

## Known gaps — not covered, not claimed

| Gap | Why it matters |
|---|---|
| Instrument **key rotation** retiring old claims while keeping the product working | rotation is the recovery path after key compromise; untested |
| A **drifted target** — artifact moves away from expected between registration and closeout | distinguishes a real repair from coincidence |
| **Sealed-manifest rewrite** after binding | the seal is only as good as its refusal to be re-cut |
| A **failed skill call** counted as an invocation | inflates exposure counts |
| A target **already correct** at registration earning credit | the "no procedural credit" claim |
| Ledger behaviour at **scale** (thousands of rows) | integrity checks are O(n) reads |

These are the honest remainder. They are named here so the absence is visible in the same document
that lists the coverage, rather than living in someone's memory.

## Rules this map enforces

1. Every scenario declares its reach. `behaviour` is allowed; pretending it is `red-checked` is
   not.
2. Every refusal-shaped area needs a positive control, or a refuse-everything regression passes it.
3. No scenario is counted twice under two names to inflate a total.
4. The suite lives in the repo and is re-minted into the review kit. Nothing load-bearing lives in
   `/tmp`.
