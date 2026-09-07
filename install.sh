#!/bin/sh
set -eu

source_path=$0
while [ -L "$source_path" ]; do
  source_dir=$(cd -P "$(dirname "$source_path")" && pwd)
  source_path=$(readlink "$source_path")
  case "$source_path" in
    /*) ;;
    *) source_path="$source_dir/$source_path" ;;
  esac
done
skill_dir=$(cd -P "$(dirname "$source_path")" && pwd)

agents_pointer="Skills live in ~/.codex/skills. If a request mentions drilling, interview practice, question banks, mock interviews, lessons, or grilling a design, read ~/.codex/skills/interview-drill/SKILL.md first and follow it."
run_tests=true
uninstall=false

for arg in "$@"; do
  case "$arg" in
    --no-test) run_tests=false ;;
    --uninstall) uninstall=true ;;
    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

remove_pointer() {
  agents_file=$1
  if [ -f "$agents_file" ]; then
    temporary_file=$(mktemp "${agents_file}.tmp.XXXXXX")
    awk -v pointer="$agents_pointer" '$0 != pointer { print }' "$agents_file" > "$temporary_file"
    mv "$temporary_file" "$agents_file"
  fi
}

remove_link() {
  link_path=$1
  if [ -L "$link_path" ] && [ "$(readlink "$link_path")" = "$skill_dir" ]; then
    rm "$link_path"
    echo "removed $link_path"
  fi
}

install_link() {
  link_path=$1
  ln -sfn "$skill_dir" "$link_path"
  echo "linked $link_path -> $skill_dir"
}

if [ "$uninstall" = true ]; then
  remove_link "${HOME}/.claude/skills/interview-drill"
  remove_link "${HOME}/.codex/skills/interview-drill"
  remove_link "${HOME}/.cursor/skills/interview-drill"
  remove_pointer "${HOME}/.codex/AGENTS.md"
else
  mkdir -p "${HOME}/.claude/skills" "${HOME}/.codex/skills" "${HOME}/.cursor/skills"

  install_link "${HOME}/.claude/skills/interview-drill"
  install_link "${HOME}/.codex/skills/interview-drill"
  install_link "${HOME}/.cursor/skills/interview-drill"

  agents_file="${HOME}/.codex/AGENTS.md"
  if [ -f "$agents_file" ]; then
    if ! grep -Fq "interview-drill" "$agents_file"; then
      printf '\n%s\n' "$agents_pointer" >> "$agents_file"
    fi
  else
    printf '%s\n' "$agents_pointer" > "$agents_file"
  fi
fi

if [ "$run_tests" = true ]; then
  cd "$skill_dir"
  node --test scripts/drill.test.mjs
fi
