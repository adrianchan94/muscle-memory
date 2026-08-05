// Two cold reviews found operator identity shipping to consumers:
//   1. the empty squad feed named two individuals in user-visible output
//   2. meshAgentLabel() inferred an operator's name from a UUID fragment in MEMORY_DIR,
//      shipping both a private Letta agent id and a lowercase operator name
//
// The first version of this file missed (2) because its name pattern was case-sensitive and
// it had no concept of private identifiers. A test that cannot fail on the real defect is
// worse than no test, so these run against the PACKED artifact and cover both shapes.
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogPrivacyScan } from "../mods/publish";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Operator names, case-insensitive — `mack` slipped through a case-sensitive pattern once. */
const OPERATOR_NAMES = /\b(mack|kev|ultron|ultrxn|chan2saucy)\b/i;

/**
 * Private identifiers must never ship, anywhere, with no exemptions. Unlike operator names,
 * there is no legitimate reason for any of these to appear in a published package.
 */
const PRIVATE_TOKENS: Record<string, RegExp> = {
  "known agent-id fragment": /be7d4413|71b0883e/i,
  "letta agent id": /\bagent-(?:local-)?[0-9a-f-]{8,}/i,
  "uuid": /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  "home path": /\/Users\/[A-Za-z0-9._-]+/,
  "workspace path": /kevos-lab/i,
  "os username": /\bchan2saucy\b/i,
};

/**
 * Naming maintainers is the purpose of these files, so they may carry operator names —
 * README collaborator credit is intentional, not a leak. They get NO exemption from
 * PRIVATE_TOKENS.
 */
const AUTHORSHIP_MAY_NAME_PEOPLE: Record<string, true> = {
  "package.json": true,
  LICENSE: true,
  "README.md": true,
  "CHANGELOG.md": true,
};

let packedDir: string | null = null;
function packedPackage(): string {
  if (packedDir) return packedDir;
  const staging = mkdtempSync(join(tmpdir(), "mm-privacy-pack-"));
  execFileSync("npm", ["pack", "--pack-destination", staging], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  const tgz = join(staging, readdirSync(staging).find((f) => f.endsWith(".tgz"))!);
  const out = mkdtempSync(join(tmpdir(), "mm-privacy-x-"));
  execFileSync("tar", ["-xzf", tgz, "-C", out]);
  rmSync(staging, { recursive: true, force: true });
  packedDir = join(out, "package");
  return packedDir;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

test("no operator name ships outside sanctioned authorship metadata", () => {
  const pkgRoot = packedPackage();
  const offenders: string[] = [];
  for (const file of walk(pkgRoot)) {
    const rel = relative(pkgRoot, file);
    if (AUTHORSHIP_MAY_NAME_PEOPLE[rel]) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (OPERATOR_NAMES.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
  expect(offenders).toEqual([]);
});

test("no private identifier ships anywhere — no file is exempt", () => {
  const pkgRoot = packedPackage();
  const offenders: string[] = [];
  for (const file of walk(pkgRoot)) {
    const rel = relative(pkgRoot, file);
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      for (const [label, rx] of Object.entries(PRIVATE_TOKENS)) {
        // The README documents redaction using an illustrative path; it is the example, not a leak.
        if (rel === "README.md" && label === "home path" && line.includes("<local path>")) continue;
        if (rel === "README.md" && label === "home path" && line.includes("fingerprints")) continue;
        if (rx.test(line)) offenders.push(`${label}  ${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
      }
    });
  }
  expect(offenders).toEqual([]);
});

/** Run the packed bundle against a fake host and return whatever it reports for a probe. */
function probePacked(script: string, env: Record<string, string>): string {
  const pkgRoot = packedPackage();
  const runtimeRoot = mkdtempSync(join(tmpdir(), "mm-privacy-rt-"));
  const probe = join(runtimeRoot, "probe.mjs");
  const bundle = join(pkgRoot, "mods", "index.bundled.mjs");
  writeFileSync(probe, `const BUNDLE = ${JSON.stringify(bundle)};\n${script}`);
  const raw = execFileSync("node", [probe], {
    cwd: runtimeRoot,
    encoding: "utf8",
    env: { ...process.env, MM_STATE_DIR: join(runtimeRoot, "state"), MM_GLOBAL_SKILLS_DIR: join(runtimeRoot, "global"), ...env },
  });
  rmSync(runtimeRoot, { recursive: true, force: true });
  return JSON.parse(raw.trim().split("\n").at(-1)!);
}

const LABEL_PROBE = `
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(BUNDLE).href);
const label = (mod.__mm ?? mod).meshAgentLabel();
console.log(JSON.stringify(String(label)));
`;

test("the mesh agent label never derives identity from the filesystem", () => {
  // the exact MEMORY_DIR that used to yield an operator's name
  expect(probePacked(LABEL_PROBE, { MEMORY_DIR: "/tmp/x/agent-local-be7d4413-490c-4d42-aa91-7a2537c9b8a1/memory", MM_AGENT: "" })).toBe("agent");
  // an arbitrary one
  expect(probePacked(LABEL_PROBE, { MEMORY_DIR: "/tmp/some/random/path/memory", MM_AGENT: "" })).toBe("agent");
  // explicit configuration is still honoured
  expect(probePacked(LABEL_PROBE, { MEMORY_DIR: "/tmp/x/agent-local-be7d4413-490c/memory", MM_AGENT: "reviewer" })).toBe("reviewer");
});

test("the squad empty state names no operator", () => {
  const output = probePacked(`
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(BUNDLE).href);
let handler;
const letta = {
  capabilities: { tools: true, commands: true, permissions: true, ui: { panels: true }, events: {} },
  events: { on() { return () => {}; } },
  tools: { register() { return () => {}; } },
  commands: { register(def) { if (def.id === "muscle-memory") handler = def; return () => {}; } },
  permissions: { register() { return () => {}; } },
  ui: { openPanel() { return { update() {}, close() {} }; } },
  diagnostics: { report() {} },
  client: {},
};
const dispose = mod.default(letta);
const res = await handler.run({ argv: ["squad"] });
if (typeof dispose === "function") dispose();
console.log(JSON.stringify(String(res?.output ?? res ?? "")));
`, { MEMORY_DIR: "", MM_ADVANCED: "on" });
  expect(output).toContain("no squad distillations yet");
  expect(output).not.toMatch(OPERATOR_NAMES);
});

test("no relative link in the packed README points outside the tarball", () => {
  const pkgRoot = packedPackage();
  const shipped = new Set(walk(pkgRoot).map((f) => relative(pkgRoot, f)));
  const readme = readFileSync(join(pkgRoot, "README.md"), "utf8");
  const dead = [...readme.matchAll(/\[[^\]]*\]\((?!https?:|mailto:|#)([^)]+)\)/g)]
    .map((m) => m[1].replace(/^\.\//, "").split("#")[0])
    .filter((t) => t && !shipped.has(t));
  expect(dead).toEqual([]);
});

test("the private-identifier detector matches agent-id shape, not one hardcoded id", () => {
  // the id that used to be hardcoded must still be blocked
  expect(catalogPrivacyScan("uses agent-71b0883e for routing").ok).toBe(false);
  // and so must ids that were never enumerated - that is the point of matching the shape
  expect(catalogPrivacyScan("uses agent-local-be7d4413 for routing").ok).toBe(false);
  expect(catalogPrivacyScan("uses agent-deadbeef for routing").ok).toBe(false);
  // ordinary prose is untouched
  expect(catalogPrivacyScan("a normal skill about agent behaviour").ok).toBe(true);
});
