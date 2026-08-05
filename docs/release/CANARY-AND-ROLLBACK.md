# Post-publish canary and rollback

Applies **after** a hypothetical publish of `1.0.0-rc.3` under the `next` tag. Nothing here has run.

## Why a canary is cheap here

The package is opt-in twice over: it publishes to `next`, not `latest`, and its default runtime surface is three tools with autonomous behaviour off. A canary consumer must deliberately ask for it.

## Canary checklist

**T+0 — install integrity**

- [ ] `npm view @adrianchan94/muscle-memory dist-tags` → `next: 1.0.0-rc.3`, `latest` unchanged
- [ ] re-download and re-hash; bytes match the custody-pinned sha256
- [ ] fresh install in a clean environment resolves and installs without peer warnings

**T+0 — activation**

- [ ] mod loads under `/reload` without throwing
- [ ] default surface registers exactly 3 tools
- [ ] `/muscle-memory` command responds
- [ ] panel renders; resting line shows `N skills · H helped`
- [ ] degraded hosts (no events / no UI / bare capabilities) still activate without throwing

**T+1h — first real possession**

- [ ] a genuine task produces either one prescription or a clean `ABSTAIN`
- [ ] the possession is resumable across an interruption
- [ ] closeout records the correct result and the correct evidence tier
- [ ] no skill is auto-promoted or auto-retired

**T+24h — behaviour under real load**

- [ ] no runaway writes to the skill shelf
- [ ] no secret-shaped content written or shared
- [ ] no private paths in any emitted receipt
- [ ] `proven` count only moves on instrument-owned verification
- [ ] state directory size is proportionate

**Abort the canary immediately if:** any secret or private path escapes, a caller obtains `verified` without the instrument, the shelf mutates without an explicit action, or activation breaks a host.

## Rollback

`npm unpublish` is heavily restricted and must not be assumed available. The realistic path:

**1 · Move the tag away (fastest, no deletion)**

```bash
npm dist-tag add @adrianchan94/muscle-memory@<previous-good-version> next
```

New installs of `next` stop resolving to the bad build immediately.

**2 · Deprecate the bad version**

```bash
npm deprecate @adrianchan94/muscle-memory@1.0.0-rc.3 \
  "Withdrawn: <one-line reason>. Use @next or see the release notes."
```

Anyone installing it sees the warning. The bytes remain — deprecation is a label, not a removal.

**3 · Ship the correction forward**

Publish `1.0.0-rc.4` with the fix. Never re-publish different bytes under an existing version; npm forbids it and it would break every integrity check.

**4 · If genuinely within the unpublish window and nothing depends on it**

```bash
npm unpublish @adrianchan94/muscle-memory@1.0.0-rc.3
```

Last resort. A version number, once unpublished, can never be reused.

**5 · GitHub side**

```bash
gh release delete v1.0.0-rc.3 --repo adrianchan94/muscle-memory --yes
git push --delete origin v1.0.0-rc.3
```

**6 · Record it**

Every rollback gets a CHANGELOG entry naming what shipped, what broke, and what the corrected version changes. A withdrawn release that leaves no trace is how the same defect ships twice.
