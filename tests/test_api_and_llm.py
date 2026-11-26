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
