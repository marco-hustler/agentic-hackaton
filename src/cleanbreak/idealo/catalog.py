"""Offline product catalog built from cached idealo `search_products` answers.

Searching it costs 0 MCP calls: it only reads the JSON files the cache already holds.
Adding a hit turns its search price into a valuation (no offers or history yet).
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel

from cleanbreak.models import HouseholdItemInput, ValuedItem
from cleanbreak.paths import resolve_repo_path
from cleanbreak.valuation.engine import assess_scarcity, build_valuation

class CatalogHit(BaseModel):
    product_ref: str
    name: str
    variant: str = ""
    price_eur: float
    image_url: str | None = None
    url: str | None = None
    offer_count: int = 0
    rating: float | None = None
    review_count: int = 0
    category: str = "General"


def parse_price(text: str | None) -> float | None:
    """'1.119,00 €' -> 1119.0 (idealo DE formatting)."""
    if not text:
        return None
    digits = re.sub(r"[^\d,.]", "", text).replace(".", "").replace(",", ".")
    try:
        return float(digits)
    except ValueError:
        return None


def _demo_categories(demo_path: Path) -> dict[str, str]:
    try:
        raw = json.loads(demo_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {i.get("search_query", "").lower(): i.get("category", "General") for i in raw.get("items", [])}


def hits_from_search_payload(data: dict, *, default_category: str = "General") -> list[CatalogHit]:
    """Normalize raw idealo `search_products` payload into CatalogHit objects."""
    hits: dict[str, CatalogHit] = {}
    avail = data.get("availableCategories")
    inferred_cat = default_category
    if isinstance(avail, list) and avail and isinstance(avail[0], dict):
        cat_name = str(avail[0].get("name") or avail[0].get("label") or "").strip()
        if cat_name:
            inferred_cat = cat_name

    for r in data.get("results") or []:
        if not isinstance(r, dict):
            continue
        ref, price = r.get("productRef"), parse_price(r.get("price"))
        if not ref or price is None or ref in hits:
            continue
        reviews = r.get("userReviewsSummary") or {}
        hits[ref] = CatalogHit(
            product_ref=str(ref),
            name=str(r.get("name") or "").strip(),
            variant=str(r.get("nameDelta") or "").strip(),
            price_eur=price,
            image_url=r.get("imageUrl"),
            url=r.get("url"),
            offer_count=int(r.get("totalOfferCount") or 0),
            rating=reviews.get("averageRating"),
            review_count=int(reviews.get("totalReviewCount") or 0),
            category=default_category if default_category != "General" else inferred_cat,
        )
    return list(hits.values())


def load_catalog(cache_dir: str | Path = "data/cache", demo_path: str | Path = "data/demo_berlin_wg.json") -> list[CatalogHit]:
    """Every distinct product found in cached searches, with the query that found it."""
    categories = _demo_categories(resolve_repo_path(demo_path))
    hits: dict[str, CatalogHit] = {}
    for path in sorted(resolve_repo_path(cache_dir).glob("search_products_*.json")):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        data = record.get("data") or {}
        query = str((record.get("request") or {}).get("query") or data.get("query") or "")
        category = categories.get(query.lower(), "General")
        for hit in hits_from_search_payload(data, default_category=category):
            if hit.product_ref not in hits:
                hits[hit.product_ref] = hit
    return list(hits.values())


def search_catalog(query: str, catalog: list[CatalogHit], limit: int = 24) -> list[CatalogHit]:
    """All query words must appear in the name, variant or category; name matches rank first."""
    words = [w for w in query.lower().split() if w]
    if not words:
        return []

    def score(h: CatalogHit) -> tuple[int, float] | None:
        name = h.name.lower()
        hay = f"{name} {h.variant.lower()} {h.category.lower()}"
        if not all(w in hay for w in words):
            return None
        in_name = sum(w in name for w in words)
        return (-in_name, h.price_eur)

    scored = [(s, h) for h in catalog if (s := score(h)) is not None]
    scored.sort(key=lambda x: x[0])
    return [h for _, h in scored[:limit]]


def valued_item_from_hit(hit: CatalogHit, *, current_year: int | None = None) -> ValuedItem:
    """A new shared house item valued at the cached idealo search price."""
    year = current_year or datetime.now().year
    title = f"{hit.name} {hit.variant}".strip()
    item = HouseholdItemInput(
        id="item-" + hashlib.sha1(f"{hit.product_ref}:{datetime.now().isoformat()}".encode()).hexdigest()[:10],
        name=title,
        search_query=hit.name,
        category=hit.category,
        purchase_year=year,
    )
    scarcity, friction = assess_scarcity(hit.offer_count)
    valuation = build_valuation(
        item,
        matched_title=title,
        offers=[],
        fallback_price_eur=hit.price_eur,
        product_ref=hit.product_ref,
        product_url=hit.url,
        image_url=hit.image_url,
        data_source="idealo_cached",
        current_year=year,
    ).model_copy(
        update={
            "offer_count": hit.offer_count,
            "scarcity_level": scarcity,
            "replacement_friction": friction,
        }
    )
    return ValuedItem(item=item, valuation=valuation)


def valued_item_from_manual(
    *,
    name: str,
    price_eur: float,
    purchase_year: int,
    condition: str = "good",
    category: str = "General",
    importance: int = 5,
    notes: str = "",
    current_year: int | None = None,
) -> ValuedItem:
    """Build a ValuedItem from explicit user fields (static form or confirmed AI draft)."""
    year = current_year or datetime.now().year
    points = max(1, min(100, int(importance) * 10))
    item_id = "item-" + hashlib.sha1(f"manual:{name}:{datetime.now().isoformat()}".encode()).hexdigest()[:10]
    item = HouseholdItemInput(
        id=item_id,
        name=name.strip(),
        search_query=name.strip(),
        category=(category or "General").strip() or "General",
        purchase_year=purchase_year,
        condition=condition,  # type: ignore[arg-type]
        party_a_points=points,
        party_b_points=points,
        notes=notes.strip(),
    )
    valuation = build_valuation(
        item,
        matched_title=name.strip(),
        offers=[],
        fallback_price_eur=max(0.0, float(price_eur)),
        data_source="demo_fallback",
        current_year=year,
    ).model_copy(update={"source_note": "manual entry"})
    return ValuedItem(item=item, valuation=valuation)
