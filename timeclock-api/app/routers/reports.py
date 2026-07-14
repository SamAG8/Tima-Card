from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User, Project
from app.services.payroll import (
    calculate_payroll,
    summarize_by_worker,
    summarize_by_project,
    summarize_by_budget_code,
    summarize_by_division,
)
from app.services.excel_export import generate_payroll_excel

router = APIRouter(prefix="/reports", tags=["Reports"])

# Same mix as approvals/leave (CDefApp uses mixed-case role keys).
REPORT_ROLES = ["OWNER", "ADMIN", "MANAGER", "admin", "super_admin", "manager"]


@router.get("/payroll")
def payroll_report(
    company_id: str,
    start_date: str,
    end_date: str,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(company_id, db)
    require_role(str(current_user.id), company_id, REPORT_ROLES, db)

    rows = calculate_payroll(
        db=db,
        company_id=company_id,
        start_date=date.fromisoformat(start_date),
        end_date=date.fromisoformat(end_date),
        project_id=project_id,
        user_id=user_id,
    )

    total_hours = sum(r["hours_worked"] for r in rows)
    total_cost  = sum(r["total_cost"] or 0.0 for r in rows)
    currency    = rows[0]["currency"] if rows else "CAD"

    return {
        "rows":             rows,
        "by_worker":        summarize_by_worker(rows),
        "by_project":       summarize_by_project(rows),
        "by_budget_code":   summarize_by_budget_code(rows),
        "by_division":      summarize_by_division(rows),
        "total_entries":    len(rows),
        "total_hours":      round(total_hours, 2),
        "total_cost":       round(total_cost, 2),
        "currency":         currency,
    }


@router.get("/payroll/export-excel")
def export_payroll_excel(
    company_id: str,
    start_date: str,
    end_date: str,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(company_id, db)
    require_role(str(current_user.id), company_id, REPORT_ROLES, db)

    rows = calculate_payroll(
        db=db,
        company_id=company_id,
        start_date=date.fromisoformat(start_date),
        end_date=date.fromisoformat(end_date),
        project_id=project_id,
        user_id=user_id,
    )

    user_ids    = list({r["user_id"]    for r in rows})
    project_ids = list({r["project_id"] for r in rows})

    from app.models.shared import User as UserModel
    users    = db.query(UserModel).filter(UserModel.id.in_(user_ids)).all()
    projects = db.query(Project).filter(Project.id.in_(project_ids)).all()

    worker_names  = {str(u.id): f"{u.first_name or ''} {u.last_name or ''}".strip() for u in users}
    project_names = {str(p.id): p.name for p in projects}

    # Fetch company name
    from sqlalchemy import text as sa_text
    company_row = db.execute(
        sa_text("SELECT name FROM public.companies WHERE id = :cid"),
        {"cid": company_id}
    ).fetchone()
    company_name = company_row.name if company_row else "Company"

    excel_bytes = generate_payroll_excel(
        rows=rows,
        start_date=date.fromisoformat(start_date),
        end_date=date.fromisoformat(end_date),
        company_name=company_name,
        worker_names=worker_names,
        project_names=project_names,
    )

    filename = f"payroll_{start_date}_{end_date}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
