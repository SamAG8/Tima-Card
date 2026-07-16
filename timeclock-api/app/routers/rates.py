"""
Worker hourly rate management.
"""
import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User
from app.models.time_clock import WorkerRate

router = APIRouter(prefix="/rates", tags=["Worker Rates"])

from app.roles import ADMIN_ROLES


class RateCreate(BaseModel):
    company_id: str
    user_id: str
    hourly_rate: float
    currency: str = "CAD"
    effective_from: str
    effective_to: Optional[str] = None
    project_id: Optional[str] = None


@router.post("/")
def create_rate(
    body: RateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, ADMIN_ROLES, db)

    rate = WorkerRate(
        id=uuid.uuid4(),
        company_id=body.company_id,
        user_id=body.user_id,
        project_id=body.project_id,
        hourly_rate=body.hourly_rate,
        currency=body.currency,
        effective_from=date.fromisoformat(body.effective_from),
        effective_to=date.fromisoformat(body.effective_to) if body.effective_to else None,
    )
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return {"id": str(rate.id), "status": "created"}


@router.get("/")
def get_rates(
    company_id: str,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(company_id, db)
    require_role(str(current_user.id), company_id, ADMIN_ROLES, db)

    query = db.query(WorkerRate).filter(
        WorkerRate.company_id == company_id,
        WorkerRate.deleted_at.is_(None),
    )
    if user_id:
        query = query.filter(WorkerRate.user_id == user_id)

    rates = query.order_by(WorkerRate.effective_from.desc()).all()
    return [
        {
            "id": str(r.id),
            "user_id": str(r.user_id),
            "project_id": str(r.project_id) if r.project_id else None,
            "hourly_rate": float(r.hourly_rate),
            "currency": r.currency,
            "effective_from": str(r.effective_from),
            "effective_to": str(r.effective_to) if r.effective_to else None,
        }
        for r in rates
    ]
