"""Process store for the Dividealo world: SQLite locally, Postgres (Neon) when DATABASE_URL is set."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from cleanbreak.models import ProcessCreate, ProcessInventory, ProcessKind, ProcessStatus, ProcessSummary
from cleanbreak.paths import REPO_ROOT, resolve_repo_path

_DEFAULT_DB = REPO_ROOT / "data" / "processes.db"
_lock = Lock()
_store: ProcessStore | None = None


class _PgConn:
    """Minimal sqlite3-like wrapper over psycopg: `?` placeholders, dict rows, commit on clean exit."""

    def __init__(self, url: str) -> None:
        import psycopg
        from psycopg.rows import dict_row

        self._conn = psycopg.connect(url, row_factory=dict_row)

    def execute(self, sql: str, params: tuple | list = ()):  # noqa: ANN201 - psycopg cursor
        return self._conn.execute(sql.replace("?", "%s"), params)

    def commit(self) -> None:
        self._conn.commit()

    def __enter__(self) -> "_PgConn":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            self._conn.close()


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _default_title(kind: ProcessKind) -> str:
    if kind == "separation":
        return "Separation"
    if kind == "inheritance":
        return "Inheritance"
    return "Household split"


class ProcessStore:
    """CRUD for split processes. A SQLite file locally, or Postgres when given a database URL."""

    def __init__(self, db_path: Path | None = None, *, database_url: str | None = None) -> None:
        self.db_path = db_path
        self.database_url = database_url
        if db_path is None and database_url is None:
            raise ValueError("ProcessStore needs a db_path or a database_url")
        if self.db_path is not None and database_url is None:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @property
    def is_postgres(self) -> bool:
        return self.database_url is not None

    def _connect(self):  # noqa: ANN202 - sqlite3.Connection or _PgConn
        if self.database_url is not None:
            return _PgConn(self.database_url)
        assert self.db_path is not None
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS processes (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    participant_emails TEXT NOT NULL,
                    owner_id TEXT NOT NULL DEFAULT 'local-user',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS process_inventories (
                    process_id TEXT PRIMARY KEY REFERENCES processes(id) ON DELETE CASCADE,
                    mode TEXT NOT NULL,
                    valued_items TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            if self.is_postgres:
                conn.execute("ALTER TABLE process_inventories ADD COLUMN IF NOT EXISTS split_ids TEXT")
            else:
                cols = {r["name"] for r in conn.execute("PRAGMA table_info(process_inventories)")}
                if "split_ids" not in cols:  # added after the first DBs were created
                    conn.execute("ALTER TABLE process_inventories ADD COLUMN split_ids TEXT")
            conn.commit()

    def list_processes(self, owner_id: str = "local-user") -> list[ProcessSummary]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, title, kind, status, participant_emails, created_at, updated_at
                FROM processes
                WHERE owner_id = ?
                ORDER BY created_at ASC
                """,
                (owner_id,),
            ).fetchall()
        return [self._row_to_summary(row) for row in rows]

    def get_process(self, process_id: str) -> ProcessSummary | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, title, kind, status, participant_emails, created_at, updated_at
                FROM processes
                WHERE id = ?
                """,
                (process_id,),
            ).fetchone()
        return self._row_to_summary(row) if row else None

    def create_process(
        self,
        payload: ProcessCreate,
        *,
        owner_id: str = "local-user",
    ) -> ProcessSummary:
        process_id = str(uuid.uuid4())
        now = _utc_now()
        title = (payload.title or "").strip() or _default_title(payload.kind)
        emails = [e.strip().lower() for e in payload.participant_emails if e.strip()]
        # Deduplicate while preserving order
        seen: set[str] = set()
        unique_emails: list[str] = []
        for email in emails:
            if email not in seen:
                seen.add(email)
                unique_emails.append(email)

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO processes (
                    id, title, kind, status, participant_emails, owner_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    process_id,
                    title,
                    payload.kind,
                    "draft",
                    json.dumps(unique_emails),
                    owner_id,
                    now,
                    now,
                ),
            )
            # Each process owns its inventory; start empty (never share a global/demo list).
            conn.execute(
                """
                INSERT INTO process_inventories (process_id, mode, valued_items, split_ids, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (process_id, "balanced", "[]", None, now),
            )
            conn.commit()

        return ProcessSummary(
            id=process_id,
            title=title,
            kind=payload.kind,
            status="draft",
            participant_emails=unique_emails,
            created_at=now,
            updated_at=now,
        )

    def update_status(self, process_id: str, status: ProcessStatus) -> ProcessSummary | None:
        return self.update_process(process_id, status=status)

    def update_process(
        self,
        process_id: str,
        *,
        status: ProcessStatus | None = None,
        participant_emails: list[str] | None = None,
    ) -> ProcessSummary | None:
        """Patch status and/or collaborator emails. None if the process is missing."""
        if status is None and participant_emails is None:
            return self.get_process(process_id)
        now = _utc_now()
        fields: list[str] = ["updated_at = ?"]
        values: list[object] = [now]
        if status is not None:
            fields.append("status = ?")
            values.append(status)
        if participant_emails is not None:
            emails = [e.strip().lower() for e in participant_emails if e.strip()]
            seen: set[str] = set()
            unique: list[str] = []
            for email in emails:
                if email not in seen:
                    seen.add(email)
                    unique.append(email)
            fields.append("participant_emails = ?")
            values.append(json.dumps(unique))
        values.append(process_id)
        with self._connect() as conn:
            cur = conn.execute(
                f"UPDATE processes SET {', '.join(fields)} WHERE id = ?",
                values,
            )
            conn.commit()
            if cur.rowcount == 0:
                return None
        return self.get_process(process_id)

    def get_inventory(self, process_id: str) -> ProcessInventory | None:
        """The saved inventory for a process, or None if none was saved yet."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT mode, valued_items, split_ids, updated_at FROM process_inventories WHERE process_id = ?",
                (process_id,),
            ).fetchone()
        if row is None:
            return None
        return ProcessInventory.model_validate(
            {
                "mode": row["mode"],
                "valued_items": json.loads(row["valued_items"]),
                "split_ids": json.loads(row["split_ids"]) if row["split_ids"] else None,
                "updated_at": row["updated_at"],
            }
        )

    def save_inventory(self, process_id: str, inventory: ProcessInventory) -> ProcessInventory | None:
        """Upsert a process's inventory. None if the process does not exist."""
        if self.get_process(process_id) is None:
            return None
        now = _utc_now()
        items_json = json.dumps([vi.model_dump(mode="json") for vi in inventory.valued_items])
        split_json = json.dumps(inventory.split_ids) if inventory.split_ids is not None else None
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO process_inventories (process_id, mode, valued_items, split_ids, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(process_id) DO UPDATE SET
                    mode = excluded.mode,
                    valued_items = excluded.valued_items,
                    split_ids = excluded.split_ids,
                    updated_at = excluded.updated_at
                """,
                (process_id, inventory.mode, items_json, split_json, now),
            )
            conn.commit()
        return inventory.model_copy(update={"updated_at": now})

    @staticmethod
    def _row_to_summary(row) -> ProcessSummary:  # noqa: ANN001 - sqlite3.Row or dict
        emails = json.loads(row["participant_emails"] or "[]")
        return ProcessSummary(
            id=row["id"],
            title=row["title"],
            kind=row["kind"],
            status=row["status"],
            participant_emails=list(emails),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


def get_process_store() -> ProcessStore:
    """Process-wide singleton.

    PROCESS_DB_FILE (tests) wins, then DATABASE_URL (Neon on Vercel), else the local SQLite file.
    """
    global _store
    with _lock:
        if _store is None:
            db_file = os.getenv("PROCESS_DB_FILE")
            database_url = os.getenv("DATABASE_URL")
            if db_file:
                _store = ProcessStore(resolve_repo_path(db_file))
            elif database_url:
                _store = ProcessStore(database_url=database_url)
            else:
                _store = ProcessStore(_DEFAULT_DB)
        return _store


def reset_process_store() -> None:
    """Drop the singleton so the next call re-reads PROCESS_DB_FILE (tests)."""
    global _store
    with _lock:
        _store = None
