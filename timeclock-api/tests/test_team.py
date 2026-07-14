"""
Tests for /api/v1/team endpoints.
"""
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

COMPANY_ID = "aaaaaaaa-0000-0000-0000-000000000001"
WORKER_ID  = "cccccccc-0000-0000-0000-000000000001"
MANAGER_ID = "dddddddd-0000-0000-0000-000000000001"


class TestGetMembers:
    def test_returns_list(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db

        db_mock = MagicMock()
        db_mock.query.return_value.join.return_value.join.return_value.filter.return_value.all.return_value = []

        with (
            patch("app.routers.team.require_subscription"),
            patch("app.routers.team.require_role"),
        ):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.get("/api/v1/team/members", params={"company_id": COMPANY_ID})
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_missing_company_id_returns_422(self, client: TestClient):
        resp = client.get("/api/v1/team/members")
        assert resp.status_code == 422


class TestAssignManager:
    def test_assign_requires_admin_role(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db
        from fastapi import HTTPException

        db_mock = MagicMock()

        with (
            patch("app.routers.team.require_subscription"),
            patch("app.routers.team.require_role", side_effect=HTTPException(status_code=403, detail="Forbidden")),
        ):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.post("/api/v1/team/assign-manager", json={
                "company_id":      COMPANY_ID,
                "worker_user_id":  WORKER_ID,
                "manager_user_id": MANAGER_ID,
            })
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 403

    def test_missing_fields_returns_422(self, client: TestClient):
        resp = client.post("/api/v1/team/assign-manager", json={"company_id": COMPANY_ID})
        assert resp.status_code == 422


class TestUpdatePermissions:
    def test_no_changes_returns_ok(self, client: TestClient):
        resp = client.post("/api/v1/team/update-permissions", json={"user_id": WORKER_ID})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_missing_user_id_returns_422(self, client: TestClient):
        resp = client.post("/api/v1/team/update-permissions", json={})
        assert resp.status_code == 422


class TestRemoveManager:
    def test_success(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db

        db_mock = MagicMock()

        app.dependency_overrides[get_db] = lambda: (yield db_mock)
        resp = client.post("/api/v1/team/remove-manager", json={
            "company_id":      COMPANY_ID,
            "worker_user_id":  WORKER_ID,
            "manager_user_id": MANAGER_ID,
        })
        app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        assert resp.json()["ok"] is True
