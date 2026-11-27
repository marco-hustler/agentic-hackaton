"""Isolated LLM tasks (messy text parsing + calm mediator summary) with deterministic fallbacks."""

from __future__ import annotations

import json
import re
import secrets
from datetime import datetime
from typing import Any

from cleanbreak.llm.client import AgnosticLLMClient
from cleanbreak.models import HouseholdItemInput, SplitResult

_VALID_CONDITIONS = {"like_new", "good", "fair", "worn"}
_VALID_OWNERSHIPS = {"shared", "party_a", "party_b"}
_STANDARD_CATEGORIES = (
    "Kitchen, Audio, Entertainment, Home Appliances, Furniture, Sports & Outdoor, Electronics, General"
)


def _strip_json_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _coerce_llm_item(raw: Any, idx: int, current_year: int) -> HouseholdItemInput | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or "").strip()
    if not name:
        return None

    search_query = str(raw.get("search_query") or name).strip() or name
    category = str(raw.get("category") or "General").strip() or "General"

    try:
        year = int(raw.get("purchase_year", current_year - 2))
        if not (1990 <= year <= current_year + 1):
            year = max(2020, current_year - 2)
    except (TypeError, ValueError):
        year = max(2020, current_year - 2)

    condition = str(raw.get("condition") or "good").strip().lower().replace(" ", "_")
    if condition not in _VALID_CONDITIONS:
        condition = "good"

    ownership = str(raw.get("ownership") or "shared").strip().lower()
    if ownership not in _VALID_OWNERSHIPS:
        ownership = "shared"

    def _pts(val: Any) -> int:
        try:
            return max(0, min(100, int(round(float(val)))))
        except (TypeError, ValueError):
            return 15

    est_price: float | None = None
    raw_est = raw.get("estimated_price_eur")
    if raw_est is not None:
        try:
            parsed_est = float(raw_est)
            if parsed_est > 0:
                est_price = round(parsed_est, 2)
        except (TypeError, ValueError):
            est_price = None

    willing = raw.get("willing_to_sell")
    willing_bool = willing if isinstance(willing, bool) else True

    return HouseholdItemInput(
        id=str(raw.get("id") or f"item_{idx}"),
        name=name,
        search_query=search_query,
        category=category,
        purchase_year=year,
        condition=condition,  # type: ignore[arg-type]
        ownership=ownership,  # type: ignore[arg-type]
        party_a_points=_pts(raw.get("party_a_points", 15)),
        party_b_points=_pts(raw.get("party_b_points", 15)),
        willing_to_sell=willing_bool,
        estimated_price_eur=est_price,
        notes=str(raw.get("notes") or "").strip(),
    )


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
    current_year = datetime.now().year
    if client.is_configured:
        you_hint = (
            "Also map first-person references ('I', 'me', 'my', 'mine') to party_a. "
            if party_a_name.strip().lower() == "you"
            else ""
        )
        system = (
            f"You convert messy household inventory notes (chat messages, bullet lists, prose) into structured JSON "
            f"for a fair household split calculator. Today's year is {current_year}. "
            'Return ONLY a JSON object: {"items": [{"id": str, "name": str, "search_query": str, '
            '"category": str, "purchase_year": int, "condition": "like_new"|"good"|"fair"|"worn", '
            '"ownership": "shared"|"party_a"|"party_b", "party_a_points": int, "party_b_points": int, '
            '"willing_to_sell": bool, "estimated_price_eur": number|null, "notes": str}]}. '
            "Rules:\n"
            "- Make `search_query` concise and idealo.de catalog-friendly (brand + model, or closest current equivalent if discontinued).\n"
            f"- Pick `category` from: {_STANDARD_CATEGORIES}.\n"
            f"- Convert relative ages (e.g. 'last year', '2 years old') into an integer `purchase_year` using {current_year}.\n"
            f"- Map {party_a_name} -> party_a and {party_b_name} -> party_b; {you_hint}default ownership is shared.\n"
            "- Set `party_a_points` and `party_b_points` between 5 and 35 reflecting how strongly each person wants the item (default 15 each).\n"
            "- Set `estimated_price_eur` ONLY if the user explicitly mentions a euro price/value; otherwise null."
        )
        raw_json = await client.complete(
            system_prompt=system,
            user_prompt=raw_text,
            json_mode=True,
            temperature=0.1,
        )
        if raw_json:
            try:
                parsed = json.loads(_strip_json_fences(raw_json))
                items_data = parsed.get("items", []) if isinstance(parsed, dict) else parsed
                if isinstance(items_data, list) and items_data:
                    coerced = [
                        item
                        for idx, raw_item in enumerate(items_data, start=1)
                        if (item := _coerce_llm_item(raw_item, idx, current_year)) is not None
                    ]
                    if coerced:
                        return _with_unique_ids(coerced)
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

        price_match = re.search(r"(?:€\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b))", chunk, re.I)
        estimated_price: float | None = None
        if price_match:
            raw_num = (price_match.group(1) or price_match.group(2) or "").replace(",", ".")
            try:
                val = float(raw_num)
                if val > 0:
                    estimated_price = round(val, 2)
            except ValueError:
                estimated_price = None

        lower = chunk.lower()
        if (party_a_name.lower() in lower or re.search(r"\bi\s+paid\b", lower)) and "paid" in lower:
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

        # The product is the text before the first comma or the first ownership/condition word.
        product = re.sub(r"\([^)]*\)", "", chunk).split(",", 1)[0]
        product = re.sub(r"~?\s*(?:€\s*\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*(?:€|eur\b))", "", product, flags=re.I)
        meta = re.compile(
            r"\b(from|bought|paid|worth|shared|50/50|like new|worn|beat|%s|%s)\b"
            % (re.escape(party_a_name), re.escape(party_b_name)),
            re.I,
        )
        if (m := meta.search(product)) is not None:
            product = product[: m.start()]
        product = re.sub(r"\b(201\d|202\d)\b", "", product)
        product = re.sub(r"^((our|my|the|old)\s+)+", "", product.strip(), flags=re.I)
        clean_name = re.sub(r"\s+", " ", product).strip(" ,.-~") or chunk

        slug = _slugify(clean_name, default=f"item_{idx}")
        items.append(
            HouseholdItemInput(
                id=f"{slug}_{idx}",
                name=clean_name,
                search_query=clean_name,
                purchase_year=purchase_year,
                condition=condition,  # type: ignore[arg-type]
                ownership=ownership,  # type: ignore[arg-type]
                party_a_points=15,
                party_b_points=15,
                estimated_price_eur=estimated_price,
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
        "You are a calm, neutral household mediator. Write 2 to 3 short, plain-English sentences explaining "
        "why this split is fair based strictly on the provided idealo-grounded numbers. "
        "Do NOT change any euro amounts or invent items. If party_a is 'You', address them naturally in second person "
        "(e.g. 'You keep...', 'You pay...')."
    )
    user = json.dumps(
        {
            "mode": result.mode,
            "party_a": result.party_a_name,
            "party_b": result.party_b_name,
            "total_fair_eur": result.total_fair_value_eur,
            "entitled_a_eur": result.party_a_entitled_eur,
            "entitled_b_eur": result.party_b_entitled_eur,
            "goods_a_eur": result.party_a_received_goods_eur,
            "goods_b_eur": result.party_b_received_goods_eur,
            "sell_pool_eur": result.sell_pool_eur,
            "cash_summary": result.cash_transfer_summary,
            "fairness_score_pct": result.fairness_score_pct,
            "is_envy_free": result.is_envy_free,
            "contested_items": [a.item_name for a in result.assignments if a.is_contested],
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
