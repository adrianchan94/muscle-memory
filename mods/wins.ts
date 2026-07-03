// muscle-memory · wins module — the visible-value ledger.
//
// Everything here is DETERMINISTIC arithmetic over receipts the lifecycle already writes
// (experience log, sessions, reflect receipts, defense hits, ui events, usage sidecar).
// No model calls, no new state — the wins surface can never claim something a receipt
// doesn't back. This is the dopamine layer: "what did watching your work actually buy you?"
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "./core";

export type SkillWin = { name: string; action: "create" | "update"; graduated: boolean; ts: number };

export type Wins = {
  reps: number;                 // tool calls observed
  sessions: number;             // conversations watched
  firstRepTs: number | null;
  skillsEarned: SkillWin[];     // creates (staged or graduated), newest first
  updatesFolded: SkillWin[];    // update-first routings (anti-bloat wins), newest first
  repeatsFlagged: number;       // pre-action defense hits (a learned scar matched before the tool ran)
  knownFixSurfaced: number;     //   … of which carried a known fix (kind: "fix")
  lastFlag: { step: string; errClass: string; defense: string; ts: number } | null;
  noiseRejected: number;        // env-noise items the negative filter kept out of skills
  skillUses: Array<{ name: string; uses: number }>; // top used managed skills
  timeToFirstSkillMs: number | null; // first rep → first earned skill
};

function readJsonl(path: string): unknown[] {
  if (!existsSync(path)) return [];
  const out: unknown[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip torn line */ }
  }
  return out;
}

function num(o: unknown, k: string): number | null {
  if (o && typeof o === "object" && k in o) { const v = Reflect.get(o, k); if (typeof v === "number") return v; }
  return null;
}

function str(o: unknown, k: string): string {
  if (o && typeof o === "object" && k in o) { const v = Reflect.get(o, k); if (typeof v === "string") return v; }
  return "";
}

/** Collect the wins ledger from a state dir (injectable for tests; defaults to the live one). */
export function collectWins(stateDir: string = STATE_DIR): Wins {
  const exp = readJsonl(join(stateDir, "experience.jsonl"));
  const convs = new Set<string>();
  let firstRepTs: number | null = null;
  for (const r of exp) {
    const c = str(r, "conv"); if (c) convs.add(c);
    const ts = num(r, "ts"); if (ts !== null && (firstRepTs === null || ts < firstRepTs)) firstRepTs = ts;
  }
  const sessions = new Set<string>(readJsonl(join(stateDir, "sessions.jsonl")).map((s) => str(s, "conv")).filter(Boolean));
  for (const c of convs) sessions.add(c);

  const skillsEarned: SkillWin[] = [];
  const updatesFolded: SkillWin[] = [];
  const receiptsDir = join(stateDir, "receipts");
  if (existsSync(receiptsDir)) {
    for (const f of readdirSync(receiptsDir)) {
      if (!/^reflect-\d+\.json$/.test(f)) continue;
      try {
        const r: unknown = JSON.parse(readFileSync(join(receiptsDir, f), "utf8"));
        const action = str(r, "action"); const name = str(r, "name"); const ts = num(r, "ts") ?? 0;
        if (!name) continue;
        const graduated = !str(r, "dir").includes("staged");
        if (action === "create") skillsEarned.push({ name, action: "create", graduated, ts });
        else if (action === "update") updatesFolded.push({ name, action: "update", graduated, ts });
      } catch { /* skip torn receipt */ }
    }
  }
  skillsEarned.sort((a, b) => b.ts - a.ts); updatesFolded.sort((a, b) => b.ts - a.ts);

  const hits = readJsonl(join(stateDir, "defense-hits.jsonl"));
  let knownFixSurfaced = 0;
  let lastFlag: Wins["lastFlag"] = null;
  for (const h of hits) {
    if (str(h, "kind") === "fix") knownFixSurfaced++;
    const ts = num(h, "ts") ?? 0;
    if (!lastFlag || ts > lastFlag.ts) lastFlag = { step: str(h, "step"), errClass: str(h, "errClass"), defense: str(h, "defense"), ts };
  }

  let noiseRejected = 0;
  for (const e of readJsonl(join(stateDir, "ui-events.jsonl"))) {
    if (str(e, "phase") !== "noise_rejected") continue;
    const m = str(e, "summary").match(/rejected (\d+)/);
    noiseRejected += m ? Number(m[1]) : 1;
  }

  const skillUses: Array<{ name: string; uses: number }> = [];
  const usagePath = join(stateDir, "skill-usage.json");
  if (existsSync(usagePath)) {
    try {
      const u: unknown = JSON.parse(readFileSync(usagePath, "utf8"));
      if (u && typeof u === "object") for (const [name, rec] of Object.entries(u)) {
        const uses = num(rec, "uses") ?? (typeof rec === "number" ? rec : 0);
        if (uses > 0) skillUses.push({ name, uses });
      }
    } catch { /* unreadable sidecar → no uses shown */ }
  }
  skillUses.sort((a, b) => b.uses - a.uses);

  const firstSkillTs = skillsEarned.length ? skillsEarned[skillsEarned.length - 1].ts : null;
  return {
    reps: exp.length, sessions: sessions.size, firstRepTs,
    skillsEarned, updatesFolded,
    repeatsFlagged: hits.length, knownFixSurfaced, lastFlag,
    noiseRejected, skillUses: skillUses.slice(0, 5),
    timeToFirstSkillMs: firstRepTs !== null && firstSkillTs !== null && firstSkillTs > firstRepTs ? firstSkillTs - firstRepTs : null,
  };
}

