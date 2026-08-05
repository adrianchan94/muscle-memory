# Verify this candidate yourself

Generated at seal time from the sealed artifact. Do not hand-edit —
the generator is `scripts/emit-freeze-docs.mjs`.

## The reproduction contract

`npm pack` produces a gzip-wrapped tar. The **gzip envelope** varies by packer version and
compression level; the **tar stream** inside does not. So the contract is the decompressed
stream:

| Artifact | sha256 |
|---|---|
| packed tarball (outer envelope, this machine) | `66c0522c2971af543f6cce8ffd2e35db83e0b72788cb9f0b469b0c69a3219783` |
| **decompressed tar stream (the contract)** | `bf2455a7c75d97987c10de4513433baac1070069a4345da1e33c8a7a7aae7d4a` |
| bundled entry `mods/index.bundled.mjs` | `d870254888c357ba853d66ea8770516dbbde6cdb0fae315e7fb92541012e2408` |
| packed file count | 23 |

```sh
npm ci && npm run build && npm pack
gunzip -c adrianchan94-muscle-memory-1.0.0-rc.3.tgz | shasum -a 256
# must equal the tar-stream sha above
```

If the outer .tgz sha differs but the tar-stream sha matches, **the artifact is correct** and
you are looking at gzip-envelope drift. That is expected across npm/node versions and is not
a defect to report.

## Gates

| Command | Expected |
|---|---|
| `npm test` | 323 pass, 0 fail, 42 files — counted from a real run at seal time |
| `npm run verify` | all stages green, exit 0 |
| `node scripts/final-gate.mjs` | `PASS_RELEASE_CANDIDATE` |
| `node scripts/package-smoke.mjs` | `PASS`, `privatePathHits: []` |
| `node scripts/dump-package-manifest.mjs` | regenerates `PACKAGE-MANIFEST.json` identically |

Test counts are generated, never restated by hand. Earlier revisions of this file cited a
`MANIFEST.json` `testCounts` field that did not exist; the numbers above come from the run
itself.

## Environment

| Tool | Version at seal time |
|---|---|
| node | v26.0.0 |
| bun | 1.3.14 |
| npm | 11.12.1 |

The test suite runs under `bun test`. A different bun version may report the same assertions
with different timings; counts should match exactly.

## Offline notes

The snapshot is a content export (`git archive`) and carries no git history, so
`git status` / `git diff` inside it are not meaningful — history verification is done by
comparing the frozen commit SHA on GitHub. The final gate's `diff-check` step is skipped in a
git-less export by design; that is not a failure.
