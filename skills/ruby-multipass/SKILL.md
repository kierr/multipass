---
name: ruby-multipass
multipass_desc: "Ruby/Rails correctness review covering ActiveRecord misuse, Sorbet type safety, Sidekiq jobs, mutability footguns, exception anti-patterns, and Rails ecosystem traps."
description: "-"
when_to_use: "When reviewing Ruby/Rails code, ActiveRecord, Sidekiq, Sorbet types, or when the user mentions Ruby, Rails, or Sorbet."
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

# Ruby Review

Review Ruby and Rails code for language-specific correctness, idiomatic quality, and runtime safety that linters and type checkers miss.

## Scope

- Review Ruby files by default — models, controllers, services, jobs, concerns, serializers, lib code, and migrations.
- If the user does not provide explicit scope and `git diff HEAD` is empty, use the shared Git fallback hierarchy.
- Read full files in scope, not just changed lines, because Ruby's dynamic dispatch and module inclusion mean the calling context determines correctness.
- In diff mode, focus on newly introduced issues unless the user asked for a broader audit.

## What Shapes Ruby Problems

**The nil cascade** — Ruby's implicit nil returns, `nil` from `find_by` and `where.first`, safe navigation that masks missing data, and chained method calls that blow up three levels deep. The language doesn't catch these at parse time; they surface in production at 2 AM.

**The ActiveRecord surprise** — queries that look innocent but trigger N+1 loops, `save` that silently fails because validations swallowed the error, `update_all` that skips callbacks and validations, and `includes` that eager-loads the wrong associations because the name is ambiguous.

**The mutable default** — arrays and hashes as default parameter values shared across calls, frozen string literals violated by in-place mutation, constants that aren't frozen and get mutated at runtime.

**The exception trap** — broad `rescue StandardError` blocks that swallow signal interrupts and system errors, `rescue => e` with no logging, custom exception hierarchies that don't follow Ruby conventions, and `ensure` blocks that silently eat exceptions.

**The type lie** — Sorbet sigils claiming `typed: strict` on files with `T.untyped` everywhere, missing `sig` on public methods, `T.must` and `T.cast` used to silence the checker rather than assert genuine knowledge, and `typed: false` on core business logic.

**The callback tangle** — model callbacks with ordering dependencies, `before_destroy` that fails silently, callback chains that trigger unexpected side effects across associations, and concerns that add callbacks without the host model realizing.

**The concurrency gap** — shared mutable state in Sidekiq workers, class variables and module-level state accessed from multiple threads, Redis operations that aren't atomic, and singleton objects with unsynchronized mutation.

**The gem trap** — version pins without documented reasons, gems that monkey-patch core classes, deprecated APIs still in use, and vendored gems that silently diverge from upstream security patches.

## References

- [references/ruby-signals.md](references/ruby-signals.md)

## Workflow

1. Resolve scope from explicit user scope, otherwise the shared default scope hierarchy.
2. Identify the Ruby context: pure Ruby, Rails, or framework-enhanced (Sinatra, Hanami). Adjust expectations accordingly.
3. Check for nil safety issues: implicit nil returns, unsafe chained calls, missing `&.` or `||=` guards where nil would propagate, `find_by` results used without nil checks.
4. Check ActiveRecord usage: N+1 queries (missing `includes`/`eager_load`), `save` vs `save!` intent, skipped validations via `update_all`/`update_columns`, missing transactions for multi-record operations, counter cache correctness.
5. Check mutability: frozen string literal pragma vs actual mutation, mutable default arguments, unfrozen constants that should be frozen, in-place string operations on shared references.
6. Check exception handling: broad rescue clauses, swallowed exceptions without logging, `ensure` that masks exceptions, custom exception class hierarchy correctness.
7. Check Sorbet types: sigil accuracy (does the sigil match actual type safety?), missing `sig` on public methods, `T.untyped` overuse, `T.must`/`T.cast` hiding real issues.
8. Check callbacks and concerns: ordering dependencies, silent failures in `before_*` callbacks, concern methods that conflict with host class, concern callbacks that the host model doesn't expect.
9. Check concurrency: shared mutable state in jobs, thread-unsafe patterns, non-atomic Redis operations, singleton mutation without synchronization.
10. Check idiomatic quality: unnecessary metaprogramming, `method_missing` without `respond_to_missing?`, `define_method` where a block would suffice, string interpolation where `format` is clearer, `each` where a more descriptive enumerable method applies.
11. Check gem usage: deprecated APIs, version pins without justification, missing security patches on vendored gems, monkey-patching side effects.
12. Keep only findings where the Ruby behavior is genuinely wrong, unsafe, or misleading — not stylistic preferences that RuboCop already covers.

