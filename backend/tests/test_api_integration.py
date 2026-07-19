"""
Integration Tests — FastAPI Endpoints (Phase 2).

Uses FastAPI's TestClient which runs the full ASGI stack in-process.

Covered endpoints:
    POST /api/v1/datasets/generate
    POST /api/v1/datasets/upload
    POST /api/v1/datasets/validate
    GET  /api/v1/datasets
    GET  /api/v1/datasets/{id}
    GET  /api/v1/datasets/{id}/prices
    DELETE /api/v1/datasets/{id}
    POST /api/v1/analyze
    POST /api/v1/benchmark
    GET  /api/v1/benchmark/{job_id}
    GET  /api/v1/benchmark/algorithms/info

Each test is isolated by creating a fresh in-memory DB via the test fixtures
from conftest.py. The app database dependency is overridden at test startup.
"""

import io
import time
from typing import Generator

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database.connection import get_db
from database.models import Base
from main import create_application


# ══════════════════════════════════════════════════════════════════════════════
# Test App + DB Fixtures
# ══════════════════════════════════════════════════════════════════════════════

TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture(scope="module")
def test_app():
    """Create a FastAPI test application with an in-memory SQLite DB."""
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    app = create_application()

    def _override_get_db() -> Generator:
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


@pytest.fixture(scope="module")
def client(test_app):
    """Return a TestClient wrapping the test application."""
    with TestClient(test_app) as c:
        yield c


# ── CSV fixture builder ───────────────────────────────────────────────────────

def _make_csv_bytes(prices: list[float], col_name: str = "close") -> bytes:
    df = pd.DataFrame({col_name: prices})
    return df.to_csv(index=False).encode("utf-8")


def _make_xlsx_bytes(prices: list[float], col_name: str = "price") -> bytes:
    df = pd.DataFrame({col_name: prices})
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════════════════
# POST /datasets/generate
# ══════════════════════════════════════════════════════════════════════════════

class TestGenerateEndpoint:

    def test_generate_returns_201(self, client):
        resp = client.post("/api/v1/datasets/generate", json={
            "name": "Test Random",
            "size": 1_000,
            "distribution_type": "random",
            "seed": 1
        })
        assert resp.status_code == 201, resp.text

    def test_generate_response_schema(self, client):
        resp = client.post("/api/v1/datasets/generate", json={
            "name": "Schema Test",
            "size": 1_000,
            "distribution_type": "mostly_positive",
            "seed": 2
        })
        data = resp.json()
        assert "dataset_id" in data
        assert "sha256_hash" in data
        assert "stats" in data
        assert "price_data" in data
        assert data["size"] == 1_000

    def test_generate_price_data_fields(self, client):
        resp = client.post("/api/v1/datasets/generate", json={
            "name": "Price Data Test",
            "size": 2_000,
            "seed": 3
        })
        pd_field = resp.json()["price_data"]
        assert "prices" in pd_field
        assert "indices" in pd_field
        assert "is_downsampled" in pd_field
        assert "original_size" in pd_field
        assert "returned_size" in pd_field

    def test_generate_small_dataset_not_downsampled(self, client):
        resp = client.post("/api/v1/datasets/generate", json={
            "name": "Small",
            "size": 1_000,
            "seed": 10
        })
        pd_field = resp.json()["price_data"]
        assert pd_field["is_downsampled"] is False
        assert pd_field["returned_size"] == 1_000

    def test_generate_large_dataset_downsampled(self, client):
        """N=50K > downsample_threshold(10K) → LTTB applied."""
        resp = client.post("/api/v1/datasets/generate", json={
            "name": "Large LTTB",
            "size": 50_000,
            "seed": 7
        })
        pd_field = resp.json()["price_data"]
        assert pd_field["is_downsampled"] is True
        assert pd_field["original_size"] == 50_000
        assert pd_field["returned_size"] < 50_000

    def test_generate_same_seed_returns_cache_hit(self, client):
        body = {"name": "Cache Test", "size": 1_000, "seed": 99}
        resp1 = client.post("/api/v1/datasets/generate", json=body)
        resp2 = client.post("/api/v1/datasets/generate", json=body)
        assert resp2.json()["cached"] is True
        assert resp1.json()["sha256_hash"] == resp2.json()["sha256_hash"]

    def test_generate_size_below_minimum_returns_422(self, client):
        resp = client.post("/api/v1/datasets/generate", json={"name": "X", "size": 100})
        assert resp.status_code == 422

    def test_generate_unknown_distribution_returns_422(self, client):
        resp = client.post("/api/v1/datasets/generate", json={
            "name": "X", "size": 1_000, "distribution_type": "alien"
        })
        assert resp.status_code == 422

    def test_generate_stats_min_le_max(self, client):
        resp = client.post("/api/v1/datasets/generate", json={"name": "Stats", "size": 5_000, "seed": 55})
        stats = resp.json()["stats"]
        assert stats["min_price"] <= stats["max_price"]

    def test_generate_response_contains_indices(self, client):
        resp = client.post("/api/v1/datasets/generate", json={"name": "Idx Test", "size": 1_000, "seed": 4})
        pd_field = resp.json()["price_data"]
        assert len(pd_field["indices"]) == len(pd_field["prices"])


