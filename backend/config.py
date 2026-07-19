"""
Application Configuration.

All configurable values are centralized here via Pydantic Settings.
Values can be overridden via environment variables or a .env file.

Usage:
    from config import settings
    print(settings.app_name)
    print(settings.max_brute_force_size)
"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Application Metadata ──────────────────────────────────────────────────
    app_name: str = "Historic Stock Market Peak Analyzer"
    app_version: str = "1.0.0"
    api_prefix: str = "/api/v1"

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "sqlite:///./stock_analyzer.db"

    # ── Algorithm Safety Limits (number of price points = N) ─────────────────
    # Enforced before any benchmark to protect mid-range hardware (16GB RAM).
    max_brute_force_size: int = 20_000
    max_divide_conquer_size: int = 100_000
    max_kadane_size: int = 1_000_000

    # ── Benchmarking ──────────────────────────────────────────────────────────
    benchmark_iterations: int = 10

    # ── Smart Downsampling (LTTB — Phase 2) ───────────────────────────────────
    downsample_threshold: int = 10_000   # Trigger downsampling above this
    downsample_target: int = 5_000       # Target point count after downsampling

    # ── File Storage ──────────────────────────────────────────────────────────
    data_dir: Path = Path("./data")

    # ── CORS ─────────────────────────────────────────────────────────────────
    cors_origins: list[str] = [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Fallback
    ]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


# ── Singleton ──────────────────────────────────────────────────────────────────
settings = Settings()

# Ensure data directory exists at import time
settings.data_dir.mkdir(parents=True, exist_ok=True)
