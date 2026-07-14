"""
Tests for payroll calculation service and report endpoints.
"""
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.services.payroll import (
    summarize_by_worker,
    summarize_by_project,
    summarize_by_budget_code,
    summarize_by_division,
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def make_row(user_id="u1", project_id="p1", hours=8.0, cost=224.0,
             budget_code_id=None, budget_code=None, budget_code_name=None,
             category=None, division=None):
    return {
        "entry_id":         str(uuid.uuid4()),
        "user_id":          user_id,
        "project_id":       project_id,
        "work_date":        "2026-04-01",
        "clock_in":         "2026-04-01T08:00:00+00:00",
        "clock_out":        "2026-04-01T16:00:00+00:00",
        "hours_worked":     hours,
        "hourly_rate":      28.0,
        "currency":         "CAD",
        "total_cost":       cost,
        "budget_code_id":   budget_code_id,
        "budget_code":      budget_code,
        "budget_code_name": budget_code_name,
        "category":         category,
        "division":         division,
    }


# ---------------------------------------------------------------------------
# summarize_by_worker
# ---------------------------------------------------------------------------
class TestSummarizeByWorker:
    def test_single_worker(self):
        rows = [make_row(user_id="u1", hours=8.0, cost=224.0)]
        result = summarize_by_worker(rows)
        assert len(result) == 1
        assert result[0]["user_id"] == "u1"
        assert result[0]["total_hours"] == 8.0
        assert result[0]["total_cost"] == 224.0
        assert result[0]["entries"] == 1

    def test_multiple_entries_same_worker(self):
        rows = [
            make_row(user_id="u1", hours=8.0, cost=224.0),
            make_row(user_id="u1", hours=4.0, cost=112.0),
        ]
        result = summarize_by_worker(rows)
        assert len(result) == 1
        assert result[0]["total_hours"] == 12.0
        assert result[0]["total_cost"] == 336.0
        assert result[0]["entries"] == 2

    def test_multiple_workers(self):
        rows = [
            make_row(user_id="u1", hours=8.0, cost=224.0),
            make_row(user_id="u2", hours=6.0, cost=168.0),
        ]
        result = summarize_by_worker(rows)
        assert len(result) == 2
        user_ids = {r["user_id"] for r in result}
        assert user_ids == {"u1", "u2"}

    def test_empty_rows(self):
        assert summarize_by_worker([]) == []

    def test_null_cost_treated_as_zero(self):
        rows = [make_row(user_id="u1", hours=8.0, cost=None)]
        result = summarize_by_worker(rows)
        assert result[0]["total_cost"] == 0.0


# ---------------------------------------------------------------------------
# summarize_by_project
# ---------------------------------------------------------------------------
class TestSummarizeByProject:
    def test_single_project(self):
        rows = [make_row(project_id="p1", hours=8.0, cost=224.0)]
        result = summarize_by_project(rows)
        assert len(result) == 1
        assert result[0]["project_id"] == "p1"

    def test_aggregates_correctly(self):
        rows = [
            make_row(project_id="p1", hours=8.0, cost=224.0),
            make_row(project_id="p1", hours=8.0, cost=224.0),
            make_row(project_id="p2", hours=4.0, cost=112.0),
        ]
        result = summarize_by_project(rows)
        assert len(result) == 2
        p1 = next(r for r in result if r["project_id"] == "p1")
        assert p1["total_hours"] == 16.0
        assert p1["entries"] == 2


# ---------------------------------------------------------------------------
# summarize_by_budget_code
# ---------------------------------------------------------------------------
class TestSummarizeByBudgetCode:
    def test_groups_by_code(self):
        rows = [
            make_row(budget_code_id="bc1", budget_code="CARP-RF-01",
                     budget_code_name="Wood Framing", division="Carpentry", hours=8.0, cost=224.0),
            make_row(budget_code_id="bc1", budget_code="CARP-RF-01",
                     budget_code_name="Wood Framing", division="Carpentry", hours=4.0, cost=112.0),
        ]
        result = summarize_by_budget_code(rows)
        assert len(result) == 1
        assert result[0]["total_hours"] == 12.0
        assert result[0]["budget_code"] == "CARP-RF-01"

    def test_untagged_grouped_together(self):
        rows = [
            make_row(budget_code_id=None, hours=8.0, cost=224.0),
            make_row(budget_code_id=None, hours=4.0, cost=112.0),
        ]
        result = summarize_by_budget_code(rows)
        assert len(result) == 1
        assert result[0]["budget_code_id"] is None
        assert result[0]["total_hours"] == 12.0

    def test_multiple_codes(self):
        rows = [
            make_row(budget_code_id="bc1", hours=8.0, cost=224.0),
            make_row(budget_code_id="bc2", hours=6.0, cost=168.0),
            make_row(budget_code_id=None,  hours=2.0, cost=56.0),
        ]
        result = summarize_by_budget_code(rows)
        assert len(result) == 3


# ---------------------------------------------------------------------------
# summarize_by_division
# ---------------------------------------------------------------------------
class TestSummarizeByDivision:
    def test_groups_by_division(self):
        rows = [
            make_row(division="Carpentry & Millwork", hours=8.0, cost=224.0),
            make_row(division="Carpentry & Millwork", hours=4.0, cost=112.0),
            make_row(division="Concrete",             hours=6.0, cost=168.0),
        ]
        result = summarize_by_division(rows)
        assert len(result) == 2
        carp = next(r for r in result if r["division"] == "Carpentry & Millwork")
        assert carp["total_hours"] == 12.0
        assert carp["entries"] == 2

    def test_sorted_by_hours_descending(self):
        rows = [
            make_row(division="Small Div",  hours=2.0, cost=56.0),
            make_row(division="Big Div",    hours=20.0, cost=560.0),
            make_row(division="Medium Div", hours=10.0, cost=280.0),
        ]
        result = summarize_by_division(rows)
        hours = [r["total_hours"] for r in result]
        assert hours == sorted(hours, reverse=True)

    def test_none_division_grouped_as_untagged(self):
        rows = [make_row(division=None, hours=8.0, cost=224.0)]
        result = summarize_by_division(rows)
        assert result[0]["division"] == "Untagged"


# ---------------------------------------------------------------------------
# Report endpoint — basic smoke test
# ---------------------------------------------------------------------------
class TestReportEndpoint:
    def test_payroll_report_requires_auth(self):
        from fastapi.testclient import TestClient
        from app.main import app
        # Call without overriding auth — should still work since conftest patches it
        client = TestClient(app)
        with (
            patch("app.routers.reports.require_subscription"),
            patch("app.routers.reports.require_role"),
            patch("app.routers.reports.calculate_payroll", return_value=[]),
        ):
            resp = client.get("/api/v1/reports/payroll", params={
                "company_id": "aaaaaaaa-0000-0000-0000-000000000001",
                "start_date": "2026-04-01",
                "end_date":   "2026-04-30",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert "by_worker" in data
        assert "by_project" in data
        assert "by_budget_code" in data
        assert "by_division" in data
        assert data["total_entries"] == 0
