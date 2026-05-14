"""Structured logging setup.

Every log record includes contract_id and component so logs are filterable
in production (Datadog, CloudWatch, etc.) by contract or component.

Usage:
    from agent.utils.logging import get_logger
    logger = get_logger(__name__)
    logger.info("underwriting_complete", contract_id=cid, probability=0.68)

Session files:
    Call attach_session(contract_id) at the start of each route handler.
    This opens logs/YYYY-MM-DD/<contract_id_short>.log and routes all agent
    logs for that request into it. Multiple requests for the same contract
    append to the same file.
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path

_LOGS_BASE = Path(__file__).parent.parent / "logs"
_LOGS_BASE.mkdir(exist_ok=True)

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

    handler = logging.FileHandler(session_file, encoding="utf-8", mode="a")
    handler.setFormatter(_formatter)
    _session_handlers[contract_id] = handler

    for name in _known_loggers:
        logging.getLogger(name).addHandler(handler)


def get_logger(name: str) -> AgentLogger:
    inner = logging.getLogger(name)
    if not inner.handlers:
        console = logging.StreamHandler(sys.stdout)
        console.setFormatter(_formatter)
        inner.addHandler(console)
        inner.setLevel(logging.INFO)
        inner.propagate = False

    _known_loggers.add(name)

    # If sessions are already active (e.g. hot-reload), attach their handlers.
    for handler in _session_handlers.values():
        if handler not in inner.handlers:
            inner.addHandler(handler)

    return AgentLogger(inner)
