"""FastAPI application for CleanBreak."""

from __future__ import annotations

import asyncio
import json
import os
from collections import Counter
from typing import Callable, Literal

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from cleanbreak.idealo.auth import default_token_path, find_exception, is_login_required, tokens_present
from cleanbreak.idealo.budget import BudgetExhausted, get_budget
from cleanbreak.idealo.client import IdealoMCPClient
from cleanbreak.llm.tasks import generate_mediator_summary, parse_messy_inventory
from cleanbreak.models import (
    HouseholdItemInput,
    ItemValuation,
    SplitMode,
    SplitRequest,
    SplitResult,
    ValuedItem,
)
from cleanbreak.paths import REPO_ROOT
from cleanbreak.solver.optimizer import solve_split
from cleanbreak.valuation.engine import build_demo_fallback_valuations, compute_depreciation

load_dotenv()

DEMO_PATH = REPO_ROOT / "data" / "demo_berlin_wg.json"
FRONTEND_DIR = REPO_ROOT / "frontend"

app = FastAPI(title="CleanBreak — Fair Household Split (idealo MCP)", version="0.1.0")

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


class ValueRequest(BaseModel):
    items: list[HouseholdItemInput]
    country: str = "DE"
    mode: Literal["cache_only", "live_or_cache", "fallback"] = "cache_only"


class ValueResponse(BaseModel):
    valuations: list[ItemValuation]
    warning: str | None = None
    budget: dict | None = None


class ParseRequest(BaseModel):
    raw_text: str
    party_a_name: str = "Alex"
    party_b_name: str = "Sam"


class RevalueSingleRequest(BaseModel):
    item: HouseholdItemInput
    valuation: ItemValuation


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "cleanbreak"}


@app.get("/api/demo")
async def get_demo_scenario(mode: SplitMode = "balanced") -> dict:
    """Return the preloaded Berlin WG scenario, valuations (cached idealo if present, else fallback), and solved split."""
    raw = json.loads(DEMO_PATH.read_text(encoding="utf-8"))
    items = [HouseholdItemInput.model_validate(i) for i in raw["items"]]

    # Try cached idealo valuations first; fall back transparently if probe hasn't run yet.
    valuations, warning, _ = await _value_items(items, country=raw.get("country", "DE"), mode="cache_only")
    valued = [ValuedItem(item=item, valuation=val) for item, val in zip(items, valuations)]

    split = solve_split(
        SplitRequest(
            party_a_name=raw["party_a_name"],
            party_b_name=raw["party_b_name"],
            mode=mode,
            valued_items=valued,
        )
    )
    return {
        "scenario_name": raw["scenario_name"],
        "party_a_name": raw["party_a_name"],
        "party_b_name": raw["party_b_name"],
        "country": raw.get("country", "DE"),
        "valued_items": [vi.model_dump() for vi in valued],
        "split": split.model_dump(),
        "warning": warning,
    }


@app.post("/api/value", response_model=ValueResponse)
async def value_items_endpoint(req: ValueRequest) -> ValueResponse:
    valuations, warning, budget = await _value_items(req.items, country=req.country, mode=req.mode)
    return ValueResponse(valuations=valuations, warning=warning, budget=budget)


@app.get("/api/idealo/status")
async def idealo_status() -> dict:
    """Live-mode flag, login presence and today's call budget. Never touches the network."""
    return {
        "live_enabled": live_enabled(),
        "logged_in": tokens_present(default_token_path()),
        **get_budget().snapshot(),
    }


@app.post("/api/reapply-depreciation", response_model=ItemValuation)
async def reapply_depreciation(req: RevalueSingleRequest) -> ItemValuation:
    """Recalculate only depreciation and fair value after a slider/condition edit (0 MCP calls).

    Offer count, scarcity, friction and the deal flag stay exactly as idealo reported them.
    """
    v = req.valuation
    factor, explanation = compute_depreciation(
        purchase_year=req.item.purchase_year,
        condition=req.item.condition,
        override=req.item.depreciation_override,
    )
    return v.model_copy(
        update={
            "depreciation_factor": factor,
            "depreciation_explanation": explanation,
            "fair_value_eur": round(v.trusted_market_price_eur * factor, 2),
        }
    )


@app.post("/api/solve", response_model=SplitResult)
async def solve_endpoint(req: SplitRequest) -> SplitResult:
    """Deterministic solver only — interactive actions never wait on an LLM."""
    return solve_split(req)


@app.post("/api/summary")
async def summary_endpoint(result: SplitResult) -> dict[str, str]:
    """Optional LLM polish of the mediator summary, fetched in the background by the UI."""
    return {"summary": await generate_mediator_summary(result)}


@app.post("/api/parse")
async def parse_endpoint(req: ParseRequest) -> dict:
    items = await parse_messy_inventory(
        req.raw_text, party_a_name=req.party_a_name, party_b_name=req.party_b_name
    )
    return {"items": [i.model_dump() for i in items]}


LIVE_ITEM_CAP = 10  # uncached items looked up live per action
CONNECT_COST = 2  # initialize + list_tools
LOOKUP_COST = 4  # search + details + offers + history

