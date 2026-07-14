"""
Tests for /api/v1/entries endpoints.
DB and subscription middleware are mocked.
"""
import uuid
from unittest.mock import MagicMock, patch
from datetime import datetime
import pytz

import pytest
from fastapi.testclient import TestClient

from tests.conftest import FAKE_USER


COMPANY_ID = "aaaaaaaa-0000-0000-0000-000000000001"
PROJECT_ID = "bbbbbbbb-0000-0000-0000-000000000001"


# ---------------------------------------------------------------------------
# Clock In
# ---------------------------------------------------------------------------
class TestClockIn:
    def test_clock_in_success(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from tests.conftest import override_get_db
        from app.models.time_clock import TimeEntry

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = None

        saved = {}
        def fake_add(obj):
            saved["entry"] = obj
        def fake_refresh(obj):
            obj.clock_out = None
            obj.description = None
        db_mock.add.side_effect = fake_add
        db_mock.refresh.side_effect = fake_refresh

        with patch("app.routers.entries.require_subscription"):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.post("/api/v1/entries/clock-in", json={
                "company_id":    COMPANY_ID,
                "project_id":    PROJECT_ID,
                "user_timezone": "America/Toronto",
            })
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ACTIVE"
        assert data["entry_type"] == "NORMAL"

    def test_clock_in_missing_fields(self, client: TestClient):
        resp = client.post("/api/v1/entries/clock-in", json={})
        assert resp.status_code == 422

    def test_clock_in_duplicate_returns_409(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from app.models.time_clock import TimeEntry

        fake_entry = MagicMock(spec=TimeEntry)
        fake_entry.id = uuid.uuid4()
        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = fake_entry

        with patch("app.routers.entries.require_subscription"):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.post("/api/v1/entries/clock-in", json={
                "company_id": COMPANY_ID,
                "project_id": PROJECT_ID,
                "user_timezone": "America/Toronto",
            })
            from tests.conftest import override_get_db
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 409
        assert "clocked in" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Clock Out
# ---------------------------------------------------------------------------
class TestClockOut:
    def test_clock_out_no_active_entry_returns_404(self, client: TestClient):
        from app.database import get_db
        from app.main import app

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = None

        with patch("app.routers.entries.require_subscription"):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.post("/api/v1/entries/clock-out", json={"company_id": COMPANY_ID})
            from tests.conftest import override_get_db
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 404

    def test_clock_out_missing_company_returns_422(self, client: TestClient):
        resp = client.post("/api/v1/entries/clock-out", json={})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Active Entry
# ---------------------------------------------------------------------------
class TestActiveEntry:
    def test_no_active_entry(self, client: TestClient):
        from app.database import get_db
        from app.main import app

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = None

        with patch("app.routers.entries.require_subscription"):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.get("/api/v1/entries/active", params={"company_id": COMPANY_ID})
            from tests.conftest import override_get_db
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        assert resp.json()["clocked_in"] is False

    def test_has_active_entry(self, client: TestClient):
        from app.database import get_db
        from app.main import app
        from app.models.time_clock import TimeEntry

        fake_entry = MagicMock(spec=TimeEntry)
        fake_entry.id = uuid.uuid4()
        fake_entry.clock_in = datetime.utcnow().replace(tzinfo=pytz.utc)
        fake_entry.project_id = uuid.UUID(PROJECT_ID)
        fake_entry.user_timezone = "America/Toronto"

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = fake_entry

        with patch("app.routers.entries.require_subscription"):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.get("/api/v1/entries/active", params={"company_id": COMPANY_ID})
            from tests.conftest import override_get_db
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        assert resp.json()["clocked_in"] is True


# ---------------------------------------------------------------------------
# My Entries
# ---------------------------------------------------------------------------
class TestMyEntries:
    def test_returns_list(self, client: TestClient):
        from app.database import get_db
        from app.main import app

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []

        with patch("app.routers.entries.require_subscription"):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.get("/api/v1/entries/my", params={"company_id": COMPANY_ID})
            from tests.conftest import override_get_db
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# Manual Entry
# ---------------------------------------------------------------------------
class TestManualEntry:
    def test_clock_out_before_clock_in_returns_400(self, client: TestClient):
        from app.database import get_db
        from app.main import app

        db_mock = MagicMock()

        with patch("app.routers.entries.require_subscription"):
            app.dependency_overrides[get_db] = lambda: (yield db_mock)
            resp = client.post("/api/v1/entries/manual", json={
                "company_id":    COMPANY_ID,
                "project_id":    PROJECT_ID,
                "work_date":     "2026-04-01",
                "clock_in":      "2026-04-01T17:00:00-04:00",
                "clock_out":     "2026-04-01T08:00:00-04:00",  # before clock_in
                "user_timezone": "America/Toronto",
                "manual_reason": "FORGOT",
            })
            from tests.conftest import override_get_db
            app.dependency_overrides[get_db] = override_get_db

        assert resp.status_code == 400

    def test_missing_required_fields_returns_422(self, client: TestClient):
        resp = client.post("/api/v1/entries/manual", json={
            "company_id": COMPANY_ID,
        })
        assert resp.status_code == 422
