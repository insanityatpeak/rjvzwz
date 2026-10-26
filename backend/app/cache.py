import time
from typing import Any, Callable

_store: dict[str, tuple[float, Any]] = {}


def cached(key: str, ttl: float, loader: Callable[[], Any]) -> Any:
    """Return the cached value for key, calling loader when missing or older than ttl seconds."""
    hit = _store.get(key)
    if hit and time.monotonic() - hit[0] < ttl:
        return hit[1]
    value = loader()
    _store[key] = (time.monotonic(), value)
    return value


def clear() -> None:
    _store.clear()
