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

## Quickstart (2 minutes, works out of the box)

> Requires **Python 3.11+**. On macOS, if `python3 --version` is 3.9, use `/opt/homebrew/bin/python3` instead.

```bash
git checkout it-1
python3 -m venv .venv          # or: /opt/homebrew/bin/python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env           # optional — works even without API keys

# 1. Run unit tests (offline, zero API keys needed)
pytest

# 2. Start the web app + API immediately (uses real cached idealo DE data in data/cache/)
uvicorn cleanbreak.api.app:app --reload --port 8000
# Open http://localhost:8000
```

### Optional: Refresh Live idealo MCP Data (OAuth)
Real responses for all 7 demo items are already cached in `data/cache/`. Only run this if you want to query idealo live yourself:
```bash
python scripts/probe_idealo_mcp.py --list-tools   # opens browser for idealo OAuth
python scripts/probe_idealo_mcp.py --probe-demo   # refreshes data/cache/
```

### Optional: Enable Any LLM Provider
To enable Gemini, OpenAI, Claude, or Nebius, install `pip install -e ".[llm,dev]"` and set `LLM_MODEL` + your API key in `.env`. Without an LLM key, CleanBreak falls back to deterministic parsing/explanations so the demo never breaks.

---

## 3-Person Async Repo Map

All tracks share typed Pydantic contracts in `src/cleanbreak/models.py`:

- **Track A (idealo MCP + Valuation):** `src/cleanbreak/idealo/`, `src/cleanbreak/valuation/`, `scripts/probe_idealo_mcp.py`
- **Track B (Solver + LLM + API):** `src/cleanbreak/solver/`, `src/cleanbreak/llm/`, `src/cleanbreak/api/`, `tests/`
- **Track C (UI + Demo):** `frontend/`, `data/demo_berlin_wg.json`
