# Dogfood: Possession Loop v2 (sandbox)

**Branch purpose:** disposable sandbox for Cursor cloud agents to load the *live* Scottie/Fable MM build into a throwaway Letta agent and evaluate GATE ∧ SENSE ∧ CLOSE — without touching Scottie’s court / `~/.prime` / Kaggle submit.

## Snapshot provenance (2026-08-12 HKT)
- `live-mod/muscle-memory.live.ts` — copy of `~/.letta/mods/muscle-memory.ts` after v2 spine ship
- `live-mod/muscle-memory.bak-v2spine.ts` — backup from `159` session
- `docs/159-V2-SPINE-SHIPPED.md` — mechanism write-up (GATE / SENSE / CLOSE)
- SHA256 in `live-mod/SHA256SUMS`

## Hard fences
- DO NOT edit Scottie runners, `~/.prime`, or live overnight court state
- DO NOT Kaggle submit
- Use a **throwaway** Letta agent / isolated `MM_STATE_DIR` only
- Prefer installing this snapshot into the sandbox agent’s mod path, not overwriting Adrian’s daily Letta mods unless explicitly asked

## Possession Loop conformance (minimum)
A stack is possession-complete iff:
1. **GATE** — `MM_GATE=on` blocks matching tool calls at `tool_start` (Bash + exec_command)
2. **SENSE** — ESL normalizes body evidence; forced-fail must write `ok=False` even if provider `raw_ok=true`
3. **CLOSE** — interventions emit receipts; credit only from sensed truth

Two-sided kit: forced-success, forced-fail, forced-block. Ledger must distinguish all three.

## Suggested cloud-agent recipe
1. Install Letta Code / local Letta using existing Cursor/user auth (OpenAI/Anthropic/Letta as available)
2. Install this live mod snapshot into a sandbox mods dir (do not clobber production without GO)
3. Export dogfood flags: `MM_GATE=on`, optional `MM_PRESCRIBE_NUDGE=on`, isolated `MM_STATE_DIR`
4. Run forced-success / forced-fail / forced-block arms; collect intervention + `esl_disagree` rows
5. Write `dogfood/RESULTS.md` with pass/fail per arm + gaps vs Possession Loop
6. Open follow-up PR only for sandbox refinements

## Flags (from 159)
- `MM_GATE=on` + `MM_GATE_BLOCK_RE=<regex>` — pre-action block
- `MM_PRESCRIBE_NUDGE` — defaults off; enable only in dogfood
- Learn-side already ESL-normalized in this live build
