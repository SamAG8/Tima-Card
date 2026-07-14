"""
Read-only references to the shared public schema tables.
These models mirror CDefApp's public schema — do not modify the tables from here.
"""
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, JSON, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    subscription_status = Column(String)
    deleted_at = Column(DateTime(timezone=True))


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, nullable=False, unique=True)
    first_name = Column(String)
    last_name = Column(String)
    phone = Column(String)
    is_active = Column(Boolean, default=True)
    # Time Clock + platform (see migration 003 — already on public.users)
    role = Column(String, nullable=True)
    is_superadmin = Column(Boolean, nullable=True)
    has_leave_access = Column(Boolean, nullable=True)
    has_report_access = Column(Boolean, nullable=True)
    has_team_report_access = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("now()"))
    deleted_at = Column(DateTime(timezone=True))


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    project_id = Column(UUID(as_uuid=True))
    role_id = Column(UUID(as_uuid=True), nullable=False)
    permissions_override = Column(JSON)
    deleted_at = Column(DateTime(timezone=True))


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    # CDefApp also has company_id, project_id, permissions — included for compatibility
    company_id = Column(UUID(as_uuid=True))
    project_id = Column(UUID(as_uuid=True))
    permissions = Column(JSON)


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    name = Column(String, nullable=False)
    address = Column(String)
    status = Column(String)
    deleted_at = Column(DateTime(timezone=True))


class AppSubscription(Base):
    __tablename__ = "app_subscriptions"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    app_key = Column(String, nullable=False)
    status = Column(String, nullable=False)
    plan_tier = Column(String, nullable=False)
    started_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