NOTE_LIVE_OFF = "live mode off"
NOTE_NOT_CACHED = "not cached yet"
NOTE_LOGIN = "login required"
NOTE_BUDGET = "daily idealo budget reached"
NOTE_SKIPPED = "skipped: per-action limit"
NOTE_ERROR = "idealo error"
NOTE_SLOW = "idealo slow"
NOTE_NOT_FOUND = "idealo found no match"


def live_enabled() -> bool:
    return os.getenv("IDEALO_LIVE_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


def _make_client(country: str) -> IdealoMCPClient:
    return IdealoMCPClient(country=country, interactive=False)


class _StopLive(Exception):
    def __init__(self, note: str) -> None:
        super().__init__(note)
        self.note = note


def _summarize_notes(valuations: list[ItemValuation]) -> str | None:
    counts = Counter(v.source_note for v in valuations if v.source_note)
    if not counts:
        return None
    parts = ", ".join(f"{n} × {note}" for note, n in counts.items())
    total = sum(counts.values())
    noun = "item uses" if total == 1 else "items use"
    return f"{total} {noun} placeholder prices ({parts})."


async def _value_items(
    items: list[HouseholdItemInput],
    *,
    country: str = "DE",
    mode: Literal["cache_only", "live_or_cache", "fallback"] = "cache_only",
) -> tuple[list[ItemValuation], str | None, dict]:
    """Value each item independently: cache -> live (only if allowed) -> labelled placeholder.

    Live idealo calls happen only when live mode is enabled, a login exists, the budget
    covers a connection plus one lookup, and at most LIVE_ITEM_CAP uncached items per action.
    """
    fallback: dict[str, ItemValuation] = {}

    def placeholder(item: HouseholdItemInput, note: str) -> ItemValuation:
        if not fallback:
            fallback.update({v.item_id: v for v in build_demo_fallback_valuations(items)})
        return fallback[item.id].model_copy(update={"source_note": note})

    if mode == "fallback":
        return [placeholder(i, "offline demo fallback") for i in items], "Showing sample prices. idealo was not asked.", get_budget().snapshot()

    client = _make_client(country)
    results: list[ItemValuation | None] = [None] * len(items)
    pending: list[int] = []
    for idx, item in enumerate(items):
        status, val = client.lookup_cached(item)
        if status == "found":
            results[idx] = val
        elif status == "not_found":
            results[idx] = placeholder(item, NOTE_NOT_FOUND)
        elif status == "error":
            results[idx] = placeholder(item, NOTE_ERROR)
        else:
            pending.append(idx)

    if pending:
        gate_note = None
        if mode == "cache_only":
            gate_note = NOTE_NOT_CACHED
        elif not live_enabled():
            gate_note = NOTE_LIVE_OFF
        elif not client.has_login():
            gate_note = NOTE_LOGIN
        elif client.budget.remaining() < CONNECT_COST + LOOKUP_COST:
            gate_note = NOTE_BUDGET
        if gate_note:
            for idx in pending:
                results[idx] = placeholder(items[idx], gate_note)
        else:
            await _live_lookup(client, items, pending, results, placeholder)

    valuations = [v for v in results if v is not None]
    return valuations, _summarize_notes(valuations), client.budget.snapshot()


async def _live_lookup(
    client: IdealoMCPClient,
    items: list[HouseholdItemInput],
    pending: list[int],
    results: list[ItemValuation | None],
    placeholder: Callable[[HouseholdItemInput, str], ItemValuation],
) -> None:
    to_lookup, skipped = pending[:LIVE_ITEM_CAP], pending[LIVE_ITEM_CAP:]
    for idx in skipped:
        results[idx] = placeholder(items[idx], NOTE_SKIPPED)

    async def run() -> None:
        async with client.connect():
            for idx in to_lookup:
                if client.budget.remaining() < LOOKUP_COST:
                    raise _StopLive(NOTE_BUDGET)
                try:
                    status, val = await client.value_item(items[idx])
                except BudgetExhausted:
                    raise _StopLive(NOTE_BUDGET)
                except Exception:
                    results[idx] = placeholder(items[idx], NOTE_ERROR)
                    raise _StopLive(NOTE_ERROR)
                if status == "found" and val is not None:
                    results[idx] = val
                elif status == "not_found":
                    results[idx] = placeholder(items[idx], NOTE_NOT_FOUND)
                else:
                    results[idx] = placeholder(items[idx], NOTE_ERROR)
                    raise _StopLive(NOTE_ERROR)

    note = None
    deadline = float(os.getenv("IDEALO_LIVE_DEADLINE_SECONDS", "20"))
    try:
        await asyncio.wait_for(run(), timeout=deadline)
    except TimeoutError:
        note = NOTE_SLOW
    except Exception as exc:  # includes ExceptionGroups raised by the MCP transport
        stop = find_exception(exc, _StopLive)
        if stop is not None:
            note = stop.note
        elif find_exception(exc, BudgetExhausted) is not None:
            note = NOTE_BUDGET
        elif is_login_required(exc):
            note = NOTE_LOGIN
        else:
            note = NOTE_ERROR
    for idx in to_lookup:
        if results[idx] is None:
            results[idx] = placeholder(items[idx], note or NOTE_ERROR)
