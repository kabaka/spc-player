#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
EPHEMERAL_DIR="$ROOT/.ephemeral"

if [ ! -d "$EPHEMERAL_DIR" ]; then
  exit 0
fi

# Guard against symlink escape
if [ -L "$EPHEMERAL_DIR" ]; then
  echo "Error: $EPHEMERAL_DIR is a symlink. Refusing to clean." >&2
  exit 1
fi

# Remove all files and subdirectories, keep the top-level directory
find "$EPHEMERAL_DIR" -mindepth 1 -delete

echo "Cleaned $EPHEMERAL_DIR/"
