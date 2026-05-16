import logging
import logging.config
from datetime import datetime
from pathlib import Path

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)


def setup_logging(level: str = "INFO") -> None:
    now = datetime.now()
    date_dir = LOG_DIR / now.strftime("%Y-%m-%d")
    date_dir.mkdir(parents=True, exist_ok=True)
    run_ts = now.strftime("%H-%M-%S")
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "detailed": {
                "format": "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "detailed",
                "stream": "ext://sys.stdout",
            },
            "app_file": {
                "class": "logging.FileHandler",
                "formatter": "detailed",
                "filename": str(date_dir / f"app_{run_ts}.log"),
                "encoding": "utf-8",
                "delay": True,
            },
            "error_file": {
                "class": "logging.FileHandler",
                "formatter": "detailed",
                "filename": str(date_dir / f"error_{run_ts}.log"),
                "encoding": "utf-8",
                "level": "ERROR",
                "delay": True,
            },
        },
        "root": {
            "level": level,
            "handlers": ["console", "app_file", "error_file"],
        },
        # Quieten noisy third-party loggers
        "loggers": {
            "uvicorn.access":          {"level": "WARNING", "propagate": True},  # duplicated by middleware
            "uvicorn.error":           {"level": "INFO",    "propagate": True},
            "sqlalchemy.engine":       {"level": "WARNING", "propagate": True},
            "httpcore":                {"level": "WARNING", "propagate": True},  # TCP/TLS lifecycle noise
            "httpx":                   {"level": "WARNING", "propagate": True},  # redundant HTTP logs
            "anthropic._base_client":  {"level": "WARNING", "propagate": True},  # dumps full payloads
            "sse_starlette.sse":       {"level": "WARNING", "propagate": True},  # per-ping/chunk DEBUG
        },
    })
