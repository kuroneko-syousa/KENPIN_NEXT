"""
Job manager — persistent, subprocess-based YOLO training queue.

Architecture
────────────
  submit_job(JobCreate)
    └─ creates Job in JobStore (QUEUED)
    └─ writes per-job params.json to backend/jobs/{job_id}/
    └─ spawns background thread _run_subprocess()
         └─ validates venv python path
         └─ subprocess.Popen([venv_python, train_worker.py, params_path])
         └─ _monitor_process() polls progress.json every POLL_INTERVAL s
         └─ updates JobStore until COMPLETED or FAILED

Directory layout
────────────────
  backend/
    data/jobs.json                ← all Job records (persisted)
    jobs/{job_id}/
      params.json                 ← input params sent to worker
      progress.json               ← latest status written by worker
      train.log                   ← captured stdout/stderr

Backward-compatible API (used by routers/train.py)
───────────────────────────────────────────────────
  create_job / set_running / set_done / set_failed
  add_log / update_progress / get_job / is_busy

New API (used by routers/jobs.py)
──────────────────────────────────
  submit_job / get_job_model / list_jobs / cancel_job / delete_job
"""

from __future__ import annotations

import json
import logging
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from models.job import Job, JobCreate, JobStatus
from services.job_store import JobStore

logger = logging.getLogger(__name__)

# Root directory for per-job work files (params.json, progress.json)
_JOBS_WORK_DIR = Path(__file__).parent.parent / "jobs"
_JOBS_WORK_DIR.mkdir(exist_ok=True)

# Directory where log files are written: logs/{job_id}.log
_LOGS_DIR = Path(__file__).parent.parent / "logs"
_LOGS_DIR.mkdir(exist_ok=True)

# How often (seconds) the monitor thread polls progress.json
_POLL_INTERVAL: float = 2.0

# Maximum number of log lines retained in Job.log_lines (full log is in logs_path)
_MAX_LOG_LINES = 200


def _venv_python(env_path: str) -> Path:
    """Resolve the Python executable inside a venv on any platform."""
    root = Path(env_path)
    if sys.platform == "win32":
        return root / "Scripts" / "python.exe"
    return root / "bin" / "python"


def _worker_script() -> Path:
    return Path(__file__).parent.parent / "workers" / "train_worker.py"


