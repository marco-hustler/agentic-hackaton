# Technology Stack & 3-Person Async Architecture

> **Track:** Agentic Commerce · **Primary Challenge:** idealo MCP  
> **Team:** 3 builders working async on this repo · **Language:** Python 3.11+ (tested on 3.15)

---

## Confirmed Stack

| Layer | Choice | Why |
|---|---|---|
| **Language & Runtime** | **Python 3.11+** (`.venv`) | Team preference; fast iteration; exact solver in ~100 lines; official `mcp` Python SDK. |
| **Commerce Data** | **idealo MCP** (`https://mcp.idealo.com/mcp`) via `mcp` SDK (`streamable_http_client` + `OAuthClientProvider`) | Official Streamable HTTP transport with persisted OAuth tokens + local JSON disk cache. |
| **Fairness Solver** | **Pure deterministic Python** (`src/cleanbreak/solver/`) | Exact optimal search over all splits in <5 ms; zero LLM arithmetic hallucinations; unit-tested. |
| **LLM Layer (Provider-Agnostic)** | **`litellm`** behind `src/cleanbreak/llm/client.py` + deterministic no-key fallback | Switch between **Gemini, OpenAI/ChatGPT, Claude, or Nebius** via one env var (`LLM_MODEL`). Core valuation & solver work even with no LLM key configured. |
| **API Server** | **FastAPI + Uvicorn + Pydantic v2** (`src/cleanbreak/api/`) | Typed contracts shared across all 3 teammates; JSON API + (later) serve Vite `dist/`. |
| **Frontend UI** | **Vite + React + TypeScript + Tailwind + R3F** (`frontend/`) | **Diorama 3D** SimCity-style (case = processi); overlay DOM per wizard/lista. |

---

## Frontend — stack (ship veloce + diorama 3D)

Obiettivo: mondo **davvero 3D** (WebGL), chrome UI in DOM sopra. Niente fake-isometric CSS al posto del diorama.

| Pezzo | Tech | A cosa serve |
|---|---|---|
| **App** | **Vite + React + TypeScript** | UI tipizzata, HMR, build `dist/` |
| **Stile / chrome** | **Tailwind CSS** | Layout, header, modali sopra il 3D |
| **API client** | **`fetch` → FastAPI** | Niente TanStack Query per ora |
| **State** | **`useState` / `useContext`** | Niente Zustand/Redux |
| **Mondo 3D** | **React Three Fiber + Three.js + `@react-three/drei`** | Quartiere / case / stanze in diorama 3D; orbit controls |
| **Overlay** | **Modali HTML/Tailwind** | Onboarding, wizard, inventario, vista lista, dettaglio oggetto |
| **Export Excel** | **SheetJS (`xlsx`)** | Solo quando serve la modale lista |
| **Build one-shot** | **`make build`** (`scripts/build.sh`) | Python editable + `frontend/dist` |

**Esplicitamente fuori stack (per ora):** Framer Motion, Zustand, TanStack Query, Radix, Phaser, PixiJS, CSS-only “isometric world”.

**Integrazione backend**

- Dev: Vite su `:5173` con proxy `/api` → FastAPI `:8000` + CORS
- Prod: `make build` poi FastAPI serve `frontend/dist` su `:8000`

**Ordine di build frontend**

1. [x] Scaffold Vite React TS + Tailwind (+ legacy UI)
2. [x] Diorama 3D quartiere (R3F) + case + `+` (landing isometrica, design `DESIGN.md`)
3. Modale onboarding + wizard (già stub DOM)
4. Dentro casa: stanze 3D + inventario / lista overlay
5. Collegare FastAPI e dati reali / solver

Dettaglio UX: `docs/flows-process-ux.md`.

---

## LLM-Agnostic Design

The LLM provider is **not locked in**. All model calls go through `src/cleanbreak/llm/client.py`, which reads environment variables:

```env
# Pick ANY provider supported by LiteLLM — examples:
LLM_MODEL=gemini/gemini-2.5-flash          # + GEMINI_API_KEY=...
# LLM_MODEL=openai/gpt-4o-mini             # + OPENAI_API_KEY=...
# LLM_MODEL=anthropic/claude-sonnet-4-5    # + ANTHROPIC_API_KEY=...
# LLM_MODEL=openai/meta-llama/...          # + OPENAI_API_KEY=... & LLM_API_BASE=https://api.studio.nebius.com/v1
```

If `LLM_MODEL` / key is not set (or a call fails during a live demo), the adapter automatically falls back to deterministic rule-based parsing and templating so the app **never crashes**.

---

## 3-Person Async Repo Boundaries (Zero Merge Conflicts)

All 3 teammates share one typed contract file: **`src/cleanbreak/models.py`**. Agree on changes to `models.py` first; everything else is isolated:

| Track | Owner Role | Owned Directories | Deliverables |
|---|---|---|---|
| **Track A** | **idealo MCP + Valuation** | `src/cleanbreak/idealo/`, `src/cleanbreak/valuation/`, `scripts/probe_idealo_mcp.py`, `data/cache/` | OAuth MCP client, local JSON cache, trusted-offer pricing, depreciation, scarcity & Black Friday 30-day deal detector. |
| **Track B** | **Solver + LLM + API** | `src/cleanbreak/solver/`, `src/cleanbreak/llm/`, `src/cleanbreak/api/`, `tests/` | Exact deterministic split optimizer (3 modes + contention arbitrage), provider-agnostic LLM parser/summarizer, FastAPI endpoints. |
| **Track C** | **UI + Demo & Pitch** | `frontend/` (Vite React), `data/demo_berlin_wg.json` | SimCity process world, house detail diorama, inventory/split overlays, idealo evidence, pitch assets. |

---

## Out of Scope (Unless Ahead of Schedule)

- **Affinidi / Trust Boris:** Out of scope — adds Docker/CLI setup overhead without directly improving the idealo judging criteria.
- **Norma (Quality Clouds):** Strictly optional P2 bonus if feature freeze finishes early (before 18:00).

---

## Quick Local Setup

```bash
# 1. Create virtualenv (use Homebrew Python 3.11+ — macOS /usr/bin/python3 is 3.9 and too old for mcp)
/opt/homebrew/bin/python3 -m venv .venv
source .venv/bin/activate

# 2. Install package + dev deps
pip install -e ".[dev]"

# 3. Copy env template
cp .env.example .env

# 4. Run unit tests
pytest

# 5. (Optional, spends idealo calls) log in to idealo MCP — opens browser for OAuth
python scripts/probe_idealo_mcp.py --list-tools
#    Live calls from the web app stay OFF unless IDEALO_LIVE_ENABLED=true in .env
#    (see docs/idealo-mcp-setup.md -> "How the app protects the call budget")

# 6. One-shot build (Python editable install + Vite → frontend/dist)
make build
# same as: ./scripts/build.sh

# 7. Serve everything from FastAPI
uvicorn cleanbreak.api.app:app --reload --port 8000
# React:  http://localhost:8000/
# Legacy: http://localhost:8000/legacy
# Or: make run   (build + serve)

# Optional HMR: make dev-api  +  make dev-ui (:5173)
```

### Frontend layout

```text
frontend/
  src/           React world UI (Vite + TS + Tailwind)
  legacy/        Previous Split Board (vanilla HTML/JS) — keep/reuse while migrating
  dist/          Production build (gitignored; served by FastAPI at /)
```
