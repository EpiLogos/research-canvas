#!/usr/bin/env bash
# Epi-Logos SessionStart hook
# Self-locating: finds the cheat sheet relative to this script's own position,
# so it works regardless of install path or whether CLAUDE_PLUGIN_ROOT is set.

# This script lives at [plugin-root]/hooks/load-cheat-sheet.sh
# so plugin root is one directory up from here.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
CHEAT_SHEET="$PLUGIN_ROOT/resources/updated-ql-mef/epi_logos_cheat_sheet.md"

if [ -f "$CHEAT_SHEET" ]; then
  cat "$CHEAT_SHEET"
fi

exit 0
