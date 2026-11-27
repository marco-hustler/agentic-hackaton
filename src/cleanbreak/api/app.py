"""FastAPI application for CleanBreak."""

from __future__ import annotations

import asyncio
import json
import os
from collections import Counter
from pathlib import Path
from typing import Callable, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from cleanbreak.idealo.auth import default_token_path, find_exception, is_login_required, tokens_present
from cleanbreak.idealo.budget import BudgetExhausted, get_budget
from cleanbreak.idealo.catalog import (
    CatalogHit,
    load_catalog,
    search_catalog,
    valued_item_from_hit,
    valued_item_from_manual,
)
from cleanbreak.idealo.client import IdealoMCPClient
from cleanbreak.llm.client import AgnosticLLMClient, LLMConfig
from cleanbreak.llm.item_draft import (
    ItemDraftTurnRequest,
    ItemDraftTurnResponse,
    ManualItemCreate,
    run_item_draft_turn,
)
from cleanbreak.llm.tasks import generate_mediator_summary, parse_messy_inventory
from cleanbreak.db.processes import get_process_store
from cleanbreak.models import (
    AccountInfo,
    HouseholdItemInput,
    ItemValuation,
    ProcessCreate,
    ProcessInventory,
    ProcessStatusUpdate,
    ProcessSummary,
    SplitMode,
    SplitRequest,
    SplitResult,
    ValuedItem,
)
from cleanbreak.paths import REPO_ROOT
from cleanbreak.solver.optimizer import agent_split, solve_split
from cleanbreak.valuation.engine import build_demo_fallback_valuations, compute_depreciation

load_dotenv()

DEMO_PATH = REPO_ROOT / "data" / "demo_berlin_wg.json"


def demo_seed_enabled() -> bool:
    """New houses start with the Berlin WG demo items only when DEMO_SEED_ENABLED is on (off by default)."""
    return os.getenv("DEMO_SEED_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}

FRONTEND_DIR = REPO_ROOT / "frontend"
DIST_DIR = FRONTEND_DIR / "dist"

app = FastAPI(title="CleanBreak — Fair Household Split (idealo MCP)", version="0.1.0")

# Vite dev server (React) talks to this API cross-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if (DIST_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="vite-assets")


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


def _dist_index() -> Path | None:
    path = DIST_DIR / "index.html"
    return path if path.is_file() else None


@app.get("/")
async def index() -> FileResponse:
    """Serve the React production build (`make build`)."""
    dist = _dist_index()
    if dist is not None:
        return FileResponse(dist)
    pointer = FRONTEND_DIR / "dev-pointer.html"
    if pointer.is_file():
        return FileResponse(pointer)
    raise HTTPException(
        status_code=503,
        detail="Frontend not built. Run: make build",
    )


@app.get("/favicon.svg", include_in_schema=False)
@app.get("/icons.svg", include_in_schema=False)
async def vite_public_file(request: Request) -> FileResponse:
    """Vite puts a few assets next to index.html (not under /assets)."""
    name = request.url.path.lstrip("/")
    path = DIST_DIR / name
    if path.is_file():
        return FileResponse(path)
    raise HTTPException(status_code=404)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "cleanbreak"}


@app.get("/api/me", response_model=AccountInfo)
async def get_me() -> AccountInfo:
    """Stub account for the header. Real auth is out of scope for the MVP."""
    return AccountInfo()


@app.get("/api/processes", response_model=list[ProcessSummary])
async def list_processes() -> list[ProcessSummary]:
    return get_process_store().list_processes()


@app.post("/api/processes", response_model=ProcessSummary, status_code=201)
async def create_process(payload: ProcessCreate) -> ProcessSummary:
    """New houses start with an empty inventory; DEMO_SEED_ENABLED fills it with the demo items instead."""
    store = get_process_store()
    created = store.create_process(payload)
    if demo_seed_enabled():
        valued, _ = await _demo_valued_items()
        store.save_inventory(created.id, ProcessInventory(valued_items=valued))
    return created


@app.get("/api/processes/{process_id}", response_model=ProcessSummary)
async def get_process(process_id: str) -> ProcessSummary:
    process = get_process_store().get_process(process_id)
    if process is None:
        raise HTTPException(status_code=404, detail="Process not found")
    return process


