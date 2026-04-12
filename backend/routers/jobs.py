"""
Jobs router — full CRUD for YOLO training jobs.

Endpoints
─────────
  POST   /jobs                    Create and immediately queue a new job
  GET    /jobs                    List all jobs (newest first)
  GET    /jobs/{job_id}           Get a single job (full detail)
  GET    /jobs/{job_id}/logs      Stream the raw train.log content
  POST   /jobs/{job_id}/cancel    Cancel a queued or running job
  POST   /jobs/{job_id}/stop      Gracefully stop a running job
  DELETE /jobs/{job_id}           Delete a job record (not the log files)

Job lifecycle managed by JobManager.submit_job():
  QUEUED → RUNNING → COMPLETED | FAILED
"""

from __future__ import annotations

import csv
import io
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field

from models.job import Job, JobCreate, JobStatus, JobSummary
from services.job_manager import job_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jobs", tags=["Jobs"])


# ---------------------------------------------------------------------------
# Results response model
# ---------------------------------------------------------------------------


class JobResults(BaseModel):
    """Response payload for GET /jobs/{job_id}/results."""

    job_id: str
    run_dir: Optional[str] = None
    weights: Optional[str] = None
    images: List[str] = Field(default_factory=list)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    metrics_history: List[Dict[str, Any]] = Field(default_factory=list)


class JobLockRequest(BaseModel):
    locked: bool = Field(..., description="True to lock, false to unlock")


class JobRenameRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=200, description="New display name")


class JobQueueStatus(BaseModel):
    job_id: str
    status: JobStatus
    queue_position: Optional[int] = None
    queued_ahead: int = 0
    queue_size: int = 0
    running_job_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Results helper functions
# ---------------------------------------------------------------------------

_BACKEND_DIR = Path(__file__).parent.parent
_WORKSPACE_DIR = _BACKEND_DIR.parent  # プロジェクトルート (KENPIN_NEXT/)
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}


def _find_run_dir(job: Job) -> Optional[Path]:
    """Return the YOLO run directory for this job, or None if not found.

    Resolution order:

    1. ``job.results_path`` recorded by the training worker on completion
       (absolute or relative). Two levels up from ``best.pt`` is the run dir.
    2. Search known base directories using ``job.name``:
       - backend/runs/train/{name}/
       - backend/runs/detect/runs/train/{name}/  (YOLO task-prefix variant)
       - KENPIN_NEXT/runs/train/{name}/
       - KENPIN_NEXT/runs/detect/runs/train/{name}/
    """
    def _ok(p: Path) -> Optional[Path]:
        return p if p.is_dir() else None

    # Strategy 1: results_path
    if job.results_path:
        rp = Path(job.results_path)
        if rp.is_absolute():
            if r := _ok(rp.parent.parent):
                return r
        else:
            # Resolve relative to backend dir and workspace root
            for base in (_BACKEND_DIR, _WORKSPACE_DIR):
                if r := _ok((base / rp).resolve().parent.parent):
                    return r

    # Strategy 2: infer from job.name
    if job.name:
        for base in (
            _BACKEND_DIR / "runs" / "train",
            _BACKEND_DIR / "runs" / "detect" / "runs" / "train",
            _WORKSPACE_DIR / "runs" / "train",
            _WORKSPACE_DIR / "runs" / "detect" / "runs" / "train",
        ):
            if r := _ok(base / job.name):
                return r

    return None


def _collect_images(run_dir: Path) -> List[str]:
    """Return absolute paths to all image files directly inside *run_dir*."""
    return [
        str(p)
        for p in sorted(run_dir.iterdir())
        if p.is_file() and p.suffix.lower() in _IMAGE_SUFFIXES
    ]


