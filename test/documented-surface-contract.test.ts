// K1 — the ghost-command class.
//
// `instrumentStatusLine` told operators to run `/muscle-memory instrument init`. The dispatcher
// had no such branch, so the single documented recovery path for a disabled verified lane was a
// dead end. Nothing caught it: every unit test passed, the docs read correctly, and the command
// simply did not exist.
//
// This walks the documentation and the runtime strings, extracts every command a reader is told
// to type, and asserts the dispatcher actually handles it. It is deliberately mechanical — the
// point is that it needs no author to remember the connection.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/** Sources a user or agent reads and might copy a command out of. */
const DOC_SOURCES = ["README.md", "MOD.md", "docs/cold-review/CLAIMS-AND-LIMITATIONS.md"];
/** Runtime strings that instruct the operator; these drift most easily. */
const RUNTIME_SOURCES = ["mods/instrument.ts", "mods/index.ts", "mods/ui.ts"];

/** Sub-commands the dispatcher actually implements, read from the source of truth. */
function implementedSubcommands(): Set<string> {
  const src = read("mods/index.ts");
  const found = new Set<string>();
  for (const m of src.matchAll(/sub === "([a-z0-9-]+)"/g)) found.add(m[1]!);
  return found;
}

/** Every `/muscle-memory <sub>` a reader is told to type. */
function documentedSubcommands(sources: string[]): Map<string, string> {
  const out = new Map<string, string>();
  // Only code-formatted references count. Prose ("run /muscle-memory for details") and help-table
  // rows ("/muscle-memory        private Decision Report") are not commands anyone copies, and
  // treating them as such produces false ghosts that would train people to ignore this test.
  for (const rel of sources) {
    const body = read(rel);
    // Markdown: backtick spans and fenced/indented command lines.
    // TypeScript: any quoted string literal, because runtime instructions live in messages, not
    // in backticks — and that is exactly where the ghost-init instruction lived. An extractor
    // that only reads markdown would have missed the defect this test exists to prevent.
    const spans = rel.endsWith(".ts")
      ? [...body.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)].map((m) => m[1]!)
      : [...body.matchAll(/`([^`\n]{0,120})`/g)].map((m) => m[1]!)
          .concat([...body.matchAll(/^\s{0,3}(?:\$ )?(\/muscle-memory[^\n]*)$/gm)].map((m) => m[1]!));
    for (const span of spans) {
      const m = /\/muscle-memory[ \t]([a-z][a-z0-9-]*)/.exec(span.trim());
      if (m && !out.has(m[1]!)) out.set(m[1]!, rel);
    }
  }
  return out;
}

test("every /muscle-memory command the docs tell you to type exists in the dispatcher", () => {
  const implemented = implementedSubcommands();
  expect(implemented.size).toBeGreaterThan(3);   // guard against the extractor silently matching nothing
  const documented = documentedSubcommands(DOC_SOURCES);
  expect(documented.size).toBeGreaterThan(0);
  const ghosts = [...documented].filter(([sub]) => !implemented.has(sub)).map(([sub, where]) => `${sub} (${where})`);
  expect(ghosts).toEqual([]);
});

test("every /muscle-memory command a runtime message tells you to run exists in the dispatcher", () => {
  // This is the one that would have caught instrument init: the instruction lived in a status
  // line, not in the docs, so a docs-only sweep would still have missed it.
  const implemented = implementedSubcommands();
  const documented = documentedSubcommands(RUNTIME_SOURCES);
  const ghosts = [...documented].filter(([sub]) => !implemented.has(sub)).map(([sub, where]) => `${sub} (${where})`);
  expect(ghosts).toEqual([]);
});

test("instrument init is reachable, and is the exact string the status line advertises", () => {
  const advertised = /\/muscle-memory[ \t]+([a-z]+[ \t]+[a-z]+)/.exec(read("mods/instrument.ts"))?.[1];
  expect(advertised).toBe("instrument init");
  expect(implementedSubcommands()).toContain("instrument");
});

test("every tool named in MOD.md is registered by the mod", () => {
  const src = read("mods/index.ts");
  const registered = new Set([...src.matchAll(/name:\s*"(muscle_memory_[a-z_]+|record_agent_possession|register_exact_file_verification|verify_agent_possession|rate_skill)"/g)].map((m) => m[1]!));
  expect(registered.size).toBeGreaterThan(3);
  const named = new Set([...read("MOD.md").matchAll(/`(muscle_memory_[a-z_]+|record_agent_possession|register_exact_file_verification|verify_agent_possession|rate_skill)`/g)].map((m) => m[1]!));
  const ghosts = [...named].filter((t) => !registered.has(t));
  expect(ghosts).toEqual([]);
});

test("every MM_ env flag the docs describe is read somewhere in the mod", () => {
  const code = ["mods/index.ts", "mods/core.ts", "mods/autopilot.ts", "mods/engram.ts", "mods/verification.ts", "mods/instrument.ts", "mods/possessions.ts", "mods/publish.ts"]
    .map(read).join("\n");
  const documented = new Set([...["README.md", "MOD.md"].map(read).join("\n").matchAll(/`(MM_[A-Z_]+)`/g)].map((m) => m[1]!));
  expect(documented.size).toBeGreaterThan(2);
  const ghosts = [...documented].filter((flag) => !code.includes(flag));
  expect(ghosts).toEqual([]);
});
