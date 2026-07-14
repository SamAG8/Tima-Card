from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.shared import User

router = APIRouter(prefix="/budget-codes", tags=["Budget Codes"])


class BudgetCodeResponse(BaseModel):
    id: str
    code: str
    name: str
    category: str
    division: str


class TimeAdjustmentRequest(BaseModel):
    company_id: str
    time_entry_id: str
    adjustment_type: str          # CLOCK_IN | CLOCK_OUT | BOTH
    original_clock_in: str | None = None
    original_clock_out: str | None = None
    requested_clock_in: str | None = None
    requested_clock_out: str | None = None
    reason: str | None = None


@router.get("", response_model=list[BudgetCodeResponse])
def get_budget_codes(
    company_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all active budget codes visible to the company:
    - System defaults (company_id IS NULL)
    - Company-specific codes
    Ordered by division → category → code
    """
    rows = db.execute(text("""
        SELECT
            bc.id::text,
            bc.code,
            bc.name,
            cat.name  AS category,
            div.name  AS division
        FROM public.budget_codes bc
        JOIN public.budget_categories cat ON cat.id = bc.category_id
        JOIN public.divisions div         ON div.id = cat.division_id
        WHERE bc.is_active = true
          AND cat.is_active = true
          AND div.is_active = true
          AND bc.deleted_at IS NULL
          AND cat.deleted_at IS NULL
          AND div.deleted_at IS NULL
          AND (bc.company_id IS NULL OR bc.company_id = :company_id)
        ORDER BY div.sort_order, cat.sort_order, bc.sort_order, bc.name
    """), {"company_id": company_id}).fetchall()

    return [
        BudgetCodeResponse(id=r.id, code=r.code, name=r.name, category=r.category, division=r.division)
        for r in rows
    ]


@router.post("/request-adjustment")
def request_time_adjustment(
    body: TimeAdjustmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a time adjustment request for manager approval."""
    # Verify entry belongs to this user
    entry = db.execute(text("""
        SELECT id FROM time_clock.time_entries
        WHERE id = :entry_id AND user_id = :user_id AND deleted_at IS NULL
    """), {"entry_id": body.time_entry_id, "user_id": str(current_user.id)}).fetchone()

    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    db.execute(text("""
        INSERT INTO time_clock.time_adjustments (
            company_id, time_entry_id, requested_by, adjustment_type,
            original_clock_in, original_clock_out,
            requested_clock_in, requested_clock_out, reason
        ) VALUES (
            :company_id, :entry_id, :user_id, :adj_type,
            :orig_in, :orig_out,
            :req_in, :req_out, :reason
        )
    """), {
        "company_id":  body.company_id,
        "entry_id":    body.time_entry_id,
        "user_id":     str(current_user.id),
        "adj_type":    body.adjustment_type,
        "orig_in":     body.original_clock_in,
        "orig_out":    body.original_clock_out,
        "req_in":      body.requested_clock_in,
        "req_out":     body.requested_clock_out,
        "reason":      body.reason,
    })
    db.commit()

    return {"ok": True, "message": "Adjustment request submitted for manager review"}
