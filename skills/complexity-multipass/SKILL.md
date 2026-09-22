---
name: complexity-multipass
multipass_desc: "Review code for unnecessary complexity — over-abstraction, duplication, oversized files, speculative generality, misleading indirection. Works on diffs or full repo."
description: "-"
when_to_use: "When reviewing code for unnecessary complexity, over-abstraction, duplication, or when the user mentions complexity, refactoring, or code clarity."
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

# Complexity Review

Review whether code is harder to understand and change than the problem requires.

## Scope

- Review diffs by default, or the named file, path, or whole repo when the user expands scope.
- If the user does not provide explicit scope and `git diff HEAD` is empty, use the shared Git fallback hierarchy: branch diff vs upstream/default, then the last 3 non-merge commits, then a prioritized project slice only if Git-based scope cannot be derived.
- Read full files in scope, not just changed lines, so the complexity judgment has context.
- In diff, branch-diff, and recent-commit modes, prefer complexity introduced by the change unless the user explicitly asked for a broader audit.

## References

- [references/complexity-signals.md](references/complexity-signals.md)

## Workflow

1. Resolve scope from explicit user scope, otherwise the shared default scope hierarchy.
2. Determine project conventions before judging whether a pattern is excessive.
3. Look for complexity without present-day payoff:
   - duplication or near-duplicate logic
   - unnecessary indirection or wrapper layers
   - oversized files that hide multiple responsibilities or obsolete scaffolding
   - speculative generality or premature abstraction
   - redundant state or over-parameterized interfaces
   - misleading names, dead code, or copy-paste drift
4. Keep only findings where a simpler alternative is concrete and clearly lowers cognitive load.
5. Distinguish newly introduced complexity from pre-existing complexity unless the user asked for a broader audit.
6. Report confirmed-dead code — unused types, unreachable functions, zero-reference helpers — as a finding with suggested Fix action in the triage table. Evidence of planned use (config entries, TODOs, partial wiring, or schema-mirroring) is a reason to report instead of delete. Schema-mirroring means the field maps to an external data format (CSV header, API key, DB column) — that's contract compliance, not speculation.
7. For ambiguous simplifications (refactors, interface changes, restructuring), report as findings with suggested actions.
8. Report evidence-backed simplifications, not style preferences.

## Guardrails

- Accept idiomatic framework and language patterns instead of flagging unfamiliar-looking code, because conventions the ecosystem expects are not unnecessary complexity.
- Respect genuine domain complexity instead of treating it as over-engineering, because the problem space itself may require the abstraction depth.
- Stay on complexity rather than drifting into performance, security, boundary, or test-quality territory — those are their specialist lenses' domains.
- Require a concrete simpler alternative instead of using file length alone as a finding.
- Maintenance drag, stale workarounds, and abandoned experiments are `debt-multipass`'s domain; do not broaden scope into them.
- Findings that touch a sibling lens's domain are still reported here, with the sibling lens noted in the triage entry — do not defer or hand them off. Running another lens is the human's routing decision.
- Report confirmed-dead code (zero call sites, no planned-use evidence) as a finding with suggested Fix action. Report partially-wired code (configured but not instantiated, referenced in TODOs) as a finding instead of auto-deleting it.
- Report parallel or near-duplicate directory trees with evidence of which variant is canonical instead of deleting them, because automated tree deletion has caused data loss incidents.
- Stop after a clear result instead of looping on speculative findings.
- Recommend local simplifications instead of broad rewrites, because targeted changes are easier to review and less risky.
- Leave domain-heavy code alone when the complexity matches the domain instead of rewriting to satisfy “simpler.”
- Prefer no finding over a vague complaint about “too much abstraction.”
- Leave dataclass/struct/record fields that mirror external data schemas (CSV headers, API response shapes, database columns) alone, because these represent an external contract — a field not yet used in logic may still be read from the source.

## Useful Checks

```bash
cat CLAUDE.md AGENTS.md .cursorrules 2>/dev/null | head -200
git diff HEAD
git log --format= --name-only | sort | uniq -c | sort -rn | head -20
```

Language-specific complexity linters are supporting evidence, not verdicts.

### Example Findings

**[high] app/services/order_processor.rb:1-340** — 340-line service doing validation, pricing, payment, inventory, and notification in one method
- **What:** `OrderProcessor#process!` validates input, calculates pricing, charges the card, decrements inventory, and sends confirmation email in a single method with 12 conditional branches.
- **Why it matters:** Any change to one concern risks breaking the others. The method is impossible to test in isolation — tests must set up all five subsystems.
- **Fix:** Extract into `OrderValidator`, `PriceCalculator`, `PaymentCharger`, `InventoryReserver`, and `OrderNotifier` called sequentially from a thin orchestrator.

**[medium] lib/utils/helpers.rb:15-89** — 74-line `helpers.rb` with 12 unrelated utility functions spanning auth, formatting, and HTTP
- **What:** A shared utility module contains `current_user_from_token`, `format_currency`, `parse_pagination_params`, `http_get_with_retry`, and 8 other functions with no common domain.
- **Why it matters:** Changes to auth utilities trigger recompilation of formatting code. The module has become a junk drawer — importers get 12 functions when they need one.
- **Fix:** Split into `AuthHelpers`, `FormatHelpers`, `PaginationHelpers`, `HttpHelpers`. Each can be imported independently and tested in isolation.

## Output Template

- Scope reviewed:
- Scope source:
- Confirmed unnecessary complexity:
- Justified complexity to keep:
- Validation commands and outcomes:
- Remaining findings or blockers:
- Areas not reviewed:
