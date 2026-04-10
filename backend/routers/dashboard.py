"""
Dashboard router.

Endpoints
─────────
  GET /dashboard/summary   — Aggregated stats for the dashboard overview

Aggregation sources
───────────────────
  * Jobs        — in-memory JobStore (data/jobs.json)
  * Datasets    — filesystem: backend/datasets/<dataset_id>/
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from models.job import JobStatus
from services.job_manager import job_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

# Absolute path to the datasets directory (backend/datasets/)
_DATASETS_DIR = Path(__file__).parent.parent / "datasets"


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class JobStats(BaseModel):
    """Aggregated job counts broken down by status."""

    total: int
    queued: int
    running: int
    completed: int
    failed: int


class DatasetStats(BaseModel):
    """Aggregated dataset counts."""

    total: int


class RecentJob(BaseModel):
    """Slim job representation for the recent-jobs list."""

    job_id: str
    name: str
    status: str
    progress: int
    dataset_id: str
    model: str
    created_at: str  # ISO-8601 UTC string


class DashboardSummary(BaseModel):
    """Full response payload for GET /dashboard/summary."""

    jobs: JobStats
    datasets: DatasetStats
    recent_jobs: List[RecentJob]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _count_datasets() -> int:
    """Return the number of valid dataset directories under backend/datasets/.

    A valid dataset directory is any immediate child directory that contains
    a ``data.yaml`` file (indicating a successfully uploaded YOLO dataset).
    """
    if not _DATASETS_DIR.is_dir():
        return 0
    count = 0
    for entry in _DATASETS_DIR.iterdir():
        if entry.is_dir() and any(entry.rglob("data.yaml")):
            count += 1
    return count


def _aggregate_jobs() -> tuple[JobStats, List[RecentJob]]:
    """Compute job stats and the 5 most recent jobs from the live JobStore."""
    all_jobs = job_manager.list_jobs()  # already sorted newest first

    # Status counters
    counts = {s: 0 for s in JobStatus}
    for job in all_jobs:
        counts[job.status] += 1

    stats = JobStats(
        total=len(all_jobs),
        queued=counts[JobStatus.QUEUED],
        running=counts[JobStatus.RUNNING],
        completed=counts[JobStatus.COMPLETED],
        failed=counts[JobStatus.FAILED],
    )

    # Newest 5 jobs
    recent: List[RecentJob] = [
        RecentJob(
            job_id=job.job_id,
            name=job.name,
            status=job.status.value,
            progress=job.progress,
            dataset_id=job.dataset_id,
            model=job.model,
            created_at=job.created_at.isoformat(),
        )
        for job in all_jobs[:5]
    ]

    return stats, recent


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get(
    "/summary",
    response_model=DashboardSummary,
    summary="Aggregated dashboard summary",
    description=(
        "Returns job counts broken down by status, total dataset count, "
        "and the five most recent jobs ordered by creation time (newest first)."
    ),
)
def get_dashboard_summary() -> DashboardSummary:
    """Aggregate and return dashboard-level statistics in a single request."""
    job_stats, recent_jobs = _aggregate_jobs()
    dataset_stats = DatasetStats(total=_count_datasets())

    logger.debug(
        "Dashboard summary: jobs=%d datasets=%d recent=%d",
        job_stats.total,
        dataset_stats.total,
        len(recent_jobs),
    )

    return DashboardSummary(
        jobs=job_stats,
        datasets=dataset_stats,
        recent_jobs=recent_jobs,
    )
