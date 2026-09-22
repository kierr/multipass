---
name: api-contract-multipass
multipass_desc: "Validate externally consumed API contracts (HTTP, RPC, GraphQL, events) for compatibility and drift across handlers, schemas, tests, SDKs."
description: "-"
when_to_use: "When reviewing externally consumed API contracts, HTTP/RPC/GraphQL handlers, schema compatibility, or when the user mentions API compatibility or contract drift."
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

# API Contract Review

Review external behavior, not internal style. Confirm whether interfaces seen by clients are stable, coherent, and documented.

## Scope

- Identify contract surfaces: paths, methods, operations, request fields, response fields, status codes, error shapes, headers, pagination, auth behavior, and versioning.
- Identify sources of truth: handlers, validators, schemas, OpenAPI or protobuf specs, tests, fixtures, SDK snapshots, and migration notes.
- Focus on externally observable behavior first.

## Workflow

1. Build a contract inventory from docs and code.
2. Compare each contract item across implementation, schema, and tests.
3. Classify changes as additive, behavior-changing, or breaking.
4. Highlight mismatches between docs and runtime behavior.
5. Recommend compatibility-safe fixes or versioning actions.

## Breaking Signals

- Renamed or removed endpoints, methods, or operations
- Removed or renamed request or response fields
- Required field added without backward-compatible fallback
- Enum values removed or semantics changed
- Status code behavior changed for existing scenarios
- Error payload shape changed without migration path
- Auth or permission behavior changed without documentation

## Guardrails

- Do not label additive optional fields as breaking by default.
- Do not assume examples are authoritative when code and schemas disagree.
- Do not ignore semantic changes hidden behind identical field names.
- Distinguish implementation refactor from contract change.
- Release-gating a diff for backward-compatibility risk (not ongoing contract drift) is `breaking-change-multipass`'s domain. If a finding touches it, report the finding here with `breaking-change-multipass` noted in the triage entry — do not defer or hand it off; running that lens is the human's routing decision.

## Useful Checks

```bash
rg -n "openapi|swagger|protobuf|graphql|schema|handler|route|status code"
rg -n "required|enum|oneOf|anyOf|error|pagination|cursor|next_token" docs/ .
git diff --name-only
```

Use repo-native contract tests, snapshot tests, or generated client checks when available.

### Example Findings

**[high] app/controllers/api/v1/orders_controller.rb:28** — response field `order_id` renamed to `id` without version change
- **What:** The v1 API previously returned `{ "order_id": 123 }`. A refactor changed the serializer to return `{ "id": 123 }`. The route is still `/api/v1/orders`.
- **Why it matters:** Two mobile clients deserialize `order_id` from the response. The rename causes `undefined method` on iOS and `KeyError` on Android for every order fetch. No version bump means no opt-in migration.
- **Fix:** Revert the field name in v1. Add the new name in v2 alongside the old one with a deprecation notice. Give consumers a migration window.

**[medium] docs/api/openapi.yaml:89** — OpenAPI schema says `status` is an enum but handler accepts any string
- **What:** The OpenAPI spec declares `status` as `enum: [pending, active, cancelled]`. The controller accepts any string value and stores it without validation.
- **Why it matters:** Clients relying on the spec assume only three values are possible. The backend can return arbitrary strings, causing client-side parsing errors and misleading filtering logic.
- **Fix:** Add validation in the controller/model to match the declared enum, or update the spec to reflect actual behavior.

## Output Template

- Contract surface reviewed:
- Confirmed breaking changes:
- Behavior changes needing release notes:
- Additive non-breaking changes:
- Doc and schema drift:
- Recommended mitigation or versioning:

Optimize for safe client upgrades and clear compatibility decisions.
