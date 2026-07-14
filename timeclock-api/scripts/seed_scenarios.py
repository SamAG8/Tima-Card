#!/usr/bin/env python3
"""
Populate the database with tagged demo scenarios for the Time Clock admin panel.

Creates (per company + worker):
  • SUBMITTED time entry          → Approvals queue
  • APPROVED with description     → Payroll / dashboard review
  • APPROVED with empty notes     → “Nothing written” / manager review
  • REJECTED sample               → history
  • APPROVED + PENDING time_adjustment → Time adjustments queue
  • PENDING leave request         → Leave page

All rows are tagged with description/manual_note/reason/notes containing “[seed-scenario]”
so this script can delete and re-seed safely.

Time entry work dates are chosen relative to “today” (America/Toronto), clamped to the
first day of the current month, so the admin “This Month” preset (month start → today)
includes the seeded rows.

Prerequisites
-------------
  • public.users rows must already exist (Supabase Auth / your real test accounts).
  • Membership + TIME_CLOCK subscription + at least one project for the company.

Environment
-----------
  DATABASE_URL          Required (same as timeclock-api/.env)
  SEED_WORKER_EMAIL     Primary worker (default: worker@thepersa.com)
  SEED_WORKER_B_EMAIL   Optional second worker — gets an extra SUBMITTED row
  SEED_MANAGER_EMAIL    Optional — if set with worker, creates worker_managers row
  SEED_COMPANY_NAME     Optional filter (substring match), same as seed_demo_time_entries

Run:
  cd timeclock-api && ./venv/bin/python3.13 scripts/seed_scenarios.py
"""
from __future__ import annotations

import os
import sys
import uuid
from datetime import date, datetime, timedelta, time as dt_time
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.chdir(Path(__file__).resolve().parent.parent)
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    print("Error: DATABASE_URL is not set.", file=sys.stderr)
    sys.exit(1)

TZ = "America/Toronto"
_TZ = ZoneInfo(TZ)
TAG = "[seed-scenario]"
EMPTY_TRACKER = "[seed-scenario]"  # manual_note when description is NULL


def _combine_local(d: date, t: dt_time) -> datetime:
    return datetime.combine(d, t, tzinfo=_TZ)


def today_local() -> date:
    """Calendar date in company TZ (matches payroll presets)."""
    return datetime.now(_TZ).date()


def work_date_back(days_ago: int) -> date:
    """A work_date on or after the 1st of this month so admin 'This Month' includes it."""
    t = today_local()
    month_start = t.replace(day=1)
    d = t - timedelta(days=days_ago)
    return max(month_start, d)


def resolve_company_project_for_worker(
    session: Session, worker_email: str, company_filter: str
) -> tuple[str, str, str, str] | None:
    """Returns (user_id, company_id, company_name, project_id) or None."""
    urow = session.execute(
        text(
            """
            SELECT id::text FROM public.users
            WHERE lower(email) = lower(:email) AND deleted_at IS NULL
            """
        ),
        {"email": worker_email},
    ).first()
    if not urow:
        return None
    user_id = urow[0]

    if company_filter:
        row = session.execute(
            text(
                """
                SELECT c.id::text, c.name
                FROM public.companies c
                JOIN public.app_subscriptions s ON s.company_id = c.id
                JOIN public.memberships m ON m.company_id = c.id AND m.user_id = CAST(:uid AS uuid)
                WHERE s.app_key = 'TIME_CLOCK'
                  AND s.status IN ('ACTIVE', 'TRIAL')
                  AND c.deleted_at IS NULL
                  AND m.deleted_at IS NULL
                  AND c.name ILIKE :name
                ORDER BY c.name
                LIMIT 1
                """
            ),
            {"uid": user_id, "name": f"%{company_filter}%"},
        ).first()
    else:
        row = session.execute(
            text(
                """
                SELECT c.id::text, c.name
                FROM public.companies c
                JOIN public.app_subscriptions s ON s.company_id = c.id
                JOIN public.memberships m ON m.company_id = c.id AND m.user_id = CAST(:uid AS uuid)
                WHERE s.app_key = 'TIME_CLOCK'
                  AND s.status IN ('ACTIVE', 'TRIAL')
                  AND c.deleted_at IS NULL
                  AND m.deleted_at IS NULL
                ORDER BY
                  CASE WHEN c.name ILIKE '%persa%' THEN 0 ELSE 1 END,
                  c.name
                LIMIT 1
                """
            ),
            {"uid": user_id},
        ).first()

    if not row:
        return None

    company_id, company_name = row[0], row[1]
    prow = session.execute(
        text(
            """
            SELECT id::text FROM public.projects
            WHERE company_id = CAST(:cid AS uuid) AND deleted_at IS NULL
            ORDER BY name NULLS LAST
            LIMIT 1
            """
        ),
        {"cid": company_id},
    ).first()
    if not prow:
        return None

    return user_id, company_id, company_name, prow[0]