export function ago(ms: number, now: number = Date.now()): string {
  const d = Math.max(0, now - ms);
  if (d < 90_000) return "just now";
  if (d < 90 * 60_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 36 * 3_600_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
}

function span(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} minutes`;
  if (ms < 48 * 3_600_000) return `${Math.round(ms / 3_600_000)} hours`;
  return `${Math.round(ms / 86_400_000)} days`;
}

/** The highlight reel — honest, receipt-backed, and worth reading. */
export function renderWins(w: Wins, now: number = Date.now()): string {
  if (w.reps === 0) return "💾 muscle-memory · wins\n(no reps observed yet — work a real session and check back)";
  const L: string[] = ["💾 muscle-memory · wins — what watching your work bought you", ""];
  L.push(`  🎞  ${w.reps.toLocaleString()} reps watched across ${w.sessions} session${w.sessions === 1 ? "" : "s"}`);
  if (w.skillsEarned.length) {
    const grad = w.skillsEarned.filter((s) => s.graduated).length;
    L.push(`  🏅 ${w.skillsEarned.length} skill${w.skillsEarned.length === 1 ? "" : "s"} earned from your own work (${grad} graduated, ${w.skillsEarned.length - grad} staged)`);
    for (const s of w.skillsEarned.slice(0, 3)) L.push(`      · ${s.name} — ${ago(s.ts, now)}`);
  }
  if (w.updatesFolded.length) L.push(`  🧬 ${w.updatesFolded.length} lesson${w.updatesFolded.length === 1 ? "" : "s"} folded into existing skills instead of spawning duplicates`);
  if (w.repeatsFlagged) {
    L.push(`  🛡  ${w.repeatsFlagged} repeat-failure${w.repeatsFlagged === 1 ? "" : "s"} recognized before the tool ran${w.knownFixSurfaced ? ` (${w.knownFixSurfaced} with a known fix on file)` : ""}`);
    if (w.lastFlag) L.push(`      · last: ${w.lastFlag.step} → ${w.lastFlag.errClass} (${ago(w.lastFlag.ts, now)})`);
  }
  if (w.skillUses.length) {
    const total = w.skillUses.reduce((a, s) => a + s.uses, 0);
    L.push(`  📈 learned skills invoked ${total}× — top: ${w.skillUses[0].name} (${w.skillUses[0].uses}×)`);
  }
  if (w.noiseRejected) L.push(`  🧹 ${w.noiseRejected} env-noise item${w.noiseRejected === 1 ? "" : "s"} kept OUT of your skill library`);
  if (w.timeToFirstSkillMs !== null) L.push(`  ⏱  first rep → first earned skill: ${span(w.timeToFirstSkillMs)}`);
  if (!w.skillsEarned.length && !w.updatesFolded.length) L.push(`  🌱 no skills earned yet — patterns need ≥2 sessions to mature (that's the taste, not a bug)`);
  L.push("", "  every line above is backed by a receipt · /muscle-memory events");
  return L.join("\n");
}
