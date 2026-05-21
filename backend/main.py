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
        # UUID type for Postgres FK compatibility with meta_ads_accounts.id
        # (try/except in the loop swallows the SQLite-side syntax error harmlessly —
        # SQLite tests get the column from create_all() with the with_variant String form).
        ("performance_contracts", "meta_ads_account_id", "UUID"),
        ("strategy_plans", "execution_receipts", "JSON"),
        ("contract_messages", "expires_at", "TIMESTAMP WITH TIME ZONE"),
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


def _backfill_meta_accounts():
    """
    One-shot backfill (idempotent): every existing merchant gets at least one
    MetaAdsAccount row (seeded from User.meta_ads_account_id, falling back to
    'act_1234567' to match the frontend's hardcoded placeholder), and every
    existing contract gets pointed at that account.

    Skips work when there's nothing to do, so it's safe to re-run on every boot.
    """
    from db.session import SessionLocal
    from db.models import User, PerformanceContract, MetaAdsAccount

    db = SessionLocal()
    try:
        # 1. Seed one account per merchant if they don't already have one
        users = db.query(User).all()
        for u in users:
            existing = (
                db.query(MetaAdsAccount)
                .filter(MetaAdsAccount.merchant_id == u.id)
                .first()
            )
            if existing is not None:
                continue
            placeholder_id = u.meta_ads_account_id or "act_1234567"
            label = (u.email or "Merchant") + " — " + placeholder_id
            db.add(MetaAdsAccount(
                merchant_id=u.id,
                meta_ads_account_id=placeholder_id,
                name=label,
            ))
        db.commit()

        # 2. Point any contract with NULL meta_ads_account_id at the merchant's first account
        orphan_count = (
            db.query(PerformanceContract)
            .filter(PerformanceContract.meta_ads_account_id.is_(None))
            .count()
        )
        if orphan_count == 0:
            log.debug("Backfill: no orphan contracts to attach to a meta account")
            return

        # Map merchant_id → first MetaAdsAccount.id. Coerce both sides to str so
        # uuid.UUID vs str mismatches between dialects don't silently produce no-ops.
        first_account_by_merchant: dict[str, str] = {}
        for acc in db.query(MetaAdsAccount).order_by(MetaAdsAccount.connected_at.asc()).all():
            first_account_by_merchant.setdefault(str(acc.merchant_id), str(acc.id))

        contracts = (
            db.query(PerformanceContract)
            .filter(PerformanceContract.meta_ads_account_id.is_(None))
            .all()
        )
        attached = 0
        for c in contracts:
            account_id = first_account_by_merchant.get(str(c.merchant_id))
            if account_id is None:
                continue
            c.meta_ads_account_id = account_id
            attached += 1
        db.commit()
        log.info("Backfill: attached %d orphan contracts to a meta account", attached)
    except Exception:
        log.exception("Backfill: failed (continuing — contracts may still need attaching)")
        db.rollback()
    finally:
        db.close()


# Skip in tests — fixtures manage their own meta accounts; running the backfill
# would seed placeholder rows for test fixtures and break empty-state assertions.
if settings.environment != "test":
    _backfill_meta_accounts()

# Startup guard: prevent non-dev/test environments from serving with the localhost
# CORS default. Catches the common misconfig of forgetting to set ALLOWED_ORIGINS on
# a real deploy. "development" and "test" are whitelisted; everything else (staging,
# production, etc.) must have explicit non-localhost origins.
if settings.environment not in ("development", "test"):
    _bad = [o for o in settings.origins if "localhost" in o or "127.0.0.1" in o or o == "*"]
    if _bad:
        raise RuntimeError(
            f"Refusing to start in environment={settings.environment!r} with insecure "
            f"CORS origins {_bad!r}. Set ALLOWED_ORIGINS to your real frontend host(s)."
        )

_expose_docs = settings.environment == "development"
app = FastAPI(
    title="Bidtopus API",
    version="1.0.0",
    # Disable interactive docs outside development — full API enumeration is recon for attackers
    docs_url="/docs" if _expose_docs else None,
    redoc_url="/redoc" if _expose_docs else None,
    openapi_url="/openapi.json" if _expose_docs else None,
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
