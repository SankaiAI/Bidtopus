"""OutcomeX Agent — FastAPI entry point.

Start locally (run from inside agent/):
    uvicorn main:app --reload --port 8001

Start via Railway:
    uvicorn main:app --host 0.0.0.0 --port $PORT

The backend calls this service over HTTP via agent_client.py.
The frontend never calls the agent directly.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth.service_token import log_startup_state as _log_auth_state
from config import settings
from routes import router
from routes.chat import router as chat_router
from utils.logging import get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import orchestrator
    from scheduler import get_scheduler, register_monitoring_job
    from db.base import get_db
    from db.backend_models import PerformanceContractORM

    logger.info("agent_startup", model=settings.CLAUDE_MODEL)
    _log_auth_state()

    # Warm up ML models so the first request is not slow.
    orchestrator._get_underwriting_model()
    orchestrator._get_forecast_model()

    # Start the 24h monitoring scheduler.
    scheduler = get_scheduler()
    scheduler.start()
    logger.info("scheduler_started")

    # Register monitoring jobs for all currently Active contracts.
    active_count = 0
    try:
        with get_db() as db:
            active_contracts = (
                db.query(PerformanceContractORM)
                .filter(PerformanceContractORM.status == "Active")
                .all()
            )
            for contract in active_contracts:
                register_monitoring_job(str(contract.id))
            active_count = len(active_contracts)
    except Exception as exc:
        # DB may not be reachable in local dev without a real connection string.
        logger.error("scheduler_startup_db_error", error=str(exc))

    logger.info("agent_ready", active_contracts_scheduled=active_count)
    yield

    scheduler.shutdown(wait=False)
    logger.info("agent_shutdown")


app = FastAPI(
    title="OutcomeX Agent",
    description="Autonomous economic agent for Meta Ads performance contracts.",
    version="1.0.0",
    lifespan=lifespan,
    # Public docs are an attack-surface map. Default off; flip ENABLE_DOCS=True for dev.
    docs_url="/docs" if settings.ENABLE_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_DOCS else None,
    openapi_url="/openapi.json" if settings.ENABLE_DOCS else None,
)


def _resolve_allowed_origins() -> list[str]:
    """Comma-separated env var → list. Empty → safe localhost defaults."""
    raw = settings.ALLOWED_ORIGINS.strip()
    if not raw:
        return ["http://localhost:3000", "http://localhost:8000"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_allowed_origins(),
    allow_methods=["POST", "GET"],
    allow_headers=["X-Service-Token", "Content-Type", "Authorization"],
)

app.include_router(router)
app.include_router(chat_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": settings.CLAUDE_MODEL,
        "mock_mode": {
            "meta_ads": settings.META_ADS_MOCK,
            "arc": settings.ARC_MOCK,
            "circle": settings.CIRCLE_MOCK,
        },
    }
