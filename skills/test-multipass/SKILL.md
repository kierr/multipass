---
name: test-multipass
multipass_desc: "Review tests for confidence quality — test-layer hygiene, external dependency isolation, concurrency risks, coverage metrics, and CI gates."
description: "-"
when_to_use: "When reviewing tests, test quality, coverage, mocking, or when the user mentions tests, testing, or coverage."
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

# Test Review

Review whether tests provide dependable signal across test levels, coverage claims, and test-gate automation.

## Scope

- Evaluate unit, integration, system, end-to-end, contract, regression, and smoke tests in scope.
- Map important behaviors and failure modes to explicit coverage at the right test layer.
- Check that each test layer has a clear purpose: units for local logic, integrations for internal boundary wiring, contracts for consumed-service shape checks, and system or smoke tests for the small set of flows that justify real dependency calls.
- Review whether integration tests isolate external services with mocks, stubs, fakes, or local simulators instead of touching live third-party or shared staging systems.
- Review coverage reports, thresholds, diff coverage, excludes, and trend claims as supporting evidence.
- Review local and CI gates tied to tests: pre-commit or pre-push hooks, required checks, and coverage enforcement.
- Focus on assertion strength, determinism, diagnosability, concurrency safety, and whether failures happen early enough.

## Workflow

1. Identify critical behaviors and failure modes. Make the test intent explicit when possible: happy path, edge case, failure mode, regression, contract compatibility, auth or permissions, or concurrency, retry, timeout, and ordering behavior.
2. Map each important behavior to the current test layer and check whether unit, integration, contract, and system coverage are balanced and non-duplicative.
3. Inspect layer hygiene: integration tests should verify internal composition and persistence boundaries, not third-party availability; real external calls should be rare and explicitly justified.
4. Inspect how consumed services are handled: prefer mocks, stubs, fakes, local emulators, or recorded fixtures for integration tests; reserve live calls for thin contract, smoke, or end-to-end coverage when the risk justifies them.
5. Inspect concurrency and parallelism: check for shared accounts, shared queues, webhook races, rate limits, eventual consistency, global state, and test runner parallelism that can make API-dependent tests flaky.
6. Inspect coverage evidence: reports, thresholds, diff coverage, excludes, and uncovered changed code.
7. Inspect assertion strength, fixtures, determinism, cleanup, and failure diagnosability.
8. Inspect local and CI gates: pre-commit or pre-push hooks, required checks, and coverage enforcement.
9. Report only confirmed confidence gaps, flaky patterns, broken gates, or high-value tests to add.
10. **Parity check:** For each added source file, verify a corresponding test file exists using the project's convention. For each deleted test file, verify the source was also deleted. Flag suppression comments as parity gaps.

## References

- [references/test-signals.md](references/test-signals.md) — test layer heuristics, risk coverage prompts, confidence signals, and common risks

## Test/Code Parity

Detect orphaned code (code without tests) and orphaned tests (tests without code) in the changeset.

**Orphaned code — code added without corresponding tests:**
- New source files in the diff with no test file using the project's test-file convention
- New public methods, classes, or endpoints without test coverage
- Coverage enforcement suppressions (`rubocop:disable RequireTestForNewFiles`, `# noqa`, `istanbul ignore`, `// @ts-ignore` on test requirements) — flag as parity gaps, not passes

**Orphaned tests — tests remaining after code removal:**
- Deleted source files where the test file still exists and references removed code
- Test files importing or requiring modules that no longer exist
- Tests referencing removed methods, classes, or endpoints

**Parity convention by ecosystem** — for each source file, check for a test file using the project's convention:
- Ruby/Rails: `app/models/user.rb` → `spec/models/user_spec.rb` or `test/models/user_test.rb`
- Python: `my_lib.py` → `test_my_lib.py` or `tests/test_my_lib.py`
- TypeScript/JavaScript: `Button.tsx` → `Button.test.tsx` or `Button.spec.ts`
- Go: `user.go` → `user_test.go` (same directory)
- Elixir: `lib/app/user.ex` → `test/app/user_test.exs`
- Java: `User.java` → `UserTest.java` (mirrored test directory)

