# HARDWOOD FRONTIER — research-backed levers toward SOTA agentic self-improvement
*(scouted 2026-07-07, Fable-depth pass. Each lever: research lineage → Letta fit → HARDWOOD
integration → how it's tested. Ordered by leverage ÷ effort. Nothing here ships without the
standing gates; several are v0.8/v0.9 flagship candidates.)*

## 1. 🎯 Contextual-bandit skill activation — "skills that know when to sit out"
**Research:** contextual bandits (LinUCB, Thompson sampling); mixture-of-experts gating.
**The insight from OUR data:** DELTA-HARD proved skill value is *signed by context* (+0.60 in
the prior gap, −0.50 where priors cover). Loading every skill everywhere pays the interference
tax constantly. So: treat skill *activation* as a bandit — arms = {load, sit-out} per skill,
reward = the plus-minus ledger *keyed by context class* (cwd/repo/task-verb fingerprint).
**Letta fit:** the E7 ledger already stores outcomes; add a context fingerprint per rating row.
The NEOCORTEX block / retrieval lane then loads only positive-expected-value skills for the
current context.
**Test:** deterministic — fixture ledger with context-split records → activation policy loads
skill in context A, benches it in context B. This is the interference cost SOLVED at runtime,
and nobody in the ecosystem has anything like it. **v0.8-adjacent, HIGH leverage.**

## 2. 🧪 Verified self-distillation — STaR with a referee
**Research:** STaR (Zelikman '22), ReST/ReST-EM (DeepMind '23) — keep only self-generated
traces that pass verification, retrain on them. We can't retrain weights — but skills ARE our
weights.
**Integration:** the miner currently distills from *recurrence*. Add the verification cut:
evidence rows are eligible for skill authorship only when their outcome receipt is green
(tool exit 0 / verified fix / positive rating). Failed-path lessons route to Pitfalls only via
their *recovery* receipt. Recurrence finds candidates; verification licenses them.
**Test:** tape with recurring-but-never-verified pattern → no skill; recurring+verified → skill.
**Effort: small (one gate in detect/gate.ts). Leverage: kills the last garbage vector.**

## 3. 📈 Failure-frontier curriculum — the benchmark that hunts
**Research:** automatic curriculum learning; POET (Wang '19) open-ended coevolution; AlphaZero
self-play. The eval shouldn't sample uniformly — it should live at the agent's failure boundary.
**Integration:** SPM's corpus scaffolder mines the agent's RECENT failure receipts (post
synthetic-tape gate), clusters by class, and drafts drills targeting classes where the last
plus-minus was weakest — then leak-pilots them per PREREG discipline. The benchmark difficulty
tracks the agent's edge automatically; solved classes rotate out (they'd hit the ceiling
effect), open wounds rotate in.
**Test:** fixture failure history → scaffolder emits drills only for unsolved classes.
**This makes SPM self-renewing — the season never runs out of games. v0.9 flagship.**

## 4. 🔄 Counterfactual spot-checks — production interference detection
**Research:** counterfactual policy evaluation; A/B holdouts in production ML.
**Integration:** occasionally (rate-limited, off-hot-path), when a session-with-skills FAILS,
SPM replays the failing step bare-armed on the self-hosted server (BYOK). If bare beats
loaded → an interference receipt lands against the loaded skills' ledgers automatically.
This is bounded auto-attribution done honestly: counterfactuals only on FAILURES, where the
cost of being wrong is a wasted replay, not a corrupted ledger.
**Test:** fixture failing step + stub server → interference row written; success paths never replay.

## 5. 😴 Spaced repetition / reconsolidation scheduling (deepen E9)
**Research:** SM-2/FSRS spaced-repetition schedulers; reconsolidation windows in memory
neuroscience (already the CLS/engram framing MM uses).
**Integration:** distill-at-forgetting exists; add the scheduler: each skill carries a review-due
timestamp from (uses, last plus-minus, tenure). Sleeptime/compact boundaries process only DUE
skills — bounded maintenance with a principled queue instead of scanning everything.
**Test:** fixture usage/ledger → due-queue ordering deterministic.

## 6. 🧬 Population selection across the squad (v0.9 squad shelf)
**Research:** population-based training (Jaderberg '17); cultural evolution of tool repertoires.
**Integration:** when Kev's and Mack's shelves both hold a same-job skill (judge-confirmed twin),
their ledgers COMPETE: the better record propagates via catalog-sync w/ scorecards; the loser
quarantines. Natural selection where fitness = receipts. Requires v0.9 transfer rails (built).
**Test:** two fixture shelves + ledgers → propagation picks the record, never the recency.

## 7. 🗣 Verbal reward shaping — the ledger talks to the film room
**Research:** Reflexion (Shinn '23) — verbal self-feedback as the gradient.
**Integration:** film-room author prompt gets the target skill's RECENT LEDGER LINE ("this skill
is 2-3 in its last 5 — losses were timeout-shaped") so patches aim at the observed failure mode,
not generic polish. One prompt line; the referee literally coaches the editor.
**Test:** prompt-assembly unit test (ledger line present when record exists).

## 8. 🕸 Skill dependency graphs → curriculum for NEW agents
**Research:** knowledge graphs / prerequisite structure learning.
**Integration:** co-activation edges (skills retrieved in the same sessions) + judge-verified
relatedness build a skill graph; a fresh agent onboards along a topological order — foundational
conventions before advanced plays. The v0.9 "day-one agent" story with structure.
**Maturity: design-only until squad shelf ships.**

## Ordering for the road
v0.8: #2 (verified distillation, small) + #7 (verbal reward, tiny) + #1 (bandit activation, the
flagship). v0.9: #3 (frontier curriculum) + #4 (counterfactual spot-checks) + #6 (population
selection). Every lever lands under the standing laws: prereg for any claim, deterministic tests
for any mechanism, the engine's label is the label.

*The through-line: everyone else is trying to make agents smarter. HARDWOOD's frontier is making
agent LEARNING measurable, targeted, and self-correcting — the compounding is the product.* 🏀
