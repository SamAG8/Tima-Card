import uuid
from datetime import datetime
from typing import Optional
import pytz
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User
from app.models.time_clock import TimeEntry, TimeEntryTag, MissedEntryNotification

router = APIRouter(prefix="/entries", tags=["Time Entries"])

from app.roles import MANAGER_ROLES


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ClockInRequest(BaseModel):
    company_id: str
    project_id: str
    user_timezone: str = "America/Toronto"
    lat: Optional[float] = None
    lng: Optional[float] = None


class ClockOutRequest(BaseModel):
    company_id: str
    description: Optional[str] = None
    tags: list[str] = []
    budget_code_id: Optional[str] = None
    ai_summary: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class ManualEntryRequest(BaseModel):
    company_id: str
    project_id: str
    work_date: str                  # ISO date: "2026-03-28"
    clock_in: str                   # ISO datetime with offset: "2026-03-28T08:00:00-07:00"
    clock_out: str
    user_timezone: str = "America/Toronto"
    manual_reason: str              # FORGOT | SYSTEM_ERROR | NO_PHONE | OTHER
    manual_note: Optional[str] = None
    description: Optional[str] = None
    tags: list[str] = []


class EntryResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    clock_in: Optional[datetime]
    clock_out: Optional[datetime]
    user_timezone: str
    work_date: str
    status: str
    entry_type: str
    description: Optional[str]
    tags: list[str] = []

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _local_date_from_utc(utc_dt: datetime, timezone_str: str):
    """Convert a UTC datetime to a local date string using the given timezone."""
    tz = pytz.timezone(timezone_str)
    local_dt = utc_dt.astimezone(tz)
    return local_dt.date()


def _get_tags(db: Session, entry_id: str) -> list[str]:
    tags = db.query(TimeEntryTag).filter(TimeEntryTag.time_entry_id == entry_id).all()
    return [t.tag for t in tags]


def _save_tags(db: Session, company_id: str, entry_id: str, tags: list[str]):
    for tag in tags:
        db.add(TimeEntryTag(
            id=uuid.uuid4(),
            company_id=company_id,
            time_entry_id=entry_id,
            tag=tag,
        ))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/clock-in", response_model=EntryResponse)
def clock_in(
    body: ClockInRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)

    # Check no active entry already exists for today
    now_utc = datetime.utcnow().replace(tzinfo=pytz.utc)
    work_date = _local_date_from_utc(now_utc, body.user_timezone)

    existing = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.user_id == current_user.id,
            TimeEntry.work_date == work_date,
            TimeEntry.status == "ACTIVE",
            TimeEntry.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already clocked in today")

    entry = TimeEntry(
        id=uuid.uuid4(),
        company_id=body.company_id,
        project_id=body.project_id,
        user_id=current_user.id,
        clock_in=now_utc,
        user_timezone=body.user_timezone,
        work_date=work_date,
        clock_in_lat=body.lat,
        clock_in_lng=body.lng,
        entry_type="NORMAL",
        status="ACTIVE",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    return EntryResponse(
        id=str(entry.id),
        project_id=str(entry.project_id),
        user_id=str(entry.user_id),
        clock_in=entry.clock_in,
        clock_out=entry.clock_out,
        user_timezone=entry.user_timezone,
        work_date=str(entry.work_date),
        status=entry.status,
        entry_type=entry.entry_type,
        description=entry.description,
        tags=[],
    )


@router.post("/clock-out", response_model=EntryResponse)
def clock_out(
    body: ClockOutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)

    entry = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.user_id == current_user.id,
            TimeEntry.company_id == body.company_id,
            TimeEntry.status == "ACTIVE",
            TimeEntry.deleted_at.is_(None),
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="No active clock-in found")

    now_utc = datetime.utcnow().replace(tzinfo=pytz.utc)
    entry.clock_out = now_utc
    entry.clock_out_lat = body.lat
    entry.clock_out_lng = body.lng
    entry.description = body.description
    entry.status = "SUBMITTED"
    entry.updated_at = now_utc

    if body.budget_code_id:
        from sqlalchemy import text as sa_text
        db.execute(sa_text(
            "UPDATE time_clock.time_entries SET budget_code_id = :bc_id, ai_summary = :summary WHERE id = :eid"
        ), {"bc_id": body.budget_code_id, "summary": body.ai_summary, "eid": str(entry.id)})

    if body.tags:
        _save_tags(db, str(entry.company_id), str(entry.id), body.tags)

    db.commit()
    db.refresh(entry)

    return EntryResponse(
        id=str(entry.id),
        project_id=str(entry.project_id),
        user_id=str(entry.user_id),
        clock_in=entry.clock_in,
        clock_out=entry.clock_out,
        user_timezone=entry.user_timezone,
        work_date=str(entry.work_date),
        status=entry.status,
        entry_type=entry.entry_type,
        description=entry.description,
        tags=_get_tags(db, str(entry.id)),
    )


