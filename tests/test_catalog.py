"""Offline catalog: search cached idealo results and add one as a house item (0 MCP calls)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from cleanbreak.api.app import app
from cleanbreak.idealo.budget import get_budget
from cleanbreak.idealo.catalog import parse_price

client = TestClient(app)


def test_parse_price_german_format():
    assert parse_price("1.119,00 €") == 1119.0
    assert parse_price("399,99 €") == 399.99
    assert parse_price("") is None


def test_search_finds_cached_products_without_calls():
    used = get_budget().snapshot()["used"]
    hits = client.get("/api/catalog/search", params={"q": "dyson v15"}).json()
    assert hits and all("v15" in h["name"].lower() for h in hits)
    assert hits[0]["category"] == "Home Appliances"
    assert client.get("/api/catalog/search", params={"q": ""}).json() == []
    assert get_budget().snapshot()["used"] == used


def test_add_hit_returns_valued_item_at_search_price():
    hit = client.get("/api/catalog/search", params={"q": "sonos era 300"}).json()[0]
    vi = client.post("/api/catalog/item", json=hit).json()
    assert vi["item"]["name"].startswith("Sonos Era 300")
    assert vi["item"]["ownership"] == "shared"
    v = vi["valuation"]
    assert v["trusted_market_price_eur"] == hit["price_eur"]
    assert v["data_source"] == "idealo_cached"
    assert 0 < v["fair_value_eur"] <= hit["price_eur"]
    if hit["offer_count"] > 6:
        assert v["scarcity_level"] == "abundant"


def test_live_catalog_search_respects_live_flag():
    res = client.get("/api/catalog/search", params={"q": "playstation 5", "live": "true"})
    assert res.status_code == 503
    assert "IDEALO_LIVE_ENABLED" in res.json()["detail"]


def test_manual_item_enriches_from_idealo_cache_when_matched():
    res = client.post(
        "/api/items/manual",
        json={
            "name": "Sonos Era 300",
            "price_eur": 300,
            "purchase_year": 2024,
            "condition": "like_new",
            "importance": 8,
            "category": "Audio",
        },
    )
    assert res.status_code == 200
    val = res.json()["valuation"]
    assert val["data_source"] == "idealo_cached"
    assert val["offer_count"] > 10
    assert val["is_buy_new_deal"] is True
