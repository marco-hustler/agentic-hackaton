"""Shared test isolation: tests must never spend real idealo calls or touch the real counter/cache."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _isolate_idealo(tmp_path, monkeypatch):
    monkeypatch.setenv("IDEALO_LIVE_ENABLED", "false")
    monkeypatch.setenv("IDEALO_BUDGET_FILE", str(tmp_path / "idealo_budget.json"))
    monkeypatch.setenv("IDEALO_TOKEN_FILE", str(tmp_path / "no_tokens.json"))
    from cleanbreak.idealo import budget

    budget.reset_registry()
    yield
    budget.reset_registry()
