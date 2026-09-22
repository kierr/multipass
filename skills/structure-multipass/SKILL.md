---
name: structure-multipass
multipass_desc: "Review repository layout quality — file/directory organization, ownership boundaries, module placement, root clutter, and mixed production/test artifacts."
description: "-"
when_to_use: "When reviewing repository layout, file organization, module structure, or when the user mentions repo structure, organization, or layout."
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

# Structure Review

Review whether the repository shape makes work easier or harder.

## Scope

- Review top-level layout, source roots, package roots, tests, scripts, config, docs, generated output, and build artifacts.
- Identify the dominant structure pattern in use: by feature, by layer, by package, by service, monorepo workspace, or ad hoc growth.
- Keep the review language-agnostic. Judge fit for the repo, not conformity to one ecosystem's ideal template.
- Use this when the user asks for repo hygiene, cleanup audit, or slop review and the main concern is placement, clutter, or repository shape.

## Workflow

1. Map the top-level shape and separate durable structure from probable clutter.
2. Check ownership and placement: files should live where a contributor would expect.
3. Check boundary clarity and whether related code is scattered across unrelated folders.
4. Check cohesion and coupling: do folders group code that changes together.
5. Call out misplaced debug, test, or one-off analysis artifacts when they create structural confusion.
6. Recommend the smallest structural fix that improves clarity.

## Common Risks

- Too many source files in the repository root
- Too many root-level `.md` files beyond the small durable set such as `README`, `CHANGELOG`, and agent instructions
- Mixed production, test, debug, and experimental artifacts in the same folder
- One-off analysis scripts or exploratory files left in root or source trees
- Multiple parallel trees that represent the same concern
- Deep nesting that adds path length without adding ownership clarity
- Shared `utils`, `helpers`, or `common` directories acting as junk drawers
- Generated output committed next to hand-maintained source without clear separation
- Ambiguous folder names that describe implementation history instead of purpose

## Guardrails

- Accept deviations from framework conventions when they serve the repo's actual needs, because not every project fits a template.
- Recommend targeted moves instead of rewrites when the structure is imperfect, because incremental fixes are lower risk.
- Justify new directory splits by reduced confusion and coupling instead of structural purity alone.
- Accept a small set of durable, clearly scoped root markdown files instead of flagging all root-level `.md` as clutter.
- Distinguish between temporary mess from an active migration and long-term structural drift.
- **Parallel trees are not automatically duplicates.** When two directories share module names or structure, determine which is canonical before recommending any action: check which is imported by other code, CI, configs, and tests; check `git log` for when each was added and why; check which has more recent commits or unique features. Parallel trees with shared names but divergent functionality are intentional variants — the one with more features, more recent development, or explicit external references is likely the production variant. Never recommend deleting a parallel directory tree as an automated fix; report it as a finding with evidence of which variant appears canonical and let the user decide.

## Useful Checks

```bash
find . -maxdepth 2 -type d | sort
find . -maxdepth 1 -type f | sort
find . -maxdepth 1 -type f -name '*.md' | sort
rg --files | sed 's|/[^/]*$||' | sort | uniq -c | sort -nr | head -30
```

Use repo-native build, test, or import graph tools when layout decisions affect build boundaries or ownership.

### Example Findings

**[high] lib/core/ and lib/engine/ — duplicate domain logic split across two parallel directories with no ownership boundary**
- **What:** `lib/core/order_builder.rb` and `lib/engine/order_builder.rb` both implement order construction. `core` is imported by 3 callers, `engine` by 5. Neither re-exports the other.
- **Why it matters:** Bug fixes applied to one copy miss the other. The team doesn't know which is canonical. New features get added to whichever copy the developer finds first, widening the divergence.
- **Fix:** Determine which is canonical (git history, caller count, test coverage). Consolidate into one location and add a re-export from the other if needed for backward compatibility.

**[medium] repo root contains 12 orphan markdown files unrelated to the project purpose**
- **What:** The root has `DESIGN.md`, `NOTES.md`, `scratch.md`, `TODO.md`, and 8 other prose files that are not referenced from README, CLAUDE.md, or any CI workflow.
- **Why it matters:** Root sprawl obscures the project's actual entry points. New contributors read stale design docs that contradict the current architecture. Orphan files accumulate without ownership.
- **Fix:** Move actionable content into `docs/` or relevant source files. Delete truly obsolete notes. Keep only README and project-root config files at the root.

## Output Template

- Structure pattern:
- Confirmed structural risks:
- Minor smells:
- Root clutter:
- Root markdown sprawl:
- Recommended moves:
- Recommended conventions to adopt:
- Changes not worth making:
