---
name: loop-safety-multipass
multipass_desc: "Review jobs, workers, agents, schedulers for infinite loops, runaway redrives, unchanged-input reprocessing, and missing cost/time/attempt budgets."
description: "-"
when_to_use: "When reviewing jobs, workers, schedulers for infinite loop risks, or when the user mentions loops, retries, or runaway processing."
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

# Loop Safety Review

Review whether execution can repeat forever, reprocess unchanged work, or burn cost without a hard stop.

## Scope

- Review any repeatable control flow: polling loops, retry queues, worker redispatch, queue redrive, cron or scheduler triggers, recursive continuation, reconciliation, streaming resume, and watcher callbacks.
- Apply the same lens to agent systems and ordinary software services.
- Include the cost side of loops: tokens, credits, API spend, runtime, queue growth, and operator fatigue.

## Workflow

1. Enumerate every loop surface in scope, including in-process loops and outer redispatch or scheduler loops.
2. For each loop, identify:
   - unit of work
   - trigger
   - freshness or progress signal
   - stop condition
   - who or what is allowed to resume it
3. Verify hard budgets at each layer:
   - per-iteration or per-turn
   - per-session or per-process
   - per-item redispatch
   - wall-clock runtime
   - money, token, or credit burn where applicable
4. Verify unchanged input cannot repeat indefinitely. A loop is unsafe when it can retry the same item without a new external signal such as state transition, newer timestamp, new payload, or explicit operator action.
5. Verify idempotency and dedup boundaries: claim leases, processed markers, attempt tracking, circuit breakers, and kill switches.
6. Verify backoff and cooldown behavior. Distinguish success-loop churn from failure retry churn.
7. Verify observability for attempt count, halt reason, budget exhaustion, and operator-visible status.

## High-Risk Findings

- Clean completion can requeue the same work forever.
- Retry limits cover failures but not continuation or success-path redispatch.
- Loop termination depends on state that the loop itself does not change.
- The same unchanged item can be selected on every poll tick.
- There is no hard budget for expensive operations, only soft guidance.
- A child loop is bounded, but an outer loop recreates the child indefinitely.
- Human review or permission is required, but automation resumes anyway.
- There is no operator kill switch, hold state, or circuit breaker after repeated non-progress.

## Guardrails

- Do not accept `max_turns`, `max_retries`, or any single counter as sufficient until all outer loops are checked too.
- Treat unchanged external state as no progress unless the code proves otherwise.
- Distinguish failure retries from success-path churn; both can be runaway loops.
- A warning log is not a safety control.
- Prefer monotonic, observable stop rules over advisory prompts or agent instructions.
- If cost is material, require an explicit budget even when correctness appears bounded.

## Useful Checks

```bash
rg -n "retry|backoff|redrive|requeue|schedule|poll|reconcile|reschedule|continue|continuation|resume|loop|while|for|timer|cron|tick|watch"
rg -n "max_turns|max_retries|max_attempts|budget|token|credit|cost|updated_at|version|etag|checkpoint|lease|claim|dedup|idempot"
git diff --name-only
```

Trace loop ownership across modules before concluding a path is bounded.

### Example: unchanged-input reprocessing

```
Finding: ReconcileWorker polls the queue every 30s and processes items
where status = "pending". On success, it sets status = "completed" —
but on partial failure it leaves status = "pending" and logs a warning.
The same item re-enters processing on the next tick with identical input,
creating an infinite loop that burns API credits without progress.
Fix: Add an attempt counter and move items to "failed" after 3 attempts.
```

## Output Template

- Loop surfaces reviewed:
- Hard stops confirmed:
- Unsafe repetition findings:
- Missing budgets or circuit breakers:
- Idempotency or dedup gaps:
- Observability gaps:
- Recommended safeguards:

Prefer hard stops, fresh-input gates, and operator-visible halts over optimistic retries.
