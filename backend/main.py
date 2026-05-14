import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import settings
from logging_config import setup_logging
from limiter import limiter
from db.session import Base, engine
from routes import contracts, messages, negotiation, stream, users

setup_logging(level="DEBUG" if settings.environment == "development" else "INFO")
log = logging.getLogger(__name__)

# Create all tables on startup (use Alembic migrations in production)
Base.metadata.create_all(bind=engine)
log.info("Database tables verified/created")

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