def delete_scenario_rows(session: Session, company_id: str) -> None:
    """Remove previous seed-scenario rows (FK-safe order)."""
    cid = company_id
    session.execute(
        text(
            """
            DELETE FROM time_clock.time_adjustments ta
            USING time_clock.time_entries te
            WHERE ta.time_entry_id = te.id
              AND te.company_id = CAST(:cid AS uuid)
              AND ta.reason LIKE :tag_like
            """
        ),
        {"cid": cid, "tag_like": f"{TAG}%"},
    )
    session.execute(
        text(
            """
            DELETE FROM time_clock.leave_requests
            WHERE company_id = CAST(:cid AS uuid)
              AND notes LIKE :tag_like
            """
        ),
        {"cid": cid, "tag_like": f"{TAG}%"},
    )
    session.execute(
        text(
            """
            DELETE FROM time_clock.time_entries
            WHERE company_id = CAST(:cid AS uuid)
              AND (
                description LIKE :dlike
                OR manual_note = :tracker
              )
            """
        ),
        {"cid": cid, "dlike": f"{TAG}%", "tracker": EMPTY_TRACKER},
    )
    session.commit()


def insert_entry(
    session: Session,
    *,
    company_id: str,
    project_id: str,
    user_id: str,
    work_date: date,
    t_in: dt_time,
    t_out: dt_time,
    status: str,
    description: str | None,
    manual_note: str | None,
    break_minutes: int,
) -> str:
    eid = str(uuid.uuid4())
    ci = _combine_local(work_date, t_in)
    co = _combine_local(work_date, t_out)
    session.execute(
        text(
            """
            INSERT INTO time_clock.time_entries (
                id, company_id, project_id, user_id,
                clock_in, clock_out, user_timezone, work_date,
                entry_type, manual_reason, manual_note, description,
                status, break_minutes,
                created_at, updated_at
            ) VALUES (
                CAST(:id AS uuid),
                CAST(:company_id AS uuid),
                CAST(:project_id AS uuid),
                CAST(:user_id AS uuid),
                CAST(:clock_in AS timestamptz),
                CAST(:clock_out AS timestamptz),
                :tz,
                CAST(:work_date AS date),
                'NORMAL'::time_clock.entry_type_enum,
                NULL, :manual_note, :description,
                CAST(:status AS time_clock.entry_status_enum),
                :break_minutes,
                now(), now()
            )
            """
        ),
        {
            "id": eid,
            "company_id": company_id,
            "project_id": project_id,
            "user_id": user_id,
            "clock_in": ci.isoformat(),
            "clock_out": co.isoformat(),
            "tz": TZ,
            "work_date": work_date.isoformat(),
            "manual_note": manual_note,
            "description": description,
            "status": status,
            "break_minutes": break_minutes,
        },
    )
    return eid


