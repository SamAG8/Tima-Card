from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.shared import AppSubscription, Membership, Role, User


def require_subscription(company_id: str, db: Session) -> None:
    """Raise 422 if company_id is empty, 403 if no active TIME_CLOCK subscription."""
    if not company_id or not company_id.strip():
        raise HTTPException(status_code=422, detail="company_id is required")
    sub = (
        db.query(AppSubscription)
        .filter(
            AppSubscription.company_id == company_id,
            AppSubscription.app_key == "TIME_CLOCK",
            AppSubscription.status.in_(["ACTIVE", "TRIAL"]),
        )
        .first()
    )
    if not sub:
        raise HTTPException(status_code=403, detail="No active Time Clock subscription")


def get_user_role(user_id: str, company_id: str, db: Session) -> str:
    """Return the effective role key for a user in a company.

    Priority:
    1. users.role == 'admin' or is_superadmin → treat as ADMIN (full manager access)
    2. membership → roles.key (CDefApp roles)
    3. 403 if no membership found
    """
    # Check users table first — admin/is_superadmin always has full access
    user = db.query(User).filter(User.id == user_id).first()
    if user and (getattr(user, "is_superadmin", False) or getattr(user, "role", None) == "admin"):
        return "ADMIN"

    membership = (
        db.query(Membership, Role)
        .join(Role, Role.id == Membership.role_id)
        .filter(
            Membership.user_id == user_id,
            Membership.company_id == company_id,
            Membership.deleted_at.is_(None),
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this company")
    _, role = membership
    return role.key


def require_role(user_id: str, company_id: str, allowed_roles: list[str], db: Session) -> str:
    """Return role key if user has one of the allowed roles, else raise 403."""
    role_key = get_user_role(user_id, company_id, db)
    if role_key not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return role_key
