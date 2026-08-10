# GitHub Release — prepared draft, NOT created

**Nothing has been executed.** No release exists, draft or published. This file holds the exact body and the exact command so a maintainer can create it in one step after cold review clears.

We deliberately did **not** run `gh release create --draft`: creating even a draft mutates repository state and can notify watchers. The checked-in body below is the reviewable substitute.

## Parameters

| Field | Value |
|---|---|
| Tag | `v1.0.0-rc.3` |
| Title | `Muscle Memory V1.0.0-rc.3` |
| Target | the final cold-reviewed commit on `release/muscle-memory-v1` (see `../cold-review/FREEZE.txt`) |
| Prerelease | **true** |
| Draft | **true** |
| Latest | **no** — a prerelease must never become "Latest" |

## Exact command

Run from a clean checkout of the frozen commit. Replace `<FROZEN_SHA>` with the value in `../cold-review/FREEZE.txt`.

```bash
gh release create v1.0.0-rc.3 \
  --repo adrianchan94/muscle-memory \
  --target <FROZEN_SHA> \
  --title "Muscle Memory V1.0.0-rc.3" \
  --notes-file docs/release/GITHUB-RELEASE-BODY.md \
  --draft \
  --prerelease
```

To attach the packed artifact as a release asset (optional — the tarball is not committed, so build it first):

```bash
npm ci && npm run build && npm pack
gh release upload v1.0.0-rc.3 adrianchan94-muscle-memory-1.0.0-rc.3.tgz --repo adrianchan94/muscle-memory
```

## Preconditions — all must hold before running

- [ ] both cold reviewers returned **GO** (or their P0s are closed and re-reviewed)
- [ ] Mack has custody-pinned the final tarball hash
- [ ] the frozen SHA is the tip of `release/muscle-memory-v1`
- [ ] CI green on that exact SHA
- [ ] Adrian has explicitly approved the release step

## Reversal

A draft release can be deleted with no public trace:

```bash
gh release delete v1.0.0-rc.3 --repo adrianchan94/muscle-memory --yes
git push --delete origin v1.0.0-rc.3   # only if the tag was pushed
```

Because the release is created as a draft, the tag is not created on the remote until the draft is published.
