import os

# Must be set before any app module is imported so config.py picks up SQLite
os.environ["DATABASE_URL"] = "sqlite:///./tests/test.db"
os.environ["CLERK_SECRET_KEY"] = "sk_test_placeholder"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test"
os.environ["ENVIRONMENT"] = "test"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from db.session import Base, get_db
from db.models import User, PerformanceContract
from auth.clerk import get_current_user

# Re-use the same engine that db/session.py built from the env var above
from db.session import engine as _engine

Base.metadata.create_all(bind=_engine)
_TestSession = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

CONTRACT_PAYLOAD = {
    "target_roas": 2.0,
    "min_spend_usd": 500,
    "time_window_days": 7,
    "success_fee_usdc": 100,
    "campaign_mode": "optimize_existing",
    "campaign_goal": "Summer sale retargeting",
}


@pytest.fixture(autouse=True)
def clean_tables():
    """Wipe all rows before every test for full isolation."""
    db = _TestSession()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    db.close()


@pytest.fixture
def db():
    session = _TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_user(db):
    user = User(
        id="00000000-0000-0000-0000-000000000001",
        clerk_user_id="clerk_test_0001",
        email="merchant@test.com",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def other_user(db):
    user = User(
        id="00000000-0000-0000-0000-000000000002",
        clerk_user_id="clerk_test_0002",
        email="other@test.com",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_client(db_session, current_user):
    from main import app

    app.dependency_overrides[get_db] = lambda: (yield db_session)
    app.dependency_overrides[get_current_user] = lambda: current_user

    client = TestClient(app, raise_server_exceptions=True)
    return client


@pytest.fixture
def client(db, test_user):
    from main import app

    app.dependency_overrides[get_db] = lambda: (yield db)
    app.dependency_overrides[get_current_user] = lambda: test_user

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def client_as_other(db, other_user):
    from main import app

    app.dependency_overrides[get_db] = lambda: (yield db)
    app.dependency_overrides[get_current_user] = lambda: other_user

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def contract_in_state(db, test_user):
    """Factory: create a contract owned by test_user in any given status."""
    def _make(status, **kwargs):
        c = PerformanceContract(
            merchant_id=test_user.id,
            threshold=2.0,
            minimum_spend=500.0,
            time_window_days=7,
            success_fee_usdc=100.0,
            campaign_mode="optimize_existing",
            status=status,
            **kwargs,
        )
        db.add(c)
        db.commit()
        db.refresh(c)
        return c
    return _make
