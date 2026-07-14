"""
Local tests for access control — **real** functions from `app.middleware.subscription`
(`require_subscription`, `get_user_role`, `require_role`). The DB session is mocked so
tests run without Postgres; behaviour matches production logic.

---

## Backend roles (summary)

- **Admin (Time Clock admin path):** If `users.role == "admin"` or `is_superadmin == True`,
  then `get_user_role` returns `"ADMIN"` (full TC admin access).

- **Manager (manager path):** If not admin, role comes from **membership**: `memberships` + `roles.key`.
  If `roles.key` is in `MANAGER_ROLES` in routers (e.g. `MANAGER`, `OWNER`, `admin`, …)
  they can e.g. approve entries.

- **Worker:** Usually `users.role == "worker"` with a non-manager role on membership
  (e.g. CDefApp keys). `get_user_role` returns that `roles.key`; if the endpoint only allows
  `MANAGER_ROLES` → 403.

---

## Dev accounts (documented in Rules4Cursor.md — real database)

These are **not** used by automated tests (they need live JWTs):

| Role | Sample email | Notes |
|------|----------------|-------|
| Admin + platform superadmin | `asgari@thepersa.com` | `role=admin`, `is_superadmin=true` |
| Worker | `worker@thepersa.com` | `role=worker` |

No fixed “manager” email is listed in Rules; in practice that company is created with `memberships`
and an appropriate `roles.key` (e.g. `MANAGER`).
"""
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.middleware.subscription import (
    get_user_role,
    require_role,
    require_subscription,
)
from app.models.shared import AppSubscription, Membership, Role, User

COMPANY_ID = "aaaaaaaa-0000-0000-0000-000000000001"
USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")


def _mock_session_user_only(user: MagicMock | None) -> MagicMock:
    """db.query(User).filter(...).first() -> user"""
    db = MagicMock()
    q_user = MagicMock()
    q_user.filter.return_value.first.return_value = user
    db.query.return_value = q_user

    def query_side_effect(*entities):
        if entities[0] is User:
            return q_user
        raise AssertionError(f"Unexpected query entity: {entities}")

    db.query.side_effect = query_side_effect
    return db


def _mock_session_membership(user: MagicMock, membership_row: tuple | None) -> MagicMock:
    """First query: User. Second: (Membership, Role) join."""
    db = MagicMock()
    q_user = MagicMock()
    q_user.filter.return_value.first.return_value = user

    q_mem = MagicMock()
    q_mem.join.return_value.filter.return_value.first.return_value = membership_row

    def query_side_effect(*entities):
        if entities[0] is User:
            return q_user
        if entities[0] is Membership:
            return q_mem
        raise AssertionError(f"Unexpected query entity: {entities}")

    db.query.side_effect = query_side_effect
    return db


def _mock_subscription(active: bool) -> MagicMock:
    db = MagicMock()
    sub = MagicMock(spec=AppSubscription) if active else None
    q = MagicMock()
    q.filter.return_value.first.return_value = sub
    db.query.return_value = q

    def query_side_effect(*entities):
        if entities[0] is AppSubscription:
            return q
        raise AssertionError(f"Unexpected query entity: {entities}")

    db.query.side_effect = query_side_effect
    return db


def _user(role: str = "worker", is_superadmin: bool = False) -> MagicMock:
    u = MagicMock(spec=User)
    u.id = USER_ID
    u.role = role
    u.is_superadmin = is_superadmin
    return u


def _role_key(key: str) -> MagicMock:
    r = MagicMock(spec=Role)
    r.key = key
    return r


class TestRequireSubscription:
    def test_empty_company_id_422(self):
        db = MagicMock()
        with pytest.raises(HTTPException) as exc:
            require_subscription("", db)
        assert exc.value.status_code == 422

    def test_whitespace_company_id_422(self):
        db = MagicMock()
        with pytest.raises(HTTPException) as exc:
            require_subscription("   ", db)
        assert exc.value.status_code == 422

    def test_no_subscription_403(self):
        db = _mock_subscription(active=False)
        with pytest.raises(HTTPException) as exc:
            require_subscription(COMPANY_ID, db)
        assert exc.value.status_code == 403

    def test_active_subscription_ok(self):
        db = _mock_subscription(active=True)
        require_subscription(COMPANY_ID, db)  # no exception


class TestGetUserRole:
    def test_users_table_admin_returns_ADMIN(self):
        u = _user(role="admin", is_superadmin=False)
        db = _mock_session_user_only(u)
        assert get_user_role(str(USER_ID), COMPANY_ID, db) == "ADMIN"

    def test_is_superadmin_returns_ADMIN(self):
        u = _user(role="worker", is_superadmin=True)
        db = _mock_session_user_only(u)
        assert get_user_role(str(USER_ID), COMPANY_ID, db) == "ADMIN"

    def test_membership_returns_role_key_manager(self):
        u = _user(role="worker", is_superadmin=False)
        mem = MagicMock(spec=Membership)
        role = _role_key("MANAGER")
        db = _mock_session_membership(u, (mem, role))
        assert get_user_role(str(USER_ID), COMPANY_ID, db) == "MANAGER"

    def test_membership_returns_role_key_trade_sub_worker_path(self):
        """CDefApp-style key — still returned as-is from get_user_role."""
        u = _user(role="worker", is_superadmin=False)
        mem = MagicMock(spec=Membership)
        role = _role_key("TRADE_SUB")
        db = _mock_session_membership(u, (mem, role))
        assert get_user_role(str(USER_ID), COMPANY_ID, db) == "TRADE_SUB"

    def test_no_user_and_no_membership_403(self):
        db = _mock_session_membership(None, None)
        with pytest.raises(HTTPException) as exc:
            get_user_role(str(USER_ID), COMPANY_ID, db)
        assert exc.value.status_code == 403


class TestRequireRole:
    def test_manager_role_allowed(self):
        u = _user(role="worker", is_superadmin=False)
        mem = MagicMock(spec=Membership)
        role = _role_key("MANAGER")
        db = _mock_session_membership(u, (mem, role))
        allowed = ["OWNER", "ADMIN", "MANAGER", "admin", "super_admin", "manager"]
        assert require_role(str(USER_ID), COMPANY_ID, allowed, db) == "MANAGER"

    def test_worker_like_role_forbidden_for_manager_only(self):
        u = _user(role="worker", is_superadmin=False)
        mem = MagicMock(spec=Membership)
        role = _role_key("TRADE_SUB")
        db = _mock_session_membership(u, (mem, role))
        allowed = ["OWNER", "ADMIN", "MANAGER", "admin", "super_admin", "manager"]
        with pytest.raises(HTTPException) as exc:
            require_role(str(USER_ID), COMPANY_ID, allowed, db)
        assert exc.value.status_code == 403

    def test_admin_user_passes_manager_gate(self):
        u = _user(role="admin", is_superadmin=False)
        db = _mock_session_user_only(u)
        allowed = ["OWNER", "ADMIN", "MANAGER", "admin", "super_admin", "manager"]
        assert require_role(str(USER_ID), COMPANY_ID, allowed, db) == "ADMIN"
