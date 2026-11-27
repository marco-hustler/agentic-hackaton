"""SQLite-backed process store for the Dividealo world."""

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


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _default_title(kind: ProcessKind) -> str:
    if kind == "separation":
        return "Separation"
    if kind == "inheritance":
        return "Inheritance"
    return "Household split"


class ProcessStore:
    """CRUD for split processes. One SQLite file, thread-safe enough for a hackathon demo."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
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
        now = _utc_now()
        with self._connect() as conn:
            cur = conn.execute(
                """
                UPDATE processes
                SET status = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, now, process_id),
            )
            conn.commit()
            if cur.rowcount == 0:
                return None
        return self.get_process(process_id)

    def get_inventory(self, process_id: str) -> ProcessInventory | None:
        """The saved inventory for a process, or None if none was saved yet."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT mode, valued_items, updated_at FROM process_inventories WHERE process_id = ?",
                (process_id,),
            ).fetchone()
        if row is None:
            return None
        return ProcessInventory.model_validate(
            {"mode": row["mode"], "valued_items": json.loads(row["valued_items"]), "updated_at": row["updated_at"]}
        )

    def save_inventory(self, process_id: str, inventory: ProcessInventory) -> ProcessInventory | None:
        """Upsert a process's inventory. None if the process does not exist."""
        if self.get_process(process_id) is None:
            return None
        now = _utc_now()
        items_json = json.dumps([vi.model_dump(mode="json") for vi in inventory.valued_items])
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO process_inventories (process_id, mode, valued_items, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(process_id) DO UPDATE SET
                    mode = excluded.mode,
                    valued_items = excluded.valued_items,
                    updated_at = excluded.updated_at
                """,
                (process_id, inventory.mode, items_json, now),
            )
            conn.commit()
        return inventory.model_copy(update={"updated_at": now})

    @staticmethod
    def _row_to_summary(row: sqlite3.Row) -> ProcessSummary:
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
    """Process-wide singleton; path overridable via PROCESS_DB_FILE for tests."""
    global _store
    with _lock:
        if _store is None:
            raw = os.getenv("PROCESS_DB_FILE", str(_DEFAULT_DB))
            _store = ProcessStore(resolve_repo_path(raw))
        return _store


def reset_process_store() -> None:
    """Drop the singleton so the next call re-reads PROCESS_DB_FILE (tests)."""
    global _store
    with _lock:
        _store = None
