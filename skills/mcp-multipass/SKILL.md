---
name: mcp-multipass
multipass_desc: "Review MCP servers, tools, prompts, schemas, permissions, and protocol behavior for contract and safety issues."
description: "-"
when_to_use: "When reviewing MCP integrations, tool definitions, server configs, or when the user mentions MCP, tool schemas, or protocol behavior."
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

# MCP Review

Review MCP integrations for tool contract quality, permission safety, and protocol correctness.

## Scope

- Tool names, descriptions, input schemas, error semantics, idempotency, transport behavior, auth boundaries, and exposed capabilities.
- Focus on what downstream agents or clients can observe and misuse (calling a tool with unintended side effects, bypassing authorization, or receiving error shapes that cause incorrect retry or fallback behavior).

## Workflow

1. Map exposed tools, resources, prompts, and transport surfaces.
2. Verify tool descriptions and schemas match actual behavior.
3. Review auth, permission, and data-access boundaries.
4. Check error handling, retries, streaming behavior, and partial-failure semantics.
5. Flag prompt-injection risk in tool descriptions or resource content when realistic.

## Common Risks

- Tool schema drift or misleading descriptions
- Unsafe tool side effects hidden behind read-like names
- Missing or weak authz around sensitive actions
- Non-idempotent operations exposed without clear contract
- Error shapes that mislead calling agents
- Prompt-injection or instruction smuggling through tool metadata
- Streaming or pagination behavior that breaks client assumptions

### Concrete Examples

1. **Write hidden behind read name.** A tool named `get_user_profile` actually upserts a last-accessed timestamp on every call. Agents calling it for idempotent reads unknowingly mutate state, breaking caching assumptions and creating audit trail noise.
2. **Schema missing required validation.** A `create_task` tool accepts a `priority` field as a free-form string with no enum constraint. Agents pass values like `"urgent"`, `"ASAP"`, or `"1"` that the backend silently ignores, defaulting to `"medium"` without error.
3. **Authorization gap.** An MCP server exposes `delete_workspace` with no role check — any authenticated caller can invoke it. The tool was intended for admin use only, but the schema does not declare or enforce that constraint.

## Guardrails

- Assess ambiguous descriptions against actual handler behavior before flagging as exploitable, because many descriptions are simply under-documented rather than dangerous.
- Distinguish protocol contract bugs from normal product behavior choices, because only contract violations warrant fixes.
- Ground findings in contract evidence from schemas, handlers, tests, and recorded tool output instead of speculation about what a tool name might imply.

### Example Findings

**[high] src/tools/user_tools.ts:23** — `get_user_profile` tool silently upserts a `last_accessed` timestamp on every call
- **What:** The tool description says "Returns user profile data" (read-only), but the handler calls `db.users.updateOne({ id }, { $set: { last_accessed: now } })` before returning the profile.
- **Why it matters:** Agents calling this tool for idempotent reads unknowingly mutate state, breaking caching assumptions and creating audit trail noise. Repeated reads in a loop cause unnecessary writes.
- **Fix:** Remove the write from the read handler. If the timestamp is needed, use a separate `touch_user_profile` tool or move the side effect to an explicit call.

**[medium] src/schemas/task_schema.json:8** — `priority` field accepts any string with no enum constraint
- **What:** The `create_task` tool schema defines `priority` as `type: string` with no `enum`. Agents pass values like `"urgent"`, `"ASAP"`, or `"1"` that the backend silently ignores, defaulting to `"medium"`.
- **Why it matters:** The tool appears to accept the agent's input but produces different behavior. Agents believe they've set priority correctly but tasks are created with the default, causing missed SLAs.
- **Fix:** Add `enum: ["low", "medium", "high", "critical"]` to the schema, or validate and return an error for unrecognized values.

## Output Template

- MCP surfaces reviewed:
- Confirmed contract bugs:
- Permission and safety risks:
- Prompt-injection or instruction-smuggling risks:
- Streaming, pagination, or error-handling risks:
- Recommended fixes:
