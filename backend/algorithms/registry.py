"""
Algorithm Registry — Central catalog of all AlgorithmStrategy instances.

The registry maps algorithm names to concrete strategy objects, enabling
the benchmark service, API layer, and Phase 6 ML hooks to discover and
invoke algorithms by name without hardcoding concrete class references.

Design:
    - Singleton pattern: one ALGORITHM_REGISTRY instance is shared app-wide.
    - Fluent registration API: registry.register(algo).register(algo2)
    - Duplicate detection: re-registering the same name raises ValueError.
    - Phase 6 extensibility: ML algorithms call ALGORITHM_REGISTRY.register()
      to plug in seamlessly alongside classical algorithms.

Usage:
    from algorithms.registry import ALGORITHM_REGISTRY

    # Retrieve by name
    algo = ALGORITHM_REGISTRY.get("Kadane's Algorithm")
    result = algo.run(prices)

    # Iterate all algorithms
    for name, algo in ALGORITHM_REGISTRY.all().items():
        print(f"{name}: {algo.time_complexity}")

    # Phase 6 — register a new ML algorithm
    ALGORITHM_REGISTRY.register(RandomForestPredictor())
"""

from __future__ import annotations

from typing import Dict

from algorithms.base import AlgorithmStrategy
from algorithms.brute_force import BruteForceAlgorithm
from algorithms.divide_and_conquer import DivideAndConquerAlgorithm
from algorithms.kadane import KadaneAlgorithm


# ══════════════════════════════════════════════════════════════════════════════
# Registry Class
# ══════════════════════════════════════════════════════════════════════════════

class AlgorithmRegistry:
    """
    Thread-safe (read-heavy), extensible algorithm registry.

    All registered algorithms are stateless — safe to share across threads.
    Registration is intentionally irreversible to prevent accidental overwrites.

    Extensibility (Phase 6):
        To add a new algorithm (e.g., ML-based):
            ALGORITHM_REGISTRY.register(MyMLAlgorithm())
        The algorithm automatically appears in benchmarks, API listings,
        and the complexity visualizer — no other code changes required.
    """

    def __init__(self) -> None:
        self._registry: Dict[str, AlgorithmStrategy] = {}

    def register(self, algorithm: AlgorithmStrategy) -> "AlgorithmRegistry":
        """
        Register an AlgorithmStrategy instance.

        Fluent interface: returns self, enabling chained .register() calls.

        Args:
            algorithm: Concrete AlgorithmStrategy instance (must be stateless).

        Returns:
            Self (for chaining).

        Raises:
            ValueError: If an algorithm with the same name is already registered.
                        Use unique, descriptive names to avoid collisions.
        """
        if algorithm.name in self._registry:
            raise ValueError(
                f"Algorithm '{algorithm.name}' is already registered. "
                "Each algorithm must have a unique name. "
                f"Currently registered: {self.names()}"
            )
        self._registry[algorithm.name] = algorithm
        return self  # Fluent interface

    def get(self, name: str) -> AlgorithmStrategy:
        """
        Retrieve a registered algorithm by its exact name.

        Args:
            name: Algorithm name (case-sensitive, e.g., "Kadane's Algorithm").

        Returns:
            The AlgorithmStrategy instance for the given name.

        Raises:
            KeyError: If the name is not in the registry.
        """
        if name not in self._registry:
            raise KeyError(
                f"Algorithm '{name}' is not registered. "
                f"Available: {self.names()}"
            )
        return self._registry[name]

    def all(self) -> Dict[str, AlgorithmStrategy]:
        """Return a shallow copy of all registered algorithms as {name: instance}."""
        return dict(self._registry)

    def names(self) -> list[str]:
        """Return a list of all registered algorithm names (insertion order)."""
        return list(self._registry.keys())

    def complexities(self) -> dict[str, str]:
        """Return {name: time_complexity} for all registered algorithms."""
        return {name: algo.time_complexity for name, algo in self._registry.items()}

    def safe_sizes(self) -> dict[str, int]:
        """Return {name: max_safe_input_size} for all registered algorithms."""
        return {name: algo.max_safe_input_size for name, algo in self._registry.items()}

    def __len__(self) -> int:
        return len(self._registry)

    def __contains__(self, name: str) -> bool:
        return name in self._registry

    def __repr__(self) -> str:
        names = ", ".join(f"'{n}'" for n in self.names())
        return f"AlgorithmRegistry([{names}])"


# ══════════════════════════════════════════════════════════════════════════════
# Module-Level Singleton
# ══════════════════════════════════════════════════════════════════════════════
#
# This singleton is the single source of truth for all algorithm instances
# across the entire backend. Import it from anywhere:
#
#     from algorithms.registry import ALGORITHM_REGISTRY
#
# Phase 6: Add ML algorithms here:
#     .register(RandomForestVolatilityPredictor())
#     .register(LSTMPriceForecastAlgorithm())
#
ALGORITHM_REGISTRY: AlgorithmRegistry = (
    AlgorithmRegistry()
    .register(BruteForceAlgorithm())
    .register(DivideAndConquerAlgorithm())
    .register(KadaneAlgorithm())
)
