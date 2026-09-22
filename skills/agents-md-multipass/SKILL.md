---
name: agents-md-multipass
multipass_desc: "Audit and improve AGENTS.md/CLAUDE.md instruction files. Check, fix, and capture post-session learnings into agent instructions."
description: "-"
when_to_use: "When reviewing AGENTS.md or CLAUDE.md instruction files, agent instructions, or when the user mentions agent configuration or instruction quality."
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

# AGENTS.md / CLAUDE.md Review

Audit instruction files for durable, non-derivable guidance.

## Scope

- Review `AGENTS.md`, `CLAUDE.md`, and closely related instruction files for drift-prone, stale, derivable, or bloated content.
- Verify canonical naming and symlink hygiene: `AGENTS.md` should be canonical and `CLAUDE.md` should be a symlink alias when both exist.
- Use this for post-session learnings only when the new guidance is likely to remain true and is not easily derivable from the repo.

Instruction files should say what the agent cannot safely infer from the code or filesystem. Every line should survive two tests: durability/derivability — "Will this still be true next week, and can the agent not derive it from the repo?" — and causality — "Would removing this cause the agent to make mistakes? If not, cut it." Lines failing the causal test are volume cost even when their content is true.

## References

- [references/anti-patterns.md](references/anti-patterns.md)

## Workflow

1. Discover instruction files in scope and verify whether `CLAUDE.md` is a symlink to `AGENTS.md`.
2. Audit content for four classes of problems:
   - drift-prone facts such as counts, inventories, and version-like trivia
   - stale references to files, tools, or workflows that no longer exist
   - derivable content the agent can learn by reading code, config, or the tree
   - bloated runbooks or status tracking that should not live in instruction files
3. Propose the smallest rewrite that preserves durable constraints and removes ephemeral noise.
4. For post-session learnings, add only rules or gotchas that would have materially helped and are likely to remain true.

## Guardrails

- Remove directory trees, plugin inventories, keybinding tables, counts, and resolved-status sections instead of preserving them, because these are drift-prone facts the agent can derive from the filesystem.
- Write durable constraints and gotchas instead of generic engineering advice, because obvious guidance wastes context budget without helping.
- Replace verbose runbooks with a script path or one-line pointer, because runbooks in instruction files drift faster than executable scripts.
- Keep `AGENTS.md` as the single canonical file with `CLAUDE.md` as a symlink alias, because divergent sources of truth cause contradictory agent behavior.
- Preserve rationale when trimming: cut structure, restatement, and derivable facts, never the why — rationale is the highest value-per-token content in an instruction file and prevents future re-litigation.
- Context-economy findings — measured always-loaded volume vs doctrine anchors, instruction density, load-condition placement, prose constraints that belong in hooks, or duplication across loaded surfaces (memory, skills, other client files) — are `context-debt-multipass`'s domain; report them here with that lens named in triage rather than expanding this lens's scope.

### Example Findings

**[high] AGENTS.md and CLAUDE.md have diverged — CLAUDE.md is a regular file with 23 lines not present in AGENTS.md**
- **What:** `CLAUDE.md` was supposed to be a symlink to `AGENTS.md` but is a regular file. It contains 23 lines of project-specific content that AGENTS.md doesn't have, and is missing 15 lines that AGENTS.md has.
- **Why it matters:** Agents using Claude Code read `CLAUDE.md` and get different instructions than agents using Codex/Opencode which read `AGENTS.md`. The two instruction sets contradict each other on merge strategy and CI runner tiers.
- **Fix:** Merge the divergent content into `AGENTS.md`, then replace `CLAUDE.md` with a symlink: `ln -sf AGENTS.md CLAUDE.md`.

**[medium] agents/review.md:4** — `skills:` references `prompt-multipass` which doesn't exist (renamed to `prompt-engineering-multipass`)
- **What:** The agent definition lists `skills: [prompt-multipass]` in its frontmatter. The skill was renamed two months ago but the agent reference was never updated.
- **Why it matters:** The agent preloads nothing — the skill content is silently missing. The agent runs with only its thin wrapper body and no domain expertise, producing shallow reviews.
- **Fix:** Update to `skills: [prompt-engineering-multipass]`.

## Output Template

- Files reviewed:
- Canonical or symlink issues:
- Drift-prone or stale content:
- Derivable or bloated sections to remove:
- Minimal replacements to add:
- Verdict:
