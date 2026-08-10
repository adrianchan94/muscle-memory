import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const roots: string[] = [];

afterEach(() => {
  delete process.env.MM_AGENT;
  delete process.env.MM_STATE_DIR;
  delete process.env.MM_GLOBAL_SKILLS_DIR;
  delete process.env.MM_MESH_FEED;
  delete process.env.MM_PRIVATE_IDENTIFIERS;
  delete process.env.MM_REFLEX;
  delete process.env.MM_GUARD;
  delete process.env.MM_ADVANCED;
  delete process.env.MEMORY_DIR;
});

function installSkill(root: string, name: string) {
  const dir = join(root, "memory", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: Use when a script verifier fails and the source must be repaired before rerunning the exact command\n---\n\n## Procedure\n1. Read the failure.\n2. Fix the source.\n\n## Pitfalls\n### Guessing\nTELL: the same verifier still fails. Fix the source instead.\n\n## Verification\n- Rerun the exact verifier.\n\n<!-- muscle-memory provenance: fixture -->\n`);
}

function recordRepair(runtime: any, conv: string, command: string, sourceFile: string, label = "repair") {
  const failId = `${conv}-${label}-fail`;
  const editId = `${conv}-${label}-edit`;
  const passId = `${conv}-${label}-pass`;
  runtime.handlers.get("tool_start")({ toolName: "Bash", args: { command }, toolCallId: failId, conversationId: conv });
  runtime.handlers.get("tool_end")({ toolName: "Bash", toolCallId: failId, conversationId: conv, status: "error", output: "AssertionError: expected verified output" });
  runtime.handlers.get("tool_start")({ toolName: "Edit", args: { file_path: sourceFile, old_string: "broken", new_string: "fixed" }, toolCallId: editId, conversationId: conv });
  runtime.handlers.get("tool_end")({ toolName: "Edit", toolCallId: editId, conversationId: conv, status: "success", output: "source updated" });
  runtime.handlers.get("tool_start")({ toolName: "Bash", args: { command }, toolCallId: passId, conversationId: conv });
  runtime.handlers.get("tool_end")({ toolName: "Bash", toolCallId: passId, conversationId: conv, status: "success", output: "tests passed" });
}

function reviewerContext(skill: string) {
  return {
    agent: { id: "claim-dogfood-agent" },
    model: { id: "claim-dogfood", provider: "test" },
    conversation: {
      async fork() {
        return {
          async sendMessageStream() {
            return (async function* () { yield skill; })();
          },
        };
      },
    },
  };
}

async function activateIsolated(options: { client?: any } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mm-claim-experience-"));
  roots.push(root);
  process.env.MM_AGENT = "claim-dogfood-agent";
  process.env.MM_STATE_DIR = join(root, "state");
  process.env.MM_GLOBAL_SKILLS_DIR = join(root, "global");
  process.env.MM_MESH_FEED = join(root, "mesh-skill-feed.jsonl");
  process.env.MM_PRIVATE_IDENTIFIERS = "claim-dogfood-agent,sandbox-peer";
  process.env.MM_ADVANCED = "on";
  process.env.MEMORY_DIR = join(root, "memory");

  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const handlers = new Map<string, any>();
  const permissions: any[] = [];
  const letta = {
    capabilities: {
      tools: true,
      commands: true,
      permissions: true,
      ui: { panels: true },
      events: { tools: true, lifecycle: true, turns: true, llm: true, compact: true },
    },
    tools: { register(def: any) { tools.set(def.name, def); return () => {}; } },
    commands: { register(def: any) { commands.set(def.id, def); return () => {}; } },
    permissions: { register(def: any) { permissions.push(def); return () => {}; } },
    events: { on(name: string, fn: any) { handlers.set(name, fn); return () => {}; } },
    ui: { openPanel() { return { update() {}, close() {} }; } },
    client: options.client ?? {},
  };
  const entry = join(import.meta.dir, "../mods/index.ts");
  const build = await Bun.build({
    entrypoints: [entry],
    outdir: root,
    naming: "claim-bundle.mjs",
    target: "node",
    format: "esm",
  });
  if (!build.success) throw new Error(build.logs.map(String).join("\n"));
  const mod = await import(`${pathToFileURL(join(root, "claim-bundle.mjs")).href}?claim=${Date.now()}-${Math.random()}`);
  const deactivate = mod.default(letta);
  const dispose = () => {
    try { deactivate?.(); } finally { rmSync(root, { recursive: true, force: true }); }
  };
  return { root, tools, commands, handlers, permissions, dispose };
}

test("claim experience · an agent cannot rate a skill that is not installed", async () => {
  const runtime = await activateIsolated();
  const output = await runtime.tools.get("rate_skill").run({
    args: {
      skill: "hallucinated-skill",
      rating: "up",
      reason: "It seemed useful on the next task",
    },
    model: { id: "claim-dogfood", provider: "test" },
  });

  expect(String(output)).toContain("not recorded");
  expect(String(output)).toContain("not installed");
  expect(existsSync(join(runtime.root, "state", "rating-reasons.jsonl"))).toBe(false);
  runtime.dispose();
});

test("claim experience · the manual rate command also refuses an uninstalled skill", async () => {
  const runtime = await activateIsolated();
  const result = await runtime.commands.get("muscle-memory").run({
    argv: ["rate", "hallucinated-skill", "up", "seemed useful"],
    model: { id: "claim-dogfood", provider: "test" },
  });

  expect(String(result.output)).toContain("not recorded");
  expect(String(result.output)).toContain("not installed");
  expect(existsSync(join(runtime.root, "state", "rating-reasons.jsonl"))).toBe(false);
  runtime.dispose();
});

test("claim experience · an isolated state root never reads the real shared squad feed", async () => {
  const runtime = await activateIsolated();
  writeFileSync(
    join(runtime.root, "mesh-skill-feed.jsonl"),
    JSON.stringify({ agent: "sandbox", type: "skill_graduated", skill: "sandbox-only-skill", route: "GRADUATE" }) + "\n",
  );
  const result = await runtime.commands.get("muscle-memory").run({ argv: ["squad"] });

  expect(String(result.output)).toContain("sandbox-only-skill");
  expect(String(result.output)).not.toContain("release-gate");
  runtime.dispose();
});

test("claim experience · Decision Report is the consumer home and the technical surfaces stay discoverable in filmroom", async () => {
  const runtime = await activateIsolated();
  const home = String((await runtime.commands.get("muscle-memory").run({ argv: [] })).output);
  expect(home).toContain("MUSCLE MEMORY · DECISION REPORT");
  expect(home).toContain("START · declare a real procedural gap");
  expect(home).not.toContain("reps observed");
  expect(home).not.toContain("mature candidates");

  const filmroom = String((await runtime.commands.get("muscle-memory").run({ argv: ["filmroom"] })).output);
  for (const surface of ["wins", "ratings", "roster", "prescribe", "lifecycle", "coverage", "engram", "audit", "rate", "mine", "publish", "shelf"]) {
    expect(filmroom).toContain(surface);
  }
  runtime.dispose();
});

test("claim experience · repeated real repairs visibly update the right existing skill without shelf bloat", async () => {
  const runtime = await activateIsolated();
  const skillDir = join(runtime.root, "memory", "skills", "repairing-failing-script-runs");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `---\nname: repairing-failing-script-runs\ndescription: Use when a script run fails: edit the source and rerun the same script until it passes.\nmetadata:\n  source: human-reviewed\n  status: active-runtime-skill\n---\n\n## When to use\nUse after a test or build verifier fails.\n\n## Procedure\n1. Read the failure.\n2. Fix the source.\n3. Rerun the same verifier.\n\n## Pitfalls\n### Editing the expectation\nTELL: production behavior stays broken. Fix source code instead.\n\n## Verification\n- The exact failing command passes.\n\n<!-- muscle-memory provenance: fixture -->\n`);
  recordRepair(runtime, "repair-1", "npm test", "src/auth.ts");
  recordRepair(runtime, "repair-2", "bun test", "src/cart.ts");
  recordRepair(runtime, "repair-3", "python -m pytest", "src/orders.py");

  const plan = await runtime.tools.get("muscle_memory_skill_read").run({
    args: { action: "reflect_plan" },
    agent: { id: "claim-dogfood-agent" },
  });
  const authored = `---\nname: repairing-failing-script-runs\ndescription: Use when a script run fails and source changes must be proven by rerunning the same script until it passes\n---\n\n## When to use\nUse after a test, build, or package verifier fails.\n\n## Procedure\n1. Preserve the original failure output.\n2. Trace the defect to source code before changing expectations.\n3. Apply the narrowest source repair.\n4. Rerun the exact command that failed.\n\n## Pitfalls\n### Switching verifiers\nTELL: the original command remains red. Return to the same verifier.\n\n## Verification\n\n\u0060\u0060\u0060bash\nnpm test -- src/auth.test.ts\n\u0060\u0060\u0060\n\n- The exact original verifier exits successfully.\n- Adjacent checks remain green.\n`;
  const ctx: any = reviewerContext(authored);
  ctx.args = { action: "reflect", mode: "staged" };
  const result = await runtime.tools.get("muscle_memory_lifecycle_run").run(ctx);
  // `staged` now means staged for updates too, so the live shelf is untouched until someone
  // graduates. This test used to assert the live file changed on a staged run, which is
  // precisely the promise the docs made and the code broke.
  const staged = await runtime.tools.get("muscle_memory_lifecycle_run").run({
    args: { action: "graduate", name: "repairing-failing-script-runs" },
    agent: { id: "claim-dogfood-agent" },
  });
  expect(JSON.stringify(staged)).toMatch(/graduat/i);
  const updated = readFileSync(join(skillDir, "SKILL.md"), "utf8");
  const siblingSkills = readdirSync(join(runtime.root, "memory", "skills"));
  const events = await runtime.commands.get("muscle-memory").run({ argv: ["events", "20"] });

  expect(String(plan)).toContain('UPDATE-FIRST → "repairing-failing-script-runs"');
  expect(String(result)).toContain("Updated existing skill");
  expect(String(result)).toContain("anti-bloat");
  expect(updated).toContain("source: human-reviewed");
  expect(updated).toContain("status: active-runtime-skill");
  expect(updated).toContain("Switching verifiers");
  expect(siblingSkills).toEqual(["repairing-failing-script-runs"]);
  expect(String(events.output)).toContain("update-first");
  runtime.dispose();
});

