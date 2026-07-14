import uuid
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pytz

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User
from app.models.time_clock import LeaveType, LeaveBalance, LeaveRequest

router = APIRouter(prefix="/leave", tags=["Leave"])

MANAGER_ROLES = ["OWNER", "ADMIN", "MANAGER", "admin", "super_admin", "manager"]


class LeaveRequestCreate(BaseModel):
    company_id: str
    leave_type_id: str
    start_date: str     # ISO date
    end_date: str
    notes: Optional[str] = None


class LeaveReview(BaseModel):
    company_id: str
    leave_request_id: str
    result: str         # APPROVED | REJECTED
    notes: Optional[str] = None

    def model_post_init(self, __context):
        if self.result not in ("APPROVED", "REJECTED"):
            raise ValueError("result must be APPROVED or REJECTED")


@router.get("/types")
def get_leave_types(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return global + company-specific leave types."""
    require_subscription(company_id, db)

    types = (
        db.query(LeaveType)
        .filter(
            LeaveType.is_active == True,
            LeaveType.deleted_at.is_(None),
            (LeaveType.company_id == company_id) | (LeaveType.company_id.is_(None)),
        )
        .all()
    )
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "default_days_per_year": float(t.default_days_per_year) if t.default_days_per_year else None,
            "is_unlimited": t.is_unlimited,
        }
        for t in types
    ]


@router.get("/balances")
def get_my_balances(
    company_id: str,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current user's leave balances."""
    require_subscription(company_id, db)

    target_year = year or date.today().year
    balances = (
        db.query(LeaveBalance, LeaveType)
        .join(LeaveType, LeaveType.id == LeaveBalance.leave_type_id)
        .filter(
            LeaveBalance.company_id == company_id,
            LeaveBalance.user_id == current_user.id,
            LeaveBalance.year == target_year,
        )
        .all()
    )
    return [
        {
            "leave_type_id": str(b.leave_type_id),
            "leave_type_name": t.name,
            "year": b.year,
            "total_days": float(b.total_days),
            "used_days": float(b.used_days),
            "remaining_days": float(b.total_days - b.used_days),
            "is_unlimited": t.is_unlimited,
        }
        for b, t in balances
    ]


@router.post("/request")
def create_leave_request(
    body: LeaveRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)

    start = date.fromisoformat(body.start_date)
    end = date.fromisoformat(body.end_date)

    if end < start:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    request = LeaveRequest(
        id=uuid.uuid4(),
        company_id=body.company_id,
        user_id=current_user.id,
        leave_type_id=body.leave_type_id,
        start_date=start,
        end_date=end,
        notes=body.notes,
        status="PENDING",
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    return {"id": str(request.id), "status": request.status}


@router.get("/my-requests")
def get_my_requests(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(company_id, db)

    requests = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.company_id == company_id,
            LeaveRequest.user_id == current_user.id,
            LeaveRequest.deleted_at.is_(None),
        )
        .order_by(LeaveRequest.start_date.desc())
        .all()
    )
    return [
        {
            "id": str(r.id),
            "leave_type_id": str(r.leave_type_id),
            "start_date": str(r.start_date),
            "end_date": str(r.end_date),
            "status": r.status,
            "notes": r.notes,
            "reviewed_at": r.reviewed_at,
        }
        for r in requests
    ]


@router.get("/pending")
def get_pending_requests(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manager: view all pending leave requests for their team."""
    require_subscription(company_id, db)
    require_role(str(current_user.id), company_id, MANAGER_ROLES, db)

    requests = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.company_id == company_id,
            LeaveRequest.status == "PENDING",
            LeaveRequest.deleted_at.is_(None),
        )
        .order_by(LeaveRequest.start_date.asc())
        .all()
    )
    return [
        {
            "id": str(r.id),
            "user_id": str(r.user_id),
            "leave_type_id": str(r.leave_type_id),
            "start_date": str(r.start_date),
            "end_date": str(r.end_date),
            "notes": r.notes,
        }
        for r in requests
    ]


@router.post("/review")
def review_leave_request(
    body: LeaveReview,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, MANAGER_ROLES, db)

    if body.result not in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="result must be APPROVED or REJECTED")

    request = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.id == body.leave_request_id,
            LeaveRequest.company_id == body.company_id,
            LeaveRequest.deleted_at.is_(None),
        )
        .first()
    )
    if not request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if request.status != "PENDING":
        raise HTTPException(status_code=409, detail="Request already reviewed")

    now_utc = datetime.utcnow().replace(tzinfo=pytz.utc)
    request.status = body.result
    request.reviewed_by_user_id = current_user.id
    request.reviewed_at = now_utc
    request.updated_at = now_utc

    # Deduct used days from balance if approved
    if body.result == "APPROVED":
        days_requested = (request.end_date - request.start_date).days + 1
        balance = (
            db.query(LeaveBalance)
            .filter(
                LeaveBalance.company_id == body.company_id,
                LeaveBalance.user_id == request.user_id,
                LeaveBalance.leave_type_id == request.leave_type_id,
                LeaveBalance.year == request.start_date.year,
            )
            .first()
        )
        if balance:
            balance.used_days = float(balance.used_days) + days_requested
            balance.updated_at = now_utc

    db.commit()
    return {"status": "ok", "result": body.result}
