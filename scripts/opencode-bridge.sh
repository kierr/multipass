#!/usr/bin/env bash
# Bridge kierr/multipass Claude Code skills into OpenCode.
#
# OpenCode discovers skills at:
#   ~/.config/opencode/skills/<name>/SKILL.md
#   ~/.claude/skills/<name>/SKILL.md
#   ~/.agents/skills/<name>/SKILL.md
#
# But multipass frontmatter stores the human description in
# `multipass_desc` (with `description: "-"` as a placeholder), while
# OpenCode reads only `description`. This script reads each
# skills/<name>/SKILL.md, promotes `multipass_desc` into `description`,
# syncs auxiliary files (references/, scripts/), and writes the result
# to a destination directory.
#
# Re-run after every `git pull` of multipass to refresh the bridge.
#
# Usage:
#   scripts/opencode-bridge.sh                 # default dst: ~/.config/opencode/skills
#   scripts/opencode-bridge.sh -o /path/to/dir
#   scripts/opencode-bridge.sh -n              # dry run
#   scripts/opencode-bridge.sh -h              # help

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/skills"
DST="${HOME}/.config/opencode/skills"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: scripts/opencode-bridge.sh [options]

Options:
  -o DIR   Destination directory (default: ~/.config/opencode/skills)
  -n       Dry run (list skills that would be bridged)
  -h       Show this help

Bridges skills/*/SKILL.md from this repo into an OpenCode-compatible
layout, promoting `multipass_desc` into `description` and syncing
auxiliary files alongside each rewritten SKILL.md.
EOF
  exit "${1:-0}"
}

while getopts ":o:nh" opt; do
  case "$opt" in
    o) DST="$OPTARG" ;;
    n) DRY_RUN=1 ;;
    h) usage 0 ;;
    *) usage 1 ;;
  esac
done

# OpenCode skill name regex: ^[a-z0-9]+(-[a-z0-9]+)*$
name_is_valid() {
  [[ "$1" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]
}

# Resolve description: prefer multipass_desc, fall back to description,
# fall back to a placeholder. Reads YAML single- or double-quoted values.
get_desc() {
  local f="$1" v
  v="$(awk '
    /^multipass_desc:/ {
      sub(/^multipass_desc:[[:space:]]*/, "")
      gsub(/^"|"$/, "")
      print; exit
    }
  ' "$f")"
  if [ -z "$v" ] || [ "$v" = "-" ]; then
    v="$(awk '
      /^description:/ {
        sub(/^description:[[:space:]]*/, "")
        gsub(/^"|"$/, "")
        print; exit
      }
    ' "$f")"
  fi
  [ -z "$v" ] && v="Multipass skill: $(basename "$(dirname "$f")")"
  printf '%s' "$v"
}

# Print the body of a SKILL.md (everything after the closing --- of frontmatter).
body() {
  awk 'BEGIN{c=0} /^---[[:space:]]*$/{c++; next} c>=2{print}' "$1"
}

[ -d "$SRC" ] || { echo "error: $SRC not found" >&2; exit 1; }

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run: would bridge into $DST" >&2
fi

bridged=0
skipped=0

shopt -s nullglob
for skill_dir in "$SRC"/*/; do
  name="$(basename "${skill_dir%/}")"
  src_skill="${skill_dir}SKILL.md"
  if [ ! -f "$src_skill" ]; then
    echo "skip (no SKILL.md): $name" >&2
    skipped=$((skipped+1)); continue
  fi
  if ! name_is_valid "$name"; then
    echo "skip (invalid OpenCode name): $name" >&2
    skipped=$((skipped+1)); continue
  fi

  desc="$(get_desc "$src_skill")"
  esc="${desc//\'/\'\'}"  # YAML single-quote escape

  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  %s\n' "$name"
    bridged=$((bridged+1)); continue
  fi

  out_dir="$DST/$name"
  mkdir -p "$out_dir"
  # Sync auxiliary files; keep SKILL.md ours.
  rsync -a --delete --exclude='SKILL.md' "$skill_dir" "$out_dir/"

  {
    printf -- '---\n'
    printf 'name: %s\n' "$name"
    printf "description: '%s'\n" "$esc"
    printf 'license: MIT\n'
    printf 'compatibility: opencode\n'
    printf 'metadata:\n'
    printf '  source: %s\n' "$src_skill"
    printf '  bridge: kierr/multipass:scripts/opencode-bridge.sh\n'
    printf -- '---\n\n'
    body "$src_skill"
  } > "$out_dir/SKILL.md"

  bridged=$((bridged+1))
done

echo "Bridged: $bridged, Skipped: $skipped → ${DST/#$HOME/~}"
