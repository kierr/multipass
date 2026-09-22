---
name: model-routing-multipass
multipass_desc: "Review provider routing, model selection, fallbacks, capability mismatches, quota handling, and cost/reliability tradeoffs."
description: "-"
when_to_use: "When reviewing LLM provider routing, model selection, fallback chains, or when the user mentions model routing, LLM providers, or fallback."
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

# Model Routing Review

Review whether a model gateway or routing layer chooses safe, compatible, and reliable routes.

## Scope

- Provider configs, model catalogs, tier aliases, fallback ladders, retry logic, timeout handling, quota awareness, and capability metadata.
- Focus on routing correctness, capability mismatches, silent degradation, and cost or reliability traps.

## Workflow

1. Map routing inputs: requested model, tier alias, capability flags, provider availability, and quota state.
2. Trace fallback and retry behavior under failure, timeout, and unsupported-feature conditions.
3. Verify tool, streaming, reasoning, context-window, and output-limit compatibility claims.
4. Check whether cost, quota, and rate-limit constraints are represented safely.
5. Report concrete cases where routing will fail, degrade silently, or burn budget unexpectedly.

## Common Risks

- Fallback to a model that lacks required capabilities
- Silent change in reasoning, tool, or streaming behavior across providers
- Timeout and retry loops that amplify cost or latency
- Tier aliases whose ordering does not match actual intent
- Missing or stale metadata for context or output limits
- Routing logic that treats account-specific behavior as universally true

## Useful Checks

```bash
rg -n "model|provider|fallback|tier|route|retry|timeout|quota|rate.limit"
rg -n "capability|tool_use|streaming|reasoning|context.window|max.tokens"
rg -n "cost|price|budget|credit|balance" --type json --type yaml
git diff --name-only
```

Use routing configs, model catalogs, and provider health endpoints as primary evidence.

## Guardrails

- Account for client-specific model access differences instead of assuming all clients can auto-route, because API keys, account tiers, and regional availability vary.
- Separate operational preference from correctness bug, because routing preferences are policy decisions while capability mismatches are bugs.
- Ground findings in route-specific evidence from config, tests, logs, or probes instead of theoretical analysis, because routing behavior depends on runtime state.

### Example: silent capability mismatch

```
Finding: Fallback from opus-4-6 to haiku-4-5 drops computer use support.
Evidence: config.json fallback_chain lists haiku-4-5 for the "agent" tier,
but the caller sends computer_use tool definitions — haiku does not support
computer use and returns a text refusal. The caller treats this as a
successful response with no action taken.
```

## Output Template

- Surfaces reviewed:
- Confirmed bugs (routes that will fail or silently degrade):
- Risk areas (routes that could fail under specific conditions):
- Recommended fixes:
