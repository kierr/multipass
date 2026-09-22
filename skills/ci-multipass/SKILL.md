---
name: ci-multipass
multipass_desc: "Review CI/CD pipelines for safety — workflow permissions, secret exposure, script injection, action pinning, cache integrity, release gates."
description: "-"
when_to_use: "When reviewing CI/CD pipelines, workflow files, GitHub Actions, or when the user mentions CI, pipelines, or workflow safety."
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

# CI Review

One concern: **is this pipeline safe?**

For cost and waste diagnosis (runner tier mismatches, trigger waste, contention, quota burn), see `ci-cost-multipass`.

## Scope

- GitHub Actions workflows, reusable workflows, composite actions, release jobs, cache configuration, and deployment gates.
- Workflow permissions, secret handling, action pinning, concurrency controls, and release gates.
- **Structural concerns**: whether workflows should exist separately or be consolidated. If two workflows share >70% of their setup steps (checkout, Docker login, image pull, build configuration) and differ only in push/no-push or single/multi-arch, flag them as candidates for merging.

**Not in scope**: runner placement economics, trigger waste, cost optimization, quota burn — those belong to `ci-cost-multipass`.

## Workflow

1. Map workflow triggers, required permissions, secrets, and critical jobs.
2. Trace artifact creation and consumption across jobs and workflows.
3. Verify action pinning, cache keys, concurrency controls, and branch protections.
4. Check release gates, environment protections, rollback paths, and failure visibility.
5. Report only confirmed or high-confidence risks.

## Safety Risks

- Over-broad workflow permissions (`permissions:` missing or too wide at workflow or job level)
- Unpinned third-party actions (tag or branch refs instead of full-length commit SHAs)
- Secret exposure through logs, env, or pull-request context
- **Script injection**: untrusted event context (`${{"{{"}} github.event.pull_request.title {{"}}"}}`, `${{"{{"}} github.event.issue.body {{"}}"}}`, etc.) interpolated into `run:` steps without sanitization. The #1 workflow exploit vector.
- Cache poisoning or weak cache-key isolation
- Missing concurrency controls or duplicate deploy races
- Release jobs without verification or rollback gates
- Flaky matrix or dependency ordering that hides real failures
- Docker build-args mismatch: Dockerfile declares `ARG` for auth tokens used in `RUN` steps but the workflow omits `build-args`, causing silent degradation hidden by layer cache until a cache miss
- Long-lived cloud credentials as repository secrets when OIDC (`aws-actions/configure-aws-credentials` with `role-to-assume`) would eliminate static secrets entirely
- Self-hosted runner persistence: workflows that leave sensitive artifacts (tokens, build caches with credentials) on persistent self-hosted runners between jobs
- **Detect-changes bypass on non-PR events**: workflows using `dorny/paths-filter` with `if event != pull_request then changes=true` — the filter is silently ignored on push/merge_group, meaning every push to main runs unconditionally. This is both a safety concern (unvalidated code may trigger unexpected paths) and a cost concern (see `ci-cost-multipass`).
- **Redundant detect-changes**: workflow already has `paths:` on its trigger, making the detect-changes job pointless — it gates a gate that GitHub already enforced.

## Guardrails

- Do not report speculative supply-chain risk without a concrete abuse path.
- Distinguish slow workflows from unsafe workflows. Cost and waste belong in `ci-cost-multipass`.
- Do not recommend removing triggers without preserving a `workflow_dispatch` escape hatch.
- Script injection findings require a concrete exploit path (attacker-controlled input → unsanitized interpolation → shell execution). A `${{"{{"}} github.event {{"}}"}}` context in a `run:` step is only exploitable if the specific field is attacker-controllable.

### Example Findings

**[high] .github/workflows/deploy.yml:12** — `permissions: write-all` grants unnecessary write access to deployment workflow
- **What:** The workflow uses `permissions: write-all` at the top level, granting all available permissions including `packages: write`, `security-events: write`, and `deployments: write` to every job.
- **Why it matters:** A compromised action or script injection in any job can push packages, modify deployments, or alter security events. The blast radius includes the entire org's GHCR registry and deployment state.
- **Fix:** Scope permissions to the minimum needed: `permissions: { contents: read, id-token: write, deployments: write }` at workflow level, with job-level overrides only where needed.

**[medium] .github/workflows/ci.yml:45** — `actions/checkout@v4` uses branch ref instead of pinned commit SHA
- **What:** All third-party actions reference tags like `@v4` instead of full commit SHAs (e.g., `@b4ffde65f46336ab88eb53be808477a39d688e6f`).
- **Why it matters:** A tag is a mutable pointer. An attacker who gains push access to the upstream repo can move the `v4` tag to a malicious commit. All downstream workflows would silently pull the compromised version on next run.
- **Fix:** Pin all third-party actions to full-length commit SHAs. Use `renovate` to keep SHAs up to date with automatic PRs.

## Output Template

- Pipelines reviewed:
- Safety risks (permissions, secrets, pinning, cache):
- Recommended fixes:
