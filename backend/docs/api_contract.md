# Phase 2 API Contract
## Historic Stock Market Peak Analyzer — `/api/v1`

> **For frontend developers.** This document defines every endpoint, request schema, and response schema for Phase 2.
> The live Swagger UI is available at `http://localhost:8000/api/v1/docs` once the server is running.

---

## Base URL
```
http://localhost:8000/api/v1
```

---

## Authentication
None required (academic/local deployment).

---

## Common Headers

| Header | Value | Required |
|---|---|---|
| `Content-Type` | `application/json` | POST requests with JSON body |
| `Content-Type` | `multipart/form-data` | File upload endpoints |

---

## Endpoints

### Health

#### `GET /health`
Liveness probe — no DB query.

**Response 200**
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
  },
  "timestamp": "2024-01-01T12:00:00"
}
```

#### `GET /health/full`
Readiness probe — includes DB connectivity check.

---

### Datasets

#### `POST /datasets/generate`
Generate a synthetic log-normal price series.

**Request Body** `application/json`
```json
{
  "name": "My Bull Market Dataset",
  "size": 50000,
  "distribution_type": "mostly_positive",
  "start_price": 100.0,
  "seed": 42
}
```

| Field | Type | Required | Constraints | Default |
|---|---|---|---|---|
| `name` | string | ✓ | 1–255 chars | — |
| `size` | int | ✓ | 1,000–1,000,000 | — |
| `distribution_type` | enum | | `random` \| `mostly_positive` \| `mostly_negative` \| `high_volatility` \| `low_volatility` | `random` |
| `start_price` | float | | > 0 | 100.0 |
| `seed` | int | | Any integer | `null` (random) |

**Response 201**
```json
{
  "dataset_id": 1,
  "name": "My Bull Market Dataset",
  "sha256_hash": "abc123...64chars...",
  "size": 50000,
  "distribution_type": "mostly_positive",
  "source": "generated",
  "cached": false,
  "stats": {
    "min_price": 67.23,
    "max_price": 188.45,
    "mean_price": 118.82,
    "std_price": 31.44
  },
  "price_data": {
    "prices": [100.0, 100.85, ...],
    "indices": [0, 10, 20, ...],
    "is_downsampled": true,
    "original_size": 50000,
    "returned_size": 5000
  },
  "created_at": "2024-01-01T12:00:00"
}
```

> **⚠️ LTTB Note:** When `original_size > 10,000`, `prices` is downsampled to 5,000 points.
> Always use `indices` as your x-axis values — `indices[i]` is the position of `prices[i]` in the full dataset.
> When `is_downsampled = false`, `indices = [0, 1, 2, ..., N-1]`.

**Error 422** — Invalid parameters:
```json
{ "detail": "size must be an integer in [1,000, 1,000,000], got 500." }
```

---

#### `POST /datasets/validate`
Dry-run CSV/XLSX validation without saving to DB.

**Request** `multipart/form-data`
- `file`: CSV or XLSX file

**Response 200**
```json
{
  "is_valid": true,
  "total_rows": 2500,
  "valid_rows": 2498,
  "price_column_detected": "close",
  "warnings": [
    {
      "code": "NAN_VALUES_DROPPED",
      "message": "2 row(s) contained NaN or Inf values and were removed."
    }
  ]
}
```

---

#### `POST /datasets/upload`
Upload a CSV or XLSX price file.

**Request** `multipart/form-data`
- `name` (query param): Dataset name (string, required)
- `file`: CSV or XLSX file

**Supported column names** (case-insensitive, priority order):
`close` > `adj_close` > `price` > `value` > `open` > `high` > `low` > (first numeric column)

**Response 201** — Same schema as `/datasets/generate`

**Error 422**
```json
{ "detail": "Cannot detect a price column in 'data.csv'. Columns found: ['date', 'symbol']." }
```

---

#### `GET /datasets`
Paginated dataset list.

**Query Parameters**
| Param | Type | Default | Max |
|---|---|---|---|
| `page` | int | 1 | — |
| `page_size` | int | 20 | 100 |

**Response 200**
```json
{
  "total": 42,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 1,
      "name": "My Dataset",
      "size": 50000,
      "distribution_type": "mostly_positive",
      "source": "generated",
      "sha256_hash": "abc...",
      "min_price": 67.23,
      "max_price": 188.45,
      "mean_price": 118.82,
      "is_verified": false,
      "created_at": "2024-01-01T12:00:00"
    }
  ]
}
```

---

#### `GET /datasets/{dataset_id}`
Dataset detail with embedded analysis runs.

**Response 200**
```json
{
  "id": 1,
  "name": "My Dataset",
  "sha256_hash": "abc...",
  "size": 50000,
  "distribution_type": "mostly_positive",
  "source": "generated",
  "min_price": 67.23, "max_price": 188.45,
  "mean_price": 118.82, "std_price": 31.44,
  "is_verified": true,
  "original_filename": null,
  "analysis_runs": [
    {
      "algorithm_name": "Kadane's Algorithm",
      "time_complexity": "O(N)",
      "max_profit": 47.23,
      "buy_index": 512,
      "sell_index": 41024,
      "buy_price": 72.11,
      "sell_price": 119.34,
      "left_sum": null, "right_sum": null, "cross_sum": null
    }
  ],
  "created_at": "2024-01-01T12:00:00"
}
```

**Error 404** — Dataset not found.

---

#### `GET /datasets/{dataset_id}/prices`
Get price array (LTTB-downsampled if needed).

**Response 200**
```json
{
  "prices": [100.0, 100.85, ...],
  "indices": [0, 10, 20, ...],
  "is_downsampled": true,
  "original_size": 50000,
  "returned_size": 5000
}
```

---

#### `DELETE /datasets/{dataset_id}`
Delete dataset, cascade analysis runs, benchmark results, and the `.npy` file.

**Response 204** — No content.

---

### Analysis

#### `POST /analyze`
Run algorithm(s) on a dataset (synchronous — awaits all results).

**Request Body**
```json
{
  "dataset_id": 1,
  "algorithms": ["Kadane's Algorithm", "Divide & Conquer"]
}
```

OR with inline prices (NOT saved to DB):
```json
{
  "prices": [100.0, 101.5, 99.2, 108.4, 95.1],
  "algorithms": null
}
```

| Field | Type | Rules |
|---|---|---|
| `dataset_id` | int \| null | Provide `dataset_id` **or** `prices` (not both) |
| `prices` | float[] \| null | Min 2 elements |
| `algorithms` | string[] \| null | `null` = all registered. Names must match exactly. |

**Available Algorithm Names:**
- `"Brute Force"`
- `"Divide & Conquer"`
- `"Kadane's Algorithm"`

**Response 200**
```json
{
  "dataset_id": 1,
  "dataset_size": 50000,
  "algorithms_run": ["Brute Force", "Divide & Conquer", "Kadane's Algorithm"],
  "cached": false,
  "verification_passed": true,
  "verification_notes": ["✓ All 3 algorithms agree. [BF: 47.230000 | D&C: 47.230000 | Kadane: 47.230000]"],
  "results": {
    "Brute Force": {
      "algorithm_name": "Brute Force",
      "time_complexity": "O(N²)",
      "max_profit": 47.23,
      "buy_index": 512,
      "sell_index": 41024,
      "buy_price": 72.11,
      "sell_price": 119.34,
      "left_sum": null, "right_sum": null, "cross_sum": null
    },
    "Divide & Conquer": { "..." },
    "Kadane's Algorithm": { "..." }
  }
}
```

> **Caching:** When `dataset_id` is used, results are stored in `analysis_runs`. Repeated calls return `"cached": true` instantly.

**Error 422** — Both or neither of `dataset_id`/`prices` provided.  
**Error 404** — `dataset_id` not found.

---

### Benchmark

#### `POST /benchmark`
Start a 10-iteration async benchmark (returns immediately).

**Request Body**
```json
{
  "dataset_id": 1,
  "algorithms": null
}
```

**Response 202** (immediately)
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "dataset_id": 1,
  "dataset_size": 50000,
  "status": "queued",
  "progress_message": "Benchmark queued — waiting for worker thread.",
  "cached": false,
  "created_at": "2024-01-01T12:00:00",
  "started_at": null,
  "completed_at": null,
  "report": null,
  "error": null
}
```

