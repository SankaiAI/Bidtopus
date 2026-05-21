"""Structured logging setup.

Every log record includes contract_id and component so logs are filterable
in production (Datadog, CloudWatch, etc.) by contract or component.

Usage:
    from agent.utils.logging import get_logger
    logger = get_logger(__name__)
    logger.info("underwriting_complete", contract_id=cid, probability=0.68)

Session files:
    Call attach_session(contract_id) at the start of each route handler.
    Per-contract files at logs/YYYY-MM-DD/<contract_id_short>.log get
    rotated at 5 MB with 3 backups kept (so disk usage stays bounded).

Redaction:
    A `_SensitiveFieldFilter` masks any log extra whose key matches the
    `_SENSITIVE_KEYS` set — so `logger.info("...", access_token=x)` writes
    `access_token=***` to stdout AND to the session file. The audit logger
    in db/audit_logger.py has a separate recursive redactor for DB payloads.
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path

_LOGS_BASE = Path(__file__).parent.parent / "logs"
_LOGS_BASE.mkdir(exist_ok=True)

# Per-contract log file rotation
_LOG_MAX_BYTES = 5 * 1024 * 1024     # 5 MB
_LOG_BACKUP_COUNT = 3

# Sensitive keys redacted from log record extras. Lower-case for case-insensitive
# matching against kwarg names. Mirrors db/audit_logger.SENSITIVE_KEYS.
_SENSITIVE_KEYS = frozenset({
    "access_token",
    "private_key",
    "entity_secret",
    "anthropic_api_key",
    "circle_api_key",
    "agent_service_token",
    "x_service_token",
    "authorization",
    "wallet_address",
    "pixel_id",
})


class _SensitiveFieldFilter(logging.Filter):
    """Mask sensitive keys in LogRecord extras before any handler formats them."""

    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(record.__dict__):
            if key.lower() in _SENSITIVE_KEYS:
                value = record.__dict__[key]
                if isinstance(value, str) and value:
                    record.__dict__[key] = value[:4] + "***" if len(value) > 4 else "***"
                else:
                    record.__dict__[key] = "***"
        return True


_REDACTION_FILTER = _SensitiveFieldFilter()

_formatter = None   # initialised once below, after class definition

# All logger names created via get_logger — used when a new session starts
# and needs to attach its handler to already-created loggers.
_known_loggers: set[str] = set()

# Per-contract file handlers, keyed by contract_id.
_session_handlers: dict[str, logging.FileHandler] = {}


class StructuredFormatter(logging.Formatter):
    """Emit key=value pairs alongside the message for easy log parsing."""

    _BASE_ATTRS = frozenset(
        logging.LogRecord("", 0, "", 0, "", (), None).__dict__
    ) | {"message", "asctime", "exc_text", "stack_info"}

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = {
            k: v
            for k, v in record.__dict__.items()
            if k not in self._BASE_ATTRS and not k.startswith("_")
        }
        if not extras:
            return base

        inline, multiline = {}, {}
        for k, v in extras.items():
            if isinstance(v, str) and "\n" in v:
                multiline[k] = v
            else:
                inline[k] = v

        parts = [base]
        if inline:
            parts.append("| " + " ".join(f"{k}={v}" for k, v in inline.items()))
        for k, v in multiline.items():
            parts.append(f"\n--- {k} ---\n{v}\n--- end {k} ---")
        return "\n".join(parts)


_formatter = StructuredFormatter(
    fmt="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)


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


def attach_session(contract_id: str) -> None:
    """Open (or reuse) a per-contract log file and attach it to all agent loggers.

    Call this once at the top of each route handler before any other logging.
    All subsequent log calls from any module will also write to the session file
    for the duration of the process (handlers are never removed — same contract
    may span multiple requests and they all append to the same file).
    """
    if contract_id in _session_handlers:
        return  # already set up for this contract

    date_dir = _LOGS_BASE / datetime.now().strftime("%Y-%m-%d")
    date_dir.mkdir(parents=True, exist_ok=True)
    session_file = date_dir / f"{contract_id[:8]}.log"

    handler = RotatingFileHandler(
        session_file,
        encoding="utf-8",
        maxBytes=_LOG_MAX_BYTES,
        backupCount=_LOG_BACKUP_COUNT,
    )
    handler.setFormatter(_formatter)
    handler.addFilter(_REDACTION_FILTER)
    _session_handlers[contract_id] = handler

    for name in _known_loggers:
        logging.getLogger(name).addHandler(handler)


def get_logger(name: str) -> AgentLogger:
    inner = logging.getLogger(name)
    if not inner.handlers:
        console = logging.StreamHandler(sys.stdout)
        console.setFormatter(_formatter)
        console.addFilter(_REDACTION_FILTER)
        inner.addHandler(console)
        inner.setLevel(logging.INFO)
        inner.propagate = False

    _known_loggers.add(name)

    # If sessions are already active (e.g. hot-reload), attach their handlers.
    for handler in _session_handlers.values():
        if handler not in inner.handlers:
            inner.addHandler(handler)

    return AgentLogger(inner)
