.PHONY: build run serve dev-api dev-ui test

# One command: install Python deps + build React → frontend/dist
build:
	./scripts/build.sh

# Build then serve API + React on :8000
run: build
	.venv/bin/uvicorn cleanbreak.api.app:app --reload --port 8000

# Serve only (requires a prior `make build`; does NOT build anything)
serve:
	.venv/bin/uvicorn cleanbreak.api.app:app --reload --port 8000

# API only — same as serve; use with `make dev-ui` for HMR
dev-api: serve

# Vite HMR on :5173 (proxies /api → :8000)
dev-ui:
	cd frontend && npm run dev

test:
	.venv/bin/pytest