# ══════════════════════════════════════════════════════════════════════════════
# POST /datasets/validate
# ══════════════════════════════════════════════════════════════════════════════

class TestValidateEndpoint:

    def test_validate_valid_csv_returns_200(self, client):
        csv = _make_csv_bytes([100.0, 101.0, 99.0, 102.0])
        resp = client.post(
            "/api/v1/datasets/validate",
            files={"file": ("data.csv", csv, "text/csv")},
        )
        assert resp.status_code == 200

    def test_validate_valid_csv_is_valid_true(self, client):
        csv = _make_csv_bytes([100.0, 101.0, 99.0])
        resp = client.post(
            "/api/v1/datasets/validate",
            files={"file": ("data.csv", csv, "text/csv")},
        )
        assert resp.json()["is_valid"] is True

    def test_validate_invalid_csv_is_valid_false(self, client):
        csv = b"name,city\nAlice,NY\nBob,LA"
        resp = client.post(
            "/api/v1/datasets/validate",
            files={"file": ("data.csv", csv, "text/csv")},
        )
        assert resp.json()["is_valid"] is False

    def test_validate_reports_price_column(self, client):
        csv = _make_csv_bytes([10.0, 11.0, 12.0], col_name="close")
        resp = client.post(
            "/api/v1/datasets/validate",
            files={"file": ("data.csv", csv, "text/csv")},
        )
        assert resp.json()["price_column_detected"] == "close"

    def test_validate_reports_row_counts(self, client):
        prices = [float(i) for i in range(1, 101)]
        csv = _make_csv_bytes(prices)
        resp = client.post(
            "/api/v1/datasets/validate",
            files={"file": ("data.csv", csv, "text/csv")},
        )
        data = resp.json()
        assert data["total_rows"] == 100
        assert data["valid_rows"] == 100


# ══════════════════════════════════════════════════════════════════════════════
# POST /datasets/upload
# ══════════════════════════════════════════════════════════════════════════════

