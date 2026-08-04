# Security Policy

## Supported versions

`@adrianchan94/muscle-memory` is currently in a review-candidate / author-owned landing phase. Treat every install as opt-in review software until an explicit stable release is tagged and published.

## Reporting a vulnerability

Please open a **private** GitHub security advisory on [`adrianchan94/muscle-memory`](https://github.com/adrianchan94/muscle-memory) when possible.

If you cannot use advisories, email the maintainer through the public GitHub profile contact path for `@adrianchan94` and include:

- affected commit SHA or package version
- impact / exploitability summary (no public PoC required for the first report)
- whether the issue involves secret leakage, skill-shelf poisoning, verification bypass, or sandbox escape

Do **not** open a public issue for active exploit details.

## Product security posture (honest ceiling)

- Deterministic gates block secret-shaped content before skill write/share paths.
- Exact-file verification is fail-closed and requires an absolute trusted root (`MM_EXACT_FILE_ROOT`).
- Default installs keep publish/capture conservative (`MM_PUBLISH=off`, staged reflect).
- This policy does not claim formal audit certification.
