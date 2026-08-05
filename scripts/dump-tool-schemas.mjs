#!/usr/bin/env node
/**
 * Dump the agent-facing tool surface from the *packed* artifact.
 *
 * Cold reviewers use this to confirm two claims without trusting prose:
 *   1. the default surface is lean (prescribe / close / bounded read)
 *   2. `muscle_memory_prescribe` really is a dedicated two-field contract
 *      (`task` + `gap_observed`, additionalProperties: false)
 *
 *   node scripts/dump-tool-schemas.mjs            # writes docs/cold-review/TOOL-SCHEMAS.json
 *   node scripts/dump-tool-schemas.mjs --stdout   # print instead of write
 *
 * Deterministic: no network, no machine paths in the output.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stdoutOnly = process.argv.includes("--stdout");

const staging = mkdtempSync(join(tmpdir(), "mm-schema-pack-"));
execFileSync("npm", ["pack", "--pack-destination", staging], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const tarball = join(staging, readdirSync(staging).find((f) => f.endsWith(".tgz")));

const consumer = mkdtempSync(join(tmpdir(), "mm-schema-consumer-"));
writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "mm-schema-consumer", private: true, version: "0.0.0", type: "module" }));
execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", tarball], { cwd: consumer, stdio: ["ignore", "ignore", "inherit"] });

const pkgName = JSON.parse(execFileSync("node", ["-p", "JSON.stringify(require('./package.json'))"], { cwd: root, encoding: "utf8" })).name;
const installedBundle = join(consumer, "node_modules", ...pkgName.split("/"), "mods", "index.bundled.mjs");

/** Activate the packed bundle against a fake Letta host and capture every registered surface. */
const probe = join(consumer, "probe.mjs");
writeFileSync(probe, `
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(${JSON.stringify(installedBundle)}).href);
const tools = [];
const commands = [];
const permissions = [];
const letta = {
  capabilities: { tools: true, commands: true, permissions: true, ui: { panels: true }, events: { tools: true, lifecycle: true, turns: true, llm: true, compact: true } },
  events: { on() { return () => {}; } },
  tools: { register(def) { tools.push({ name: def.name, description: def.description, parameters: def.parameters }); return () => {}; } },
  commands: { register(def) { commands.push(def.id); return () => {}; } },
  permissions: { register(def) { permissions.push(def.id); return () => {}; } },
  ui: { openPanel() { return { update() {}, close() {} }; } },
  diagnostics: { report() {} },
  client: {},
};
const dispose = mod.default(letta);
if (typeof dispose === "function") dispose();
console.log(JSON.stringify({ tools, commands, permissions }));
`);

const surfaceFor = (advanced) => {
  const runtimeRoot = mkdtempSync(join(tmpdir(), "mm-schema-runtime-"));
  const raw = execFileSync("node", [probe], {
    cwd: consumer,
    encoding: "utf8",
    env: {
      ...process.env,
      MM_STATE_DIR: join(runtimeRoot, "state"),
      MM_GLOBAL_SKILLS_DIR: join(runtimeRoot, "global"),
      MEMORY_DIR: join(runtimeRoot, "memory"),
      MM_ADVANCED: advanced ? "on" : "",
      MM_REFLECT: "",
      MM_AUTOPILOT: "",
      MM_GUARD: "",
    },
  });
  return JSON.parse(raw.trim().split("\n").at(-1));
};

const dflt = surfaceFor(false);
const advanced = surfaceFor(true);
const prescribe = dflt.tools.find((t) => t.name === "muscle_memory_prescribe");
const prescribeProps = Object.keys(prescribe?.parameters?.properties || {});

const report = {
  candidateVersion: JSON.parse(execFileSync("node", ["-p", "JSON.stringify(require('./package.json'))"], { cwd: root, encoding: "utf8" })).version,
  packageName: pkgName,
  defaultSurface: {
    toolNames: dflt.tools.map((t) => t.name),
    toolCount: dflt.tools.length,
    tools: dflt.tools,
  },
  advancedSurface: {
    toolNames: advanced.tools.map((t) => t.name),
    toolCount: advanced.tools.length,
  },
  commands: dflt.commands,
  permissions: dflt.permissions,
  assertions: {
    defaultSurfaceIsLean: dflt.tools.length <= 3,
    prescribeIsDedicatedTwoField:
      prescribeProps.length === 2 && prescribeProps.includes("task") && prescribeProps.includes("gap_observed"),
    prescribeRejectsExtraFields: prescribe?.parameters?.additionalProperties === false,
    advancedStrictlyExtendsDefault: dflt.tools.every((t) => advanced.tools.some((a) => a.name === t.name)),
  },
};

rmSync(staging, { recursive: true, force: true });
rmSync(consumer, { recursive: true, force: true });

const failed = Object.entries(report.assertions).filter(([, v]) => v !== true).map(([k]) => k);
const serialized = JSON.stringify(report, null, 2);

if (stdoutOnly) {
  console.log(serialized);
} else {
  mkdirSync(join(root, "docs", "cold-review"), { recursive: true });
  writeFileSync(join(root, "docs", "cold-review", "TOOL-SCHEMAS.json"), serialized + "\n");
  console.log(`tool schemas -> docs/cold-review/TOOL-SCHEMAS.json (default ${report.defaultSurface.toolCount} tools, advanced ${report.advancedSurface.toolCount})`);
}

if (failed.length) {
  console.error(`TOOL SURFACE ASSERTIONS FAILED: ${failed.join(", ")}`);
  process.exit(1);
}
