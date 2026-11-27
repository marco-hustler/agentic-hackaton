# Dividealo frontend (Vite + React + TypeScript + Tailwind + R3F)

**Diorama 3D** SimCity-style (React Three Fiber) — houses = processes; chrome/modals in DOM on top.  
Spec: [`docs/flows-process-ux.md`](../docs/flows-process-ux.md) · stack: [`docs/stack.md`](../docs/stack.md).

## Auth before you build

After demo sign-in, open the **account menu** (top right):

1. **Authenticate with Idealo** (required) — without it, New process / Add object stay blocked and point you back to this menu.
2. **Configure AI keys** (optional) — enables LLM-assisted item drafting; manual add works without it.

Credentials live in `sessionStorage` for this browser tab only (see `src/auth/credentials.ts`).

## Build & run (from repo root)

```bash
make build   # Python + React → frontend/dist
make run     # build + serve API + UI on :8000
```

`uvicorn` alone never builds the frontend — only serves `frontend/dist`.

## Dev HMR (two terminals)

```bash
# terminal 1 — API (repo root)
make serve

# terminal 2 — React
make dev-ui
# http://localhost:5173  (/api proxied to :8000)
```

## Frontend-only build

```bash
cd frontend && npm run build
```

## Layout

```text
src/
  api/          fetch helpers → FastAPI
  auth/         demo session + Idealo/LLM credentials
  chrome/       header + account menu above the world
  overlays/     onboarding + create-process wizard
  world/        neighbourhood canvas (houses = processes)
  house/        inside-house inventory / split overlays
  types/        process + inventory types
dist/           production build (served by FastAPI at /)
```
