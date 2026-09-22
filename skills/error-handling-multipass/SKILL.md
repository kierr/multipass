---
name: error-handling-multipass
multipass_desc: "Review how failures travel — swallowed exceptions, inconsistent error shapes, missing retry classification, opaque error messages."
description: "-"
when_to_use: "When reviewing error handling, failure propagation, retry logic, or when the user mentions errors, exceptions, or error handling."
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

# Error Handling Review

Find where failures go to die quietly, where error context evaporates, and where retry logic operates blind. When something breaks, will you know why — or will you be left debugging a mystery?

## Scope

- Review diffs by default, or the named file, path, or whole repo when scope is expanded.
- Focus on error shape consistency across module boundaries, error context preservation through call chains, and retry classification coverage.
- Individual swallowed exceptions in a single service are `wide-multipass` territory. This lens focuses on **systemic patterns** — when multiple modules handle errors differently and callers can't predict what they'll get.
- The guiding question: **When something fails, does the system fail loudly, helpfully, and recoverably?**

## What Swallowed Signal Looks Like

**Bare rescue without re-raise** — catching everything and doing nothing, the classic error black hole. Something failed, but nobody will ever know what or why.

**StandardError swallowing** — broad catches that absorb actionable signals. Network timeouts, permission errors, validation failures — all silently consumed, all requiring different responses, all treated identically.

**Broad rescue masking programming errors** — `rescue StandardError` or `catch (Exception)` wrapping internal business logic that could raise `NoMethodError`, `TypeError`, `NameError`, `ArgumentError`, or `ZeroDivisionError`. These are programming bugs that should surface in development and testing, not be silently caught alongside legitimate operational errors. The broad catch hides the bug and makes diagnosis extremely difficult.

**Legitimate vs illegitimate broad rescue:**
- Legitimate: wrapping an external service call where any exception should be caught, classified, and handled.
- Legitimate: top-level error boundary in a web handler that logs, reports, and returns a 500.
- Legitimate: job worker catch-all that records the failure and moves to the next job.
- Illegitimate: wrapping internal business logic where a `NoMethodError` indicates a bug in the code itself.
- Illegitimate: wrapping data transformation where a `TypeError` means the input shape is wrong.
- Illegitimate: wrapping serialization where a `NameError` means a variable is undefined.

**Detection heuristic:** If the rescued block contains method calls on objects that could be nil, array/hash access, arithmetic, or string operations — and the rescue doesn't re-raise or log the full exception — flag it as masking programming errors.

**Error context erasure** — catching an exception and re-raising a new one without preserving the original. The stack trace dies, the cause disappears, debugging becomes archaeology.

**Shape drift** — one module returns `{error, message}`, another throws, a third returns `null`, a fourth returns `{success: false}`. Callers cannot predict, handlers cannot be consistent.

**Retry blindness** — retrying without classification. Some errors are transient (retry), some are permanent (fail fast), some are user errors (surface immediately). Treating them identically wastes resources and masks real problems.

**Missing error types in retry policy** — the retry configuration lists what to retry, but the code throws error types never mentioned. Forever loops or silent bails.

**User-facing opacity** — `An error occurred`, `Operation failed`, `Something went wrong`. Messages that tell users nothing and operators even less. The original error lives in logs, stripped from the response.

## Workflow

1. Trace error birth-to-surface paths. Where do errors originate? Where do they travel? Where do they surface?
2. At each boundary, ask: Is the error classified? Is context preserved? Is the shape consistent?
3. Distinguish systemic design gaps (all errors swallowed here) from individual lapses (one missing catch).
4. For retry logic, verify classification exists and matches thrown types.
5. Report findings with suggested actions for confirmed signal loss.

## Guardrails

- Not every catch needs a re-raise. Some errors are genuinely handled. Distinguish swallowing from handling.
- Not every module needs identical error shapes. But callers should know what to expect.
- Retry logic is a surface, not an afterthought. Treat it as such.
- Focus on patterns, not individual bugs. One swallowed error is a bug; systematic swallowing is a design failure.
- In Elixir/OTP, each module defining its own `{:error, reason}` atoms is idiomatic — `{:error, :not_found}` vs `{:error, {:http_error, status, body}}` is not shape drift, it's domain-specific error typing. Only flag shape drift when a caller chains multiple modules and has no way to pattern-match the union of error shapes.
- In Elixir, `rescue` blocks that return `{:error, reason}` are legitimate error boundaries — they convert exceptions to tagged tuples at module edges. Do not flag these as "bare rescue without re-raise" if they preserve the exception message.

### Example: shape drift finding

```
Finding: PaymentService returns {:error, :declined} but OrderService
catches only {:error, reason} when reason is a string, converting atoms
to "declined" via to_string(). CallerService pattern-matches on
"insufficient_funds" (a string) — it never sees :declined (an atom)
because the coercion happens one layer too late.
```

## Output Template

- Scope:
- Confirmed signal loss (swallowed, erased context, shape drift):
- Retry classification gaps:
- User-facing error quality:
- Not reviewed:
