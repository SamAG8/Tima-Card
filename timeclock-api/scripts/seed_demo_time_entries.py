#!/usr/bin/env python3
"""
Insert ~10 sample clock in/out rows for testing the admin Payroll report.

Patterns:
  - On time: ~8 net hours
  - Early clock out: ~5–6 hours
  - Late clock out: ~10–12 hours

Prerequisite: `timeclock-api/.env` with a valid `DATABASE_URL` (same Supabase as dev).

Run (if `python` points to 3.14 in this venv, use `python3.13`):
  cd timeclock-api && ./venv/bin/python3.13 scripts/seed_demo_time_entries.py

Optional env vars:
  SEED_WORKER_EMAIL   (default: worker@thepersa.com)
  SEED_COMPANY_NAME   if empty: first company with active TIME_CLOCK subscription
"""
from __future__ import annotations

import os
import sys
import uuid
from datetime import date, datetime, time as dt_time
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# Load .env from timeclock-api root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.chdir(Path(__file__).resolve().parent.parent)
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    print("Error: DATABASE_URL is not set in the environment.", file=sys.stderr)
    sys.exit(1)

TZ = "America/Toronto"
_TZ = ZoneInfo(TZ)
SEED_PREFIX = "[seed-demo]"
# Rows with NULL description (UI: “Nothing written”) — tracked via manual_note for cleanup on re-seed
SEED_EMPTY_DESC_TRACKER = "[seed-empty-tracker]"

# April 2026 work dates so admin Reports → This Month includes them
DEMO_DATES: list[tuple[date, str, dt_time, dt_time, int, str]] = [
    # work_date, label, clock_in local, clock_out local, break_minutes, note
    (date(2026, 4, 1), "On time ~8h", dt_time(8, 0), dt_time(16, 0), 0, "Standard 8–4 shift"),
    (date(2026, 4, 2), "Early out ~6h", dt_time(8, 0), dt_time(14, 0), 0, "Left shift early"),
    (date(2026, 4, 3), "Late out ~11h", dt_time(7, 0), dt_time(18, 0), 0, "Longer stay on site"),
    (date(2026, 4, 4), "On time + break", dt_time(8, 0), dt_time(17, 0), 60, "8h net after 1h break"),
    (date(2026, 4, 5), "Early out ~5.5h", dt_time(9, 0), dt_time(14, 30), 0, "Short half-day"),
    (date(2026, 4, 6), "Late out ~10h", dt_time(8, 0), dt_time(19, 0), 30, "Long overtime"),
    (date(2026, 4, 7), "On time ~8h", dt_time(7, 30), dt_time(15, 30), 0, "Earlier start/end"),
    (date(2026, 4, 8), "Early out ~5h", dt_time(10, 0), dt_time(15, 0), 0, "Only 5 hours worked"),
    (date(2026, 4, 9), "Late out ~12h", dt_time(6, 0), dt_time(19, 0), 60, "Long day with break"),
    (date(2026, 4, 10), "On time ~7.5h", dt_time(8, 0), dt_time(16, 30), 30, "Close to 8h net"),
]

# Extra APPROVED rows with no work description (NULL) — for “Nothing written” / manager review in admin
DEMO_DATES_EMPTY_DESCRIPTION: list[tuple[date, dt_time, dt_time, int]] = [
    (date(2026, 4, 11), dt_time(8, 0), dt_time(16, 0), 0),
    (date(2026, 4, 12), dt_time(8, 30), dt_time(16, 30), 0),
    (date(2026, 4, 13), dt_time(7, 0), dt_time(15, 0), 0),
    (date(2026, 4, 14), dt_time(9, 0), dt_time(17, 0), 30),
    (date(2026, 4, 15), dt_time(8, 0), dt_time(12, 0), 0),
]


def _combine_local(d: date, t: dt_time) -> datetime:
    return datetime.combine(d, t, tzinfo=_TZ)


