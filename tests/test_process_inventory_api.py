"""Per-process inventory persistence: empty on create, independent per process, saved on PUT."""

import pytest
from fastapi.testclient import TestClient

from cleanbreak.api.app import app
from cleanbreak.idealo.budget import get_budget


def _new_process(client: TestClient) -> str:
    res = client.post("/api/processes", json={"kind": "separation", "participant_emails": ["marco@example.com"]})
    assert res.status_code == 201
    return res.json()["id"]


def test_new_process_inventory_is_empty() -> None:
    client = TestClient(app)
    pid = _new_process(client)

    res = client.get(f"/api/processes/{pid}/inventory")
    assert res.status_code == 200
    body = res.json()
    assert body["mode"] == "balanced"
    assert body["valued_items"] == []
    assert body["split_ids"] is None
    assert body["updated_at"]

    # Second read returns the same stored empty inventory.
    again = client.get(f"/api/processes/{pid}/inventory").json()
    assert again["updated_at"] == body["updated_at"]
    assert again["valued_items"] == []


def test_demo_seed_fills_inventory_on_create(monkeypatch: pytest.MonkeyPatch) -> None:
    """With DEMO_SEED_ENABLED, create fills the new process inventory from the Berlin WG demo."""
    monkeypatch.setenv("DEMO_SEED_ENABLED", "true")
    client = TestClient(app)
    used_before = get_budget().snapshot()["used"]
    pid = _new_process(client)
    body = client.get(f"/api/processes/{pid}/inventory").json()
    assert len(body["valued_items"]) == 7
    assert get_budget().snapshot()["used"] == used_before


def test_demo_seed_fills_only_when_inventory_row_missing(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    """Legacy path: DEMO_SEED can still seed when no inventory row exists yet."""
    monkeypatch.setenv("DEMO_SEED_ENABLED", "true")
    # Use a fresh DB so create_process behavior under test is isolated — then delete the inventory row.
    db = tmp_path / "proc.db"
    monkeypatch.setenv("PROCESS_DB_FILE", str(db))
    from cleanbreak.db import processes as proc_db

    proc_db.reset_process_store()
    try:
        client = TestClient(app)
        pid = _new_process(client)
        # Simulate a process created before empty-inventory-at-create.
        store = proc_db.get_process_store()
        with store._connect() as conn:
            conn.execute("DELETE FROM process_inventories WHERE process_id = ?", (pid,))
            conn.commit()

        used_before = get_budget().snapshot()["used"]
        body = client.get(f"/api/processes/{pid}/inventory").json()
        assert len(body["valued_items"]) == 7
        assert get_budget().snapshot()["used"] == used_before
    finally:
        proc_db.reset_process_store()


def test_put_persists_edits_per_process() -> None:
    client = TestClient(app)
    pid = _new_process(client)
    other = _new_process(client)

    demo_item = client.get("/api/demo").json()["valued_items"][0]
    demo_item["item"]["party_a_points"] = 99
    demo_item["item"]["forced_action"] = "party_b"
    demo_item["item"]["condition"] = "worn"

    saved = client.put(
        f"/api/processes/{pid}/inventory",
        json={"mode": "min_cash", "valued_items": [demo_item]},
    )
    assert saved.status_code == 200

    reread = client.get(f"/api/processes/{pid}/inventory").json()
    item = reread["valued_items"][0]["item"]
    assert reread["mode"] == "min_cash"
    assert item["party_a_points"] == 99
    assert item["forced_action"] == "party_b"
    assert item["condition"] == "worn"

    untouched = client.get(f"/api/processes/{other}/inventory").json()
    assert untouched["mode"] == "balanced"
    assert untouched["valued_items"] == []


def test_inventories_are_isolated_across_processes() -> None:
    client = TestClient(app)
    a = _new_process(client)
    b = _new_process(client)
    demo_items = client.get("/api/demo").json()["valued_items"]

    client.put(
        f"/api/processes/{a}/inventory",
        json={"mode": "balanced", "valued_items": [demo_items[0]]},
    )
    client.put(
        f"/api/processes/{b}/inventory",
        json={"mode": "min_cash", "valued_items": demo_items[:2]},
    )

    inv_a = client.get(f"/api/processes/{a}/inventory").json()
    inv_b = client.get(f"/api/processes/{b}/inventory").json()
    assert len(inv_a["valued_items"]) == 1
    assert len(inv_b["valued_items"]) == 2
    assert inv_a["valued_items"][0]["item"]["id"] == demo_items[0]["item"]["id"]
    assert inv_a["mode"] == "balanced"
    assert inv_b["mode"] == "min_cash"


def test_inventory_404_for_unknown_process() -> None:
    client = TestClient(app)
    assert client.get("/api/processes/nope/inventory").status_code == 404
    assert client.put("/api/processes/nope/inventory", json={"mode": "balanced", "valued_items": []}).status_code == 404


def test_split_ids_round_trip():
    c = TestClient(app)
    pid = c.post("/api/processes", json={"kind": "separation"}).json()["id"]
    inv = c.get(f"/api/processes/{pid}/inventory").json()
    assert inv["split_ids"] is None
    assert inv["valued_items"] == []

    items = c.get("/api/demo").json()["valued_items"][:3]
    ids = [vi["item"]["id"] for vi in items]
    c.put(f"/api/processes/{pid}/inventory", json={**inv, "valued_items": items, "split_ids": ids[:2]})
    assert c.get(f"/api/processes/{pid}/inventory").json()["split_ids"] == ids[:2]
