---
name: ci-cost-multipass
multipass_desc: "Review CI/CD pipelines for cost waste — runner tier mismatches, redundant builds, low success rates, cascade failures, and trigger volume burning quota."
description: "-"
when_to_use: "When reviewing CI/CD pipelines for cost efficiency, runner utilization, or when the user mentions CI costs, build times, or runner waste."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - LSP
---

## Review Contract

### Scope & Targeting

**When the user specifies scope** (file path, "the PR", a commit hash, "everything", a branch name), use that scope directly.

**Default scope** when the user provides no explicit scope — use the first match:

1. **Branch diff.** If on a non-default branch (not main/master), diff against the merge base: `git diff $(git merge-base HEAD origin/main)...HEAD`. This captures the full branch changeset.
2. **Working tree.** `git diff HEAD` plus untracked files (`git ls-files --others --exclude-standard`). If non-empty, use these changes.
3. **Recent commits.** If on the default branch with a clean working tree, review the last 5 commits (`git log --oneline -5`).

**Scope overrides:**
- "review the PR" / "pr review" → `gh pr view` to get the PR, then `git diff <base>...HEAD`
- "full review" / "review everything" → all source files in the repo
- Named file or directory → that path only

**Untracked files are always included in working-tree scope.**

**Argument interpretation:** `$ARGUMENTS` may contain a natural language description of what to review — anything from a file path to a focus area to a longer prompt. If arguments contain paths, narrow your search accordingly. If they describe a focus area, prioritize that surface. If arguments are empty or absent, use the default scope above.

### Review Mode

Review-only. No mutations, no fix waves, no loops.

### Core Rules

- Work from repo truth first. Separate confirmed findings from assumptions and unverified areas.
- Report every confirmed finding regardless of severity. Do not pad with unverified speculation, but do not dismiss confirmed findings because they are minor.
- Respect explicit preservation annotations in code (`DO NOT REMOVE`, `DO NOT DELETE`, `KEEP THIS`). Never recommend removal or modification of annotated-to-keep code.
- **Stranded code is not dead code.** Before flagging "dead code" or "unused code," check for `STATUS:` markers, related issues, and integration plans. Only "obsolete" (confirmed dead with no integration path) is removable.
- When another review skill is clearly needed, use only the smallest relevant set of available review lenses.
- **Low-severity findings default to actionable.** "It's just a nitpick" is not a valid reason to downgrade or omit.
- **Out-of-scope findings are reported with a suggested action** (fix/TODO/issue) in the triage table. Never silently drop a finding.

### Finding Severity

| Level | Meaning | When to use |
|---|---|---|
| `critical` | Exploitable vulnerability, data loss, or production breakage | SQL injection, auth bypass, data corruption path |
| `high` | Likely bug that affects correctness under normal usage | Race condition, wrong logic branch, missing null check on hot path |
| `medium` | Quality issue that could cause problems under specific conditions | Missing error handling, fragile test, resource leak |
| `low` | Minor improvement — style, naming, dead code | Unused import, inconsistent naming, minor simplification |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Bug verification:** Trace the full execution path to the failure, construct a concrete failure scenario, verify the operations touch the same resource or invariant, check whether the observed behavior is intentional.

**Quality verification:** Verify the issue is real: the code is harder to read, maintain, or change than it should be. Verify a concrete improvement exists (not just "this could be better"). Check that the improvement is local and safe. Check whether the pattern is intentional.

**Spec-dependent verification:** When a finding depends on how a spec, framework, or runtime behaves, verify the claimed behavior against the authoritative source. "WCAG requires X" is not a finding until verified against the spec. If you cannot verify against a primary source, flag as `[unverified]` instead of confirmed. The cost of a false positive exceeds the cost of reading a spec.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# CI Cost Review

Diagnose CI/CD waste using real run metrics, not just structural inspection.

`ci-multipass` asks "is this pipeline safe?" — this skill asks "is this pipeline wasteful?" They complement each other and should not duplicate findings.

## Scope

- GitHub Actions workflow efficiency: run frequency, success rates, duration, trigger breadth, path-filter bypass patterns, and cascade failures.
- Runner tier classification: whether each job is on the correct runner tier for its actual workload weight.
- Runner utilization: self-hosted runner contention, over-parallel builds, resource exhaustion, and whether persistent local image/cache state is doing real work.
- Runner placement economics: whether jobs belong on GitHub-hosted Linux, larger hosted runners, ARC or other IaC-managed self-hosted pools, or local fallback hardware based on cache locality, warm-image reuse, privileged build needs, and current billing/quota reality.
- Execution tier alternatives: whether a job should be a GitHub Action at all, or whether it belongs on a cheaper/faster execution tier like a Cloudflare Worker or webhook handler.
- Variable and artifact health: digest variables, container image references, and cross-workflow dependencies that silently break downstream jobs.

