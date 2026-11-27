"""idealo login + call counter kept server-side (Postgres on Vercel), tested with an in-memory KV."""

from __future__ import annotations

import asyncio
import base64
import json
import time
from datetime import date

import pytest

from cleanbreak.idealo.auth import DbTokenStorage, _stored_tokens, tokens_present
from cleanbreak.idealo.budget import BudgetExhausted, DbCallBudget


def _jwt(exp: float) -> str:
    def enc(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    return f"{enc({'alg': 'none'})}.{enc({'exp': int(exp)})}.sig"


class FakeKv:
    def __init__(self) -> None:
        self.data: dict = {}

    def get(self, key):  # noqa: ANN001, ANN201
        return self.data.get(key)

    def set(self, key, value) -> None:  # noqa: ANN001
        self.data[key] = json.loads(json.dumps(value))

    def used_today(self, key) -> int:  # noqa: ANN001
        raw = self.data.get(key) or {}
        return raw.get("used", 0) if raw.get("date") == date.today().isoformat() else 0

    def try_increment_today(self, key, cap):  # noqa: ANN001, ANN201
        used = self.used_today(key)
        if used >= cap:
            return None
        self.data[key] = {"date": date.today().isoformat(), "used": used + 1}
        return used + 1


CLIENT = {"client_id": "abc", "redirect_uris": ["http://localhost:6274/callback"]}


def test_expired_access_with_refresh_is_blanked_so_the_sdk_refreshes():
    tok = _stored_tokens({"access_token": _jwt(time.time() - 60), "token_type": "Bearer", "refresh_token": "r"})
    assert tok is not None and tok.access_token == "" and tok.refresh_token == "r"
    assert _stored_tokens({"access_token": _jwt(time.time() - 60), "token_type": "Bearer"}) is None
    live = _stored_tokens({"access_token": _jwt(time.time() + 600), "token_type": "Bearer"})
    assert live is not None and live.access_token


def test_tokens_present_accepts_a_refreshable_login(tmp_path):
    f = tmp_path / "t.json"
    expired = {"access_token": _jwt(time.time() - 60), "token_type": "Bearer", "refresh_token": "r"}
    f.write_text(json.dumps({"tokens": expired}))
    assert not tokens_present(f)  # no client registration -> cannot refresh
    f.write_text(json.dumps({"tokens": expired, "client_info": CLIENT}))
    assert tokens_present(f)


def test_db_token_storage_round_trips_refreshed_tokens():
    from mcp.shared.auth import OAuthToken

    kv = FakeKv()
    store = DbTokenStorage(kv)
    asyncio.run(store.set_tokens(OAuthToken(access_token=_jwt(time.time() + 600), token_type="Bearer", refresh_token="r1")))
    got = asyncio.run(store.get_tokens())
    assert got is not None and got.refresh_token == "r1"
    assert kv.data["idealo_oauth"]["tokens"]["refresh_token"] == "r1"


def test_db_call_budget_stops_at_the_cap():
    budget = DbCallBudget(FakeKv(), cap=2, min_interval=0)
    asyncio.run(budget.reserve())
    asyncio.run(budget.reserve())
    assert budget.snapshot() == {"used": 2, "cap": 2, "remaining": 0}
    with pytest.raises(BudgetExhausted):
        asyncio.run(budget.reserve())
