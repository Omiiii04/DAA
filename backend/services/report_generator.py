"""
PDF Report Generator — Phase 5.

Generates a professional, academic-grade PDF report for a given dataset
using ReportLab's Platypus high-level layout engine.

Report Sections:
    1. Cover Page        — Title, dataset metadata, generation timestamp
    2. Price Series Chart — LTTB-downsampled line chart (skipped if no .npy file)
    3. Algorithm Results  — Max profit table with buy/sell analysis
    4. Benchmark Statistics — Timing/memory statistics + speedup matrix
    5. Complexity Analysis — Fitness scores, growth ratios, log-log curve chart
    6. Academic Conclusions — Algorithm ranking, complexity classification

Design:
    - Light professional theme (print-safe)
    - Algorithm color coding: BF=red, D&C=amber, Kadane=green
    - ReportLab Platypus with Tables, Paragraphs, and Drawing charts
"""

from __future__ import annotations

import io
import math
import os
import statistics
from datetime import datetime
from typing import Optional

import numpy as np

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, HRFlowable, PageBreak,
    PageTemplate, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    KeepTogether,
)
from reportlab.graphics.shapes import (
    Drawing, Rect, String, Line, PolyLine, Group, Circle
)
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.lineplots import LinePlot

from database.models import AnalysisRun, BenchmarkResult, Dataset
from services.experimental_analysis import experimental_analyzer

# ══════════════════════════════════════════════════════════════════════════════
# Color palette (light/print-safe theme)
# ══════════════════════════════════════════════════════════════════════════════

_C_PRIMARY   = colors.HexColor("#6366f1")   # Indigo
_C_DARK      = colors.HexColor("#0f172a")   # Slate-900
_C_SURFACE   = colors.HexColor("#1e293b")   # Slate-800
_C_MUTED     = colors.HexColor("#64748b")   # Slate-500
_C_TEXT      = colors.HexColor("#1e293b")
_C_BORDER    = colors.HexColor("#e2e8f0")   # Slate-200
_C_LIGHT_BG  = colors.HexColor("#f8fafc")   # Slate-50
_C_SUCCESS   = colors.HexColor("#059669")   # Emerald-600 (Kadane)
_C_WARNING   = colors.HexColor("#d97706")   # Amber-600   (D&C)
_C_DANGER    = colors.HexColor("#dc2626")   # Red-600     (BF)
_C_WHITE     = colors.white

_ALGO_COLORS = {
    "Brute Force":          _C_DANGER,
    "Divide & Conquer":     _C_WARNING,
    "Kadane's Algorithm":   _C_SUCCESS,
}

_COMPLEXITY_LABELS = {
    "Brute Force":          "O(N²)",
    "Divide & Conquer":     "O(N log N)",
    "Kadane's Algorithm":   "O(N)",
}

_SPACE_COMPLEXITY = {
    "Brute Force":          "O(1)",
    "Divide & Conquer":     "O(log N)",
    "Kadane's Algorithm":   "O(1)",
}

PAGE_W, PAGE_H = A4
MARGIN        = 2.2 * cm
CONTENT_W     = PAGE_W - 2 * MARGIN


# ══════════════════════════════════════════════════════════════════════════════
# Style helpers
# ══════════════════════════════════════════════════════════════════════════════

def _styles():
    """Return a dict of ParagraphStyles for the report."""
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "RTitle", fontSize=26, fontName="Helvetica-Bold",
            textColor=_C_DARK, alignment=TA_CENTER, leading=32, spaceAfter=8,
        ),
        "subtitle": ParagraphStyle(
            "RSubtitle", fontSize=13, fontName="Helvetica",
            textColor=_C_MUTED, alignment=TA_CENTER, leading=18, spaceAfter=16,
        ),
        "section": ParagraphStyle(
            "RSection", fontSize=13, fontName="Helvetica-Bold",
            textColor=_C_PRIMARY, leading=18, spaceBefore=18, spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "RBody", fontSize=9.5, fontName="Helvetica",
            textColor=_C_TEXT, leading=15, alignment=TA_JUSTIFY, spaceAfter=6,
        ),
        "mono": ParagraphStyle(
            "RMono", fontSize=9, fontName="Courier",
            textColor=_C_SURFACE, leading=13, spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "RSmall", fontSize=8, fontName="Helvetica",
            textColor=_C_MUTED, leading=12, spaceAfter=4,
        ),
        "center": ParagraphStyle(
            "RCenter", fontSize=9.5, fontName="Helvetica",
            textColor=_C_TEXT, alignment=TA_CENTER, leading=14,
        ),
        "label": ParagraphStyle(
            "RLabel", fontSize=8, fontName="Helvetica-Bold",
            textColor=_C_MUTED, textTransform="uppercase", leading=12, spaceAfter=2,
        ),
    }


