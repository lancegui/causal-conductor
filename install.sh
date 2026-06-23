#!/usr/bin/env bash
# causal-conductor overlay installer.
# - Copies the prompt overlay into your OpenCode config dir (non-destructive).
# - If you have no oh-my-opencode-slim.jsonc yet, installs the causal-spine
#   preset for you. If you already have one, it is left untouched and the
#   manual merge step is printed (auto-merging JSONC safely is not attempted).
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
DEST="$CONFIG_DIR/oh-my-opencode-slim"
LITE_CONFIG="$CONFIG_DIR/oh-my-opencode-slim.jsonc"

echo "causal-conductor: installing prompt overlay -> $DEST"

if [ ! -d "$CONFIG_DIR" ]; then
  echo "  ! $CONFIG_DIR does not exist. Install OpenCode + oh-my-opencode-slim first." >&2
  exit 1
fi

# 1. Prompt overlay (always safe — new files in a dedicated subdir).
mkdir -p "$DEST/causal-spine"
cp "$SRC_DIR/overlay/oh-my-opencode-slim/orchestrator.md" "$DEST/orchestrator.md"
cp "$SRC_DIR/overlay/oh-my-opencode-slim/causal-spine/orchestrator_append.md" "$DEST/causal-spine/orchestrator_append.md"
echo "  ✓ orchestrator.md"
echo "  ✓ causal-spine/orchestrator_append.md"

# 2. Preset.
echo
if [ ! -f "$LITE_CONFIG" ]; then
  cp "$SRC_DIR/preset/causal-spine.jsonc" "$LITE_CONFIG"
  echo "  ✓ installed causal-spine preset -> $LITE_CONFIG"
  echo "    (edit the model ids in it to match providers you have authenticated)"
else
  echo "  • $LITE_CONFIG already exists — left untouched."
  echo "    Merge the \"presets\".\"causal-spine\" block from:"
  echo "      $SRC_DIR/preset/causal-spine.jsonc"
  echo "    into it, and set  \"preset\": \"causal-spine\""
fi

echo
echo "Requirements: stock oh-my-opencode-slim + the causal-powers skills plugin"
echo "  ( https://github.com/lancegui/causal-powers )."
echo "Then restart OpenCode — prompts/presets load at session start only."
