"""Isolated LLM tasks (messy text parsing + calm mediator summary) with deterministic fallbacks."""

from __future__ import annotations

import json
import re
import secrets
from datetime import datetime

from cleanbreak.llm.client import AgnosticLLMClient
from cleanbreak.models import HouseholdItemInput, SplitResult


async def parse_messy_inventory(
    raw_text: str,
    *,
    party_a_name: str = "Alex",
    party_b_name: str = "Sam",
    llm: AgnosticLLMClient | None = None,
) -> list[HouseholdItemInput]:
    """Parse messy notes/WhatsApp text into structured HouseholdItemInput records.

    Uses the configured provider-agnostic LLM when available; otherwise uses a clean
    regex heuristic so live demos work even without an LLM key.
    """
    client = llm or AgnosticLLMClient()
    if client.is_configured:
        system = (
            "You convert messy household inventory notes into JSON for a fair split calculator. "
            "Return ONLY a JSON object: {\"items\": [{\"id\": str, \"name\": str, \"search_query\": str, "
            "\"category\": str, \"purchase_year\": int, \"condition\": \"like_new\"|\"good\"|\"fair\"|\"worn\", "
            "\"ownership\": \"shared\"|\"party_a\"|\"party_b\", \"party_a_points\": int, \"party_b_points\": int}]}. "
            "Make search_query concise and idealo-friendly (brand + model). "
            f"Map {party_a_name} -> party_a and {party_b_name} -> party_b; default ownership is shared."
        )
        raw_json = await client.complete(
            system_prompt=system,
            user_prompt=raw_text,
            json_mode=True,
            temperature=0.1,
        )
        if raw_json:
            try:
                parsed = json.loads(raw_json)
                items_data = parsed.get("items", [])
                if isinstance(items_data, list) and items_data:
                    return _with_unique_ids([HouseholdItemInput.model_validate(item) for item in items_data])
            except Exception:
                pass

    return _with_unique_ids(
        _fallback_parse_inventory(raw_text, party_a_name=party_a_name, party_b_name=party_b_name)
    )


def _slugify(text: str, *, default: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:24] or default


def _with_unique_ids(items: list[HouseholdItemInput]) -> list[HouseholdItemInput]:
    """Server-assigned ids (`<slug>_<6 hex>`): never collide with demo ids or earlier parses."""
    out = []
    for item in items:
        slug = _slugify(item.name or item.id, default="item")
        out.append(item.model_copy(update={"id": f"{slug}_{secrets.token_hex(3)}"}))
    return out


def _fallback_parse_inventory(
    raw_text: str, *, party_a_name: str = "Alex", party_b_name: str = "Sam"
) -> list[HouseholdItemInput]:
    """Deterministic line/comma parser when no LLM key is set."""
    current_year = datetime.now().year
    chunks = [c.strip(" -•*\t") for c in re.split(r"[\n;]+", raw_text) if c.strip(" -•*\t")]
    items: list[HouseholdItemInput] = []

    for idx, chunk in enumerate(chunks, start=1):
        year_match = re.search(r"\b(201\d|202\d)\b", chunk)
        purchase_year = int(year_match.group(1)) if year_match else max(2020, current_year - 2)

        lower = chunk.lower()
        if party_a_name.lower() in lower and "paid" in lower:
            ownership = "party_a"
        elif party_b_name.lower() in lower and "paid" in lower:
            ownership = "party_b"
        else:
            ownership = "shared"

        if "like new" in lower or "new" in lower:
            condition = "like_new"
        elif "old" in lower or "fair" in lower:
            condition = "fair"
        elif "worn" in lower or "beat" in lower:
            condition = "worn"
        else:
            condition = "good"

        # Clean search query by stripping ownership/year parentheticals
        clean_name = re.sub(r"\([^)]*\)", "", chunk).strip(" ,.-")
        clean_query = re.sub(r"\b(from|bought|paid|shared|50/50|201\d|202\d|old|our|my)\b", "", clean_name, flags=re.I)
        clean_query = re.sub(r"\s+", " ", clean_query).strip(" ,.-") or clean_name

        slug = _slugify(clean_name, default=f"item_{idx}")
        items.append(
            HouseholdItemInput(
                id=f"{slug}_{idx}",
                name=clean_name or chunk,
                search_query=clean_query,
                purchase_year=purchase_year,
                condition=condition,  # type: ignore[arg-type]
                ownership=ownership,  # type: ignore[arg-type]
                party_a_points=15,
                party_b_points=15,
            )
        )
    return items


async def generate_mediator_summary(
    result: SplitResult, *, llm: AgnosticLLMClient | None = None
) -> str:
    """Optionally polish the neutral 3-sentence explanation using any configured LLM.

    Never alters a single number — strictly summarizes the deterministic SplitResult.
    """
    client = llm or AgnosticLLMClient()
    if not client.is_configured:
        return result.mediator_summary

    system = (
        "You are a calm, neutral household mediator. Write exactly 3 short sentences explaining "
        "why this split is fair based strictly on the provided idealo-grounded numbers. "
        "Do NOT change any euro amounts or invent items."
    )
    user = json.dumps(
        {
            "party_a": result.party_a_name,
            "party_b": result.party_b_name,
            "total_fair_eur": result.total_fair_value_eur,
            "goods_a_eur": result.party_a_received_goods_eur,
            "goods_b_eur": result.party_b_received_goods_eur,
            "cash_summary": result.cash_transfer_summary,
            "fairness_score_pct": result.fairness_score_pct,
            "arbitrage_deals": [
                {
                    "item": a.item_name,
                    "action": a.action,
                    "buy_new_eur": a.buy_new_price_eur,
                    "note": a.buy_new_savings_note,
                }
                for a in result.arbitrage_highlights
            ],
        },
        ensure_ascii=False,
    )
    text = await client.complete(system_prompt=system, user_prompt=user, temperature=0.3)
    return text.strip() if text else result.mediator_summary