def _table_style(header_color=_C_DARK):
    """Return a base TableStyle for data tables."""
    return TableStyle([
        # Header
        ("BACKGROUND",    (0, 0), (-1, 0), header_color),
        ("TEXTCOLOR",     (0, 0), (-1, 0), _C_WHITE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 8.5),
        ("ROWBACKGROUND", (0, 1), (-1, -1), [_C_WHITE, _C_LIGHT_BG]),
        # All cells
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 8.5),
        ("TEXTCOLOR",     (0, 1), (-1, -1), _C_TEXT),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("GRID",          (0, 0), (-1, -1), 0.4, _C_BORDER),
        ("ROUNDEDCORNERS",(0, 0), (-1, -1), [4, 4, 4, 4]),
    ])


# ══════════════════════════════════════════════════════════════════════════════
# LTTB Downsampling
# ══════════════════════════════════════════════════════════════════════════════

def _lttb(prices: np.ndarray, threshold: int = 400) -> np.ndarray:
    """Largest-Triangle-Three-Buckets downsampling for line charts."""
    n = len(prices)
    if n <= threshold:
        return prices
    result_indices = [0]
    bucket_size = (n - 2) / (threshold - 2)
    for i in range(1, threshold - 1):
        avg_start = int(math.floor((i + 1) * bucket_size)) + 1
        avg_end   = int(math.floor((i + 2) * bucket_size)) + 1
        avg_end   = min(avg_end, n)
        avg_y     = float(np.mean(prices[avg_start:avg_end]))
        avg_x     = (avg_start + avg_end - 1) / 2.0
        r_start   = int(math.floor((i - 1) * bucket_size)) + 1
        r_end     = int(math.floor(i * bucket_size)) + 1
        prev_x, prev_y = result_indices[-1], float(prices[result_indices[-1]])
        best_area, best_idx = -1.0, r_start
        for j in range(r_start, r_end):
            area = abs(
                (prev_x - avg_x) * (float(prices[j]) - prev_y)
                - (prev_x - j) * (avg_y - prev_y)
            ) * 0.5
            if area > best_area:
                best_area, best_idx = area, j
        result_indices.append(best_idx)
    result_indices.append(n - 1)
    return prices[result_indices]


# ══════════════════════════════════════════════════════════════════════════════
# Drawing helpers
# ══════════════════════════════════════════════════════════════════════════════

def _price_chart(prices: np.ndarray, buy_idx: Optional[int] = None,
                 sell_idx: Optional[int] = None,
                 width: float = CONTENT_W, height: float = 160) -> Drawing:
    """Render a price series line chart with optional buy/sell markers."""
    pts = _lttb(prices, 400)
    n   = len(pts)
    if n < 2:
        return Drawing(width, height)

    pad_l, pad_r, pad_t, pad_b = 40, 12, 14, 30
    chart_w = width  - pad_l - pad_r
    chart_h = height - pad_t - pad_b

    p_min, p_max = float(pts.min()), float(pts.max())
    p_range      = p_max - p_min if p_max != p_min else 1.0

    def x_of(i):  return pad_l + i / (n - 1) * chart_w
    def y_of(v):  return pad_b + (v - p_min) / p_range * chart_h

    d = Drawing(width, height)

    # Background
    d.add(Rect(pad_l, pad_b, chart_w, chart_h,
               fillColor=_C_LIGHT_BG, strokeColor=_C_BORDER, strokeWidth=0.5))

    # Grid lines (5 horizontal)
    for tick in range(5):
        y = pad_b + tick / 4 * chart_h
        val = p_min + tick / 4 * p_range
        d.add(Line(pad_l, y, pad_l + chart_w, y,
                   strokeColor=_C_BORDER, strokeWidth=0.4))
        d.add(String(pad_l - 4, y - 3, f"${val:.0f}",
                     fontSize=6, fillColor=_C_MUTED, textAnchor="end"))

    # X-axis labels (5 evenly spaced)
    for tick in range(5):
        i   = int(tick / 4 * (n - 1))
        x   = x_of(i)
        idx = int(i / (n - 1) * (len(prices) - 1))
        d.add(String(x, pad_b - 10, f"{idx:,}",
                     fontSize=6, fillColor=_C_MUTED, textAnchor="middle"))
        d.add(Line(x, pad_b, x, pad_b - 3,
                   strokeColor=_C_MUTED, strokeWidth=0.4))

    # Price line
    points = [(x_of(i), y_of(float(pts[i]))) for i in range(n)]
    flat   = [c for pt in points for c in pt]
    if len(flat) >= 4:
        d.add(PolyLine(flat, strokeColor=_C_PRIMARY, strokeWidth=1.2,
                       strokeLineCap=1))

    # Buy marker (green)
    if buy_idx is not None:
        px = int(buy_idx / (len(prices) - 1) * (n - 1))
        bx = x_of(min(px, n - 1))
        by = y_of(float(pts[min(px, n - 1)]))
        d.add(Circle(bx, by, 4, fillColor=_C_SUCCESS, strokeColor=_C_WHITE, strokeWidth=1))
        d.add(String(bx, by + 6, "Buy", fontSize=6, fillColor=_C_SUCCESS, textAnchor="middle"))

    # Sell marker (red)
    if sell_idx is not None:
        px = int(sell_idx / (len(prices) - 1) * (n - 1))
        sx = x_of(min(px, n - 1))
        sy = y_of(float(pts[min(px, n - 1)]))
        d.add(Circle(sx, sy, 4, fillColor=_C_DANGER, strokeColor=_C_WHITE, strokeWidth=1))
        d.add(String(sx, sy + 6, "Sell", fontSize=6, fillColor=_C_DANGER, textAnchor="middle"))

    # Axis label
    d.add(String(pad_l + chart_w / 2, 4, "Index",
                 fontSize=6.5, fillColor=_C_MUTED, textAnchor="middle"))
    return d


