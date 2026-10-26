import time
from threading import Lock
from typing import Any, Callable
from weakref import WeakValueDictionary

_store: dict[str, tuple[float, Any]] = {}
_guard = Lock()
_locks: WeakValueDictionary = WeakValueDictionary()
MAX_ENTRIES = 64


def cached(key: str, ttl: float, loader: Callable[[], Any]) -> Any:
    """Load once per key on a miss; retain at most 64 live entries in write order."""
    with _guard:
        key_lock = _locks.get(key)
        if key_lock is None:
            key_lock = Lock()
            _locks[key] = key_lock
    # Each caller keeps a strong reference; unused per-key locks are reclaimed automatically.
    with key_lock:
        with _guard:
            hit = _store.get(key)
            if hit and time.monotonic() < hit[0]:
                return hit[1]
        value = loader()
        with _guard:
            now = time.monotonic()
            for expired in [k for k, (expires, _) in _store.items() if expires <= now]:
                del _store[expired]
            _store[key] = (now + ttl, value)
            while len(_store) > MAX_ENTRIES:
                del _store[next(iter(_store))]
        return value


def clear() -> None:
    with _guard:
        _store.clear()
