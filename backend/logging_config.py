import logging
import logging.config
import os
from pathlib import Path

LOG_DIR = Path(__file__).parent / "docs" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)


def setup_logging(level: str = "INFO") -> None:
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
                "class": "logging.handlers.TimedRotatingFileHandler",
                "formatter": "detailed",
                "filename": str(LOG_DIR / "app.log"),
                "when": "midnight",
                "backupCount": 14,
                "encoding": "utf-8",
            },
            "error_file": {
                "class": "logging.handlers.TimedRotatingFileHandler",
                "formatter": "detailed",
                "filename": str(LOG_DIR / "error.log"),
                "when": "midnight",
                "backupCount": 30,
                "level": "ERROR",
                "encoding": "utf-8",
            },
        },
        "root": {
            "level": level,
            "handlers": ["console", "app_file", "error_file"],
        },
        # Quieten noisy third-party loggers
        "loggers": {
            "uvicorn.access": {"level": "INFO", "propagate": True},
            "uvicorn.error": {"level": "INFO", "propagate": True},
            "sqlalchemy.engine": {"level": "WARNING", "propagate": True},
        },
    })
