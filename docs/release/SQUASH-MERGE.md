# Squash-merge plan — NOT executed

PR #2 is open and must **not** be merged by anyone but the maintainer, after cold review clears.

<https://github.com/adrianchan94/muscle-memory/pull/2>

## Why squash

The branch history contains commits authored under an older GitHub noreply identity, and commits whose subject lines predate current naming decisions. Rewriting that history would require a force-push, which is explicitly forbidden.

**Squash-merge solves it cleanly:** the branch history stays intact and honest on the branch, while `main` receives exactly one commit with the correct authorship and the correct wording. No history is rewritten; a new, clean commit is created.

## Exact merge commit title

```
feat(v1): ship Muscle Memory's verifier-gated agent learning system
```

## Exact merge commit body

```
Muscle Memory V1 turns an agent's real work into procedural memory that has to
earn its place: observe, diagnose a real gap, prescribe exactly one skill or
abstain, execute, then judge or verify the result.

- One skill or abstain. muscle_memory_prescribe(task, gap_observed) returns a
  single installed procedure or ABSTAIN, and requires an attested gap.
- Resumable possessions with honest closeout: helped, harmed, neutral,
  succeeded_unaided, failed_unaided.
- Instrument-owned verification for exact regular-file SHA-256 under a trusted
  root; fails closed on drift, traversal, symlinks, replay, and task mismatch.
  Callers cannot self-award verified.
- Evidence-aware roster that never auto-promotes or auto-retires and requires
  repeated minutes before advice.
- Update-first learning with n=1 and retired-clone gates against shelf bloat.
- Retroactive history mining and opt-in reflection at compaction.
- Sanitized staged-first squad transfer and reversible Desktop catalog sync.
- Secret-shaped values blocked before write and share; lean three-tool default
  surface with MM_ADVANCED=on for the rest.

Owner-maintained under @adrianchan94/muscle-memory. Muscle Memory V1 is the
product; Knowing Is Not Doing is the canonical research record behind its
design. Research effects are bounded to tested tool-use tasks.

Release candidate 1.0.0-rc.3. Tag, GitHub release, and npm publication remain
separate approved actions.
```

## Command

```bash
gh pr merge 2 \
  --repo adrianchan94/muscle-memory \
  --squash \
  --subject "feat(v1): ship Muscle Memory's verifier-gated agent learning system" \
  --body-file docs/release/SQUASH-MERGE-BODY.txt
```

## GUI steps

1. Open PR #2.
2. Merge dropdown → **Squash and merge**.
3. Replace the auto-filled title with the exact title above.
4. Replace the auto-filled body with the exact body above — GitHub pre-fills it with the concatenated commit messages, which reintroduces superseded wording. **Clear it first.**
5. Confirm the author shown is `Adrian Chan <adrianchanuk@gmail.com>`.
6. Merge.
7. Delete the branch **only after** verifying `main` contains the squashed commit and CI is green on `main`.

## Post-merge verification

```bash
git fetch origin && git log origin/main -1 --format='%H%n%an <%ae>%n%cn <%ce>%n%s'
gh run list --branch main --limit 2
```

Confirm: one new commit, author and committer both `Adrian Chan <adrianchanuk@gmail.com>`, exact title, CI green.

## Do not

- do not rebase-merge (recreates the mixed-identity history on `main`)
- do not create a merge commit (same problem, plus a noisy graph)
- do not force-push anything
- do not delete the branch before `main` is verified green
