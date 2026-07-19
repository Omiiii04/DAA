"""
Shared pytest fixtures for the entire test suite.

Provides:
    Database:
        test_engine   — In-memory SQLite engine (session-scoped, one DB per run)
        db_session    — Function-scoped transactional session (rolls back after each test)

    Algorithm Instances:
        brute_force        — BruteForceAlgorithm instance
        divide_and_conquer — DivideAndConquerAlgorithm instance
        kadane             — KadaneAlgorithm instance
        all_algorithms     — List of all three instances

    Price Arrays:
        prices_simple       — 6-element known-answer case (max_profit=5)
        prices_all_increasing — Monotonic uptrend (full window profit)
        prices_all_decreasing — Monotonic downtrend (negative profit)
        prices_two_elements   — Minimum valid input (N=2)
        prices_large          — 5,000-element random walk (safe for all algorithms)
        prices_clrs_example   — CLRS §4.1 example (expected profit=43)
"""

import numpy as np
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from algorithms.brute_force import BruteForceAlgorithm
from algorithms.divide_and_conquer import DivideAndConquerAlgorithm
from algorithms.kadane import KadaneAlgorithm
from database.models import Base


# ══════════════════════════════════════════════════════════════════════════════
# Database Fixtures
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def test_engine():
    """
    In-memory SQLite engine, shared across the entire test session.
    Tables are created once and persist across all tests in the session.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(test_engine):
    """
    Function-scoped DB session that ALWAYS rolls back after each test.
    Ensures complete test isolation — no state leaks between tests.
    """
    TestSession = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
    session = TestSession()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# ══════════════════════════════════════════════════════════════════════════════
# Algorithm Fixtures
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def brute_force():
    """BruteForceAlgorithm instance (stateless, module-scoped for speed)."""
    return BruteForceAlgorithm()


@pytest.fixture(scope="module")
def divide_and_conquer():
    """DivideAndConquerAlgorithm instance."""
    return DivideAndConquerAlgorithm()


@pytest.fixture(scope="module")
def kadane():
    """KadaneAlgorithm instance."""
    return KadaneAlgorithm()


@pytest.fixture(scope="module")
def all_algorithms():
    """List of all three algorithm instances."""
    return [BruteForceAlgorithm(), DivideAndConquerAlgorithm(), KadaneAlgorithm()]


# ══════════════════════════════════════════════════════════════════════════════
# Price Array Fixtures
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def prices_simple() -> np.ndarray:
    """
    6-element array with a known optimal solution.

    Prices:  [7.0, 1.0, 5.0, 3.0, 6.0, 4.0]
    Changes: [-6.0, 4.0, -2.0, 3.0, -2.0]
    Max subarray: [4.0, -2.0, 3.0] = 5.0  (indices 1..3 in changes)
    Expected: buy_index=1 (price=1), sell_index=4 (price=6), max_profit=5.0
    """
    return np.array([7.0, 1.0, 5.0, 3.0, 6.0, 4.0])


@pytest.fixture(scope="session")
def prices_all_increasing() -> np.ndarray:
    """
    Monotonically increasing prices.

    Changes: [1, 1, 1, 1]  — all positive
    Expected: buy_index=0, sell_index=4, max_profit=4.0
    """
    return np.array([1.0, 2.0, 3.0, 4.0, 5.0])


@pytest.fixture(scope="session")
def prices_all_decreasing() -> np.ndarray:
    """
    Monotonically decreasing prices.

    Changes: [-1, -1, -1, -1]  — all negative
    Expected: max_profit=-1.0 (the best worst-case: buy at 0, sell at 1)
    """
    return np.array([5.0, 4.0, 3.0, 2.0, 1.0])


@pytest.fixture(scope="session")
def prices_two_elements() -> np.ndarray:
    """
    Minimum valid input: exactly 2 price points.

    Changes: [10.0]  — one change
    Expected: max_profit=10.0, buy_index=0, sell_index=1
    """
    return np.array([5.0, 15.0])


@pytest.fixture(scope="session")
def prices_large() -> np.ndarray:
    """
    5,000-element random walk — safe for all three algorithms in unit tests.

    Generated with a fixed seed (42) for reproducibility.
    """
    rng = np.random.default_rng(seed=42)
    changes = rng.normal(loc=0.0, scale=1.0, size=4_999)
    prices = 100.0 + np.cumsum(changes)
    return prices.astype(np.float64)


@pytest.fixture(scope="session")
def prices_clrs_example() -> np.ndarray:
    """
    CLRS §4.1 Figure 4.1 stock price example.

    Prices: [100, 113, 110, 85, 105, 102, 86, 63, 81, 101, 94, 106, 101, 79, 94, 90, 97]
    Changes: [13, -3, -25, 20, -3, -16, -23, 18, 20, -7, 12, -5, -22, 15, -4, 7]

    Verified optimal solution:
        Max subarray: [18, 20, -7, 12] = 43  (changes indices 7..10)
        buy_index  = 7  → prices[7]  = 63
        sell_index = 11 → prices[11] = 106
        max_profit = 106 - 63 = 43
    """
    return np.array([
        100.0, 113.0, 110.0,  85.0, 105.0, 102.0,  86.0,  63.0,
         81.0, 101.0,  94.0, 106.0, 101.0,  79.0,  94.0,  90.0, 97.0
    ])