When the project uses a non-standard convention, infer from existing test file locations rather than assuming the patterns above.

## Guardrails

- Do not equate line coverage with confidence.
- Do not assume every behavior needs every test layer.
- Treat coverage metrics as evidence, not verdicts.
- Do not recommend broad rewrites when targeted tests or gate changes would close the risk.
- Do not mark a test weak only because it omits internals.
- Separate pre-existing flakiness or gate debt from story-specific regressions.
- Do not treat live third-party calls as a normal requirement for integration tests.
- Prefer mocking or simulating consumed external services at the boundary instead of mocking internal code paths.
- Flag uncontrolled parallel execution against shared external resources even when the assertions themselves look correct.
- When real external calls are necessary, expect explicit isolation, serialization or bounded concurrency, stable fixtures or test accounts, and clear ownership of the suite.
- Prefer behavior assertions over internal call choreography unless the contract is the call itself.
- Prefer one crisp reason to fail per test over broad multi-behavior assertions that are hard to diagnose.
- Prefer lower-level tests for pure branching logic and higher-level tests for workflow wiring and boundary collaboration.

## Useful Checks

```bash
rg -n "TODO|FIXME|flaky|retry|sleep|setTimeout|rand|random|time.Now|Date.now|coverageThreshold|nyc|c8|pytest-cov|lcov|codecov|cobertura"
rg -n "pre-commit|pre-push|husky|lefthook|pre-commit-config|coverage"
rg -n "assert|expect|should|require|snapshot|nock|msw|wiremock|webmock|responses|vcr|betamax|pytest.mark.serial|pytest.mark.integration|test.concurrent|serial"
git diff --name-only

# Parity — coverage enforcement suppressions
rg -n "rubocop:disable.*RequireTestForNewFiles|# noqa.*coverage|eslint-disable.*require-test|istanbul ignore|c8 ignore"
# New source files without test counterparts
git diff --name-only --diff-filter=A
# Deleted test files
git diff --name-only --diff-filter=D
```

Run repository-native test commands, coverage reporters, and flake detection tools when available.

## When Proposing Tests

Provide concrete test additions instead of vague coverage requests:

- Scenario: the specific behavior, bug shape, or failure mode to protect
- Level: unit, integration, contract, system, or other
- Setup and action: the minimal preconditions and single operation to exercise
- Assertions: the observable outcome, side effect, or error handling to verify
- Why this level: one sentence on why this scope is the cheapest layer that still proves the risk

### Example Findings

**[high] spec/services/payment_spec.rb:34** — integration test hits live Stripe API with no isolation
- **What:** The test calls `Stripe::Charge.create` against the real Stripe test API without VCR, Webmock, or a fake. It runs in CI alongside 30 other test jobs.
- **Why it matters:** Network latency and Stripe rate limits cause flaky CI. Tests fail on API downtime, not code regressions. Shared test-mode API keys can hit rate limits across parallel runs.
- **Fix:** Wrap with `VCR.use_cassette("stripe_charge")` or stub `Stripe::Charge.create` at the boundary. Reserve live Stripe calls for a dedicated smoke suite.

**[medium] spec/models/user_spec.rb:12** — test asserts on implementation detail instead of observable outcome
- **What:** The test verifies `EmailService.send_email` is called with specific args, rather than checking the email was delivered or the side effect is visible.
- **Why it matters:** Refactoring the email dispatch to batch or queue emails breaks the test even though the behavior is correct. Message expectations couple tests to implementation.
- **Fix:** Assert on the observable effect: `expect { user.activate }.to change { ActionMailer::Base.deliveries.count }.by(1)` or check the delivered email's recipient and subject.

## Output Template

- Behaviors reviewed:
- High-confidence coverage:
- Test level gaps:
- Coverage metric or gate risks:
- Flakiness or assertion-quality issues:
- Targeted tests or workflow changes to add:

Optimize for dependable signal and fast diagnosis.
