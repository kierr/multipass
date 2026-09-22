---
name: release-multipass
multipass_desc: "Review release processes — versioning consistency, changelog quality, deployment strategy, rollback capability, artifact signing, and tag hygiene."
description: "-"
when_to_use: "When reviewing release processes, version bumps, changelogs, or when the user mentions releases, versioning, or changelog."
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
| `critical` | Exploitable vulnerability, data loss, or production breakage | Unsigned artifact deployed to production, no rollback path for breaking change |
| `high` | Likely bug that affects correctness under normal usage | Mutable tag in production, version scheme inconsistency that breaks dependency resolution |
| `medium` | Quality issue that could cause problems under specific conditions | Missing changelog entry, deployment strategy without health verification |
| `low` | Minor improvement — style, naming, dead code | Inconsistent version prefix format, missing release notes for patch |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Version verification:** Trace the version from git tag → build artifact → deployment manifest. Verify the version derivation is deterministic and cannot produce the same version string from different commits. Check that the version scheme is applied consistently across all artifacts.

**Rollback verification:** Construct a concrete rollback scenario. Can the previous version be deployed without coordinated schema or config changes? If not, the rollback path is incomplete — document what else must be reverted.

**Deployment verification:** For deployment strategy findings (canary, blue-green, rolling), verify the health checks and promotion gates actually exist in the workflow or manifest, not just in documentation. A documented canary without automated analysis is not a canary.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Release Process Review

One concern: **can this change be shipped safely and rolled back if it breaks?**

For CI pipeline safety (permissions, secrets, injection), see `ci-multipass`. For CI cost and waste, see `ci-cost-multipass`. For breaking-change detection, see `breaking-change-multipass`. This lens covers the release/delivery strategy itself.

## Scope

- Release workflows, deployment manifests, version derivation, changelog generation, artifact publishing, and rollback procedures.
- Version schemes (semver, calver, custom), version derivation from git state, tag conventions.
- Deployment strategies: rolling, canary, blue-green, and their health verification gates.
- Artifact integrity: image signing, SBOM, provenance attestation, tag immutability.
- Changelog and release note quality: completeness, accuracy, breaking-change highlighting.
- Rollback capability: can the previous version be deployed, are there schema/config dependencies that complicate rollback.

**Not in scope**: CI pipeline safety (`ci-multipass`), backward-compatibility detection (`breaking-change-multipass`), Dockerfile efficiency (`dockerfile-multipass`).

## The Silent Killers

**The mutable tag that overwrites production** — `latest`, `stable`, or branch-name tags are overwritten on every build. A bad build immediately replaces the production artifact. Two concurrent builds race to set the tag. Rollback requires finding the previous commit SHA and re-tagging — error-prone and slow. Every production reference must resolve to a unique, immutable artifact.

**The canary that isn't** — A canary deployment waits 5 minutes then auto-promotes regardless of metrics. This is a delayed deploy, not a canary. If the canary is broken, it still goes to production. A real canary has automated success/failure criteria comparing error rates and latency between canary and baseline.

**The rollback that requires more than code** — The previous version's code can be deployed, but the database migration that shipped with it cannot be reversed without data loss. Or the config changes are manual. Or the feature flags are in an intermediate state. The "rollback" button exists but doesn't actually restore the previous state.

**The version that isn't unique** — The version string is derived from a timestamp, random value, or manual input instead of git state. Two builds from different commits can produce the same version. Dependency resolution breaks. Artifacts are ambiguous.

## Workflow

1. Map the release pipeline: triggers, version derivation, build, publish, deploy, and rollback steps.
2. Trace version consistency: is the version deterministic, unique per commit, and propagated to all artifacts?
3. Verify artifact integrity: signing, provenance, immutable tags.
4. Check deployment strategy: health gates, promotion criteria, rollback automation.
5. Review changelog and release notes: completeness, accuracy, audience-appropriate.
6. Report only confirmed or high-confidence risks.

## Release Risks

