# CleanBreak frontend (Vite + React + TypeScript + Tailwind + R3F)

**Diorama 3D** SimCity-style (React Three Fiber) — case = processi; chrome/modali in DOM sopra.  
Spec: [`docs/flows-process-ux.md`](../docs/flows-process-ux.md) · stack: [`docs/stack.md`](../docs/stack.md).

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
  chrome/       header overlay above the world
  overlays/     onboarding + create-process wizard
  world/        neighbourhood canvas (houses = processes)
  house/        inside-house inventory / split overlays
  types/        process + inventory types
dist/           production build (served by FastAPI at /)
```
