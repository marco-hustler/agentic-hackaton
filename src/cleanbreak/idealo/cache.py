"""Deterministic local JSON disk cache for idealo MCP calls.

Protects the 500 calls/day Trial-tier budget and provides instant offline replay
during the live pitch if venue Wi-Fi drops.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any


class DiskCache:
    """Simple, human-readable JSON file cache keyed by (tool_name, args)."""

    def __init__(self, cache_dir: str | Path = "data/cache", ttl_seconds: int = 86400 * 7) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.ttl_seconds = ttl_seconds

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

        cached_at = raw.get("cached_at", 0)
        if self.ttl_seconds > 0 and (time.time() - cached_at) > self.ttl_seconds:
            return None
        return raw.get("data")

    def set(self, namespace: str, payload: dict[str, Any], data: Any) -> Path:
        path = self._key_path(namespace, payload)
        record = {
            "namespace": namespace,
            "request": payload,
            "cached_at": time.time(),
            "data": data,
        }
        path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
        return path
