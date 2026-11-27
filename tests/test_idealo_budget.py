"""Daily idealo call budget + throttle (U1)."""

from __future__ import annotations

import asyncio
import json
import time
from datetime import date, timedelta

import pytest

from cleanbreak.idealo.budget import BudgetExhausted, CallBudget, get_budget


def _budget(tmp_path, cap=450, interval=0.0):
    return CallBudget(tmp_path / "b.json", cap=cap, min_interval=interval)


def test_reserve_counts_and_persists(tmp_path):
    b = _budget(tmp_path)
    for _ in range(3):
        asyncio.run(b.reserve())
    snap = b.snapshot()
    assert snap["used"] == 3 and snap["remaining"] == 447 and snap["cap"] == 450
    on_disk = json.loads((tmp_path / "b.json").read_text())
    assert on_disk == {"date": date.today().isoformat(), "used": 3}


def test_new_day_resets(tmp_path):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    (tmp_path / "b.json").write_text(json.dumps({"date": yesterday, "used": 450}))
    b = _budget(tmp_path)
    asyncio.run(b.reserve())
    assert b.snapshot()["used"] == 1


def test_cap_reached_raises_and_does_not_increment(tmp_path):
    (tmp_path / "b.json").write_text(json.dumps({"date": date.today().isoformat(), "used": 450}))
    b = _budget(tmp_path)
    with pytest.raises(BudgetExhausted):
        asyncio.run(b.reserve())
    assert b.snapshot()["used"] == 450


def test_concurrent_reserve_only_one_fits(tmp_path):
    (tmp_path / "b.json").write_text(json.dumps({"date": date.today().isoformat(), "used": 449}))
    b = _budget(tmp_path)

    async def both():
        return await asyncio.gather(b.reserve(), b.reserve(), return_exceptions=True)

    results = asyncio.run(both())
    assert sum(isinstance(r, BudgetExhausted) for r in results) == 1
    assert b.snapshot()["used"] == 450


def test_throttle_spaces_calls(tmp_path):
    b = _budget(tmp_path, interval=0.05)

    async def four():
        for _ in range(4):
            await b.reserve()

    start = time.monotonic()
    asyncio.run(four())
    assert time.monotonic() - start >= 0.15


def test_corrupt_file_treated_as_zero(tmp_path):
    (tmp_path / "b.json").write_text("{not json")
    b = _budget(tmp_path)
    asyncio.run(b.reserve())
    assert b.snapshot()["used"] == 1


def test_registry_shares_one_budget_per_file(tmp_path):
    p = tmp_path / "shared.json"
    assert get_budget(p) is get_budget(p)


class _FakeResult:
    structured_content = {"results": []}
    is_error = False


class _FakeSession:
    def __init__(self):
        self.calls = 0

    async def call_tool(self, name, arguments=None):
        self.calls += 1
        return _FakeResult()


def test_client_counts_only_cache_misses(tmp_path):
    from cleanbreak.idealo.client import IdealoMCPClient

    b = _budget(tmp_path)
    client = IdealoMCPClient(cache_dir=tmp_path / "cache", budget=b)
    client.cache.set("search_products", {"query": "x"}, {"cached": True})
    client._session = _FakeSession()

    asyncio.run(client.call_tool_cached("search_products", {"query": "x"}))
    assert b.snapshot()["used"] == 0

    asyncio.run(client.call_tool_cached("search_products", {"query": "y"}))
    assert b.snapshot()["used"] == 1 and client._session.calls == 1
