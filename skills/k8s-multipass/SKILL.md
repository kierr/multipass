---
name: k8s-multipass
multipass_desc: "Review Kubernetes resource manifests — Deployments, Services, Ingress, PodDisruptionBudgets, probes, resource quotas, and SecurityContext — for correctness, resilience, and operational safety."
description: "-"
when_to_use: "When reviewing Kubernetes resources, deployments, services, configmaps, or when the user mentions Kubernetes, K8s, or pods."
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
| `critical` | Will cause outage, data loss, or security breach in production | Pod with no resource limits on a shared cluster, privileged container accepting external traffic |
| `high` | Likely to cause degradation or disruption under normal operations | Liveness probe conflated with readiness, PDB that blocks all voluntary eviction |
| `medium` | Could cause problems under specific conditions (scale, failure, upgrade) | Missing topology spread, no startup probe for slow-start app, generous resource requests |
| `low` | Minor improvement — naming, consistency, dead manifest fields | Inconsistent label selectors, unused env vars, redundant volume mounts |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Probe verification:** Confirm the probe port and path actually exist in the container spec. A liveness probe pointing to port 8080 when the container listens on 3000 will kill the pod immediately — but only if the port mismatch is real. Trace the container port declarations.

**Resource verification:** Confirm that resource limits/requests are actually missing, not inherited from a LimitRange or namespace default. Check for namespace-level defaults before flagging a pod as "unlimited."

**Selector verification:** Confirm that Service selectors actually match pod labels. A typo in the selector is invisible until traffic routing fails at runtime. Read both the Service and the target Deployment/StatefulSet labels side-by-side.

**Security context verification:** Confirm that a missing SecurityContext field is actually the container default and not set at the pod level. Pod-level security context applies to all containers; container-level overrides it. Check both levels before flagging a missing field.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Kubernetes Resource Review

Review Kubernetes resource manifests for correctness, resilience, and operational safety. This lens focuses on the resource-level quality of K8s manifests — Deployments, StatefulSets, DaemonSets, Services, Ingress, PodDisruptionBudgets, NetworkPolicies, ResourceQuotas, and pod-level configuration (probes, resources, security context). `gitops-multipass` covers Flux/Kustomize overlay wiring and dependency ordering; this lens covers what the overlays actually deploy.

## Scope

