# THE FRONT OFFICE — the self-tuning, audit-governed harness
*(the third HARDWOOD product · thesis committed 2026-07-07 02:20 · novelty-checked same hour:
ingredient-level prior art exists — AgentFold/learned context mgmt, AutoTool/outcome-aware tool
selection, EvoDS — all as in-paper techniques; NO product/system found that unifies runtime
decisions under an audited, trust-laddered, self-earning ledger. Claim language calibrated
accordingly: "as far as our bounded search found.")*

## The dot everyone is missing
Every layer of the stack has learned to learn — EXCEPT the harness.
Models train. Memory consolidates. Skills distill (we built that). But the RUNTIME AROUND the
agent — which skills load, which tool schemas spend context, which model runs, which permissions
apply, when to compact, what enters the system prompt — is configured by **vibes and left static**.
The harness is the largest unmeasured decision surface in the agent stack, and it is decided
once, by hand, and never audited against outcomes.

Meanwhile our own receipts scream that these decisions have SIGNED value: a loaded skill was
worth +0.62 in the right context and −0.50 in the wrong one. If knowledge in context is signed,
then EVERY harness decision is signed — tool schemas, memory blocks, model choices, budgets.
Nobody is keeping that score.

## The thesis
**Treat the harness as a roster and the context window as a salary cap.** Every runtime
decision is a play; every play gets attributed an outcome; every decision CLASS accumulates a
box score; and configuration policies EARN autonomy over their own knobs exactly like our
lanes earn rungs — receipts first, instant demotion, human fiat above all.

The Front Office = the GM layer that manages the roster (skills, tools, blocks, models) under
the cap (tokens, latency, spend), using the box scores (SPM + the decision ledger), with trust
governance built in (autonomy tenure), all of it append-only auditable.

## Why this is HARNESS engineering, not another paper technique
The research answers "can a policy pick tools/context better?" in isolation. The unsolved
product problem is *governance*: no enterprise will let a runtime rewrite its own configuration
on vibes — and no static runtime can keep up with signed, shifting decision values. The missing
piece is exactly what we built this week for skills and lanes: **a trust machine** — measured
decisions, earned autonomy, undoable actions, append-only ledgers, tamper fail-closed, human
pins. The Front Office is that machinery pointed at the runtime itself. Letta-native: mods
already control tool surfaces, permission overlays, providers, events — we make the mod layer
LEARN, within rungs it has earned.

## The decision ledger (one schema, every knob)
`{ decision_class, context_fingerprint, choice, alternatives, cap_cost (tokens/latency/$),
outcome_ref, attribution_window, ts }` — same bones as the skill ledger and the autonomy
ledger. Decision classes, in build order:
1. **skill-activation** (FRONTIER #1 bandit — already designed; the beachhead)
2. **film-room mode / reflect cadence** (autonomy rungs already feed it)
3. **tool-schema roster** (which mod tools deserve their context bytes per project — measured
   by invocation×outcome vs cost; the mod-doctor's question, answered with receipts)
4. **model routing** (Fable-vs-cheap per step class — the economics our own week lived)
5. **compaction & block budgets** (when to sleep; which memory blocks earn their tokens)

## The product picture (HARDWOOD trilogy complete)
🟠 muscle-memory — the TRAINING system (what the agent knows)
🔵 Skill Plus-Minus — the OFFICIATING crew (what that knowledge is worth)
⚪ **The Front Office — the GENERAL MANAGER (what makes the roster, under the cap, with an audit trail)**
One ledger doctrine underneath all three: plays → records → earned trust → receipts forever.

## Why us, honestly
Because the hard part isn't the bandit math — it's that a self-tuning runtime is TERRIFYING
without the trust machinery, and we are the only crew that ships trust as a box score: sealed
holdouts, self-blocking instruments, autonomy tenure with tamper fail-closed, a culture where
demotions are marketing. The Front Office is unbuildable by vibes-driven teams — their first
bad auto-decision kills adoption. Ours arrives pre-governed.

## Build path (all deterministic-testable, all behind flags)
v0.9: decision ledger + skill-activation bandit (beachhead) + per-decision receipts in boxscore.
v0.9.5: tool-roster measurement (observe-only first — L0 by our own ladder, naturally).
v1.0: model-routing + budget knobs at L1-stage; the first published "harness plus-minus" chart.
Every knob starts at OBSERVE. Every promotion is earned. Every action undoable. The harness
never gets more freedom than its record justifies — that sentence is the product.

*Everyone else tunes agents. The Front Office signs them, benches them, and shows its work.* 🏀
