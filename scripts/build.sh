#!/usr/bin/env bash
# One-shot build: Python package + React (Vite) → frontend/dist
# Usage: make build  |  ./scripts/build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PYTHON="$ROOT/.venv/bin/python"
elif [[ -x "$ROOT/.venv/bin/python3" ]]; then
  PYTHON="$ROOT/.venv/bin/python3"
else
  PYTHON="${PYTHON:-python3}"
fi

echo "==> Python package (editable + dev) [$PYTHON]"
"$PYTHON" -m pip install -e ".[dev]" -q

echo "==> Frontend → frontend/dist"
cd "$ROOT/frontend"
if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi
npm run build

echo
echo "Build OK — React at frontend/dist (served by FastAPI at /)"
echo "  Start everything:  make run"
echo "  Or API only:       uvicorn cleanbreak.api.app:app --reload --port 8000"
