"""Shared test isolation: tests must never spend real idealo calls or touch the real counter/cache."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _isolate_idealo(tmp_path, monkeypatch):
    monkeypatch.setenv("IDEALO_LIVE_ENABLED", "false")
    monkeypatch.setenv("IDEALO_BUDGET_FILE", str(tmp_path / "idealo_budget.json"))
    monkeypatch.setenv("IDEALO_TOKEN_FILE", str(tmp_path / "no_tokens.json"))
    monkeypatch.setenv("PROCESS_DB_FILE", str(tmp_path / "processes.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)  # tests never touch Neon
    for var in ("LLM_MODEL", "LLM_API_KEY", "LLM_API_BASE", "OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    from cleanbreak.db.processes import reset_process_store
    from cleanbreak.idealo import budget

    reset_process_store()
    budget.reset_registry()
    yield
    budget.reset_registry()
    reset_process_store()
