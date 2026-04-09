"""
In-memory job manager.
Tracks training job lifecycle: PENDING → RUNNING → DONE / FAILED.
Only one training job may run at a time.
"""

import threading
import uuid
from enum import Enum
from typing import Any, Dict, Optional


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class JobManager:
    def __init__(self) -> None:
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._active_job_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_job(self, params: Dict[str, Any]) -> str:
        """Register a new job and return its ID."""
        job_id = str(uuid.uuid4())
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "status": JobStatus.PENDING,
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
        """Append a log line to the job."""
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id]["logs"].append(message)

    def update_progress(self, job_id: str, epoch: int, total_epochs: int) -> None:
        """Update epoch progress for a running job."""
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id]["epoch"] = epoch
                self._jobs[job_id]["total_epochs"] = total_epochs
                self._jobs[job_id]["progress"] = (
                    round(epoch / total_epochs * 100) if total_epochs > 0 else 0
                )

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Return job dict or None if not found."""
        return self._jobs.get(job_id)

    def is_busy(self) -> bool:
        """Return True when a training job is currently running."""
        return self._active_job_id is not None

    # ------------------------------------------------------------------
    # State transitions (called from background thread)
    # ------------------------------------------------------------------

    def set_running(self, job_id: str) -> None:
        with self._lock:
            self._jobs[job_id]["status"] = JobStatus.RUNNING
            self._active_job_id = job_id

    def set_done(self, job_id: str, result: Any) -> None:
        with self._lock:
            self._jobs[job_id]["status"] = JobStatus.DONE
            self._jobs[job_id]["result"] = result
            if self._active_job_id == job_id:
                self._active_job_id = None

    def set_failed(self, job_id: str, error: str) -> None:
        with self._lock:
            self._jobs[job_id]["status"] = JobStatus.FAILED
            self._jobs[job_id]["error"] = error
            if self._active_job_id == job_id:
                self._active_job_id = None


# Module-level singleton shared across all routers
job_manager = JobManager()
