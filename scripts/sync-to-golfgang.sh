#!/usr/bin/env bash
# Ports every commit made here since the last sync onto golf-gang-pool.
#
# The two repos are the same engine code with different branding/roster (see
# the "Add ... " feature commits in this repo's history) — this repo is the
# one new features land in first. A git tag (synced-to-golfgang) marks the
# last commit already ported; this script format-patches everything after
# it and applies the patches to golf-gang-pool as individual commits via
# `git am`, so history stays parallel and each patch stays bisectable.
#
# On success: golf-gang-pool gets the new commits (staged, not pushed), and
# the tag moves forward here. On failure (a patch doesn't apply — almost
# always because it touches a line branding/roster differences moved), the
# `git am` is aborted, nothing is left half-applied, and this prints exactly
# which commit needs a manual patch.
set -euo pipefail

F7_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GG_DIR="${GOLFGANG_DIR:-$HOME/golf-gang-pool}"
TAG=synced-to-golfgang

if [ ! -d "$GG_DIR/.git" ]; then
  echo "error: golf-gang-pool not found at $GG_DIR (set GOLFGANG_DIR to override)" >&2
  exit 1
fi

cd "$F7_DIR"
if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag '$TAG' doesn't exist yet in $F7_DIR." >&2
  echo "First run: git tag $TAG <commit already known to match golf-gang-pool>" >&2
  exit 1
fi

COMMITS=$(git rev-list --reverse "$TAG"..HEAD)
if [ -z "$COMMITS" ]; then
  echo "Already in sync — nothing to port since $(git rev-parse --short "$TAG")."
  exit 0
fi

COUNT=$(echo "$COMMITS" | wc -l | tr -d ' ')
echo "Porting $COUNT commit(s) from f7-pool to golf-gang-pool:"
git log --oneline "$TAG"..HEAD
echo

PATCH_DIR=$(mktemp -d)
trap 'rm -rf "$PATCH_DIR"' EXIT
git format-patch "$TAG"..HEAD -o "$PATCH_DIR" >/dev/null

# Commits marked "f7-pool-only" in their message are intentionally never
# ported (e.g. this script — golf-gang-pool is a sync target, not a source,
# so it has no use for a script that syncs FROM f7-pool). Drop those patches
# but still treat them as handled so the tag moves past them.
for f in "$PATCH_DIR"/*.patch; do
  if grep -qi "f7-pool-only" "$f"; then
    echo "Skipping $(basename "$f") — marked f7-pool-only"
    rm "$f"
  fi
done

if ! ls "$PATCH_DIR"/*.patch >/dev/null 2>&1; then
  echo "Nothing left to port (remaining commits were all f7-pool-only)."
  git -C "$F7_DIR" tag -f "$TAG" HEAD
  git -C "$F7_DIR" push origin "$TAG" -f
  exit 0
fi

cd "$GG_DIR"
if ! git am "$PATCH_DIR"/*.patch; then
  git am --abort
  echo >&2
  echo "error: a patch didn't apply cleanly — aborted, golf-gang-pool is untouched." >&2
  echo "Likely cause: the commit touches a line where branding/roster already differs." >&2
  echo "Port that one commit by hand, then re-run this script for the rest." >&2
  exit 1
fi

echo
echo "Applied cleanly. Pushing golf-gang-pool..."
git push origin main

NEW_HEAD=$(git -C "$F7_DIR" rev-parse HEAD)
git -C "$F7_DIR" tag -f "$TAG" "$NEW_HEAD"
git -C "$F7_DIR" push origin "$TAG" -f
echo "Done — $TAG now points at $(git -C "$F7_DIR" rev-parse --short "$TAG")."
