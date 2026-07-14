"""
Tests for /api/v1/leave endpoints.
"""
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

COMPANY_ID = "aaaaaaaa-0000-0000-0000-000000000001"


class TestLeaveTypes:
    def test_returns_list(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db

        fake_type = MagicMock()
        fake_type.id = "lt1"
        fake_type.name = "Vacation"
        fake_type.default_days_per_year = 15
        fake_type.is_unlimited = False
        fake_type.is_active = True

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.order_by.return_value.all.return_value = [fake_type]

        with patch("app.routers.leave.require_subscription"):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.get("/api/v1/leave/types", params={"company_id": COMPANY_ID})
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_missing_company_id_returns_422(self, client: TestClient):
        resp = client.get("/api/v1/leave/types")
        assert resp.status_code == 422


class TestLeaveRequest:
    def test_end_before_start_returns_400(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db

        db_mock = MagicMock()

        with patch("app.routers.leave.require_subscription"):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.post("/api/v1/leave/request", json={
                "company_id":    COMPANY_ID,
                "leave_type_id": "lt1",
                "start_date":    "2026-04-10",
                "end_date":      "2026-04-05",  # before start
            })
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 400

    def test_missing_required_fields_returns_422(self, client: TestClient):
        resp = client.post("/api/v1/leave/request", json={"company_id": COMPANY_ID})
        assert resp.status_code == 422


class TestLeaveReview:
    def test_invalid_result_value_returns_422(self, client: TestClient):
        resp = client.post("/api/v1/leave/review", json={
            "company_id":       COMPANY_ID,
            "leave_request_id": "lr1",
            "result":           "MAYBE",  # invalid
        })
        assert resp.status_code == 422

    def test_not_found_returns_404(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = None

        with (
            patch("app.routers.leave.require_subscription"),
            patch("app.routers.leave.require_role"),
        ):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.post("/api/v1/leave/review", json={
                "company_id":       COMPANY_ID,
                "leave_request_id": "00000000-0000-0000-0000-000000000099",
                "result":           "APPROVED",
            })
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 404
