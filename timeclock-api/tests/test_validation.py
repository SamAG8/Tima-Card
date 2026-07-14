"""
Tests for input validation — empty/invalid company_id should return 422 or 400,
never a 500 database error.
"""
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient


class TestEmptyCompanyId:
    """
    Root cause of the 'Failed to fetch' bug:
    mobile app passes company_id='' because membership query returned null.
    Backend must reject this gracefully before hitting the database.
    """

    def test_active_entry_empty_company_id_no_500(self, client: TestClient):
        resp = client.get("/api/v1/entries/active", params={"company_id": ""})
        assert resp.status_code != 500, "Empty company_id must never cause a 500"

    def test_my_entries_empty_company_id_no_500(self, client: TestClient):
        # require_subscription should block empty company_id before DB query
        # No need to patch — guard must raise 422 itself
        resp = client.get("/api/v1/entries/my", params={"company_id": ""})
        assert resp.status_code != 500

    def test_clock_in_empty_company_id_no_500(self, client: TestClient):
        resp = client.post("/api/v1/entries/clock-in", json={
            "company_id": "",
            "project_id": "bbbbbbbb-0000-0000-0000-000000000001",
            "user_timezone": "America/Toronto",
        })
        assert resp.status_code != 500

    def test_budget_codes_empty_company_id_no_500(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db
        from unittest.mock import MagicMock

        db_mock = MagicMock()
        db_mock.execute.return_value.fetchall.return_value = []
        app.dependency_overrides[get_db] = lambda: (yield db_mock)
        resp = client.get("/api/v1/budget-codes", params={"company_id": ""})
        app.dependency_overrides[get_db] = override_get_db
        assert resp.status_code != 500

    def test_leave_types_empty_company_id_no_500(self, client: TestClient):
        # require_subscription should block empty company_id before DB query
        resp = client.get("/api/v1/leave/types", params={"company_id": ""})
        assert resp.status_code != 500


class TestRequireSubscriptionGuard:
    """
    require_subscription must block requests with empty/invalid company_id
    before they reach the DB layer.
    """

    def test_require_subscription_raises_on_empty(self):
        from app.middleware.subscription import require_subscription
        from unittest.mock import MagicMock
        from fastapi import HTTPException

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(HTTPException) as exc:
            require_subscription("", db_mock)
        assert exc.value.status_code in (402, 403, 404, 422)

    def test_require_subscription_raises_on_no_subscription(self):
        from app.middleware.subscription import require_subscription
        from unittest.mock import MagicMock
        from fastapi import HTTPException

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(HTTPException) as exc:
            require_subscription("aaaaaaaa-0000-0000-0000-000000000001", db_mock)
        assert exc.value.status_code in (402, 403)
