#!/usr/bin/env bash
# One-shot build: Python package + React (Vite) → frontend/dist
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
"$PYTHON" -m pip install -e ".[dev]"

echo "==> Frontend deps + production build"
cd "$ROOT/frontend"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build

echo
echo "Build OK."
echo "  React app:  frontend/dist  (served by FastAPI at /)"
echo "  Start:      uvicorn cleanbreak.api.app:app --reload --port 8000"
echo "  Legacy UI:  http://localhost:8000/legacy"
