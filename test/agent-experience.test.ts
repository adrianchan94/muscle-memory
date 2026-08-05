// Agent-experience acceptance criteria.
//
// The sport voice is product identity for humans reading the README. An agent reading MOD.md or
// a tool result needs an unambiguous next call, not a metaphor it has to decode. These pin the
// separation so it cannot drift back.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAgentBoxScore } from "../mods/ui";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const modGuide = readFileSync(join(root, "MOD.md"), "utf8");

/** Human-brand and internal-project vocabulary that must never reach an agent surface. */
const HUMAN_ONLY_VOCAB = /\b(hardwood|box score|SPM|KevOS|film room|practice film)\b/i;

test("A5 · the packaged agent guide carries no human-brand or internal vocabulary", () => {
  const offenders = modGuide
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => HUMAN_ONLY_VOCAB.test(line))
    .map(({ line, n }) => `MOD.md:${n}  ${line.trim().slice(0, 100)}`);
  expect(offenders).toEqual([]);
});

test("A11 · the agent guide stays a contract, not a research paper", () => {
  // Research numbers and award badges belong in the README, which humans read.
  expect(modGuide).not.toMatch(/\+0\.58|\+0\.34|\+0\.05|μ\s?0\.9/);
  expect(modGuide).not.toMatch(/Mod Challenge|Winner —/i);
});

test("A6 · `possession` is defined where an agent first meets it", () => {
  const firstUse = modGuide.toLowerCase().indexOf("possession");
  expect(firstUse).toBeGreaterThan(-1);
  // a definition must appear within the same opening region, not 200 lines later
  const opening = modGuide.slice(0, firstUse + 900).toLowerCase();
  expect(opening).toMatch(/possession is|one possession per|a possession is/);
});

test("A7 · a zero-proven report explains itself instead of reading as failure", () => {
  const report = renderAgentBoxScore(
    {
      observedInterventions: 1, observedHelpfulInterventions: 1, observedHarmfulInterventions: 0,
      observedNeutralInterventions: 0, observedAbstentions: 0, observedSuccessfulAbstentions: 0,
      observedFailedAbstentions: 0, verifiedDecisions: 0, judgedDecisions: 1, pendingDecisions: 0,
      openedDecisions: 1, repeatCappedDecisions: 0, scoreStatus: "early_tape",
      exclusionReasons: {}, metricContract: "mm.efficiency.v2",
    } as never,
    { agent: "a", period: "all", skills: { active: 1, proven: 0 } },
  );
  expect(report).toContain("0 proven");
  // the gloss must sit in the same render, so `0 proven` is never a bare scoreline
  expect(report.toLowerCase()).toMatch(/integrity gate|judged path is enough|normal until/);
});

test("A9 · empty states tell the agent what to do next", () => {
  // A bare parenthetical dead-ends the loop; every empty surface needs an action or an all-clear.
  const bareParen = /"\(no [^"]*\)"/g;
  const indexSrc = readFileSync(join(root, "mods", "index.ts"), "utf8");
  const offenders = [...indexSrc.matchAll(bareParen)]
    .map((m) => m[0])
    .filter((s) => !/·|—|continue|run |set /i.test(s));
  expect(offenders).toEqual([]);
});
