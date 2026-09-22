---
name: debt-inventory-multipass
multipass_desc: "Review suppression surfaces that accrue hidden debt — linter Exclude/Enabled:false ledgers, inline-disable accumulations, count-ratchet tests that drift upward, and baseline files (rubocop_todo, sorbet/rbi, eslint, ruff) parked outside their regenerating mechanism or missing a freshness gate. Enforces that legacy-offense debt lives in auto-regenerating baselines, main-config Exclude is structural scoping only, and any numeric ratchet is a forced countdown an author cannot bump to ship."
description: "-"
when_to_use: "When reviewing lint/format/type config or baseline files, when an Exclude list / Enabled:false / inline-disable grows, when a ratchet/count/freeze test asserts a suppression number, or when the user mentions debt inventories, hidden debt, suppression ledgers, ratchets, or baselines going stale."
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

**This lens always expands scope to the full suppression surface**, even when the trigger is one file: a single new `Exclude:` entry implies the whole list it joins, and the ratchet test that counts it. Read the complete config file, its baseline sibling, and any test that asserts a count on either.

### Review Mode

Review-only. No mutations, no fix waves, no loops.

### Core Rules

- Work from repo truth first. Separate confirmed findings from assumptions and unverified areas.
- Report every confirmed finding regardless of severity. Do not pad with unverified speculation, but do not dismiss confirmed findings because they are minor.
- Respect explicit preservation annotations in code (`DO NOT REMOVE`, `DO NOT DELETE`, `KEEP THIS`). Never recommend removal or modification of annotated-to-keep code.
- When another review skill is clearly needed, use only the smallest relevant set of available review lenses. General technical debt (dead code, stale workarounds, abandoned experiments) belongs to `debt-multipass`; this lens covers only *tooling-suppression accrual*.
- **Low-severity findings default to actionable.** "It's just a nitpick" is not a valid reason to downgrade or omit — a one-line `Exclude:` added silently today is tomorrow's ratchet bump.
- **Out-of-scope findings are reported with a suggested action** (fix/TODO/issue) in the triage table. Never silently drop a finding.

### Finding Severity

| Level | Meaning | When to use |
|---|---|---|
| `critical` | Not used for this lens | — |
| `high` | Debt parked in a hand-maintained ledger that has no auto-shrink path, or a ratchet whose cap has demonstrably drifted upward | 1,100 single-file `Exclude:` entries in `.rubocop.yml` while a freshness-gated `.rubocop_todo.yml` exists; a `PER_COP_CAPS` total that grew across history |
| `medium` | A baseline file with no regeneration/freshness gate, or a numeric ratchet with no downward enforcement | `sorbet_untyped_baseline.json` with no staleness check; a `count <= MAX` test where `MAX` is freely bumpable |
| `low` | A single new suppression entry added without justification, or an inline-disable missing a tracking TODO | One new `Exclude:` path; a `# rubocop:disable` without a TODO |
| `unverified` | Plausible but not confirmed against the regenerating mechanism | Cannot determine whether a baseline auto-regenerates |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the suppression surface
- **Why it matters:** how it accrues or what it hides
- **Fix:** the canonical resolution — move to the regenerating baseline, convert the numeric cap to a non-numeric invariant, or add the freshness gate

### Self-Challenge Protocol

Debt-inventory findings have one dominant false-positive shape: **structural scoping mistaken for debt.** Before reporting, verify each flagged suppression:

**Is it debt or policy?** A suppression is *debt* only if it names specific instances that should eventually comply. It is *structural policy* if it is a glob/directory pattern expressing "this cop never applies here" (`db/**/*`, `vendor/**/*`, `generated/**/*`, `test/integration/**/*`). Glob/pattern entries are the sanctioned use of main-config `Exclude:` — never flag them. Only literal single-file paths (or narrow file lists) in a main config are debt.

**Is the baseline actually gated?** Before flagging a baseline as "ungated," grep for a freshness hook/CI step (`rubocop-todo-freshness`, `--regenerate-todo`, `tapioca`, `ruff --update-baseline`, a PreToolUse hook on the file). If a gate exists, the baseline is not a finding — its contents auto-shrink.