- Workload resources: Deployments, StatefulSets, DaemonSets, Jobs, CronJobs
- Service mesh: Services, Endpoints, Ingress, Gateway API resources
- Scheduling and resilience: PodDisruptionBudgets, topology spread constraints, anti-affinity rules, node selectors, taint tolerations
- Probes: liveness, readiness, startup — correctness, separation of concerns, threshold tuning
- Resource management: requests, limits, LimitRanges, ResourceQuotas
- Security context: runAsNonRoot, allowPrivilegeEscalation, capabilities, readOnlyRootFilesystem, seccomp profiles
- Configuration: ConfigMaps, volume mounts, env var sources, secret volume projections
- RBAC: ServiceAccount assignments, role bindings (surface-level; deep RBAC review is `security-multipass`'s domain)

## The Silent Killers

**Liveness probe conflated with readiness** — A liveness probe checks the same endpoint as the readiness probe. When the app is slow to start (loading cache, warming connections), the readiness probe marks it not-ready (correct — don't send traffic). But the liveness probe also fails, and K8s kills the pod. The pod restarts, hits the same slow start, gets killed again. CrashLoopBackOff. Liveness must check only "is this process alive and un-deadlocked" — never application readiness. Use a startup probe for slow-start apps.

**PDB that blocks all voluntary eviction** — A PodDisruptionBudget with `minAvailable: 100%` or `maxUnavailable: 0` means no voluntary eviction is ever possible. This blocks node drains during upgrades, cluster scaling, and maintenance. The cluster operator cannot drain the node without force-deleting pods. During a real incident, this delays response. PDBs should allow at least one pod to be disrupted.

**Service selector typo** — The Service selector has a typo: `app: api-serve` instead of `app: api-server`. The Service has no endpoints. Traffic returns connection refused. This is invisible in manifest diff review because the selector looks correct at a glance. The only way to catch it is to cross-reference Service selectors against the actual pod labels in the target workload.

**No resource limits on a shared cluster** — A pod with no memory limit can consume all node memory, causing other pods on the same node to be OOMKilled. On a shared cluster, this is a noisy-neighbor problem that cascades across workloads. Even on dedicated clusters, unbounded memory usage hides memory leaks until they become production incidents.

**Ingress path mismatch** — The Ingress path is `/api/v2/` but the app expects `/api/v2` (no trailing slash). Depending on the Ingress controller, this either strips the slash, appends it, or returns 404. The path rewriting behavior is controller-specific and often undocumented. Always verify path matching against the controller's pathType semantics (Exact, Prefix, ImplementationSpecific).

## Workflow

1. Identify all changed K8s resource manifests. Categorize by resource type (Deployment, Service, Ingress, etc.).
2. For each workload resource (Deployment, StatefulSet, DaemonSet), review: container specs, probes, resources, security context, volume mounts, env configuration.
3. For each Service, cross-reference selectors against target workload pod labels.
4. For each Ingress, verify path semantics and TLS configuration.
5. Check scheduling and resilience: PDBs, topology spread, anti-affinity, node selectors.
6. Check security posture: SecurityContext, capabilities, service account tokens.
7. Self-challenge each finding against the protocols above.

## Review Checklist

### 1. Probes

- Liveness, readiness, and startup probes are correctly separated
- Liveness probe does NOT check application readiness (only process liveness)
- Startup probe configured for slow-start applications with appropriate `failureThreshold * periodSeconds`
- Probe ports and paths reference valid container ports
- Readiness probe initialDelaySeconds accounts for container startup
- Probe thresholds not too aggressive (avoid flapping under transient load)

### 2. Resources

- All containers specify `resources.requests` (CPU and memory)
- Memory limits are set; CPU limits follow cluster policy
- Requests and limits are realistic for the workload (not copy-pasted defaults)
- Init containers have appropriate resources (they may need more than the main container)
- No pod uses `Latest` tag without `imagePullPolicy: Always`

### 3. Scheduling & Resilience

- PodDisruptionBudgets allow at least one disruption (no `minAvailable: 100%`)
- Topology spread constraints exist for multi-replica workloads
- Pod anti-affinity prevents all replicas on the same node
- Node selectors and tolerations match actual node labels
- StatefulSets use `OrderedReady` or `Parallel` pod management intentionally

### 4. Service & Ingress

- Service selectors match target workload pod labels exactly
- Service port `targetPort` matches container `containerPort`
- Headless services are intentional (not a typo omitting `clusterIP`)
- Ingress paths use the correct `pathType` for the controller
- TLS configuration is complete (secret exists, correct DNS names)
- Ingress backends reference valid Service names and ports

### 5. Security Context

- `runAsNonRoot: true` set (or a non-root `runAsUser`)
- `allowPrivilegeEscalation: false` set explicitly
- `readOnlyRootFilesystem: true` where feasible (writable dirs via emptyDir)
- Capabilities dropped (`drop: ["ALL"]`) with only necessary adds
- `automountServiceAccountToken: false` for pods not calling the K8s API
- No hostPath mounts, Docker socket mounts, or privileged containers without documented justification

### 6. Configuration

- ConfigMaps referenced by volumes or env vars actually exist
- Secret volume projections use `optional: true` only when appropriate
- Env var sources (configMapKeyRef, secretKeyRef) reference valid keys
- Volume mounts don't shadow container binaries or config paths

## Guardrails

- This lens reviews K8s resource quality. GitOps delivery wiring is `gitops-multipass`'s domain and CI pipeline configuration is `ci-multipass`'s domain; findings touching them are still reported here with the sibling lens noted in the triage entry — do not defer or hand them off.
- Deep RBAC policy review (Role/ClusterRole rule correctness, privilege escalation paths) is `security-multipass`'s domain.
- Container image build efficiency is `dockerfile-multipass`'s domain; this lens reviews runtime configuration only.
- Not every pod needs topology spread constraints. Single-replica workloads don't benefit. Apply scheduling checks where replicas > 1.
- `readOnlyRootFilesystem: true` is not always feasible (some apps write to their install dir). Flag as a recommendation, not a bug, when the app genuinely needs a writable root.
- Probe tuning is workload-specific. Don't flag reasonable defaults as findings — only flag when the values are clearly wrong (e.g., liveness `periodSeconds: 1` with `failureThreshold: 1`).

## Useful Checks

```bash
rg -n "kind: (Deployment|StatefulSet|DaemonSet|Service|Ingress|PodDisruptionBudget|NetworkPolicy|CronJob|Job)" -i
rg -n "livenessProbe|readinessProbe|startupProbe" -i
rg -n "resources:|requests:|limits:" -i
rg -n "topologySpreadConstraints|podAntiAffinity|podAffinity|nodeSelector|tolerations" -i
rg -n "runAsNonRoot|allowPrivilegeEscalation|readOnlyRootFilesystem|capabilities:" -i
rg -n "automountServiceAccountToken|serviceAccountName:" -i
rg -n "hostPath|docker\.sock|privileged:" -i
rg -n "selector:|matchLabels:" -i
rg -n "pathType|pathPrefix|backend:" -i
rg -n "minAvailable|maxUnavailable|minReplicas" -i
```

### Example Findings

**[critical] infra/components/api/deployment.yaml:34** — liveness probe kills pod during slow start, causing CrashLoopBackOff
- **What:** The Deployment's liveness probe checks `HTTP GET /health` on port 8080 with `initialDelaySeconds: 5` and `periodSeconds: 5`. The app takes ~30 seconds to initialize (load ML model, warm cache). The readiness probe fails at 5s (correct — no traffic yet), but the liveness probe also fails at 10s and K8s kills the pod. The pod restarts and the cycle repeats.
- **Why it matters:** The service never reaches Ready state. No traffic is ever served. This is a deployment-breaking configuration error.
- **Fix:** Add a `startupProbe` with `httpGet: /health`, `periodSeconds: 10`, `failureThreshold: 30` (allows 300s startup). Change the liveness probe to `initialDelaySeconds: 0` with `periodSeconds: 15` and `failureThreshold: 3` — liveness only checks for deadlock after startup succeeds.

**[high] infra/components/web/service.yaml:12** — Service selector doesn't match any pod labels
- **What:** The Service `selector` has `app: web-frontend` but the target Deployment labels its pods `app: webapp`. The selector matches zero pods. Endpoints are empty.
- **Why it matters:** Traffic to this Service returns connection refused. The Deployment is healthy but unreachable through the Service.
- **Fix:** Change the Service selector to `app: webapp` to match the Deployment's pod template labels.

**[medium] infra/components/api/deployment.yaml:15** — no topology spread constraints for 3-replica Deployment
- **What:** The Deployment runs 3 replicas with no `topologySpreadConstraints`. On a 3-node cluster, all 3 pods could land on the same node via default scheduler scoring.
- **Why it matters:** A single node failure takes down all replicas simultaneously. The service appears healthy (Deployment reports 3/3) but is actually running on a single point of failure.
- **Fix:** Add `topologySpreadConstraints` with `maxSkew: 1`, `topologyKey: kubernetes.io/hostname`, `whenUnsatisfiable: DoNotSchedule`.

## Output Template

- Scope:
- Resources reviewed (by type):
- Probes:
- Resources (requests/limits):
- Scheduling & resilience:
- Service & Ingress:
- Security context:
- Configuration:
- Not reviewed:
