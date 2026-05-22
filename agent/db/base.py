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

from config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,   # test connections before use
    pool_recycle=60,      # recycle before Railway's ~90s TCP idle timeout drops them
    pool_size=5,
    max_overflow=10,
    connect_args={
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    },
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
