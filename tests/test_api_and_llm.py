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
    assert items[0].name == "PlayStation 5 Slim"
    assert items[1].name == "Sony WH-1000XM5"
    assert items[1].search_query == "Sony WH-1000XM5"


def test_fallback_parser_strips_metadata_without_commas() -> None:
    raw = "Sony WH-1000XM5 headphones 2024 Alex paid; our old Bosch washing machine from 2019 shared 50/50"
    items = asyncio.run(parse_messy_inventory(raw, party_a_name="Alex", party_b_name="Sam"))
    assert [i.name for i in items] == ["Sony WH-1000XM5 headphones", "Bosch washing machine"]
    assert items[0].ownership == "party_a"
    assert items[1].purchase_year == 2019


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


def _demo_solve_payload(client):
    body = client.get("/api/demo").json()
    return {
        "party_a_name": body["party_a_name"],
        "party_b_name": body["party_b_name"],
        "mode": "balanced",
        "valued_items": body["valued_items"],
    }


def test_solve_never_calls_llm(monkeypatch) -> None:
    import cleanbreak.api.app as app_module

    async def boom(*a, **k):
        raise AssertionError("LLM called on the solve path")

    monkeypatch.setattr(app_module, "generate_mediator_summary", boom)
    client = TestClient(app)
    res = client.post("/api/solve", json=_demo_solve_payload(client))
    assert res.status_code == 200
    from cleanbreak.models import SplitRequest
    from cleanbreak.solver.optimizer import solve_split

    expected = solve_split(SplitRequest.model_validate(_demo_solve_payload(client))).mediator_summary
    assert res.json()["mediator_summary"] == expected


def test_summary_endpoint_without_llm_returns_deterministic_text(monkeypatch) -> None:
    monkeypatch.delenv("LLM_MODEL", raising=False)
    client = TestClient(app)
    split = client.post("/api/solve", json=_demo_solve_payload(client)).json()
    res = client.post("/api/summary", json=split)
    assert res.status_code == 200 and res.json()["summary"] == split["mediator_summary"]


def test_summary_endpoint_uses_llm(monkeypatch) -> None:
    import cleanbreak.api.app as app_module

    async def polished(result, **k):
        return "Polished summary."

    monkeypatch.setattr(app_module, "generate_mediator_summary", polished)
    client = TestClient(app)
    split = client.post("/api/solve", json=_demo_solve_payload(client)).json()
    assert client.post("/api/summary", json=split).json()["summary"] == "Polished summary."


def test_reapply_depreciation_keeps_offer_data() -> None:
    client = TestClient(app)
    entry = client.get("/api/demo").json()["valued_items"][0]
    before = entry["valuation"]
    entry["item"]["depreciation_override"] = 0.5
    after = client.post("/api/reapply-depreciation", json=entry).json()
    assert after["depreciation_factor"] == 0.5
    assert after["fair_value_eur"] == round(before["trusted_market_price_eur"] * 0.5, 2)
    assert after["offer_count"] == before["offer_count"]
    assert after["trusted_market_price_eur"] == before["trusted_market_price_eur"]


def test_estimated_price_used_when_idealo_not_cached() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/value",
        json={
            "mode": "cache_only",
            "items": [
                {
                    "id": "table_1",
                    "name": "Vintage Oak Table",
                    "purchase_year": 2024,
                    "condition": "good",
                    "estimated_price_eur": 420.0,
                }
            ],
        },
    )
    assert res.status_code == 200
    val = res.json()["valuations"][0]
    assert val["trusted_market_price_eur"] == 420.0
    assert val["top_offers"][0]["shop_name"] == "User Estimate"


def test_llm_status_and_fallback_price_parsing(monkeypatch) -> None:
    client = TestClient(app)
    assert client.get("/api/llm/status").json() == {"configured": False, "model": None, "models": [], "source": None}
    monkeypatch.setenv("LLM_MODEL", "gemini/gemini-3.5-flash-lite,gemini/gemini-3.1-flash-lite")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    status = client.get(
        "/api/llm/status",
        headers={"X-LLM-Model": "openai/gpt-4o-mini", "X-LLM-Api-Key": "session-key"},
    ).json()
    assert status["configured"] is True
    # Server .env takes precedence over browser-session headers.
    assert status["source"] == "env"
    assert status["models"] == ["gemini/gemini-3.5-flash-lite", "gemini/gemini-3.1-flash-lite"]

    from cleanbreak.llm.client import AgnosticLLMClient, LLMConfig

    items = asyncio.run(
        parse_messy_inventory(
            "Vintage oak table worth 420€ shared",
            llm=AgnosticLLMClient(LLMConfig(model=None, api_key=None)),
        )
    )
    assert items[0].name == "Vintage oak table"
    assert items[0].estimated_price_eur == 420.0

