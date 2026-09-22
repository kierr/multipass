---
name: multipass-configure
description: Configure the multipass plugin for the current project — review lens selection, exclusions, and concurrency settings.
when_to_use: When setting up multipass for a new project, adjusting review lens configuration, or the user mentions multipass config or settings.
---

# Multipass Configure

Create or update per-project settings for the multipass plugin.

## Settings File

Per-project settings live at `.claude/multipass.local.md` (not committed to git).

## Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `default_include` | list | `[]` | Lenses to always include regardless of context. Use agent names (e.g., `security-multipass`, `ci-multipass`). |
| `always_exclude` | list | `[]` | Lenses to never include, even if contextually relevant. |
| `concurrency_limit` | int | `10` | Max agents to spawn in parallel. Lower for resource-constrained machines. |
| `model_overrides` | map | `{}` | Per-lens model pin; values must be an **opus-class** model (`opus` or a full opus model ID). Sonnet/haiku are invalid — multipass agents never run on weaker models (review is judgment work; weaker models silently miss findings). |
| `severity_threshold` | string | `low` | Minimum severity to report. One of: `critical`, `high`, `medium`, `low`. |
| `default_scope` | string | `working-tree` | Default review scope. One of: `working-tree`, `branch-diff`, `last-N-commits`, `full-repo`. |

## Config Override

When `.claude/multipass.local.md` exists and sets `default_scope`, review skills should respect that mode instead of the branch-aware scope hierarchy. Supported values: `working-tree`, `branch-diff`, `last-N-commits`, `full-repo`.

## Steps

1. Check if `.claude/multipass.local.md` already exists. If so, read it and merge changes rather than overwriting.
2. Ask the user which settings they want to configure (or apply defaults).
3. Write the settings file:

```markdown
---
default_include: []
always_exclude: []
concurrency_limit: 10
model_overrides: {}
severity_threshold: low
default_scope: working-tree
---

# Multipass Project Settings

(Any additional review instructions for this project go here.)
```

4. Remind the user that settings take effect on next session restart.

## Example: Ruby on Rails project

```markdown
---
default_include:
  - security-multipass
  - ruby-multipass
  - test-multipass
always_exclude:
  - gitops-multipass
  - dockerfile-multipass
concurrency_limit: 5
model_overrides:
  security-multipass: opus
severity_threshold: medium
default_scope: branch-diff
---

# Multipass Project Settings

Focus on Rails-specific patterns. Skip infrastructure lenses.
```

## Example: Infrastructure repo

```markdown
---
default_include:
  - ci-multipass
  - dockerfile-multipass
  - security-multipass
  - gitops-multipass
always_exclude:
  - ruby-multipass
  - frontend-multipass
concurrency_limit: 3
model_overrides:
  gitops-multipass: opus
severity_threshold: low
default_scope: working-tree
---

# Multipass Project Settings

Infrastructure-only review. Exclude application language lenses.
```
