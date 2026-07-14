"""
Tests for /api/v1/budget-codes endpoints.
"""
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

COMPANY_ID = "aaaaaaaa-0000-0000-0000-000000000001"


class TestGetBudgetCodes:
    def test_returns_list(self, client: TestClient):
        fake_row = MagicMock()
        fake_row.id = "bc1"
        fake_row.code = "CARP-RF-01"
        fake_row.name = "Wood Framing"
        fake_row.category = "Rough Framing"
        fake_row.division = "Carpentry & Millwork"

        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db

        db_mock = MagicMock()
        db_mock.execute.return_value.fetchall.return_value = [fake_row]

        app.dependency_overrides[get_db] = lambda: (yield db_mock)
        resp = client.get("/api/v1/budget-codes", params={"company_id": COMPANY_ID})
        app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert data[0]["code"] == "CARP-RF-01"
        assert data[0]["division"] == "Carpentry & Millwork"

    def test_empty_returns_empty_list(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db

        db_mock = MagicMock()
        db_mock.execute.return_value.fetchall.return_value = []

        app.dependency_overrides[get_db] = lambda: (yield db_mock)
        resp = client.get("/api/v1/budget-codes", params={"company_id": COMPANY_ID})
        app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        assert resp.json() == []

    def test_missing_company_id_returns_422(self, client: TestClient):
        resp = client.get("/api/v1/budget-codes")
        assert resp.status_code == 422


class TestRequestAdjustment:
    def test_entry_not_found_returns_404(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db

        db_mock = MagicMock()
        db_mock.execute.return_value.fetchone.return_value = None

        app.dependency_overrides[get_db] = lambda: (yield db_mock)
        resp = client.post("/api/v1/budget-codes/request-adjustment", json={
            "company_id":       COMPANY_ID,
            "time_entry_id":    "00000000-0000-0000-0000-000000000099",
            "adjustment_type":  "CLOCK_IN",
            "requested_clock_in": "2026-04-01T07:00:00+00:00",
        })
        app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 404

    def test_valid_request_returns_ok(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db

        fake_entry = MagicMock()
        fake_entry.id = "some-id"

        db_mock = MagicMock()
        db_mock.execute.return_value.fetchone.return_value = fake_entry

        app.dependency_overrides[get_db] = lambda: (yield db_mock)
        resp = client.post("/api/v1/budget-codes/request-adjustment", json={
            "company_id":       COMPANY_ID,
            "time_entry_id":    "00000000-0000-0000-0000-000000000001",
            "adjustment_type":  "CLOCK_IN",
            "requested_clock_in": "2026-04-01T07:00:00+00:00",
            "reason":           "Started earlier",
        })
        app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_missing_fields_returns_422(self, client: TestClient):
        resp = client.post("/api/v1/budget-codes/request-adjustment", json={})
        assert resp.status_code == 422