test("claim experience · a novel repeated workflow survives the whole reversible agent lifecycle", async () => {
  const runtime = await activateIsolated();
  recordRepair(runtime, "novel-1", "node migrate-schema.js", "src/schema.ts", "script");
  recordRepair(runtime, "novel-1", "npm test", "src/schema.test.ts", "test");
  recordRepair(runtime, "novel-2", "python migrate_schema.py", "src/schema.py", "script");
  recordRepair(runtime, "novel-2", "npm test", "src/schema.test.ts", "test");
  recordRepair(runtime, "novel-3", "bun migrate-schema.ts", "src/schema-bun.ts", "script");
  recordRepair(runtime, "novel-3", "npm test", "src/schema.test.ts", "test");
  const name = "repairing-failing-script-runs";
  const authored = `---\nname: ${name}\ndescription: Use when a script run fails and must be repaired at source then rerun exactly\n---\n\n## When to use\nUse for recurring script failures that require a source edit and exact rerun.\n\n## Procedure\n1. Capture the original script failure.\n2. Repair the source, not the expectation.\n3. Rerun the exact script invocation.\n\n## Worked example\n\`\`\`text\nnpm test failed → Edit src/schema.ts → npm test → PASS\n\`\`\`\n\n## Pitfalls\n### Replacing the verifier\nTELL: a different command is green while the original remains red. Rerun the original.\n\n## Verification\n- The original script exits successfully.\n- No adjacent verifier regresses.\n`;
  const reflectCtx: any = reviewerContext(authored);
  reflectCtx.args = { action: "reflect", mode: "staged" };
  const reflected = await runtime.tools.get("muscle_memory_lifecycle_run").run(reflectCtx);
  const stagedPath = join(runtime.root, "state", "staged", name, "SKILL.md");

  expect(String(reflected)).toContain("Staged");
  expect(existsSync(stagedPath)).toBe(true);
  expect(existsSync(join(runtime.root, "memory", "skills", name, "SKILL.md"))).toBe(false);

  const graduated = await runtime.tools.get("muscle_memory_lifecycle_run").run({
    args: { action: "graduate", name },
    agent: { id: "claim-dogfood-agent" },
  });
  expect(String(graduated)).toContain("Graduated");
  expect(existsSync(join(runtime.root, "memory", "skills", name, "SKILL.md"))).toBe(true);

  const published = await runtime.tools.get("muscle_memory_lifecycle_run").run({
    // Publishing to the shared catalog is the one irreversible lifecycle action, so it now
    // takes an explicit opt-in. A consumer that wants it must say so.
    args: { action: "publish", name, approve: true },
    agent: { id: "claim-dogfood-agent" },
  });
  expect(String(published)).toContain("Published");
  expect(existsSync(join(runtime.root, "global", name, "SKILL.md"))).toBe(true);

  const retired = await runtime.tools.get("muscle_memory_skill_write").run({
    args: { action: "retire", name, reason: "preseason reversible-lifecycle dogfood", absorbed_into: "" },
    agent: { id: "claim-dogfood-agent" },
  });
  expect(String(retired)).toContain("Retired");
  expect(existsSync(join(runtime.root, "memory", "skills", name, "SKILL.md"))).toBe(false);

  const restored = await runtime.tools.get("muscle_memory_skill_write").run({
    args: { action: "restore", name },
    agent: { id: "claim-dogfood-agent" },
  });
  expect(String(restored)).toContain("Restored");
  expect(existsSync(join(runtime.root, "memory", "skills", name, "SKILL.md"))).toBe(true);

  runtime.handlers.get("tool_start")({ toolName: "Skill", args: { skill: name }, toolCallId: "next-possession-skill", conversationId: "next-possession" });
  runtime.handlers.get("tool_end")({ toolName: "Skill", toolCallId: "next-possession-skill", conversationId: "next-possession", status: "success", output: "Loaded the learned source-repair procedure" });
  const rated = await runtime.tools.get("rate_skill").run({
    args: { skill: name, rating: "up", reason: "The matching next task passed its exact verifier after using the learned procedure." },
    model: { id: "dogfood-model", provider: "test" },
  });
  const lifecycle = await runtime.commands.get("muscle-memory").run({ argv: ["lifecycle"] });
  expect(String(rated)).toContain(`RATING RECORDED · ${name} · helped`);
  expect(String(rated)).toContain("OUTCOMES · 1 helped · 0 missed · 1 rated");
  expect(String(lifecycle.output)).toBe([
    "💾 muscle-memory · skill lifecycle (creation → use → prune)",
    "",
    "🌱 staged · 1-tap to graduate (0)",
    "",
    "✅ active · earning context (1)",
    `   · ${name} — 1 uses · outcomes 1 helped / 0 missed · 📡 catalog`,
    "",
    "💤 idle · prune candidates (0)",
  ].join("\n"));
  runtime.dispose();
});

