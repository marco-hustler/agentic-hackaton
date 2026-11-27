"""Tests for FastAPI endpoints and provider-agnostic LLM fallback tasks."""

import asyncio

from fastapi.testclient import TestClient

from cleanbreak.api.app import app
from cleanbreak.llm.tasks import parse_messy_inventory


def test_fallback_inventory_parser() -> None:
    raw = "PlayStation 5 Slim 2024, shared 50/50\nSony WH-1000XM5 (Alex paid, like new)"
    items = asyncio.run(parse_messy_inventory(raw, party_a_name="Alex", party_b_name="Sam"))
    assert len(items) == 2
    assert items[0].purchase_year == 2024
    assert items[0].ownership == "shared"
    assert items[1].ownership == "party_a"
    assert items[1].condition == "like_new"


def test_api_demo_and_solve_endpoints() -> None:
    client = TestClient(app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    demo = client.get("/api/demo")
    assert demo.status_code == 200
    body = demo.json()
    assert len(body["valued_items"]) == 7
    assert body["split"]["total_fair_value_eur"] > 0
    assert len(body["split"]["arbitrage_highlights"]) >= 1

    # Re-solve in min_cash mode
    solve_res = client.post(
        "/api/solve",
        json={
            "party_a_name": body["party_a_name"],
            "party_b_name": body["party_b_name"],
            "mode": "min_cash",
            "valued_items": body["valued_items"],
        },
    )
    assert solve_res.status_code == 200
    assert solve_res.json()["mode"] == "min_cash"


def test_slider_changes_only_value_fields() -> None:
    client = TestClient(app)
    demo = client.get("/api/demo").json()
    tv = next(vi for vi in demo["valued_items"] if vi["item"]["id"] == "tv")
    before = tv["valuation"]
    item = dict(tv["item"], depreciation_override=0.5)
    after = client.post("/api/reapply-depreciation", json={"item": item, "valuation": before}).json()
    assert after["depreciation_factor"] == 0.5
    assert after["fair_value_eur"] == round(before["trusted_market_price_eur"] * 0.5, 2)
    for key in ("offer_count", "scarcity_level", "replacement_friction", "is_buy_new_deal", "top_offers", "data_source"):
        assert after[key] == before[key], key


def test_slider_cleared_uses_age_and_condition() -> None:
    from cleanbreak.valuation.engine import compute_depreciation

    client = TestClient(app)
    tv = next(vi for vi in client.get("/api/demo").json()["valued_items"] if vi["item"]["id"] == "tv")
    item = dict(tv["item"], depreciation_override=None)
    after = client.post("/api/reapply-depreciation", json={"item": item, "valuation": tv["valuation"]}).json()
    assert after["depreciation_factor"] == compute_depreciation(item["purchase_year"], item["condition"])[0]


def test_parsed_ids_are_unique_and_never_demo_ids() -> None:
    demo_ids = {"espresso", "speaker", "tv", "vacuum", "mixer", "switch", "washer"}
    text = "Espresso machine 2022\nIKEA Billy bookshelf"
    first = asyncio.run(parse_messy_inventory(text))
    second = asyncio.run(parse_messy_inventory(text))
    ids = [i.id for i in first + second]
    assert len(set(ids)) == 4
    assert not demo_ids & set(ids)


def test_llm_supplied_ids_are_replaced() -> None:
    class FakeLLM:
        is_configured = True

        async def complete(self, **kwargs):
            return '{"items": [{"id": "espresso", "name": "Espresso", "search_query": "Espresso"}]}'

    items = asyncio.run(parse_messy_inventory("espresso", llm=FakeLLM()))
    assert items[0].id != "espresso" and items[0].id.startswith("espresso_")
