# Possession Loop GATE scorecard — Letta Auto

Run date: 2026-08-12 UTC  
Branch: `dogfood/possession-loop-v2`

## Billing and authentication evidence

PASS — runtime secret `LETTA_API_KEY` present (not printed).

PASS — `letta backend cloud` → Default backend set to Letta Cloud.

PASS — Auto ping: `letta -p "Reply with the single word PONG" --new-agent --model auto --backend cloud` → `PONG`.

PASS — catalog route:

```json
{"display_name":"Auto","handle":"letta/auto","model":"auto","provider_name":"letta","tier":"letta-tier"}
```

No BYOK / OpenAI / Anthropic connect used.

## GATE scorecard

| Arm | Expected | Observed | Result |
|---|---|---|---|
| Off | File created; 0 gate_block | File created; 0 rows | PASS |
| On (`MM_GATE=on`, `MM_GATE_BLOCK_RE=SEAMPROBE`) | File blocked; intervention | File absent; 5 gate_block rows at tool_start | PASS |

## Verdict

PASS on Letta Cloud Auto. No Mini RAM. Cloud bay agent `bc-ac3adc05-0520-4835-b346-6238adc07b99` produced local commit `13928f4` on the VM; this commit records the results on the branch.