test("claim experience · a legacy agent mines old repair tape once and immediately sees reusable film", async () => {
  const messages: any[] = [];
  let sequence = 0;
  const push = (message: any) => messages.push({
    id: `message-${String(++sequence).padStart(2, "0")}`,
    date: `2026-07-20T00:${String(sequence).padStart(2, "0")}:00.000Z`,
    ...message,
  });
  for (let rep = 1; rep <= 3; rep++) {
    const conv = `legacy-${rep}`;
    const fail = `${conv}-fail`;
    const edit = `${conv}-edit`;
    const pass = `${conv}-pass`;
    push({ message_type: "tool_call_message", conversation_id: conv, tool_call: { name: "Bash", tool_call_id: fail, arguments: JSON.stringify({ command: "npm test" }) } });
    push({ message_type: "tool_return_message", conversation_id: conv, tool_call_id: fail, name: "Bash", status: "error", tool_return: "AssertionError: expected verified output" });
    push({ message_type: "tool_call_message", conversation_id: conv, tool_call: { name: "Edit", tool_call_id: edit, arguments: JSON.stringify({ file_path: `src/legacy-${rep}.ts`, old_string: "broken", new_string: "fixed" }) } });
    push({ message_type: "tool_return_message", conversation_id: conv, tool_call_id: edit, name: "Edit", status: "success", tool_return: "source updated" });
    push({ message_type: "tool_call_message", conversation_id: conv, tool_call: { name: "Bash", tool_call_id: pass, arguments: JSON.stringify({ command: "npm test" }) } });
    push({ message_type: "tool_return_message", conversation_id: conv, tool_call_id: pass, name: "Bash", status: "success", tool_return: "tests passed" });
  }
  const client = {
    agents: {
      messages: {
        async list(_agentId: string, params: any) {
          const start = params.after ? messages.findIndex((message) => message.id === params.after) + 1 : 0;
          return { data: messages.slice(start) };
        },
      },
    },
  };
  const runtime = await activateIsolated({ client });
  const command = runtime.commands.get("muscle-memory");
  const first = await command.run({ argv: ["mine", "legacy-agent"] });
  const second = await command.run({ argv: ["mine", "legacy-agent"] });
  const tape = readFileSync(join(runtime.root, "state", "experience.jsonl"), "utf8");

  expect(String(first.output)).toContain("mined 18 messages → 9 steps + 9 outcomes");
  expect(String(first.output)).toContain("repair chains in experience now: 1");
  expect(String(second.output)).toContain("mined 0 messages → 0 steps + 0 outcomes");
  expect(tape).toContain('"mined":true');
  expect(existsSync(join(runtime.root, "state", "mined-watermark.json"))).toBe(true);
  runtime.dispose();
});

