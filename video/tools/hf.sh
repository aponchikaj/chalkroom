#!/bin/sh
# Run one HyperFrames command at a time across all agents (8 GB machine).
# Usage: sh tools/hf.sh snapshot --at 50,55 --no-end -o snapshots/s06
LOCK=/private/tmp/claude-501/hf-chrome.lock
while ! mkdir "$LOCK" 2>/dev/null; do sleep 2; done
trap 'rmdir "$LOCK"' EXIT INT TERM
cd "$(dirname "$0")/.." && HYPERFRAMES_SKIP_SKILLS=1 npx -y hyperframes@latest "$@"
