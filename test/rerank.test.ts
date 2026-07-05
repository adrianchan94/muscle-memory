// rerank v2 · deterministic decision-tree tests — fake judges, zero network.
// Every branch of the frozen decision tree (docs/prereg-reranker-holdout.md) is pinned here so
// the live bench can only differ from CI by the judge's answers, never by the plumbing.
import { describe, expect, test } from "bun:test";
import {
  parseJudgement, rerankUserPrompt, routeSkillReranked, RERANK_CONF_FLOOR, RERANK_SYSTEM_PROMPT,
  type JudgeFn,
} from "../mods/autopilot";

const yes = (conf: number): JudgeFn => async () => ({ same_job: true, confidence: conf });
const no = (conf: number): JudgeFn => async () => ({ same_job: false, confidence: conf });
const dead: JudgeFn = async () => { throw new Error("transport down"); };
const nullJudge: JudgeFn = async () => null;

const lexMiss = [{ name: "twin-skill", score: 4, matched: 1 }]; // below distinctive floor — lexical can never route
const desc = (n: string) => (n === "twin-skill" ? "Use when the same underlying job appears under different words." : "");
const onShelf = (n: string) => n === "twin-skill";

describe("routeSkillReranked — frozen decision tree", () => {
  test("B-shape: judge yes ≥ floor → park-semantic on the judged twin, receipt attached", async () => {
    const d = await routeSkillReranked("evidence text", lexMiss, [{ name: "twin-skill", rank: 0 }], onShelf, desc, yes(0.85));
    expect(d.route).toBe("park-semantic");
    expect(d.suspect).toBe("twin-skill");
    expect(d.judged).toEqual({ name: "twin-skill", same_job: true, confidence: 0.85 });
  });

  test("D-shape: judge no overrides even an aboveCanary rank-0 suspect → create", async () => {
    const d = await routeSkillReranked("evidence", lexMiss, [{ name: "twin-skill", rank: 0, aboveCanary: true }], onShelf, desc, no(0.98));
    expect(d.route).toBe("create");
    expect(d.suspect).toBeNull();
    expect(d.judged?.same_job).toBe(false);
  });

  test("confidence floor: yes below 0.6 does NOT park", async () => {
    const d = await routeSkillReranked("evidence", lexMiss, [{ name: "twin-skill", rank: 0 }], onShelf, desc, yes(0.59));
    expect(d.route).toBe("create");
    expect(RERANK_CONF_FLOOR).toBe(0.6);
  });

  test("judge transport failure → graceful fallback to shipped canary-gated suspect", async () => {
    const d = await routeSkillReranked("evidence", lexMiss, [{ name: "twin-skill", rank: 0, aboveCanary: true }], onShelf, desc, dead);
    expect(d.route).toBe("park-semantic"); // canary lane behavior, judged null
    expect(d.judged).toBeNull();
  });

  test("judge returning null → same graceful fallback", async () => {
    const d = await routeSkillReranked("evidence", lexMiss, [{ name: "twin-skill", rank: 0, aboveCanary: true }], onShelf, desc, nullJudge);
    expect(d.route).toBe("park-semantic");
    expect(d.judged).toBeNull();
  });

  test("A-shape: strong lexical routes update BEFORE the judge — judge never called", async () => {
    let calls = 0;
    const spy: JudgeFn = async () => { calls++; return { same_job: false, confidence: 1 }; };
    const strong = [{ name: "twin-skill", score: 30, matched: 5 }];
    const d = await routeSkillReranked("evidence", strong, [{ name: "twin-skill", rank: 0 }], onShelf, desc, spy);
    expect(d.route).toBe("update");
    expect(calls).toBe(0);
  });

  test("off-shelf rank-0 hit is transparent — judge sees the first ON-SHELF candidate", async () => {
    let judgedName = "";
    const spy: JudgeFn = async (_e, s) => { judgedName = s.name; return { same_job: true, confidence: 0.9 }; };
    const hits = [{ name: "stale-off-shelf", rank: 0 }, { name: "twin-skill", rank: 1 }];
    const d = await routeSkillReranked("evidence", lexMiss, hits, onShelf, desc, spy);
    expect(judgedName).toBe("twin-skill");
    expect(d.route).toBe("park-semantic");
  });

  test("no on-shelf candidate at all → judge not called → create", async () => {
    let calls = 0;
    const spy: JudgeFn = async () => { calls++; return { same_job: true, confidence: 1 }; };
    const d = await routeSkillReranked("evidence", lexMiss, [{ name: "stale-off-shelf", rank: 0 }], onShelf, desc, spy);
    expect(calls).toBe(0);
    expect(d.route).toBe("create");
  });
});

describe("parseJudgement — strict JSON extraction", () => {
  test("bare JSON", () => expect(parseJudgement('{"same_job": true, "confidence": 0.85}')).toEqual({ same_job: true, confidence: 0.85 }));
  test("fenced JSON", () => expect(parseJudgement('```json\n{"same_job": false, "confidence": 0.98}\n```')).toEqual({ same_job: false, confidence: 0.98 }));
  test("prose-wrapped JSON", () => expect(parseJudgement('Sure! Here is my verdict: {"same_job": true, "confidence": 0.7} hope that helps')).toEqual({ same_job: true, confidence: 0.7 }));
  test("think-tags stripped", () => expect(parseJudgement('<think>hmm</think>{"same_job": false, "confidence": 0.9}')?.same_job).toBe(false));
  test("garbage → null", () => expect(parseJudgement("the incident is clearly novel")).toBeNull());
  test("non-boolean same_job → null", () => expect(parseJudgement('{"same_job": "yes", "confidence": 0.9}')).toBeNull());
  test("missing confidence → 0 (fails the floor, never parks)", () => expect(parseJudgement('{"same_job": true}')).toEqual({ same_job: true, confidence: 0 }));
  test("confidence clamped to [0,1]", () => expect(parseJudgement('{"same_job": true, "confidence": 7}')?.confidence).toBe(1));
});

describe("frozen prompt integrity", () => {
  test("system prompt matches the prereg verbatim", () => {
    expect(RERANK_SYSTEM_PROMPT).toContain("precision gate for a skill library");
    expect(RERANK_SYSTEM_PROMPT).toContain("same underlying job-to-be-done");
    expect(RERANK_SYSTEM_PROMPT).toContain('STRICT JSON only');
  });
  test("user prompt shape", () => {
    expect(rerankUserPrompt("EV", "N", "D")).toBe("Incident: EV\nExisting skill — name: N; description: D\nSame job?");
  });
});