- **Mutable tags in production**: `latest`, `stable`, or branch-name tags that are overwritten on each build. Every production reference must resolve to a unique, immutable artifact.
- **Non-deterministic versioning**: version derived from timestamps, random values, or manual input rather than git state (tags, commit count, short SHA). The same commit must always produce the same version.
- **Missing rollback path**: deployment strategy has no documented or automated rollback, or rollback requires coordinated changes (schema migrations, config updates) not included in the rollback procedure.
- **Unsigned artifacts**: images or artifacts pushed to registries without signing (cosign/sigstore). Deployment should verify signatures before promoting.
- **Canary without analysis**: canary deployment exists but has no automated success/failure criteria. A human must manually promote or rollback — this is not a canary, it's a delayed deploy.
- **Blue-green without health verification**: traffic switch happens without confirming the new environment is healthy. Stale or misconfigured green environments accept production traffic silently.
- **Rolling update without readiness gates**: new pods receive traffic before passing readiness probes, or `maxSurge`/`maxUnavailable` allow too many pods to be replaced simultaneously.
- **Changelog gaps**: release notes missing entries for merged PRs, or breaking changes buried in a bullet list without a dedicated section.
- **Version scheme inconsistency**: some artifacts use semver, others use git SHA, others use timestamps. Dependency resolution across artifacts becomes unpredictable.
- **Tag hygiene**: annotated vs lightweight tags used inconsistently; tags not GPG-signed when policy requires it; pre-release tags (`-rc`, `-beta`) deployed to production registries.
- **Release job ordering**: artifacts published before tests pass, or deployment triggered before artifact signing completes.
- **Missing provenance**: no SLSA provenance or SBOM generated during the build. Downstream consumers cannot verify artifact origin or contents.
- **Environment protection bypass**: production deployment environment has no required reviewers, no wait timer, or no branch restriction.

## Guardrails

- Do not flag missing canary/blue-green if the project's deployment model is simple enough (single-server, serverless, or direct push). Not every project needs complex deployment strategies.
- Distinguish "no rollback automation" from "no rollback path." A documented manual procedure is acceptable for low-risk deployments; the finding is about missing paths, not missing automation.
- Do not recommend signing or provenance tooling that doesn't exist for the project's artifact type or registry.
- Version scheme preferences (semver vs calver) are project decisions. Flag inconsistency within a project, not deviation from a preferred scheme.
- Changelog quality is subjective. Flag missing entries for merged PRs and buried breaking changes, not prose style.

### Example Findings

**[high] .github/workflows/release.yml:34** — Production deployment uses mutable `latest` tag
- **What:** The release workflow pushes to `ghcr.io/org/app:latest` and the deployment manifest references `latest`. Every build overwrites the tag.
- **Why it matters:** A bad build immediately replaces the production artifact. Rollback requires finding the previous SHA and re-tagging, which is error-prone and slow. Two concurrent builds race to set `latest`, and the loser's artifact is what runs in production.
- **Fix:** Tag with the semver version (`ghcr.io/org/app:v1.2.3`) and the short SHA (`ghcr.io/org/app:sha-a1b2c3d`). Reference the version tag in deployment manifests. Keep `latest` as a convenience alias only for dev environments.

**[medium] .github/workflows/release.yml:67** — Canary deployment has no automated success criteria
- **What:** The workflow deploys to the canary pool and waits 5 minutes before promoting to production, but the promotion is unconditional — no error rate, latency, or health check analysis occurs during the wait.
- **Why it matters:** A canary that auto-promotes after a fixed time is not a canary — it's a delayed deploy. If the canary is broken, it still goes to production after the timer expires.
- **Fix:** Add analysis during the canary window: compare error rates between canary and baseline, check latency percentiles, and auto-rollback if thresholds are breached.

**[low] CHANGELOG.md:1** — Breaking change buried in "Bug Fixes" section
- **What:** PR #142 removed the `user.email` field from the API response. The changelog entry reads "Fix: remove deprecated email field from user endpoint" under "Bug Fixes."
- **Why it matters:** Consumers searching the changelog for breaking changes will miss this if they only scan the "Breaking Changes" section. The entry should be in a dedicated "BREAKING CHANGES" section.
- **Fix:** Move the entry to a "BREAKING CHANGES" section with a migration note: "Replace `user.email` with `user.contactEmail`. The old field is removed without a deprecation period."

## Output Template

- Release pipelines reviewed:
- Version consistency findings:
- Artifact integrity findings:
- Deployment strategy findings:
- Changelog and release note findings:
- Rollback capability findings:
- Recommended fixes:
