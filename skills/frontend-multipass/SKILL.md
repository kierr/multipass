---
name: frontend-multipass
multipass_desc: "Review frontend TS/JS/TSX UI changes for correctness, UX regressions, accessibility, state-flow issues, and checklist-based risks."
description: "-"
when_to_use: "When reviewing frontend code, React/Vue components, accessibility, UI state flow, or when the user mentions frontend, CSS, or DOM."
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

# Frontend Review

Review frontend code for correctness, accessibility, state flow, async UX, and user-facing regressions.

## Scope

- Focus on user-visible behavior, not generic style cleanup.
- Cover UI correctness, interaction flow, loading and error states, accessibility, and design-system drift.
- When the code involves chat or assistant-style interfaces, inspect streaming state, tool rendering, thread history, and long-lived client state transitions.

## References

Treat these references as the living checklist. Load only the relevant ones:

- [references/code-quality.md](references/code-quality.md)
- [references/performance.md](references/performance.md)
- [references/business-logic.md](references/business-logic.md)
- [references/accessibility.md](references/accessibility.md) — a11y quick checklist
- [references/accname-guide.md](references/accname-guide.md) — accessible name computation edge cases (load when reviewing title, aria-label, sr-only, or alt patterns)
- [references/WCAG.md](references/WCAG.md) — WCAG 2.1 success criteria table (load when citing specific SCs)

## Workflow

1. Identify the UI surface and the user flow affected by the change.
2. Trace state transitions: initial render, loading, success, error, empty, retry, and navigation.
3. For elements with `title`, `aria-label`, `sr-only`, or `alt`: trace the accessible name computation. Check the element's role — generic roles (`span`, `div`) don't support name-from-content per ACCNAME 1.2. Load `references/accname-guide.md` for edge cases.
4. Verify keyboard, screen-reader, focus, and semantic behavior for interactive elements.
5. Check async and streaming behavior: stale state, double-submit, cancellation, tool result rendering, and history consistency.
6. For framework-specific patterns (React, Vue, etc.), verify component abstractions don't silently break accessibility (e.g., cloneElement overwriting aria-describedby).
7. Report only confirmed regressions or high-confidence risks.

## Guardrails

- Spend review budget on user-visible behavior instead of formatting or subjective design taste, because style issues belong in linters, not code review.
- Accessibility findings are spec-dependent by default. Verify the claimed behavior against WCAG/ACCNAME spec or the framework's actual implementation before reporting. "I think this is how screen readers handle it" is not sufficient grounds for a confirmed finding — apply the Self-Challenge Protocol's spec-dependent verification track.
- Distinguish design-system drift from an intentional local exception by checking for comments, props, or context that explain the deviation.
- Report concrete interaction failures instead of generic frontend cleanup advice, because actionable findings have specific reproduction steps.

### Example: concrete interaction failure

```
[P1] Double-submit on slow network — SubmitButton.tsx:42
The onClick handler calls `submitForm()` without disabling the button
or tracking pending state. On a slow connection, rapid clicks create
duplicate orders. Add a loading state guard.
```

## Output Template

- Surfaces reviewed:
- Confirmed regressions:
- Accessibility risks (with SC citation or marked unverified):
- State and async-flow risks:
- Design-system or UX risks:
- Targeted fixes or tests to add:
