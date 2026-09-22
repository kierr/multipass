# CI Cost Signals — Detailed Reference

Detailed domain knowledge for ci-cost-multipass. The SKILL.md body references this file for extended analysis sections.

## Runner Tier Classification Gate

For EVERY new or modified workflow — not just `runs-on:` changes — classify each job into a tier. This is signal #0: the highest-priority cost check. Runner defaults drift over time, and review tools routinely miss the cost impact of tiny trigger or placement changes.

### Tier definitions

Read the repo's AGENTS.md or CLAUDE.md for the org-specific tier model. Do not assume a fixed set of tiers.

If no tier model is documented, use this default:

| Tier | Variable | Criteria |
|---|---|---|
| **Light** | `GH_ACTION_LIGHT_RUNS_ON` | Normal Linux CI, tests, Docker builds, releases, scheduled non-agent automation |
| **Ultralight** | `GH_ACTION_ULTRALIGHT_RUNS_ON` | Sub-3-minute no-Docker checks with a documented local-runner reason |
| **Agent** | `GH_ACTION_AGENT_RUNS_ON` | Claude/agent workflows requiring local CLI/tool access |
| **Webhook** | n/a | Sub-second API validation, regex checks, label enforcement |

Retired variables such as `GH_ACTION_STANDARD_RUNS_ON`, `GH_ACTION_PRIVILEGED_RUNS_ON`, and `GH_ACTION_HEAVY_RUNS_ON` are findings unless the repo documentation explicitly says they are still active.

### `ubuntu-24.04` policy

`ubuntu-24.04` is the pinned GitHub-hosted Linux baseline. Never use `ubuntu-latest`.

For orgs using self-hosted runners, normal CI should reach hosted Linux through an org variable (e.g., `GH_ACTION_LIGHT_RUNS_ON`), not a hardcoded label. Hosted macOS is forbidden unless the repo has an explicit exception. Multi-arch and ARM64 CI builds are forbidden unless a future ADR grants an explicit exception.

Using hosted Linux still needs cost discipline: estimate monthly hosted-minute impact for high-frequency or long-running workflows and confirm the budget guard is in place.

**Pinning**: Always use `ubuntu-24.04`, never `ubuntu-latest`. The `latest` alias shifts without notice, breaking reproducibility.

### Gate rules

1. **Every job must fit an active tier.** A job using a retired variable or hardcoded self-hosted label is a finding. A job using `GH_ACTION_AGENT_RUNS_ON` must be an agent/governance workflow, not normal CI.

2. **Lightweight jobs on the Medium/Heavy pool = confirmed finding.** If a job's steps are only `actions/checkout` + shell commands + GitHub API calls + third-party actions that install their own toolchain, it belongs on the Light runner (`GH_ACTION_LIGHT_RUNS_ON`) or the webhook tier. This creates contention with heavy builds and wastes shared capacity.

3. **Sub-second validation as a GH Action = flag webhook tier.** If the actual work is a single API call + regex/grep check that completes in under a second, flag the webhook tier as an alternative. Cloudflare Workers (free tier: 100k req/day, sub-100ms latency vs runner boot time) are a common pattern for this.

4. **New workflows are not automatically approved because they use an org variable.** Every new workflow file is a tier, trigger, timeout, and concurrency decision that must be evaluated.

5. **Contention ratio reveals tier mismatches.** If a job's actual runtime is <30 seconds but it runs on a scarce local runner, it has a contention problem regardless of whether `runs-on:` changed. Move it to the documented light/webhook tier unless the local-runner reason is explicit.

## Contention Cost

Self-hosted runners are not free — they have **contention cost** even when there's no per-minute billing.

When N self-hosted runners are shared across M repos:
- Light jobs on self-hosted block heavy jobs from starting (and vice versa)
- Queue depth × avg heavy job duration = contention penalty for the entire org
- A 6-second job that queues for 3 minutes behind a container build wastes 3 minutes of wall-clock time for every stakeholder waiting on that check
- Multiply by PR volume: if Renovate, Symphony, and Codex each trigger the light job, contention compounds with automation frequency

Flag as a contention finding when:
- A job's actual runtime is <30 seconds and it uses self-hosted runners
- Self-hosted runner queue depth is regularly >0 (jobs are waiting)
- Light jobs and heavy jobs share the same runner pool with no priority mechanism

The fix is always tier separation: move light jobs to `GH_ACTION_LIGHT_RUNS_ON` or webhook tier, and reserve local runners for their documented narrow purposes.

## Alternative Tier Analysis

Before accepting that a job belongs on hosted Linux, check whether it belongs on an even cheaper/faster tier.

### Webhook tier (CF Worker)

For jobs where the actual work is a single API call, regex check, or label validation:
- Does the org already run a Cloudflare Worker or webhook handler? If yes, extending it is near-zero effort.
- Would sub-100ms webhook latency serve stakeholders better than 15-30s VM boot time?
- Is the cost truly zero? (CF free tier: 100k requests/day, 10ms CPU time limit per request)
- Can the check set a GitHub status via the Checks API? (Required for branch protection integration)

**When to recommend webhook tier**: the job does no tool installation, no checkout (or only shallow metadata fetch), and its core logic is expressible as a single HTTP handler. Examples: PR title format validation, label enforcement, stack metadata validation, branch naming checks.

**When NOT to recommend webhook tier**: the job needs a full repo checkout, installs toolchains, runs compiled code, or produces artifacts. These belong on the documented light tier at minimum.

## Common Anti-Patterns

| Pattern | Detection | Fix |
|---|---|---|
| Shell/API job on self-hosted runner | Job steps are checkout + shell + actions only, no container or toolchain deps | Move to `GH_ACTION_LIGHT_RUNS_ON` or webhook tier |
| New workflow using org default without justification | New workflow file uses `GH_ACTION_LIGHT_RUNS_ON` with no tier comment | Apply tier gate; assign correct tier |
| Sub-second validation as GH Action | Job runtime <1s, core logic is API call + regex | Evaluate CF Worker / webhook tier |
| Light job contending with heavy builds | Job runtime <30s on shared self-hosted runners | Move to `GH_ACTION_LIGHT_RUNS_ON` or webhook tier |
| Build-all bypass | `if event != pull_request then BUILD_ALL=true` ignoring paths-filter | Use paths-filter output for all events; override only on `workflow_dispatch` |
| Unfiltered main-push | `on.push.branches: [main]` without `paths:` | Add path filter or demote to `workflow_dispatch`-only |
| Redundant main-push linter | Same linter runs on PR and again on main-push with 0% success | Remove main-push trigger; keep `workflow_dispatch` for on-demand |
| Zeroed digest cascade | Image build workflow fails -> digest stays `sha256:000...` -> downstream fails | Fix image build first; create missing variables; consider fallback to `latest` tag |
| Over-broad matrix fan-out | 27 matrix jobs spawn for a 1-component change | Add change-detection job that builds dynamic matrix, or rely on per-job early-exit |
| Self-hosted runner saturation | Multiple heavy workflows fire simultaneously on one runner | Stagger triggers, reduce parallelism, or add concurrency groups across workflows |
| Self-hosted by habit | Jobs stay on self-hosted with no measured cache, locality, network, or tooling advantage | Move them only after benchmarking and preserving the lanes that win in practice |
| Hosted for cache-heavy multi-arch builds | Docker build/push jobs spend most of their time rebuilding cold layers on hosted runners | Do not approve unless the repo has an explicit current exception; otherwise simplify to single-arch hosted Linux builds |
| Local macOS as generic Linux CI | Standard Linux-oriented jobs run on a Mac mini or other local host only because it exists | Move generic jobs to hosted Linux or a Linux self-hosted lane; reserve macOS for macOS-specific work |
| Hosted migration by theory | Recommendation assumes image-consuming or linting jobs are faster on hosted runners without measuring cold pull costs or persistent local cache hits | Benchmark first; treat image pull and container warm-state as first-class costs |
| Ephemeral-baseline mistake | Review compares hosted cold pulls against self-hosted warm state without stating that the persistence difference is the whole point | Benchmark the real lane behavior, record cold vs warm explicitly, and recommend the topology that actually exists or is intended |
| ARC ignored because it is temporarily down | Review compares only GitHub-hosted vs a local fallback runner and misses the intended long-term IaC-managed self-hosted pool | Separate current degraded topology from intended steady-state topology and evaluate both |
| No budget guardrails before migration | Recommendation assumes hosted runners are "cheap enough" without checking plan quota, budgets, or current rates | Verify current GitHub billing docs and set usage budgets/alerts before moving large workflow slices |
| Agent-amplified quota burn | Orchestrator dispatches 50+ agents/day, each triggering full CI on hosted runners | Add concurrency groups, switch agent branches to `workflow_dispatch`, or throttle dispatch rate |
| Runner migration without quota math | `runs-on:` changed from self-hosted to hosted without estimating monthly minute cost | Calculate `runs/month x jobs x duration x os_multiplier` before approving |
| No spending limit on org | Org billing has no spending limit, so quota overage charges are unbounded | Set a spending limit in GitHub org billing settings before moving to hosted runners |
| `paths-ignore` blocklist trap | `paths-ignore` used instead of `paths` — new directories silently match | Switch to `paths` allowlist; new dirs excluded by default |
| Push-only workflow (no PR gate) | Workflow runs on `push: main` but has no `pull_request` trigger | Failures only surface after merge; add PR trigger or accept the risk explicitly |
| Redundant detect-changes | Workflow has `paths:` on trigger AND a `detect-changes` job using `dorny/paths-filter` | Workflow-level filter already gates triggering; the detect-changes job wastes a runner allocation for a 15-second check. Remove the detect-changes job. |
| Cross-runner detect-changes handoff | Gate job runs on ULTRALIGHT/Light, work job runs on PRIVILEGED/GH-hosted | The gate burns a runner allocation just to check paths. Fold into the main job as an early-exit step, or use workflow-level `paths:`. |
| Duplicate workflows sharing setup | Two workflows share >70% setup steps (checkout, Docker login, buildx, cache config), differing only in push/no-push or single/multi-arch | Merge into one workflow with conditional logic. Separate workflows create maintenance burden, configuration drift, and double the trigger overhead. |
| Duplicate container setup | Two workflows pull the same image, start the same services, for the same PR events (e.g., ci.yml and packwerk.yml) | Merge the checks into one workflow. The second workflow's container setup is pure waste. |
| PRIVILEGED tier on fallback hardware | PRIVILEGED tier runs on a temporary local runner because ARC/k8s isn't provisioned yet | Flag the topology mismatch. The job may be better on GH-hosted until the intended infrastructure is ready. Document the intended steady-state in AGENTS.md. |
| Missing `cache-to` directive | Docker build step has `cache-from` but no `cache-to` | Cache layers are only populated by image push, never by PR builds. Add `cache-to: type=registry,ref=...,mode=max` with dedicated cache tags. |
| Cache tag reuse for builds | `cache-from` references production image tags (`:latest`) instead of dedicated cache tags (`:build-cache-app`) | Production tags are overwritten on each publish, invalidating the cache. Use dedicated cache tags that persist intermediate layers. |
