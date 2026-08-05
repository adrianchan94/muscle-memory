# Verify it yourself — `1.0.0-rc.3`

Every number we assert is reproducible from a clean clone. If any command below disagrees with our stated value, that is a **P0** finding.

Requires: `node` ≥ 20, `npm`, and `bun` (the bundler and test runner).

## 0 · Clone the exact candidate

```bash
git clone https://github.com/adrianchan94/muscle-memory.git
cd muscle-memory
git checkout release/muscle-memory-v1
git rev-parse HEAD
```

The frozen candidate commit is recorded in `FREEZE.txt` in this directory. If `git rev-parse HEAD` does not match it, you are not reviewing the frozen candidate.

```bash
git status --porcelain   # must print nothing
git diff --check         # must print nothing (no whitespace/conflict damage)
```

## 1 · Reproduce the exact tarball

The `.tgz` is deliberately **not committed**. Rebuild it:

```bash
npm ci
npm run build
npm pack
shasum -a 256 adrianchan94-muscle-memory-1.0.0-rc.3.tgz
wc -c  < adrianchan94-muscle-memory-1.0.0-rc.3.tgz
```

Expected:

```
1a7b35a0947f16aeb547aa1598932bfdac27ef20cc663f76d1e4c79875050a13
250335
```

> `npm pack` is byte-stable for a fixed file set and fixed contents. If your bytes differ, check `npm --version` first, then report the delta.
>
> If `npm pack` fails with `EACCES` / `EEXIST` under `~/.npm/_cacache`, your local npm cache is damaged — that is your machine, not the candidate. Re-run with an isolated cache: `npm_config_cache=$(mktemp -d) npm pack`.

## 2 · Reproduce the file manifest and source↔bundle parity

```bash
node scripts/dump-package-manifest.mjs --stdout
```

This rebuilds the bundle from `mods/index.ts` into a temp dir and compares it to the committed `mods/index.bundled.mjs`.

Assertions that must all be `true`:

- `bundleMatchesSource` — the shipped bundle is the source, compiled
- `noReviewDocsInTarball` — this review directory does **not** ship to consumers
- `everyShippedFileHashed`

The script exits non-zero if any assertion fails.

## 3 · Reproduce the tool surface

```bash
node scripts/dump-tool-schemas.mjs --stdout
```

This packs, installs into a throwaway consumer, activates the bundle against a fake Letta host, and dumps what actually registers.

Assertions that must all be `true`:

- `defaultSurfaceIsLean` — default surface is ≤3 tools
- `prescribeIsDedicatedTwoField` — exactly `task` + `gap_observed`
- `prescribeRejectsExtraFields` — `additionalProperties: false`
- `advancedStrictlyExtendsDefault` — `MM_ADVANCED=on` adds, never removes

Expected: default 3 tools, advanced 9.

## 4 · Run the gates

```bash
npm test          # unit + integration
npm run verify    # build + test + routing eval + live smoke + package smoke
node scripts/final-gate.mjs
```

Our recorded results on the frozen commit — all exit code `0`:

| Gate | Result |
|---|---|
| `npm test` | 241 pass / 0 fail · 880 expect() calls · 33 files |
| `npm run verify` | all stages green · `PACKAGE SMOKE: PASS` · `privatePathHits: []` |
| `node scripts/final-gate.mjs` | `"verdict": "PASS_RELEASE_CANDIDATE"` · checked-in bundle sha == independent rebuild sha |

## 5 · Fresh-temp install and runtime activation

```bash
npm run package:smoke
```

It packs the candidate, installs it into a **fresh temp consumer**, activates the bundle, registers a skill, drives `register_exact_file_verification` → `prescribe` → `verify_agent_possession`, and separately drives the lean `muscle_memory_prescribe` → `muscle_memory_close` path. It asserts a 64-hex tarball sha, bundle hash equality, and `privatePathHits: []`.

## 6 · Contamination / privacy scan

```bash
git ls-files -z | xargs -0 grep -rinE "prenetics|im8|adrianwebflows|/Users/" | grep -v CONTRIBUTING.md

mkdir -p /tmp/mm-scan
tar -xzf adrianchan94-muscle-memory-1.0.0-rc.3.tgz -C /tmp/mm-scan
grep -rinE "prenetics|im8|adrianwebflows|/Users/" /tmp/mm-scan || echo "clean"
```

Known and intended matches:

- `CONTRIBUTING.md` names `Prenetics` / `IM8` **only** inside the rule forbidding them. Not a leak.
- `demo.gif` (repo only, **not** packed) contains the byte sequence `im8` at offset 814317 inside LZW-compressed pixel data. Binary noise, not text.

## 7 · CI on clean Linux

Runs on `ubuntu-latest`. Run IDs are deliberately **not** listed in this file — a commit that
edits this file changes the head, so any inline ID would name a different commit than the one
you are reviewing.

The authoritative run IDs for the exact frozen commit are in the sealed archive's `MANIFEST.json`
(field `ci`). To confirm independently:

```bash
gh run list --branch release/muscle-memory-v1 \
  --json headSha,conclusion,url --jq '.[] | select(.headSha=="<FROZEN_SHA>")'
```

Every run for the frozen commit must be `success`.

### Why CI history before this range is red

Earlier runs failed **only on Linux** while passing on macOS. The cause was a real defect, not a flake: `mods/core.ts` captured the global skill shelf at *module load*, so the shelf depended on which file imported `mods/core` first. A test that sets `MM_GLOBAL_SKILLS_DIR` at module scope therefore redirected the runtime for every file loaded after it — and file ordering differs between platforms. The shelf is now resolved per call. Worth re-deriving yourself; it is the most interesting bug in the range.

## 8 · Pull request

<https://github.com/adrianchan94/muscle-memory/pull/2>
