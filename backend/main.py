import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import settings
from logging_config import setup_logging
from limiter import limiter
from sqlalchemy import text
from db.session import Base, engine
from routes import contracts, messages, negotiation, stream, users

setup_logging(level="DEBUG" if settings.environment == "development" else "INFO")
log = logging.getLogger(__name__)

# Create all tables on startup (use Alembic migrations in production)
Base.metadata.create_all(bind=engine)
log.info("Database tables verified/created")

# Inline migrations for columns added after initial table creation
def _run_migrations():
    _new_cols = [
        ("users", "approval_mode", "VARCHAR NOT NULL DEFAULT 'manual'"),
        ("users", "meta_ads_account_id", "VARCHAR"),
        ("performance_contracts", "title", "VARCHAR"),
        ("strategy_plans", "execution_receipts", "JSON"),
        ("contract_messages", "expires_at", "DATETIME"),
    ]
    with engine.connect() as conn:
        for table, col, definition in _new_cols:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
                conn.commit()
                log.info("Migration: added %s.%s", table, col)
            except Exception:
                conn.rollback()
                log.debug("Migration: %s.%s already exists, skipping", table, col)

_run_migrations()

app = FastAPI(
    title="OutcomeX API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    log.info("%s %s %d %.0fms", request.method, request.url.path, response.status_code, ms)
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(contracts.router)
app.include_router(messages.router)
app.include_router(stream.router)
app.include_router(negotiation.router)


@app.get("/health")
def health():
    log.debug("Health check called")
    return {"status": "ok"}
