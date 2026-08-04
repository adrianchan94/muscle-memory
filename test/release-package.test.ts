import { test, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("packed artifact installs in isolation and exposes the v1 runtime surface", async () => {
  const proc = Bun.spawnSync(["node", "scripts/package-smoke.mjs", "--json"], {
    cwd: root,
    env: {
      ...process.env,
      MM_STATE_DIR: join(root, ".tmp-release-test-state"),
      MM_GLOBAL_SKILLS_DIR: join(root, ".tmp-release-test-global"),
      MEMORY_DIR: join(root, ".tmp-release-test-memory"),
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = new TextDecoder().decode(proc.stdout);
  const stderr = new TextDecoder().decode(proc.stderr);
  expect(proc.exitCode, stderr || stdout).toBe(0);
  const receipt = JSON.parse(stdout.trim().split("\n").at(-1) || "{}");
  expect(receipt.pass).toBe(true);
  expect(receipt.packageVersion).toBe("1.0.0-rc.2");
  expect(receipt.installedBundleExists).toBe(true);
  expect(receipt.tarballSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(receipt.tarballBytes).toBeGreaterThan(0);
  expect(receipt.registeredTools).toEqual(expect.arrayContaining([
    "muscle_memory_skill_read",
    "muscle_memory_prescribe",
    "muscle_memory_close",
    "muscle_memory_skill_write",
    "muscle_memory_lifecycle_run",
    "rate_skill",
  ]));
  expect(receipt.registeredCommands).toContain("muscle-memory");
  expect(receipt.registeredPermissions).toContain("muscle-memory-guard");
  expect(receipt.privatePathHits).toEqual([]);
  expect(receipt.missingRequiredFiles).toEqual([]);
});
