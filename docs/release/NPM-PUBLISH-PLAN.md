# npm publish plan — NOT executed

**`npm publish` has never been run for this package.** Only `npm pack` and `npm publish --dry-run` are used anywhere in this repository's tooling. Publishing is a separate, explicitly approved human action.

## Target

| Field | Value |
|---|---|
| Package | `@adrianchan94/muscle-memory` |
| Version | `1.0.0-rc.3` |
| dist-tag | **`next`** — never `latest` |
| Access | `public` (required: scoped packages default to restricted) |
| Registry | `https://registry.npmjs.org` |

Publishing a prerelease under `next` means `npm install @adrianchan94/muscle-memory` continues to resolve to whatever `latest` points at. A user only gets this build by asking for it.

## Exact command

```bash
npm publish --tag next --access public
```

Run from a clean checkout of the frozen commit, after `npm ci && npm run build`.

## Proof-only commands (safe, already run)

```bash
npm publish --dry-run --tag next --access public   # prints what WOULD be published
npm pack --dry-run --json                          # file list + sizes
npm pack                                           # real bytes, for hashing
node scripts/dump-package-manifest.mjs             # per-file hashes + parity
```

The generated `docs/cold-review/PACKAGE-MANIFEST.json` is the authoritative record of the exact file set, per-file sha256, tarball sha256, and byte count.

## Preconditions — all must hold

- [ ] both cold reviewers returned **GO** for publishing under `next`
- [ ] Mack custody-pinned the exact tarball hash, recomputed independently
- [ ] the working tree is clean at the frozen SHA and CI is green on it
- [ ] `npm whoami` is the intended publisher account
- [ ] 2FA / OTP available if the account enforces it
- [ ] `prepublishOnly` (`npm run build`) succeeds — it runs automatically on publish
- [ ] Adrian explicitly approves the publish step

## Verify immediately after publish

```bash
npm view @adrianchan94/muscle-memory dist-tags        # next -> 1.0.0-rc.3, latest unchanged
npm view @adrianchan94/muscle-memory@1.0.0-rc.3 dist.integrity
npm pack @adrianchan94/muscle-memory@1.0.0-rc.3       # re-download and re-hash
```

Re-hash the downloaded tarball and confirm it matches the pinned sha256. A mismatch means the published bytes are not the reviewed bytes — treat as a **P0** incident and follow the rollback plan.

## Irreversibility warning

npm **unpublish is heavily restricted** (broadly, only within 72 hours and only if nothing depends on it). Assume publication is permanent. The realistic reversal is `npm deprecate` plus a corrected version — see `CANARY-AND-ROLLBACK.md`.

This is the principal reason the publish step is gated behind two hostile reviews and an explicit human approval.
