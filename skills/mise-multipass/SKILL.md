---
name: mise-multipass
multipass_desc: "Review mise.toml configuration for correctness, task hygiene, tool pinning, source/output tracking, environment handling, and adherence to mise best practices."
description: "-"
when_to_use: "When reviewing mise configuration, tool versions, task definitions, or when the user mentions mise, tool versions, or task runner."
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

1. **Branch diff.** If on a non-default branch (not main/master), diff against the merge base: `git diff $(git merge-base HEAD origin/main)...HEAD`. This captures the full changeset.
2. **Working tree.** `git diff HEAD` plus untracked files (`git ls-files --others --exclude-standard`). If non-empty, use these changes.
3. **Recent commits.** If on the default branch with a clean working tree, review the last 5 commits (`git log --oneline -5`).

**Scope overrides:**
- "review the PR" / "pr review" → `gh pr view` to get the PR, then `git diff <base>...HEAD`
- "full review" / "review everything" → all mise config files in the repo
- Named file or directory → that path only

**Always include these mise config paths when they exist:**
- `mise.toml`, `mise.local.toml`, `mise/config.toml`, `.mise/config.toml`
- `.config/mise.toml`, `.config/mise/config.toml`, `.config/mise/conf.d/*.toml`
- Environment-specific: `mise.<env>.toml` (e.g., `mise.development.toml`, `mise.ci.toml`)
- File tasks: `mise-tasks/` or `tasks/` directory, `mise/tasks/` directory
- `.tool-versions` (asdf compatibility)

**Argument interpretation:** `$ARGUMENTS` may contain a natural language description of what to review. If arguments contain paths, narrow your search accordingly. If they describe a focus area, prioritize that surface. If arguments are empty or absent, use the default scope above.

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
| `critical` | Configuration that will break `mise` or cause incorrect tool versions in production | `latest` for production tooling, missing tool version causing CI failure |
| `high` | Task or tool configuration that will silently produce wrong results or has security implications | Unpinned tool in CI, task without sources that should have them |
| `medium` | Configuration that works but is fragile, inefficient, or against best practice | Missing description on user-facing task, redundant env vars |
| `low` | Minor improvement — style, organization, clarity | Missing alias, inconsistent ordering |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Correctness verification:** Trace the full execution path of the task or tool resolution. For tasks with `depends`, verify the dependency graph is acyclic and complete. For tool versions, verify the version string is valid and resolvable. For `sources`/`outputs`, verify the glob patterns match real files.

**Best-practice verification:** Verify the finding is a genuine mise best-practice violation, not a style preference. Check against the mise documentation (not just general convention). If the mise docs show a pattern as valid, do not flag it as a finding. If you cannot verify against docs, flag as `[unverified]`.

**Config hierarchy verification:** Understand which config file has precedence. A finding in `mise.local.toml` that contradicts `mise.toml` may be intentional (local override). Verify before reporting as a conflict.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Mise Configuration Review

Review `mise.toml` and related config files for correctness, completeness, and adherence to mise best practices. Mise (mise-en-place) is a polyglot tool version manager, environment variable switcher, and task runner. Misconfiguration causes subtle failures: wrong tool versions in CI, tasks that always re-run (or never run), environment variables leaking across contexts.

## Scope

- Identify all mise config files in the repo (`mise.toml`, `mise.local.toml`, `mise/config.toml`, `.config/mise.toml`, `.config/mise/config.toml`, `.config/mise/conf.d/*.toml`, environment-specific `mise.<env>.toml`).
- Identify file tasks in `mise-tasks/`, `tasks/`, or `mise/tasks/` directories.
- Check for idiomatic version files (`.nvmrc`, `.python-version`, `.tool-versions`) that mise may read.
- Identify task scripts referenced by `file = "..."` directives.
- Identify shell scripts in the repo that duplicate what mise tasks should handle (potential drift between Makefile/Justfile and mise tasks).

## Workflow

1. Map the config hierarchy — which files exist, what each contains, and how they layer.
2. Review `[tools]` — version pinning, backend options, missing tools, stale versions.
3. Review `[env]` — scope, overrides, secrets, template correctness.
4. Review `[tasks]` — descriptions, dependencies, sources/outputs, shell usage, file references.
5. Review `[settings]` — project-level overrides that may conflict with global config.
6. Cross-reference with actual repo tooling — do the pinned tools match what the project actually uses?
7. Validate task dependency graph — cycles, missing deps, ordering.
8. Check for duplication between mise tasks and other task runners (Makefile, Justfile, package.json scripts).

## Review Surfaces

### Tools Section (`[tools]`)

- **Version pinning:** Every tool should have an explicit version. `latest` is acceptable for dev-only tools but dangerous for CI or production tooling. Unpinned versions cause non-reproducible builds.
- **Backend options:** Tools with backend-specific config (e.g., `{ version = "3.12", virtualenv = ".venv" }`) — verify the options are valid for that tool's backend.
- **Missing tools:** If the project uses a tool (evidence: lockfiles, config files, imports) but it's not in `[tools]`, it's relying on the system version — a reproducibility gap.
- **Stale versions:** Versions that are EOL or have known CVEs. Cross-reference with the tool's release policy.
- **Duplicate specification:** A tool in both `[tools]` and an idiomatic version file (`.nvmrc`, `.python-version`). mise reads both; the idiomatic file may override or conflict.

### Environment Section (`[env]`)

- **Secrets in config:** API keys, tokens, passwords in committed `mise.toml`. These should use `mise.local.toml` (gitignored) or `.env` file referenced via `env_file` setting.
- **Template correctness:** Templates like `{{ cwd | basename }}`, `{{ get_env(name='VAR', default='x') }}` — verify tera template syntax is correct and the referenced variables exist or have sensible defaults.
- **Scope clarity:** `_` prefix convention for private env vars (mise-specific). `_.FILE` for env files. Verify env vars that should be task-scoped (in `[tasks.<name>.env]`) aren't leaking into global `[env]`.
- **Redundant declarations:** Same env var defined in both `mise.toml` and `.env` file, or in both global `[env]` and task-level `env`.

### Tasks Section (`[tasks]`)

