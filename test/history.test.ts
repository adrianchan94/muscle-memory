// muscle-memory · E6 retroactive mining tests.
//
// CONTRACT under test: history replay must be identity-compatible with the live tap — the SAME
// fingerprint()/hash() step identity and the SAME classifyError() error classes, with mined:true
// on every record so audits can split replayed tape from live capture. mineAgentHistory consumes
// the Stainless page shape {items:[...]} (live-verified against agents.messages.list 2026-07-03 —
// THE regression to pin), walks the ascending cursor page-by-page, and never re-mines a span:
// the per-agent watermark becomes the next mine's `after` cursor.
// Run: `MM_STATE_DIR=$(mktemp -d) MM_GLOBAL_SKILLS_DIR=$(mktemp -d) bun test test/history.test.ts`
import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash } from "../mods/core";
import { classifyError, fingerprint } from "../mods/detect";
import { loadWatermarks, mineAgentHistory, minedRecords, parseHistoryMessage } from "../mods/history";

const DATE = "2026-07-03T08:00:00.000Z";

// ── parseHistoryMessage (pure) ──────────────────────────────────────────────────────────────

test("parseHistoryMessage: single tool_call → one call event with parsed args, wire ts and conv", () => {
  const ev = parseHistoryMessage({
    message_type: "tool_call_message", date: DATE, conversation_id: "conv-1",
    tool_call: { name: "Read", arguments: '{"file_path":"/tmp/a"}', tool_call_id: "tc-1" },
  });
  expect(ev).toEqual([{ kind: "call", ts: Date.parse(DATE), id: "tc-1", conv: "conv-1", tool: "Read", args: { file_path: "/tmp/a" } }]);
});

test("parseHistoryMessage: tool_calls ARRAY handled; entries missing name or id skipped; unparseable args → {}", () => {
  const ev = parseHistoryMessage({
    message_type: "tool_call_message", date: DATE,
    tool_calls: [
      { name: "Bash", arguments: '{"command":"ls"}', tool_call_id: "tc-a" },
      { arguments: "{}", tool_call_id: "tc-skip" },                        // no name → delta, skipped
      { name: "Bash", arguments: "{}" },                                   // no id → uncorrelatable, skipped
      { name: "Grep", arguments: "not json {", tool_call_id: "tc-b" },     // unparseable → empty fp basis
    ],
  });
  expect(ev.map((e) => e.id)).toEqual(["tc-a", "tc-b"]);
  expect(ev[1]).toMatchObject({ kind: "call", tool: "Grep", args: {} });
});

test("parseHistoryMessage: string return → ok mirrors status==='success', text verbatim, tool from name", () => {
  const ok = parseHistoryMessage({ message_type: "tool_return_message", date: DATE, tool_call_id: "tc-1", status: "success", tool_return: "done", name: "Read" });
  expect(ok).toEqual([{ kind: "return", ts: Date.parse(DATE), id: "tc-1", conv: null, tool: "Read", ok: true, text: "done" }]);
  const err = parseHistoryMessage({ message_type: "tool_return_message", date: DATE, tool_call_id: "tc-2", status: "error", tool_return: "ENOENT: no such file" });
  expect(err[0]).toMatchObject({ kind: "return", ok: false, tool: null, text: "ENOENT: no such file" });
});

test("parseHistoryMessage: content-part array return → text parts joined; non-text parts leave empty slots", () => {
  const ev = parseHistoryMessage({
    message_type: "tool_return_message", date: DATE, tool_call_id: "tc-3", status: "success",
    tool_return: [{ type: "text", text: "line1" }, { image: "…" }, { type: "text", text: "line2" }],
  });
  expect(ev[0]).toMatchObject({ kind: "return", ok: true, text: "line1\n\nline2" });
});

test("parseHistoryMessage: non-objects, unknown message types, and id-less returns → no events", () => {
  expect(parseHistoryMessage(null)).toEqual([]);
  expect(parseHistoryMessage("tool_call_message")).toEqual([]);
  expect(parseHistoryMessage({ message_type: "assistant_message", content: "hi" })).toEqual([]);
  expect(parseHistoryMessage({ message_type: "tool_return_message", status: "success", tool_return: "x" })).toEqual([]); // no tool_call_id
});

// ── minedRecords (pure) ─────────────────────────────────────────────────────────────────────

test("minedRecords: call rows carry the SAME fp/tmpl/h identity the live tap computes for the same input", () => {
  const args = { command: "git status", timeout: 5 };
  const { rows, outcomes } = minedRecords([{ kind: "call", ts: 1, id: "tc-9", conv: "c", tool: "Bash", args }]);
  expect(outcomes).toEqual([]);
  const { fp, tmpl } = fingerprint("Bash", args); // detect/core are the single identity source — mined ≡ live
  expect(rows).toEqual([{ ts: 1, conv: "c", tool: "Bash", fp, tmpl, h: hash(fp), id: "tc-9", mined: true }]);
});

