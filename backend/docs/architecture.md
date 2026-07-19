# Architecture Documentation — Historic Stock Market Peak Analyzer

> **Auto-generated** from module docstrings and code structure. Version 1.0.0

---

## System Overview

A production-quality academic web application for comparative analysis of three maximum-subarray algorithms applied to stock market data. The system demonstrates DAA concepts through interactive benchmarking, empirical complexity analysis, and educational visualization.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (React + Vite)                       │
│                    Recharts · Framer Motion · Axios                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP/JSON (CORS enabled)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend (Python 3.12)               │
│                         /api/v1/* (versioned)                      │
│                                                                     │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐  │
│   │ /health  │   │/datasets │   │/analyze  │   │/benchmark    │  │
│   │          │   │          │   │          │   │(BackgroundTask│  │
│   └──────────┘   └──────────┘   └──────────┘   └──────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                    Service Layer                            │  │
│   │  CacheService  │  BenchmarkRunner  │  ExperimentalAnalyzer │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │              Algorithm Engine (Strategy Pattern)            │  │
│   │  BruteForceAlgorithm  │  DivideAndConquerAlgorithm         │  │
│   │  KadaneAlgorithm      │  [Phase 6: ML hooks]               │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                    Database (SQLite + WAL)                  │  │
│   │  datasets · analysis_runs · benchmark_results               │  │
│   └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Module Catalogue

### `config.py`
Centralized Pydantic Settings. All hardware limits, URLs, and feature flags are read from here. Override any value with a `.env` file or environment variable.

| Setting | Default | Purpose |
|---|---|---|
| `max_brute_force_size` | 20,000 | Safety cap for O(N²) benchmark |
| `max_divide_conquer_size` | 100,000 | Safety cap for O(N log N) benchmark |
| `max_kadane_size` | 1,000,000 | Safety cap for O(N) benchmark |
| `benchmark_iterations` | 10 | Iterations per algorithm per benchmark |
| `downsample_threshold` | 10,000 | Trigger LTTB downsampling above this |
| `downsample_target` | 5,000 | Target points after LTTB (Phase 2) |

---

### `algorithms/` — Algorithm Engine

All algorithms implement `AlgorithmStrategy` (Strategy Pattern).

```
AlgorithmStrategy (ABC)
    ├── BruteForceAlgorithm      O(N²)      limit: 20,000
    ├── DivideAndConquerAlgorithm O(N log N) limit: 100,000
    └── KadaneAlgorithm          O(N)       limit: 1,000,000
```

**Problem Reduction** (all three algorithms operate identically):
```
prices[0..N-1] → changes = np.diff(prices) → max subarray of changes
buy_index  = left  index in changes array
sell_index = right index in changes array + 1
```

**`SubarrayResult`** — Immutable result DTO:
```python
@dataclass
class SubarrayResult:
    max_profit: float
    buy_index:  int
    sell_index: int
    algorithm_name: str
    left_sum:   Optional[float]  # D&C only
    right_sum:  Optional[float]  # D&C only
    cross_sum:  Optional[float]  # D&C only
```

**`AlgorithmRegistry`** — Singleton catalog:
```python
ALGORITHM_REGISTRY.get("Kadane's Algorithm").run(prices)
ALGORITHM_REGISTRY.names()           # ["Brute Force", "Divide & Conquer", "Kadane's Algorithm"]
ALGORITHM_REGISTRY.register(MyMLAlgorithm())  # Phase 6 extensibility
```

---

### `database/` — Persistence Layer

**SQLite** with WAL mode for concurrent read performance.

```sql
datasets
    id, name, sha256_hash (UNIQUE INDEX), size, distribution_type,
    source, min_price, max_price, mean_price, std_price, is_verified,
    created_at, data_file_path

analysis_runs
    id, dataset_id (FK→datasets), algorithm_name,
    max_profit, buy_index, sell_index, buy_price, sell_price,
    subarray_type, left_sum, right_sum, cross_sum, created_at

benchmark_results
    id, dataset_id (FK→datasets), algorithm_name, dataset_size,
    iterations, mean_time, median_time, min_time, max_time, std_time,
    mean_memory_mb, median_memory_mb, min_memory_mb, max_memory_mb,
    std_memory_mb, created_at
```

**Cascade**: Deleting a `Dataset` auto-deletes its `AnalysisRun` and `BenchmarkResult` rows.

---

### `services/` — Business Logic

#### `CacheService`
SHA-256 content-addressed caching. Prevents re-running expensive benchmarks on identical datasets.

```
compute_hash(prices) → 64-char hex string
has_benchmark_cache(db, hash) → bool
get_cached_benchmarks(db, hash) → List[BenchmarkResult]
```

**Hash Normalization**: Prices rounded to 6 decimal places → compact JSON → SHA-256.
**Cache Hit**: Any of the 3 BenchmarkResult rows for this hash exists in DB.

#### `BenchmarkRunner`
10-iteration benchmark engine with strict memory management.

```
Memory Protocol (per iteration):
    gc.collect() → prices.copy() → measure(time + memory) → del copy → gc.collect()

Memory Backends:
    1. memory_profiler (preferred) — 5ms interval sampling
    2. psutil (fallback)           — RSS delta before/after
    3. time-only                   — if neither is installed

Async: run_full_benchmark_async() → asyncio.to_thread() → non-blocking
```

#### `ExperimentalAnalyzer`
Theoretical vs. Observed complexity analysis.

```
Outputs per algorithm:
    - Normalized theoretical curve (relative to first data point)
    - Consecutive growth ratios (observed and theoretical)
    - Fitness score [0.0, 1.0] — how well observed matches claimed complexity

Expected doubling ratios:
    O(N)       → 2.0x
    O(N log N) → ~2.1x
    O(N²)      → 4.0x
```

---

### `models/schemas.py` — API Contract

All Pydantic v2 schemas. Versioned under `/api/v1/`.

| Schema | Purpose |
|---|---|
| `SubarrayResultSchema` | Single algorithm result |
| `BenchmarkStatsSchema` | Per-algorithm benchmark statistics |
| `FullBenchmarkReportSchema` | All-algorithm benchmark report |
| `DatasetSummarySchema` | Lightweight dataset list view |
| `DatasetDetailSchema` | Full dataset with analysis results |
| `GrowthAnalysisSchema` | Complexity analysis chart data |
| `HealthSchema` | Liveness/readiness probe response |

---

### `api/v1/routes/` — API Routes (Phase 1)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Liveness probe (no DB) |
| GET | `/api/v1/health/full` | Readiness probe (DB + registry) |

**Phase 2 additions** (stub slots in `main.py`):
```
POST /api/v1/datasets/generate   — Random/patterned dataset generation
POST /api/v1/datasets/upload     — CSV/XLSX upload with validation
POST /api/v1/analyze             — Run analysis algorithms
POST /api/v1/benchmark           — Run 10-iter benchmark (BackgroundTask)
GET  /api/v1/report              — Generate PDF report
```

---

## Concurrency Model

```
FastAPI main event loop (async I/O)
    │
    ├── GET /health → instant response (no blocking)
    │
    └── POST /benchmark
            │
            └── asyncio.to_thread(benchmark_runner.run_full_benchmark)
                        │
                        ├── Thread: BruteForce   (10 × gc.collect cycles)
                        ├── Thread: D&C          (10 × gc.collect cycles)
                        └── Thread: Kadane       (10 × gc.collect cycles)
```

O(N²) benchmarks run in a thread pool via `asyncio.to_thread()`. The event loop never blocks.

---

## Testing Strategy

```
tests/
    conftest.py               Shared fixtures (DB, algorithms, price arrays)
    test_algorithms.py        Correctness, CLRS verification, validation
    test_benchmark_runner.py  Stats invariants, size limits, async
    test_cache_service.py     Hash properties, DB lookup, cache hit/miss
    test_experimental_analysis.py  Complexity scaling, fitness, errors
```

**Coverage target**: ≥ 80% (`pytest --cov --cov-fail-under=80`)

---

## Phase 6 ML Architecture Hooks

The following interfaces are designed for future ML module plug-in:

1. **`AlgorithmRegistry.register()`** — Any class implementing `AlgorithmStrategy` plugs in automatically.
2. **`AlgorithmStrategy.run(prices) → SubarrayResult`** — ML predictions map to the same result format.
3. **`BenchmarkRunner.run_full_benchmark()`** — Automatically includes new registered algorithms.
4. **`Dataset.distribution_type`** — Stores the data profile used to train/test ML classifiers.
5. **`services/ml/` (Phase 6)** — Add `volatility_predictor.py`, `feature_extractor.py`, etc.

---

## Running the Backend

```bash
# 1. Install dependencies
cd backend
pip install -r requirements.txt

# 2. Run development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 3. View API documentation
# Swagger UI: http://localhost:8000/api/v1/docs
# ReDoc:      http://localhost:8000/api/v1/redoc
# OpenAPI:    http://localhost:8000/api/v1/openapi.json

# 4. Run tests with coverage
pytest
```
