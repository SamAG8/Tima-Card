"""
Payroll calculation service.
Computes total hours and cost per worker per project for a date range.
"""
from datetime import date
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text

from app.models.time_clock import WorkerRate


def _get_rate(
    db: Session,
    company_id: str,
    user_id: str,
    project_id: str,
    work_date: date,
) -> Optional[WorkerRate]:
    """
    Find the effective hourly rate for a worker on a given date.
    Priority: project-specific rate > company-wide rate.
    """
    rate = (
        db.query(WorkerRate)
        .filter(
            WorkerRate.company_id == company_id,
            WorkerRate.user_id == user_id,
            WorkerRate.project_id == project_id,
            WorkerRate.effective_from <= work_date,
            (WorkerRate.effective_to.is_(None)) | (WorkerRate.effective_to >= work_date),
            WorkerRate.deleted_at.is_(None),
        )
        .order_by(WorkerRate.effective_from.desc())
        .first()
    )
    if rate:
        return rate

    return (
        db.query(WorkerRate)
        .filter(
            WorkerRate.company_id == company_id,
            WorkerRate.user_id == user_id,
            WorkerRate.project_id.is_(None),
            WorkerRate.effective_from <= work_date,
            (WorkerRate.effective_to.is_(None)) | (WorkerRate.effective_to >= work_date),
            WorkerRate.deleted_at.is_(None),
        )
        .order_by(WorkerRate.effective_from.desc())
        .first()
    )


def calculate_payroll(
    db: Session,
    company_id: str,
    start_date: date,
    end_date: date,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> list[dict]:
    """
    Return payroll rows for approved time entries in the given date range.
    Each row includes budget code, division, and category fields.
    """
    filters = [
        "te.company_id = :company_id",
        "te.status = 'APPROVED'",
        "te.work_date >= :start_date",
        "te.work_date <= :end_date",
        "te.clock_in IS NOT NULL",
        "te.clock_out IS NOT NULL",
        "te.deleted_at IS NULL",
    ]
    params: dict = {
        "company_id": company_id,
        "start_date": start_date,
        "end_date": end_date,
    }
    if project_id:
        filters.append("te.project_id = :project_id")
        params["project_id"] = project_id
    if user_id:
        filters.append("te.user_id = :user_id")
        params["user_id"] = user_id

    where_clause = " AND ".join(filters)

    sql = sa_text(f"""
        SELECT
            te.id::text            AS entry_id,
            te.user_id::text,
            te.project_id::text,
            p.name                 AS project_name,
            u.email                AS worker_email,
            te.work_date::text,
            te.clock_in,
            te.clock_out,
            te.description,
            te.break_minutes,
            te.budget_code_id::text,
            bc.code                AS budget_code,
            bc.name                AS budget_code_name,
            bcat.name              AS category,
            d.name                 AS division
        FROM time_clock.time_entries te
        JOIN public.users u                     ON u.id = te.user_id
        LEFT JOIN public.projects p           ON p.id = te.project_id
        LEFT JOIN public.budget_codes bc       ON bc.id   = te.budget_code_id
        LEFT JOIN public.budget_categories bcat ON bcat.id = bc.category_id
        LEFT JOIN public.divisions d            ON d.id   = bcat.division_id
        WHERE {where_clause}
        ORDER BY te.work_date ASC, te.clock_in ASC
    """)

    entries = db.execute(sql, params).fetchall()

    rows = []
    for e in entries:
        if not e.clock_in or not e.clock_out:
            continue
        duration = e.clock_out - e.clock_in
        hours = Decimal(str(round(duration.total_seconds() / 3600, 2)))

        if e.break_minutes:
            hours -= Decimal(str(e.break_minutes)) / Decimal("60")

        if hours <= 0:
            continue

        rate = _get_rate(db, company_id, e.user_id, e.project_id, date.fromisoformat(e.work_date))
        hourly_rate = rate.hourly_rate if rate else None
        currency = rate.currency if rate else "CAD"
        total_cost = round(hours * hourly_rate, 2) if hourly_rate else None

        desc = getattr(e, "description", None)
        if desc is not None:
            desc = str(desc).strip() or None

        rows.append({
            "entry_id":         e.entry_id,
            "user_id":          e.user_id,
            "project_id":       e.project_id,
            "project_name":     e.project_name,
            "worker_email":     e.worker_email,
            "work_date":        e.work_date,
            "clock_in":         e.clock_in.isoformat() if e.clock_in else None,
            "clock_out":        e.clock_out.isoformat() if e.clock_out else None,
            "description":      desc,
            "hours_worked":     float(hours),
            "hourly_rate":      float(hourly_rate) if hourly_rate else None,
            "currency":         currency,
            "total_cost":       float(total_cost) if total_cost else None,
            "budget_code_id":   e.budget_code_id,
            "budget_code":      e.budget_code,
            "budget_code_name": e.budget_code_name,
            "category":         e.category,
            "division":         e.division,
        })

    return rows


def summarize_by_worker(rows: list[dict]) -> list[dict]:
    summary: dict[str, dict] = {}
    for row in rows:
        uid = row["user_id"]
        if uid not in summary:
            summary[uid] = {
                "user_id": uid,
                "total_hours": 0.0,
                "total_cost": 0.0,
                "currency": row["currency"],
                "entries": 0,
            }
        summary[uid]["total_hours"] += row["hours_worked"]
        summary[uid]["total_cost"] += row["total_cost"] or 0.0
        summary[uid]["entries"] += 1
    return list(summary.values())


def summarize_by_project(rows: list[dict]) -> list[dict]:
    summary: dict[str, dict] = {}
    for row in rows:
        pid = row["project_id"]
        if pid not in summary:
            summary[pid] = {
                "project_id": pid,
                "total_hours": 0.0,
                "total_cost": 0.0,
                "currency": row["currency"],
                "entries": 0,
            }
        summary[pid]["total_hours"] += row["hours_worked"]
        summary[pid]["total_cost"] += row["total_cost"] or 0.0
        summary[pid]["entries"] += 1
    return list(summary.values())


def summarize_by_budget_code(rows: list[dict]) -> list[dict]:
    summary: dict[str, dict] = {}
    for row in rows:
        key = row["budget_code_id"] or "__untagged__"
        if key not in summary:
            summary[key] = {
                "budget_code_id":   row["budget_code_id"],
                "budget_code":      row["budget_code"],
                "budget_code_name": row["budget_code_name"],
                "category":         row["category"],
                "division":         row["division"],
                "total_hours":      0.0,
                "total_cost":       0.0,
                "currency":         row["currency"],
                "entries":          0,
            }
        summary[key]["total_hours"] += row["hours_worked"]
        summary[key]["total_cost"]  += row["total_cost"] or 0.0
        summary[key]["entries"]     += 1
    return list(summary.values())


def summarize_by_division(rows: list[dict]) -> list[dict]:
    summary: dict[str, dict] = {}
    for row in rows:
        key = row["division"] or "Untagged"
        if key not in summary:
            summary[key] = {
                "division":    key,
                "total_hours": 0.0,
                "total_cost":  0.0,
                "currency":    row["currency"],
                "entries":     0,
            }
        summary[key]["total_hours"] += row["hours_worked"]
        summary[key]["total_cost"]  += row["total_cost"] or 0.0
        summary[key]["entries"]     += 1
    return sorted(summary.values(), key=lambda x: x["total_hours"], reverse=True)