- **Missing descriptions:** Every non-hidden task should have a `description`. Hidden tasks (`hide = true`) are exempt. Without descriptions, `mise tasks` output is uninformative.
- **Missing `sources`/`outputs`:** Tasks that build or generate files should declare `sources` and `outputs` to enable mise's caching. Without them, the task runs every time even if nothing changed.
- **Incorrect `sources`/`outputs` globs:** Globs that don't match real files (typo, wrong path), or globs that are too broad (matching generated files, node_modules, etc.).
- **Dependency graph issues:**
  - Circular dependencies (`A depends on B depends on A`)
  - Missing dependencies (task assumes a prior step ran but doesn't declare it)
  - `depends` vs `deps` — both are valid (`depends` is the canonical field, `deps` is the alias). Mixing both in one file is confusing.
- **Shell usage:** Multi-line `run` blocks should specify a shebang (`#!/usr/bin/env bash`) when using bash-isms. Without it, mise uses the default shell which may be `sh` (no arrays, no `[[ ]]`, no process substitution).
- **`file = "..."` references:** Verify the referenced script exists and is executable. Check that `#MISE` comments in the script are consistent with the `mise.toml` task definition (if both exist).
- **`dir` usage:** `dir = "{{cwd}}"` runs in the user's cwd instead of project root. Verify this is intentional — it changes relative path resolution.
- **`confirm` usage:** Destructive tasks (deploy, release, drop-db) should have `confirm = "..."`.
- **`run` as array vs string:** Array form runs commands in series. Verify ordering and that no command depends on a side effect from a previous command that isn't guaranteed.
- **Unused tasks:** Tasks defined but never referenced in `depends` chains or documented workflows. May be dead code or may be user-facing convenience tasks that need descriptions.

### Settings Section (`[settings]`)

- **Project-level overrides:** `idiomatic_version_file_enable_tools`, `env_file`, `trusted_config_paths` set at project level may conflict with developer global config or CI config. Flag unexpected overrides.
- **`env_file` path:** Verify the referenced `.env` file exists and is gitignored (if it contains secrets).
- **`trusted_config_paths`** at project level — unusual, probably should be in global config only.

### Config File Hygiene

- **`mise.local.toml` in git:** This file is for local overrides and should be gitignored. If committed, it forces local config on all developers.
- **Environment-specific files:** `mise.ci.toml`, `mise.production.toml` — verify they layer correctly on top of the base `mise.toml` and don't duplicate settings that should be in the base.
- **`.tool-versions` coexistence:** If both `mise.toml` and `.tool-versions` exist, verify they agree on tool versions. mise reads both; discrepancies cause confusion.
- **`min_version` directive:** If present, verify the mise version constraint is reasonable (not too restrictive, not too loose).

### Cross-Reference: Mise vs Other Task Runners

- **Makefile / Justfile coexistence:** If the repo has both `mise.toml` tasks and a Makefile/Justfile, check for duplicated task definitions. Tasks should live in one place to avoid drift.
- **package.json scripts:** `"scripts"` entries that duplicate mise tasks. mise can call `npm run` but the task entry point should be in one place.
- **CI workflow references:** GitHub Actions that call `mise run <task>` — verify the task name exists and the CI environment has the right tools installed.

## Common Mise Configuration Risks

- **`latest` in CI:** `go = "latest"` in a `mise.ci.toml` means CI behavior changes whenever the tool releases a new version. Pin to a specific version for reproducibility.
- **Missing `sources` on build tasks:** Without `sources`/`outputs`, `mise run build` rebuilds every time. Developers learn to skip it, and real build failures go unnoticed.
- **Shebang-less multi-line scripts:** `run = '''cargo test\ncargo clippy'''` works in bash but may fail in `sh` (default on some systems). Always add `#!/usr/bin/env bash`.
- **Secret in committed config:** `DATABASE_URL = "postgresql://user:pass@host/db"` in `mise.toml` is committed to git. Use `mise.local.toml` or env_file.
- **Overlapping config files:** `mise.toml` sets `NODE_ENV = "development"`, `mise.ci.toml` sets `NODE_ENV = "test"`, but the CI environment variable is set in the workflow too. Triple override is fragile.
- **Stale tool version after upgrade:** Project uses Ruby 3.4 but `mise.toml` still says `ruby = "3.3"`. mise installs 3.3, the project fails at runtime.

## Guardrails

- Evaluate configuration against the project's actual mise setup, not an idealized maximum. A simple project with 3 tasks and 2 tools doesn't need `sources`/`outputs` on every task.
- Require a concrete failure path before labeling a config issue as high or critical. "This could be more precise" is low. "This unpinned version will break CI when the next major release drops" is high.
- Distinguish between intentional `mise.local.toml` overrides (the developer knows their local setup differs) and accidental config drift. The former is expected; the latter is a bug.
- Do not flag idiomatic version files (`.nvmrc`, `.python-version`) as redundant if they serve other tools besides mise. mise reads them as inputs, not competitors.
- Recognize that `hide = true` tasks are intentionally internal. Do not flag them for missing descriptions unless they're referenced in `depends` chains where documentation would help maintainers.
- Separate style preferences (alphabetical ordering, naming conventions) from correctness issues. Only report style as low severity.

## Useful Checks

```bash
# Find all mise config files
find . -name 'mise*.toml' -o -name '.tool-versions' -o -path '*/mise/config.toml' -o -path '*/.config/mise*' 2>/dev/null

# Check for secrets in committed mise config
rg -n '(?:password|secret|token|api_key|apikey|private_key)\s*=' mise.toml mise.local.toml 2>/dev/null

# Check for unpinned versions
rg -n '= "latest"' mise.toml 2>/dev/null
rg -n '= ""' mise.toml 2>/dev/null

# Check for tasks without descriptions (non-hidden)
mise tasks 2>/dev/null | grep -v '…$' || true

# Check mise.local.toml is gitignored
grep -q 'mise.local.toml' .gitignore 2>/dev/null || echo "WARNING: mise.local.toml not in .gitignore"

# Verify referenced scripts exist
grep -oP 'file\s*=\s*["\x27]([^"\x27]+)' mise.toml 2>/dev/null | while read -r f; do
  script=$(echo "$f" | sed 's/file\s*=\s*["\x27]//;s/["\x27]$//')
  [ -f "$script" ] || echo "MISSING: $script"
done

# Check for dependency cycles (requires mise installed)
mise tasks --json 2>/dev/null | python3 -c "
import json, sys
tasks = json.load(sys.stdin)
for t in tasks:
    for dep in t.get('depends', []):
        if dep in [d['name'] for d in tasks if t['name'] in d.get('depends', [])]:
            print(f'CYCLE: {t[\"name\"]} <-> {dep}')
" 2>/dev/null || true
```

### Example Findings

**[high] mise.toml:4** — Tool version set to `latest` for CI-critical tool
- **What:** `go = "latest"` — mise resolves "latest" at install time, so different CI runs may get different Go versions. A new major release could break the build with no code change.
- **Why it matters:** Non-reproducible CI. The build passes today and fails tomorrow with no changes to the codebase.
- **Fix:** Pin to a specific version: `go = "1.22.3"`. Use `mise ls` to see what's currently resolved and pin that.

**[medium] mise.toml:18** — Build task missing `sources`/`outputs` — always re-runs
- **What:** `[tasks.build]` has `run = "npm run build"` but no `sources` or `outputs`. mise cannot skip this task when nothing changed, so it rebuilds every time.
- **Why it matters:** Developers learn to skip `mise run build` because it's always slow. Real build failures go unnoticed because the task is rarely run.
- **Fix:** Add source tracking: `sources = ["src/**/*.ts", "package.json"]`, `outputs = ["dist/"]`.

**[high] mise.toml:9** — Database password in committed config
- **What:** `DATABASE_URL = "postgresql://admin:s3cret@db.example.com/prod"` in `[env]`. This file is committed to git.
- **Why it matters:** Credential exposure in version control. The password is in git history permanently even if removed later.
- **Fix:** Move to `mise.local.toml` (ensure it's in `.gitignore`) or use `env_file = ".env"` with the `.env` file gitignored.

**[low] mise.toml:25** — Internal task missing `hide = true`
- **What:** `[tasks.cleancache]` is only referenced by `[tasks.clean]` via `depends = ["cleancache"]`. It's not intended for direct user invocation but appears in `mise tasks` output.
- **Why it matters:** Clutters task listing. Developers may run it directly without understanding the full cleanup workflow.
- **Fix:** Add `hide = true` to the task definition.

**[medium] mise.toml:32** — Multi-line task script without shebang
- **What:** `run = '''for f in *.json; do jq '.' "$f" > /tmp/out; done'''` — uses bash-specific `for` loop with glob but has no shebang. On systems where `/bin/sh` is dash (Debian/Ubuntu default), this fails silently or produces wrong results.
- **Why it matters:** Task works on the developer's Mac (where `/bin/sh` is bash) but fails in CI (where `/bin/sh` is dash).
- **Fix:** Add shebang: `run = '''#!/usr/bin/env bash\nfor f in ...'''`.

## Output Template

- Config hierarchy and files reviewed:
- Tool version inventory (pinned vs unpinned, stale):
- Environment variable audit (secrets, redundancy, template errors):
- Task inventory (descriptions, sources/outputs, dependency graph):
- Cross-reference findings (mise vs Makefile/Justfile/package.json):
- Confirmed findings by severity:
- Recommended fixes:
