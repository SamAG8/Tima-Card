"""
Team management: assign workers to managers, manage membership context.
"""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User, Membership, Role, Project
from app.models.time_clock import WorkerManager, TimeEntry

router = APIRouter(prefix="/team", tags=["Team"])

ADMIN_ROLES = ["OWNER", "ADMIN"]


class AssignManagerRequest(BaseModel):
    company_id: str
    worker_user_id: str
    manager_user_id: str
    project_id: Optional[str] = None


@router.post("/assign-manager")
def assign_manager(
    body: AssignManagerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, ADMIN_ROLES, db)

    assignment = WorkerManager(
        id=uuid.uuid4(),
        company_id=body.company_id,
        project_id=body.project_id,
        worker_user_id=body.worker_user_id,
        manager_user_id=body.manager_user_id,
    )
    db.add(assignment)
    db.commit()
    return {"status": "ok"}


@router.get("/active-now")
def get_active_clock_ins(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All workers currently clocked in (ACTIVE entry) for this company — admin/manager view."""
    require_subscription(company_id, db)
    require_role(str(current_user.id), company_id, ADMIN_ROLES + ["MANAGER"], db)

    rows = (
        db.query(TimeEntry, User, Project)
        .join(User, User.id == TimeEntry.user_id)
        .join(Project, Project.id == TimeEntry.project_id)
        .filter(
            TimeEntry.company_id == company_id,
            TimeEntry.status == "ACTIVE",
            TimeEntry.deleted_at.is_(None),
            User.deleted_at.is_(None),
        )
        .all()
    )

    out = []
    for te, u, p in rows:
        nm = " ".join(x for x in (u.first_name, u.last_name) if x) or None
        out.append(
            {
                "user_id": str(u.id),
                "email": u.email,
                "full_name": nm,
                "clock_in": te.clock_in.isoformat() if te.clock_in else None,
                "project_name": p.name,
                "user_timezone": te.user_timezone,
            }
        )
    return out


@router.get("/members")
def get_company_members(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all users with a membership in this company."""
    require_subscription(company_id, db)
    require_role(str(current_user.id), company_id, ADMIN_ROLES + ["MANAGER"], db)

    memberships = (
        db.query(Membership, User, Role)
        .join(User, User.id == Membership.user_id)
        .join(Role, Role.id == Membership.role_id)
        .filter(
            Membership.company_id == company_id,
            Membership.deleted_at.is_(None),
            User.deleted_at.is_(None),
        )
        .all()
    )

    return [
        {
            "user_id":    str(m.user_id),
            "email":      u.email,
            "full_name":  " ".join(filter(None, [u.first_name, u.last_name])) or None,
            "role":       getattr(u, 'role', 'worker'),
            "has_leave_access":       getattr(u, 'has_leave_access', False),
            "has_report_access":      getattr(u, 'has_report_access', False),
            "has_team_report_access": getattr(u, 'has_team_report_access', False),
        }
        for m, u, r in memberships
    ]


class UpdatePermissionsRequest(BaseModel):
    user_id: str
    role: Optional[str] = None
    has_leave_access: Optional[bool] = None
    has_report_access: Optional[bool] = None
    has_team_report_access: Optional[bool] = None


@router.post("/update-permissions")
def update_permissions(
    body: UpdatePermissionsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = []
    params: dict = {"user_id": body.user_id}
    if body.role is not None:
        updates.append("role = :role"); params["role"] = body.role
    if body.has_leave_access is not None:
        updates.append("has_leave_access = :leave"); params["leave"] = body.has_leave_access
    if body.has_report_access is not None:
        updates.append("has_report_access = :report"); params["report"] = body.has_report_access
    if body.has_team_report_access is not None:
        updates.append("has_team_report_access = :team_report"); params["team_report"] = body.has_team_report_access

    if not updates:
        return {"ok": True}

    db.execute(text(f"UPDATE public.users SET {', '.join(updates)} WHERE id = :user_id"), params)
    db.commit()
    return {"ok": True}


class RemoveManagerRequest(BaseModel):
    company_id: str
    worker_user_id: str
    manager_user_id: str


@router.post("/remove-manager")
def remove_manager(
    body: RemoveManagerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.execute(text("""
        UPDATE time_clock.worker_managers
        SET deleted_at = now()
        WHERE company_id = :company_id
          AND worker_user_id = :worker_id
          AND manager_user_id = :manager_id
          AND deleted_at IS NULL
    """), {"company_id": body.company_id, "worker_id": body.worker_user_id, "manager_id": body.manager_user_id})
    db.commit()
    return {"ok": True}


@router.get("/managers")
def get_worker_managers(
    company_id: str,
    worker_user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(text("""
        SELECT wm.manager_user_id::text,
               COALESCE(u.first_name || ' ' || u.last_name, u.email) AS manager_name,
               u.email AS manager_email
        FROM time_clock.worker_managers wm
        JOIN public.users u ON u.id = wm.manager_user_id
        WHERE wm.company_id = :company_id
          AND wm.worker_user_id = :worker_id
          AND wm.deleted_at IS NULL
    """), {"company_id": company_id, "worker_id": worker_user_id}).fetchall()

    return [{"manager_user_id": r.manager_user_id, "manager_name": r.manager_name, "manager_email": r.manager_email} for r in rows]


@router.get("/entries")
def get_team_entries(
    company_id: str,
    manager_user_id: str,
    start_date: str,
    end_date: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns time entries for all workers under a manager."""
    rows = db.execute(text("""
        SELECT
            te.id::text,
            te.user_id::text,
            COALESCE(u.first_name || ' ' || u.last_name, u.email) AS worker_name,
            p.name   AS project_name,
            te.work_date::text,
            te.clock_in,
            te.clock_out,
            CASE
                WHEN te.clock_out IS NOT NULL
                THEN EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) / 60
                ELSE NULL
            END AS duration_minutes,
            bc.code  AS budget_code,
            bc.name  AS budget_code_name,
            te.status,
            te.description
        FROM time_clock.time_entries te
        JOIN public.users u           ON u.id   = te.user_id
        JOIN public.projects p        ON p.id   = te.project_id
        LEFT JOIN public.budget_codes bc ON bc.id = te.budget_code_id
        WHERE te.company_id   = :company_id
          AND te.work_date   BETWEEN :start_date AND :end_date
          AND te.deleted_at  IS NULL
          AND te.user_id IN (
              SELECT worker_user_id FROM time_clock.worker_managers
              WHERE manager_user_id = :manager_id
                AND company_id      = :company_id
                AND deleted_at IS NULL
          )
        ORDER BY te.work_date DESC, te.clock_in DESC
    """), {"company_id": company_id, "start_date": start_date, "end_date": end_date, "manager_id": manager_user_id}).fetchall()

    return [
        {
            "id":               r.id,
            "user_id":          r.user_id,
            "worker_name":      r.worker_name,
            "project_name":     r.project_name,
            "work_date":        r.work_date,
            "clock_in":         r.clock_in.isoformat() if r.clock_in else None,
            "clock_out":        r.clock_out.isoformat() if r.clock_out else None,
            "duration_minutes": int(r.duration_minutes) if r.duration_minutes else None,
            "budget_code":      r.budget_code,
            "budget_code_name": r.budget_code_name,
            "status":           r.status,
            "description":      r.description,
        }
        for r in rows
    ]
