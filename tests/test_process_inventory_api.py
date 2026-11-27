"""Per-process inventory persistence: empty by default (demo seed behind DEMO_SEED_ENABLED), saved on PUT."""

import pytest
from fastapi.testclient import TestClient

from cleanbreak.api.app import app
from cleanbreak.idealo.budget import get_budget


def _new_process(client: TestClient) -> str:
    res = client.post("/api/processes", json={"kind": "separation", "participant_emails": ["marco@example.com"]})
    assert res.status_code == 201
    return res.json()["id"]


@pytest.fixture(autouse=True)
def _demo_seed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Most tests here need items to edit: turn the demo seed on unless a test says otherwise."""
    monkeypatch.setenv("DEMO_SEED_ENABLED", "true")


def test_new_house_is_empty_without_demo_seed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_SEED_ENABLED", "false")
    client = TestClient(app)
    pid = _new_process(client)
    body = client.get(f"/api/processes/{pid}/inventory").json()
    assert body["valued_items"] == []
    assert body["split_ids"] is None


def test_first_read_seeds_demo_items_without_idealo_calls() -> None:
    client = TestClient(app)
    pid = _new_process(client)
    used_before = get_budget().snapshot()["used"]

    res = client.get(f"/api/processes/{pid}/inventory")
    assert res.status_code == 200
    body = res.json()
    assert body["mode"] == "balanced"
    assert len(body["valued_items"]) == 7
    assert body["updated_at"]
    assert get_budget().snapshot()["used"] == used_before

    # Second read returns the stored copy, not a fresh seed.
    again = client.get(f"/api/processes/{pid}/inventory").json()
    assert again["updated_at"] == body["updated_at"]


def test_put_persists_edits_per_process() -> None:
    client = TestClient(app)
    pid = _new_process(client)
    other = _new_process(client)
    inv = client.get(f"/api/processes/{pid}/inventory").json()
    client.get(f"/api/processes/{other}/inventory")

    first = inv["valued_items"][0]
    first["item"]["party_a_points"] = 99
    first["item"]["forced_action"] = "party_b"
    first["item"]["condition"] = "worn"
    saved = client.put(f"/api/processes/{pid}/inventory", json={"mode": "min_cash", "valued_items": inv["valued_items"]})
    assert saved.status_code == 200

    reread = client.get(f"/api/processes/{pid}/inventory").json()
    item = reread["valued_items"][0]["item"]
    assert reread["mode"] == "min_cash"
    assert item["party_a_points"] == 99
    assert item["forced_action"] == "party_b"
    assert item["condition"] == "worn"

    untouched = client.get(f"/api/processes/{other}/inventory").json()
    assert untouched["mode"] == "balanced"
    assert untouched["valued_items"][0]["item"]["party_a_points"] != 99


def test_inventory_404_for_unknown_process() -> None:
    client = TestClient(app)
    assert client.get("/api/processes/nope/inventory").status_code == 404
    assert client.put("/api/processes/nope/inventory", json={"mode": "balanced", "valued_items": []}).status_code == 404


def test_split_ids_round_trip():
    from fastapi.testclient import TestClient

    from cleanbreak.api.app import app

    c = TestClient(app)
    pid = c.post("/api/processes", json={"kind": "separation"}).json()["id"]
    inv = c.get(f"/api/processes/{pid}/inventory").json()
    assert inv["split_ids"] is None
    ids = [vi["item"]["id"] for vi in inv["valued_items"]][:3]
    c.put(f"/api/processes/{pid}/inventory", json={**inv, "split_ids": ids})
    assert c.get(f"/api/processes/{pid}/inventory").json()["split_ids"] == ids
