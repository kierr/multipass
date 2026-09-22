---
name: gitops-multipass
multipass_desc: "Review GitOps manifests — Kustomize overlays, HelmReleases, Flux Kustomizations, OCI sources — for overlay correctness, dependency order, and secret refs."
description: "-"
when_to_use: "When reviewing GitOps manifests, Kustomize overlays, Helm releases, Flux Kustomizations, or when the user mentions GitOps, Flux, or Kustomize."
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

# GitOps Manifest Review

Review Flux CD / Kustomize manifest changes for structural correctness, overlay integrity, and operational safety.

## Scope

- Changes to Kustomize overlays, HelmRelease values, Flux Kustomization objects, OCIRepository/HelmRepository sources, or cluster fleet definitions.
- Overlay inheritance chains (base → environment overlays).
- Flux substitution variable hygiene and secret references.

## Workflow

1. Identify all changed manifest paths and their overlay tier (base, staging, production, per-cluster).
2. For each changed path, read the full Kustomization chain from base through overlays to understand inheritance.
3. Apply the review checklist below. Generate candidate findings only when there is concrete behavioral or operational impact.
4. If the repo provides a GitOps validation entrypoint (e.g., `kubeconform`, `conftest`, or a wrapper task), run it on the changed paths to catch schema violations.
5. Self-challenge each finding: verify the resource actually exists, the field path is correct, and the issue is not already mitigated by another part of the overlay chain.

## Review Checklist

### 1. Kustomize Overlay Correctness

- Base → environment overlay inheritance is intact.
- Strategic merge patches target resources that exist in base.
- No duplicate resource definitions across overlays in the same chain.
- `kustomization.yaml` lists all resources and patches — no orphaned files.

### 2. HelmRelease Dependency Ordering

- `dependsOn` chains are correct and acyclic.
- CRD-providing releases are depended upon by consumers.
- `sourceRef` points to a valid HelmRepository or OCIRepository in the same namespace or a cross-namespace reference with `spec.sourceRef.namespace`.

### 3. Flux Substitution Variables

- Runtime variables use `${...}` syntax consistently.
- Values that Flux substitutes at deploy time are not hardcoded in overlays.
- `postBuild.substituteFrom` references valid ConfigMaps or Secrets.

### 4. Secret References

- Secrets reference an external secret operator (ESO, Infisical, SOPS, etc.) rather than inline plaintext.
- Secret CRs follow the repo's naming convention.
- No credentials, tokens, or keys appear in plain text.

### 5. Resource Limits and Requests

- Containers specify `resources.requests` at minimum (CPU and memory).
- Memory limits are set; CPU limits follow the repo's policy.
- Values are realistic for the workload type.

### 6. Network Policy Completeness

- Network policies exist for components requiring isolation.
- Egress rules allow required external dependencies.
- Ingress rules match the service exposure model.

### 7. Namespace Consistency

- Kustomization `targetNamespace` matches the resource namespace.
- Resources within a component target the same namespace.
- Namespace naming follows the repo's convention.

## Guardrails

- Comment-only or ref-path-only changes still warrant checking that replacement refs exist and point to decision-bearing documents, because broken cross-references in manifests cause operational confusion during incidents.
- CI pipeline configuration (not manifest content) is `ci-multipass`'s domain.
- RBAC policy depth, secret management architecture, and trust boundary design beyond manifest-level secret references are `security-multipass`'s domain.
- Whether runbook or ADR references in manifest comments still match current documentation is `docs-drift-multipass`'s domain.
- Findings that touch a sibling lens's domain are still reported here, with the sibling lens noted in the triage entry — do not defer or hand them off. Running another lens is the human's routing decision.

### Example: overlay inheritance break

```
Finding: staging/kustomization.yaml patches "api-deployment" but the
base kustomization renamed the resource to "api-server-deployment" in
commit abc123. The strategic merge patch silently creates a new resource
instead of modifying the existing one, resulting in two Deployments.
```

## Output Template

- Scope:
- Manifests reviewed:
- Kustomize overlay correctness:
- HelmRelease dependency ordering:
- Flux substitution variables:
- Secret references:
- Resource limits and requests:
- Network policy completeness:
- Namespace consistency:
- Validation result:
- Not reviewed:
