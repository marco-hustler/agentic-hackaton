"""API value path: live gate, cost pre-flight, per-item isolation, status (U3)."""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient

import cleanbreak.api.app as app_module
from cleanbreak.idealo.auth import LoginRequired
from cleanbreak.idealo.budget import CallBudget, get_budget
from cleanbreak.paths import REPO_ROOT
from cleanbreak.valuation.engine import build_demo_fallback_valuations

DEMO_ITEMS = json.loads((REPO_ROOT / "data" / "demo_berlin_wg.json").read_text())["items"]


def _new_item(i: int) -> dict:
    return {"id": f"new_{i}", "name": f"Gadget {i}", "search_query": f"Gadget {i}"}


class FakeClient:
    """Stands in for IdealoMCPClient; counts calls on a real CallBudget."""

    def __init__(self, budget, *, login=True, behaviour=None, connect_exc=None, delay=0.0):
        self.budget = budget
        self.login = login
        self.behaviour = behaviour or {}
        self.connect_exc = connect_exc
        self.delay = delay
        self.connects = 0
        self.looked_up: list[str] = []

    def has_login(self):
        return self.login

    def lookup_cached(self, item):
        return "miss", None

    @asynccontextmanager
    async def connect(self):
        self.connects += 1
        await self.budget.reserve()
        await self.budget.reserve()
        if self.connect_exc:
            raise self.connect_exc
        yield self

    async def value_item(self, item):
        self.looked_up.append(item.id)
        if self.delay:
            await asyncio.sleep(self.delay)
        for _ in range(4):
            await self.budget.reserve()
        kind = self.behaviour.get(item.id, "found")
        if kind == "raise":
            raise RuntimeError("idealo exploded")
        if kind in ("error", "not_found"):
            return kind, None
        val = build_demo_fallback_valuations([item])[0].model_copy(update={"data_source": "idealo_live"})
        return "found", val


@pytest.fixture
def api():
    return TestClient(app_module.app)


@pytest.fixture
def budget(tmp_path):
    return CallBudget(tmp_path / "fake_budget.json", min_interval=0.0)


def _use_fake(monkeypatch, fake):
    monkeypatch.setattr(app_module, "_make_client", lambda country: fake)


def _live_on(monkeypatch):
    monkeypatch.setenv("IDEALO_LIVE_ENABLED", "true")


def _value(api, items, mode="live_or_cache"):
    res = api.post("/api/value", json={"items": items, "mode": mode})
    assert res.status_code == 200
    return res.json()


def test_live_off_never_connects(api, monkeypatch, budget):
    fake = FakeClient(budget)
    _use_fake(monkeypatch, fake)
    body = _value(api, [_new_item(1)])
    v = body["valuations"][0]
    assert fake.connects == 0 and budget.snapshot()["used"] == 0
    assert v["data_source"] == "demo_fallback" and v["source_note"] == "live mode off"
    assert "live mode off" in body["warning"]


def test_all_demo_items_cached_spend_zero_calls_with_live_on(api, monkeypatch):
    _live_on(monkeypatch)
    body = _value(api, DEMO_ITEMS)
    assert {v["data_source"] for v in body["valuations"]} == {"idealo_cached"}
    assert get_budget().snapshot()["used"] == 0
    assert body["budget"]["used"] == 0


def test_no_login_returns_immediately_without_connecting(api, monkeypatch, budget):
    _live_on(monkeypatch)
    fake = FakeClient(budget, login=False)
    _use_fake(monkeypatch, fake)
    v = _value(api, [_new_item(1)])["valuations"][0]
    assert fake.connects == 0 and v["source_note"] == "login required"


def test_per_action_cap_of_ten(api, monkeypatch, budget):
    _live_on(monkeypatch)
    fake = FakeClient(budget)
    _use_fake(monkeypatch, fake)
    vals = _value(api, [_new_item(i) for i in range(12)])["valuations"]
    assert len(fake.looked_up) == 10
    assert [v["source_note"] for v in vals[10:]] == ["skipped: per-action limit"] * 2
    assert budget.snapshot()["used"] == 2 + 10 * 4


def test_budget_runs_out_mid_request(api, monkeypatch, tmp_path):
    _live_on(monkeypatch)
    b = CallBudget(tmp_path / "b.json", cap=9, min_interval=0.0)
    fake = FakeClient(b)
    _use_fake(monkeypatch, fake)
    vals = _value(api, [_new_item(i) for i in range(3)])["valuations"]
    assert fake.looked_up == ["new_0"]
    assert vals[0]["data_source"] == "idealo_live"
    assert [v["source_note"] for v in vals[1:]] == ["daily idealo budget reached"] * 2


def test_first_error_stops_live_and_keeps_others(api, monkeypatch, budget):
    _live_on(monkeypatch)
    fake = FakeClient(budget, behaviour={"new_1": "raise"})
    _use_fake(monkeypatch, fake)
    items = [DEMO_ITEMS[0], _new_item(0), _new_item(1), _new_item(2)]
    monkeypatch.setattr(fake, "lookup_cached", _real_cache_lookup())
    vals = _value(api, items)["valuations"]
    assert vals[0]["data_source"] == "idealo_cached"
    assert vals[1]["data_source"] == "idealo_live"
    assert [vals[2]["source_note"], vals[3]["source_note"]] == ["idealo error", "idealo error"]
    assert fake.looked_up == ["new_0", "new_1"]


def test_connect_failure_keeps_cached_items(api, monkeypatch, budget):
    _live_on(monkeypatch)
    fake = FakeClient(budget, connect_exc=ExceptionGroup("tg", [LoginRequired("expired")]))
    _use_fake(monkeypatch, fake)
    monkeypatch.setattr(fake, "lookup_cached", _real_cache_lookup())
    vals = _value(api, DEMO_ITEMS + [_new_item(1)])["valuations"]
    assert {v["data_source"] for v in vals[:7]} == {"idealo_cached"}
    assert vals[7]["source_note"] == "login required"


def test_not_found_is_placeholder_not_zero(api, monkeypatch, budget):
    _live_on(monkeypatch)
    fake = FakeClient(budget, behaviour={"new_1": "not_found"})
    _use_fake(monkeypatch, fake)
    v = _value(api, [_new_item(1)])["valuations"][0]
    assert v["source_note"] == "idealo found no match"
    assert v["data_source"] == "demo_fallback" and v["fair_value_eur"] > 0


def test_slow_idealo_hits_deadline(api, monkeypatch, budget):
    _live_on(monkeypatch)
    monkeypatch.setenv("IDEALO_LIVE_DEADLINE_SECONDS", "0.3")
    fake = FakeClient(budget, delay=5.0)
    _use_fake(monkeypatch, fake)
    start = time.monotonic()
    v = _value(api, [_new_item(1)])["valuations"][0]
    assert time.monotonic() - start < 2.0
    assert v["source_note"] == "idealo slow"


def test_status_endpoint(api, monkeypatch):
    body = api.get("/api/idealo/status").json()
    assert body["live_enabled"] is False and body["logged_in"] is False
    assert body["used"] == 0 and body["cap"] == 450 and body["remaining"] == 450


def _real_cache_lookup():
    from cleanbreak.idealo.client import IdealoMCPClient

    real = IdealoMCPClient()
    return real.lookup_cached
