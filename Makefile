.PHONY: build run dev-api dev-ui test

# One command: install Python + build React into frontend/dist
build:
	./scripts/build.sh

# Build then serve everything from FastAPI (:8000)
run: build
	uvicorn cleanbreak.api.app:app --reload --port 8000

# API only (assumes frontend already built, or use Vite separately)
dev-api:
	uvicorn cleanbreak.api.app:app --reload --port 8000

# Vite HMR (proxies /api → :8000)
dev-ui:
	cd frontend && npm run dev

test:
	pytest
