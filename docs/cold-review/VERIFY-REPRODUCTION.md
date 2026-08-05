# Verify this candidate yourself

Generated at seal time from the sealed artifact. Do not hand-edit —
the generator is `scripts/emit-freeze-docs.mjs`.

## The reproduction contract

`npm pack` produces a gzip-wrapped tar. The **gzip envelope** varies by packer version and
compression level; the **tar stream** inside does not. So the contract is the decompressed
stream:

| Artifact | sha256 |
|---|---|
| packed tarball (outer envelope, this machine) | `778c6c598de86b905d1661d9709851a2a2c66b2c25aa24607f6a1e39f94a51df` |
| **decompressed tar stream (the contract)** | `41e8b19483ad79a07694c6a42e0b5bc7573b33941e8432439c77336f2860b259` |
| bundled entry `mods/index.bundled.mjs` | `fb2bd37a3b33f22202c1f616f94118951a0052919b35afb8c140f598b715ea21` |
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
| `npm test` | 319 pass, 0 fail, 42 files — counted from a real run at seal time |
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
