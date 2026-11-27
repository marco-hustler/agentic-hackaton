"""FastAPI application for CleanBreak."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from cleanbreak.llm.tasks import generate_mediator_summary, parse_messy_inventory
from cleanbreak.models import (
    HouseholdItemInput,
    ItemValuation,
    SplitMode,
    SplitRequest,
    SplitResult,
    ValuedItem,
)
from cleanbreak.solver.optimizer import solve_split
from cleanbreak.valuation.engine import build_demo_fallback_valuations, compute_depreciation

load_dotenv()

REPO_ROOT = Path(__file__).resolve().parents[3]
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
    valuations, warning = await _value_items(items, country=raw.get("country", "DE"), mode="cache_only")
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
    valuations, warning = await _value_items(req.items, country=req.country, mode=req.mode)
    return ValueResponse(valuations=valuations, warning=warning)


@app.post("/api/reapply-depreciation", response_model=ItemValuation)
async def reapply_depreciation(req: RevalueSingleRequest) -> ItemValuation:
    """Recalculate fair_value_eur after the user moves the slider (0 MCP calls)."""
    v = req.valuation
    factor, explanation = compute_depreciation(
        purchase_year=req.item.purchase_year,
        condition=req.item.condition,
        override=req.item.depreciation_override,
    )
    # Only the depreciation changes. top_offers holds 5 offers, so rebuilding from it
    # would shrink offer_count and shift the trusted price.
    return v.model_copy(
        update={
            "depreciation_factor": factor,
            "depreciation_explanation": explanation,
            "fair_value_eur": round(v.trusted_market_price_eur * factor, 2),
        }
    )


@app.post("/api/solve", response_model=SplitResult)
async def solve_endpoint(req: SplitRequest) -> SplitResult:
    result = solve_split(req)
    result.mediator_summary = await generate_mediator_summary(result)
    return result


@app.post("/api/parse")
async def parse_endpoint(req: ParseRequest) -> dict:
    items = await parse_messy_inventory(
        req.raw_text, party_a_name=req.party_a_name, party_b_name=req.party_b_name
    )
    return {"items": [i.model_dump() for i in items]}


async def _value_items(
    items: list[HouseholdItemInput],
    *,
    country: str = "DE",
    mode: Literal["cache_only", "live_or_cache", "fallback"] = "cache_only",
) -> tuple[list[ItemValuation], str | None]:
    if mode == "fallback":
        return build_demo_fallback_valuations(items), "Showing sample prices. idealo was not asked."

    try:
        from cleanbreak.idealo.client import IdealoMCPClient

        client = IdealoMCPClient(country=country)
        valuations: list[ItemValuation] = []
        missing_live = False

        if mode == "cache_only":
            fallback_map = {v.item_id: v for v in build_demo_fallback_valuations(items)}
            for item in items:
                cached = client.value_item_from_cache(item)
                if cached is not None:
                    valuations.append(cached)
                else:
                    missing_live = True
                    valuations.append(fallback_map[item.id])
            warning = (
                "Some items use sample prices because idealo has not been asked about them yet. "
                "Use Refresh from idealo to get real prices."
                if missing_live
                else None
            )
            return valuations, warning

        # live_or_cache
        async with client.connect():
            for item in items:
                valuations.append(await client.value_item(item))
        return valuations, None
    except Exception as exc:
        return (
            build_demo_fallback_valuations(items),
            f"Could not reach idealo ({exc}). Showing sample prices.",
        )
