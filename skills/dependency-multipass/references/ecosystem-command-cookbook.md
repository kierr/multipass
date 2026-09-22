# Dependency Audit Command Cookbook

## Detect Ecosystems

```bash
ls Gemfile Gemfile.lock package.json bun.lock yarn.lock pnpm-lock.yaml pyproject.toml requirements.txt go.mod go.sum Cargo.toml Cargo.lock 2>/dev/null
```

## Parse Direct Dependencies

- Ruby: read `Gemfile`, then cross-reference `Gemfile.lock`
- Node: inspect `dependencies` and `devDependencies`, then `bun outdated`
- Python: inspect `pyproject.toml` or `requirements.txt`, then `uv pip list`
- Go: inspect `go.mod`, then `go list -m -u all`
- Rust: inspect `Cargo.toml`, then `cargo outdated`

## Health Signals

### Version Freshness

```bash
# Ruby
gem search ^GEM_NAME$ --remote --versions 2>/dev/null | head -1

# Node
bun outdated 2>/dev/null

# Python
uv pip index versions PACKAGE 2>/dev/null

# Go
go list -m -u MODULE 2>/dev/null
```

### Repository Health

```bash
gem info GEM_NAME 2>/dev/null | grep -E "(Homepage|Source)"

gh api repos/OWNER/REPO --jq '{
  stars: .stargazers_count,
  open_issues: .open_issues_count,
  pushed_at: .pushed_at,
  archived: .archived,
  fork: .fork
}'

gh api repos/OWNER/REPO/releases/latest --jq '.published_at' 2>/dev/null
gh api repos/OWNER/REPO/commits --jq '.[0].commit.committer.date' 2>/dev/null
```

### Main vs Latest Release

```bash
gh api repos/OWNER/REPO/compare/LATEST_TAG...HEAD --jq '.ahead_by' 2>/dev/null
```

### Successor Search

```text
web_search: "GEMNAME ruby alternative 2025 2026" OR "GEMNAME replacement successor"
```

Look for:

- Official deprecation notices
- README banners that point to a replacement
- Community consensus around successors
- Whether the library’s problem space has a newer standard option

### Active Forks

```bash
gh api repos/OWNER/REPO/forks --jq '[.[] | select(.pushed_at > "CUTOFF_DATE")] | sort_by(.stargazers_count) | reverse | .[0:3] | .[] | {full_name, stars: .stargazers_count, pushed_at}'
```

## Migration Difficulty Checks

```bash
rg "require.*DEP_NAME" --type ruby -c 2>/dev/null
rg "DEP_MODULE::" --type ruby -l 2>/dev/null
```

Use ecosystem-specific equivalents when the project is not Ruby.

## Ecosystem Patterns

### Ruby

- Check `github:` pins in `Gemfile`
- `bundle outdated`
- `bundle audit`

### Node / Bun

- `bun outdated`
- `bunx npm-check-updates`
- Check bundle size impact and ESM/CJS compatibility

### Python

- `uv pip list --outdated`
- `pip-audit`
- Check classifier and Python-version compatibility

### Go

- `go list -m -u all`
- `govulncheck ./...`

### Rust

- `cargo outdated`
- `cargo audit`