**Not in scope**: workflow permissions, secret handling, action pinning, release gates — those belong to `ci-multipass`.

## References

- [references/ci-cost-signals.md](references/ci-cost-signals.md) — Runner Tier Classification Gate, Contention Cost, Alternative Tier Analysis, Anti-Patterns table

## Diff-Mode Priority Signals

When reviewing a diff (not a full-repo audit), flag these changes as **high-cost-risk** before proceeding to the full workflow:

0. **New workflow without tier justification**: Any new `.github/workflows/*.yml` file that uses retired variables, hardcoded self-hosted labels, hosted macOS, `ubuntu-latest`, or ARM64/multi-arch build platforms. Apply the Runner Tier Classification Gate above.
1. **Runner type migration**: Any `runs-on:` change that switches between hosted and self-hosted (either direction). This is the single highest-cost-risk change in a workflow file — it can burn an entire month's quota in hours if the workflow has high trigger frequency.
2. **Trigger broadening**: Adding `push:` triggers, removing `paths:` filters, or adding new `schedule:` entries.
3. **Matrix expansion**: Adding matrix dimensions or values that multiply job count.
4. **Concurrency removal**: Removing `concurrency:` groups that previously throttled parallel runs.

For runner type migrations specifically: estimate the monthly hosted-minute cost before approving. Use the formula: `runs_per_month × jobs_per_run × avg_job_duration_min × os_multiplier`. If the estimate exceeds 50% of the plan's included minutes, flag as a blocking finding.

## Workflow

### 1. Collect metrics

Pull the last 30 runs for each workflow and compute per-workflow:
- Total runs, success count, failure count, cancelled count
- Success rate (%)
- Average and max duration (seconds)
- Event type distribution (push, pull_request, workflow_dispatch, schedule)

```bash
gh run list --repo OWNER/REPO --workflow WORKFLOW.yml --limit 30 \
  --json conclusion,startedAt,updatedAt,event --jq '
    def dur: ((.updatedAt | fromdateiso8601) - (.startedAt | fromdateiso8601));
    "runs: \(length)",
    "success: \([.[] | select(.conclusion == "success")] | length)",
    "failure: \([.[] | select(.conclusion == "failure")] | length)",
    "avg_duration_sec: \(if length > 0 then ([.[] | dur] | add / length | floor) else 0 end)",
    "events: \([.[] | .event] | group_by(.) | map("\(.[0]): \(length)") | join(", "))"
  '
```

Build a table with columns: workflow name, runs (30 sample), success %, avg duration, max duration, event mix. Workflows with <20% success rate or >10min average duration are immediate investigation targets — diagnose whether the failures are cascade-caused, infrastructure-caused, or code-caused before recommending a fix.

### 2. Map runner topology

Read workflow YAML and classify each job by where it runs:
- GitHub-hosted standard Linux
- GitHub-hosted larger runner or non-Linux hosted runner
- Self-hosted standard lane
- Self-hosted privileged lane
- ARC or other IaC-managed self-hosted runner pool
- Temporary fallback lane (for example, local Mac mini while the cluster or ARC pool is down)

Distinguish:
- **Current topology**: what jobs run on today
- **Intended steady-state topology**: where they should run once the preferred self-hosted pool or cluster is healthy again

For each lane, ask:
- Does the job need privileged Docker build/push capability?
- Does it depend on warm local Docker layer cache, runner persistence, registry proximity, or multi-arch build locality?
- Does it need private network access or custom host tooling?
- Does it consume an already-built container image that may already be warm on a persistent self-hosted runner?
- Is the runner state ephemeral or persistent across runs, and are image pulls or cache restores likely to dominate the job?

Do not infer placement from job type alone. Image-consuming jobs can still favor self-hosted lanes when:
- the image is usually already present locally because earlier jobs built or used it
- pulling the image on GitHub-hosted runners dominates run time
- the self-hosted lane is colocated with the registry or cluster network
- persistent runner state reduces repeated cold-start costs

Treat ARC or other IaC-managed self-hosted pools as first-class options, not just the local-machine fallback.

### 2.5 Cross-workflow structural analysis

Read ALL workflow files in `.github/workflows/`, not just the one being reviewed. Flag when:

