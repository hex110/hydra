#!/usr/bin/env bash
# Lands the current worktree's branch on main and removes the worktree.
# Run it from inside the worktree, with everything committed (and installed,
# if the app should be tried first).
#
#   scripts/worktree-land.sh
#
# Rebases the branch onto main, then fast-forwards main to it. If main moved
# in between, it rebases again. A rebase conflict is left for you to resolve:
# fix it, `git rebase --continue`, and run this again.
set -euo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"
worktree="$(git rev-parse --show-toplevel)"
main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"

if [ "$worktree" = "$main" ] || [ "$branch" = "main" ]; then
  echo "Run this from a task worktree, not the main checkout." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes in $worktree; commit them first." >&2
  exit 1
fi

if [ "$(git -C "$main" rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "The main checkout ($main) is not on main; leaving it alone." >&2
  exit 1
fi

for attempt in 1 2 3; do
  git rebase main
  if git -C "$main" merge --ff-only "$branch"; then
    cd "$main"
    git worktree remove --force "$worktree"
    git branch -d "$branch"
    echo "==> Landed $branch on main. Continue from $main."
    exit 0
  fi
  echo "main moved or has conflicting local changes (attempt $attempt); retrying" >&2
done

echo "Could not fast-forward main. Check 'git -C $main status' for local changes in the way." >&2
exit 1
