import { test, expect } from "bun:test";
import { evaluateGateResults } from "../scripts/release-gate-lib.mjs";

const greenCommands = [
  { name: "build", exitCode: 0 },
  { name: "tests", exitCode: 0 },
  { name: "routing", exitCode: 0 },
  { name: "live-smoke", exitCode: 0 },
  { name: "package-smoke", exitCode: 0 },
  { name: "diff-check", exitCode: 0 },
];

test("release gate passes only when commands, bundle parity, and package smoke all pass", () => {
  expect(evaluateGateResults({
    commands: greenCommands,
    sourceBundleSha256: "abc",
    checkedInBundleSha256: "abc",
    packageSmokePass: true,
  })).toEqual({ pass: true, failures: [] });
});

test("release gate names every failed proof instead of collapsing to a green summary", () => {
  expect(evaluateGateResults({
    commands: [...greenCommands, { name: "canary", exitCode: 2 }],
    sourceBundleSha256: "fresh",
    checkedInBundleSha256: "stale",
    packageSmokePass: false,
  })).toEqual({
    pass: false,
    failures: ["command:canary:exit=2", "bundle-parity", "package-smoke"],
  });
});
