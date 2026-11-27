"""Deterministic local JSON disk cache for idealo MCP calls.

Protects the 500 calls/day Trial-tier budget and provides instant offline replay
during the live pitch if venue Wi-Fi drops.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

from cleanbreak.paths import resolve_repo_path


class DiskCache:
    """Simple, human-readable JSON file cache keyed by (tool_name, args)."""

    def __init__(self, cache_dir: str | Path = "data/cache", ttl_seconds: int | None = None) -> None:
        self.cache_dir = resolve_repo_path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        # 0 = never expire (default: cached idealo answers are kept for the whole event).
        self.ttl_seconds = (
            ttl_seconds if ttl_seconds is not None else int(os.getenv("IDEALO_CACHE_TTL_SECONDS", "0"))
        )

    def _key_path(self, namespace: str, payload: dict[str, Any]) -> Path:
        canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        digest = hashlib.sha256(f"{namespace}:{canonical}".encode("utf-8")).hexdigest()[:16]
        safe_ns = "".join(c if c.isalnum() or c in "-_" else "_" for c in namespace)
        return self.cache_dir / f"{safe_ns}_{digest}.json"

    def get(self, namespace: str, payload: dict[str, Any]) -> Any | None:
        path = self._key_path(namespace, payload)
        if not path.exists():
            return None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

        now = time.time()
        expires_at = raw.get("expires_at")
        if isinstance(expires_at, (int, float)):
            return raw.get("data") if now <= expires_at else None
        cached_at = raw.get("cached_at", 0)
        if self.ttl_seconds > 0 and (now - cached_at) > self.ttl_seconds:
            return None
        return raw.get("data")

    def set(self, namespace: str, payload: dict[str, Any], data: Any, *, expires_in: float | None = None) -> Path:
        """Store `data`; `expires_in` (seconds) gives this entry its own short expiry."""
        path = self._key_path(namespace, payload)
        now = time.time()
        record: dict[str, Any] = {
            "namespace": namespace,
            "request": payload,
            "cached_at": now,
            "data": data,
        }
        if expires_in is not None:
            record["expires_at"] = now + expires_in
        path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
        return path