def seed_for_worker(
    session: Session,
    worker_email: str,
    company_id: str,
    company_name: str,
    project_id: str,
    user_id: str,
    label: str,
) -> None:
    print(f"  --- {label} ({worker_email}) ---")

    wd_sub = work_date_back(4)
    wd_ok = work_date_back(3)
    wd_empty = work_date_back(2)
    wd_rej = work_date_back(1)
    wd_adj = work_date_back(0)

    # 1) SUBMITTED — Approvals
    insert_entry(
        session,
        company_id=company_id,
        project_id=project_id,
        user_id=user_id,
        work_date=wd_sub,
        t_in=dt_time(8, 0),
        t_out=dt_time(16, 0),
        status="SUBMITTED",
        description=f"{TAG} Awaiting manager approval ({label})",
        manual_note=None,
        break_minutes=0,
    )

    # 2) APPROVED with note — payroll
    insert_entry(
        session,
        company_id=company_id,
        project_id=project_id,
        user_id=user_id,
        work_date=wd_ok,
        t_in=dt_time(7, 30),
        t_out=dt_time(15, 30),
        status="APPROVED",
        description=f"{TAG} Approved with work note ({label})",
        manual_note=None,
        break_minutes=0,
    )

    # 3) APPROVED empty description
    insert_entry(
        session,
        company_id=company_id,
        project_id=project_id,
        user_id=user_id,
        work_date=wd_empty,
        t_in=dt_time(8, 0),
        t_out=dt_time(16, 0),
        status="APPROVED",
        description=None,
        manual_note=EMPTY_TRACKER,
        break_minutes=0,
    )

    # 4) REJECTED
    insert_entry(
        session,
        company_id=company_id,
        project_id=project_id,
        user_id=user_id,
        work_date=wd_rej,
        t_in=dt_time(9, 0),
        t_out=dt_time(14, 0),
        status="REJECTED",
        description=f"{TAG} Sample rejected entry ({label})",
        manual_note=None,
        break_minutes=0,
    )

    # 5) Base for time adjustment (APPROVED)
    base_id = insert_entry(
        session,
        company_id=company_id,
        project_id=project_id,
        user_id=user_id,
        work_date=wd_adj,
        t_in=dt_time(8, 0),
        t_out=dt_time(16, 0),
        status="APPROVED",
        description=f"{TAG} Base entry for time adjustment ({label})",
        manual_note=None,
        break_minutes=0,
    )

    # PENDING adjustment — worker asks to correct clock-out earlier
    oco = _combine_local(wd_adj, dt_time(16, 0))
    rco = _combine_local(wd_adj, dt_time(15, 0))
    session.execute(
        text(
            """
            INSERT INTO time_clock.time_adjustments (
                id, company_id, time_entry_id, requested_by,
                adjustment_type,
                original_clock_in, original_clock_out,
                requested_clock_in, requested_clock_out,
                reason, status,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                CAST(:cid AS uuid),
                CAST(:eid AS uuid),
                CAST(:uid AS uuid),
                'CLOCK_OUT'::time_clock.adjustment_type_enum,
                NULL,
                CAST(:oco AS timestamptz),
                NULL,
                CAST(:rco AS timestamptz),
                :reason,
                'PENDING'::time_clock.adjustment_status_enum,
                now(), now()
            )
            """
        ),
        {
            "cid": company_id,
            "eid": base_id,
            "uid": user_id,
            "oco": oco.isoformat(),
            "rco": rco.isoformat(),
            "reason": f"{TAG} Requested earlier clock-out (demo)",
        },
    )

    # Leave — pick first global leave type (company_id IS NULL)
    lt = session.execute(
        text(
            """
            SELECT id::text FROM time_clock.leave_types
            WHERE deleted_at IS NULL AND (company_id IS NULL OR company_id = CAST(:cid AS uuid))
            ORDER BY company_id NULLS FIRST, name
            LIMIT 1
            """
        ),
        {"cid": company_id},
    ).first()
    if lt:
        lv_start = today_local() + timedelta(days=3)
        lv_end = today_local() + timedelta(days=4)
        session.execute(
            text(
                """
                INSERT INTO time_clock.leave_requests (
                    id, company_id, user_id, leave_type_id,
                    start_date, end_date, status, notes,
                    created_at, updated_at
                ) VALUES (
                    gen_random_uuid(),
                    CAST(:cid AS uuid),
                    CAST(:uid AS uuid),
                    CAST(:ltid AS uuid),
                    CAST(:ls AS date), CAST(:le AS date),
                    'PENDING'::time_clock.leave_status_enum,
                    :notes,
                    now(), now()
                )
                """
            ),
            {
                "cid": company_id,
                "uid": user_id,
                "ltid": lt[0],
                "ls": lv_start.isoformat(),
                "le": lv_end.isoformat(),
                "notes": f"{TAG} Demo leave request ({label})",
            },
        )
    else:
        print("    (skip leave: no leave_types row)", file=sys.stderr)


