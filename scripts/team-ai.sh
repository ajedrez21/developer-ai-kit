#!/usr/bin/env sh
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
if [ ! -f "$ROOT/dist/cli.js" ]; then
  echo "Compilá el kit primero: npm run build" >&2
  exit 1
fi
exec node "$ROOT/dist/cli.js" "$@"
