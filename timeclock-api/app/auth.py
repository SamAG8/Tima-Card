"""
Auth — verifies Supabase JWTs, aligned with CDefApp's ``auth_service.py``.

Fast path: decode & verify the JWT locally using SUPABASE_JWT_SECRET (HS256,
no network call). Fallback: if the secret is not usable (unset or a publishable
``sb_`` key), call ``supabase.auth.get_user(token)`` and cache the result for
TOKEN_CACHE_TTL seconds so each token only hits Supabase Auth once.

``get_current_user`` bootstraps a ``public.users`` row on first login (reusing
an existing row by email for the invite flow) instead of returning 404.
"""
import time
import uuid
from threading import Lock

from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.shared import User

security = HTTPBearer()

# ── Supabase admin client (cached) ────────────────────────────────────────
_supabase_client = None


def _get_supabase():
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return _supabase_client


# ── Token cache (fallback path only) ─────────────────────────────────────
TOKEN_CACHE_TTL = 300  # seconds — matches Supabase access-token expiry window
_token_cache: dict[str, tuple[dict, float]] = {}  # token -> (payload, expires_at)
_cache_lock = Lock()


def _cache_get(token: str) -> dict | None:
    with _cache_lock:
        entry = _token_cache.get(token)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
        if entry:
            del _token_cache[token]
    return None


def _cache_set(token: str, payload: dict) -> None:
    with _cache_lock:
        # Evict expired entries if the cache grows large (safety valve).
        if len(_token_cache) > 2000:
            now = time.monotonic()
            expired = [k for k, v in _token_cache.items() if now >= v[1]]
            for k in expired:
                del _token_cache[k]
        _token_cache[token] = (payload, time.monotonic() + TOKEN_CACHE_TTL)


# ── Token Verification ────────────────────────────────────────────────────

def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    """
    Verify the Supabase JWT and return ``{'sub': user_id, 'email': ...}``.

    Fast path: local HS256 decode using SUPABASE_JWT_SECRET (zero network calls).
    Fallback: remote call to Supabase Auth API, result cached for TOKEN_CACHE_TTL s.
    """
    token = credentials.credentials

    # ── Fast path: local verification ────────────────────────────────────
    jwt_secret = getattr(settings, "SUPABASE_JWT_SECRET", "")
    if jwt_secret and not jwt_secret.startswith("sb_"):
        try:
            import jwt as pyjwt
            payload = pyjwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            sub = payload.get("sub")
            email = payload.get("email", "")
            if not sub:
                raise HTTPException(status_code=401, detail="Invalid token: missing sub")
            return {"sub": sub, "email": email}
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except pyjwt.InvalidTokenError as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    # ── Fallback: remote verify with caching ─────────────────────────────
    cached = _cache_get(token)
    if cached:
        return cached

    try:
        sb = _get_supabase()
        response = sb.auth.get_user(token)
        user = response.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        payload = {"sub": str(user.id), "email": user.email}
        _cache_set(token, payload)
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── User Bootstrap ────────────────────────────────────────────────────────

def get_current_user(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
) -> User:
    """
    Post-login profile bootstrap.

    Looks up the ``public.users`` row for the auth user id (``sub`` claim). If
    none exists, reuses a pre-created row with the same email (invite flow)
    before finally inserting a fresh row — never returns 404 for a valid token.
    """
    auth_user_id_str = payload.get("sub")
    if not auth_user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject (sub).",
        )

    try:
        auth_user_id = uuid.UUID(auth_user_id_str)
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid subject format (not a UUID).",
        )

    user = db.query(User).filter(User.id == auth_user_id).first()

    if not user:
        email = payload.get("email") or f"{auth_user_id}@unknown.email"
        # The user may have been pre-created (e.g. via company invite) with a
        # different DB id but the same email. Reuse that row rather than
        # inserting a duplicate that would violate the unique email constraint.
        user = db.query(User).filter(User.email == email).first()

        if not user:
            user = User(id=auth_user_id, email=email, is_active=True)
            db.add(user)
            db.commit()
            db.refresh(user)

    return user