def run() -> None:
    worker_email = os.getenv("SEED_WORKER_EMAIL", "worker@thepersa.com").strip()
    company_filter = os.getenv("SEED_COMPANY_NAME", "").strip()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    with Session(engine) as session:
        # Resolve worker first, then company from membership
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
            print(f"No user found with email {worker_email}.", file=sys.stderr)
            sys.exit(1)
        user_id = urow[0]
        print(f"User: {worker_email} ({user_id})")

        # Company: prefer one this user belongs to with TIME_CLOCK subscription
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
            print(
                "No company with TIME_CLOCK subscription found where this user is a member. "
                "Check membership or SEED_COMPANY_NAME.",
                file=sys.stderr,
            )
            sys.exit(1)

        company_id, company_name = row[0], row[1]
        print(f"Company: {company_name} ({company_id})")

        # Project
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
            print("No project for this company.", file=sys.stderr)
            sys.exit(1)
        project_id = prow[0]
        print(f"Project: {project_id}")

        # Remove previous seed rows (tagged description, or empty-desc batch tracked on manual_note)
        del_r = session.execute(
            text(
                """
                DELETE FROM time_clock.time_entries
                WHERE company_id = CAST(:cid AS uuid)
                  AND (
                    description LIKE :prefix
                    OR manual_note = :empty_tracker
                  )
                """
            ),
            {"prefix": f"{SEED_PREFIX}%", "cid": company_id, "empty_tracker": SEED_EMPTY_DESC_TRACKER},
        )
        session.commit()
        removed = del_r.rowcount if del_r.rowcount is not None else 0
        if removed:
            print(f"Removed {removed} previous seed row(s).")

        # Hourly rate (for cost column in report)
        rate_exists = session.execute(
            text(
                """
                SELECT 1 FROM time_clock.worker_rates
                WHERE company_id = CAST(:cid AS uuid)
                  AND user_id = CAST(:uid AS uuid)
                  AND project_id = CAST(:pid AS uuid)
                  AND deleted_at IS NULL
                LIMIT 1
                """
            ),
            {"cid": company_id, "uid": user_id, "pid": project_id},
        ).first()
        if not rate_exists:
            rid = str(uuid.uuid4())
            session.execute(
                text(
                    """
                    INSERT INTO time_clock.worker_rates (
                        id, company_id, user_id, project_id,
                        hourly_rate, currency, effective_from, effective_to,
                        created_at, updated_at
                    ) VALUES (
                        CAST(:id AS uuid), CAST(:cid AS uuid), CAST(:uid AS uuid), CAST(:pid AS uuid),
                        :rate, 'CAD', DATE '2026-01-01', NULL,
                        now(), now()
                    )
                    """
                ),
                {"id": rid, "cid": company_id, "uid": user_id, "pid": project_id, "rate": Decimal("28.50")},
            )
            session.commit()
            print("Added worker_rates row for this user/project (28.50 CAD/h).")

        insert_sql = text(
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
                NULL, :manual_note,
                :description,
                'APPROVED'::time_clock.entry_status_enum,
                :break_minutes,
                now(), now()
            )
            """
        )

        for wd, label, t_in, t_out, brk, note in DEMO_DATES:
            # Store Toronto local times as timestamptz via ISO strings with offset
            clock_in = _combine_local(wd, t_in)
            clock_out = _combine_local(wd, t_out)
            desc = f"{SEED_PREFIX} {label} — {note}"

            session.execute(
                insert_sql,
                {
                    "id": str(uuid.uuid4()),
                    "company_id": company_id,
                    "project_id": project_id,
                    "user_id": user_id,
                    "clock_in": clock_in.isoformat(),
                    "clock_out": clock_out.isoformat(),
                    "tz": TZ,
                    "work_date": wd.isoformat(),
                    "manual_note": None,
                    "description": desc,
                    "break_minutes": brk,
                },
            )

        for wd, t_in, t_out, brk in DEMO_DATES_EMPTY_DESCRIPTION:
            clock_in = _combine_local(wd, t_in)
            clock_out = _combine_local(wd, t_out)
            session.execute(
                insert_sql,
                {
                    "id": str(uuid.uuid4()),
                    "company_id": company_id,
                    "project_id": project_id,
                    "user_id": user_id,
                    "clock_in": clock_in.isoformat(),
                    "clock_out": clock_out.isoformat(),
                    "tz": TZ,
                    "work_date": wd.isoformat(),
                    "manual_note": SEED_EMPTY_DESC_TRACKER,
                    "description": None,
                    "break_minutes": brk,
                },
            )

        session.commit()
        n_empty = len(DEMO_DATES_EMPTY_DESCRIPTION)
        print(f"Inserted {len(DEMO_DATES)} APPROVED entries (with notes) + {n_empty} with empty description.")
        print("In admin: Reports → This Month → Generate Report (covers 2026-04-01 through 2026-04-30).")


if __name__ == "__main__":
    run()
