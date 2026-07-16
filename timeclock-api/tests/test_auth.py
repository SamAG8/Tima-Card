"""
Tests for the auth layer after aligning with CDefApp's auth_service pattern:

- verify_token local HS256 fast-path: valid / expired / malformed
- get_current_user bootstrap: existing-by-id / reuse-by-email / create-new
  (a valid token must never 404 just because the profile row is missing yet)

DB is mocked (MagicMock) exactly like test_access_control_logic.py, because the
SQLite test engine cannot materialise the schema-qualified public.users table.
"""
import time
import uuid
from unittest.mock import MagicMock

import jwt as pyjwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.config import settings
from app.auth import verify_token, get_current_user
from app.models.shared import User

SECRET = "unit-test-hs256-secret-0123456789-abcdef"  # >=32 bytes for HS256
USER_ID = "11111111-1111-1111-1111-111111111111"


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _make_token(secret=SECRET, sub=USER_ID, email="worker@test.com", exp_offset=3600, aud="authenticated"):
    payload = {"sub": sub, "email": email, "aud": aud, "exp": int(time.time()) + exp_offset}
    return pyjwt.encode(payload, secret, algorithm="HS256")


# ── verify_token: local HS256 fast-path ───────────────────────────────────

class TestVerifyTokenFastPath:
    def test_valid_token_returns_sub_and_email(self, monkeypatch):
        monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", SECRET)
        result = verify_token(_creds(_make_token()))
        assert result["sub"] == USER_ID
        assert result["email"] == "worker@test.com"

    def test_expired_token_raises_401(self, monkeypatch):
        monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", SECRET)
        token = _make_token(exp_offset=-10)
        with pytest.raises(HTTPException) as exc:
            verify_token(_creds(token))
        assert exc.value.status_code == 401
        assert "expired" in str(exc.value.detail).lower()

    def test_bad_signature_raises_401(self, monkeypatch):
        monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", SECRET)
        token = _make_token(secret="a-different-secret")
        with pytest.raises(HTTPException) as exc:
            verify_token(_creds(token))
        assert exc.value.status_code == 401

    def test_garbage_token_raises_401(self, monkeypatch):
        monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", SECRET)
        with pytest.raises(HTTPException) as exc:
            verify_token(_creds("not-a-jwt"))
        assert exc.value.status_code == 401

    def test_publishable_key_secret_skips_fast_path(self, monkeypatch):
        # An ``sb_``-prefixed key must NOT be used for local HS256 decode; the
        # code should fall through to the remote path (which we stub to observe).
        monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "sb_publishable_xxx")
        called = {}

        class _FakeUser:
            id = USER_ID
            email = "worker@test.com"

        class _FakeAuth:
            def get_user(self, token):
                called["hit"] = True
                return MagicMock(user=_FakeUser())

        class _FakeClient:
            auth = _FakeAuth()

        monkeypatch.setattr("app.auth._get_supabase", lambda: _FakeClient())
        result = verify_token(_creds("opaque-access-token"))
        assert called.get("hit") is True
        assert result["sub"] == USER_ID


# ── get_current_user: bootstrap ───────────────────────────────────────────

class TestGetCurrentUserBootstrap:
    def _payload(self, sub=USER_ID, email="worker@test.com"):
        return {"sub": sub, "email": email}

    def test_existing_user_by_id_is_returned(self):
        db = MagicMock()
        existing = User()
        existing.id = uuid.UUID(USER_ID)
        existing.email = "worker@test.com"
        db.query.return_value.filter.return_value.first.side_effect = [existing]

        result = get_current_user(self._payload(), db)

        assert result is existing
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_missing_by_id_reused_by_email(self):
        db = MagicMock()
        existing = User()
        existing.id = uuid.UUID("22222222-2222-2222-2222-222222222222")
        existing.email = "worker@test.com"
        # First lookup (by id) misses, second (by email) hits.
        db.query.return_value.filter.return_value.first.side_effect = [None, existing]

        result = get_current_user(self._payload(), db)

        assert result is existing
        db.add.assert_not_called()

    def test_new_user_is_bootstrapped_not_404(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [None, None]

        result = get_current_user(self._payload(), db)

        assert isinstance(result, User)
        assert str(result.id) == USER_ID
        assert result.email == "worker@test.com"
        db.add.assert_called_once()
        db.commit.assert_called_once()

    def test_missing_sub_raises_401(self):
        db = MagicMock()
        with pytest.raises(HTTPException) as exc:
            get_current_user({"email": "x@y.com"}, db)
        assert exc.value.status_code == 401

    def test_non_uuid_sub_raises_401(self):
        db = MagicMock()
        with pytest.raises(HTTPException) as exc:
            get_current_user({"sub": "not-a-uuid", "email": "x@y.com"}, db)
        assert exc.value.status_code == 401
