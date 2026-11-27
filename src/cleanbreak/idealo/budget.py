"""Daily idealo MCP call budget and throttle.

Every MCP request (initialize, list_tools, call_tool) reserves one call here before it is
sent, so the Trial tier limits (500 calls/day, 3 calls/sec) cannot be exceeded by this
process. The counter is persisted per local calendar day so restarts and `--reload` keep it.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import date
from pathlib import Path
from typing import Any

from cleanbreak.paths import resolve_repo_path

DEFAULT_CAP = 450
DEFAULT_MIN_INTERVAL = 0.34  # seconds between calls -> < 3 calls/sec


class BudgetExhausted(RuntimeError):
    """Raised before any network traffic when today's call cap is reached."""


class CallBudget:
    def __init__(self, path: str | Path, *, cap: int = DEFAULT_CAP, min_interval: float = DEFAULT_MIN_INTERVAL) -> None:
        self.path = Path(path)
        self.cap = cap
        self.min_interval = min_interval
        self._lock = asyncio.Lock()
        self._last_call = 0.0

    def _read_used(self) -> int:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return 0
        if not isinstance(raw, dict) or raw.get("date") != date.today().isoformat():
            return 0
        used = raw.get("used")
        return used if isinstance(used, int) and used >= 0 else 0

    def _write_used(self, used: int) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({"date": date.today().isoformat(), "used": used}), encoding="utf-8")

    def snapshot(self) -> dict[str, Any]:
        used = self._read_used()
        return {"used": used, "cap": self.cap, "remaining": max(0, self.cap - used)}

    def remaining(self) -> int:
        return self.snapshot()["remaining"]

    async def reserve(self) -> None:
        """Count one MCP call; wait out the throttle; raise BudgetExhausted at the cap."""
        async with self._lock:
            used = self._read_used()
            if used >= self.cap:
                raise BudgetExhausted(f"Daily idealo call budget reached ({used}/{self.cap}).")
            wait = self._last_call + self.min_interval - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            self._write_used(used + 1)
            self._last_call = time.monotonic()


_REGISTRY: dict[Path, CallBudget] = {}


def default_budget_path() -> Path:
    return resolve_repo_path(os.getenv("IDEALO_BUDGET_FILE", "data/idealo_budget.json"))


def get_budget(path: str | Path | None = None) -> CallBudget:
    """One shared budget per counter file per process, so concurrent requests share the lock."""
    resolved = Path(path) if path is not None else default_budget_path()
    budget = _REGISTRY.get(resolved)
    if budget is None:
        cap = int(os.getenv("IDEALO_DAILY_CALL_CAP", str(DEFAULT_CAP)))
        budget = CallBudget(resolved, cap=cap)
        _REGISTRY[resolved] = budget
    return budget


def reset_registry() -> None:
    _REGISTRY.clear()
