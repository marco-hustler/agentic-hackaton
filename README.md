# CleanBreak — Fair Household Split (idealo MCP Challenge)

> *When a household splits, people don't fight over what they own—they fight over what it's worth. CleanBreak turns idealo's live market data into a neutral mediator that values, balances, and settles the split.*

Built for **Agentic Hackathon: From Research to Commerce** (Berlin, 27 Nov 2026) · **Agentic Commerce Track · idealo Challenge**.

---

## Docs

- Product spec & P0/P1/P2 priorities: [`docs/idea-fair-household-split.md`](docs/idea-fair-household-split.md)
- Stack & 3-person async team split: [`docs/stack.md`](docs/stack.md)
- idealo MCP OAuth & probe guide: [`docs/idealo-mcp-setup.md`](docs/idealo-mcp-setup.md)
- Official hackathon brief: [`docs/brief.md`](docs/brief.md)

---

## Quickstart

> Requires **Python 3.11+** (on macOS use `/opt/homebrew/bin/python3`; `/usr/bin/python3` is 3.9).

```bash
/opt/homebrew/bin/python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Run unit tests (works offline, zero API keys needed)
pytest

# Probe idealo MCP (opens browser for OAuth login on first run)
python scripts/probe_idealo_mcp.py --list-tools
python scripts/probe_idealo_mcp.py --probe-demo

# Start the web app + API
uvicorn cleanbreak.api.app:app --reload --port 8000
# Open http://localhost:8000
```

To enable any LLM provider (Gemini, OpenAI, Claude, Nebius, etc.), install the optional `llm` extra (`pip install -e ".[llm,dev]"`) and set `LLM_MODEL` + API key in `.env`. Without an LLM key, CleanBreak automatically uses deterministic fallback parsing/explanations so the demo never breaks.

---

## 3-Person Async Repo Map

All tracks share typed Pydantic contracts in `src/cleanbreak/models.py`:

- **Track A (idealo MCP + Valuation):** `src/cleanbreak/idealo/`, `src/cleanbreak/valuation/`, `scripts/probe_idealo_mcp.py`
- **Track B (Solver + LLM + API):** `src/cleanbreak/solver/`, `src/cleanbreak/llm/`, `src/cleanbreak/api/`, `tests/`
- **Track C (UI + Demo):** `frontend/`, `data/demo_berlin_wg.json`