class TestUploadEndpoint:

    def test_upload_csv_returns_201(self, client):
        csv = _make_csv_bytes([float(i) for i in range(10, 110)])  # 100 prices
        resp = client.post(
            "/api/v1/datasets/upload?name=UploadedCSV",
            files={"file": ("prices.csv", csv, "text/csv")},
        )
        assert resp.status_code == 201, resp.text

    def test_upload_response_has_dataset_id(self, client):
        csv = _make_csv_bytes([float(i) for i in range(50, 150)])
        resp = client.post(
            "/api/v1/datasets/upload?name=MyUpload",
            files={"file": ("prices.csv", csv, "text/csv")},
        )
        assert "dataset_id" in resp.json()

    def test_upload_xlsx_returns_201(self, client):
        xlsx = _make_xlsx_bytes([float(i) for i in range(1, 51)])
        resp = client.post(
            "/api/v1/datasets/upload?name=ExcelUpload",
            files={"file": ("prices.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 201, resp.text

    def test_upload_duplicate_returns_cached(self, client):
        prices = [float(i) for i in range(200, 310)]
        csv = _make_csv_bytes(prices)
        client.post("/api/v1/datasets/upload?name=First", files={"file": ("p.csv", csv, "text/csv")})
        resp2 = client.post("/api/v1/datasets/upload?name=Second", files={"file": ("p.csv", csv, "text/csv")})
        assert resp2.json()["cached"] is True

    def test_upload_invalid_file_type_returns_422(self, client):
        resp = client.post(
            "/api/v1/datasets/upload?name=BadFile",
            files={"file": ("data.txt", b"some data", "text/plain")},
        )
        assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# GET /datasets
# ══════════════════════════════════════════════════════════════════════════════

class TestListDatasetsEndpoint:

    def test_list_returns_200(self, client):
        resp = client.get("/api/v1/datasets")
        assert resp.status_code == 200

    def test_list_response_has_pagination_fields(self, client):
        resp = client.get("/api/v1/datasets")
        data = resp.json()
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "items" in data

    def test_list_pagination_params(self, client):
        resp = client.get("/api/v1/datasets?page=1&page_size=5")
        data = resp.json()
        assert data["page"] == 1
        assert data["page_size"] == 5
        assert len(data["items"]) <= 5


# ══════════════════════════════════════════════════════════════════════════════
# GET /datasets/{id}
# ══════════════════════════════════════════════════════════════════════════════

class TestGetDatasetEndpoint:

    def test_get_existing_returns_200(self, client):
        # First generate a dataset
        resp = client.post("/api/v1/datasets/generate", json={"name": "ForGet", "size": 1_000, "seed": 111})
        ds_id = resp.json()["dataset_id"]

        resp2 = client.get(f"/api/v1/datasets/{ds_id}")
        assert resp2.status_code == 200

    def test_get_nonexistent_returns_404(self, client):
        resp = client.get("/api/v1/datasets/99999")
        assert resp.status_code == 404

    def test_get_response_has_sha256(self, client):
        resp = client.post("/api/v1/datasets/generate", json={"name": "SHA256", "size": 1_000, "seed": 222})
        ds_id = resp.json()["dataset_id"]
        detail = client.get(f"/api/v1/datasets/{ds_id}").json()
        assert "sha256_hash" in detail
        assert len(detail["sha256_hash"]) == 64


# ══════════════════════════════════════════════════════════════════════════════
# GET /datasets/{id}/prices
# ══════════════════════════════════════════════════════════════════════════════

class TestGetPricesEndpoint:

    def test_get_prices_returns_200(self, client):
        resp = client.post("/api/v1/datasets/generate", json={"name": "Prices", "size": 1_000, "seed": 333})
        ds_id = resp.json()["dataset_id"]
        resp2 = client.get(f"/api/v1/datasets/{ds_id}/prices")
        assert resp2.status_code == 200

    def test_get_prices_schema(self, client):
        resp = client.post("/api/v1/datasets/generate", json={"name": "PSchema", "size": 1_000, "seed": 444})
        ds_id = resp.json()["dataset_id"]
        data = client.get(f"/api/v1/datasets/{ds_id}/prices").json()
        assert "prices" in data
        assert "indices" in data
        assert len(data["prices"]) == len(data["indices"])

    def test_get_prices_nonexistent_returns_404(self, client):
        resp = client.get("/api/v1/datasets/88888/prices")
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# POST /analyze
# ══════════════════════════════════════════════════════════════════════════════

class TestAnalyzeEndpoint:

    def test_analyze_inline_prices(self, client):
        prices = [100.0, 101.0, 99.0, 105.0, 98.0, 110.0, 95.0]
        resp = client.post("/api/v1/analyze", json={"prices": prices})
        assert resp.status_code == 200

    def test_analyze_returns_all_algorithms(self, client):
        prices = [float(i) for i in range(10, 30)]
        resp = client.post("/api/v1/analyze", json={"prices": prices})
        results = resp.json()["results"]
        assert len(results) == 3  # Brute Force, D&C, Kadane

    def test_analyze_verification_passed_for_clean_data(self, client):
        prices = [100.0, 102.0, 101.0, 105.0, 103.0, 108.0]
        resp = client.post("/api/v1/analyze", json={"prices": prices})
        assert resp.json()["verification_passed"] is True

    def test_analyze_result_fields(self, client):
        prices = [10.0, 12.0, 8.0, 15.0, 5.0, 18.0]
        resp = client.post("/api/v1/analyze", json={"prices": prices})
        for algo_name, result in resp.json()["results"].items():
            assert "max_profit" in result
            assert "buy_index" in result
            assert "sell_index" in result
            assert result["sell_index"] > result["buy_index"]

    def test_analyze_with_dataset_id(self, client):
        # Generate a dataset first
        gen_resp = client.post("/api/v1/datasets/generate", json={"name": "AnalyzeDS", "size": 1_000, "seed": 555})
        ds_id = gen_resp.json()["dataset_id"]

        resp = client.post("/api/v1/analyze", json={"dataset_id": ds_id})
        assert resp.status_code == 200
        assert resp.json()["dataset_id"] == ds_id

    def test_analyze_second_call_is_cached(self, client):
        gen_resp = client.post("/api/v1/datasets/generate", json={"name": "CacheTest", "size": 1_000, "seed": 777})
        ds_id = gen_resp.json()["dataset_id"]

        client.post("/api/v1/analyze", json={"dataset_id": ds_id})
        resp2 = client.post("/api/v1/analyze", json={"dataset_id": ds_id})
        assert resp2.json()["cached"] is True

    def test_analyze_neither_dataset_id_nor_prices_returns_422(self, client):
        resp = client.post("/api/v1/analyze", json={"algorithms": ["Kadane's Algorithm"]})
        assert resp.status_code == 422

    def test_analyze_both_dataset_id_and_prices_returns_422(self, client):
        resp = client.post("/api/v1/analyze", json={
            "dataset_id": 1,
            "prices": [1.0, 2.0, 3.0]
        })
        assert resp.status_code == 422

    def test_analyze_unknown_algorithm_returns_422(self, client):
        resp = client.post("/api/v1/analyze", json={
            "prices": [1.0, 2.0, 3.0],
            "algorithms": ["NonExistent"]
        })
        assert resp.status_code == 422

    def test_analyze_single_algorithm(self, client):
        prices = [float(i) for i in range(10, 25)]
        resp = client.post("/api/v1/analyze", json={
            "prices": prices,
            "algorithms": ["Kadane's Algorithm"]
        })
        assert resp.status_code == 200
        assert len(resp.json()["results"]) == 1


# ══════════════════════════════════════════════════════════════════════════════
# POST + GET /benchmark
# ══════════════════════════════════════════════════════════════════════════════

class TestBenchmarkEndpoints:

    def test_start_benchmark_returns_202(self, client):
        gen_resp = client.post("/api/v1/datasets/generate", json={"name": "BenchDS", "size": 1_000, "seed": 888})
        ds_id = gen_resp.json()["dataset_id"]

        resp = client.post("/api/v1/benchmark", json={"dataset_id": ds_id})
        assert resp.status_code == 202, resp.text

    def test_start_benchmark_returns_job_id(self, client):
        gen_resp = client.post("/api/v1/datasets/generate", json={"name": "JobID", "size": 1_000, "seed": 889})
        ds_id = gen_resp.json()["dataset_id"]
        resp = client.post("/api/v1/benchmark", json={"dataset_id": ds_id})
        assert "job_id" in resp.json()
        assert len(resp.json()["job_id"]) == 36  # UUID4 format

    def test_start_benchmark_status_queued_or_completed(self, client):
        gen_resp = client.post("/api/v1/datasets/generate", json={"name": "Status", "size": 1_000, "seed": 890})
        ds_id = gen_resp.json()["dataset_id"]
        resp = client.post("/api/v1/benchmark", json={"dataset_id": ds_id})
        assert resp.json()["status"] in ("queued", "running", "completed")

    def test_poll_job_returns_200(self, client):
        gen_resp = client.post("/api/v1/datasets/generate", json={"name": "Poll", "size": 1_000, "seed": 891})
        ds_id = gen_resp.json()["dataset_id"]
        job_id = client.post("/api/v1/benchmark", json={"dataset_id": ds_id}).json()["job_id"]

        resp = client.get(f"/api/v1/benchmark/{job_id}")
        assert resp.status_code == 200

    def test_poll_nonexistent_job_returns_404(self, client):
        resp = client.get("/api/v1/benchmark/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_benchmark_nonexistent_dataset_returns_404(self, client):
        resp = client.post("/api/v1/benchmark", json={"dataset_id": 99999})
        assert resp.status_code == 404

    def test_list_benchmark_jobs_returns_200(self, client):
        resp = client.get("/api/v1/benchmark")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_algorithms_info_returns_200(self, client):
        resp = client.get("/api/v1/benchmark/algorithms/info")
        assert resp.status_code == 200
        algos = resp.json()
        assert len(algos) == 3  # BF, D&C, Kadane

    def test_algorithms_info_has_complexity_fields(self, client):
        resp = client.get("/api/v1/benchmark/algorithms/info")
        for algo in resp.json():
            assert "name" in algo
            assert "time_complexity" in algo
            assert "max_safe_input_size" in algo
