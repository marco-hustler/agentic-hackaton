# CleanBreak frontend (Vite + React + TypeScript + Tailwind + R3F)

**Diorama 3D** SimCity-style (React Three Fiber) — case = processi; chrome/modali in DOM sopra.  
Spec: [`docs/flows-process-ux.md`](../docs/flows-process-ux.md) · stack: [`docs/stack.md`](../docs/stack.md).

> Nota: lo stub attuale del mondo è ancora 2D; il passo successivo è sostituirlo con la scena R3F.

## Dev (with FastAPI)

```bash
# terminal 1 — API (repo root, venv active)
uvicorn cleanbreak.api.app:app --reload --port 8000

# terminal 2 — React
cd frontend
npm install
npm run dev
# http://localhost:5173  (/api and /legacy proxied to :8000)
```

## Legacy Split Board

Previous vanilla UI lives in `legacy/` and is served by FastAPI at **http://localhost:8000/legacy** (also via Vite proxy at http://localhost:5173/legacy). Same `/api/*` endpoints.

## Production build

From the **repo root** (preferred — builds Python + React together):

```bash
make build
# FastAPI serves frontend/dist at http://localhost:8000/
```

Frontend only:

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
  types/        process stubs
legacy/         previous Split Board (HTML + app.js)
```
