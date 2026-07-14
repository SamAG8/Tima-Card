#!/usr/bin/env python3
"""Verify APPROVED time_entries exist and calculate_payroll returns rows (no HTTP)."""
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.chdir(Path(__file__).resolve().parent.parent)

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.services.payroll import calculate_payroll, summarize_by_worker

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    print("DATABASE_URL missing")
    sys.exit(1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

with Session(engine) as db:
    from sqlalchemy import text

    row = db.execute(
        text(
            """
            SELECT c.id::text
            FROM public.companies c
            JOIN public.app_subscriptions s ON s.company_id = c.id
            WHERE s.app_key = 'TIME_CLOCK' AND s.status IN ('ACTIVE', 'TRIAL')
              AND c.name ILIKE '%Persa%'
            LIMIT 1
            """
        )
    ).first()
    if not row:
        row = db.execute(
            text(
                """
                SELECT company_id::text FROM time_clock.time_entries
                WHERE description LIKE '[seed-demo]%' AND deleted_at IS NULL
                LIMIT 1
                """
            )
        ).first()
    if not row:
        print("No company / no seed entries found.")
        sys.exit(1)

    cid = row[0]
    n = db.execute(
        text(
            """
            SELECT COUNT(*) FROM time_clock.time_entries
            WHERE company_id = CAST(:c AS uuid) AND status = 'APPROVED'
              AND work_date BETWEEN '2026-03-01' AND '2026-04-30' AND deleted_at IS NULL
            """
        ),
        {"c": cid},
    ).scalar()

    rows = calculate_payroll(
        db,
        company_id=cid,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 4, 30),
    )
    by_w = summarize_by_worker(rows)

    print(f"company_id={cid}")
    print(f"APPROVED rows in range (SQL count): {n}")
    print(f"calculate_payroll row count: {len(rows)}")
    print(f"by_worker groups: {len(by_w)}")
    if rows:
        print(f"sample hours_worked: {rows[0].get('hours_worked')}")
    print("OK")