class JobManager:
    """Central job manager.

    Thread-safe.  A single instance (``job_manager``) is shared by all routers.
    """

    def __init__(self) -> None:
        self._store = JobStore()
        self._lock = threading.Lock()

        # Legacy in-memory jobs (for routers/train.py backward compat)
        self._legacy_jobs: Dict[str, Dict[str, Any]] = {}
        # job_id of the currently active legacy job
        self._legacy_active: Optional[str] = None

        # Recover any subprocess jobs that were interrupted by a prior server crash
        self._restore_interrupted()

    # ------------------------------------------------------------------
    # Startup recovery
    # ------------------------------------------------------------------

    def _restore_interrupted(self) -> None:
        """Mark RUNNING jobs left over from a previous crash as FAILED."""
        for job in self._store.list_all():
            if job.status == JobStatus.RUNNING:
                job.status = JobStatus.FAILED
                job.error = "Process interrupted by server restart"
                self._store.save(job)
                logger.warning("Marked interrupted job %s as FAILED on startup", job.job_id)

    # ------------------------------------------------------------------
    # New API — used by routers/jobs.py
    # ------------------------------------------------------------------

    def submit_job(self, req: JobCreate) -> Job:
        """Create a persistent Job, write per-job files, and spawn subprocess.

        Returns the newly created Job (status=QUEUED immediately).
        The subprocess transitions it to RUNNING → COMPLETED/FAILED asynchronously.
        """
        job = Job(
            dataset_id=req.dataset_id,
            model=req.model,
            yolo_version=req.yolo_version,
            env_path=req.env_path,
            data_yaml=req.data_yaml,
            epochs=req.epochs,
            imgsz=req.imgsz,
            batch=req.batch,
            name=req.name,
            patience=req.patience,
            optimizer=req.optimizer,
            lr0=req.lr0,
            lrf=req.lrf,
            device=req.device,
        )

        # Per-job work directory
        job_dir = _JOBS_WORK_DIR / job.job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        # Log file lives in backend/logs/{job_id}.log (requirement: stdout+stderr)
        logs_path = str(_LOGS_DIR / f"{job.job_id}.log")
        progress_path = str(job_dir / "progress.json")
        params_path = str(job_dir / "params.json")

        job.logs_path = logs_path

        # Write params for the worker process (contains everything it needs)
        worker_params = job.model_dump(mode="json")
        worker_params["progress_path"] = progress_path
        Path(params_path).write_text(
            json.dumps(worker_params, ensure_ascii=False, default=str),
            encoding="utf-8",
        )

        self._store.save(job)
        logger.info("Job %s created (model=%s dataset=%s)", job.job_id, job.model, job.dataset_id)

        # Launch background thread that owns the subprocess lifecycle
        thread = threading.Thread(
            target=self._run_subprocess,
            args=(job.job_id, params_path, progress_path),
            daemon=True,
            name=f"job-runner-{job.job_id[:8]}",
        )
        thread.start()

        return job

    def _run_subprocess(
        self, job_id: str, params_path: str, progress_path: str
    ) -> None:
        """Background thread: validate venv, launch subprocess, monitor progress."""
        job = self._store.get(job_id)
        if job is None:
            logger.error("Job %s not found in store", job_id)
            return

        python_exe = _venv_python(job.env_path)
        worker = _worker_script()

        # Validate before launching
        if not python_exe.exists():
            msg = (
                f"Python executable not found: {python_exe}. "
                f"Create the venv first: python -m venv {job.env_path}"
            )
            logger.error(msg)
            self._update_job_status(job_id, JobStatus.FAILED, error=msg)
            return

        if not worker.exists():
            msg = f"train_worker.py not found at: {worker}"
            logger.error(msg)
            self._update_job_status(job_id, JobStatus.FAILED, error=msg)
            return

        # Transition to RUNNING
        self._update_job_status(job_id, JobStatus.RUNNING)
        logger.info(
            "Job %s launching: %s %s %s", job_id, python_exe, worker, params_path
        )

        log_handle = None
        try:
            if job.logs_path:
                log_handle = open(job.logs_path, "w", encoding="utf-8", buffering=1)

            proc = subprocess.Popen(
                [str(python_exe), str(worker), params_path],
                stdout=log_handle if log_handle else subprocess.DEVNULL,
                stderr=subprocess.STDOUT,
                cwd=str(Path(__file__).parent.parent),
            )
            self._monitor_process(job_id, proc, progress_path)

        except OSError as exc:
            logger.exception("Failed to launch subprocess for job %s", job_id)
            self._update_job_status(job_id, JobStatus.FAILED, error=str(exc))
        finally:
            if log_handle:
                log_handle.close()

    def _monitor_process(
        self, job_id: str, proc: subprocess.Popen, progress_path: str
    ) -> None:
        """Poll progress.json and tail the log file until the subprocess exits."""
        prog_file = Path(progress_path)

        job = self._store.get(job_id)
        log_file = Path(job.logs_path) if job and job.logs_path else None
        log_read_pos: int = 0

        while proc.poll() is None:
            time.sleep(_POLL_INTERVAL)
            self._read_and_apply_progress(job_id, prog_file)
            if log_file:
                log_read_pos = self._update_log_lines_from_file(
                    job_id, log_file, log_read_pos
                )

        rc = proc.returncode
        # Final reads after process exit
        self._read_and_apply_progress(job_id, prog_file)
        if log_file:
            self._update_log_lines_from_file(job_id, log_file, log_read_pos)

        job = self._store.get(job_id)
        if job is None:
            return

        if rc == 0:
            job.status = JobStatus.COMPLETED
            job.progress = 100
            logger.info("Job %s COMPLETED (rc=0)", job_id)
        else:
            job.status = JobStatus.FAILED
            if not job.error:
                job.error = f"Process exited with code {rc}"
            logger.error("Job %s FAILED (rc=%d)", job_id, rc)

        self._store.save(job)

    def _update_log_lines_from_file(
        self, job_id: str, log_file: Path, read_pos: int
    ) -> int:
        """Read any new content from the log file since read_pos.

        Appends new lines to job.log_lines (capped at _MAX_LOG_LINES).
        Returns the updated file offset for the next call.
        """
        if not log_file.exists():
            return read_pos
        try:
            with log_file.open("r", encoding="utf-8", errors="replace") as fh:
                fh.seek(read_pos)
                new_content = fh.read()
                new_pos = fh.tell()
        except OSError:
            return read_pos

        if not new_content:
            return read_pos

        new_lines = new_content.splitlines()
        if not new_lines:
            return new_pos

        job = self._store.get(job_id)
        if job is None:
            return new_pos

        job.log_lines.extend(new_lines)
        if len(job.log_lines) > _MAX_LOG_LINES:
            job.log_lines = job.log_lines[-_MAX_LOG_LINES:]
        self._store.save(job)
        return new_pos

    def _read_and_apply_progress(self, job_id: str, prog_file: Path) -> None:
        """Parse progress.json (if present) and persist the update."""
        if not prog_file.exists():
            return
        try:
            data: dict = json.loads(prog_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return  # file may be mid-write; skip this tick

        job = self._store.get(job_id)
        if job is None:
            return

        if "progress" in data:
            job.progress = int(data["progress"])
        if data.get("error"):
            job.error = data["error"]
            job.status = JobStatus.FAILED
        if data.get("results_path"):
            job.results_path = data["results_path"]
        if data.get("log"):
            job.log_lines.append(data["log"])
            if len(job.log_lines) > _MAX_LOG_LINES:
                job.log_lines = job.log_lines[-_MAX_LOG_LINES:]

        self._store.save(job)

    def _update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        *,
        error: Optional[str] = None,
    ) -> None:
        job = self._store.get(job_id)
        if job is None:
            return
        job.status = status
        if error is not None:
            job.error = error
        self._store.save(job)

    def get_job_model(self, job_id: str) -> Optional[Job]:
        """Return the full Job record, or None."""
        return self._store.get(job_id)

    def list_jobs(self) -> List[Job]:
        """Return all jobs, newest first."""
        return self._store.list_all()

    def cancel_job(self, job_id: str) -> Optional[Job]:
        """Attempt to cancel a QUEUED or RUNNING job.

        Sets status to FAILED.  For RUNNING subprocess jobs, the OS process
        is NOT killed here — implement via psutil if hard-kill is needed.
        """
        job = self._store.get(job_id)
        if job is None:
            return None
        if job.status in (JobStatus.QUEUED, JobStatus.RUNNING):
            job.status = JobStatus.FAILED
            job.error = "Cancelled by user"
            self._store.save(job)
            logger.info("Job %s cancelled by user", job_id)
        return job

    def delete_job(self, job_id: str) -> bool:
        """Delete a job record from the store.  Returns True if found."""
        return self._store.delete(job_id)

    # ------------------------------------------------------------------
    # Legacy API — kept for routers/train.py backward compatibility
    # ------------------------------------------------------------------

    def create_job(self, params: Dict[str, Any]) -> str:
        """Register a legacy in-memory job.  Returns job_id string."""
        job_id = str(uuid.uuid4())
        with self._lock:
            self._legacy_jobs[job_id] = {
                "id": job_id,
                "status": "pending",
                "params": params,
                "result": None,
                "error": None,
                "logs": [],
                "progress": 0,
                "epoch": 0,
                "total_epochs": 0,
            }
        return job_id

    def add_log(self, job_id: str, message: str) -> None:
        with self._lock:
            if job_id in self._legacy_jobs:
                self._legacy_jobs[job_id]["logs"].append(message)

    def update_progress(self, job_id: str, epoch: int, total_epochs: int) -> None:
        with self._lock:
            if job_id in self._legacy_jobs:
                job = self._legacy_jobs[job_id]
                job["epoch"] = epoch
                job["total_epochs"] = total_epochs
                job["progress"] = (
                    round(epoch / total_epochs * 100) if total_epochs > 0 else 0
                )

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Return job as a plain dict (legacy format) or None."""
        # Prefer persistent store for subprocess-based jobs
        persistent = self._store.get(job_id)
        if persistent is not None:
            return persistent.model_dump(mode="json")
        with self._lock:
            return self._legacy_jobs.get(job_id)

    def is_busy(self) -> bool:
        """True when any job is actively running."""
        with self._lock:
            if self._legacy_active is not None:
                return True
            for j in self._legacy_jobs.values():
                if j["status"] == "running":
                    return True
        # Also check persistent subprocess jobs
        for job in self._store.list_all():
            if job.status == JobStatus.RUNNING:
                return True
        return False

    def set_running(self, job_id: str) -> None:
        with self._lock:
            if job_id in self._legacy_jobs:
                self._legacy_jobs[job_id]["status"] = "running"
                self._legacy_active = job_id

    def set_done(self, job_id: str, result: Any) -> None:
        with self._lock:
            if job_id in self._legacy_jobs:
                self._legacy_jobs[job_id]["status"] = "done"
                self._legacy_jobs[job_id]["result"] = result
                if self._legacy_active == job_id:
                    self._legacy_active = None

    def set_failed(self, job_id: str, error: str) -> None:
        with self._lock:
            if job_id in self._legacy_jobs:
                self._legacy_jobs[job_id]["status"] = "failed"
                self._legacy_jobs[job_id]["error"] = error
                if self._legacy_active == job_id:
                    self._legacy_active = None


# Module-level singleton shared across all routers
job_manager = JobManager()