def _timing_bar_chart(algo_times_ms: dict[str, float],
                      width: float = CONTENT_W, height: float = 160) -> Drawing:
    """Vertical bar chart for algorithm mean execution times (ms)."""
    algos = list(algo_times_ms.keys())
    times = [algo_times_ms[a] for a in algos]
    if not times:
        return Drawing(width, height)

    d  = Drawing(width, height)
    bc = VerticalBarChart()
    bc.x       = 55
    bc.y       = 30
    bc.width   = width - 85
    bc.height  = height - 50
    bc.data    = [times]
    bc.strokeColor = None
    bc.fillColor   = _C_LIGHT_BG

    # Bar colors
    for i, a in enumerate(algos):
        bc.bars[(0, i)].fillColor = _ALGO_COLORS.get(a, _C_PRIMARY)
        bc.bars[(0, i)].strokeColor = None

    # Category axis
    bc.categoryAxis.categoryNames = [a.replace(" & ", " &\n") for a in algos]
    bc.categoryAxis.labels.fontSize    = 7.5
    bc.categoryAxis.labels.textColor   = _C_TEXT
    bc.categoryAxis.strokeColor        = _C_BORDER
    bc.categoryAxis.labels.angle       = 0

    # Value axis
    bc.valueAxis.labels.fontSize       = 7.5
    bc.valueAxis.labels.textColor      = _C_MUTED
    bc.valueAxis.strokeColor           = _C_BORDER
    bc.valueAxis.gridStrokeColor       = _C_BORDER
    bc.valueAxis.gridStrokeWidth       = 0.4
    bc.valueAxis.visibleGrid           = True
    bc.valueAxis.labels.dx             = -4
    bc.valueAxis.rangeRound            = "both"
    bc.valueAxis.labelTextFormat       = "%.4f"

    d.add(bc)

    # Y-axis label
    d.add(String(12, height / 2, "Mean Time (ms)",
                 fontSize=7, fillColor=_C_MUTED, textAnchor="middle", angle=90))
    return d


def _complexity_chart(analyses: dict,
                      width: float = CONTENT_W, height: float = 200) -> Drawing:
    """Log-log complexity chart (observed + theoretical curves)."""
    if not analyses:
        return Drawing(width, height)

    pad_l, pad_r, pad_t, pad_b = 50, 14, 14, 40
    chart_w = width  - pad_l - pad_r
    chart_h = height - pad_t - pad_b

    # Collect all log10(sizes) for x-axis
    all_sizes, all_log_t, all_log_theo = [], [], []
    for a_data in analyses.values():
        for pt in a_data.get("points", []):
            s = pt["dataset_size"]
            if s > 0 and pt["normalized_observed"] > 0 and pt["theoretical_value"] > 0:
                all_sizes.append(math.log10(s))
                all_log_t.append(math.log10(pt["normalized_observed"]))
                all_log_theo.append(math.log10(pt["theoretical_value"]))

    if not all_sizes:
        return Drawing(width, height)

    x_min = min(all_sizes);  x_max = max(all_sizes)
    y_min = min(all_log_t + all_log_theo) - 0.1
    y_max = max(all_log_t + all_log_theo) + 0.2
    x_rng = x_max - x_min if x_max != x_min else 1.0
    y_rng = y_max - y_min if y_max != y_min else 1.0

    def px(lx): return pad_l + (lx - x_min) / x_rng * chart_w
    def py(ly): return pad_b + (ly - y_min) / y_rng * chart_h

    d = Drawing(width, height)

    # Background
    d.add(Rect(pad_l, pad_b, chart_w, chart_h,
               fillColor=_C_LIGHT_BG, strokeColor=_C_BORDER, strokeWidth=0.5))

    # Horizontal grid
    for i in range(5):
        y = pad_b + i / 4 * chart_h
        d.add(Line(pad_l, y, pad_l + chart_w, y,
                   strokeColor=_C_BORDER, strokeWidth=0.4))

    # Curves per algorithm
    for algo_name, a_data in analyses.items():
        pts = a_data.get("points", [])
        if len(pts) < 2:
            continue
        color = _ALGO_COLORS.get(algo_name, _C_PRIMARY)

        obs_xy  = [(px(math.log10(p["dataset_size"])), py(math.log10(max(p["normalized_observed"], 1e-12))))
                   for p in pts if p["normalized_observed"] > 0 and p["dataset_size"] > 0]
        theo_xy = [(px(math.log10(p["dataset_size"])), py(math.log10(max(p["theoretical_value"], 1e-12))))
                   for p in pts if p["theoretical_value"] > 0 and p["dataset_size"] > 0]

        if len(obs_xy) >= 2:
            flat = [c for pt in obs_xy for c in pt]
            d.add(PolyLine(flat, strokeColor=color, strokeWidth=1.5, strokeLineCap=1))
            # Circle markers
            for cx, cy in obs_xy:
                d.add(Circle(cx, cy, 2.5, fillColor=color, strokeColor=_C_WHITE, strokeWidth=0.5))

        if len(theo_xy) >= 2:
            flat = [c for pt in theo_xy for c in pt]
            d.add(PolyLine(flat, strokeColor=color, strokeWidth=0.8,
                           strokeDashArray=[3, 2], strokeLineCap=1))

    # X-axis labels (size values)
    all_algo_sizes = sorted(set(
        p["dataset_size"]
        for a in analyses.values()
        for p in a.get("points", [])
        if p["dataset_size"] > 0
    ))
    for sz in all_algo_sizes:
        lx = math.log10(sz)
        x = px(lx)
        label = f"{sz // 1000}K" if sz >= 1000 else str(sz)
        d.add(String(x, pad_b - 10, label, fontSize=6.5, fillColor=_C_MUTED, textAnchor="middle"))
        d.add(Line(x, pad_b, x, pad_b - 3, strokeColor=_C_MUTED, strokeWidth=0.4))

    # Axis labels
    d.add(String(pad_l + chart_w / 2, 4, "Dataset Size N (log scale)",
                 fontSize=7, fillColor=_C_MUTED, textAnchor="middle"))
    d.add(String(10, pad_b + chart_h / 2, "Normalized Time (log scale)",
                 fontSize=7, fillColor=_C_MUTED, textAnchor="middle", angle=90))

    return d