test("claim experience · a compaction pause becomes a visible reflection boundary", async () => {
  process.env.MM_REFLECT = "staged";
  const runtime = await activateIsolated();
  for (const [conv, command, file] of [
    ["compact-1", "node verify.js", "src/one.ts"],
    ["compact-2", "python verify.py", "src/two.py"],
    ["compact-3", "bun verify.ts", "src/three.ts"],
  ]) {
    recordRepair(runtime, conv, command, file, "script");
    recordRepair(runtime, conv, "npm test", `${file}.test`, "test");
  }
  const name = "repairing-failing-script-runs";
  const authored = `---\nname: ${name}\ndescription: Use when recurring script failures need a source repair and exact rerun\n---\n\n## Procedure\n1. Preserve the failure.\n2. Repair source.\n3. Rerun the exact invocation.\n\n## Pitfalls\n### Blind retry\nTELL: the same failure repeats. Fix source before rerunning.\n\n## Verification\n- The exact original command passes.\n`;
  const ctx: any = reviewerContext(authored);
  runtime.handlers.get("compact_start")({ conversationId: "compact-boundary", trigger: "context-window", contextTokensBefore: 200000 }, ctx);
  const stagedPath = join(runtime.root, "state", "staged", name, "SKILL.md");
  for (let attempt = 0; attempt < 100 && !existsSync(stagedPath); attempt++) await Bun.sleep(10);
  runtime.handlers.get("compact_end")({ conversationId: "compact-boundary", trigger: "context-window", messagesBefore: 500, messagesAfter: 60, contextTokensBefore: 200000, contextTokensAfter: 40000 });
  const events = await runtime.commands.get("muscle-memory").run({ argv: ["events", "30"] });
  const receipts = readdirSync(join(runtime.root, "state", "receipts"));

  expect(existsSync(stagedPath)).toBe(true);
  expect(String(events.output)).toContain("compaction boundary → reflective review started");
  expect(String(events.output)).toContain("staged 'repairing-failing-script-runs'");
  expect(receipts.some((file) => file.startsWith("compact-") && !file.startsWith("compact-end-"))).toBe(true);
  expect(receipts.some((file) => file.startsWith("compact-end-"))).toBe(true);
  runtime.dispose();
});

