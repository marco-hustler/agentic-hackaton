"""Small JSON key-value table on Postgres, for server state that must survive Vercel instances
(idealo OAuth tokens, the daily idealo call counter)."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from cleanbreak.db.pg import PgConn

_SCHEMA = """
CREATE TABLE IF NOT EXISTS app_kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""


class KvStore:
    def __init__(self, url: str) -> None:
        self.url = url
        with PgConn(url) as conn:
            conn.execute(_SCHEMA)

    def get(self, key: str) -> Any | None:
        with PgConn(self.url) as conn:
            row = conn.execute("SELECT value FROM app_kv WHERE key = ?", (key,)).fetchone()
        return json.loads(row["value"]) if row else None

    def set(self, key: str, value: Any) -> None:
        with PgConn(self.url) as conn:
            conn.execute(
                """
                INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, now())
                ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()
                """,
                (key, json.dumps(value)),
            )

    def used_today(self, key: str) -> int:
        raw = self.get(key)
        if not isinstance(raw, dict) or raw.get("date") != date.today().isoformat():
            return 0
        used = raw.get("used")
        return used if isinstance(used, int) and used >= 0 else 0

    def try_increment_today(self, key: str, cap: int) -> int | None:
        """Atomically count one call for today. Returns the new count, or None if `cap` is reached.

        One statement, so concurrent Vercel instances can never push the counter past the cap.
        """
        today = date.today().isoformat()
        first = json.dumps({"date": today, "used": 1})
        with PgConn(self.url) as conn:
            row = conn.execute(
                """
                INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, now())
                ON CONFLICT (key) DO UPDATE SET
                    value = CASE
                        WHEN (app_kv.value::jsonb ->> 'date') = ?::text
                            THEN jsonb_build_object('date', ?::text, 'used', (app_kv.value::jsonb ->> 'used')::int + 1)::text
                        ELSE excluded.value
                    END,
                    updated_at = now()
                WHERE (app_kv.value::jsonb ->> 'date') IS DISTINCT FROM ?::text
                   OR (app_kv.value::jsonb ->> 'used')::int < ?::int
                RETURNING value
                """,
                (key, first, today, today, today, cap),
            ).fetchone()
        if row is None:
            return None
        return int(json.loads(row["value"])["used"])
