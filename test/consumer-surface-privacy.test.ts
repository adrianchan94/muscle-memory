// A cold review found operator names shipped in consumer-visible runtime output:
// the empty squad feed told every user that two named individuals "appear here as they
// distill". These tests defend the boundary that defect crossed.
//
// They run against the PACKED artifact, not the working tree, so a source-only edit that
// forgets to rebuild the bundle cannot satisfy them.
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Personal operator names must never reach a consumer through shipped code or runtime output. */
const OPERATOR_NAMES = /\b(Mack|Kev|ULTRON|chan2saucy)\b/;

/**
 * Naming maintainers is the entire purpose of these files, so they are the only sanctioned
 * place for it. The allowlist is deliberately narrow: adding a path here is a claim that the
 * file is authorship metadata, not product surface.
 */
const SANCTIONED_AUTHORSHIP: Record<string, true> = { "package.json": true, LICENSE: true, "README.md": true, "CHANGELOG.md": true };

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

test("no personal operator name ships outside sanctioned authorship metadata", () => {
  const pkgRoot = packedPackage();
  const offenders: string[] = [];
  for (const file of walk(pkgRoot)) {
    const rel = relative(pkgRoot, file);
    if (SANCTIONED_AUTHORSHIP[rel]) continue;
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    text.split("\n").forEach((line, i) => {
      if (OPERATOR_NAMES.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 120)}`);
    });
  }
  expect(offenders).toEqual([]);
});

test("the squad empty state names no operator", () => {
  // Drive the real command path rather than grepping source: this is the surface the user sees.
  const pkgRoot = packedPackage();
  const runtimeRoot = mkdtempSync(join(tmpdir(), "mm-privacy-rt-"));
  mkdirSync(join(runtimeRoot, "state"), { recursive: true });
  const probe = join(runtimeRoot, "probe.mjs");
  const bundle = join(pkgRoot, "mods", "index.bundled.mjs");
  writeFileSync(probe, `
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(${JSON.stringify(bundle)}).href);
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
// empty feed: the exact state that leaked names
const res = await handler.run({ argv: ["squad"] });
if (typeof dispose === "function") dispose();
console.log(JSON.stringify(String(res?.output ?? res ?? "")));
`);
  const raw = execFileSync("node", [probe], {
    cwd: runtimeRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      MM_STATE_DIR: join(runtimeRoot, "state"),
      MM_GLOBAL_SKILLS_DIR: join(runtimeRoot, "global"),
      MEMORY_DIR: join(runtimeRoot, "memory"),
      MM_ADVANCED: "on",
    },
  });
  const output = JSON.parse(raw.trim().split("\n").at(-1)!);
  expect(output).toContain("no squad distillations yet");
  expect(output).not.toMatch(OPERATOR_NAMES);
  rmSync(runtimeRoot, { recursive: true, force: true });
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
