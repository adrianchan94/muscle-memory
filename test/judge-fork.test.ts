// judgeViaFork · in-mod judge adapter — fake fork contexts, zero network.
// Pins the guard ladder: no fork surface → undefined (lane silently off);
// fork failure → null (graceful canary fallback); good stream → parsed judgement;
// and the end-to-end wire: MM_RERANK=on parks a duplicate BEFORE the author is ever called.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeViaFork, reviewAndAuthor } from "../mods/autopilot";

function ctxWithStream(chunks: string[]): any {
  return {
    conversation: {
      fork: async () => ({
        sendMessageStream: async () => (async function* () { for (const c of chunks) yield { type: "text", text: c }; })(),
      }),
    },
  };
}

const OLD_RERANK = process.env.MM_RERANK;
const OLD_NATIVE = process.env.MM_NATIVE;
afterEach(() => {
  if (OLD_RERANK === undefined) delete process.env.MM_RERANK; else process.env.MM_RERANK = OLD_RERANK;
  if (OLD_NATIVE === undefined) delete process.env.MM_NATIVE; else process.env.MM_NATIVE = OLD_NATIVE;
});

describe("judgeViaFork adapter", () => {
  test("no fork surface → undefined (rerank lane silently disabled)", () => {
    expect(judgeViaFork({})).toBeUndefined();
    expect(judgeViaFork(null)).toBeUndefined();
    expect(judgeViaFork({ conversation: {} })).toBeUndefined();
  });

  test("well-formed stream → parsed judgement", async () => {
    const judge = judgeViaFork(ctxWithStream(['{"same_job": true, "confidence": 0.9}']))!;
    expect(await judge("ev", { name: "n", description: "d" })).toEqual({ same_job: true, confidence: 0.9 });
  });

  test("fork throwing → null (routeSkillReranked falls back to canary gate)", async () => {
    const judge = judgeViaFork({ conversation: { fork: async () => { throw new Error("no model"); } } })!;
    expect(await judge("ev", { name: "n", description: "d" })).toBeNull();
  });

  test("garbage stream → null, never a fabricated verdict", async () => {
    const judge = judgeViaFork(ctxWithStream(["I think this is probably related, hard to say"]))!;
    expect(await judge("ev", { name: "n", description: "d" })).toBeNull();
  });
});

describe("end-to-end wire: reviewAndAuthor with MM_RERANK=on", () => {
  test("judge-confirmed duplicate parks BEFORE the author model is ever invoked", async () => {
    process.env.MM_RERANK = "on";
    process.env.MM_NATIVE = "passages";
    // one on-shelf paraphrase twin, zero lexical overlap with the evidence
    const dir = mkdtempSync(join(tmpdir(), "mm-wire-"));
    mkdirSync(join(dir, "recovering-wedged-service-deployments"), { recursive: true });
    writeFileSync(join(dir, "recovering-wedged-service-deployments", "SKILL.md"),
      "---\nname: recovering-wedged-service-deployments\ndescription: Use when a fleet update leaves a service half-updated and its units keep dying on start.\n---\n## Procedure\n1. Find the broken setting.");
    let authorCalls = 0;
    const author = async () => { authorCalls++; return "NOTHING-TO-SAVE"; };
    const judgeFn = async () => ({ same_job: true, confidence: 0.93 });
    const semanticFn = async () => [{ name: "recovering-wedged-service-deployments", rank: 0 }];
    const res = await reviewAndAuthor(
      "- recovered failure: kubectl rollout status stuck, pods CrashLoopBackOff · fix env var, kubectl apply",
      [dir], author, { semanticFn, judgeFn },
    );
    expect(res.action).toBe("none");
    expect(res.reason).toContain("recovering-wedged-service-deployments");
    expect(res.reason).toContain("LLM job-match confirmed, confidence 0.93");
    expect(authorCalls).toBe(0); // parked at the gate — the author never ran
  });

  test("MM_RERANK off → judgeFn ignored, shipped behavior untouched", async () => {
    delete process.env.MM_RERANK;
    process.env.MM_NATIVE = "passages";
    const dir = mkdtempSync(join(tmpdir(), "mm-wire-off-"));
    let judgeCalls = 0;
    const judgeFn = async () => { judgeCalls++; return { same_job: true, confidence: 1 }; };
    const res = await reviewAndAuthor("- recovered failure: some novel thing · fixed it", [dir],
      async () => "NOTHING-TO-SAVE", { semanticFn: async () => [], judgeFn });
    expect(judgeCalls).toBe(0);
    expect(res.action).toBe("none");
  });
});
