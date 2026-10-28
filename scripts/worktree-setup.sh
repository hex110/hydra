#!/usr/bin/env bash
# Creates a git worktree for one task, ready to build, on a branch of the same
# name cut from the current main.
#
#   scripts/worktree-setup.sh <name>
#
# The worktree lands in ../hydra-worktrees/<name>. Gitignored files the build
# needs (.env, node_modules, the Rust target, downloaded binaries) are copied
# from the main checkout as btrfs reflinks, which are instant and cost no extra
# disk until a file changes. dist/ is deliberately not copied.
set -euo pipefail

name="${1:-}"
if ! [[ "$name" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
  echo "Usage: $0 <name>   (lowercase letters, digits, . _ -)" >&2
  exit 2
fi

main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
path="$(dirname "$main")/hydra-worktrees/$name"

if [ -e "$path" ]; then
  echo "$path already exists." >&2
  exit 1
fi

mkdir -p "$(dirname "$path")"
git -C "$main" worktree add -b "$name" "$path" main

# Husky's hooks live in a generated, gitignored folder.
for item in \
  .env \
  .husky/_ \
  node_modules \
  native/hydra-native/target \
  hydra-native \
  legendary \
  ludusavi \
  binaries/epic-prerequisite-runner; do
  [ -e "$main/$item" ] || continue
  mkdir -p "$path/$(dirname "$item")"
  cp -a --reflink=auto "$main/$item" "$path/$item"
done

echo "==> Worktree ready: $path (branch $name)"
echo "    Work there, commit, then land it with scripts/worktree-land.sh"
