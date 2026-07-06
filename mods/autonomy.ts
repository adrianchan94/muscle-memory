// muscle-memory · AUTONOMY TENURE — the self-earning harness. docs/AUTONOMY.md governs.
//
// Trust as a ledger, not a toggle: the mod keeps a plus-minus on ITSELF, per action lane.
// Rungs are EARNED by mechanical streaks and lost instantly on any miss. The ledger is
// append-only with sequence numbers; any gap fails closed to L0. MM_AUTONOMY=off freezes
// every lane at L1 forever (total override). Human pins outrank the ladder in both directions.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR, appendJsonl, appendUiEvent, ensureDir } from "./core";

export const AUTONOMY_LEDGER = join(STATE_DIR, "autonomy-ledger.jsonl");
export const LANES = ["distill-create", "distill-update", "film-room-patch", "prune-retire", "catalog-sync"] as const;
export type Lane = (typeof LANES)[number];
export type Rung = 0 | 1 | 2 | 3; // OBSERVE · STAGE · AUTO+UNDO · AUTO+SPOT
export type Outcome = "proposed" | "approved" | "rejected" | "reverted" | "untouched_used" | "pin";

// Shared-state lanes can never self-promote past L1 (design guard #1).
export const SHARED_STATE_LANES: ReadonlySet<Lane> = new Set(["catalog-sync", "prune-retire"] as Lane[]);
export const PROMOTE_L2_STREAK = 20;
export const PROMOTE_L3_ACTIONS = 60;
export const COLD_START_DAYS = 14;

export type LedgerEntry = { seq: number; ts: number; lane: Lane; outcome: Outcome; ref?: string; rung?: Rung; weak?: boolean };

export function recordAutonomy(lane: Lane, outcome: Outcome, opts: { ref?: string; rung?: Rung; weak?: boolean; path?: string } = {}): LedgerEntry {
  const path = opts.path ?? AUTONOMY_LEDGER;
  const entries = readLedger(path);
  const e: LedgerEntry = { seq: entries.length, ts: Date.now(), lane, outcome, ref: opts.ref, rung: opts.rung, weak: opts.weak };
  ensureDir();
  appendJsonl(path, e);
  return e;
}

export function readLedger(path = AUTONOMY_LEDGER): LedgerEntry[] {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

export type LaneState = {
  lane: Lane; rung: Rung; pinned: Rung | null;
  streak: number;            // consecutive approved/untouched_used since last miss
  actionsAtRung: number;     // actions since reaching current rung
  misses: number;            // total rejections+reverts
  lastDemotion: { ts: number; reason: string } | null;
  tampered: boolean;
  frozen: boolean;           // MM_AUTONOMY off
};

/** Replay the append-only ledger into a lane's state. The LEDGER is the source of truth —
 * there is no cached rung to tamper with. Sequence gaps fail closed to L0. */
export function laneState(lane: Lane, opts: { path?: string; now?: number; env?: string } = {}): LaneState {
  const path = opts.path ?? AUTONOMY_LEDGER;
  const env = opts.env ?? process.env.MM_AUTONOMY ?? "off";
  const now = opts.now ?? Date.now();
  const all = readLedger(path);
  // tamper check: sequence must be dense from 0 (design guard #3)
  const tampered = all.some((e, i) => e.seq !== i);
  const entries = all.filter((e) => e.lane === lane);
  const frozen = env === "off";
  let pinned: Rung | null = null;
  let rung: Rung = 1; // STAGE default
  let streak = 0, actionsAtRung = 0, misses = 0;
  let lastDemotion: LaneState["lastDemotion"] = null;
  const installTs = all.length ? all[0].ts : now;
  const coldStartOver = now - installTs >= COLD_START_DAYS * 86400000;

  for (const e of entries) {
    if (e.outcome === "pin") { pinned = (e.rung ?? 1) as Rung; continue; }
    if (e.outcome === "approved" || e.outcome === "untouched_used") { streak++; actionsAtRung++; }
    else if (e.outcome === "proposed") { actionsAtRung++; }
    else if (e.outcome === "rejected" || e.outcome === "reverted") {
      misses++; streak = 0;
      if (rung > 1) { rung = (rung - 1) as Rung; lastDemotion = { ts: e.ts, reason: e.outcome }; }
      actionsAtRung = 0;
      continue;
    }
    // promotions (mechanical, in-replay so history determines rung deterministically)
    if (rung === 1 && streak >= PROMOTE_L2_STREAK && misses === 0 && coldStartOver && !SHARED_STATE_LANES.has(lane)) {
      rung = 2; actionsAtRung = 0;
    } else if (rung === 2 && actionsAtRung >= PROMOTE_L3_ACTIONS && streak >= PROMOTE_L3_ACTIONS) {
      rung = 3; actionsAtRung = 0;
    }
  }
  if (tampered) rung = 0;
  if (frozen && rung > 1) rung = 1;
  if (pinned !== null && !tampered) rung = frozen ? (Math.min(pinned, 1) as Rung) : pinned;
  return { lane, rung, pinned, streak, actionsAtRung, misses, lastDemotion, tampered, frozen };
}

export type ActMode = "observe" | "stage" | "auto";

/** The single consult point for every action site: what may this lane do right now? */
export function autonomyMode(lane: Lane, opts: { path?: string; now?: number; env?: string } = {}): ActMode {
  const st = laneState(lane, opts);
  if (st.rung <= 0) return "observe";
  if (st.rung === 1) return "stage";
  return "auto"; // L2/L3 — every auto action still snapshots + receipts (undo is law)
}

/** Human fiat: pin a lane to a rung (both directions), receipted. */
export function pinLane(lane: Lane, rung: Rung, opts: { path?: string } = {}): LedgerEntry {
  const e = recordAutonomy(lane, "pin", { rung, path: opts.path });
  appendUiEvent({ phase: "autonomy_pinned", summary: `autonomy: ${lane} pinned to L${rung} by human fiat`, route: "autonomy" });
  return e;
}

/** Render the system's own box-score row(s). */
export function renderAutonomy(opts: { path?: string; now?: number; env?: string } = {}): string {
  return LANES.map((l) => {
    const st = laneState(l, opts);
    const tag = st.tampered ? "⛔ L0 (ledger tamper — fail closed)" : `L${st.rung}${st.pinned !== null ? " 📌" : ""}`;
    return `  🤖 ${tag}  ${l}  (streak ${st.streak} · misses ${st.misses}${st.frozen ? " · FROZEN" : ""})`;
  }).join("\n");
}
