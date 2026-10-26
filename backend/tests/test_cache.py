from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event, Lock

import pytest

from app import cache


@pytest.fixture(autouse=True)
def empty_cache():
    cache.clear()
    yield
    cache.clear()


def test_cache_expires_at_ttl_and_evicts_expired_entries_on_write(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(cache.time, "monotonic", lambda: clock[0])
    calls = []
    assert cache.cached("short", 10, lambda: calls.append(1) or 1) == 1
    assert cache.cached("long", 100, lambda: 2) == 2
    clock[0] = 9.9
    assert cache.cached("short", 10, lambda: 99) == 1
    clock[0] = 10
    cache.cached("new", 100, lambda: 3)
    assert "short" not in cache._store
    assert "long" in cache._store
    assert cache.cached("short", 10, lambda: calls.append(2) or 4) == 4
    assert calls == [1, 2]


def test_cache_bounds_store_to_64_oldest_writes_first(monkeypatch):
    monkeypatch.setattr(cache.time, "monotonic", lambda: 0)
    for i in range(64):
        cache.cached(str(i), 100, lambda: i)
    assert cache.cached("0", 100, lambda: -1) == 0
    cache.cached("64", 100, lambda: 64)
    assert len(cache._store) == 64
    assert "0" not in cache._store
    assert cache.cached("1", 100, lambda: -1) == 1


def test_concurrent_same_key_misses_run_loader_once():
    barrier = Barrier(8)
    started, release = Event(), Event()
    counter_lock = Lock()
    calls = []

    def loader():
        with counter_lock:
            calls.append(1)
        started.set()
        assert release.wait(2)
        return 42

    def worker():
        barrier.wait(timeout=2)
        return cache.cached("shared", 100, loader)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(worker) for _ in range(8)]
        try:
            assert started.wait(2)
            # Keep the first load in flight while the other released workers enter cached().
            Event().wait(0.1)
        finally:
            release.set()
        assert [future.result(timeout=2) for future in futures] == [42] * 8
    assert len(calls) == 1


def test_different_keys_can_load_independently():
    barrier = Barrier(2)

    def loader():
        barrier.wait(timeout=2)
        return 42

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(cache.cached, "first", 100, loader)
        second = pool.submit(cache.cached, "second", 100, loader)
        assert first.result(timeout=3) == second.result(timeout=3) == 42


def test_loader_failure_is_not_cached_and_does_not_hold_lock():
    def fail():
        raise RuntimeError("unavailable")
    with pytest.raises(RuntimeError):
        cache.cached("key", 100, fail)
    assert cache.cached("key", 100, lambda: 42) == 42
