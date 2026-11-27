"""Async idealo MCP client with OAuth, disk caching, and resilient response parsing."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

import httpx2
from mcp import ClientSession
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client

from cleanbreak.idealo.auth import build_oauth_provider
from cleanbreak.idealo.cache import DiskCache
from cleanbreak.models import (
    DataSourceType,
    HouseholdItemInput,
    IdealoOffer,
    ItemValuation,
    PriceHistoryStats,
)
from cleanbreak.valuation.engine import build_valuation


class IdealoMCPClient:
    """Connects to https://mcp.idealo.com/mcp via Streamable HTTP + OAuth with disk caching."""

    def __init__(
        self,
        *,
        server_url: str | None = None,
        country: str | None = None,
        token_file: str | Path | None = None,
        cache_dir: str | Path | None = None,
        callback_port: int | None = None,
        manual_callback: bool = False,
    ) -> None:
        self.server_url = server_url or os.getenv("IDEALO_MCP_URL", "https://mcp.idealo.com/mcp")
        self.country = (country or os.getenv("IDEALO_COUNTRY", "DE")).upper()
        self.token_file = Path(token_file or os.getenv("IDEALO_TOKEN_FILE", ".idealo_tokens.json"))
        self.cache = DiskCache(cache_dir or os.getenv("IDEALO_CACHE_DIR", "data/cache"))
        self.callback_port = callback_port or int(os.getenv("IDEALO_OAUTH_CALLBACK_PORT", "6274"))
        self.manual_callback = manual_callback
        self._session: ClientSession | None = None
        self._tool_names: set[str] = set()

    @asynccontextmanager
    async def connect(self) -> AsyncIterator["IdealoMCPClient"]:
        auth = build_oauth_provider(
            server_url=self.server_url,
            token_file=self.token_file,
            callback_port=self.callback_port,
            manual_callback=self.manual_callback,
        )
        http_client = create_mcp_http_client(
            auth=auth,
            timeout=httpx2.Timeout(30.0, read=60.0),
        )
        async with http_client:
            async with streamable_http_client(self.server_url, http_client=http_client) as (
                read_stream,
                write_stream,
            ):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    self._session = session
                    tools_res = await session.list_tools()
                    self._tool_names = {t.name for t in tools_res.tools}
                    try:
                        yield self
                    finally:
                        self._session = None

    async def list_tools(self) -> list[dict[str, Any]]:
        if self._session is None:
            raise RuntimeError("Client not connected. Use `async with client.connect():`.")
        res = await self._session.list_tools()
        return [t.model_dump(mode="json") for t in res.tools]

    def _resolve_tool(self, *candidates: str) -> str:
        for name in candidates:
            if name in self._tool_names:
                return name
        return candidates[0]

    async def call_tool_cached(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        *,
        force_refresh: bool = False,
    ) -> tuple[Any, bool]:
        """Call an MCP tool with transparent disk caching. Returns (parsed_payload, from_cache)."""
        if not force_refresh:
            cached = self.cache.get(tool_name, arguments)
            if cached is not None:
                return cached, True

        if self._session is None:
            raise RuntimeError("Client not connected. Use `async with client.connect():`.")

        result = await self._session.call_tool(tool_name, arguments=arguments)
        parsed = _extract_tool_payload(result)
        self.cache.set(tool_name, arguments, parsed)
        return parsed, False

    async def probe_item_raw(
        self,
        query: str,
        *,
        country: str | None = None,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        """Run search -> details/offers -> 30-day price history for one query (~3 MCP calls)."""
        mkt = (country or self.country).upper()
        search_tool = self._resolve_tool("search_products")
        search_args = {"query": query, "country": mkt}
        search_data, search_cached = await self.call_tool_cached(
            search_tool, search_args, force_refresh=force_refresh
        )

        top_product = _pick_first_product(search_data)
        product_ref = _extract_product_ref(top_product) if top_product else None
        item_type = _first_str(top_product, "itemType") if top_product else None

        details_data = None
        offers_data = None
        history_data = None
        all_cached = search_cached

        if product_ref:
            details_tool = self._resolve_tool("get_product_details")
            offers_tool = self._resolve_tool("get_product_offers")
            history_tool = self._resolve_tool("get_product_price_history", "get_price_history")

            base_ref_args: dict[str, Any] = {"productRef": product_ref, "country": mkt}
            if item_type and item_type != "PRODUCT":
                base_ref_args["type"] = item_type

            for label, tname in [
                ("details", details_tool),
                ("offers", offers_tool),
                ("history", history_tool),
            ]:
                if self._tool_names and tname not in self._tool_names:
                    continue
                try:
                    data, from_cache = await self.call_tool_cached(
                        tname,
                        dict(base_ref_args),
                        force_refresh=force_refresh,
                    )
                    all_cached = all_cached and from_cache
                    if label == "details":
                        details_data = data
                    elif label == "offers":
                        offers_data = data
                    else:
                        history_data = data
                except Exception as exc:
                    err_obj = {"_error": str(exc)}
                    if label == "details":
                        details_data = err_obj
                    elif label == "offers":
                        offers_data = err_obj
                    else:
                        history_data = err_obj

        bundle = {
            "query": query,
            "country": mkt,
            "product_ref": product_ref,
            "top_product": top_product,
            "search": search_data,
            "details": details_data,
            "offers": offers_data,
            "price_history": history_data,
            "all_cached": all_cached,
        }
        # Save normalized item bundle in cache so UI can load instantly from cache_only mode!
        self.cache.set("item_bundle", {"query": query, "country": mkt}, bundle)
        return bundle

    def value_item_from_cache(self, item: HouseholdItemInput) -> ItemValuation | None:
        query = (item.search_query or item.name).strip()
        bundle = self.cache.get("item_bundle", {"query": query, "country": self.country})
        if not bundle:
            return None
        return valuation_from_bundle(item, bundle, data_source="idealo_cached")

    async def value_item(
        self, item: HouseholdItemInput, *, force_refresh: bool = False
    ) -> ItemValuation:
        query = (item.search_query or item.name).strip()
        bundle = await self.probe_item_raw(query, country=self.country, force_refresh=force_refresh)
        source: DataSourceType = "idealo_cached" if bundle.get("all_cached") else "idealo_live"
        return valuation_from_bundle(item, bundle, data_source=source)


def valuation_from_bundle(
    item: HouseholdItemInput,
    bundle: dict[str, Any],
    *,
    data_source: DataSourceType = "idealo_live",
) -> ItemValuation:
    """Convert raw idealo MCP responses into a normalized, transparent ItemValuation."""
    top = bundle.get("top_product") or {}
    details = bundle.get("details") if isinstance(bundle.get("details"), dict) else {}
    offers_raw = bundle.get("offers")
    history_raw = bundle.get("price_history")

    matched_title = (
        _first_str(details, "name", "title", "productName")
        or _first_str(top, "name", "title", "productName")
        or item.name
    )
    name_delta = _first_str(details, "nameDelta") or _first_str(top, "nameDelta")
    if name_delta and name_delta.lower() not in matched_title.lower():
        matched_title = f"{matched_title} {name_delta}"

    product_url = (
        _first_str(details, "productDetailsUrl", "url", "productUrl")
        or _first_str(top, "url", "productUrl")
    )
    image_urls = details.get("imageUrls") if isinstance(details.get("imageUrls"), list) else []
    image_url = (image_urls[0] if image_urls else None) or _first_str(top, "imageUrl", "image")

    search_data = bundle.get("search") if isinstance(bundle.get("search"), dict) else {}
    avail_cats = search_data.get("availableCategories")
    category_label = _extract_first_category(avail_cats) or item.category
    test_grade = _extract_test_grade(details) or _extract_test_grade(top)

    offers = _normalize_offers(offers_raw) or _normalize_offers(details.get("offers"))
    fallback_price = (
        _to_float(top.get("price"))
        or _to_float(top.get("minPrice"))
        or 0.0
    )

    price_history = _normalize_price_history(history_raw)
    if price_history is None and details.get("priceTrend"):
        price_history = _normalize_price_history({"priceTrend": details["priceTrend"]})

    is_substitute = "discontinued" in item.name.lower() or "old " in item.name.lower()
    substitute_reason = (
        f"This model is no longer sold, so it is priced like the closest match on idealo: {matched_title}."
        if is_substitute
        else None
    )

    val = build_valuation(
        item,
        matched_title=matched_title,
        offers=offers,
        price_history=price_history,
        fallback_price_eur=fallback_price,
        product_ref=bundle.get("product_ref"),
        product_url=product_url,
        image_url=image_url,
        is_substitute=is_substitute,
        substitute_reason=substitute_reason,
        category_label=category_label,
        test_grade=test_grade,
        data_source=data_source,
    )

    # Search result exposes full `totalOfferCount` even when Trial tier caps paginated offers at 5-10.
    total_offers = top.get("totalOfferCount")
    if isinstance(total_offers, (int, float)) and int(total_offers) > val.offer_count:
        from cleanbreak.valuation.engine import assess_buy_new_deal, assess_scarcity

        val.offer_count = int(total_offers)
        scarcity, friction = assess_scarcity(val.offer_count)
        val.scarcity_level = scarcity  # type: ignore[assignment]
        val.replacement_friction = friction
        is_deal, pct, headline = assess_buy_new_deal(
            val.trusted_market_price_eur, val.lowest_offer_eur, val.price_history, val.offer_count
        )
        val.is_buy_new_deal = is_deal
        val.deal_discount_pct = pct
        val.deal_headline = headline

    return val


def _extract_tool_payload(result: Any) -> Any:
    """Extract JSON payload from MCP CallToolResult (handles v2 snake_case or camelCase)."""
    structured = getattr(result, "structured_content", None)
    if structured is None:
        structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return structured

    content = getattr(result, "content", None) or []
    texts: list[str] = []
    for block in content:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            texts.append(text)
    combined = "\n".join(texts).strip()
    if not combined:
        return {}
    try:
        return json.loads(combined)
    except json.JSONDecodeError:
        return {"raw_text": combined}


def _pick_first_product(search_data: Any) -> dict[str, Any] | None:
    if isinstance(search_data, list) and search_data:
        return search_data[0] if isinstance(search_data[0], dict) else None
    if isinstance(search_data, dict):
        for key in ("results", "products", "items", "data"):
            val = search_data.get(key)
            if isinstance(val, list) and val and isinstance(val[0], dict):
                return val[0]
    return None


def _extract_product_ref(product: dict[str, Any]) -> str | None:
    for key in ("productRef", "product_ref", "ref", "id", "productId"):
        val = product.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def _normalize_offers(raw: Any) -> list[IdealoOffer]:
    items: list[dict[str, Any]] = []
    if isinstance(raw, list):
        items = [x for x in raw if isinstance(x, dict)]
    elif isinstance(raw, dict):
        for key in ("offers", "topOffers", "items", "results", "data"):
            val = raw.get(key)
            if isinstance(val, list):
                items = [x for x in val if isinstance(x, dict)]
                break

    offers: list[IdealoOffer] = []
    for entry in items:
        price = _to_float(entry.get("price")) or 0.0
        if entry.get("hasAlwaysFreeShipping") is True:
            shipping = 0.0
        else:
            shipping = (
                _to_float(entry.get("minShippingCost"))
                or _to_float(entry.get("shippingCost"))
                or _to_float(entry.get("shipping"))
                or 0.0
            )
        total = _to_float(entry.get("totalPrice")) or round(price + shipping, 2)
        if total <= 0:
            continue

        shop = entry.get("shop") if isinstance(entry.get("shop"), dict) else {}
        shop_name = (
            _first_str(shop, "name", "merchantName")
            or _first_str(entry, "shopName", "merchantName", "merchant")
            or "idealo Merchant"
        )
        rating = (
            _to_float(_nested_get(shop, "rating", "avg"))
            or _to_float(_nested_get(shop, "rating", "score"))
            or _to_float(entry.get("shopRating"))
            or _to_float(entry.get("rating"))
        )
        delivery_obj = entry.get("delivery") if isinstance(entry.get("delivery"), dict) else {}
        delivery = (
            _first_str(delivery_obj, "deliveryText", "deliveryStatus", "text")
            or _first_str(entry, "deliveryTime", "deliveryEstimate")
        )
        url = _first_str(entry, "relocatorUrl", "offerUrl", "url", "checkoutUrl")
        free_ret = entry.get("freeReturnDays")
        free_ret_int = int(free_ret) if isinstance(free_ret, (int, float)) else None

        offers.append(
            IdealoOffer(
                shop_name=shop_name,
                price_eur=round(price or total, 2),
                shipping_eur=round(shipping, 2),
                total_eur=round(total, 2),
                shop_rating=rating,
                delivery_text=delivery,
                free_return_days=free_ret_int,
                offer_url=url,
            )
        )
    return offers


def _normalize_price_history(raw: Any) -> PriceHistoryStats | None:
    if not isinstance(raw, dict) or "_error" in raw:
        return None
    # Official idealo output_schema: { "priceTrend": { "statistics": { ... }, "history": [...] } | null }
    trend = raw.get("priceTrend")
    if "priceTrend" in raw and trend is None:
        return None
    src = trend if isinstance(trend, dict) else raw
    src = src.get("statistics") if isinstance(src.get("statistics"), dict) else src

    current = _first_float(src, "currentPrice", "current")
    min_p = _first_float(src, "minPrice", "min", "lowestPrice")
    max_p = _first_float(src, "maxPrice", "max", "highestPrice")
    avg_p = _first_float(src, "avgPrice", "averagePrice", "avg")
    pct = _first_float(src, "priceChangePercent", "percentageChange", "pctChange")

    if all(v is None for v in (current, min_p, max_p, avg_p)):
        return None

    return PriceHistoryStats(
        current_eur=current,
        min_30d_eur=min_p,
        max_30d_eur=max_p,
        avg_30d_eur=avg_p,
        pct_change_30d=pct,
        lowest_date=_first_str(src, "lowestPriceDate", "minDate"),
        highest_date=_first_str(src, "highestPriceDate", "maxDate"),
    )


def _extract_first_category(avail_cats: Any) -> str | None:
    if isinstance(avail_cats, list) and avail_cats and isinstance(avail_cats[0], dict):
        return _first_str(avail_cats[0], "name", "label", "title")
    return None


def _extract_test_grade(obj: dict[str, Any]) -> str | None:
    for key in ("testReports", "testReportsSummary"):
        reports = obj.get(key)
        if isinstance(reports, dict):
            grade = _first_str(reports, "averageGrade", "grade", "summary", "text", "label")
            if grade:
                return grade
            avg_score = reports.get("avgScore") or reports.get("averageScore")
            if isinstance(avg_score, (int, float)):
                return f"{avg_score:.1f}"
        if isinstance(reports, list) and reports and isinstance(reports[0], dict):
            grade = _first_str(reports[0], "grade", "rating", "verdict", "text")
            if grade:
                return grade
    return None


def _first_float(obj: dict[str, Any], *keys: str) -> float | None:
    for k in keys:
        if k in obj and obj[k] is not None:
            parsed = _to_float(obj[k])
            if parsed is not None:
                return parsed
    return None


def _first_str(obj: Any, *keys: str) -> str | None:
    if not isinstance(obj, dict):
        return None
    for k in keys:
        v = obj.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _nested_get(obj: Any, *keys: str) -> Any:
    cur = obj
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def _to_float(val: Any) -> float | None:
    """Parse European ('1.099,00 €', '479,99 €', 'ab 59,90 €') and US ('1,099.00') prices."""
    import re

    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, dict):
        for k in ("amount", "value", "eur", "price"):
            if isinstance(val.get(k), (int, float)):
                return float(val[k])
    if not isinstance(val, str):
        return None

    low = val.lower().strip()
    if not low:
        return None
    if any(w in low for w in ("kostenlos", "gratis", "free")):
        return 0.0

    # Extract first numeric token like -18.7, 1.099,00, 1,099.00, 479,99
    match = re.search(r"-?\d[\d.,]*", low)
    if not match:
        return None
    num = match.group(0)

    if "." in num and "," in num:
        # Whichever appears last is the decimal separator.
        if num.rfind(",") > num.rfind("."):
            num = num.replace(".", "").replace(",", ".")
        else:
            num = num.replace(",", "")
    elif "," in num:
        # Comma followed by 1-2 digits => European decimal; 3 digits => thousands separator.
        after_comma = num.split(",")[-1]
        if len(after_comma) in (1, 2):
            num = num.replace(",", ".")
        else:
            num = num.replace(",", "")
    elif "." in num and num.count(".") > 1:
        num = num.replace(".", "")

    try:
        return float(num)
    except ValueError:
        return None