> **Cache shortcut:** If all benchmark results exist for this dataset's SHA-256 hash, `status` returns as `"completed"` immediately with the cached `report`.

---

#### `GET /benchmark/{job_id}`
Poll benchmark status.

**Response 200** (while running)
```json
{
  "job_id": "550e8400-...",
  "status": "running",
  "progress_message": "Running benchmark iterations… this may take several seconds.",
  "report": null
}
```

**Response 200** (when complete)
```json
{
  "job_id": "550e8400-...",
  "status": "completed",
  "cached": false,
  "completed_at": "2024-01-01T12:00:05",
  "report": {
    "dataset_id": 1,
    "dataset_size": 50000,
    "sha256_hash": "abc...",
    "iterations": 10,
    "verification_passed": true,
    "verification_notes": ["✓ All 3 algorithms agree."],
    "cached": false,
    "stats": {
      "Brute Force": {
        "algorithm_name": "Brute Force",
        "time_complexity": "O(N²)",
        "dataset_size": 50000,
        "iterations": 10,
        "mean_time": 2.341,
        "median_time": 2.338,
        "min_time": 2.301,
        "max_time": 2.401,
        "std_time": 0.028,
        "mean_memory_mb": 3.12,
        "median_memory_mb": 3.10,
        "min_memory_mb": 3.05,
        "max_memory_mb": 3.24,
        "std_memory_mb": 0.06
      },
      "Divide & Conquer": { "..." },
      "Kadane's Algorithm": { "..." }
    }
  },
  "error": null
}
```

