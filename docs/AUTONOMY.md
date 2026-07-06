# AUTONOMY TENURE — the self-earning harness (HARDWOOD north star)
*"Works without thinking" is not a switch you flip at install. It is a state the system EARNS,
lane by lane, with receipts — and loses instantly on a miss. Trust as a ledger, not a toggle.*

## The one-line thesis
Every other autonomous-agent product asks the user to grant trust up front (scary) or hides
behind permanent review gates (tiring). HARDWOOD does neither: **the mod keeps a plus-minus on
ITSELF, per action lane, and its permissions are a function of its own record.** The same
machinery that grades skills grades the system's judgment. Nobody in the ecosystem has this —
it is harness engineering, not prompting.

## The autonomy ladder (per LANE, never global)
Lanes: `distill-create` · `distill-update` · `film-room-patch` · `prune-retire` · `catalog-sync`.
Each lane holds its own record and its own rung:

| Rung | Behavior | Earned by (mechanical, receipted) |
|---|---|---|
| L0 OBSERVE | logs what it WOULD do; touches nothing | install default for risky lanes |
| L1 STAGE | acts into staged/shadow; human promotes | default for create/update lanes |
| L2 AUTO+UNDO | acts live; every action snapshotted + loudly receipted; silence ≠ consent — REVERT is one command and the undo window is advertised | ≥20 consecutive staged actions approved-or-untouched-and-later-used, 0 rejections, over ≥14 days |
| L3 AUTO+SPOT | acts live; review sampled (1-in-N audited) | ≥60 L2 actions, 0 reverts, referee lane green |

**Demotion is instant and cheap:** one human rejection/revert, or one referee regression tied to
the lane's action → drop a rung, receipt why, rebuild the streak. Evidence beats pedigree — the
reconsolidation clause applied to the system itself.

## The self-ledger (what makes it honest)
`autonomy-ledger.json`: per lane — proposals, approvals, rejections, reverts, untouched-then-used
count, current rung, streak, last demotion + reason. Every rung change writes a receipt AND a
UI event; the boxscore gains a system row: "🤖 the program itself: distill L1 (17/20 streak)".
The user can ALWAYS pin a lane to a rung (human fiat outranks the ladder, like pinned skills).

## Why this is "works without thinking" — honestly
- Day 1: nothing to configure; the mod observes and stages. Reviewing a staged skill is one look.
- Week 3: the lanes you kept approving got out of your way BY THEMSELVES — and showed you the
  streak receipt when they did it.
- Forever: anything that ever burns you re-enters review instantly, with the burn on its record.
The user never *grants* autonomy. They just stop being asked about things the record proves.

## The supporting organs (mostly already built)
- **Ambient verification** replaces manual ratings as fuel: counterfactual spot-checks on
  failures (FRONTIER #4), bandit activation records (FRONTIER #1), untouched-then-used
  signals (a staged skill the human never reviewed but the agent later invoked successfully =
  weak approval; schema marks it weak).
- **Self-healing BLOCKED states**: any BLOCKED/gate-failure receipt auto-files a repair
  candidate into the reflect lane (we lived this pattern all weekend; codify it).
- **Harness integration (the frontier-shifting part):** the rung state maps to REAL Letta
  harness surfaces — permission overlays / hooks — so L2 in `film-room-patch` literally widens
  the mod's own sanctioned permission rule for that action class, through the harness's own
  mechanism, with the ledger as justification. The mod edits its own leash — but only via the
  leash-maker's API, only per-lane, only with receipts, always revocable.

## Guard rails (non-negotiable, harness-enforced)
1. Lanes touching ANYTHING outside MM-managed state (shared catalog, global shelves) cap at L1
   without an explicit human pin to L2.
2. No lane may promote itself past L1 within 14 days of install (cold-start humility).
3. The autonomy ledger itself is append-only + committed; tampering = fail-closed to L0.
4. `MM_AUTONOMY=off` freezes everything at L1 forever. One env var, total override.
5. The synthetic-tape gate applies: self-ledger entries derived from harness/test runs never count.

## Build order
v0.8.5: self-ledger + rung state machine + boxscore row + demotion wiring (deterministic, ~1 day,
fully testable with fixture ledgers — the whole ladder is unit-testable like the vault was).
v0.9: untouched-then-used weak signals + spot-check fuel + permission-overlay mapping.
v1.0: the published claim — "the first agent system whose autonomy is a function of its own
audited track record." With the chart. With the n.

*The pitch in one breath: everyone else ships trust as a checkbox. HARDWOOD ships trust as a
box score. That's the frontier.* 🏀
