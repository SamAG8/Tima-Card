"""
Shared test fixtures.
Uses an in-memory SQLite DB so no real Postgres is needed.
All tests override get_current_user and get_db.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from unittest.mock import MagicMock

from app.main import app
from app.database import get_db
from app.auth import get_current_user
from app.models.shared import User

# ---------------------------------------------------------------------------
# In-memory SQLite engine — just enough to keep SQLAlchemy happy for tests
# that use raw SQL mocks.  Real SQL tests must mock db.execute() themselves.
# ---------------------------------------------------------------------------
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


FAKE_USER = User()
FAKE_USER.id = uuid.UUID("00000000-0000-0000-0000-000000000001")
FAKE_USER.email = "worker@test.com"
FAKE_USER.first_name = "Test"
FAKE_USER.last_name = "Worker"


def override_get_current_user():
    return FAKE_USER


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user] = override_get_current_user


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_db():
    """Return a MagicMock that acts as a SQLAlchemy Session."""
    return MagicMock()


@pytest.fixture
def fake_user():
    return FAKE_USER
