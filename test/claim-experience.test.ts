import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Keep the high-fidelity scenario suite in a child process: it intentionally rotates
// MEMORY_DIR/MM_STATE_DIR between clean-agent profiles, and must never race the package's
// other tests or touch the operator's real environment.
test("claim-to-experience gate passes in a fully isolated agent runtime", async () => {
  const root = mkdtempSync(join(tmpdir(), "mm-claim-gate-"));
  const scenario = join(import.meta.dir, "../scripts/claim-experience.test.ts");
  const proc = Bun.spawn(["bun", "test", scenario], {
    env: {
      ...process.env,
      MM_STATE_DIR: join(root, "state"),
      MM_GLOBAL_SKILLS_DIR: join(root, "global"),
      MM_MESH_FEED: join(root, "mesh-skill-feed.jsonl"),
      MEMORY_DIR: join(root, "memory"),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const output = `${stdout}\n${stderr}`;
  try {
    if (exitCode !== 0) throw new Error(`claim scenario failed (${exitCode})\n${output}`);
    expect(output).toContain("16 pass");
    expect(output).toContain("0 fail");
    expect(output).toContain("107 expect() calls");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