@router.post("/manual", response_model=EntryResponse)
def create_manual_entry(
    body: ManualEntryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Worker submits a manual entry for a missed clock-in day."""
    require_subscription(body.company_id, db)

    from datetime import date
    work_date = date.fromisoformat(body.work_date)

    # Parse ISO datetimes (client sends with tz offset)
    clock_in_dt = datetime.fromisoformat(body.clock_in).astimezone(pytz.utc)
    clock_out_dt = datetime.fromisoformat(body.clock_out).astimezone(pytz.utc)

    if clock_out_dt <= clock_in_dt:
        raise HTTPException(status_code=400, detail="clock_out must be after clock_in")

    entry = TimeEntry(
        id=uuid.uuid4(),
        company_id=body.company_id,
        project_id=body.project_id,
        user_id=current_user.id,
        clock_in=clock_in_dt,
        clock_out=clock_out_dt,
        user_timezone=body.user_timezone,
        work_date=work_date,
        entry_type="MANUAL",
        manual_reason=body.manual_reason,
        manual_note=body.manual_note,
        description=body.description,
        status="SUBMITTED",
    )
    db.add(entry)

    if body.tags:
        db.flush()
        _save_tags(db, body.company_id, str(entry.id), body.tags)

    # Mark the missed notification as resolved if one exists
    notification = (
        db.query(MissedEntryNotification)
        .filter(
            MissedEntryNotification.user_id == current_user.id,
            MissedEntryNotification.work_date == work_date,
            MissedEntryNotification.resolved == False,
        )
        .first()
    )
    if notification:
        notification.resolved = True
        notification.resolved_by_entry_id = entry.id

    db.commit()
    db.refresh(entry)

    return EntryResponse(
        id=str(entry.id),
        project_id=str(entry.project_id),
        user_id=str(entry.user_id),
        clock_in=entry.clock_in,
        clock_out=entry.clock_out,
        user_timezone=entry.user_timezone,
        work_date=str(entry.work_date),
        status=entry.status,
        entry_type=entry.entry_type,
        description=entry.description,
        tags=_get_tags(db, str(entry.id)),
    )


@router.get("/my")
def get_my_entries(
    company_id: str,
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current user's recent time entries."""
    require_subscription(company_id, db)

    entries = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.user_id == current_user.id,
            TimeEntry.company_id == company_id,
            TimeEntry.deleted_at.is_(None),
        )
        .order_by(TimeEntry.work_date.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": str(e.id),
            "project_id": str(e.project_id),
            "work_date": str(e.work_date),
            "clock_in": e.clock_in,
            "clock_out": e.clock_out,
            "user_timezone": e.user_timezone,
            "status": e.status,
            "entry_type": e.entry_type,
            "description": e.description,
            "tags": _get_tags(db, str(e.id)),
        }
        for e in entries
    ]


@router.get("/active")
def get_active_entry(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check if the user is currently clocked in."""
    require_subscription(company_id, db)

    entry = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.user_id == current_user.id,
            TimeEntry.company_id == company_id,
            TimeEntry.status == "ACTIVE",
            TimeEntry.deleted_at.is_(None),
        )
        .first()
    )
    if not entry:
        return {"clocked_in": False, "entry": None}

    return {
        "clocked_in": True,
        "entry": {
            "id": str(entry.id),
            "clock_in": entry.clock_in,
            "project_id": str(entry.project_id),
            "user_timezone": entry.user_timezone,
        },
    }


@router.get("/adjustments/pending")
def get_pending_adjustments(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(company_id, db)
    require_role(str(current_user.id), company_id, MANAGER_ROLES, db)

    from sqlalchemy import text as sa_text
    rows = db.execute(sa_text("""
        SELECT
            ta.id::text,
            COALESCE(u.first_name || ' ' || u.last_name, u.email) AS worker_name,
            te.work_date::text,
            ta.adjustment_type,
            ta.original_clock_in,
            ta.original_clock_out,
            ta.requested_clock_in,
            ta.requested_clock_out,
            ta.reason,
            ta.status
        FROM time_clock.time_adjustments ta
        JOIN time_clock.time_entries te ON te.id = ta.time_entry_id
        JOIN public.users u             ON u.id  = ta.requested_by
        WHERE ta.company_id  = :company_id
          AND ta.status      = 'PENDING'
          AND ta.deleted_at  IS NULL
        ORDER BY ta.created_at DESC
    """), {"company_id": company_id}).fetchall()

    return [
        {
            "id":                    r.id,
            "worker_name":           r.worker_name,
            "work_date":             r.work_date,
            "adjustment_type":       r.adjustment_type,
            "original_clock_in":     r.original_clock_in.isoformat()  if r.original_clock_in  else None,
            "original_clock_out":    r.original_clock_out.isoformat() if r.original_clock_out else None,
            "requested_clock_in":    r.requested_clock_in.isoformat()  if r.requested_clock_in  else None,
            "requested_clock_out":   r.requested_clock_out.isoformat() if r.requested_clock_out else None,
            "reason":                r.reason,
            "status":                r.status,
        }
        for r in rows
    ]


class ReviewAdjustmentRequest(BaseModel):
    adjustment_id: str
    result: str          # APPROVED | REJECTED
    review_note: Optional[str] = None


@router.post("/adjustments/review")
def review_adjustment(
    body: ReviewAdjustmentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from sqlalchemy import text as sa_text

    row = db.execute(sa_text("""
        SELECT ta.id, ta.time_entry_id, ta.adjustment_type,
               ta.requested_clock_in, ta.requested_clock_out
        FROM time_clock.time_adjustments ta
        WHERE ta.id = :adj_id AND ta.status = 'PENDING'
    """), {"adj_id": body.adjustment_id}).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Adjustment not found or already reviewed")

    db.execute(sa_text("""
        UPDATE time_clock.time_adjustments
        SET status = :status, reviewed_by = :reviewer, reviewed_at = now(), review_note = :note,
            updated_at = now()
        WHERE id = :adj_id
    """), {"status": body.result, "reviewer": str(current_user.id), "note": body.review_note, "adj_id": body.adjustment_id})

    # If approved, apply the time correction to the entry
    if body.result == "APPROVED":
        if row.adjustment_type in ("CLOCK_IN", "BOTH") and row.requested_clock_in:
            db.execute(sa_text(
                "UPDATE time_clock.time_entries SET clock_in = :t, updated_at = now() WHERE id = :eid"
            ), {"t": row.requested_clock_in, "eid": str(row.time_entry_id)})
        if row.adjustment_type in ("CLOCK_OUT", "BOTH") and row.requested_clock_out:
            db.execute(sa_text(
                "UPDATE time_clock.time_entries SET clock_out = :t, updated_at = now() WHERE id = :eid"
            ), {"t": row.requested_clock_out, "eid": str(row.time_entry_id)})

    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin — correct clock in/out (forgot / wrong punch / bug)
# ---------------------------------------------------------------------------


class AdminTimeEntryUpdate(BaseModel):
    company_id: str
    clock_in: str   # ISO 8601 with offset
    clock_out: str
    admin_note: Optional[str] = None


def _parse_iso_utc(s: str) -> datetime:
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        raise HTTPException(status_code=400, detail="Datetime must include timezone offset")
    return dt.astimezone(pytz.utc)


@router.patch("/{entry_id}/admin-times")
def admin_update_entry_times(
    entry_id: str,
    body: AdminTimeEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin/manager: set clock_in and clock_out directly (no approval queue)."""
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, MANAGER_ROLES, db)

    try:
        eid = uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry id")

    entry = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.id == eid,
            TimeEntry.company_id == body.company_id,
            TimeEntry.deleted_at.is_(None),
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    ci = _parse_iso_utc(body.clock_in)
    co = _parse_iso_utc(body.clock_out)
    if co <= ci:
        raise HTTPException(status_code=400, detail="clock_out must be after clock_in")

    now_utc = datetime.utcnow().replace(tzinfo=pytz.utc)
    entry.clock_in = ci
    entry.clock_out = co
    entry.work_date = _local_date_from_utc(ci, entry.user_timezone or "America/Toronto")
    entry.updated_at = now_utc

    if body.admin_note and body.admin_note.strip():
        actor = getattr(current_user, "email", None) or str(current_user.id)[:8]
        line = f"\n[Admin edit {now_utc.isoformat()} {actor}] {body.admin_note.strip()}"
        entry.description = (entry.description or "") + line

    db.commit()
    return {"status": "ok", "entry_id": str(entry.id)}


class AdminEntryStatusUpdate(BaseModel):
    company_id: str
    status: str  # REJECTED | SUBMITTED (reopen for re-review)


@router.patch("/{entry_id}/admin-status")
def admin_set_entry_status(
    entry_id: str,
    body: AdminEntryStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin/manager: set entry status (e.g. reject approved row or send back to review queue)."""
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, MANAGER_ROLES, db)

    if body.status not in ("REJECTED", "SUBMITTED"):
        raise HTTPException(
            status_code=400,
            detail="status must be REJECTED or SUBMITTED",
        )

    try:
        eid = uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry id")

    entry = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.id == eid,
            TimeEntry.company_id == body.company_id,
            TimeEntry.deleted_at.is_(None),
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    now_utc = datetime.utcnow().replace(tzinfo=pytz.utc)
    entry.status = body.status
    entry.updated_at = now_utc
    db.commit()
    return {"status": "ok", "entry_id": str(entry.id), "result": body.status}