**Is the ratchet actually drifting?** Before flagging a numeric ratchet as a sink, run `git log -p -- <test_file>` and check whether the cap has only ever increased. A frozen cap with zero history, or one that has decreased, is not a sink — only a monotonic increase is.

**Does the same actor add the debt and bump the cap?** If commit history shows cap bumps landing in the same commit/PR that adds the suppression (typical of an agent unblocking its own push), the ratchet has no downward force — confirm by correlating cap-bump commits with Exclude-addition commits.

If verification shows the finding is wrong (the entry is a glob, the baseline is gated, the cap has not drifted), discard it. Record overturned findings in project-scoped memory so future reviews do not re-flag them.

### Finding Triage

| Disposition | When | Action |
|---|---|---|
| Fix now | Single-file debt in main config; baseline ungated; ratchet drifting | Report with the canonical fix |
| Track | Large pre-existing ledger that cannot move in this PR | Report with a TODO/issue to migrate the pool |
| Defer to sibling lens | General dead code, dependency freshness, complexity | Name the lens (`debt-multipass`, `dependency-multipass`, `complexity-multipass`) |

# Debt Inventory Review

Review tooling-suppression surfaces that hide debt by silencing violations without a shrink path.

## Scope

- Linter/formatter/type-checker main config: `.rubocop.yml`, `.eslintrc*`, `biome.json`, `.stylelintrc`, `.sorbet.yml`, `pyproject.toml [tool.ruff|mypy]`, `tsconfig`, `golangci-lint`, `buf`, `.gitleaks`.
- Regenerating baselines: `.rubocop_todo.yml`, `*_todo.yml`, `sorbet_untyped_baseline.json`, RBI `sorbet/rbi/`, eslint `baseline.json`, ruff `.ruff-baseline`, ignore-lists.
- Count/ratchet tests: any test whose name or body asserts a numeric cap on suppression entries (`ratchet`, `count`, `freeze`, `cap`, `MAX`).
- Inline disables: `# rubocop:disable`, `eslint-disable`, `@ts-ignore`/`@ts-expect-error`, `# type: ignore`, `# noqa`, `// nolint`.

## The invariant

A suppression surface is healthy when it satisfies all three:

1. **Location.** Legacy-offense suppressions (specific files currently violating) live in the *regenerating baseline* (`.rubocop_todo.yml` and equivalents). The main config holds only structural scoping (globs/directories) and permanent policy.
2. **Freshness.** Every baseline file has a regeneration gate — a hook or CI step that rewrites it from live offenses — so fixed offenses drop out automatically. A baseline without a gate is a hand-maintained ledger.
3. **Shape.** Any test that freezes debt asserts a *non-numeric invariant* where possible ("main config contains no single-file `Exclude:`"), or, if numeric, enforces a monotonic countdown that the same change cannot both add debt and bump.

A surface failing any clause is a finding.

## Workflow

1. Identify every suppression surface in scope (config + baseline + count tests + inline disables).
2. For each, classify entries as **debt** (specific instances) vs **structural policy** (globs). Count both.
3. Locate the regenerating baseline sibling for each main config. If none exists, the main config is the de-facto baseline — flag it.
4. For each baseline, confirm a freshness/regeneration gate. If absent, flag.
5. For each numeric ratchet test, check `git log -p` for the cap's history. Monotonic increase = sink.
6. Correlate: if debt-add commits and cap-bump commits coincide (same actor shipping both), the ratchet has no downward force.
7. Recommend the canonical fix per surface, not a one-off entry removal.

## Guardrails

- Do not flag glob/directory `Exclude:` entries as debt — that is sanctioned structural scoping. Verify an entry is a literal path before flagging.
- Do not flag a baseline as stale without confirming no regeneration gate exists.
- Do not recommend deleting a suppression without naming where the debt should move (the regenerating baseline) or how the underlying code should be fixed.
- Do not duplicate `debt-multipass` (general tech debt), `dependency-multipass` (version freshness), or `complexity-multipass` (over-abstraction). This lens is only about *where suppression lives and whether it shrinks*.
- A frozen ratchet is defensible only if its history shows no upward drift and the cap is not bumpable by the actor adding debt. Proven upward drift overrides any "it's just frozen" claim.

## Useful Checks

```bash
# Count Exclude entries per cop in a RuboCop config
ruby -ryaml -e 'YAML.load_file(".rubocop.yml").each{|k,v| n=v["Exclude"]&.size; puts "#{k}: #{n}" if n}'

# Debt vs structural split — literal paths (no glob metachars) are debt
grep -E "Exclude:" -A100 .rubocop.yml | grep -E "^\s+- \S+$" | grep -vE '[*\?\[\{]'

# Does a regenerating baseline exist alongside the main config?
ls .rubocop_todo.yml sorbet_untyped_baseline.json rbi/ .ruff-baseline 2>/dev/null

# Is there a freshness gate? (hook or CI)
grep -rn "regenerate-todo\|auto-gen-config\|update-baseline\|tapioca\|todo-freshness" .claude/settings.json lefthook.yml .github/workflows scripts 2>/dev/null

# Has a ratchet cap only ever grown?
git log -p -- test/lint/*ratchet* | grep -E '^\+.*CAP|^\+.*=>\s*[0-9]'

# Inline disables lacking a tracking TODO
rg -n "# rubocop:disable|eslint-disable|@ts-ignore|type: ignore|noqa" | rg -v 'TODO|RATIONALE|issue'
```

## Example Findings

**[high] .rubocop.yml:21-40** — 1,100 single-file `Exclude:` paths across 19 cops while a freshness-gated `.rubocop_todo.yml` exists
- **What:** `PER_COP_CAPS` in `test/lint/rubocop_exclude_ratchet_test.rb` freezes 1,154 hand-maintained entries in the main config. A separate `.rubocop_todo.yml` (1,911 entries) already auto-regenerates under a PreToolUse hook + CI freshness gate. ~95% of the main-config entries are literal paths (debt), ~5% are globs (structural).
- **Why it matters:** The main-config pool reinvents `.rubocop_todo.yml` without its defining property — regeneration. Its cap drifted 1,135 → 1,154 as agents bumped `TOTAL_EXCLUDE_CAP` to unblock their own pushes, so the "forced countdown" has negative force. This is the exact failure auto-regeneration exists to prevent.
- **Fix:** Migrate the single-file debt entries into `.rubocop_todo.yml` (keep globs in `.rubocop.yml` via `inherit_mode: merge`). Replace `PER_COP_CAPS` with a non-numeric shape gate asserting "no literal-path `Exclude:` entries in `.rubocop.yml`." Use `--no-exclude-limit` on regen so large cops list files rather than disabling.

**[medium] config/sorbet_untyped_baseline.json:1** — 6,492-entry baseline with no regeneration gate
- **What:** The Sorbet untyped-usage baseline has no hook or CI step running `bin/sorbetti`/`tapioca` to rewrite it from current errors.
- **Why it matters:** Without regeneration, fixed errors never drop out and the baseline only grows — the Sorbet twin of a hand-maintained `Exclude:` ledger.
- **Fix:** Add a CI freshness step that regenerates the baseline and fails on diff, mirroring the `rubocop-todo-freshness` gate.

**[low] app/services/foo.rb:42** — `# rubocop:disable Metrics/AbcSize` with no tracking TODO
- **What:** Inline disable lacks a TODO/issue referencing the cleanup.
- **Why it matters:** Untracked disables are invisible to inventory and never get removed.
- **Fix:** Add `# TODO(<issue>): refactor to drop the disable` or move the suppression into the regenerating baseline.

## Output Template

- Scope:
- Suppression surfaces found (config / baseline / ratchet tests / inline disables):
- Debt vs structural-policy split per surface:
- Surfaces failing the invariant (location / freshness / shape):
- Ratchet drift evidence (cap history):
- Confirmed findings:
- Lenses not fully reviewed:
