// muscle-memory · reranker v2 BLIND HOLDOUT — authored 2026-07-05 by Mack (referee lane),
// sealed per docs/prereg-reranker-holdout.md.
//
// PROVENANCE RULES (why this file exists):
// The original 16-case set (test/routing-cases.ts) has been iterated against by FIVE levers
// (lexical scorer, canary floor, floor-loosening [rejected], HyDE [rejected], LLM reranker
// [accepted]). Repeated selection against the same labels drifts an eval set toward a training
// set. This holdout was authored fresh, from domains disjoint with all 16 originals
// (no pytest/tsc/docker/alembic/vitest/webpack/bun/CORS/CI-secrets/conftest/worktree/
// webgl/stripe/launchd/sqlite-NFS), AFTER the reranker method was frozen in the design doc
// and BEFORE any reranker code or run existed in this branch.
//
// BURN RULE: if any lever (prompt, threshold, top-k, recall stage) is tuned after observing
// results on these cases, this holdout is burned and must be replaced before the next claim.
import type { RoutingCase } from "./routing-cases";

export const HOLDOUT_CASES: RoutingCase[] = [
  // ── A · strong-lexical (regression guard: reranker must not disturb the lexical routing path) ──
  {
    id: "HA1-terraform-drift", cls: "A-strong-lexical",
    evidence: "- recovered failure: terraform plan shows drift on aws_s3_bucket after a manual console change · terraform import the resource then re-run terraform plan until clean",
    shelf: [["reconciling-terraform-state-drift", "Use when terraform plan reports drift against real infrastructure: import or update the state, then re-run terraform plan until it is clean."],
            ["repairing-media-conversion-jobs", "Use when a video pipeline halts because the tool cannot produce the requested output format: enable or substitute the needed capability and run the job once more."]],
    neighbors: [{ name: "reconciling-terraform-state-drift", rank: 0 }],
    expected: { lexical: "update", hybrid: "update" }, target: "reconciling-terraform-state-drift",
  },
  // ── B · paraphrase duplicates — zero distinctive token overlap, same job-to-be-done ──
  {
    id: "HB1-k8s-rollout", cls: "B-paraphrase-dupe",
    evidence: "- recovered failure: kubectl rollout status stuck, pods CrashLoopBackOff after an image bump · fix the bad env var in the manifest, kubectl apply, restart the rollout",
    shelf: [["recovering-wedged-service-deployments", "Use when a fleet update leaves a service half-updated and its units keep dying on start: find the broken setting, correct it, and push the update through again."]],
    neighbors: [{ name: "recovering-wedged-service-deployments", rank: 0 }],
    expected: { lexical: "create", hybrid: "park-semantic" },
  },
  {
    id: "HB2-nginx-502", cls: "B-paraphrase-dupe",
    evidence: "- recovered failure: nginx returns 502 Bad Gateway after deploy (upstream unix socket path changed) · point the server block at the new socket and reload nginx",
    shelf: [["restoring-broken-reverse-proxy-links", "Use when the front web tier errors because it cannot reach the application behind it: correct the backend address and reload the configuration."]],
    neighbors: [{ name: "restoring-broken-reverse-proxy-links", rank: 0 }],
    expected: { lexical: "create", hybrid: "park-semantic" },
  },
  {
    id: "HB3-ffmpeg-encoder", cls: "B-paraphrase-dupe",
    evidence: "- recovered failure: ffmpeg exits 1 transcoding h264 to hevc (Unknown encoder libx265) · install a codec-enabled build or switch the encoder flag, run the transcode again",
    shelf: [["repairing-media-conversion-jobs", "Use when a video pipeline halts because the tool cannot produce the requested output format: enable or substitute the needed capability and run the job once more."]],
    neighbors: [{ name: "repairing-media-conversion-jobs", rank: 0 }],
    expected: { lexical: "create", hybrid: "park-semantic" },
  },
  {
    id: "HB4-cron-dst", cls: "B-paraphrase-dupe",
    evidence: "- recovered failure: crontab job fired an hour late after the daylight-saving change · set CRON_TZ=UTC and restate the schedule line",
    shelf: [["running-clock-safe-recurring-tasks", "Use when a recurring task drifts around seasonal clock shifts: pin the zone explicitly so the trigger stays fixed year round."]],
    neighbors: [{ name: "running-clock-safe-recurring-tasks", rank: 0 }],
    expected: { lexical: "create", hybrid: "park-semantic" },
  },
  // ── D · genuinely novel — including one adversarial domain-adjacent trap ──
  {
    id: "HD1-codesign-profile", cls: "D-novel",
    evidence: "- recovered failure: Xcode archive fails codesign (provisioning profile missing device UDID) · regenerate the profile including the device and re-archive",
    shelf: [["repairing-media-conversion-jobs", "Use when a video pipeline halts because the tool cannot produce the requested output format: enable or substitute the needed capability and run the job once more."]],
    neighbors: [],
    expected: { lexical: "create", hybrid: "create" },
  },
  {
    id: "HD2-autovacuum-bloat", cls: "D-novel",
    // ADVERSARIAL: on-shelf skill is database-ADJACENT (failed data migrations) but a different
    // job-to-be-done (vacuum/perf tuning is not a halted migration). The embedder will likely
    // rank it #1. A rank-trusting or job-sloppy judge parks this — the correct route is CREATE.
    evidence: "- recovered failure: postgres table bloat growing, autovacuum cannot keep up on a hot table · lower autovacuum_vacuum_scale_factor for that table and reindex",
    shelf: [["restoring-failed-data-migrations", "Use when a data migration halts partway and leaves tables inconsistent: find the failing statement, repair it, and bring the change to completion."]],
    neighbors: [{ name: "restoring-failed-data-migrations", rank: 0 }],
    expected: { lexical: "create", hybrid: "create" },
  },
  {
    id: "HD3-lfs-pointers", cls: "D-novel",
    evidence: "- recovered failure: repository files show git-lfs pointer text instead of binaries after clone · run the large-file checkout step to smudge real contents",
    shelf: [["running-clock-safe-recurring-tasks", "Use when a recurring task drifts around seasonal clock shifts: pin the zone explicitly so the trigger stays fixed year round."]],
    neighbors: [{ name: "running-clock-safe-recurring-tasks", rank: 0 }],
    expected: { lexical: "create", hybrid: "create" },
  },
];
