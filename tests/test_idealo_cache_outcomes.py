"""Cache outcomes, query normalization and non-interactive auth (U2)."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

import pytest

from cleanbreak.idealo.auth import LoginRequired, build_oauth_provider, is_login_required, tokens_present
from cleanbreak.idealo.budget import CallBudget
from cleanbreak.idealo.cache import DiskCache
from cleanbreak.idealo.client import IdealoMCPClient, IdealoToolError, normalize_query
from cleanbreak.models import HouseholdItemInput
from cleanbreak.paths import REPO_ROOT

DEMO = json.loads((REPO_ROOT / "data" / "demo_berlin_wg.json").read_text())
REAL_CACHE = REPO_ROOT / "data" / "cache"


def _item(query: str, item_id: str = "x") -> HouseholdItemInput:
    return HouseholdItemInput(id=item_id, name=query, search_query=query)


class _Result:
    def __init__(self, payload, is_error=False):
        self.structured_content = payload
        self.is_error = is_error
        self.content = []


class _Session:
    """Fake MCP session: scripted per-tool responses (or exceptions)."""

    def __init__(self, responses):
        self.responses = responses
        self.calls: list[str] = []

    async def call_tool(self, name, arguments=None):
        self.calls.append(name)
        resp = self.responses[name]
        if isinstance(resp, Exception):
            raise resp
        return resp


def _client(tmp_path, session=None):
    budget = CallBudget(tmp_path / "budget.json", min_interval=0.0)
    client = IdealoMCPClient(cache_dir=tmp_path / "cache", budget=budget)
    client._session = session
    return client, budget


def test_committed_demo_bundles_resolve_from_cache_with_zero_calls(tmp_path):
    before = sorted(p.name for p in REAL_CACHE.iterdir())
    budget = CallBudget(tmp_path / "budget.json")
    client = IdealoMCPClient(cache_dir=REAL_CACHE, budget=budget)
    for entry in DEMO["items"]:
        item = HouseholdItemInput.model_validate(entry)
        status, val = client.lookup_cached(item)
        assert status == "found", item.id
        assert val is not None and val.data_source == "idealo_cached" and val.fair_value_eur > 0
    assert budget.snapshot()["used"] == 0
    assert sorted(p.name for p in REAL_CACHE.iterdir()) == before


def test_normalized_key_shares_cache_across_spelling(tmp_path):
    assert normalize_query("  sonos ERA   300 ") == normalize_query("Sonos Era 300")
    session = _Session({"search_products": _Result({"results": []})})
    client, _ = _client(tmp_path, session)
    asyncio.run(client.probe_item_raw("Sonos Era 300"))
    status, _ = client.lookup_cached(_item(" sonos ERA 300 "))
    assert status == "not_found"


def test_not_found_is_remembered_forever(tmp_path, monkeypatch):
    session = _Session({"search_products": _Result({"results": []})})
    client, budget = _client(tmp_path, session)
    bundle = asyncio.run(client.probe_item_raw("Nonexistent Gadget 9000"))
    assert bundle["outcome"] == "not_found"
    used = budget.snapshot()["used"]
    later = time.time() + 16 * 60
    monkeypatch.setattr(time, "time", lambda: later)
    status, val = client.lookup_cached(_item("Nonexistent Gadget 9000"))
    assert status == "not_found" and val is None
    assert budget.snapshot()["used"] == used


def test_tool_error_bundle_expires_after_15_minutes(tmp_path, monkeypatch):
    session = _Session(
        {
            "search_products": _Result({"results": [{"productRef": "p1", "name": "Thing"}]}),
            "get_product_details": _Result({"name": "Thing"}),
            "get_product_offers": RuntimeError("boom"),
            "get_product_price_history": _Result({}),
        }
    )
    client, _ = _client(tmp_path, session)
    client._tool_names = set(session.responses)
    bundle = asyncio.run(client.probe_item_raw("Thing"))
    assert bundle["outcome"] == "error"

    now = time.time()
    monkeypatch.setattr(time, "time", lambda: now + 60)
    assert client.lookup_cached(_item("Thing"))[0] == "error"
    monkeypatch.setattr(time, "time", lambda: now + 16 * 60)
    assert client.lookup_cached(_item("Thing"))[0] == "miss"


def test_is_error_search_is_error_outcome_and_not_cached_per_tool(tmp_path):
    session = _Session({"search_products": _Result({"raw": "rate limited"}, is_error=True)})
    client, _ = _client(tmp_path, session)
    with pytest.raises(IdealoToolError):
        asyncio.run(client.call_tool_cached("search_products", {"query": "a", "country": "DE"}))
    assert client.cache.get("search_products", {"query": "a", "country": "DE"}) is None

    bundle = asyncio.run(client.probe_item_raw("b"))
    assert bundle["outcome"] == "error"


def test_ttl_unset_never_expires(tmp_path, monkeypatch):
    cache = DiskCache(tmp_path)
    cache.set("ns", {"k": 1}, {"v": 1})
    later = time.time() + 30 * 86400
    monkeypatch.setattr(time, "time", lambda: later)
    assert cache.get("ns", {"k": 1}) == {"v": 1}


def test_non_interactive_redirect_raises_without_browser(monkeypatch):
    import webbrowser

    monkeypatch.setattr(webbrowser, "open", lambda *a, **k: pytest.fail("browser opened"))
    provider = build_oauth_provider(token_file="/nonexistent/tokens.json", interactive=False)
    with pytest.raises(LoginRequired):
        asyncio.run(provider.context.redirect_handler("https://login.example"))


def test_login_required_found_inside_exception_group():
    eg = ExceptionGroup("tg", [ValueError("x"), ExceptionGroup("inner", [LoginRequired("no login")])])
    assert is_login_required(eg)
    assert not is_login_required(ExceptionGroup("tg", [ValueError("x")]))


def test_tokens_present(tmp_path):
    f = tmp_path / "t.json"
    assert not tokens_present(f)
    f.write_text(json.dumps({"tokens": {"access_token": "abc", "token_type": "Bearer"}}))
    assert tokens_present(f)