# ══════════════════════════════════════════════════════════════════════════════
# Page templates
# ══════════════════════════════════════════════════════════════════════════════

def _on_page(canvas, doc):
    """Draw header rule + page number on every non-cover page."""
    canvas.saveState()
    canvas.setStrokeColor(_C_BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, PAGE_H - 1.3 * cm, PAGE_W - MARGIN, PAGE_H - 1.3 * cm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(_C_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 1.1 * cm, "Historic Stock Market Peak Analyzer")
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 1.1 * cm,
                           f"Page {doc.page}")
    canvas.line(MARGIN, 1.1 * cm, PAGE_W - MARGIN, 1.1 * cm)
    canvas.drawCentredString(PAGE_W / 2, 0.7 * cm,
                             f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    canvas.restoreState()


def _on_cover(canvas, doc):
    """Draw the cover page header block."""
    canvas.saveState()
    # Full-width gradient header bar
    canvas.setFillColor(_C_DARK)
    canvas.rect(0, PAGE_H - 7.5 * cm, PAGE_W, 7.5 * cm, fill=1, stroke=0)
    # Accent strip
    canvas.setFillColor(_C_PRIMARY)
    canvas.rect(0, PAGE_H - 7.5 * cm, PAGE_W, 4, fill=1, stroke=0)
    canvas.restoreState()


# ══════════════════════════════════════════════════════════════════════════════
# Report Generator
# ══════════════════════════════════════════════════════════════════════════════

class ReportGenerator:
    """
    Generates a multi-section PDF report for a benchmarked dataset.

    Usage:
        pdf_bytes = ReportGenerator().generate(dataset_id=5, db=db)
    """

    def generate(self, dataset_id: int, db) -> bytes:
        """
        Main entry point — returns PDF as bytes.

        Raises:
            ValueError: If the dataset does not exist in the DB.
        """
        # ── Fetch data ────────────────────────────────────────────────────────
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if dataset is None:
            raise ValueError(f"Dataset #{dataset_id} not found.")

        analysis_runs = (
            db.query(AnalysisRun)
            .filter(AnalysisRun.dataset_id == dataset_id)
            .order_by(AnalysisRun.algorithm_name)
            .all()
        )

        benchmark_results = (
            db.query(BenchmarkResult)
            .filter(BenchmarkResult.dataset_id == dataset_id)
            .order_by(BenchmarkResult.algorithm_name)
            .all()
        )

        # ── Load prices (if .npy file exists) ────────────────────────────────
        prices: Optional[np.ndarray] = None
        if dataset.file_path and os.path.isfile(dataset.file_path):
            try:
                prices = np.load(dataset.file_path)
            except Exception:
                prices = None

        # ── Complexity analysis from benchmarks ────────────────────────────────
        complexity_analyses = self._compute_complexity(benchmark_results)

        # ── Build PDF ─────────────────────────────────────────────────────────
        buf = io.BytesIO()
        doc = BaseDocTemplate(
            buf,
            pagesize=A4,
            leftMargin=MARGIN, rightMargin=MARGIN,
            topMargin=MARGIN,  bottomMargin=MARGIN + 0.6 * cm,
            title=f"Peak Analyzer Report — {dataset.name}",
            author="Historic Stock Market Peak Analyzer",
        )

        # Two page templates: cover (no header) and body (with header/footer)
        cover_frame = Frame(0, 0, PAGE_W, PAGE_H, id="cover")
        body_frame  = Frame(MARGIN, MARGIN + 0.8 * cm,
                            CONTENT_W, PAGE_H - MARGIN - 2.8 * cm,
                            id="body")
        doc.addPageTemplates([
            PageTemplate(id="cover", frames=[cover_frame], onPage=_on_cover),
            PageTemplate(id="body",  frames=[body_frame],  onPage=_on_page),
        ])

        S = _styles()
        story: list = []

        # ── Section 1: Cover ──────────────────────────────────────────────────
        self._build_cover(story, dataset, S)
        story.append(PageBreak())

        # ── Section 2: Price Series Chart ─────────────────────────────────────
        if prices is not None and len(prices) >= 2:
            self._build_price_section(story, prices, analysis_runs, S)

        # ── Section 3: Algorithm Results ──────────────────────────────────────
        if analysis_runs:
            self._build_analysis_section(story, analysis_runs, dataset, S)

        # ── Section 4: Benchmark Statistics ───────────────────────────────────
        if benchmark_results:
            self._build_benchmark_section(story, benchmark_results, S)

        # ── Section 5: Complexity Analysis ────────────────────────────────────
        if complexity_analyses:
            self._build_complexity_section(story, complexity_analyses, S)

        # ── Section 6: Academic Conclusions ───────────────────────────────────
        self._build_conclusions(story, dataset, analysis_runs, benchmark_results,
                                complexity_analyses, S)

        # ── Build ─────────────────────────────────────────────────────────────
        doc.build(story)
        return buf.getvalue()

    # ── Cover ─────────────────────────────────────────────────────────────────

    def _build_cover(self, story: list, dataset: Dataset, S: dict) -> None:
        story.append(Spacer(1, 6.5 * cm))  # Below the dark header bar

        # Title block (on white)
        story.append(Paragraph(
            '<font color="#6366f1">Historic Stock Market</font><br/>Peak Analyzer',
            ParagraphStyle("CTit", fontSize=28, fontName="Helvetica-Bold",
                           textColor=_C_DARK, alignment=TA_CENTER, leading=34, spaceAfter=6),
        ))
        story.append(Paragraph(
            "Algorithm Performance Analysis Report",
            ParagraphStyle("CSub", fontSize=13, fontName="Helvetica",
                           textColor=_C_MUTED, alignment=TA_CENTER, leading=18, spaceAfter=24),
        ))

        story.append(HRFlowable(width="70%", color=_C_BORDER, spaceAfter=24))

        # Dataset info table
        rows = [
            ["Dataset", dataset.name],
            ["Dataset ID", f"#{dataset.id}"],
            ["Size (N)", f"{dataset.size:,} price points"],
            ["Distribution", dataset.distribution_type or "N/A"],
            ["Source", dataset.source or "N/A"],
            ["Price Range", f"${dataset.min_price:.2f} – ${dataset.max_price:.2f}"
             if dataset.min_price is not None else "N/A"],
            ["SHA-256 (12)", dataset.sha256_hash[:12] + "…" if dataset.sha256_hash else "N/A"],
            ["Report Generated", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
        ]
        tbl = Table(rows, colWidths=[5 * cm, CONTENT_W - 5 * cm - 2 * MARGIN])
        tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (0, -1), _C_LIGHT_BG),
            ("BACKGROUND",    (1, 0), (1, -1), _C_WHITE),
            ("FONTNAME",      (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME",      (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE",      (0, 0), (-1, -1), 9.5),
            ("TEXTCOLOR",     (0, 0), (0, -1), _C_SURFACE),
            ("TEXTCOLOR",     (1, 0), (1, -1), _C_TEXT),
            ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("GRID",          (0, 0), (-1, -1), 0.4, _C_BORDER),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ]))
        story.append(tbl)

        story.append(Spacer(1, 1.5 * cm))
        story.append(Paragraph(
            "This report was auto-generated by the Historic Stock Market Peak Analyzer, "
            "an academic project demonstrating the Design and Analysis of Algorithms "
            "(DAA) through empirical benchmarking of the Maximum Subarray Problem.",
            ParagraphStyle("CBody", fontSize=9, fontName="Helvetica",
                           textColor=_C_MUTED, alignment=TA_CENTER, leading=14),
        ))

    # ── Price Series ─────────────────────────────────────────────────────────

    def _build_price_section(self, story: list, prices: np.ndarray,
                             analysis_runs: list, S: dict) -> None:
        story.append(Paragraph("1. Price Series", S["section"]))
        # Get best buy/sell from Kadane (most reliable)
        buy_idx = sell_idx = None
        for run in analysis_runs:
            if run.algorithm_name == "Kadane's Algorithm":
                buy_idx, sell_idx = run.buy_index, run.sell_index
                break
        if buy_idx is None and analysis_runs:
            buy_idx = analysis_runs[0].buy_index
            sell_idx = analysis_runs[0].sell_index

        chart = _price_chart(prices, buy_idx, sell_idx, width=CONTENT_W, height=160)
        story.append(chart)
        story.append(Paragraph(
            f"<i>Figure 1: Stock price series ({len(prices):,} data points, LTTB-downsampled for display). "
            f"Green circle = optimal buy point; Red circle = optimal sell point.</i>",
            S["small"],
        ))
        story.append(Spacer(1, 8))

    # ── Algorithm Results ─────────────────────────────────────────────────────

    def _build_analysis_section(self, story: list, runs: list,
                                dataset: Dataset, S: dict) -> None:
        story.append(Paragraph("2. Algorithm Results", S["section"]))
        story.append(Paragraph(
            "The table below shows the maximum achievable profit found by each algorithm. "
            "All three algorithms should agree on the <b>max profit</b> value — any disagreement "
            "indicates a correctness bug.",
            S["body"],
        ))

        # Sort by fixed order
        order = {"Brute Force": 0, "Divide & Conquer": 1, "Kadane's Algorithm": 2}
        runs_sorted = sorted(runs, key=lambda r: order.get(r.algorithm_name, 99))

        headers = ["Algorithm", "Complexity", "Max Profit ($)", "Buy Index",
                   "Buy Price ($)", "Sell Index", "Sell Price ($)", "Hold (days)"]
        rows = [headers]
        bf_profit = None
        for run in runs_sorted:
            hold = (run.sell_index - run.buy_index) if run.sell_index and run.buy_index else 0
            rows.append([
                run.algorithm_name,
                _COMPLEXITY_LABELS.get(run.algorithm_name, "—"),
                f"{run.max_profit:.4f}",
                f"{run.buy_index:,}",
                f"{run.buy_price:.2f}" if run.buy_price else "—",
                f"{run.sell_index:,}",
                f"{run.sell_price:.2f}" if run.sell_price else "—",
                f"{hold:,}",
            ])
            if run.algorithm_name == "Brute Force":
                bf_profit = run.max_profit

        col_widths = [3.6*cm, 2.8*cm, 2.4*cm, 1.8*cm, 2.2*cm, 1.8*cm, 2.2*cm, 1.8*cm]
        tbl = Table(rows, colWidths=col_widths, repeatRows=1)
        ts  = _table_style()
        # Color-code the algorithm name column
        for i, run in enumerate(runs_sorted, start=1):
            clr = _ALGO_COLORS.get(run.algorithm_name, _C_TEXT)
            ts.add("TEXTCOLOR", (0, i), (0, i), clr)
            ts.add("FONTNAME",  (0, i), (0, i), "Helvetica-Bold")
            # Highlight profit column
            ts.add("TEXTCOLOR", (2, i), (2, i), _C_PRIMARY)
            ts.add("FONTNAME",  (2, i), (2, i), "Helvetica-Bold")
        tbl.setStyle(ts)
        story.append(tbl)

        # D&C sub-problem sums
        dc_runs = [r for r in runs if r.algorithm_name == "Divide & Conquer"
                   and r.left_sum is not None]
        if dc_runs:
            r = dc_runs[0]
            story.append(Spacer(1, 8))
            sub_rows = [
                ["D&C Sub-problem", "Value"],
                ["Left Subarray Sum",   f"{r.left_sum:.6f}"  if r.left_sum  else "—"],
                ["Crossing Sum",        f"{r.cross_sum:.6f}" if r.cross_sum else "—"],
                ["Right Subarray Sum",  f"{r.right_sum:.6f}" if r.right_sum else "—"],
            ]
            sub_tbl = Table(sub_rows, colWidths=[6*cm, 4*cm])
            sub_tbl.setStyle(_table_style(header_color=_C_WARNING))
            story.append(sub_tbl)
            story.append(Paragraph(
                "<i>Divide &amp; Conquer recursively identifies the optimal crossing subarray. "
                "The maximum of left, crossing, and right sums is the final answer.</i>",
                S["small"],
            ))

    # ── Benchmark Statistics ──────────────────────────────────────────────────

    def _build_benchmark_section(self, story: list, results: list, S: dict) -> None:
        story.append(Paragraph("3. Benchmark Statistics", S["section"]))
        story.append(Paragraph(
            f"Each algorithm was benchmarked for <b>10 iterations</b> using "
            "<b>time.perf_counter()</b> (µs precision) with strict gc.collect() "
            "between each iteration to eliminate memory fragmentation artifacts.",
            S["body"],
        ))

        order = {"Brute Force": 0, "Divide & Conquer": 1, "Kadane's Algorithm": 2}
        res_sorted = sorted(results, key=lambda r: order.get(r.algorithm_name, 99))

        # Find BF mean for speedup
        bf_mean = next((r.mean_time for r in res_sorted if r.algorithm_name == "Brute Force"), None)

        headers = ["Algorithm", "N", "Iters", "Mean (ms)", "Median (ms)",
                   "Min (ms)", "Max (ms)", "Std (ms)", "Speedup vs BF"]
        rows = [headers]
        ms = lambda t: f"{t*1000:.4f}" if t is not None else "—"
        for r in res_sorted:
            speedup = f"{bf_mean / r.mean_time:.1f}×" if bf_mean and r.mean_time and r.algorithm_name != "Brute Force" else "baseline"
            rows.append([
                r.algorithm_name,
                f"{r.dataset_size:,}",
                str(r.iterations),
                ms(r.mean_time),
                ms(r.median_time),
                ms(r.min_time),
                ms(r.max_time),
                ms(r.std_time),
                speedup,
            ])

        col_ws = [3.4*cm, 1.8*cm, 1.2*cm, 2*cm, 2*cm, 1.8*cm, 1.8*cm, 1.8*cm, 2*cm]
        tbl = Table(rows, colWidths=col_ws, repeatRows=1)
        ts  = _table_style()
        for i, r in enumerate(res_sorted, start=1):
            ts.add("TEXTCOLOR", (0, i), (0, i), _ALGO_COLORS.get(r.algorithm_name, _C_TEXT))
            ts.add("FONTNAME",  (0, i), (0, i), "Helvetica-Bold")
            if r.algorithm_name != "Brute Force" and bf_mean and r.mean_time:
                ts.add("TEXTCOLOR", (8, i), (8, i), _C_SUCCESS)
                ts.add("FONTNAME",  (8, i), (8, i), "Helvetica-Bold")
        tbl.setStyle(ts)
        story.append(tbl)

        # Timing bar chart
        story.append(Spacer(1, 12))
        algo_ms = {r.algorithm_name: r.mean_time * 1000 for r in res_sorted if r.mean_time}
        if algo_ms:
            story.append(_timing_bar_chart(algo_ms, width=CONTENT_W, height=160))
            story.append(Paragraph(
                "<i>Figure 2: Mean execution time (ms) per algorithm. "
                "Lower is better. Note the logarithmic performance gap between "
                "O(N²) Brute Force and O(N) Kadane's Algorithm.</i>",
                S["small"],
            ))

    # ── Complexity Analysis ───────────────────────────────────────────────────

    def _build_complexity_section(self, story: list, analyses: dict, S: dict) -> None:
        story.append(Paragraph("4. Empirical Complexity Analysis", S["section"]))
        story.append(Paragraph(
            "The <b>Doubling Method</b> empirically validates Big-O classifications. "
            "When dataset size N doubles (N → 2N), the expected runtime ratio is: "
            "O(N) → 2.0×, O(N log N) → ~2.1×, O(N²) → 4.0×. "
            "The <b>Fitness Score</b> measures alignment using Normalized MAE of "
            "consecutive doubling ratios (1.0 = perfect, 0.0 = completely divergent).",
            S["body"],
        ))

        # Fitness table
        headers = ["Algorithm", "Complexity", "Fitness Score", "Observed R̄", "Theoretical R̄", "Classification"]
        rows = [headers]
        order = {"Brute Force": 0, "Divide & Conquer": 1, "Kadane's Algorithm": 2}
        for name, a in sorted(analyses.items(), key=lambda x: order.get(x[0], 99)):
            pct = round((a["fitness_score"] or 0) * 100, 1)
            clsf = "Excellent" if pct >= 90 else "Good" if pct >= 70 else "Investigate"
            rows.append([
                name,
                a["complexity"],
                f"{pct}%",
                f"{a['mean_growth_ratio']:.3f}×" if a.get("mean_growth_ratio") else "—",
                f"{a['theoretical_mean']:.3f}×"  if a.get("theoretical_mean")  else "—",
                clsf,
            ])
        tbl = Table(rows, colWidths=[3.8*cm, 2.6*cm, 2.4*cm, 2.2*cm, 2.4*cm, 2.4*cm], repeatRows=1)
        ts  = _table_style()
        for i, (name, a) in enumerate(sorted(analyses.items(), key=lambda x: order.get(x[0], 99)), start=1):
            ts.add("TEXTCOLOR", (0, i), (0, i), _ALGO_COLORS.get(name, _C_TEXT))
            ts.add("FONTNAME",  (0, i), (0, i), "Helvetica-Bold")
            pct = round((a["fitness_score"] or 0) * 100, 1)
            clr = _C_SUCCESS if pct >= 90 else (_C_WARNING if pct >= 70 else _C_DANGER)
            ts.add("TEXTCOLOR", (2, i), (2, i), clr)
            ts.add("FONTNAME",  (2, i), (2, i), "Helvetica-Bold")
        tbl.setStyle(ts)
        story.append(tbl)

        # Log-log chart
        story.append(Spacer(1, 12))
        chart = _complexity_chart(analyses, width=CONTENT_W, height=200)
        story.append(chart)
        story.append(Paragraph(
            "<i>Figure 3: Log-log complexity curves. Solid lines = observed empirical timings "
            "(normalized). Dashed lines = theoretical Big-O prediction. "
            "Perfect alignment (fitness ≈ 100%) indicates the algorithm follows its claimed complexity.</i>",
            S["small"],
        ))

        # Per-algorithm summaries
        story.append(Spacer(1, 8))
        for name, a in sorted(analyses.items(), key=lambda x: order.get(x[0], 99)):
            summary = a.get("summary", "")
            if summary:
                story.append(Paragraph(
                    f"<b><font color='#{self._hex(name)}'>■</font> {name}</b>: {summary}",
                    S["body"],
                ))

    # ── Academic Conclusions ──────────────────────────────────────────────────

    def _build_conclusions(self, story: list, dataset: Dataset,
                           analysis_runs: list, benchmark_results: list,
                           analyses: dict, S: dict) -> None:
        story.append(Paragraph("5. Academic Conclusions", S["section"]))

        # Determine winner
        wins = []
        if benchmark_results:
            order = {"Kadane's Algorithm": 0, "Divide & Conquer": 1, "Brute Force": 2}
            br = sorted(benchmark_results, key=lambda r: (r.mean_time or 99999))
            if br:
                wins.append(f"<b>{br[0].algorithm_name}</b> was the fastest on this dataset "
                           f"(mean: {br[0].mean_time*1000:.4f} ms)")

        if analysis_runs:
            max_p = max((r.max_profit for r in analysis_runs), default=None)
            if max_p:
                wins.append(f"the maximum achievable profit is <b>${max_p:.4f}</b>")

        if wins:
            story.append(Paragraph(
                "Based on the empirical benchmarks: " + "; ".join(wins) + ".",
                S["body"],
            ))

        story.append(Paragraph(
            "The three algorithms implement fundamentally different strategies for the "
            "<b>Maximum Subarray Problem (Kadane, 1984)</b>, which reduces to finding "
            "the contiguous subarray of daily price changes with maximum sum (CLRS §4.1):",
            S["body"],
        ))

        algo_desc = [
            ("Brute Force", "O(N²)", "O(1)",
             "Checks all N(N-1)/2 pairs — guaranteed correct but computationally intractable for N > 20,000. "
             "Useful as a correctness baseline against which faster algorithms are verified."),
            ("Divide & Conquer", "O(N log N)", "O(log N)",
             "Recursively splits the array in half and finds the maximum crossing subarray at each merge. "
             "T(n) = 2T(n/2) + O(n) solves to O(N log N) by Master Theorem Case 2. "
             "This is the classic CLRS textbook approach."),
            ("Kadane's Algorithm", "O(N)", "O(1)",
             "Single linear scan: dp[i] = max(changes[i], dp[i-1] + changes[i]). "
             "Achieves the information-theoretic lower bound — any algorithm must read all N inputs, "
             "so O(N) is optimal. No practical improvement is possible."),
        ]

        for algo_name, time_c, space_c, desc in algo_desc:
            clr = _ALGO_COLORS.get(algo_name, _C_TEXT)
            story.append(Paragraph(
                f"<b><font color='#{self._hex(algo_name)}'>▶</font> {algo_name}</b> "
                f"[Time: {time_c}, Space: {space_c}]: {desc}",
                ParagraphStyle("AlgoDesc", parent=S["body"], spaceAfter=8, leading=14),
            ))

        story.append(Spacer(1, 8))
        story.append(HRFlowable(width="100%", color=_C_BORDER, spaceAfter=8))
        story.append(Paragraph(
            "<b>Recommendation:</b> For production use, always prefer <b>Kadane's Algorithm</b>. "
            "Its O(N) time complexity scales linearly with dataset size — processing 1 million "
            "price points in ~2ms vs Brute Force's estimated ~4,000 seconds. "
            "Divide &amp; Conquer serves as an excellent pedagogical demonstration of the Master Theorem.",
            ParagraphStyle("Rec", parent=S["body"], backColor=colors.HexColor("#f0fdf4"),
                           borderPadding=10, borderRadius=4,
                           borderColor=_C_SUCCESS, borderWidth=0.5),
        ))

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _compute_complexity(benchmark_results: list) -> dict:
        """Compute ExperimentalAnalyzer analyses from benchmark_results."""
        by_algo: dict[str, dict[int, float]] = {}
        for r in benchmark_results:
            by_algo.setdefault(r.algorithm_name, {})[r.dataset_size] = r.mean_time

        analyses = {}
        for algo_name, size_time in by_algo.items():
            if len(size_time) < 2:
                continue
            complexity = _COMPLEXITY_LABELS.get(algo_name, "O(N)")
            sizes = sorted(size_time.keys())
            times = [size_time[s] for s in sizes]
            try:
                result = experimental_analyzer.analyze(
                    algorithm_name=algo_name,
                    complexity=complexity,
                    dataset_sizes=sizes,
                    observed_times=times,
                )
                analyses[algo_name] = {
                    "complexity":        complexity,
                    "fitness_score":     result.fitness_score,
                    "mean_growth_ratio": result.mean_growth_ratio,
                    "theoretical_mean":  result.theoretical_mean,
                    "summary":           result.summary,
                    "points": [
                        {
                            "dataset_size":        p.dataset_size,
                            "normalized_observed": p.normalized_observed,
                            "theoretical_value":   p.theoretical_value,
                        }
                        for p in result.points
                    ],
                }
            except Exception:
                pass
        return analyses

    @staticmethod
    def _hex(algo_name: str) -> str:
        mapping = {
            "Brute Force":          "dc2626",
            "Divide & Conquer":     "d97706",
            "Kadane's Algorithm":   "059669",
        }
        return mapping.get(algo_name, "6366f1")


# ── Module-level singleton ─────────────────────────────────────────────────────
report_generator = ReportGenerator()
