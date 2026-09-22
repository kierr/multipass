---
name: access-control-multipass
multipass_desc: "Review authorization models — RBAC, ABAC, IDOR, tenant isolation, privilege escalation paths, object-level vs function-level checks, and permission matrix completeness."
description: "-"
when_to_use: "When reviewing RBAC, permission checks, role definitions, access control lists, or when the user mentions permissions, roles, or access control."
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

1. **Branch diff.** If on a non-default branch (not main/master), diff against the merge base: `git diff $(git merge-base HEAD origin/main)...HEAD`. This captures the full changeset.
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
| `critical` | Exploitable authorization bypass, privilege escalation, or tenant data leak | User A can access user B's data, regular user gains admin, tenant isolation broken |
| `high` | Likely authz gap that affects correctness under normal usage | Missing object-level check, inconsistent role enforcement, IDOR on common endpoints |
| `medium` | Quality issue that could cause problems under specific conditions | Overly broad role, missing audit logging for privileged actions, default-deny not enforced |
| `low` | Minor improvement — naming, documentation, consistency | Inconsistent permission naming, undocumented role, cosmetic policy gap |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Authorization verification:** Trace the full request path from entry point to data access. Confirm the authorization check exists, applies to the correct resource (not just the resource type), and cannot be bypassed by parameter manipulation. Verify the check is not gated only by client-side state (hidden fields, URL parameters) that an attacker controls.

**Role escalation verification:** Construct a concrete escalation scenario: what role does the attacker have, what role do they escalate to, and what exact request or state manipulation achieves it. Verify the escalation path actually works — not just that a role field exists, but that it is enforced on every code path that grants the escalated privilege.

**Tenant isolation verification:** Identify the tenant context source (subdomain, header, JWT claim, session). Trace it through to every data access query. Verify a request with tenant A's context cannot retrieve tenant B's data through any endpoint, including bulk/list endpoints.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Access Control Review

Review authorization decisions, not authentication. This lens covers who can do what — not who they are. Authentication is `auth-multipass`'s domain.

## Scope

- Identify authorization surfaces: role definitions, permission checks, policy objects, tenant boundaries, and resource ownership.
- Identify authorization models in use: RBAC (roles), ABAC (attributes/context), ReBAC (relationships), ACLs (lists), or ad-hoc checks.
- Identify sensitive operations: data mutation, cross-tenant access, admin actions, bulk operations, and privilege elevation endpoints.
- Focus on gaps between policy intent and enforcement reality.

## Workflow

1. Map the authorization model: roles, permissions, policies, and their assignment rules.
2. Trace enforcement at every entry point: controllers, resolvers, handlers, API endpoints, background jobs.
3. Verify object-level authorization (not just function-level). Can user A access user B's resource?
4. Check tenant isolation boundaries for multi-tenant systems.
5. Verify privilege escalation paths: can a lower-privileged user reach a higher-privileged action?
6. Review permission matrix completeness: are all sensitive operations covered?
7. Check for authorization bypass patterns: parameter tampering, mass assignment, predictable IDs.

## Common Risk Areas

### IDOR (Insecure Direct Object Reference)
- Endpoints accepting resource IDs without verifying the requesting user owns or can access that resource
- List/filter endpoints that do not scope to the authorized user or tenant
- Batch/bulk endpoints that accept arrays of IDs without per-item authorization

### Privilege Escalation
- Role or permission fields exposed in requests that users can modify (mass assignment)
- Admin endpoints gated only by URL obscurity or client-side checks
- Horizontal escalation: user A performing actions as user B without authorization
- Vertical escalation: regular user performing admin actions through parameter manipulation

### Tenant Isolation
- Data queries missing tenant-scoping filters
- Shared resources accessible across tenant boundaries
- Tenant context derived from user-controlled input without validation
- Background jobs running in one tenant's context accessing another tenant's data

### Role and Permission Design
- Roles with overly broad permissions violating least privilege
- Missing negative permissions or deny rules (only allow-list, no block-list)
- Orphaned permissions not assigned to any role
- Hardcoded role checks that bypass the policy framework
- Role assignment without approval workflow or audit trail

### Object-Level Authorization
- Function-level checks (`before_action :authenticate`) without object-level checks (`@record.user_id == current_user.id`)
- Inconsistent enforcement across read vs write vs delete operations
- Authorization checks in views/templates but not in controllers/handlers
- Cached authorization decisions that become stale after permission changes

