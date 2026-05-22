"""SQLAlchemy session factory.

Usage inside FastAPI (backend injects session via DI):
    from agent.db.base import get_db
    @router.post("/underwrite")
    def underwrite(db: Session = Depends(get_db)): ...

Usage in background scheduler (standalone):
    from agent.db.base import get_db
    with get_db() as db:
        monitoring_loop(contract_id, db)
"""
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from config import settings

# NullPool: open a fresh connection per request and close it immediately after.
# Railway's NAT drops idle TCP state to external services (Neon) within ~60s,
# causing TCP_OVERWINDOW on pooled connections. NullPool avoids this entirely.
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=NullPool,
    connect_args={"connect_timeout": 10},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@contextmanager
def get_db() -> Generator[Session, None, None]:
    """Context-manager session for background jobs and tests."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_db_dependency() -> Generator[Session, None, None]:
    """FastAPI dependency — yields a session, commits on success, rolls back on error."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