def _parse_results_csv(csv_path: Path) -> List[Dict[str, Any]]:
    """Parse YOLO ``results.csv`` into a list of per-epoch metric dicts.

    YOLO writes column headers and values padded with whitespace; every
    key and value is stripped here.  Numeric strings are coerced to
    ``int`` or ``float``.  Returns an empty list when the file does not
    exist or cannot be read.

    Typical YOLO columns (after stripping)::

        epoch, train/box_loss, train/cls_loss, train/dfl_loss,
        metrics/precision(B), metrics/recall(B),
        metrics/mAP50(B), metrics/mAP50-95(B),
        val/box_loss, val/cls_loss, val/dfl_loss,
        lr/pg0, lr/pg1, lr/pg2
    """
    if not csv_path.is_file():
        return []
    try:
        content = csv_path.read_text(encoding="utf-8")
    except OSError:
        return []

    rows: List[Dict[str, Any]] = []
    reader = csv.DictReader(io.StringIO(content))
    for raw_row in reader:
        row: Dict[str, Any] = {}
        for raw_key, raw_val in raw_row.items():
            key = raw_key.strip() if raw_key else ""
            val_str = raw_val.strip() if raw_val else ""
            if val_str:
                try:
                    val: Any = int(val_str)
                except ValueError:
                    try:
                        val = float(val_str)
                    except ValueError:
                        val = val_str
            else:
                val = None
            if key:
                row[key] = val
        if row:
            rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# POST /jobs  — create + queue a new job
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=Job,
    status_code=201,
    summary="Create and queue a new YOLO training job",
)
def create_job(req: JobCreate) -> Job:
    """
    Validates the request, creates a Job record (QUEUED), writes per-job
    files, and launches the training subprocess inside the specified venv.

    The response is returned immediately; poll **GET /jobs/{job_id}** for
    status updates.

    ### venv requirement

    The venv at `env_path` must already exist and contain `ultralytics`:

    ```bash
    python -m venv /envs/yolo_8.0.0
    /envs/yolo_8.0.0/bin/pip install ultralytics
    ```

    On Windows the binary is resolved as `<env_path>/Scripts/python.exe`.
    """
    # ----------------------------------------------------------------
    # Validate request: require either dataset_source_path or data_yaml
    # ----------------------------------------------------------------
    has_source = bool(req.dataset_source_path)
    has_yaml = bool(req.data_yaml)

    if not has_source and not has_yaml:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'dataset_source_path' (recommended) or 'data_yaml'.",
        )

    if has_source:
        source_path = Path(req.dataset_source_path)  # type: ignore[arg-type]
        if not source_path.is_absolute():
            raise HTTPException(
                status_code=400,
                detail=f"dataset_source_path must be an absolute path, got: {req.dataset_source_path}",
            )
        if not source_path.is_dir():
            raise HTTPException(
                status_code=400,
                detail=f"dataset_source_path directory not found: {req.dataset_source_path}",
            )
    else:
        # Legacy: validate data_yaml path
        data_yaml_path = Path(req.data_yaml)
        if not data_yaml_path.is_absolute():
            raise HTTPException(
                status_code=400,
                detail=f"data_yaml must be an absolute path, got: {req.data_yaml}",
            )
        if not data_yaml_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"data.yaml not found: {req.data_yaml}",
            )

    # Validate env_path is absolute
    if not Path(req.env_path).is_absolute():
        raise HTTPException(
            status_code=400,
            detail=f"env_path must be an absolute path, got: {req.env_path}",
        )

    # Validate device value
    device = req.device.lower().strip()
    if device not in ("auto", "cpu", "cuda"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid device '{device}'. Allowed: auto | cpu | cuda",
        )

    # Workspace path is now provided by frontend
    # If not provided, generate fallback path
    if not req.workspace_path:
        backend_dir = Path(__file__).parent.parent
        user_id = req.user_id or "default"
        workspace_id = req.workspace_id or "workspace"
        req.workspace_path = str(backend_dir / "workspaces" / user_id / workspace_id)

    try:
        job = job_manager.submit_job(req)
    except ValueError as e:
        # Duplicate job in same workspace
        raise HTTPException(
            status_code=409,
            detail=str(e),
        )
    logger.info("Job %s submitted", job.job_id)
    return job


# ---------------------------------------------------------------------------
# GET /jobs  — list all jobs
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=List[JobSummary],
    summary="List all jobs (newest first)",
)
def list_jobs(
    status: Optional[str] = Query(
        None,
        description="Filter by job status. Allowed values: queued | running | completed | failed | stopped",
        pattern="^(queued|running|completed|failed|stopped)$",
    ),
    limit: Optional[int] = Query(
        None,
        ge=1,
        le=1000,
        description="Maximum number of records to return.",
    ),
    offset: int = Query(
        0,
        ge=0,
        description="Number of records to skip (for pagination).",
    ),
) -> List[JobSummary]:
    """
    Returns summary records for all jobs sorted by **created_at descending**.

    ### Filtering

    - **status** — return only jobs in the given state
      (``queued`` | ``running`` | ``completed`` | ``failed`` | ``stopped``).

    ### Pagination

    - **limit** — cap the number of results (omit for all records).
    - **offset** — skip the first N matching records.
    """
    jobs = job_manager.list_jobs()  # already sorted created_at DESC

    # Status filter
    if status is not None:
        jobs = [j for j in jobs if j.status.value == status]

    # Pagination
    if offset:
        jobs = jobs[offset:]
    if limit is not None:
        jobs = jobs[:limit]

    return [
        JobSummary(
            job_id=j.job_id,
            workspace_id=j.workspace_id,
            requested_by=j.requested_by,
            user_id=j.user_id,
            dataset_id=j.dataset_id,
            display_name=j.display_name,
            model=j.model,
            yolo_version=j.yolo_version,
            status=j.status,
            progress=j.progress,
            created_at=j.created_at,
            logs_path=j.logs_path,
            results_path=j.results_path,
            error=j.error,
            locked=j.locked,
        )
        for j in jobs
    ]


@router.get(
    "/{job_id}/queue-status",
    response_model=JobQueueStatus,
    summary="Get queue status for a job",
)
def get_job_queue_status(job_id: str) -> JobQueueStatus:
    """Return waiting position for queued jobs so UI can show reservation state."""
    job = job_manager.get_job_model(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    queue_position = job_manager.get_queue_position(job_id)
    queue_size = job_manager.get_queue_size()

    return JobQueueStatus(
        job_id=job_id,
        status=job.status,
        queue_position=queue_position,
        queued_ahead=max((queue_position or 1) - 1, 0) if queue_position else 0,
        queue_size=queue_size,
        running_job_id=job_manager.get_running_job_id(),
    )


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}  — single job detail
# ---------------------------------------------------------------------------


@router.get(
    "/{job_id}",
    response_model=Job,
    summary="Get full detail of a single job",
)
def get_job(job_id: str) -> Job:
    """Returns the complete Job record including log_lines and hyperparameters."""
    job = job_manager.get_job_model(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return job


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/logs  — raw log content
# ---------------------------------------------------------------------------


@router.get(
    "/{job_id}/logs",
    response_class=PlainTextResponse,
    summary="Return the raw train.log content",
)
def get_job_logs(
    job_id: str,
    tail: Optional[int] = Query(
        None,
        ge=1,
        le=10000,
        description="If specified, return only the last N lines of the log.",
    ),
) -> str:
    """
    Returns the full stdout/stderr captured from the training subprocess.
    Pass **?tail=N** to receive only the last N lines (useful for polling).
    Returns an empty string if the log file does not exist yet.
    """
    job = job_manager.get_job_model(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    if not job.logs_path:
        return ""
    log_file = Path(job.logs_path)
    if not log_file.exists():
        return ""
    content = log_file.read_text(encoding="utf-8", errors="replace")
    if tail is not None:
        lines = content.splitlines()
        content = "\n".join(lines[-tail:])
    return content


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/results  — YOLO training output files + parsed metrics
# ---------------------------------------------------------------------------


@router.get(
    "/{job_id}/results",
    response_model=JobResults,
    summary="Get YOLO training results for a job",
)
def get_job_results(job_id: str) -> JobResults:
    """
    Returns the training output artefacts produced by Ultralytics YOLO:

    - **weights** — absolute path to ``runs/train/{name}/weights/best.pt``
      (``null`` when the file does not yet exist).
    - **images** — absolute paths to every ``.png``/``.jpg`` file found
      directly inside the run directory (``results.png``,
      ``confusion_matrix.png``, etc.).
    - **metrics** — the last-epoch row from ``results.csv`` as a flat dict
      (empty dict when the file does not exist).
    - **metrics_history** — all epoch rows from ``results.csv`` (useful for
      plotting training curves).
    - **run_dir** — absolute path to the resolved YOLO run directory
      (``null`` when the directory has not been created yet).

    The run directory is resolved in two steps:

    1. ``job.results_path`` written by the worker on completion
       (``…/runs/train/{name}/weights/best.pt`` → two levels up).
    2. Inferred as ``backend/runs/train/{job.name}/``.

    A 200 response with empty fields is returned while the job is still
    running or has not been started yet.
    """
    job = job_manager.get_job_model(job_id)
    if job is None:
        # Fallback 1: check the legacy in-memory dict (populated by /train route)
        legacy = job_manager.get_job(job_id)
        if legacy is not None:
            legacy_result = legacy.get("result") if isinstance(legacy, dict) else None
            name = "train"
            results_path_str: Optional[str] = None
            if isinstance(legacy_result, dict):
                name = str(legacy_result.get("name", name))
                results_path_str = legacy_result.get("best_weights")
            job = Job(dataset_id="", env_path="", name=name, results_path=results_path_str)
        else:
            # Fallback 2: after backend restart the job record is lost.
            # Try to find a run directory using the name "train"
            # (all workspace-studio training uses this fixed name).
            sentinel = Job(dataset_id="", env_path="", name="train")
            if _find_run_dir(sentinel) is None:
                raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
            job = sentinel
            logger.warning(
                "Job %s not found in store; serving results from latest 'train' run dir",
                job_id,
            )

    run_dir = _find_run_dir(job)
    if run_dir is None:
        # Job exists but results directory not yet created (training in progress
        # or job never started).
        return JobResults(job_id=job_id)

    # Weights -------------------------------------------------------------------
    weights_path = run_dir / "weights" / "best.pt"
    weights: Optional[str] = str(weights_path) if weights_path.is_file() else None

    # Images --------------------------------------------------------------------
    images = _collect_images(run_dir)

    # CSV metrics ----------------------------------------------------------------
    history = _parse_results_csv(run_dir / "results.csv")
    metrics: Dict[str, Any] = history[-1] if history else {}

    logger.debug(
        "Job %s results: run_dir=%s weights=%s images=%d epochs=%d",
        job_id, run_dir, weights, len(images), len(history),
    )

    return JobResults(
        job_id=job_id,
        run_dir=str(run_dir),
        weights=weights,
        images=images,
        metrics=metrics,
        metrics_history=history,
    )


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/images/{filename}  — serve a result image file
# ---------------------------------------------------------------------------

_ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}


@router.get(
    "/{job_id}/images/{filename}",
    summary="Serve a training result image file",
    response_class=FileResponse,
)
def get_job_image(job_id: str, filename: str) -> FileResponse:
    """
    Serves a single image file from the YOLO run directory.

    ``filename`` must be a plain file name (e.g. ``results.png``).
    Sub-directory traversal attempts (``..``, ``/``, ``\\``) are rejected
    with 400.

    Returns 404 when the job or image does not exist.
    """
    # Security: reject any attempt at path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename: path separators are not allowed",
        )
    suffix = Path(filename).suffix.lower()
    if suffix not in _ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported extension '{suffix}'. Allowed: {_ALLOWED_IMAGE_EXTENSIONS}",
        )

    job = job_manager.get_job_model(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    run_dir = _find_run_dir(job)
    if run_dir is None:
        raise HTTPException(
            status_code=404,
            detail=f"Run directory for job '{job_id}' not found",
        )

    image_path = (run_dir / filename).resolve()

    # Confirm the resolved path is still inside run_dir (defense-in-depth)
    if not image_path.is_relative_to(run_dir.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not image_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Image '{filename}' not found in job results",
        )

    media_type = "image/png" if suffix == ".png" else "image/jpeg"
    return FileResponse(path=str(image_path), media_type=media_type)


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/weights  — download best.pt
# ---------------------------------------------------------------------------


@router.get(
    "/{job_id}/weights",
    summary="Download best.pt for a completed job",
    response_class=FileResponse,
)
def get_job_weights(job_id: str) -> FileResponse:
    """
    Streams the ``weights/best.pt`` artefact produced by YOLO training.

    Returns 404 when the job does not exist, the run directory has not been
    created yet, or ``best.pt`` has not been written (training in progress).
    """
    job = job_manager.get_job_model(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    run_dir = _find_run_dir(job)
    if run_dir is None:
        raise HTTPException(
            status_code=404,
            detail=f"Run directory for job '{job_id}' not found",
        )

    weights_path = (run_dir / "weights" / "best.pt").resolve()

    # Confirm the resolved path stays inside run_dir (defense-in-depth)
    if not weights_path.is_relative_to(run_dir.resolve()):
        raise HTTPException(status_code=400, detail="Invalid weights path")

    if not weights_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"best.pt not found for job '{job_id}' (training may still be in progress)",
        )

    return FileResponse(
        path=str(weights_path),
        media_type="application/octet-stream",
        filename="best.pt",
    )


# ---------------------------------------------------------------------------
# POST /jobs/{job_id}/cancel  — cancel a queued or running job
# ---------------------------------------------------------------------------


@router.post(
    "/{job_id}/cancel",
    response_model=Job,
    summary="Cancel a queued or running job",
)
def cancel_job(job_id: str) -> Job:
    """
    Marks the job as FAILED with error='Cancelled by user'.

    Note: the underlying OS subprocess is **not** forcefully killed by this
    endpoint.  If you need hard kill, terminate the process externally and
    the monitor thread will record the non-zero exit code automatically.
    """
    job = job_manager.cancel_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    full_job = job_manager.get_job_model(job_id)
    if full_job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return full_job


@router.post(
    "/{job_id}/stop",
    response_model=Job,
    summary="Gracefully stop a running job",
)
def stop_job(job_id: str) -> Job:
    """
    Requests graceful stop by setting a stop flag read by train_worker.py
    at epoch boundaries. Job status transitions to ``stopped`` when worker
    exits through the stop path.
    """
    job = job_manager.stop_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    full_job = job_manager.get_job_model(job_id)
    if full_job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return full_job


@router.post(
    "/{job_id}/lock",
    response_model=Job,
    summary="Lock or unlock a job",
)
def lock_job(job_id: str, req: JobLockRequest) -> Job:
    """Toggle delete protection for a job."""
    updated = job_manager.set_job_locked(job_id, req.locked)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return updated


# ---------------------------------------------------------------------------
# PATCH /jobs/{job_id}/rename  — update user-facing display name
# ---------------------------------------------------------------------------


@router.patch(
    "/{job_id}/rename",
    response_model=Job,
    summary="Rename a job (set display_name)",
)
def rename_job(job_id: str, req: JobRenameRequest) -> Job:
    """Set or update the user-facing display name for any job."""
    updated = job_manager.rename_job(job_id, req.display_name)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return updated


# ---------------------------------------------------------------------------
# DELETE /jobs/{job_id}  — delete job record
# ---------------------------------------------------------------------------


@router.delete(
    "/{job_id}",
    status_code=204,
    summary="Delete a job record",
)
def delete_job(job_id: str) -> None:
    """
    Removes the job record from the store.  Log files on disk are **not**
    deleted; remove `backend/jobs/{job_id}/` manually if needed.

    Returns 404 if the job does not exist.
    """
    job = job_manager.get_job_model(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    if job.locked:
        raise HTTPException(
            status_code=423,
            detail=f"Job '{job_id}' is locked. Unlock it before deleting.",
        )
    if job.status in {JobStatus.RUNNING, JobStatus.QUEUED}:
        raise HTTPException(
            status_code=409,
            detail=f"Job '{job_id}' is {job.status}. Stop/cancel it before deleting.",
        )

    deleted = job_manager.delete_job(job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