@app.patch("/api/processes/{process_id}", response_model=ProcessSummary)
async def patch_process(process_id: str, payload: ProcessStatusUpdate) -> ProcessSummary:
    if payload.status is None and payload.participant_emails is None:
        raise HTTPException(status_code=422, detail="Nothing to update")
    updated = get_process_store().update_process(
        process_id,
        status=payload.status,
        participant_emails=payload.participant_emails,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Process not found")
    return updated


async def _demo_valued_items(raw: dict | None = None) -> tuple[list[ValuedItem], str | None]:
    """Demo items valued from the idealo cache only (never live), with transparent fallback."""
    raw = raw or json.loads(DEMO_PATH.read_text(encoding="utf-8"))
    items = [HouseholdItemInput.model_validate(i) for i in raw["items"]]
    valuations, warning, _ = await _value_items(items, country=raw.get("country", "DE"), mode="cache_only")
    return [ValuedItem(item=item, valuation=val) for item, val in zip(items, valuations)], warning


@app.get("/api/processes/{process_id}/inventory", response_model=ProcessInventory)
async def get_process_inventory(process_id: str) -> ProcessInventory:
    """A house's own inventory. New processes start empty; each process is independent.

    Optional DEMO_SEED_ENABLED still fills a *missing* inventory from the Berlin WG demo
    (idealo cache only). Processes created with an empty row are never overwritten.
    """
    store = get_process_store()
    if store.get_process(process_id) is None:
        raise HTTPException(status_code=404, detail="Process not found")
    saved = store.get_inventory(process_id)
    if saved is not None:
        return saved
    if demo_seed_enabled():
        valued, _ = await _demo_valued_items()
        seeded = store.save_inventory(process_id, ProcessInventory(valued_items=valued))
        assert seeded is not None
        return seeded
    seeded = store.save_inventory(process_id, ProcessInventory(valued_items=[]))
    assert seeded is not None
    return seeded


@app.put("/api/processes/{process_id}/inventory", response_model=ProcessInventory)
async def put_process_inventory(process_id: str, payload: ProcessInventory) -> ProcessInventory:
    """Save a house's items (edits, locks, priorities, depreciation) and solver mode."""
    saved = get_process_store().save_inventory(process_id, payload)
    if saved is None:
        raise HTTPException(status_code=404, detail="Process not found")
    return saved


@app.get("/api/demo")
async def get_demo_scenario(mode: SplitMode = "balanced") -> dict:
    """Return the preloaded Berlin WG scenario, valuations (cached idealo if present, else fallback), and solved split."""
    raw = json.loads(DEMO_PATH.read_text(encoding="utf-8"))
    valued, warning = await _demo_valued_items(raw)

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
async def value_items_endpoint(req: ValueRequest, request: Request) -> ValueResponse:
    valuations, warning, budget = await _value_items(
        req.items,
        country=req.country,
        mode=req.mode,
        access_token=_session_idealo_token(request),
    )
    return ValueResponse(valuations=valuations, warning=warning, budget=budget)


@app.get("/api/catalog/search", response_model=list[CatalogHit])
async def catalog_search(q: str = "", limit: int = 24) -> list[CatalogHit]:
    """Search products from cached idealo searches (0 MCP calls)."""
    return search_catalog(q, load_catalog(), limit=max(1, min(limit, 60)))


@app.post("/api/catalog/item", response_model=ValuedItem)
async def catalog_item(hit: CatalogHit) -> ValuedItem:
    """A new house item for a catalog hit, valued at its cached idealo price (0 MCP calls)."""
    return valued_item_from_hit(hit)


def _header_map(request: Request) -> dict[str, str]:
    return {k: v for k, v in request.headers.items()}


def _session_idealo_token(request: Request | None) -> str | None:
    if request is None:
        return None
    token = (request.headers.get("x-idealo-access-token") or "").strip()
    return token or None


@app.get("/api/idealo/status")
async def idealo_status(request: Request) -> dict:
    """Live-mode flag, login presence and today's call budget. Never touches the network."""
    session_token = _session_idealo_token(request)
    return {
        "live_enabled": live_enabled(),
        "logged_in": bool(session_token) or tokens_present(default_token_path()),
        **get_budget().snapshot(),
    }


@app.get("/api/llm/status")
async def llm_status(request: Request) -> dict:
    """Whether an LLM provider is configured (session headers or server env)."""
    cfg = LLMConfig.resolve(_header_map(request))
    return {
        "configured": cfg.is_configured,
        "model": cfg.model if cfg.is_configured else None,
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


@app.post("/api/solve/agent", response_model=SplitResult)
async def solve_agent_endpoint(req: SplitRequest) -> SplitResult:
    """The split agent picks the strategy (the request's mode is ignored)."""
    return agent_split(req)


@app.post("/api/summary")
async def summary_endpoint(result: SplitResult, request: Request) -> dict[str, str]:
    """Optional LLM polish of the mediator summary, fetched in the background by the UI."""
    llm = AgnosticLLMClient(LLMConfig.resolve(_header_map(request)))
    return {"summary": await generate_mediator_summary(result, llm=llm)}


@app.post("/api/parse")
async def parse_endpoint(req: ParseRequest, request: Request) -> dict:
    llm = AgnosticLLMClient(LLMConfig.resolve(_header_map(request)))
    items = await parse_messy_inventory(
        req.raw_text, party_a_name=req.party_a_name, party_b_name=req.party_b_name, llm=llm
    )
    return {"items": [i.model_dump() for i in items]}


@app.post("/api/items/draft", response_model=ItemDraftTurnResponse)
async def item_draft_turn(req: ItemDraftTurnRequest, request: Request) -> ItemDraftTurnResponse:
    """Conversational AI object drafting: asks until every required field is present.

    Requires a configured LLM (session keys or server env). Guardrails reject prompt injection
    and off-topic requests; never materialises an item until status=ready.
    """
    client = AgnosticLLMClient(LLMConfig.resolve(_header_map(request)))
    if not client.is_configured:
        raise HTTPException(
            status_code=503,
            detail="AI is not configured. Open Account → Configure AI keys, or set LLM_MODEL + API key on the server.",
        )
    return await run_item_draft_turn(req, llm=client)


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


def _idealo_create_error(note: str | None) -> str:
    """Human-readable reason when create cannot use a real idealo valuation."""
    mapping = {
        NOTE_LIVE_OFF: "idealo live lookups are off. Set IDEALO_LIVE_ENABLED=true, or use a product already in the cache.",
        NOTE_NOT_CACHED: "No cached idealo match for this product. Enable live mode (IDEALO_LIVE_ENABLED) or pick a cached catalog item.",
        NOTE_LOGIN: "Sign in to idealo MCP first (Account → Authenticate with Idealo), then try again.",
        NOTE_BUDGET: "Daily idealo call budget reached. Try again tomorrow or use a cached product.",
        NOTE_NOT_FOUND: "idealo found no match for that product. Try a clearer name or brand + model.",
        NOTE_ERROR: "idealo MCP failed while looking up this product. Try again in a moment.",
        NOTE_SLOW: "idealo MCP was too slow. Try again in a moment.",
        NOTE_SKIPPED: "idealo lookup was skipped (per-action limit).",
    }
    return mapping.get(note or "", "Could not value this product on idealo. Try again.")


@app.post("/api/items/manual", response_model=ValuedItem)
async def create_manual_item(req: ManualItemCreate, request: Request) -> ValuedItem:
    """Look up the product on idealo first. Only create/return an item when valuation succeeds.

    On cache miss / login / budget / not-found / MCP error → 502 and nothing is created.
    """
    base = valued_item_from_manual(
        name=req.name,
        price_eur=req.price_eur,
        purchase_year=req.purchase_year,
        condition=req.condition,
        category=req.category,
        importance=req.importance,
        notes=req.notes,
    )
    try:
        valuations, _, _ = await _value_items(
            [base.item],
            mode="live_or_cache",
            access_token=_session_idealo_token(request),
        )
    except Exception:
        raise HTTPException(status_code=502, detail=_idealo_create_error(NOTE_ERROR)) from None
    if not valuations:
        raise HTTPException(status_code=502, detail=_idealo_create_error(NOTE_ERROR))
    val = valuations[0]
    if val.data_source not in ("idealo_cached", "idealo_live"):
        raise HTTPException(status_code=502, detail=_idealo_create_error(val.source_note))
    return ValuedItem(item=base.item, valuation=val)


def live_enabled() -> bool:
    return os.getenv("IDEALO_LIVE_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


def _make_client(country: str, *, access_token: str | None = None) -> IdealoMCPClient:
    return IdealoMCPClient(country=country, interactive=False, access_token=access_token)


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
    access_token: str | None = None,
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

    client = _make_client(country, access_token=access_token)
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
