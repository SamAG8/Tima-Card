"""
Company settings for the Time Clock module.
"""
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pytz

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User
from app.models.time_clock import CompanySettings

router = APIRouter(prefix="/settings", tags=["Settings"])

from app.roles import ADMIN_ROLES


class SettingsUpdate(BaseModel):
    company_id: str
    timezone: Optional[str] = None
    default_currency: Optional[str] = None
    break_tracking_enabled: Optional[bool] = None
    overtime_requires_approval: Optional[bool] = None
    working_hours_start: Optional[str] = None
    working_hours_end: Optional[str] = None


@router.get("/{company_id}")
def get_settings(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(company_id, db)

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()

    if not settings:
        return {
            "company_id": company_id,
            "timezone": "America/Toronto",
            "default_currency": "CAD",
            "break_tracking_enabled": False,
            "overtime_requires_approval": True,
        }

    return {
        "company_id": str(settings.company_id),
        "timezone": settings.timezone,
        "default_currency": settings.default_currency,
        "break_tracking_enabled": settings.break_tracking_enabled,
        "overtime_requires_approval": settings.overtime_requires_approval,
        "working_hours_start": str(settings.working_hours_start) if settings.working_hours_start else None,
        "working_hours_end": str(settings.working_hours_end) if settings.working_hours_end else None,
    }


@router.put("/")
def update_settings(
    body: SettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, ADMIN_ROLES, db)

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == body.company_id
    ).first()

    if not settings:
        settings = CompanySettings(id=uuid.uuid4(), company_id=body.company_id)
        db.add(settings)

    if body.timezone is not None:
        settings.timezone = body.timezone
    if body.default_currency is not None:
        settings.default_currency = body.default_currency
    if body.break_tracking_enabled is not None:
        settings.break_tracking_enabled = body.break_tracking_enabled
    if body.overtime_requires_approval is not None:
        settings.overtime_requires_approval = body.overtime_requires_approval

    settings.updated_at = datetime.utcnow().replace(tzinfo=pytz.utc)
    db.commit()
    return {"status": "ok"}