1. **Duplicate setup**: Two or more workflows share >70% of their setup steps (checkout, Docker login, image pull, compose up) but run as separate workflows. These are candidates for merging into one workflow with conditional logic. Example: a PR validation workflow and a publish workflow that build the same Dockerfile targets, differing only in `push: true/false` and single-arch vs multi-arch.

2. **Detect-changes redundancy**: A workflow has a `detect-changes` job using `dorny/paths-filter` but also has `paths:` filters on its `pull_request` trigger. The workflow-level filter already prevents triggering — the detect-changes job is redundant and wastes a runner allocation for a 15-second check.

3. **Cross-runner handoff**: A detect-changes or gate job runs on one runner tier (e.g., ULTRALIGHT) and the actual work runs on a different runner (e.g., GH-hosted or PRIVILEGED). The gate job should be a step in the main job, not a separate job consuming a separate runner.

4. **Simultaneous trigger contention**: Multiple workflows trigger on the same event (e.g., push to main) and compete for the same runner. If ci.yml and publish.yml both fire on push-to-main, they contend for runner time. Flag the contention and suggest whether a single workflow or explicit ordering would be better.

5. **Duplicate container setup**: Two workflows pull the same container image and start the same services for the same PR events. The second workflow's setup is pure waste — the checks should be steps in the first workflow.

For each flag, estimate the waste: duplicate setup minutes per week, contention hours per week, and the runner-minutes saved by consolidating.

### 3. Identify trigger waste

For each workflow file, classify triggers:

- **Unfiltered main-push**: `on.push.branches: [main]` with no `paths:` filter. These fire on every merge regardless of content.
- **Path-filter bypass**: workflows that use `dorny/paths-filter` but override its output for non-PR events (the `if event != pull_request then run=true` anti-pattern). The filter exists but is silently ignored on push-to-main.
- **Redundant coverage**: a main-push workflow that duplicates work already done by a PR-level workflow (e.g., main-push megalinter when PRs already run megalinter).
- **Over-broad matrices**: a single path trigger spawns N parallel jobs (one per component) when only 1 component changed. Check if the reusable/called workflow has its own per-component change detection — if yes, the overhead is just job startup; if no, all N jobs do full work.

Read each workflow file to classify. Do not rely on filenames.

### 4. Verify current billing and budget assumptions (pre-migration gate)

Before recommending a hosted-vs-self-hosted migration, verify current GitHub billing reality from official GitHub docs and the account billing dashboard:
- included minutes for the current plan
- current hosted runner rates by OS and size
- any current self-hosted runner billing or quota rules
- configured budgets and usage alerts

Do not assume that old pricing debates or prior platform behavior are still true.

### 4b. Check quota velocity

When the repo uses GitHub-hosted runners, check current usage against quota:

```bash
# Check billing for the org/user
# Note: GitHub moved the billing API. Try these endpoints in order:
gh api /orgs/OWNER/billing/usage 2>/dev/null \
  || gh api /orgs/OWNER/settings/billing/actions 2>/dev/null \
  || echo "Billing API unavailable — estimate from plan docs instead"
```

Calculate burn rate: `used_minutes / days_into_billing_period × 30`. If projected monthly usage exceeds included minutes, flag with the estimated overage cost.

Red flags:
- **Burst burn**: >20% of monthly quota consumed in a single day (the "moved to hosted and burned it all" scenario)
- **Overage already accruing**: `total_paid_minutes_used > 0` means free tier is already exhausted
- **No spending limit set**: check if the org has a spending limit configured — absence of one means unlimited overage charges

### 4c. Assess automation-amplified trigger volume

Agent orchestrators (Symphony, Codex automations, Dependabot, Renovate) can multiply CI trigger frequency far beyond human commit cadence. When reviewing repos that use automated agents:

1. **Count automation-driven runs**: Filter recent runs by actor or trigger pattern:
   ```bash
   gh run list --repo OWNER/REPO --limit 100 --json event,actor,startedAt \
     --jq '[.[] | select(.actor.login != "HUMAN_USER")] | length'
   ```
2. **Estimate automation multiplier**: `total_runs / human_triggered_runs`. A multiplier >5x means automation dominates CI cost.
3. **Check concurrency interaction**: If the orchestrator dispatches N agents in parallel and each triggers CI, the concurrent hosted-runner minute consumption is N x per-run minutes. With no concurrency group, a burst of agent pushes can consume Nx the expected quota in wall-clock time.

When automation multiplier is >5x:
- Verify concurrency groups exist to throttle parallel runs
- Check if `workflow_dispatch` or `repository_dispatch` triggers could replace `push` triggers for agent-created branches (giving the orchestrator explicit control over when CI fires)
- Estimate whether the orchestrator's dispatch rate fits within the quota headroom from step 4

