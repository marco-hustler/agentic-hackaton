# idealo MCP Setup & OAuth Probing Guide

This guide walks you through connecting to `https://mcp.idealo.com/mcp`, completing OAuth, and capturing real catalog/price/offer data for our Berlin demo scenario.

---

## Important Limits to Know First

- **Endpoint:** `https://mcp.idealo.com/mcp` (Streamable HTTP + OAuth)
- **Account:** The idealo MCP OAuth login is **separate** from a normal idealo.de shopping account — you'll register/sign in during the browser OAuth flow.
- **Trial tier defaults:** **500 calls/day** per user, **3 calls/sec**, max **10 offers/product**.
  - At check-in on Friday (14:00), ask idealo mentors if **Partner tier** is enabled for hackathon teams.
  - Our probe script and backend automatically **cache every response** in `data/cache/` so we never waste daily quota and can demo offline if venue Wi-Fi fails.

### How the app protects the call budget

- **Live calls are off by default.** The web app, tests and UI run on `data/cache/` only. To spend calls for a real test, set `IDEALO_LIVE_ENABLED=true` in `.env` and restart the server.
- **Every MCP request is counted** (`initialize`, `list_tools` and each tool call) in `data/idealo_budget.json` (per machine, git-ignored), with a hard stop at `IDEALO_DAILY_CALL_CAP` (default 450). Calls are spaced ≥0.34 s apart (<3/s).
- **Cache first, always.** Cached items cost 0 calls. A new item costs ~4 calls (search, details, offers, price history) plus ~2 per connection. At most 10 new items are looked up per click, and one live request gives up after `IDEALO_LIVE_DEADLINE_SECONDS` (default 20) with an "idealo slow" placeholder.
- **Answers are remembered:** "not found" forever, errors for 15 minutes. Queries are matched case- and whitespace-insensitively.
- **The server never logs in.** Without a saved login it returns placeholders with a "login required" note; log in with `--list-tools` below.
- **Check the budget:** `GET /api/idealo/status` (also shown in the UI header).
- **Shared login:** the counter is per machine, so only one person should run with live mode on at a time. Commit new `data/cache/` files after a live test so teammates reuse them.
- **Markets:** `DE`, `AT`, `GB`, `FR`, `IT`, `ES` (we default to `DE`).
- **Exclusions:** Amazon, eBay, and Otto do not appear in results; IKEA has minimal coverage.

---

## Step-by-Step: Authenticate & Probe in Python

### 1. Create the virtual environment (Python 3.11+ required)

> **macOS note:** The system `/usr/bin/python3` is Python 3.9, which is too old for the `mcp` SDK. Use Homebrew Python (`/opt/homebrew/bin/python3`).

```bash
cd /Users/vincenzo/repos/agentic-hackaton
/opt/homebrew/bin/python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### 2. Run the interactive OAuth + probe script

First, run a quick **connectivity & tool-discovery check** (uses 0 search quota, just OAuth + `list_tools`):

```bash
python scripts/probe_idealo_mcp.py --list-tools
```

**What happens on first run:**
1. The script starts a tiny local callback listener at `http://localhost:6274/callback` (the port idealo documents in `idealo/mcp-server-guide`).
2. Your default browser opens idealo's OAuth sign-in / consent page.
3. Sign in (or create an idealo MCP developer/user login if prompted) and click **Authorize**.
4. The browser redirects back to `http://localhost:6274/callback?code=...&state=...`, showing a "Login complete — you can close this tab" page.
5. Tokens are saved locally to `.idealo_tokens.json` (git-ignored! Never commit this file) so subsequent runs reuse your session without logging in again.

> **Troubleshooting OAuth:**
> - If port `6274` is busy, pass `--callback-port 6275` (or another free port).
> - If your browser doesn't auto-open, copy the printed `https://...` URL from the terminal into Chrome/Firefox manually.
> - If the redirect doesn't auto-capture (e.g. strict browser policy), run with `--manual-callback` and paste the redirected `http://localhost:...` URL back into the terminal.

### 3. Probe our candidate demo items (~30 calls when uncached; ~2 when already cached)

Once `--list-tools` succeeds, probe the 7 Berlin household items and save both raw tool responses (`data/probe_results.json`) and reusable disk cache (`data/cache/`):

```bash
python scripts/probe_idealo_mcp.py --probe-demo
```

Or probe a single custom query (~6 calls: connect + 4 lookups):

```bash
python scripts/probe_idealo_mcp.py --query "Sage Barista Express" --country DE
```

### 4. What to inspect in the probe output

Check `data/probe_results.json` (and the terminal summary table) for 4 things:
1. **Exact tool names & argument names** returned by `--list-tools` (confirm whether price history is `get_product_price_history` or `get_price_history`, and exact parameter names like `country` / `productRef`).
2. **Offer quality:** Do our 7 items return ≥3 rated offers with prices and shipping?
3. **Black Friday / 30-day drop:** Which 1–2 items show a genuine **negative % change** vs. 30-day average/max right now? Those become our spotlight "Contention Arbitrage" item in the live pitch!
4. **Discontinued item test:** Confirm how an older model query (e.g., `"Bosch Serie 6 Waschmaschine 2019"`) behaves so our substitute logic handles it cleanly.