**Polling Strategy (frontend):**
```javascript
const poll = async (jobId) => {
  const res = await fetch(`/api/v1/benchmark/${jobId}`);
  const job = await res.json();
  if (job.status === 'completed' || job.status === 'failed') return job;
  await new Promise(r => setTimeout(r, 2000)); // 2s between polls
  return poll(jobId);
};
```

**Error 404** — Job not found (jobs are lost on server restart).

---

#### `GET /benchmark`
List all in-memory benchmark jobs (newest first).

**Response 200** — `BenchmarkJobStatusSchema[]`

---

#### `GET /benchmark/algorithms/info`
List all registered algorithms with metadata.

**Response 200**
```json
[
  {
    "name": "Brute Force",
    "time_complexity": "O(N²)",
    "space_complexity": "O(1)",
    "max_safe_input_size": 20000
  },
  {
    "name": "Divide & Conquer",
    "time_complexity": "O(N log N)",
    "space_complexity": "O(log N)",
    "max_safe_input_size": 100000
  },
  {
    "name": "Kadane's Algorithm",
    "time_complexity": "O(N)",
    "space_complexity": "O(1)",
    "max_safe_input_size": 1000000
  }
]
```

---

## Error Response Format

All errors follow FastAPI's default format:
```json
{
  "detail": "Human-readable error message."
}
```

| HTTP Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 202 | Accepted (background task queued) |
| 204 | No Content (DELETE success) |
| 404 | Resource not found |
| 422 | Validation error / bad request body |
| 500 | Server error |

---

## Frontend Integration Notes

### Chart Rendering with Downsampled Data
```javascript
// Always use indices for x-axis when is_downsampled is true
const chartData = priceData.prices.map((price, i) => ({
  x: priceData.indices[i],   // ← correct position in full dataset
  y: price
}));
```

### Highlighting the Profit Window
```javascript
// buy_index and sell_index refer to full-dataset positions
// Map them to chart x-axis using indices array
const buyChartX = priceData.indices.findIndex(idx => idx >= result.buy_index);
const sellChartX = priceData.indices.findIndex(idx => idx >= result.sell_index);
```

### Live Swagger UI
Once the server is running: `http://localhost:8000/api/v1/docs`