## Guardrails

- Accept idiomatic Ruby patterns instead of flagging them as unusual. Ruby has many ways to do the same thing; prefer the one the project already uses.
- Accept Rails conventions (callbacks, concerns, STI, scopes) when used for their intended purpose. Flag when they're used against their purpose or when the side effects are hidden.
- RuboCop handles formatting, naming, and basic style — don't duplicate that surface. Focus on runtime behavior and correctness that linters can't catch.
- Sorbet handles type checking where sigils are enforced — focus on gaps in coverage and misleading type assertions, not on adding types everywhere.
- Respect `frozen_string_literal: true` as a pragma that should be consistent, but don't flag every string operation — only where mutation contradicts the pragma or shared state is affected.
- Distinguish between intentional `rescue StandardError` (e.g., job retry wrappers with proper logging) and accidental exception swallowing.
- `T.untyped` is sometimes the pragmatic choice for complex generic types or external library boundaries — flag overuse, not every instance.
- Database schema concerns (index strategy, migration safety, constraint coverage) are `schema-multipass`'s domain.
- Pure performance optimization (allocation tuning, benchmarking, caching strategy) is `performance-multipass`'s domain.
- Security boundary review (auth, injection, PII handling) is `security-multipass`'s domain.
- Test quality and coverage is `test-multipass`'s domain.
- Findings that touch a sibling lens's domain are still reported here, with the sibling lens noted in the triage entry — do not defer or hand them off. Running another lens is the human's routing decision.
- Ruby's flexibility is a feature — don't flag metaprogramming or dynamic dispatch just because it's dynamic. Flag when the dynamism hides bugs or makes reasoning about behavior unreliable.

## Useful Checks

```bash
# Sorbet sigil distribution
rg -c "# typed:" --type ruby | sort -t: -k2 -n

# Nil-risk patterns
rg -n "find_by\(|\.where\(.*\)\.first|\.try\(" --type ruby
rg -n "&\.(\w+)" --type ruby | head -40

# Mutable defaults
rg -n "def \w+.*=\s*\[|def \w+.*=\s*\{" --type ruby

# Exception handling
rg -n "rescue\s*(StandardError|=>\s*e)\s*$" --type ruby
rg -n "rescue\s*$" --type ruby

# ActiveRecord skips
rg -n "update_all|update_columns|delete_all|touch" --type ruby

# Missing includes
rg -n "\.\w+_ids\b" --type ruby app/models/

# Frozen string literal consistency
rg -L "frozen_string_literal:" --type ruby | head -20
```

Run `bundle exec rubocop` and `srb tc` when available as supporting evidence, not as verdicts.

### Example Findings

**[high] app/services/user_importer.rb:23** — N+1 query inside loop: `User.find_by(email: row[:email])` called per row in CSV import
- **What:** The import method iterates over CSV rows and calls `User.find_by(email:)` for each one, issuing a separate query per row. No `includes` or batch lookup.
- **Why it matters:** Importing 10,000 rows triggers 10,000 queries. In production this takes minutes, holds DB connections, and can exhaust the pool under concurrent load.
- **Fix:** Pre-load existing users into a hash: `existing = User.where(email: rows.map { |r| r[:email] }).index_by(&:email)`, then look up from the hash.

**[medium] app/models/concerns/trackable.rb:8** — mutable default argument `def track(events = [])`
- **What:** The method uses `events = []` as a default parameter. In Ruby, this array is shared across all calls that rely on the default.
- **Why it matters:** If any caller mutates the array (via `events << :login`), the mutation persists for all subsequent calls using the default. This produces silent, intermittent bugs.
- **Fix:** Use `def track(events = nil); events ||= []` or `def track(*events)`.

## Output Template

- Scope reviewed:
- Scope source:
- Nil safety issues:
- ActiveRecord misuse:
- Mutability and frozen string issues:
- Exception handling problems:
- Sorbet type safety gaps:
- Callback and concern issues:
- Concurrency risks:
- Idiomatic quality findings:
- Validation commands and outcomes:
- Remaining findings or blockers:
- Areas not reviewed:
