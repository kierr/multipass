# Contributing to Multipass

## Development

Multipass is a Claude Code plugin providing concurrent multi-lens code review. It publishes to the Claude Code marketplace via `.claude-plugin/`.

### Structure

- `agents/` — Agent definitions (one per lens)
- `skills/` — Skills (one directory per concern)
- `.claude-plugin/` — Marketplace manifest and plugin metadata

### Adding a New Lens

Use the `/new-multipass-lens` skill to scaffold a new skill + agent pair. Each lens:

- Has a matching skill and agent sharing the same `*-multipass` name
- Is review-only: reads files and writes a structured report; never edits source code
- Follows the review contract defined in `skills/security-multipass/SKILL.md`

### Version Bumps

The marketplace does not pick up changes without a version bump in `.claude-plugin/plugin.json`. Every user-facing change needs a version bump in the same commit or a dedicated PR immediately after.

### Pull Requests

- Keep PRs focused on a single concern
- Run the CI checks locally before pushing
- Update the version in `plugin.json` if your change affects user-facing behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
