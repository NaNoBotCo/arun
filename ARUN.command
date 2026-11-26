#!/bin/zsh
# Opens the ARUN site from disk in the default browser. No server needed.
cd "$(dirname "$0")"
[ -f dist/index.html ] || { echo "dist/index.html is missing. Run: npm install && npm test && npm run build"; read; exit 1; }
open dist/index.html
