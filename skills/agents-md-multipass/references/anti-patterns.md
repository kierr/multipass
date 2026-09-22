# Anti-patterns in Instruction Files

Before/after examples of drift-prone content and their lean replacements.

## 1. File tree diagrams

**Bad** (will drift as files are added/removed):
```
dotfiles/
├── home/
│   ├── dot_zshrc
│   ├── dot_zsh_plugins.txt
│   ├── dot_zsh/
│   └── dot_claude/
├── scripts/
└── README.md
```

**Good** (stable — only mentions what the agent can't derive):
```
Source: `~`. Secrets in macOS login Keychain, rendered from `.tmpl` files.
```

## 2. Counts

**Bad**: "26 extras currently enabled", "16 commands", "13 plists", "9 essential plugins"

**Good**: Drop the count entirely. If the agent needs a count, it can count.

## 3. Keybinding tables

**Bad** (drifts every time a binding changes):
```
- `<leader>ac` — toggle Claude Code
- `<leader>af` — focus Claude Code
- `<leader>aX` — open Codex terminal
```

**Good** (points to SSOT):
```
claudecode.nvim owns `<leader>a*` bindings. Check plugin specs in lua/plugins/ before adding `<leader>a*` maps.
```

## 4. Verbose runbooks

**Bad** (140 lines of health check commands, resolution steps, monitoring aliases):
```
### Quick Health Check Commands
#### Primary Health Verification
cd ~/.config/nvim && nvim --headless -c "checkhealth" ...
#### Startup Notification Check
...
### Systematic Issue Resolution Process
#### 1. Plugin Specification Errors
...
```

**Good** (1 line):
```
Run `verify-neovim.sh` for automated health and startup checks.
```

## 5. Resolved status tracking

**Bad**:
```
**RESOLVED**: Notification errors on startup
**RESOLVED**: Plugin loading conflicts
**REMAINING**: Minor warnings (non-critical)
```

**Good**: Delete entirely. This is git log material, not instruction material.

## 6. Descriptions of code behavior

**Bad**:
```
- lua/config/options.lua — core options (mouse enabled here via `vim.opt.mouse = "a"`)
- lua/config/keymaps.lua — keymaps and AI-related helpers
- lua/config/ai-statusline.lua — AI status display in statusline
```

**Good**: Only mention if there's a gotcha:
```
- `lua/plugins/` — one concern per file, LazyVim spec conventions
```

## 7. Rationale sections

**Bad**:
```
Why this shape:
- AGENTS.md is the canonical repo instruction file; CLAUDE.md is only a symlink alias
- README.md stays intentionally thin because it exists to orient the GitHub repo page
- Shared skills in ~/.agents/skills are the behavior source of truth
- This keeps behavior changes centralized
```

**Good**: Only keep if it prevents a recurring mistake:
```
AGENTS.md is canonical; CLAUDE.md is always a symlink alias.
```

## The test

For every line in an instruction file, ask:
1. Will this still be true next week?
2. Can the agent figure this out by reading the code?

If either answer is "no" or "yes" respectively — delete the line.
