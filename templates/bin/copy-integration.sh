#!/usr/bin/env bash
# copy-integration.sh — copy a template's files into a target project.
#
# Usage:
#   bash copy-integration.sh <integration> <target-dir> [--force]
#
# Examples:
#   bash copy-integration.sh stripe-billing ~/src/my-new-project
#   bash copy-integration.sh resend-email ./ --force
#
# Behavior:
#   - Copies every regular file under templates/<integration>/, preserving
#     directory structure relative to the integration root.
#   - Skips README.md at the integration root (it's documentation, not code).
#   - Refuses to overwrite existing destination files unless --force is set.
#   - Reports a list of files copied + any skipped.

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <integration> <target-dir> [--force]" >&2
  echo "" >&2
  echo "Available integrations:" >&2
  TEMPLATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  for d in "$TEMPLATES_DIR"/*/; do
    name="$(basename "$d")"
    [ "$name" = "bin" ] && continue
    echo "  - $name" >&2
  done
  exit 1
fi

INTEGRATION="$1"
TARGET_DIR="$2"
FORCE=0
[ "${3:-}" = "--force" ] && FORCE=1

TEMPLATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$TEMPLATES_DIR/$INTEGRATION"

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: integration '$INTEGRATION' not found at $SRC_DIR" >&2
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: target dir '$TARGET_DIR' does not exist" >&2
  exit 1
fi

TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

echo "Copying $INTEGRATION → $TARGET_DIR"
echo ""

copied=0
skipped=0
overwrote=0

# Find every regular file under SRC_DIR, excluding the root README.md.
while IFS= read -r -d '' src_path; do
  rel_path="${src_path#$SRC_DIR/}"

  # Skip the root README.md (documentation only).
  if [ "$rel_path" = "README.md" ]; then
    continue
  fi

  dest_path="$TARGET_DIR/$rel_path"

  if [ -e "$dest_path" ]; then
    if [ "$FORCE" -eq 1 ]; then
      mkdir -p "$(dirname "$dest_path")"
      cp "$src_path" "$dest_path"
      echo "  overwrote  $rel_path"
      overwrote=$((overwrote + 1))
    else
      echo "  skipped    $rel_path  (already exists; pass --force to overwrite)"
      skipped=$((skipped + 1))
    fi
  else
    mkdir -p "$(dirname "$dest_path")"
    cp "$src_path" "$dest_path"
    echo "  copied     $rel_path"
    copied=$((copied + 1))
  fi
done < <(find "$SRC_DIR" -type f -print0)

echo ""
echo "Done. Copied: $copied, overwrote: $overwrote, skipped: $skipped"
echo ""
echo "Next steps:"
echo "  1. Read $SRC_DIR/README.md for post-copy customization steps."
echo "  2. Search the new files for '// CUSTOMIZE:' markers."
echo "  3. Follow the matching recipe in ~/src/recipes/recipes/ for env vars + go-live."
