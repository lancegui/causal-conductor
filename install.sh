#!/usr/bin/env bash
# causal-conductor installer.
# Installs three things next to stock oh-my-opencode-slim:
#   1. the prompt overlay (orchestrator.md + causal lane append)  — copied
#   2. the causal-spine preset                                    — copied if absent
#   3. the contract-spine plugin (the enforced write-gate)        — path printed to register
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
DEST="$CONFIG_DIR/oh-my-opencode-slim"
LITE_CONFIG="$CONFIG_DIR/oh-my-opencode-slim.jsonc"
OPENCODE_CONFIG="$CONFIG_DIR/opencode.jsonc"
PLUGIN_PATH="$SRC_DIR/plugin"

echo "causal-conductor: installing -> $CONFIG_DIR"

if [ ! -d "$CONFIG_DIR" ]; then
  echo "  ! $CONFIG_DIR does not exist. Install OpenCode + oh-my-opencode-slim first." >&2
  exit 1
fi

# 1. Prompt overlay (always safe — new files in a dedicated subdir).
mkdir -p "$DEST/causal-spine"
cp "$SRC_DIR/overlay/oh-my-opencode-slim/orchestrator.md" "$DEST/orchestrator.md"
# Copy every lane append (orchestrator, explorer, librarian, …) — not just one,
# so adding a new <agent>_append.md needs no installer edit.
cp "$SRC_DIR"/overlay/oh-my-opencode-slim/causal-spine/*_append.md "$DEST/causal-spine/"
echo "  ✓ prompt overlay (orchestrator.md + $(ls "$SRC_DIR"/overlay/oh-my-opencode-slim/causal-spine/*_append.md | wc -l | tr -d ' ') lane appends)"

# 2. Preset.
if [ ! -f "$LITE_CONFIG" ]; then
  cp "$SRC_DIR/preset/causal-spine.jsonc" "$LITE_CONFIG"
  echo "  ✓ installed causal-spine preset -> $LITE_CONFIG (edit model ids to your providers)"
else
  echo "  • $LITE_CONFIG exists — left untouched; merge preset/causal-spine.jsonc and set \"preset\": \"causal-spine\""
fi

# 3. Spine plugin (enforced write-gate). Pre-built in plugin/dist — no build needed.
echo
if [ -f "$OPENCODE_CONFIG" ] && grep -q "causal-conductor.*plugin\|$PLUGIN_PATH" "$OPENCODE_CONFIG"; then
  echo "  ✓ spine plugin already registered in $OPENCODE_CONFIG"
else
  echo "  ▸ ENABLE THE ENFORCED CONTRACT — add the spine plugin path to the \"plugin\" array in:"
  echo "      $OPENCODE_CONFIG"
  echo "    add this entry (next to your oh-my-opencode-slim entry):"
  echo "      \"$PLUGIN_PATH\""
  echo "    (skip this step to run prompt-only / soft-contract mode.)"
fi

echo
# Drift guard (warn-only): does the live config still match the repo preset
# template on skills/variant/mcps? Reconcile if it reports DRIFT.
if command -v node >/dev/null 2>&1; then
  node "$SRC_DIR/scripts/check-preset-sync.mjs" || true
elif command -v bun >/dev/null 2>&1; then
  bun "$SRC_DIR/scripts/check-preset-sync.mjs" || true
fi

echo
echo "Requirements: stock oh-my-opencode-slim + the causal-powers skills plugin"
echo "  ( https://github.com/lancegui/causal-powers )."
echo "Then restart OpenCode — plugins, prompts, and presets load at session start only."
