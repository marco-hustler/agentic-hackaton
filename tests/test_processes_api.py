"""Process CRUD API + SQLite persistence."""

from fastapi.testclient import TestClient

from cleanbreak.api.app import app


def test_me_returns_stub_account() -> None:
    client = TestClient(app)
    res = client.get("/api/me")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "local-user"
    assert "@" in body["email"]
    assert body["name"]
    assert body["initials"]


def test_create_list_and_get_process() -> None:
    client = TestClient(app)

    empty = client.get("/api/processes")
    assert empty.status_code == 200
    assert empty.json() == []

    created = client.post(
        "/api/processes",
        json={
            "kind": "separation",
            "title": "Alex & Sam",
            "participant_emails": ["sam@example.com", "friend@example.com", "sam@example.com"],
        },
    )
    assert created.status_code == 201
    process = created.json()
    assert process["title"] == "Alex & Sam"
    assert process["kind"] == "separation"
    assert process["status"] == "draft"
    assert process["participant_emails"] == ["sam@example.com", "friend@example.com"]
    assert process["id"]
    assert process["created_at"]

    listed = client.get("/api/processes").json()
    assert len(listed) == 1
    assert listed[0]["id"] == process["id"]

    fetched = client.get(f"/api/processes/{process['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Alex & Sam"


def test_create_process_default_title_by_kind() -> None:
    client = TestClient(app)
    res = client.post("/api/processes", json={"kind": "inheritance"})
    assert res.status_code == 201
    assert res.json()["title"] == "Inheritance"


def test_patch_process_status() -> None:
    client = TestClient(app)
    process = client.post("/api/processes", json={"kind": "other"}).json()
    patched = client.patch(
        f"/api/processes/{process['id']}",
        json={"status": "collecting"},
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "collecting"


def test_patch_process_participants() -> None:
    client = TestClient(app)
    process = client.post("/api/processes", json={"kind": "separation"}).json()
    assert process["participant_emails"] == []

    patched = client.patch(
        f"/api/processes/{process['id']}",
        json={"participant_emails": ["sam@example.com", "friend@example.com", "sam@example.com"]},
    )
    assert patched.status_code == 200
    assert patched.json()["participant_emails"] == ["sam@example.com", "friend@example.com"]

    cleared = client.patch(
        f"/api/processes/{process['id']}",
        json={"participant_emails": []},
    )
    assert cleared.status_code == 200
    assert cleared.json()["participant_emails"] == []


def test_get_missing_process_404() -> None:
    client = TestClient(app)
    assert client.get("/api/processes/does-not-exist").status_code == 404


def test_patch_title_and_participants_and_delete_process() -> None:
    client = TestClient(app)
    process = client.post("/api/processes", json={"kind": "separation", "title": "Old"}).json()
    pid = process["id"]

    patched = client.patch(
        f"/api/processes/{pid}",
        json={"title": "Berlin WG", "participant_emails": ["Ste@Example.com", "marco@example.com", "ste@example.com"]},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["title"] == "Berlin WG"
    assert body["status"] == "draft"
    assert body["participant_emails"] == ["ste@example.com", "marco@example.com"]

    deleted = client.delete(f"/api/processes/{pid}")
    assert deleted.status_code == 204
    assert client.get(f"/api/processes/{pid}").status_code == 404
    assert client.delete(f"/api/processes/{pid}").status_code == 404
