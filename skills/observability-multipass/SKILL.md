---
name: observability-multipass
multipass_desc: "Review logs, metrics, traces, dashboards, and alerts for production detection and diagnosis signal quality without high-noise instrumentation."
description: "-"
when_to_use: "When reviewing logging, metrics, traces, dashboards, or when the user mentions observability, monitoring, or alerting."
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

# Observability Review

Review whether operators can answer what failed, where, why, and for whom within minutes.

## Scope

- Evaluate logging, metrics, tracing, health signals, dashboards, and alerts.
- Focus on diagnosability of critical user flows and failure modes.
- Include cost and noise concerns: log volume, high-cardinality metrics, alert fatigue.

## Workflow

1. Identify critical workflows and SLO-relevant paths.
2. Verify logs capture key context and correlation identifiers.
3. Verify metrics cover rate, errors, latency, saturation, and queue health.
4. Verify traces connect cross-service requests and expensive spans.
5. Verify alert rules are actionable and routed correctly.
6. Identify blind spots and noisy signals.

## High-Value Checks

- Structured logs with request or trace IDs
- Error logs include operation, dependency, and key dimensions
- Metrics avoid unbounded cardinality labels
- Dashboards expose success rate and latency percentiles
- Alerts include symptom, impact, and runbook hint
- Missing telemetry for retries, throttling, and circuit-breaker behavior

## Guardrails

- Optimize for decision quality instead of telemetry volume, because more data without better signal just increases storage costs and alert fatigue.
- Avoid cardinality-heavy labels (user IDs, request IDs as metric labels) because they cause metric storage explosion and query timeouts.
- Require alerts and runbooks alongside dashboards before counting a flow as covered, because dashboards without alerts are passive and dashboards without runbooks delay incident response.
- Distinguish instrumentation gaps from product bugs, because they have different owners and different fix paths.

### Example: blind spot finding

```
Finding: Payment retry flow has no metrics or structured logs.
Evidence: src/payments/retry.ts catches errors and retries up to 3 times,
but logs only "retrying..." at debug level. No counter for retry attempts,
no histogram for retry latency, no alert on exhausted retries.
Impact: Payment failures are invisible until users report them.
```

## Useful Checks

Look for observability wiring in code and config:

```bash
rg -n "Logger\.\|Rails\.logger|structlog|tracing\.instrument" --type ruby --type py --type ts
rg -n "observe_callback|around_action|ActiveSupport::Notifications"
rg -n "request_id|trace_id|correlation_id"
rg -n "SIDEKIQ_REDIS|sentry_dsn|honeybadger_api_key|datadog_api_key"
git diff --name-only
```

Check monitoring configs, on-call docs, and alert definitions when present.

## Output Template

- Flows reviewed:
- Observability strengths:
- Blind spots:
- High-noise instrumentation:
- Alerting and runbook gaps:
- Recommended instrumentation changes:

Prefer fewer, better signals that speed incident diagnosis.
