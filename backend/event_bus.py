"""Thread-safe pub/sub for per-contract thinking events.
Background service threads call publish(); async SSE generators call subscribe()/unsubscribe()."""

import json
import queue
import threading
from typing import Any

_queues: dict[str, list[queue.Queue]] = {}
_lock = threading.Lock()


def subscribe(contract_id: str) -> queue.Queue:
    q: queue.Queue = queue.Queue(maxsize=200)
    with _lock:
        _queues.setdefault(contract_id, []).append(q)
    return q


def unsubscribe(contract_id: str, q: queue.Queue) -> None:
    with _lock:
        lst = _queues.get(contract_id)
        if lst:
            try:
                lst.remove(q)
            except ValueError:
                pass


def publish(contract_id: str, event_name: str, data: dict[str, Any]) -> None:
    """Push a thinking SSE event to all active workspace SSE subscribers for this contract."""
    payload = {"event": event_name, "data": json.dumps(data)}
    with _lock:
        queues = list(_queues.get(contract_id, []))
    for q in queues:
        try:
            q.put_nowait(payload)
        except queue.Full:
            pass  # subscriber is too slow — drop rather than block the background thread
