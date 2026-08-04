import { describe, expect, test } from "bun:test";
import { reviewForkAuthor } from "../mods/autopilot";

function countingCtx(chunksByCall: string[][]): { ctx: any; counts: { forks: number; sends: number } } {
  const counts = { forks: 0, sends: 0 };
  let sendIdx = 0;
  const forked = {
    sendMessageStream: async () => {
      counts.sends++;
      const chunks = chunksByCall[Math.min(sendIdx++, chunksByCall.length - 1)] || [""];
      return (async function* () { for (const c of chunks) yield { type: "text", text: c }; })();
    },
  };
  return {
    counts,
    ctx: {
      conversation: {
        fork: async () => { counts.forks++; return forked; },
      },
    },
  };
}

describe("reviewForkAuthor spawn hygiene", () => {
  test("reuses one hidden fork across repeated author calls", async () => {
    const { ctx, counts } = countingCtx([["FIRST"], ["SECOND"]]);
    const author = reviewForkAuthor(ctx);
    expect(await author("sys", "user1")).toBe("FIRST");
    expect(await author("sys", "user2")).toBe("SECOND");
    expect(counts.sends).toBe(2);
    expect(counts.forks).toBe(1);
  });
});
