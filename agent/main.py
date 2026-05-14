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

from config import settings
from routes import router
from utils.logging import get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm up the ML models at startup so the first request is not slow.
    # Models are cached as module-level singletons in orchestrator.py.
    logger.info("agent_startup", model=settings.CLAUDE_MODEL)
    import orchestrator
    orchestrator._get_underwriting_model()
    orchestrator._get_forecast_model()
    logger.info("agent_ready")
    yield
    logger.info("agent_shutdown")


app = FastAPI(
    title="OutcomeX Agent",
    description="Autonomous economic agent for Meta Ads performance contracts.",
    version="1.0.0",
    lifespan=lifespan,
    # Agent is an internal service — disable public docs in production.
    docs_url="/docs" if not settings.META_ADS_MOCK else "/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Backend → agent traffic only; tighten in prod to backend origin.
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(router)


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
