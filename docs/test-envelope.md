# Test & sandbox environment envelope

Every mutating muscle-memory flow resolves its write targets from environment
variables. This page is the canonical map. Under `NODE_ENV=test` the module
**fails closed at load** unless both the state sandbox and an agent-shelf
sandbox are configured — a test suite that silently writes to a real shelf is
the exact failure this envelope exists to prevent.

| variable | layer it controls | test-safe value |
|---|---|---|
| `MM_STATE_DIR` | durable state root (experience ledger, sessions, catalog-sync, UI state). **Required under `NODE_ENV=test`** (load-time throw). | `$(mktemp -d)` |
| `MM_AGENT_SKILLS_DIR` | **priority-1 agent-shelf override** for all mutating skill flows (autopilot execute, graduation, reflective distill). Decoupled from `MEMORY_DIR`. **Required under `NODE_ENV=test`** unless `MEMORY_DIR` is set (load-time throw). | `$(mktemp -d)` |
| `MM_GLOBAL_SKILLS_DIR` | shared global shelf (default `~/.letta/skills`). Autonomous ops read it; only explicit publish mutates it. Semantics unchanged by the sandbox fix. | `$(mktemp -d)` |
| `MEMORY_DIR` | legacy Letta-owned coupling of memory+skills (`$MEMORY_DIR/skills`). Honored second, for backward compatibility. Do not overload it for sandboxing — use `MM_AGENT_SKILLS_DIR`. | optional |
| `MM_EXACT_FILE_ROOT` | **live and required** for the exact-file verification tools (`register_exact_file_verification`, `verify_agent_possession`): `mods/verification.ts` throws if it is unset, not absolute, or not a directory. Scope one trusted workspace root. | `$(mktemp -d)` when exercising verification |
| `MM_MESH_FEED` | cross-agent skill feed path override (defaults into `MM_STATE_DIR`). | `$(mktemp -d)/feed.jsonl` |

Resolution order for the agent shelf: `MM_AGENT_SKILLS_DIR` → `MEMORY_DIR/skills`
→ agent-id MemFS (`~/.letta/agents/<id>/memory/skills`, then lc-local-backend
mirror) → `MM_GLOBAL_SKILLS_DIR`.

The package `test` script sets the full sandbox automatically. If you run
`bun test` by hand, mirror it:

```bash
MM_STATE_DIR=$(mktemp -d) MM_AGENT_SKILLS_DIR=$(mktemp -d) \
MM_GLOBAL_SKILLS_DIR=$(mktemp -d) bun test --max-concurrency=1 test/
```

Leak check: count `~/.letta/skills` entries before and after a test run — any
difference means a flow escaped the envelope.
