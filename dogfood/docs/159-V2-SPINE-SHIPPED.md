# 159 — THE V2 SPINE: SHIPPED AND VALIDATED. (final wrap, 2026-08-12 ~23:00 HKT)
All controls two-sided; all edits flag-gated; live mod backed up at
~/.letta/mods/backups/muscle-memory.ts.bak-v2spine-20260812T143305Z (and ...esl-20260812T142346Z).

## SHIPPED TO THE LIVE MOD THIS SESSION (4 changes, each with a control)
1. **Intervention logging** (131/132): all 4 kinds write phase:"intervention" rows with kind+seam.
   Control: flag on -> 1 row, off -> 0. PASS on 0.30.19.
2. **ESL — Error Semantics Layer** (155/157/158): eslNormalize() -> {ok|error|unknown, source,
   retryable, evidence}, wired into all 3 `ok` sites incl. the outcome-ledger write. High-precision
   body patterns only; every disagreement logged as phase:"esl_disagree".
   Control (luna, live): forced-success -> ok=True, 0 disagreements; forced-fail -> provider said
   success (raw_ok=true, the MASKED-FAIL class) but ledger wrote ok=False, evidence [process_exited,
   enoent]. PASS. burst_kernel's apply_exec_status_unmask now returns "superseded_by_esl".
3. **Possession GATE at tool_start** (new): MM_GATE=on + MM_GATE_BLOCK_RE=<regex> blocks matching
   tool calls BEFORE execution with an explanation, and logs a gate_block row.
   Control: sonnet-5(Bash) on->blocked+row, off->executed; luna(exec_command) same. PASS BOTH LANES.
   This is the fix that makes MM FUNCTION on Anthropic lanes at all (Bash never emits tool_end —
   letta.js:183013 skips non-string returns, so nothing at tool_end ever ran there).
4. **close_prompt resurrection + shell-route fix**: pending keyed on pre-`|` call-id segment
   (SAFE whitelist kept, piped OpenAI-style ids no longer rejected); probe reads a.cmd AND
   a.command (Bash uses `command`, exec_command uses `cmd`).
   Control: close_prompt re-sweep on luna now yields kind="close_prompt" — HIT (was 0/3 before).

## THE MECHANISM WE CAN COIN — THE POSSESSION LOOP (universal, not Letta-specific)
Universal measured fact: the PRE-ACTION seam (tool_start / PreToolUse) is the ONLY seam that exists
and works on every lane; everything post-action is lane-specific and lies (tool_end absent on Bash,
status false 25-28%, arg keys + call-id formats drift per provider).
Three primitives, and a stack is POSSESSION-COMPLETE iff all three hold:
  GATE  — govern before the effect (block/rewrite at the pre-action seam)
  SENSE — never accept the harness's word; normalize ok|error|UNKNOWN with forced-± calibrated parsers
  CLOSE — write credit/learning ONLY from sensed truth; every intervention emits a receipt
Conformance kit = our two-sided controls: forced-success, forced-fail, forced-block arms. If a
ledger can't tell those apart, the agent is learning from lies. Rulers-first adoption (Ultron's
point): ship the 10-line diagnosis + conformance kit; MM = "the first possession-complete skill layer".

## THE CAUSAL CHAIN (the paper, ~85% collected)
  name->reach   1/14->6/6 p=1.8e-04 (glm-5.2) · 0/5->5/6 p=0.015 (glm-4.7) · opaque control 1/6
                => literal token overlap, not name quality (124/125)
  reach->success forced 38/40 vs sham 7/40, +0.775, Fisher p=5.1e-13, manipulation check 40/40 vs 8/40
  audit         190 cells, detector gate forced 40/40 vs sham 8/40 (116)
  REMAINING GAP: links on different models (name->reach on glm, reach->success on minimax-m3).
  Close with ~12-24 trials: rename manipulation on minimax-m3 in BenchFlow.
  NOVELTY VERDICTS (151): C1 activation-validity OPEN · C2 reach-as-mediator OPEN ·
  timing/dose/naming/methodology TAKEN (StepShield, ToolPreferences, BiasBusters, ABC, BenchGuard).

## PRODUCT TRUTH TABLE (what MM actually is now)
  learn-side   working at scale (12,730 events, 60 skills graduated) — NOW fed ESL-normalised truth
  gate-side    tool_start gate PROVEN both lanes, flag-gated OFF by default (set MM_GATE=on)
  nudge-side   shelf_nudge + apply_nudge verified firing; MM_PRESCRIBE_NUDGE still defaults off
  close-side   close_prompt works on plain-id lanes after the SAFE fix
  coaching     untested (needs warm defenses cache)

## STILL OPEN / NEXT
  - enable MM_GATE + MM_PRESCRIBE_NUDGE in the dogfood lane, watch intervention rows on real work
  - close the causal chain within-model (minimax-m3 rename cell, ~12 trials)
  - redesign 149 around the MIXED LIBRARY (always-allow loses, always-block loses, only
    discrimination wins — 152), with ITT-pure delivery handling + harness-owned audit (red team 150)
  - submissions still SUBMITTED=false; deadline 14:55 HKT 13-Aug; anthropic OAuth valid to 06:03 HKT
  - upstream-fileable: letta tool_end skips text-only ContentBlock[] (Bash) — bug/limitation,
    letta.js:183013-24, manager.d.ts:301-305
