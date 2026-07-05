# PREREG · reranker v2 re-materialization + blind holdout

**Registered:** 2026-07-05 (before any reranker code or run exists on this branch)
**Author of holdout:** Mack (referee lane). Design under test: `docs/reranker-v2-design.md` (ULTRON/Adrian, 2026-07-04).
**Branch:** `letta/mm-reranker-v2-61468312` — everything in this doc is frozen as of the commit that introduces it.

## Why this prereg exists

The original live 16/16 result was measured in a `/tmp` prototype whose scripts and receipts no
longer exist, and the 16-case set has been selected against by five successive levers. Tonight's
run must therefore (a) re-materialize the result with durable, committed receipts, and (b) test
generalization on a blind holdout authored fresh and sealed before the first run.

## Frozen method (verbatim from the design doc §4 — any deviation burns the run)

**Stage A — candidate recall:** embed-search the `mm:skill` passage index for the evidence;
`top_k=12`; keep top on-shelf candidates (canaries stripped); do NOT gate suspect selection on the
canary floor in the rerank lane (recall is deliberately wide; precision is Stage B's job).
Judge the **top-1 on-shelf candidate** (pointwise), matching the prototype.

**Stage B — judge prompt (frozen, verbatim):**

- System: `You are a precision gate for a skill library. Decide whether a coding-session incident should be filed UNDER an existing skill (same underlying job-to-be-done, so the skill's procedure would actually resolve THIS incident) or logged as a NEW skill. Be strict: same_job=true ONLY if a good engineer would say 'that existing skill already covers this.' Reply STRICT JSON only: {"same_job": true|false, "confidence": 0.0-1.0}.`
- User: `Incident: <evidence>\nExisting skill — name: <name>; description: <desc>\nSame job?`
- Decision: park/update only if `same_job === true && confidence >= 0.6`; else CREATE.

**Decision tree (frozen):**
- `MM_RERANK=on` → the LLM judge is the sole precision gate for suspect parking; canary status is
  logged advisory-only. Lexical update routing and C-class corroboration boost are untouched.
- `MM_RERANK` off → current shipped behavior (canary-calibrated gate; live 15/16 baseline).

## Frozen judges

| Role | Model | Endpoint | Runs |
|---|---|---|---|
| Strong judge | `gemini-2.5-pro` | Gemini generateContent | ×2 (stability check) |
| Cheap judge (caveat 6.2a) | `gemini-2.5-flash-lite` | Gemini generateContent | ×1 |

Temperature 0 where the API honors it. Exact request/response bodies land in receipts.

**AMENDMENT 1 (2026-07-05, pre-observation — provider substitution, not lever tuning):**
originally pinned `glm-5.2` / `glm-4.5-air` via ZAI. Run `1783255233087` self-labeled BLOCKED:
all 42 judge calls returned http 429, root-caused by probe to ZAI error 1113 *"Insufficient
balance"* (account credit exhausted — receipt in the BLOCKED run + probe output). Zero judge
verdicts were ever observed from any model, so no judge-selection information exists to leak;
the swap to Gemini is infrastructure substitution recorded BEFORE the first scoring run.
Prompt, threshold, top-k, recall, and decision logic unchanged.

**AMENDMENT 2 (2026-07-05, pre-observation — judge family restored by product owner):**
Adrian's call: GLM judges preferred over Gemini. The in-flight Gemini run was KILLED UNREAD
mid-flight (no judge verdicts from any family have been observed by any decision-maker at the
time of this amendment — the only completed run remains the fully-BLOCKED 429 run). Judges
restored to the original pins: strong `glm-5.2` ×2, cheap `glm-4.5-air` ×1, via ZAI, pending
account recharge. Gemini fallback retired unused. Levers untouched. The scoring run happens
only after this amendment is committed.

## Data sets

1. **Original 16** (`test/routing-cases.ts`) — dev set. Purpose: does the evaporated 16/16
   reproduce? Labeled DEV; watched case: B1 (alembic ↔ schema twin, the canary lane's standing miss).
2. **Blind holdout 8** (`test/routing-holdout.ts`) — 1×A, 4×B, 3×D (incl. HD2, an adversarial
   domain-adjacent trap). C-class excluded by design: the corroboration boost path is unchanged by
   the reranker; its decision surface is B/D separation plus A regression.

## Pre-registered success criteria (claims allowed ONLY if met)

- **Dev set:** rerank lane ≥ 15/16, and specifically B1 parked on the correct twin. If 16/16 does
  not reproduce, the design doc's "proven" language is downgraded, not defended.
- **Holdout:** A 1/1 · B ≥ 3/4 parked-or-updated on the CORRECT twin · D 3/3 CREATE.
- **Stability:** strong-judge route decisions identical across both runs (else report as unstable).
- **Cheap judge:** reported as-is; no gating, but margins < 0.6 spread get flagged.

## Exclusion rules

- API/transport failures (timeout, non-JSON, 5xx) → row marked `error`, excluded from the
  numerator AND denominator, count reported. >2 errors in any lane → lane BLOCKED, no claim.
- No case may be edited, dropped, or reweighted after the first run. Judge output is never
  reinterpreted by hand.

## Claim language (pre-committed)

- If all criteria pass: *"re-materialized live: dev 16/16 reproduced, blind holdout X/8, receipts committed in-repo."*
- If holdout partially fails: *"dev-set result reproduces; blind holdout shows N/8 — generalization is weaker than the dev set suggests; documented, not shipped as 16/16."*
- Never externally: "16/16" without the holdout number beside it.

## Burn rule

Any tuning of prompt, threshold, top-k, or recall after observing holdout results burns
`test/routing-holdout.ts`; the next iteration requires a fresh sealed holdout.
