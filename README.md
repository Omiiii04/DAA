# Historic Stock Market Peak Analyzer

A full-stack academic web application that applies three maximum-subarray
algorithms to stock price data, compares their empirical runtime against their
theoretical complexity, and trains ML models to classify trading signals — all
through an interactive browser UI.

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Installation](#installation)
6. [Configuration](#configuration)
7. [Running Locally](#running-locally)
8. [API Reference](#api-reference)
9. [Testing](#testing)
10. [Project Structure](#project-structure)
11. [License](#license)

---

## Overview

The system solves the classic **Buy-Low / Sell-High** problem by reducing it
to the **Maximum Subarray Problem** on daily price-change arrays. Three
algorithms are implemented — Brute Force O(N²), Divide & Conquer O(N log N),
and Kadane's Algorithm O(N) — and their output is cross-verified before being
presented to the user.

The backend exposes a versioned REST API (FastAPI) backed by SQLite. The
frontend is a React SPA with seven views covering dataset management,
algorithm analysis, benchmarking, empirical complexity sweeps, ML-driven
signal prediction, and downloadable PDF reports.

**Audience:** Computer-science students and educators studying Design and
Analysis of Algorithms (DAA). All algorithm limits, benchmark statistics, and
complexity charts are grounded in the actual code.

---

## Key Features

- **Three algorithm implementations** — Brute Force, Divide & Conquer, and
  Kadane's Algorithm — each with enforced safe-size limits to protect
  mid-range hardware.
- **Cross-verification** — every analysis response checks that all algorithms
  agree on `max_profit` within a floating-point tolerance. Mismatches surface
  as warnings.
- **10-iteration benchmark engine** — runs in a thread pool (never blocks the
  event loop), collects Mean / Median / Min / Max / StdDev for both time
  (seconds) and memory (MB). Falls back gracefully if `memory_profiler` is
  unavailable.
- **Empirical complexity sweep** — generates synthetic datasets at multiple
  sizes, benchmarks them, and computes a **fitness score \[0.0, 1.0\]**
  measuring how well observed growth matches the claimed Big-O.
- **Dataset management** — generate log-normal synthetic datasets (1K–1M
  points, five distribution profiles) or upload CSV/XLSX files (≤50 MB). All
  datasets are SHA-256 content-addressed; identical data is never re-computed.
- **LTTB downsampling** — datasets larger than 10,000 points are
  automatically downsampled to 5,000 using Largest-Triangle-Three-Buckets
  before sending to the browser.
- **Three ML models** (scikit-learn) — Isolation Forest anomaly detector,
  K-Means regime classifier, and Gradient Boosting buy/sell signal predictor.
  Hyperparameters are configurable in the UI and clamped to declared safe
  ranges server-side.
- **PDF report generation** — ReportLab Platypus builds a multi-page academic
  PDF covering price charts, algorithm results, benchmark statistics, and
  complexity analysis.
- **Swagger / ReDoc** — live interactive API docs auto-generated from
  Pydantic schemas.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Browser (React + Vite)                  │
│   Recharts · Framer Motion · Axios · react-router-dom   │
│                                                         │
│  Dashboard │ Datasets │ Analysis │ Benchmark │ …        │
└─────────────────────────┬───────────────────────────────┘
                          │  HTTP/JSON  (proxy: /api → :8000)
                          ▼
┌─────────────────────────────────────────────────────────┐
│             FastAPI Backend  (Python 3.12)               │
│                  /api/v1/*  (versioned)                  │
│                                                         │
│  Routes: health │ datasets │ analyze │ benchmark        │
│          complexity │ dashboard │ report │ ml           │
│                                                         │
│  Services: CacheService │ BenchmarkRunner               │
│            ExperimentalAnalyzer │ SweepService          │
│            DatasetGenerator │ FileParser                │
│            ReportGenerator │ MLTrainer                  │
│                                                         │
│  Algorithm Engine (Strategy Pattern)                    │
│    BruteForce O(N²) │ DivideAndConquer O(N log N)       │
│    Kadane O(N)                                          │
│                                                         │
│  ML Engine (Strategy Pattern)                          │
│    AnomalyDetector │ RegimeClassifier │ PeakPredictor   │
│                                                         │
│  SQLite (WAL mode)                                      │
│    datasets · analysis_runs · benchmark_results         │
│    ml_training_jobs                                     │
└─────────────────────────────────────────────────────────┘
```

**Concurrency model:** Analysis and benchmark runs use `asyncio.to_thread()`,
keeping the FastAPI event loop unblocked during O(N²) workloads. Benchmark
and sweep jobs follow a QUEUED → RUNNING → COMPLETED | FAILED lifecycle
surfaced through polling endpoints.

---

## Prerequisites

| Dependency | Minimum version | Notes |
|---|---|---|
| Python | 3.12 | Required by type hints in the codebase |
| Node.js | 18 LTS | Required for Vite 6 |
| npm | 9+ | Bundled with Node 18 |

No external services, databases, or API keys are required. SQLite is
created automatically on first startup.

---

## Installation

### Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

---

## Configuration

The backend is configured via `backend/config.py` (Pydantic Settings).
Any field can be overridden with an environment variable or a
`backend/.env` file. No `.env` file is required for local development —
the defaults are self-contained.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./stock_analyzer.db` | SQLite path (relative to `backend/`) |
| `MAX_BRUTE_FORCE_SIZE` | `20000` | Safety cap for O(N²) algorithm |
| `MAX_DIVIDE_CONQUER_SIZE` | `100000` | Safety cap for O(N log N) algorithm |
| `MAX_KADANE_SIZE` | `1000000` | Safety cap for O(N) algorithm |
| `BENCHMARK_ITERATIONS` | `10` | Timing iterations per benchmark run |
| `DOWNSAMPLE_THRESHOLD` | `10000` | Trigger LTTB above this dataset size |
| `DOWNSAMPLE_TARGET` | `5000` | Target point count after LTTB |
| `DATA_DIR` | `./data` | Root for `.npy` price files and ML model artifacts |
| `CORS_ORIGINS` | `["http://localhost:5173","http://localhost:3000"]` | Allowed front-end origins |

**Example `backend/.env`:**

```dotenv
DATABASE_URL=sqlite:///./stock_analyzer.db
BENCHMARK_ITERATIONS=5
```

---

## Running Locally

Start the backend and frontend in two separate terminals.

### Terminal 1 — Backend

```bash
cd backend
# Activate your virtual environment first
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Interactive API docs are available immediately at:

| URL | Description |
|---|---|
| `http://localhost:8000/api/v1/docs` | Swagger UI |
| `http://localhost:8000/api/v1/redoc` | ReDoc |
| `http://localhost:8000/api/v1/openapi.json` | OpenAPI schema |

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

> The Vite dev server proxies all `/api` requests to `http://localhost:8000`.
> The backend must be running before the frontend can serve meaningful data.

---

## API Reference

All endpoints are under the `/api/v1` prefix. Authentication is not required
(local/academic deployment). The complete, interactive reference is at
`http://localhost:8000/api/v1/docs`.

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Liveness probe — no DB query |
| `GET` | `/api/v1/health/full` | Readiness probe — includes DB check |

```bash
curl http://localhost:8000/api/v1/health
```

```json
{
  "status": "healthy",
  "app": "Historic Stock Market Peak Analyzer",
  "version": "1.0.0",
  "database": "not_checked",
  "registered_algorithms": ["Brute Force", "Divide & Conquer", "Kadane's Algorithm"],
  "algorithm_complexities": {
    "Brute Force": "O(N²)",
    "Divide & Conquer": "O(N log N)",
    "Kadane's Algorithm": "O(N)"
  }
}
```

---

### Datasets

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/datasets/generate` | Generate a synthetic price series |
| `POST` | `/api/v1/datasets/validate` | Dry-run file validation (no DB write) |
| `POST` | `/api/v1/datasets/upload?name=…` | Upload CSV / XLSX (≤50 MB) |
| `GET` | `/api/v1/datasets` | Paginated list (`page`, `page_size≤100`) |
| `GET` | `/api/v1/datasets/{id}` | Dataset detail with embedded analysis runs |
| `GET` | `/api/v1/datasets/{id}/prices` | Price array (LTTB-downsampled if >10K) |
| `DELETE` | `/api/v1/datasets/{id}` | Delete dataset, cascade all related rows |

**Generate example:**

```bash
curl -X POST http://localhost:8000/api/v1/datasets/generate \
  -H "Content-Type: application/json" \
  -d '{"name":"Bull Run","size":50000,"distribution_type":"mostly_positive","seed":42}'
```

`distribution_type` values: `random` | `mostly_positive` | `mostly_negative` |
`high_volatility` | `low_volatility`

**Upload example:**

```bash
curl -X POST "http://localhost:8000/api/v1/datasets/upload?name=SP500" \
  -F "file=@sp500.csv"
```

Supported price columns (detected in priority order, case-insensitive):
`close` > `adj_close` > `price` > `value` > `open` > `high` > `low` >
first numeric column.

---

### Analysis

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/analyze` | Run algorithms; results cached by `dataset_id` |

```bash
# By dataset_id (results cached in DB)
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": 1, "algorithms": ["Kadane'\''s Algorithm"]}'

# Inline prices (ephemeral — not saved, max 100,000 elements)
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"prices": [100.0, 113.0, 110.0, 85.0, 105.0]}'
```

The response includes `verification_passed` — whether all selected
algorithms returned the same `max_profit` — and per-algorithm `buy_index`,
`sell_index`, and `max_profit`.

---

### Benchmark

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/benchmark` | Start async 10-iteration benchmark (returns `job_id`) |
| `GET` | `/api/v1/benchmark/{job_id}` | Poll job status / retrieve report |
| `GET` | `/api/v1/benchmark` | List all jobs (newest first, max 200) |
| `GET` | `/api/v1/benchmark/algorithms/info` | Algorithm metadata and safe size limits |

```bash
# Start benchmark
JOB=$(curl -s -X POST http://localhost:8000/api/v1/benchmark \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": 1}' | python -c "import sys,json; print(json.load(sys.stdin)['job_id'])")

# Poll until completed
curl http://localhost:8000/api/v1/benchmark/$JOB
```

Status values: `queued` | `running` | `completed` | `failed`.
Results include Mean / Median / Min / Max / StdDev for time and memory per
algorithm.

---

### Complexity Sweep

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/complexity/sweep` | Run multi-size automated sweep (async) |
| `GET` | `/api/v1/complexity/sweep/{job_id}` | Poll sweep status |
| `GET` | `/api/v1/complexity/analysis` | Retrieve latest experimental complexity data |

The sweep generates synthetic datasets at each requested size, benchmarks
all eligible algorithms, and returns a fitness score \[0.0, 1.0\] measuring
alignment between observed growth and theoretical Big-O.

---

### ML

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/ml/models` | List available models and hyperparameter schemas |
| `POST` | `/api/v1/ml/train` | Start training job (async, returns `job_id`) |
| `GET` | `/api/v1/ml/jobs/{job_id}` | Poll training status |
| `GET` | `/api/v1/ml/jobs` | List jobs (`limit` 1–200, default 50) |
| `POST` | `/api/v1/ml/predict/{job_id}` | Run inference with a trained artifact |
| `DELETE` | `/api/v1/ml/jobs/{job_id}` | Delete job and artifact from disk |

Three models are registered:

| Model | Algorithm | Use case |
|---|---|---|
| `anomaly_detector` | Isolation Forest | Detect unusual price movements |
| `regime_classifier` | K-Means | Classify bull/bear/neutral market regimes |
| `peak_predictor` | Gradient Boosting | Predict Buy / Hold / Sell signals |

Features: RSI-14, Bollinger position, momentum (5-day and 20-day), z-score,
absolute return, price trend slope.

---

### Dashboard & Reports

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/dashboard/summary` | Aggregate counts and latest benchmark stats |
| `GET` | `/api/v1/report/datasets` | Dataset list formatted for report view |
| `GET` | `/api/v1/report/dataset/{id}` | Download full PDF report for a dataset |

---

### Error Format

All errors follow FastAPI's standard format:

```json
{ "detail": "Human-readable error message." }
```

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 202 | Accepted (background task queued) |
| 204 | No content (DELETE) |
| 404 | Resource not found |
| 413 | File exceeds 50 MB upload limit |
| 422 | Validation error |
| 500 | Server error |

---

## Testing

Tests are in `backend/tests/`. The suite uses pytest with `asyncio_mode = auto`
and requires an active virtual environment.

```bash
cd backend
# Run full suite with coverage
pytest

# Run a single module
pytest tests/test_algorithms.py -v

# Run without coverage (faster)
pytest --no-cov
```

Coverage gate is **≥80%** (`--cov-fail-under=80`); the run fails if it drops
below. Reports print to the terminal with missing-line annotations.

**Test modules:**

| File | What it tests |
|---|---|
| `test_algorithms.py` | Correctness, CLRS §4.1 example, edge cases (N=2, all-decreasing) |
| `test_api_integration.py` | Full HTTP round-trips via `httpx.AsyncClient` |
| `test_benchmark_runner.py` | Stats invariants, size limit enforcement, async threading |
| `test_cache_service.py` | SHA-256 hash properties, DB cache hit/miss |
| `test_dataset_generator.py` | Distribution profiles, reproducibility via seed |
| `test_downsampler.py` | LTTB fidelity, identity mapping when below threshold |
| `test_experimental_analysis.py` | Complexity scaling, fitness score bounds |
| `test_file_parser.py` | CSV/XLSX parsing, column detection, NaN handling |

The `conftest.py` provides an in-memory SQLite engine (session-scoped) and
function-scoped transactional sessions that roll back after each test, ensuring
full isolation.

---

## Project Structure

```
DAA/
├── backend/
│   ├── main.py                   # FastAPI app factory + lifespan hook
│   ├── config.py                 # Pydantic Settings (all configurable values)
│   ├── requirements.txt          # Python dependencies
│   ├── pytest.ini                # Test runner config (asyncio, coverage)
│   │
│   ├── algorithms/               # Strategy-pattern algorithm implementations
│   │   ├── base.py               # AlgorithmStrategy ABC + SubarrayResult
│   │   ├── registry.py           # ALGORITHM_REGISTRY singleton
│   │   ├── brute_force.py        # O(N²) nested-loop implementation
│   │   ├── divide_and_conquer.py # O(N log N) recursive D&C
│   │   └── kadane.py             # O(N) Kadane's algorithm
│   │
│   ├── api/v1/routes/            # FastAPI routers (one file per resource)
│   │   ├── health.py
│   │   ├── datasets.py
│   │   ├── analysis.py
│   │   ├── benchmark.py
│   │   ├── complexity.py
│   │   ├── dashboard.py
│   │   ├── report.py
│   │   └── ml.py
│   │
│   ├── database/
│   │   ├── connection.py         # SQLite engine (WAL, foreign keys, cache)
│   │   ├── init_db.py            # Table creation on startup
│   │   └── models.py             # SQLAlchemy ORM models
│   │
│   ├── models/
│   │   └── schemas.py            # Pydantic v2 request/response schemas
│   │
│   ├── services/
│   │   ├── benchmark_runner.py   # 10-iteration benchmark, gc.collect protocol
│   │   ├── cache_service.py      # SHA-256 content-addressed result cache
│   │   ├── dataset_generator.py  # Synthetic log-normal price generation
│   │   ├── downsampler.py        # LTTB algorithm
│   │   ├── experimental_analysis.py # Theoretical vs observed complexity
│   │   ├── file_parser.py        # CSV/XLSX ingestion with column detection
│   │   ├── job_store.py          # In-memory benchmark job registry
│   │   ├── ml_trainer.py         # ML job lifecycle (train, persist, predict)
│   │   ├── report_generator.py   # ReportLab PDF generation
│   │   └── sweep_service.py      # Multi-size automated complexity sweep
│   │
│   ├── ml/                       # ML model strategy implementations
│   │   ├── base.py               # MLModelStrategy ABC + HyperparamDef
│   │   ├── registry.py           # ML_MODEL_REGISTRY
│   │   ├── feature_engine.py     # Feature extraction (RSI, Bollinger, …)
│   │   ├── anomaly.py            # Isolation Forest
│   │   ├── regime.py             # K-Means regime classifier
│   │   └── predictor.py          # Gradient Boosting buy/sell predictor
│   │
│   ├── tests/                    # pytest suite (8 modules, ≥80% coverage)
│   └── docs/
│       ├── architecture.md       # System design reference
│       └── api_contract.md       # Endpoint contract for frontend developers
│
└── frontend/
    ├── index.html
    ├── vite.config.js            # Vite 6 + proxy to :8000
    ├── package.json
    └── src/
        ├── App.jsx               # Router root (7 routes)
        ├── index.css             # Global design tokens + utilities
        ├── api/                  # Axios client + per-resource modules
        ├── components/           # Shared UI components + layout
        ├── hooks/                # Custom React hooks
        └── pages/
            ├── Dashboard.jsx     # Summary cards and recent activity
            ├── DatasetManager.jsx # Upload, generate, list, delete datasets
            ├── AnalysisView.jsx  # Run and compare algorithm results
            ├── BenchmarkView.jsx # Trigger and visualise benchmark jobs
            ├── ComplexityView.jsx # Complexity sweep and fitness scores
            ├── MLView.jsx        # Train, inspect, and run ML models
            └── ReportView.jsx    # Download PDF reports
```

---

## License

Declared as **MIT** in the FastAPI application metadata (`license_info` in
`main.py`). No `LICENSE` file is present in the repository root. If you
intend to publish this project, add an MIT `LICENSE` file.

---

## Notes

- **No CI/CD configuration** (no `.github/workflows/`, `Dockerfile`, or
  `docker-compose.yml`) exists in the repository. Tests must be run locally.
- **Benchmark job state is in-memory.** Restarting the backend clears all
  queued and running benchmark jobs. Completed results are persisted in
  SQLite and survive restarts.
- **ML model artifacts** are saved as joblib (pickle) files under
  `backend/data/ml_models/`. Delete this directory to reset all trained
  models.
- The `data/` directory (`.npy` price files and ML artifacts) is created
  automatically by the backend on startup via `config.py`.
