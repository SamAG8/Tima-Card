import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Date, Float, Integer, Numeric, Time, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

TC = {"schema": "time_clock"}


class CompanySettings(Base):
    __tablename__ = "company_settings"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False, unique=True)
    timezone = Column(String, nullable=False, default="America/Toronto")
    default_currency = Column(String, nullable=False, default="CAD")
    break_tracking_enabled = Column(Boolean, nullable=False, default=False)
    overtime_requires_approval = Column(Boolean, nullable=False, default=True)
    working_hours_start = Column(Time)
    working_hours_end = Column(Time)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("now()"))


class WorkerManager(Base):
    __tablename__ = "worker_managers"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    project_id = Column(UUID(as_uuid=True))
    worker_user_id = Column(UUID(as_uuid=True), nullable=False)
    manager_user_id = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    deleted_at = Column(DateTime(timezone=True))


class WorkerRate(Base):
    __tablename__ = "worker_rates"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    project_id = Column(UUID(as_uuid=True))
    hourly_rate = Column(Numeric(10, 2), nullable=False)
    currency = Column(String, nullable=False, default="CAD")
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("now()"))
    deleted_at = Column(DateTime(timezone=True))


class TimeEntry(Base):
    __tablename__ = "time_entries"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    project_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    clock_in = Column(DateTime(timezone=True))
    clock_out = Column(DateTime(timezone=True))
    user_timezone = Column(String, nullable=False, default="America/Toronto")
    work_date = Column(Date, nullable=False)
    clock_in_lat = Column(Float)
    clock_in_lng = Column(Float)
    clock_out_lat = Column(Float)
    clock_out_lng = Column(Float)
    entry_type = Column(String, nullable=False, default="NORMAL")
    manual_reason = Column(String)
    manual_note = Column(String)
    description = Column(String)
    status = Column(String, nullable=False, default="ACTIVE")
    break_minutes = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("now()"))
    deleted_at = Column(DateTime(timezone=True))


class TimeEntryTag(Base):
    __tablename__ = "time_entry_tags"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    time_entry_id = Column(UUID(as_uuid=True), nullable=False)
    tag = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))


class TimeEntryApproval(Base):
    __tablename__ = "time_entry_approvals"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    time_entry_id = Column(UUID(as_uuid=True), nullable=False)
    approver_user_id = Column(UUID(as_uuid=True), nullable=False)
    result = Column(String, nullable=False)
    notes = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))


class OvertimeRequest(Base):
    __tablename__ = "overtime_requests"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    project_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    requested_date = Column(Date, nullable=False)
    estimated_hours = Column(Numeric(4, 2), nullable=False)
    reason = Column(String)
    status = Column(String, nullable=False, default="PENDING")
    reviewed_by_user_id = Column(UUID(as_uuid=True))
    reviewed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("now()"))
    deleted_at = Column(DateTime(timezone=True))


class LeaveType(Base):
    __tablename__ = "leave_types"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True))
    name = Column(String, nullable=False)
    default_days_per_year = Column(Numeric(4, 1))
    is_unlimited = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    deleted_at = Column(DateTime(timezone=True))


class LeaveBalance(Base):
    __tablename__ = "leave_balances"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    leave_type_id = Column(UUID(as_uuid=True), nullable=False)
    year = Column(Integer, nullable=False)
    total_days = Column(Numeric(4, 1), nullable=False)
    used_days = Column(Numeric(4, 1), nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("now()"))


class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    leave_type_id = Column(UUID(as_uuid=True), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String, nullable=False, default="PENDING")
    notes = Column(String)
    reviewed_by_user_id = Column(UUID(as_uuid=True))
    reviewed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("now()"))
    deleted_at = Column(DateTime(timezone=True))


class MissedEntryNotification(Base):
    __tablename__ = "missed_entry_notifications"
    __table_args__ = TC

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    work_date = Column(Date, nullable=False)
    notified_at = Column(DateTime(timezone=True), server_default=text("now()"))
    resolved = Column(Boolean, nullable=False, default=False)
    resolved_by_entry_id = Column(UUID(as_uuid=True))
