# CleanBreak — Fair Household Split (idealo MCP Challenge)

> *When a household splits, people don't fight over what they own—they fight over what it's worth. CleanBreak turns idealo's live market data into a neutral mediator that values, balances, and settles the split.*

Built for **Agentic Hackathon: From Research to Commerce** (Berlin, 27 Nov 2026) · **Agentic Commerce Track · idealo Challenge**.

---

## Docs

- Product spec & P0/P1/P2 priorities: [`docs/idea-fair-household-split.md`](docs/idea-fair-household-split.md)
- Process world UX flows: [`docs/flows-process-ux.md`](docs/flows-process-ux.md)
- Stack & 3-person async team split: [`docs/stack.md`](docs/stack.md)
- idealo MCP OAuth & probe guide: [`docs/idealo-mcp-setup.md`](docs/idealo-mcp-setup.md)
- Official hackathon brief: [`docs/brief.md`](docs/brief.md)
- Frontend (Vite React): [`frontend/README.md`](frontend/README.md)

---

## Quickstart

> Requires **Python 3.11+** and **Node 20+**. On macOS, if `python3 --version` is 3.9, use `/opt/homebrew/bin/python3` instead.

```bash
python3 -m venv .venv          # or: /opt/homebrew/bin/python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
cp .env.example .env           # optional — server-side keys; browser session overrides also work

# One command: Python deps + React → frontend/dist, then serve on :8000
make run
# Open http://localhost:8000
```

### First launch in the UI (required + optional)

1. **Sign in** with a demo account (email is enough).
2. **Authenticate with Idealo** (required) — open the account menu (top right) → *Authenticate with Idealo*, complete Idealo MCP OAuth, paste the token/code. Session-only; without it you cannot create a process or add objects.
3. **Configure an LLM** (optional) — same menu → *Configure AI keys* (`LLM_MODEL`, `LLM_API_KEY`, optional `LLM_API_BASE`). Enables AI-assisted item drafting; manual add still works without it.

`uvicorn` alone does **not** build the UI — it only serves whatever is already in `frontend/dist`. Use:

| Command | What it does |
|---|---|
| `make build` | Install Python package + build React → `frontend/dist` |
| `make run` | `make build` then serve API + UI on `:8000` |
| `make serve` | Serve only (needs a prior `make build`) |
| `make dev-ui` | Vite HMR on `:5173` (pair with `make serve`) |

### Frontend HMR (optional, two terminals)

```bash
make serve    # :8000 API (+ built UI)
make dev-ui   # :5173, proxies /api → :8000
```

### idealo call budget — live calls are OFF by default
The Trial tier allows **500 calls/day and 3 calls/sec**, shared by everyone using the same login. The app never calls idealo unless you opt in:

- Default: the app, tests and UI run entirely on the cached responses in `data/cache/` (0 calls).
- For a deliberate real test, set `IDEALO_LIVE_ENABLED=true` in `.env` and restart. Only items that are not cached yet are looked up (max 10 per click, ~4 calls each). Already-cached items never cost a call, and "not found" answers are remembered.
- Every call is counted in `data/idealo_budget.json`, with a hard stop at 450/day (`IDEALO_DAILY_CALL_CAP`). The UI shows how many calls are left (`GET /api/idealo/status`).
- Only one person should turn live mode on at a time. Commit new `data/cache/` files after a live test so teammates reuse them.

### Optional: Log in / refresh idealo data from the command line (OAuth)
Prefer the in-app account menu for day-to-day use. For CLI probes / cache refresh:
```bash
python scripts/probe_idealo_mcp.py --list-tools   # opens browser for idealo OAuth (~3 calls)
python scripts/probe_idealo_mcp.py --probe-demo   # ~2 calls to connect; cached items cost 0 more
python scripts/probe_idealo_mcp.py --probe-demo --refresh   # re-fetches everything (~30 calls!)
```

### Optional: LLM via `.env` (server fallback)
Browser session keys from the account menu take precedence. To set a server-wide default, install `pip install -e ".[llm,dev]"` and set `LLM_MODEL` + your API key in `.env`. Without any LLM key, Dividealo falls back to deterministic parsing so the demo never breaks.

---

## 3-Person Async Repo Map

All tracks share typed Pydantic contracts in `src/cleanbreak/models.py`:

- **Track A (idealo MCP + Valuation):** `src/cleanbreak/idealo/`, `src/cleanbreak/valuation/`, `scripts/probe_idealo_mcp.py`
- **Track B (Solver + LLM + API):** `src/cleanbreak/solver/`, `src/cleanbreak/llm/`, `src/cleanbreak/api/`, `tests/`
- **Track C (UI + Demo):** `frontend/`, `data/demo_berlin_wg.json`
