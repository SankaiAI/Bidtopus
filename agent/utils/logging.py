"""Structured logging setup.

Every log record includes contract_id and component so logs are filterable
in production (Datadog, CloudWatch, etc.) by contract or component.

Usage:
    from agent.utils.logging import get_logger
    logger = get_logger(__name__)
    logger.info("underwriting_complete", contract_id=cid, probability=0.68)
"""
from __future__ import annotations

import logging
import sys


class StructuredFormatter(logging.Formatter):
    """Emit key=value pairs alongside the message for easy log parsing."""

    _BASE_ATTRS = frozenset(logging.LogRecord.__dict__) | {
        "message", "asctime", "exc_text", "stack_info",
    }

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = {
            k: v
            for k, v in record.__dict__.items()
            if k not in self._BASE_ATTRS and not k.startswith("_")
        }
        if extras:
            pairs = " ".join(f"{k}={v}" for k, v in extras.items())
            return f"{base} | {pairs}"
        return base


class AgentLogger:
    """Thin wrapper that accepts keyword args as structured fields.

    Usage:
        logger.info("event_name", contract_id="abc", roas=2.1)
    """

    def __init__(self, inner: logging.Logger) -> None:
        self._inner = inner

    def _log(self, level: int, msg: str, **kwargs: object) -> None:
        self._inner.log(level, msg, extra=kwargs)

    def debug(self, msg: str, **kwargs: object) -> None:
        self._log(logging.DEBUG, msg, **kwargs)

    def info(self, msg: str, **kwargs: object) -> None:
        self._log(logging.INFO, msg, **kwargs)

    def warning(self, msg: str, **kwargs: object) -> None:
        self._log(logging.WARNING, msg, **kwargs)

    def error(self, msg: str, **kwargs: object) -> None:
        self._log(logging.ERROR, msg, **kwargs)

    def exception(self, msg: str, **kwargs: object) -> None:
        self._inner.exception(msg, extra=kwargs)


def get_logger(name: str) -> AgentLogger:
    inner = logging.getLogger(name)
    if not inner.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            StructuredFormatter(
                fmt="%(asctime)s %(levelname)s %(name)s — %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )
        inner.addHandler(handler)
        inner.setLevel(logging.INFO)
        inner.propagate = False
    return AgentLogger(inner)
