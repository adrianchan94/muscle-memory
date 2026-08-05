# Verify this candidate yourself

Generated at seal time from the sealed artifact. Do not hand-edit —
the generator is `scripts/emit-freeze-docs.mjs`.

## The reproduction contract

`npm pack` produces a gzip-wrapped tar. The **gzip envelope** varies by packer version and
compression level; the **tar stream** inside does not. So the contract is the decompressed
stream:

| Artifact | sha256 |
|---|---|
| packed tarball (outer envelope, this machine) | `3809055bfb6952f04d16ec19fdc74958c4d5eb0eaa3b93436721b38f1e8ba50c` |
| **decompressed tar stream (the contract)** | `e6c9043a64968bdff4406e072438d7ee1609f0fc7c0dddf700ab5c6cf669731e` |
| bundled entry `mods/index.bundled.mjs` | `bdf47c15dd768cb8038cdf3a0b3dbc98562a4053ac447fbbd07b5d77a8cf6283` |
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
| `npm test` | 321 pass, 0 fail, 43 files — counted from a real run at seal time |
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