test("minedRecords: ok return → err null; failed return → classifyError class token, never the raw payload", () => {
  const failText = "ENOENT: no such file or directory /very/secret/path";
  const { rows, outcomes } = minedRecords([
    { kind: "return", ts: 2, id: "a", conv: null, tool: "Bash", ok: true, text: "fine" },
    { kind: "return", ts: 3, id: "b", conv: null, tool: "Bash", ok: false, text: failText },
  ]);
  expect(rows).toEqual([]);
  expect(outcomes[0]).toMatchObject({ id: "a", ok: true, err: null, mined: true });
  expect(outcomes[1]).toMatchObject({ id: "b", ok: false, err: classifyError(failText, false), mined: true });
  expect(outcomes[1].err).toBe("enoent"); // stable class — the payload (path) must never leak into state
});

// ── mineAgentHistory (mock client, override state paths) ───────────────────────────────────

/** The exact live-verified Stainless page shape (agents.messages.list, 2026-07-03). */
const page = (items: unknown[]) => ({ items });

const freshPaths = () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-hist-"));
  return { log: join(dir, "experience.jsonl"), outcomes: join(dir, "outcomes.jsonl") };
};

test("mineAgentHistory: {items:[...]} page mined into override JSONL; batch counts + newest cursor reported", async () => {
  const paths = freshPaths();
  const client = { agents: { messages: { list: () => Promise.resolve(page([
    { id: "m-1", date: DATE, message_type: "tool_call_message", tool_call: { name: "Read", arguments: '{"file_path":"/tmp/a"}', tool_call_id: "tc-1" } },
    { id: "m-2", date: DATE, message_type: "tool_return_message", tool_call_id: "tc-1", status: "error", tool_return: "permission denied", name: "Read" },
    { id: "m-3", date: DATE, message_type: "assistant_message", content: "narration" }, // scanned, never mined
  ])) } } };
  const batch = await mineAgentHistory(client, "agent-a", { stateDirOverride: paths });
  expect(batch).toEqual({ rows: 1, outcomes: 1, scanned: 3, newestId: "m-3", newestTs: Date.parse(DATE) });
  const row: unknown = JSON.parse(readFileSync(paths.log, "utf8").trim());
  expect(row).toMatchObject({ tool: "Read", id: "tc-1", mined: true, fp: fingerprint("Read", { file_path: "/tmp/a" }).fp });
  const out: unknown = JSON.parse(readFileSync(paths.outcomes, "utf8").trim());
  expect(out).toMatchObject({ id: "tc-1", ok: false, err: "permission-denied", mined: true });
});

test("mineAgentHistory: full page continues with after=<last item id>; short page ends the walk", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const m = (id: string) => ({ id, date: DATE, message_type: "assistant_message" }); // cursor-only tape
  const pages = [page([m("m-1"), m("m-2")]), page([m("m-3")])];
  const client = { agents: { messages: { list: (_a: unknown, params: unknown) => {
    seen.push(params as Record<string, unknown>);
    return Promise.resolve(pages.shift() ?? page([]));
  } } } };
  const batch = await mineAgentHistory(client, "agent-b", { pageSize: 2, stateDirOverride: freshPaths() });
  expect(batch.scanned).toBe(3);
  expect(batch.newestId).toBe("m-3");
  expect(seen.length).toBe(2);                              // short page 2 stopped the walk — no third fetch
  expect(seen[0].after).toBeUndefined();                    // fresh agent, no watermark → walk from the start
  expect(seen[1]).toMatchObject({ after: "m-2", order: "asc" }); // resume cursor = last id of the previous page
});

test("mineAgentHistory: empty page, missing surface, and missing agent id → zeroed batch, never throws", async () => {
  const empty = { rows: 0, outcomes: 0, scanned: 0, newestId: null, newestTs: 0 };
  const client = { agents: { messages: { list: () => Promise.resolve(page([])) } } };
  expect(await mineAgentHistory(client, "agent-c")).toEqual(empty);
  expect(await mineAgentHistory({}, "agent-c")).toEqual(empty); // client lacks agents.messages.list
  expect(await mineAgentHistory(client, "")).toEqual(empty);
});

test("mineAgentHistory: watermark persists on real state and the NEXT mine resumes after it (no re-mining)", async () => {
  const seen: Array<Record<string, unknown>> = [];
  let items: unknown[] = [{ id: "m-9", date: DATE, message_type: "assistant_message" }];
  const client = { agents: { messages: { list: (_a: unknown, params: unknown) => {
    seen.push(params as Record<string, unknown>);
    const out = page(items); items = []; return Promise.resolve(out);
  } } } };
  const first = await mineAgentHistory(client, "agent-wm"); // no override → sandbox state, watermark saved
  expect(first.newestId).toBe("m-9");
  expect(loadWatermarks()["agent-wm"]).toEqual({ id: "m-9", ts: Date.parse(DATE) });
  const second = await mineAgentHistory(client, "agent-wm");
  expect(seen[1].after).toBe("m-9"); // the mined span is behind the cursor — never replayed
  expect(second.scanned).toBe(0);
});
