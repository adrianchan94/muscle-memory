# Release surface — prepared, not executed

Every action described in this directory is **staged for a human to run**. None of it has been performed.

| Not done | Where it is planned |
|---|---|
| GitHub release / tag `v1.0.0-rc.3` | `GITHUB-RELEASE-DRAFT.md` + `GITHUB-RELEASE-BODY.md` |
| `npm publish --tag next` | `NPM-PUBLISH-PLAN.md` |
| Squash-merge PR #2 into `main` | `SQUASH-MERGE.md` + `SQUASH-MERGE-BODY.txt` |
| Post-publish canary / rollback | `CANARY-AND-ROLLBACK.md` |
| Promotion to stable `1.0.0` | `PROMOTION-TO-1.0.0.md` |

## Current state

- **Candidate:** `@adrianchan94/muscle-memory@1.0.0-rc.3` — a release candidate, **not stable**
- **PR:** <https://github.com/adrianchan94/muscle-memory/pull/2> — open, not merged
- **Tag:** none
- **GitHub release:** none, not even a draft
- **npm:** never published under this package name
- **Exact bytes:** see `../cold-review/PACKAGE-MANIFEST.json`

## Order of operations

Each step requires explicit approval. None may be inferred from the previous one.

1. Dual cold review returns → resolve P0s → re-review if bytes change
2. Independent custody pin on the final tarball hash
3. Squash-merge PR #2 (`SQUASH-MERGE.md`)
4. Create the GitHub release **as a draft**, prerelease (`GITHUB-RELEASE-DRAFT.md`)
5. `npm publish --tag next --access public` (`NPM-PUBLISH-PLAN.md`)
6. Run the canary (`CANARY-AND-ROLLBACK.md`)
7. Only after all of it, consider stable `1.0.0` (`PROMOTION-TO-1.0.0.md`)

If bytes change at any point, the candidate identity is re-minted and prior review does not carry forward.
