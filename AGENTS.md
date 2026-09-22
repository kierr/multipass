# Multipass — Agent Instructions

`AGENTS.md` is canonical; `CLAUDE.md` is a symlink alias.

## Repository Role

Multipass is a Claude Code plugin providing concurrent multi-lens code review. It publishes to the Claude Code marketplace via `.claude-plugin/`.

## Release Process

**The marketplace does not pick up changes without a version bump in `.claude-plugin/plugin.json`.** Every merge that should be reflected in the marketplace must include a version bump in that file.

### Versioning

- Version lives in `.claude-plugin/plugin.json` → `version` field.
- Use semver: bump patch for fixes, minor for new lenses or significant skill changes.
- Include the version bump in the same commit/PR as the changes, or as a dedicated PR immediately after.

### Checklist for changes that need a version bump

- New or modified agent definitions (`agents/`)
- New or modified skill content (`skills/`)
- Changes to the orchestrator (`skills/run/`)
- Changes to `.claude-plugin/marketplace.json` or `plugin.json`
- Any user-facing behavior change

### What does NOT need a bump

- CI/workflow changes (`.github/`)
- `renovate.json` updates
- Changes to this `AGENTS.md` or `README.md` with no functional impact

## Structure

```
.claude-plugin/       # Marketplace manifest + plugin metadata
agents/               # Agent definitions (one per lens)
skills/               # Skills (one dir per concern)
  run/                # Parallel orchestrator
  new-multipass-lens/ # Scaffold new lenses
  multipass-configure/# Per-project settings
  <name>-multipass/   # Domain skills with SKILL.md + references/
```

## Conventions

- Agent and skill names use the `*-multipass` suffix.
- Each lens is a skill+agent pair sharing the same name.
- Skills are review-only: they read files and write a structured report; they do not edit source code.
- The `run` skill is the parallel orchestrator — it discovers lenses, spawns agents, and synthesizes one report.
