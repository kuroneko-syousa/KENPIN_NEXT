"""
Dashboard router.

Endpoints
─────────
    GET /dashboard/summary   — Aggregated stats for the dashboard overview

Aggregation sources
───────────────────
    * Jobs        — in-memory JobStore (data/jobs.json)
    * Datasets    — filesystem:
                                    - backend/datasets/<dataset_id>/
                                    - tmp/workspaces/<workspace_id>/dataset/
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

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_WORKSPACE_DIR = _BACKEND_DIR.parent

# Dataset locations
_UPLOADED_DATASETS_DIR = _BACKEND_DIR / "datasets"
_WORKSPACE_DATASETS_ROOT = _WORKSPACE_DIR / "tmp" / "workspaces"


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


class ModelStats(BaseModel):
    """Aggregated trained model counts."""

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
    models: ModelStats
    recent_jobs: List[RecentJob]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _count_datasets() -> int:
    """Return the number of available datasets for dashboard summary.

    Count both uploaded datasets and workspace-generated datasets.
    """
    uploaded_count = 0
    if _UPLOADED_DATASETS_DIR.is_dir():
        for entry in _UPLOADED_DATASETS_DIR.iterdir():
            if entry.is_dir() and not entry.name.startswith((".", "_")):
                uploaded_count += 1

    workspace_count = 0
    if _WORKSPACE_DATASETS_ROOT.is_dir():
        for workspace_dir in _WORKSPACE_DATASETS_ROOT.iterdir():
            if not workspace_dir.is_dir():
                continue
            dataset_dir = workspace_dir / "dataset"
            if dataset_dir.is_dir():
                workspace_count += 1

    return uploaded_count + workspace_count


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


def _count_models() -> int:
    """Return trained model count.

    Keep this aligned with models page logic: completed jobs are treated as models.
    """
    all_jobs = job_manager.list_jobs()
    return sum(1 for job in all_jobs if job.status == JobStatus.COMPLETED)


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
    model_stats = ModelStats(total=_count_models())

    logger.debug(
        "Dashboard summary: jobs=%d datasets=%d models=%d recent=%d",
        job_stats.total,
        dataset_stats.total,
        model_stats.total,
        len(recent_jobs),
    )

    return DashboardSummary(
        jobs=job_stats,
        datasets=dataset_stats,
        models=model_stats,
        recent_jobs=recent_jobs,
    )
