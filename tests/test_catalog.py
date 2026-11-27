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
