#!/usr/bin/env bash
set -euo pipefail

skill_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
mkdir -p "$HOME/.claude/skills" "$HOME/.codex/skills"
install_status=0
if ln -sfn "$skill_dir" "$HOME/.claude/skills/interview-drill"; then
  echo "linked $HOME/.claude/skills/interview-drill -> $skill_dir"
else
  echo "could not link $HOME/.claude/skills/interview-drill" >&2
  install_status=1
fi
if ln -sfn "$skill_dir" "$HOME/.codex/skills/interview-drill"; then
  echo "linked $HOME/.codex/skills/interview-drill -> $skill_dir"
else
  echo "could not link $HOME/.codex/skills/interview-drill" >&2
  install_status=1
fi
node "$skill_dir/scripts/drill.test.mjs"
exit "$install_status"
