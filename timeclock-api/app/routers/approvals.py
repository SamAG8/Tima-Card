import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pytz

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User
from app.models.time_clock import TimeEntry, TimeEntryApproval, WorkerManager

router = APIRouter(prefix="/approvals", tags=["Approvals"])

MANAGER_ROLES = ["OWNER", "ADMIN", "MANAGER", "admin", "super_admin", "manager"]


class ApprovalRequest(BaseModel):
    company_id: str
    time_entry_id: str
    result: str         # APPROVED | REJECTED
    notes: Optional[str] = None


@router.get("/pending")
def get_pending_entries(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all SUBMITTED entries that this manager needs to review."""
    require_subscription(company_id, db)
    role_key = require_role(str(current_user.id), company_id, MANAGER_ROLES, db)

    user_row = db.query(User).filter(User.id == current_user.id).first()
    is_super = bool(user_row and getattr(user_row, "is_superadmin", False))

    def _worker_label(u: User | None) -> str:
        """Always non-empty for UI — never rely on raw user_id."""
        if not u:
            return "Employee (not in directory)"
        parts = f"{u.first_name or ''} {u.last_name or ''}".strip()
        if parts:
            return parts
        em = (u.email or "").strip()
        if em:
            return em
        return "Unnamed employee"

    # Join public.users so display name/email always load with the entry (same query).
    base = (
        db.query(TimeEntry, User)
        .outerjoin(User, TimeEntry.user_id == User.id)
        .filter(
            TimeEntry.company_id == company_id,
            TimeEntry.status == "SUBMITTED",
            TimeEntry.deleted_at.is_(None),
        )
    )

    # Company admins / superadmin see every SUBMITTED entry in the company.
    # Line managers only see entries for workers assigned to them in worker_managers.
    if role_key in ("ADMIN", "super_admin") or is_super:
        rows = base.order_by(TimeEntry.work_date.desc()).all()
    else:
        managed = (
            db.query(WorkerManager.worker_user_id)
            .filter(
                WorkerManager.company_id == company_id,
                WorkerManager.manager_user_id == current_user.id,
                WorkerManager.deleted_at.is_(None),
            )
            .all()
        )
        managed_ids = [r.worker_user_id for r in managed]
        if not managed_ids:
            return []
        rows = (
            base.filter(TimeEntry.user_id.in_(managed_ids))
            .order_by(TimeEntry.work_date.desc())
            .all()
        )

    out = []
    for e, wu in rows:
        out.append(
            {
                "id": str(e.id),
                "user_id": str(e.user_id),
                "project_id": str(e.project_id),
                "work_date": str(e.work_date),
                "clock_in": e.clock_in,
                "clock_out": e.clock_out,
                "user_timezone": e.user_timezone,
                "entry_type": e.entry_type,
                "manual_reason": e.manual_reason,
                "manual_note": e.manual_note,
                "description": e.description,
                "worker_name": _worker_label(wu),
                "worker_email": wu.email if wu else None,
            }
        )
    return out


@router.post("/review")
def review_entry(
    body: ApprovalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Approve or reject a submitted time entry."""
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, MANAGER_ROLES, db)

    if body.result not in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="result must be APPROVED or REJECTED")

    entry = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.id == body.time_entry_id,
            TimeEntry.company_id == body.company_id,
            TimeEntry.deleted_at.is_(None),
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.status != "SUBMITTED":
        raise HTTPException(status_code=409, detail="Entry is not in SUBMITTED state")

    now_utc = datetime.utcnow().replace(tzinfo=pytz.utc)
    entry.status = body.result
    entry.updated_at = now_utc

    approval = TimeEntryApproval(
        id=uuid.uuid4(),
        company_id=body.company_id,
        time_entry_id=body.time_entry_id,
        approver_user_id=current_user.id,
        result=body.result,
        notes=body.notes,
    )
    db.add(approval)
    db.commit()

    return {"status": "ok", "entry_id": body.time_entry_id, "result": body.result}
