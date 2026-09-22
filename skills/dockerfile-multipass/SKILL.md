---
name: dockerfile-multipass
multipass_desc: "Review Dockerfiles for multi-stage efficiency, pushed-but-unconsumed images, base stage duplication, layer waste, and build matrix alignment."
description: "-"
when_to_use: "When reviewing Dockerfiles, container images, build stages, layer efficiency, or when the user mentions Docker, containers, or image builds."
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

# Dockerfile Review

Review Dockerfile architecture and container image build pipelines for structural waste that CI safety and cost lenses miss.

`ci-multipass` covers workflow safety and cost. This skill asks "are the images themselves well-architected — and does anything actually use them?"

## Scope

- Dockerfiles: multi-stage structure, base image choices, layer ordering, stage reuse.
- Build pipelines: CI workflows that build and push images from those Dockerfiles.
- Consumption: whether built images are actually referenced by live K8s manifests, Compose files, CI workflows, or other executable consumers in the repo, including persistent self-hosted or ARC-managed CI lanes that repeatedly pull or run the image.
- **Not in scope**: workflow permissions, trigger safety, action pinning, runner-placement economics (ci-multipass), container runtime security like root users or capabilities (security-multipass).

## Workflow

### 1. Map the Dockerfile stage graph

Read every Dockerfile in scope. For each, extract:
- Every `FROM` line and its `AS` alias
- The parent chain (which stages inherit from which)
- Which stages are intermediate (used as `FROM` targets by later stages) vs. final (no downstream stage depends on them)

Draw the stage graph mentally. Identify the final targets — these are the only stages that should be built and pushed as images.

### 2. Map the build pipeline

Find the CI workflow(s) that build images from these Dockerfiles. Extract:
- Which Dockerfile targets are built (the `target:` parameter in docker build)
- Which images are pushed to a registry
- Whether intermediate stages are pushed as standalone images

Cross-reference: if a workflow pushes an intermediate stage as its own image, that's a finding unless something outside the Dockerfile consumes it directly.

### 3. Audit image consumption

For every image that the pipeline pushes, search the repo for references:
- K8s manifests (`image:` fields)
- Docker Compose files
- CI workflows that pull or reference the image
- Documentation or README references

Classify each hit:
- **Live consumer**: checked-in workflow, manifest, or runtime config that currently executes or is wired into current repo surfaces
- **Scaffold or planned consumer**: template, placeholder manifest, TODO-gated job, controller future hook, or dormant component
- **Docs-only reference**: ADR, README, threat model, comment, or example snippet

Only live consumers justify publishing an image by default. Docs-only references and planned scaffolding do not.

When the only live consumers are CI jobs, record the consumer lane:
- GitHub-hosted ephemeral runner
- Persistent local self-hosted runner
- ARC or other IaC-managed self-hosted runner pool

Persistent self-hosted or ARC consumers can justify publishing a prebuilt image even when no cluster manifest references it, because warm local availability may be part of the image's actual job.

An image that is built, pushed, signed, and stored but has no live consumer is pure waste.

### 4. Check for base stage duplication

Look for multiple `FROM <base-image>` lines in the same Dockerfile that start parallel stage trees with overlapping setup. Signs:
- Two or more stages that install the same toolchain (e.g., mise, apt packages) independently
- Copy-paste user creation, PATH setup, or shim wiring across stage trees
- Stages that differ only in a few additional packages but rebuild the entire base from scratch

Estimate the duplication in lines. When two stage trees share >60% of their setup, consolidation into a shared base with additive layers is likely worthwhile.

### 5. Check layer efficiency

Within each stage, look for:
- **Layer ordering**: frequently-changing layers (COPY source code) should come after rarely-changing layers (apt-get, tool installs) to maximize cache hits
- **Unnecessary packages**: `--no-install-recommends` missing, dev packages in production images, packages installed but never used
- **Cleanup gaps**: apt lists, temp files, or build artifacts not removed in the same layer they're created
- **Multi-run anti-pattern**: consecutive `RUN` commands that could be combined to reduce layers

### 6. Check build matrix alignment

Verify that the CI matrix entries map cleanly to Dockerfile targets:
- Every matrix entry should correspond to a real `FROM ... AS <target>` in the Dockerfile
- Path filters for triggering rebuilds should match what each target actually depends on (e.g., a target that doesn't use Gemfile shouldn't rebuild when only Gemfile changes)
- Cache-from scopes should follow the stage inheritance chain
- Every `ARG` used in a `RUN` step (especially auth tokens like `GITHUB_TOKEN`) must be passed via `build-args` in every workflow that builds the target — not just some. A missing `build-args` entry causes silent degradation hidden by Docker layer cache; the build only fails when the cache misses

## Guardrails

- Accept intermediate stages being built as part of the multi-stage chain (that is how Docker works) and flag only intermediates being pushed as standalone images when nothing consumes them.
- Preserve genuinely different final targets as separate images instead of collapsing them into one fat image, because different dependency profiles justify the separation.
- Do not flag base image choices without a concrete alternative and reason. "Use Alpine" is not a finding unless the current base creates a specific, demonstrable problem.
- Do not duplicate security-multipass's container security surface (root users, capabilities, secret leakage). If a security issue is found, note it in the triage entry with `security-multipass` as the secondary lens rather than duplicating its finding here.
- Do not duplicate ci-multipass's workflow safety surface (permissions, action pinning, runner placement). Stay on image architecture.
- Do not recommend removing a published image used primarily by persistent self-hosted or ARC runner lanes without confirming whether warm image availability is the reason it exists.
- Do not count ADRs, READMEs, comments, or examples as proof that an image is live.
- Do not count placeholder templates, dormant components, or TODO-wired scaffolds as proof that an image should stay published.
- Do not treat checked-in ARC or other IaC-managed runner wiring as "just planned" solely because that pool is temporarily degraded. Separate current outage state from the intended live consumer topology.
- Distinguish "suboptimal but harmless" from "actively wasteful." Prioritize findings that cost real CI minutes, registry storage, or maintenance burden.

### Example: unconsumed pushed image

```
Finding: ci-builder image pushed to registry but has zero live consumers.
Evidence: grep for "ci-builder" across K8s manifests, Compose files, and
CI workflows returns only a docs/architecture.md reference.
Impact: ~2 min/build of push time + registry storage.
Fix: Remove the push step; build ci-builder as a local intermediate only.
```

## Output Template

- Dockerfiles reviewed:
- Stage graph: (stage names and inheritance chain)
- Images pushed: (list with consumer type: runtime / CI-hosted / CI-self-hosted / CI-ARC / scaffold / docs-only / unconsumed)
- Confirmed waste:
  - Unconsumed images:
  - Duplicated base stages:
  - Layer inefficiencies:
- Build matrix alignment issues:
- Recommended consolidation:
- Estimated savings: (fewer builds, fewer pushed images, reduced duplication lines)