test("claim experience · one agent can publish a sanitized skill for another to pull only into review", async () => {
  const archive = { id: "archive-squad", name: "mm-squad-shelf" };
  const passages: any[] = [];
  const client = {
    archives: {
      async list() { return { data: [archive] }; },
      async create() { return archive; },
      passages: {
        async create(_archiveId: string, input: any) { passages.push(input); return { id: `passage-${passages.length}` }; },
      },
    },
    agents: {
      archives: { async attach() { return {}; } },
      passages: {
        async search() { return { results: passages.map((passage) => ({ content: passage.text })) }; },
      },
    },
  };
  const runtime = await activateIsolated({ client });
  const name = "replaying-failed-verifiers";
  const activeDir = join(runtime.root, "memory", "skills", name);
  mkdirSync(activeDir, { recursive: true });
  writeFileSync(join(activeDir, "SKILL.md"), `---\nname: ${name}\ndescription: Use when another agent needs a portable verifier-recovery procedure\n---\n\n## When to use\nUse after a verifier fails.\n\n## Procedure\n1. Preserve the failure.\n2. Repair source.\n3. Rerun the exact verifier.\n\n## Pitfalls\n### Blind retry\nTELL: the same failure repeats. Update or retire this skill if it stops helping.\n\n## Verification\n- The original verifier passes.\n\n<!-- muscle-memory provenance: fixture -->\n`);
  const command = runtime.commands.get("muscle-memory");
  const staged = await command.run({ argv: ["publish", "stage", name], agent: { id: "publisher-agent" } });
  const shelfPublished = await command.run({ argv: ["shelf", "publish", name], agent: { id: "publisher-agent" } });
  const attached = await command.run({ argv: ["shelf", "attach"], agent: { id: "consumer-agent" } });
  rmSync(join(runtime.root, "state", "publish-staged", name), { recursive: true, force: true });
  const pulled = await command.run({ argv: ["shelf", "pull", name], agent: { id: "consumer-agent" } });
  const pulledPath = join(runtime.root, "state", "publish-staged", name, "SKILL.md");
  const pulledBody = readFileSync(pulledPath, "utf8");

  expect(String(staged.output)).toContain("staged SANITIZED publish");
  expect(String(shelfPublished.output)).toContain("shelf-published");
  expect(String(attached.output)).toContain("squad shelf attached");
  expect(String(pulled.output)).toContain("→ STAGED");
  expect(pulledBody).toContain("publisher: claim-dogfood-agent");
  expect(pulledBody).toContain("REVIEW BEFORE PROMOTION");
  expect(existsSync(join(runtime.root, "memory", "skills", "_pulled", name, "SKILL.md"))).toBe(false);
  runtime.dispose();
});

test("claim experience · learned failures surface an opt-in reflex and pre-action approval guard", async () => {
  process.env.MM_REFLEX = "on";
  process.env.MM_GUARD = "ask";
  const runtime = await activateIsolated();
  recordRepair(runtime, "defense-1", "npm test", "src/one.ts");
  recordRepair(runtime, "defense-2", "npm test", "src/two.ts");
  recordRepair(runtime, "defense-3", "npm test", "src/three.ts");
  for (let index = 1; index <= 3; index++) {
    const id = `deploy-fail-${index}`;
    runtime.handlers.get("tool_start")({ toolName: "Bash", args: { command: "deploy --production" }, toolCallId: id, conversationId: `deploy-${index}` });
    runtime.handlers.get("tool_end")({ toolName: "Bash", toolCallId: id, conversationId: `deploy-${index}`, status: "error", output: "PermissionError: production deploy denied" });
  }
  await runtime.handlers.get("conversation_close")({ conversationId: "defense-train", reason: "complete" }, {});

  const defenses = await runtime.tools.get("muscle_memory_skill_read").run({ args: { action: "defenses" } });
  expect(String(defenses)).toContain("npm test");
  expect(String(defenses)).toContain("deploy → denied");
  const permission = runtime.permissions[0];
  const guarded = permission.check({ phase: "approval", toolName: "Bash", args: { command: "deploy --production" } });
  runtime.handlers.get("tool_start")({ toolName: "Bash", args: { command: "npm test" }, toolCallId: "repeat-fail-1", conversationId: "next-possession" });
  const coached = runtime.handlers.get("tool_end")({ toolName: "Bash", toolCallId: "repeat-fail-1", conversationId: "next-possession", status: "error", output: "AssertionError: expected verified output" });
  runtime.handlers.get("tool_start")({ toolName: "Bash", args: { command: "npm test" }, toolCallId: "repeat-fail-2", conversationId: "next-possession" });
  const notSpammed = runtime.handlers.get("tool_end")({ toolName: "Bash", toolCallId: "repeat-fail-2", conversationId: "next-possession", status: "error", output: "AssertionError: expected verified output" });

  expect(guarded.decision).toBe("ask");
  expect(String(guarded.reason)).toContain("no recovery");
  expect(String(coached.result.output)).toContain("muscle-memory reflex");
  expect(String(coached.result.output)).toContain("known fix");
  expect(notSpammed).toBeUndefined();
  runtime.dispose();
});

test("claim experience · unsafe skill content is blocked before it can touch the active shelf", async () => {
  const runtime = await activateIsolated();
  const result = await runtime.tools.get("muscle_memory_skill_write").run({
    args: {
      action: "create",
      name: "handling-private-api-tokens",
      description: "Use when handling a private API token during a deployment workflow",
      body: "## Procedure\n1. Send Authorization: Bearer sk-live-1234567890abcdefghij to the endpoint.\n\n## Verification\n- Confirm the request succeeds.",
    },
    agent: { id: "claim-dogfood-agent" },
  });

  expect(String(typeof result === "string" ? result : result.content)).toContain("security blocked");
  expect(existsSync(join(runtime.root, "memory", "skills", "handling-private-api-tokens", "SKILL.md"))).toBe(false);
  runtime.dispose();
});

test("claim experience · shared-catalog publishing removes private agent and machine residue", async () => {
  const runtime = await activateIsolated();
  const name = "sanitizing-shared-skill-guidance";
  const dir = join(runtime.root, "memory", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: Use when a reusable procedure should be published without private operator residue\n---\n\n## When to use\nUse before sharing a procedure with another agent.\n\n## Procedure\n1. Ask claim-dogfood-agent and sandbox-peer to inspect /Users/chan2saucy/private/source.ts.\n2. Save a generic proof artifact after the check.\n\n## Pitfalls\n### Private paths\nTELL: the catalog copy contains a home-directory path. Update or retire this skill if that happens.\n\n## Verification\n- The generic shared copy contains no local path or private agent label.\n\n<!-- muscle-memory provenance: fixture -->\n`);
  const command = runtime.commands.get("muscle-memory");
  const preflight = await command.run({ argv: ["publish", name], agent: { id: "claim-dogfood-agent" } });
  const staged = await command.run({ argv: ["publish", "stage", name], agent: { id: "claim-dogfood-agent" } });
  const stagedBody = readFileSync(join(runtime.root, "state", "publish-staged", name, "SKILL.md"), "utf8");
  const approved = await command.run({ argv: ["publish", "approve", name] });
  const shared = readFileSync(join(runtime.root, "global", name, "SKILL.md"), "utf8");

  expect(String(preflight.output)).toContain("stage SANITIZED");
  expect(String(staged.output)).toContain("staged SANITIZED publish");
  expect(String(approved.output)).toContain("published");
  expect(stagedBody).not.toContain("/Users/chan2saucy");
  expect(stagedBody).not.toContain("claim-dogfood-agent");
  expect(stagedBody).not.toContain("sandbox-peer");
  expect(shared).not.toContain("/Users/chan2saucy");
  expect(shared).not.toContain("claim-dogfood-agent");
  expect(shared).not.toContain("sandbox-peer");
  expect(shared).toContain("<local path>");
  expect(shared).toContain("<agent>");
  runtime.dispose();
});

test("research embodiment · declared observed gaps get one model-aware prescription and healthy agents get abstention", async () => {
  const runtime = await activateIsolated();
  installSkill(runtime.root, "recovering-from-failing-script-runs");
  const healthy = await runtime.tools.get("muscle_memory_skill_read").run({
    args: { action: "prescribe", task: "A script verifier failed; repair the source and rerun the exact command.", gap_observed: false },
  });
  const matched = await runtime.tools.get("muscle_memory_skill_read").run({
    args: { action: "prescribe", task: "A script verifier failed; repair the source and rerun the exact command.", gap_observed: true },
    model: { id: "gap-model", provider: "test" },
  });
  await runtime.tools.get("rate_skill").run({
    args: { skill: "recovering-from-failing-script-runs", rating: "down", reason: "This model already knew the procedure; the extra context added drag.", task: "gap-model-check" },
    model: { id: "gap-model", provider: "test" },
  });
  const harmfulForModel = await runtime.tools.get("muscle_memory_skill_read").run({
    args: { action: "prescribe", task: "A script verifier failed; repair the source and rerun the exact command.", gap_observed: true },
    model: { id: "gap-model", provider: "test" },
  });
  const unmatched = await runtime.tools.get("muscle_memory_skill_read").run({
    args: { action: "prescribe", task: "Tune a satellite antenna polarization matrix.", gap_observed: true },
  });
  expect(String(healthy)).toContain("ABSTAIN");
  expect(String(healthy)).toContain("no observed/known procedure gap");
  expect(String(matched)).toContain('PRESCRIBE "recovering-from-failing-script-runs"');
  expect(String(matched)).toContain("runtime model test/gap-model: unproven");
  expect(String(matched)).toContain("gap diagnosis: caller-attested observed/known procedure gap");
  expect(String(matched)).toContain('Skill tool with skill="recovering-from-failing-script-runs"');
  expect(String(harmfulForModel)).toContain("ABSTAIN");
  expect(String(harmfulForModel)).toContain("negative field evidence for runtime model test/gap-model");
  expect(String(unmatched)).toContain("ABSTAIN");
  expect(String(unmatched)).toContain("no installed skill cleared the safe-match gate");
  runtime.dispose();
});

test("research embodiment · field outcomes advise roster moves without auto-retiring a skill", async () => {
  const runtime = await activateIsolated();
  const name = "repairing-failing-script-runs";
  const oneShot = "using-one-shot-guidance";
  installSkill(runtime.root, name);
  installSkill(runtime.root, oneShot);
  runtime.handlers.get("tool_start")({ toolName: "Skill", args: { skill: name }, toolCallId: "roster-use", conversationId: "roster-possession" });
  runtime.handlers.get("tool_start")({ toolName: "Skill", args: { skill: oneShot }, toolCallId: "one-shot-use", conversationId: "one-shot-possession" });
  await runtime.tools.get("rate_skill").run({
    args: { skill: oneShot, rating: "up", reason: "It helped once.", task: "one-shot" },
    model: { id: "dogfood-model", provider: "test" },
  });
  for (const task of ["possession-1", "possession-2", "possession-3"]) {
    await runtime.tools.get("rate_skill").run({
      args: { skill: name, rating: "down", reason: "The skill added drag and the exact verifier still failed.", task },
      model: { id: "dogfood-model", provider: "test" },
    });
  }
  const roster = await runtime.commands.get("muscle-memory").run({ argv: ["roster"] });
  expect(String(roster.output)).toContain("RETIREMENT REVIEW");
  expect(String(roster.output)).toContain("field 0 helped / 3 missed · 3 rated");
  expect(String(roster.output)).toContain(`HOLD · INSUFFICIENT EVIDENCE · ${oneShot}`);
  expect(String(roster.output)).toContain("field 1 helped / 0 missed · 1 rated");
  expect(String(roster.output)).toContain("minimum 3 rated tasks");
  expect(String(roster.output)).toContain("no automatic lifecycle changes");
  expect(existsSync(join(runtime.root, "memory", "skills", name, "SKILL.md"))).toBe(true);
  runtime.dispose();
});

test("claim experience · lifecycle view shows the next-task outcome rating", async () => {
  const runtime = await activateIsolated();
  installSkill(runtime.root, "systematic-debugging");
  await runtime.tools.get("rate_skill").run({
    args: {
      skill: "systematic-debugging",
      rating: "up",
      reason: "It prevented a repeat failure on the next task",
    },
    model: { id: "claim-dogfood", provider: "test" },
  });
  const lifecycle = await runtime.commands.get("muscle-memory").run({ argv: ["lifecycle"] });

  expect(String(lifecycle.output)).toContain("systematic-debugging");
  expect(String(lifecycle.output)).toContain("outcomes 1 helped / 0 missed");
  runtime.dispose();
});

test("claim experience · agents can revisit a visible ratings scoreboard after the next possession", async () => {
  const runtime = await activateIsolated();
  installSkill(runtime.root, "systematic-debugging");
  const rating = await runtime.tools.get("rate_skill").run({
    args: {
      skill: "systematic-debugging",
      rating: "up",
      reason: "It found the source defect before another patch loop",
      task: "claim-dogfood",
    },
    model: { id: "claim-dogfood", provider: "test" },
  });
  const board = await runtime.commands.get("muscle-memory").run({ argv: ["ratings"] });

  expect(String(rating)).toContain("RATING RECORDED · systematic-debugging · helped");
  expect(String(rating)).toContain("OUTCOMES · 1 helped · 0 missed · 1 rated");
  expect(String(rating)).not.toMatch(/🏀|plus-minus|\(\+1\/-0\)/);
  expect(String(board.output)).toContain("FIELD RATINGS · next-task outcomes");
  expect(String(board.output)).toContain("systematic-debugging · 1 helped · 0 missed · 1 rated");
  runtime.dispose();
});