### Policy Framework Gaps
- Policy classes that return true by default (allow-all fallback)
- Missing policy for newly added endpoints
- Policy tests that only cover the happy path
- Skip/override mechanisms (`skip_authorization`, `bypass_policy`) without audit logging

## Guardrails

- Distinguish authorization (what you can do) from authentication (who you are). Login, sessions, and token validity are `auth-multipass`'s domain.
- Distinguish access control from general security. Injection, XSS, or crypto issues belong in `security-multipass`.
- Report findings with a concrete unauthorized access scenario, not just "this check is missing." Show how an attacker exploits the gap.
- When an authorization model is intentionally permissive (public APIs, read-only endpoints), note it as verified-intentional rather than a finding.
- Infrastructure-level access control (K8s RBAC, network policies) is `k8s-multipass`'s domain.
- Findings that touch a sibling lens's domain (authentication, general security, infra access control) are still reported here, with the sibling lens noted in the triage entry — do not defer or hand them off. Running another lens is the human's routing decision.

## Useful Checks

```bash
# Authorization framework usage
rg -n "authorize|pundit|can\?|cannot\?|ability|policy|permission|before_action.*authorize"
rg -n "skip_authorization|skip_policy|bypass|override.*auth"

# Resource ownership checks
rg -n "current_user\.id|\.user_id|\.owner_id|\.tenant_id|where\(.*user_id"

# Role and permission definitions
rg -n "role|admin|superuser|moderator|permission|privilege" --type ruby --type py --type ts

# Mass assignment vectors
rg -n "params\.permit|params\.require|strong.parameters|attr_accessible|mass.assignment"

# IDOR indicators — endpoints accepting IDs without ownership checks
rg -n "params\[:id\]|find\(params|find_by\(.*params"

# Tenant scoping
rg -n "tenant|account|organization|workspace|ActsAsTenant|apartment"

# Object-level vs function-level gap
rg -n "before_action.*only:|before_action.*except:" app/controllers/
```

Use existing policy tests, authorization specs, and permission matrices when available.

### Example Findings

**[critical] app/controllers/api/v1/records_controller.rb:15** — IDOR: user can access any record by ID
- **What:** `show` action finds record by `params[:id]` without verifying `current_user` owns it. `Record.find(params[:id])` returns any record regardless of ownership.
- **Why it matters:** Any authenticated user can read, and via `update`/`destroy` also modify or delete, any other user's records by changing the ID parameter.
- **Fix:** Scope the query: `current_user.records.find(params[:id])`, or add `authorize @record` using the policy framework.

**[high] app/policies/application_policy.rb:8** — default policy returns `true` for all actions
- **What:** `ApplicationPolicy#initialize` sets `@user = user; @record = record`, and every method (`index?`, `show?`, `create?`, `update?`, `destroy?`) returns `true` by default.
- **Why it matters:** Any new endpoint that forgets to define a policy method automatically grants access to all users. The default should be deny, not allow.
- **Fix:** Change the base policy to return `false` by default. Add an explicit `def default; false; end` and have all base methods call it, or use `def method_missing(name, *args); name.to_s.end_with?('?') ? false : super; end`.

**[medium] app/controllers/api/v1/admin/users_controller.rb:3** — admin check is role-name string match, not permission-based
- **What:** `before_action -> { head :forbidden unless current_user.role == 'admin' }` checks a hardcoded role name.
- **Why it matters:** If admin permissions are split into granular abilities later (e.g., `can_manage_users`, `can_view_billing`), this check won't reflect the new model. Role renames silently revoke access. No audit trail for the check.
- **Fix:** Use the policy framework: `authorize User, :manage?` and define the permission in `UserPolicy`.

**[low] app/models/role.rb:12** — role name inconsistency: `admin` vs `administrator` across codebase
- **What:** The `Role` model defines `admin`, but three controllers check for `administrator`. Neither is canonical.
- **Why it matters:** Inconsistent role names cause silent authorization failures when the wrong name is checked, or silently grant access when both are checked with OR logic.
- **Fix:** Canonicalize to one name. Add a constant `Role::ADMIN = 'admin'` and reference it everywhere.

## Output Template

- Authorization model reviewed:
- Object-level authorization gaps:
- Function-level authorization gaps:
- Tenant isolation findings:
- Privilege escalation paths:
- Permission matrix completeness:
- Policy framework health:
- Required fixes before release:
- Residual risk and assumptions:

Optimize for closing the gap between policy intent and enforcement reality.