### 5. Benchmark representative runner paths

When runner placement is a real decision, compare at least one representative job across plausible lanes:
- cold run on GitHub-hosted Linux
- warm run on persistent local self-hosted
- warm run on ARC or other IaC-managed self-hosted, when available

Measure where the time actually goes:
- queue time
- checkout time
- image pull time
- job-container startup or `docker run` startup time
- cache restore time
- Docker build or buildx time
- test or lint execution time
- push or artifact upload time

If the job mostly runs inside a prebuilt image, treat image acquisition and container startup as first-class costs. A "simple" lint or validation job can still favor persistent self-hosted or ARC lanes when cold pulls dominate the hosted baseline.

If direct benchmarking is blocked because a cluster is down or ARC is unavailable, say that the recommendation is provisional and distinguish current fallback from intended steady-state placement.

### 6. Check variable and artifact health

Repository variables that store image digests, container references, or build outputs are a common cascade-failure vector.

```bash
gh api repos/OWNER/REPO/actions/variables --paginate \
  --jq '.variables[] | "\(.name): \(.value)"'
```

Red flags:
- **Zeroed digests**: `sha256:000...` placeholder values that were never populated by a successful build
- **Missing variables**: referenced in workflow files via `${{"{{"}} vars.X {{"}}"}}` but not present in the variables list
- **Stale digests**: variables that reference images no longer in the registry

For each variable that looks broken, trace which workflow is supposed to populate it and check that workflow's success rate.

### 6.5 Audit cache strategy

Check Docker build steps for cache configuration:

1. **Missing `cache-to`**: `cache-from: type=registry,...` exists but no `cache-to`. Cache layers are only populated by image push (publish), never by PR builds. If the published cache goes stale, the next publish is a cold build. Add `cache-to: type=registry,ref=...,mode=max`.

2. **Cache tag reuse**: `cache-from` references production image tags (`:latest`, `:worker`) instead of dedicated cache tags (`:build-cache-app`). Production tags are overwritten on each publish, invalidating the cache. Use dedicated cache tags that persist all intermediate layers.

3. **No cache at all**: Docker build steps with neither `cache-from` nor `cache-to` — every build is cold. Estimate the cost: cold builds are typically 2-5x slower than cached builds.

### 6.6 Assess self-hosted coupling in composite actions

When composite actions in `.github/actions/` contain extensive persistent-volume management (node_modules volumes, gem cache sentinels, OOM-prevention restarts, memory-constrained cleanup), they are **tightly coupled to persistent self-hosted runners**. Moving their parent workflows to GitHub-hosted runners requires rethinking the caching strategy — these optimizations become unnecessary (ephemeral runners have no persistence to exploit) or counterproductive.

Flag when a composite action has:
- Named Docker volumes that persist between runs
- Sentinel-file cache invalidation (`.gem-lock.sha256`, `.bun-lock.sha256`)
- Memory management steps (container restarts, OOM kill workarounds)
- Comments referencing "self-hosted runner" or "7GB VM" or "local runner"

This doesn't mean the workflow shouldn't move — it means the composite action needs simplification for the target topology.

### 7. Diagnose failure cascades

When a workflow has a very low success rate, check what's actually failing:

```bash
gh run view RUN_ID --repo OWNER/REPO --json jobs \
  --jq '.jobs[] | "\(.name): \(.conclusion) (\(.steps | map(select(.conclusion == "failure")) | .[0].name // "n/a"))"'
```

Common cascade patterns:
- Image build fails -> digest variable stays zeroed -> all container-based workflows fail at "Initialize containers"
- One job in a matrix fails -> whole workflow marked failed -> success rate looks terrible but only one component is broken
- Schedule/cron job fails silently -> nobody notices because it's not in the PR path

### 8. Quantify waste

Estimate frequency from the metrics data: if the 30 most recent runs span N days, then runs_per_week = 30 / N * 7. Combine with duration and failure rate:

- **Wasted runner-minutes/week** = runs_per_week x avg_duration_min x (1 - success_rate)
- **Cascade multiplier**: count how many downstream workflows fail because of one upstream failure — multiply the upstream's waste by the number of dependents
- **Empty-job overhead**: count how many matrix jobs spin up just to discover "no changes for me" and exit — each burns job-startup time even when skipped
- **Hosted budget risk**: estimate whether the Linux-hosted candidates would stay inside the current included quota with headroom
- **Self-hosted opportunity cost**: count long cancelled runs, runner saturation, and jobs occupying scarce local hardware without using any local advantage
- **Contention tax**: estimate how many minutes of wall-clock time are wasted by light jobs queuing behind heavy builds (or vice versa) on shared runners
- **Cache-locality premium**: note when a self-hosted Docker build lane is plausibly saving enough cold-build time to justify staying local for now
- **Warm-image premium**: note when a persistent self-hosted lane avoids repeated image pulls for jobs that mostly `docker run` or use job containers
- **Cold-pull tax**: note when GitHub-hosted candidates repeatedly spend most of their runtime reacquiring images that are usually already present on persistent self-hosted or ARC runners
- **ARC upside**: note when the real target is not "hosted vs one Mac mini" but "hosted vs an IaC-managed self-hosted pool with persistence and cluster-local networking"
- **Degraded-topology tax**: note when a temporary fallback runner makes the current state look worse or better than the intended ARC steady state

### 9. Produce recommendations

Prioritize by waste magnitude. For each recommendation:
- What to change and in which file
- What waste it eliminates (runs/week, minutes/week, or cascade depth)
- What escape hatch to preserve (usually `workflow_dispatch`)
- Which runner tier the job should move to, with justification per the tier gate

## Guardrails

- Preserve a `workflow_dispatch` escape hatch when recommending trigger removal, so the workflow remains manually triggerable in emergencies.
- Evaluate low success rates by checking *why* the workflow fails — a workflow that correctly fails on bad code is doing its job, not being wasteful.
- Preserve regression visibility when narrowing path filters — when unsure, err toward running.
- Account for self-hosted runner resource constraints: builds can OOM or starve each other under load.
- Verify current GitHub billing rules before recommending hosted-vs-self-hosted migrations, because pricing and quotas change.
- Account for self-hosted costs beyond billing: scarce hardware, operator attention, contention, and cancellation churn.
- Benchmark image-acquisition time for GitHub-hosted runners before assuming they are faster — cold pulls and missing local state can dominate.
- Benchmark the full image-acquisition path for container-based jobs (lint, validation, test) before treating them as generic hosted candidates.
- Evaluate cache locality economics before moving Docker-heavy builds to hosted runners.
- Separate temporary fallback topology from intended ARC or IaC-managed steady state when assessing runner placement.
- Distinguish trigger-frequency waste ("fires too often") from per-run waste ("takes too long") — the fixes are different.
- Estimate minute-cost impact for any `runs-on:` change that switches runner types before approving.
- Treat quota math as a blocking concern when automation multiplier exceeds 5x.
- Apply the tier gate to new workflows, not just changes — do not approve on self-hosted runners solely because it matches the org default.

### Example Findings

**[high] .github/workflows/test.yml:23** — test matrix fans out to 8 Ruby versions but only 2 are supported in production
- **What:** The CI matrix tests Ruby 3.0, 3.1, 3.2, 3.3, head, jruby, truffleruby, and rbx. Production runs Ruby 3.3 only. The gemspec supports `>= 3.2`.
- **Why it matters:** 6 of 8 matrix cells test combinations that will never run in production. Each cell takes 4 minutes on a paid runner. At 20 PRs/week, this burns 640 CI-minutes/week testing irrelevant configurations.
- **Fix:** Reduce the matrix to `[3.2, 3.3]` matching the gemspec. Run JRuby/TruffleRuby only on a scheduled nightly build, not every PR.

**[medium] .github/workflows/deploy.yml:67** — Docker build uses no cache, cold build on every push
- **What:** The `docker build` step has neither `cache-from` nor `cache-to`. Every build starts from scratch, taking 8 minutes. The publish workflow has cache configured, but PR validation workflows don't benefit from it.
- **Why it matters:** Cold builds are 2-5x slower than cached builds. At 20 PRs/week × 8 minutes, that's ~2.7 hours of build time that could be ~1 hour with proper caching.
- **Fix:** Add `cache-from: type=registry,ref=ghcr.io/org/repo:build-cache` and `cache-to: type=registry,ref=ghcr.io/org/repo:build-cache,mode=max` to both PR and publish workflows.

## Output Template

- Runner tier classification (per-job tier assignment with justification):
- Contention findings (light jobs on shared self-hosted, queue depth):
- Alternative tier candidates (webhook/CF Worker):
- Metrics table (workflow, success %, avg duration, runs/week, event mix):
- Runner topology map (current vs intended steady state):
- Benchmark split (cold vs warm by lane, with pull/build/startup/execute breakdown):
- Findings (each with: anti-pattern name, affected file, waste estimate, fix):
- Cascade chains (if any):
- Total estimated waste (runner-minutes/week):
- Hosted-vs-self-hosted split recommendation:
- Escape hatches preserved:
