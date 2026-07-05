# The Film Room — bounded incremental skill maintenance (design v1)

**Date:** 2026-07-06 · **Author:** Mack · **Status:** design (implementation = next PR after reranker)
**This is the direct answer to Cameron's feedback (2026-07-04):** *"primarily improving existing
skills versus creating new skills… take inspiration from the work we do on the reflection agent
prompting… smaller kind of persistent incremental changes to existing skills."*

## 1. One line
After a session ends (or compacts), a **step-budgeted reflector** reads the conversation
**summary** — never the raw transcript — and files **PATCH_NOTE-sized edits into EXISTING
skills**, routed by the same production routing head that prevents duplicates, staged-first,
with tenured skills protected. Skills get *maintained*, not multiplied.

## 2. Triggers (Letta-native, all verified shipping in 0.27.x)
| Trigger | Primitive | Why |
|---|---|---|
| compaction boundary | `compact_start`/`compact_end` events (#3101) | natural "sleep" moment; summary freshly written |
| conversation close | existing MM close hook | end-of-session consolidation |
| sleeptime (server) | `enable_sleeptime` agents | fleet/cloud lane, later |

## 3. Input discipline (the "bounded" in bounded reflection)
- Read `ctx.conversationSummary` (ModContext, #3193) + MM's own session receipts (durable
  signals, defense hits). **NEVER the raw transcript** — cost and privacy bounded by design.
- **Step-count gate** mirroring Letta's own reflection agent (#3196): the reflector runs with a
  hard step budget (default ≤3 model calls per boundary: 1 route-confirm, 1 patch-author,
  1 lint-retry max). Budget exhausted → park a candidate note, never loop.

## 4. Output discipline: PATCH_NOTE, not rewrite (the v0.7 "court, not palace" rule)
The reflector may ONLY emit:
```
PATCH_NOTE { skill: <existing name>, section: Pitfalls|Procedure|Verification|Worked examples,
             op: append|amend, lines: <≤8 lines of markdown>, evidence_ref: <receipt> }
```
- ≤8 lines per patch; ≤2 patches per boundary; every patch carries an evidence receipt.
- Applied via the existing section-preserving update path (compareSkillSections guards) —
  a PATCH_NOTE can never drop sections or rewrite frontmatter (name/description immutable here).
- No matching existing skill (routing says CREATE)? → the note PARKS as a candidate for the
  normal reflect lane. **The film room never creates skills.** Creation stays where the gates are.

## 5. Routing & protection (reuse, don't rebuild)
- Target selection = `routeSkillReranked` (judge on: reads note + skill together) → only
  `update`-routed targets are patchable; `park-semantic`/`create` routes → candidate parking.
- **Tenure protection (Vault ladder, v0.7):** `tenured`/`pinned` skills accept PATCH_NOTEs into
  a shadow-diff staged copy only — promotion requires review or referee evidence
  (plus-minus ≥ threshold from the E7 ledger / SPM verdicts). Labile skills accept live patches
  in `auto` mode, staged in `staged` mode (default).
- **Referee coupling (v0.8):** each applied patch writes a ledger marker; if the skill's
  plus-minus DROPS over the next N uses (reconsolidation clause), the patch is auto-reverted to
  its pre-patch snapshot (kept alongside, hash-chained). Evidence beats pedigree — both directions.

## 6. Safety invariants
1. Film room runs ONLY at boundaries; never on the hot path.
2. Model output → same lint + security scan + section-preservation gates as reflect.
3. Every patch reversible: pre-patch snapshot + PATCH_NOTE receipt in RECEIPTS_DIR.
4. Synthetic-tape gate applies to evidence refs (the film room can't cite harness noise).
5. `MM_FILMROOM=off|staged|auto`, default `staged`. Off = zero behavior change.

## 7. Test plan (deterministic, fake summaries/judges — same style as rerank tests)
- summary w/ durable lesson matching existing skill → exactly one ≤8-line PATCH_NOTE staged
- lesson matching nothing → parked candidate, zero skill writes
- tenured target → shadow-diff only; pinned → shadow-diff + explicit review flag
- step-budget exhaustion mid-flow → clean park, no partial writes
- section-drop attempt in model output → rejected by compareSkillSections guard
- patch on skill whose plus-minus then drops (fixture ledger) → auto-revert fires
- MM_FILMROOM=off → byte-identical behavior to today

## 8. Why Cameron should like it (framing for the eventual PR)
It is his reflection-agent pattern (summary-fed, step-gated, incremental) applied to procedural
memory, on Letta's own primitives, with the anti-garbage machinery (routing + gates + referee)
already proven in #45 and the reranker branch. Small persistent improvements to existing skills —
his words, made executable.
