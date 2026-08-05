#!/usr/bin/env node
/**
 * Dump the exact packed surface of the release candidate.
 *
 * Cold reviewers use this to answer, without trusting prose:
 *   - which files actually ship in the npm tarball
 *   - the per-file sha256 of every shipped file
 *   - whether the committed bundle matches a rebuild from source (parity)
 *   - whether review docs leaked into the tarball
 *
 *   node scripts/dump-package-manifest.mjs           # writes docs/cold-review/PACKAGE-MANIFEST.json
 *   node scripts/dump-package-manifest.mjs --stdout  # print instead of write
 *
 * Paths are repo-relative. No absolute machine paths are emitted.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stdoutOnly = process.argv.includes("--stdout");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// 1 · what npm says it will ship
const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" }))[0];

// 2 · the real tarball bytes
const staging = mkdtempSync(join(tmpdir(), "mm-manifest-pack-"));
execFileSync("npm", ["pack", "--pack-destination", staging], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const tarballName = readdirSync(staging).find((f) => f.endsWith(".tgz"));
const tarballBytes = readFileSync(join(staging, tarballName));

// 3 · source -> bundle parity: rebuild and compare against the committed bundle
const committedBundle = readFileSync(join(root, "mods", "index.bundled.mjs"));
const rebuildDir = mkdtempSync(join(tmpdir(), "mm-manifest-build-"));
const rebuiltPath = join(rebuildDir, "index.bundled.mjs");
execFileSync("bun", ["build", "mods/index.ts", "--target", "node", "--outfile", rebuiltPath], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const rebuiltBundle = readFileSync(rebuiltPath);

const shippedFiles = packed.files
  .map((f) => f.path)
  .sort()
  .map((path) => ({ path, bytes: readFileSync(join(root, path)).length, sha256: sha256(readFileSync(join(root, path))) }));

const reviewDocsInTarball = shippedFiles.filter((f) => f.path.startsWith("docs/"));

const manifest = {
  packageName: pkg.name,
  version: pkg.version,
  declaredFilesField: pkg.files,
  tarball: {
    name: tarballName,
    sha256: sha256(tarballBytes),
    bytes: tarballBytes.length,
    npmReportedSize: packed.size,
    npmReportedUnpackedSize: packed.unpackedSize,
    fileCount: packed.entryCount,
  },
  bundle: {
    path: "mods/index.bundled.mjs",
    committedSha256: sha256(committedBundle),
    rebuiltFromSourceSha256: sha256(rebuiltBundle),
    parity: sha256(committedBundle) === sha256(rebuiltBundle),
  },
  shippedFiles,
  assertions: {
    // review documentation must not silently ride into the consumer package
    noReviewDocsInTarball: reviewDocsInTarball.length === 0,
    bundleMatchesSource: sha256(committedBundle) === sha256(rebuiltBundle),
    everyShippedFileHashed: shippedFiles.every((f) => /^[a-f0-9]{64}$/.test(f.sha256)),
  },
};

rmSync(staging, { recursive: true, force: true });
rmSync(rebuildDir, { recursive: true, force: true });

const serialized = JSON.stringify(manifest, null, 2);
if (stdoutOnly) {
  console.log(serialized);
} else {
  mkdirSync(join(root, "docs", "cold-review"), { recursive: true });
  writeFileSync(join(root, "docs", "cold-review", "PACKAGE-MANIFEST.json"), serialized + "\n");
  console.log(`package manifest -> docs/cold-review/PACKAGE-MANIFEST.json (${shippedFiles.length} files, tarball ${manifest.tarball.sha256})`);
}

const failed = Object.entries(manifest.assertions).filter(([, v]) => v !== true).map(([k]) => k);
if (failed.length) {
  console.error(`PACKAGE MANIFEST ASSERTIONS FAILED: ${failed.join(", ")}`);
  process.exit(1);
}