def ensure_worker_manager(
    session: Session,
    company_id: str,
    worker_user_id: str,
    manager_email: str,
) -> None:
    m = session.execute(
        text(
            """
            SELECT id::text FROM public.users
            WHERE lower(email) = lower(:email) AND deleted_at IS NULL
            """
        ),
        {"email": manager_email.strip()},
    ).first()
    if not m:
        print(f"    (skip worker_managers: no user {manager_email})", file=sys.stderr)
        return
    mid = m[0]
    session.execute(
        text(
            """
            DELETE FROM time_clock.worker_managers
            WHERE company_id = CAST(:cid AS uuid)
              AND worker_user_id = CAST(:wid AS uuid)
              AND manager_user_id = CAST(:mid AS uuid)
              AND deleted_at IS NULL
            """
        ),
        {"cid": company_id, "wid": worker_user_id, "mid": mid},
    )
    session.execute(
        text(
            """
            INSERT INTO time_clock.worker_managers (id, company_id, worker_user_id, manager_user_id, created_at)
            VALUES (gen_random_uuid(), CAST(:cid AS uuid), CAST(:wid AS uuid), CAST(:mid AS uuid), now())
            """
        ),
        {"cid": company_id, "wid": worker_user_id, "mid": mid},
    )
    print(f"    worker_managers: {manager_email} → manages worker")


def run() -> None:
    worker_a = os.getenv("SEED_WORKER_EMAIL", "worker@thepersa.com").strip()
    worker_b = os.getenv("SEED_WORKER_B_EMAIL", "").strip()
    manager_em = os.getenv("SEED_MANAGER_EMAIL", "").strip()
    company_filter = os.getenv("SEED_COMPANY_NAME", "").strip()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    with Session(engine) as session:
        resolved = resolve_company_project_for_worker(session, worker_a, company_filter)
        if not resolved:
            print(f"Could not resolve company/project for {worker_a}.", file=sys.stderr)
            sys.exit(1)

        user_id, company_id, company_name, project_id = resolved
        print(f"Company: {company_name} ({company_id})")
        print(f"Project: {project_id}")
        print(f"Primary worker: {worker_a} ({user_id})")
        print("Removing previous [seed-scenario] rows…")
        delete_scenario_rows(session, company_id)

        seed_for_worker(
            session,
            worker_a,
            company_id,
            company_name,
            project_id,
            user_id,
            "primary",
        )

        if worker_b:
            r2 = resolve_company_project_for_worker(session, worker_b, company_filter)
            if r2:
                uid2, _, _, pj2 = r2
                if uid2 != user_id:
                    seed_for_worker(
                        session,
                        worker_b,
                        company_id,
                        company_name,
                        pj2,
                        uid2,
                        "secondary",
                    )
                else:
                    print("  (skip secondary: same user as primary)", file=sys.stderr)
            else:
                print(f"  (skip secondary: could not resolve {worker_b})", file=sys.stderr)

        if manager_em and worker_a:
            ensure_worker_manager(session, company_id, user_id, manager_em)

        session.commit()
        print("Done. Open admin: Approvals, Dashboard (time review), Time adjustments, Leave.")


if __name__ == "__main__":
    run()
