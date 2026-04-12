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
_LOG_SAVE_BATCH_SIZE = 20
_LOG_SAVE_INTERVAL_SEC = 0.5


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
        self._queue_cv = threading.Condition(self._lock)
        self._queue: List[str] = []
        self._active_job_id: Optional[str] = None
        self._proc_lock = threading.Lock()
        self._procs: Dict[str, subprocess.Popen[str]] = {}
        self._log_buffer_lock = threading.Lock()
        self._log_buffers: Dict[str, List[str]] = {}
        self._last_log_flush: Dict[str, float] = {}
        self._last_progress_log: Dict[str, str] = {}

        # Legacy in-memory jobs (for routers/train.py backward compat)
        self._legacy_jobs: Dict[str, Dict[str, Any]] = {}
        # job_id of the currently active legacy job
        self._legacy_active: Optional[str] = None

        # Recover any subprocess jobs that were interrupted by a prior server crash
        self._restore_interrupted()

        # Start a single dispatcher to enforce FIFO execution (no parallel training).
        self._dispatcher = threading.Thread(
            target=self._dispatch_loop,
            daemon=True,
            name="job-dispatcher",
        )
        self._dispatcher.start()

    # ------------------------------------------------------------------
    # Startup recovery
    # ------------------------------------------------------------------

    def _restore_interrupted(self) -> None:
        """Mark RUNNING jobs left over from a previous crash as FAILED."""
        queued_jobs: List[Job] = []
        for job in self._store.list_all():
            if job.status == JobStatus.RUNNING:
                job.status = JobStatus.FAILED
                job.error = "Process interrupted by server restart"
                self._store.save(job)
                logger.warning("Marked interrupted job %s as FAILED on startup", job.job_id)
            elif job.status == JobStatus.QUEUED:
                queued_jobs.append(job)

        if queued_jobs:
            queued_jobs.sort(key=lambda j: j.created_at)
            with self._queue_cv:
                for job in queued_jobs:
                    if job.job_id not in self._queue:
                        self._queue.append(job.job_id)
                self._queue_cv.notify()

    def _dispatch_loop(self) -> None:
        """Run one queued job at a time in FIFO order."""
        while True:
            with self._queue_cv:
                while not self._queue:
                    self._queue_cv.wait()
                job_id = self._queue.pop(0)
                self._active_job_id = job_id

            try:
                current = self._store.get(job_id)
                if current is None or current.status != JobStatus.QUEUED:
                    continue
                # params.json は workspace_path/jobs/{job_id}/ に書き込まれている
                if current.workspace_path:
                    job_dir = Path(current.workspace_path) / "jobs" / job_id
                else:
                    job_dir = _JOBS_WORK_DIR / job_id
                params_path = str(job_dir / "params.json")
                progress_path = str(job_dir / "progress.json")
                self._run_subprocess(job_id, params_path, progress_path)
            finally:
                with self._queue_cv:
                    if self._active_job_id == job_id:
                        self._active_job_id = None

    # ------------------------------------------------------------------
    # New API — used by routers/jobs.py
    # ------------------------------------------------------------------

    def submit_job(self, req: JobCreate) -> Job:
        """Create a persistent Job, write per-job files, and spawn subprocess.

        Returns the newly created Job (status=QUEUED immediately).
        The subprocess transitions it to RUNNING → COMPLETED/FAILED asynchronously.
        
        Workspace directory structure:
            backend/workspaces/{user_id}/{workspace_id}/
                jobs/{job_id}/
                    params.json, progress.json, stop.request
                logs/{job_id}.log
                models/          (YOLO output: runs/train/...)
        
        Raises:
            ValueError: If a job is already running or queued for this workspace.
        """
        # Check for duplicate job in the same workspace
        if req.workspace_id:
            with self._lock:
                existing_jobs = [
                    j for j in self._store.list_all()
                    if j.workspace_id == req.workspace_id
                    and j.status in (JobStatus.QUEUED, JobStatus.RUNNING)
                ]
                if existing_jobs:
                    existing = existing_jobs[0]
                    queue_pos = None
                    if existing.status == JobStatus.QUEUED:
                        try:
                            queue_pos = self._queue.index(existing.job_id) + 1
                        except ValueError:
                            pass
                    raise ValueError(
                        f"Job already in progress for workspace {req.workspace_id}. "
                        f"Job ID: {existing.job_id}, Status: {existing.status.value}, "
                        f"Queue Position: {queue_pos}"
                    )
        
        job = Job(
            workspace_id=req.workspace_id,
            requested_by=req.requested_by,
            user_id=req.user_id,
            workspace_path=req.workspace_path,
            dataset_id=req.dataset_id,
            model=req.model,
            yolo_version=req.yolo_version,
            env_path=req.env_path,
            data_yaml=req.data_yaml,
            dataset_source_path=req.dataset_source_path,
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

        # Determine workspace directory structure
        # If workspace_path is provided, use it; otherwise use legacy backend/jobs/
        if job.workspace_path:
            workspace_base = Path(job.workspace_path)
        else:
            # Legacy fallback
            workspace_base = _JOBS_WORK_DIR.parent / "workspaces" / (job.user_id or "default")
            workspace_base = workspace_base / (job.workspace_id or "workspace")
            job.workspace_path = str(workspace_base)

        # Create workspace subdirectories
        jobs_dir = workspace_base / "jobs"
        logs_dir = workspace_base / "logs"
        jobs_dir.mkdir(parents=True, exist_ok=True)
        logs_dir.mkdir(parents=True, exist_ok=True)

        # Per-job work directory
        job_dir = jobs_dir / job.job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        # Log file lives in workspace/logs/{job_id}.log
        logs_path = str(logs_dir / f"{job.job_id}.log")
        progress_path = str(job_dir / "progress.json")
        params_path = str(job_dir / "params.json")
        stop_path = str(job_dir / "stop.request")

        job.logs_path = logs_path

        # Write params for the worker process (contains everything it needs)
        worker_params = job.model_dump(mode="json")
        worker_params["progress_path"] = progress_path
        worker_params["stop_path"] = stop_path
        # Pass the workspace directory for YOLO project output
        worker_params["workspace_dir"] = str(workspace_base)
        Path(params_path).write_text(
            json.dumps(worker_params, ensure_ascii=False, default=str),
            encoding="utf-8",
        )

        self._store.save(job)
        logger.info("Job %s created (workspace=%s/%s, model=%s dataset=%s)", 
                    job.job_id, job.user_id, job.workspace_id, job.model, job.dataset_id)

        with self._queue_cv:
            self._queue.append(job.job_id)
            self._queue_cv.notify()

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
        stream_thread: Optional[threading.Thread] = None
        try:
            if job.logs_path:
                log_handle = open(job.logs_path, "w", encoding="utf-8", buffering=1)

            proc = subprocess.Popen(
                [str(python_exe), "-u", str(worker), params_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=str(Path(__file__).parent.parent),
            )
            with self._proc_lock:
                self._procs[job_id] = proc
            self._append_log_line(job_id, "TRAIN STARTED", log_handle=log_handle)
            stream_thread = threading.Thread(
                target=self._stream_logs,
                args=(job_id, proc, log_handle),
                daemon=True,
                name=f"log-stream-{job_id[:8]}",
            )
            stream_thread.start()
            self._monitor_process(job_id, proc, progress_path)

        except OSError as exc:
            logger.exception("Failed to launch subprocess for job %s", job_id)
            self._update_job_status(job_id, JobStatus.FAILED, error=str(exc))
        finally:
            self._flush_log_buffer(job_id, force=True)
            with self._proc_lock:
                self._procs.pop(job_id, None)
            if stream_thread and stream_thread.is_alive():
                stream_thread.join(timeout=2.0)
            if log_handle:
                log_handle.close()

    def _stream_logs(
        self,
        job_id: str,
        proc: subprocess.Popen[str],
        log_handle: Optional[Any],
    ) -> None:
        """Read subprocess stdout line-by-line and persist log lines immediately."""
        self._append_log_line(job_id, "LOG STREAM THREAD STARTED", log_handle=log_handle)
        if proc.stdout is None:
            return
        try:
            for raw_line in proc.stdout:
                line = raw_line.rstrip("\r\n")
                logger.info("Job %s RECEIVED: %s", job_id, line)
                self._append_log_line(job_id, line, log_handle=log_handle)
        except Exception as exc:
            logger.exception("LOG THREAD ERROR for job %s: %s", job_id, exc)
        finally:
            self._flush_log_buffer(job_id, force=True)
            try:
                proc.stdout.close()
            except Exception:
                pass

    def _monitor_process(
        self, job_id: str, proc: subprocess.Popen, progress_path: str
    ) -> None:
        """Poll progress.json until the subprocess exits."""
        prog_file = Path(progress_path)

        while proc.poll() is None:
            time.sleep(_POLL_INTERVAL)
            self._read_and_apply_progress(job_id, prog_file)
            self._flush_log_buffer(job_id, force=False)

        rc = proc.returncode
        # Final reads after process exit
        self._read_and_apply_progress(job_id, prog_file)
        self._flush_log_buffer(job_id, force=True)

        job = self._store.get(job_id)
        if job is None:
            return

        if rc == 0:
            if job.status == JobStatus.STOPPED:
                logger.info("Job %s STOPPED (rc=0)", job_id)
            else:
                job.status = JobStatus.COMPLETED
                job.progress = 100
                logger.info("Job %s COMPLETED (rc=0)", job_id)
        else:
            if job.status != JobStatus.STOPPED:
                job.status = JobStatus.FAILED
                if not job.error:
                    job.error = f"Process exited with code {rc}"
                logger.error("Job %s FAILED (rc=%d)", job_id, rc)

        self._store.save(job)

    def _append_log_line(
        self, job_id: str, message: str, *, log_handle: Optional[Any] = None
    ) -> None:
        """Append a single log line to file and buffered in-store tail cache."""
        if log_handle is not None:
            try:
                log_handle.write(message + "\n")
                log_handle.flush()
            except OSError:
                pass

        self._buffer_log_line(job_id, message)
        # Keep graph updates realtime: JSON_LOG lines flush immediately.
        if message.startswith("JSON_LOG:"):
            self._flush_log_buffer(job_id, force=True)

    def _buffer_log_line(self, job_id: str, message: str) -> None:
        with self._log_buffer_lock:
            self._log_buffers.setdefault(job_id, []).append(message)

    def _flush_log_buffer(self, job_id: str, *, force: bool) -> None:
        now = time.monotonic()
        with self._log_buffer_lock:
            pending = self._log_buffers.get(job_id, [])
            if not pending:
                return

            last = self._last_log_flush.get(job_id, 0.0)
            should_flush = (
                force
                or len(pending) >= _LOG_SAVE_BATCH_SIZE
                or (now - last) >= _LOG_SAVE_INTERVAL_SEC
            )
            if not should_flush:
                return

            chunk = pending[:]
            self._log_buffers[job_id] = []
            self._last_log_flush[job_id] = now

        job = self._store.get(job_id)
        if job is None:
            return

        job.log_lines.extend(chunk)
        job.log_total_lines += len(chunk)
        if len(job.log_lines) > _MAX_LOG_LINES:
            job.log_lines = job.log_lines[-_MAX_LOG_LINES:]
        self._store.save(job)

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
        if data.get("status") == "stopped":
            job.status = JobStatus.STOPPED
            job.cancel_requested = True
        if data.get("error"):
            job.error = data["error"]
            if job.status != JobStatus.STOPPED:
                job.status = JobStatus.FAILED
        if data.get("results_path"):
            job.results_path = data["results_path"]
        progress_log = data.get("log")
        if progress_log:
            prev = self._last_progress_log.get(job_id, "")
            if progress_log != prev:
                self._last_progress_log[job_id] = progress_log
                job.log_lines.append(progress_log)
                job.log_total_lines += 1
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
        job = self._store.get(job_id)
        if job is None:
            return None
        if job.status == JobStatus.QUEUED:
            position = self.get_queue_position(job_id)
            job.queue_position = position
        else:
            job.queue_position = None
        return job

    def get_running_job_id(self) -> Optional[str]:
        with self._queue_cv:
            return self._active_job_id

    def get_queue_position(self, job_id: str) -> Optional[int]:
        with self._queue_cv:
            for idx, queued_job_id in enumerate(self._queue, start=1):
                if queued_job_id == job_id:
                    return idx
        return None

    def get_queue_size(self) -> int:
        with self._queue_cv:
            return len(self._queue)

    def list_jobs(self) -> List[Job]:
        """Return all jobs, newest first."""
        jobs = self._store.list_all()
        for job in jobs:
            if job.status == JobStatus.QUEUED:
                job.queue_position = self.get_queue_position(job.job_id)
            else:
                job.queue_position = None
        return jobs

    def _dequeue_job(self, job_id: str) -> None:
        with self._queue_cv:
            self._queue = [queued for queued in self._queue if queued != job_id]

    def cancel_job(self, job_id: str) -> Optional[Job]:
        """Attempt to cancel a QUEUED or RUNNING job.

        Sets status to FAILED.  For RUNNING subprocess jobs, the OS process
        is NOT killed here — implement via psutil if hard-kill is needed.
        """
        job = self._store.get(job_id)
        if job is None:
            return None
        if job.status in (JobStatus.QUEUED, JobStatus.RUNNING):
            if job.status == JobStatus.QUEUED:
                self._dequeue_job(job_id)
            job.status = JobStatus.FAILED
            job.error = "Cancelled by user"
            self._store.save(job)
            logger.info("Job %s cancelled by user", job_id)
        return job

    def stop_job(self, job_id: str) -> Optional[Job]:
        """Request graceful stop for a running job."""
        job = self._store.get(job_id)
        if job is None:
            return None

        if job.status == JobStatus.QUEUED:
            self._dequeue_job(job_id)
            job.status = JobStatus.STOPPED
            job.cancel_requested = True
            job.progress = 0
            self._append_log_line(job_id, "[INFO] Stop requested before start")
            self._store.save(job)
            return job

        if job.status != JobStatus.RUNNING:
            return job

        job.cancel_requested = True
        self._store.save(job)

        stop_file = _JOBS_WORK_DIR / job_id / "stop.request"
        try:
            stop_file.write_text("1", encoding="utf-8")
        except OSError as exc:
            logger.warning("Failed to write stop request for job %s: %s", job_id, exc)

        self._append_log_line(job_id, "[INFO] Stop requested by user")
        logger.info("Job %s stop requested", job_id)
        return self._store.get(job_id)

    def delete_job(self, job_id: str) -> bool:
        """Delete a job record from the store.  Returns True if found."""
        return self._store.delete(job_id)

    def set_job_locked(self, job_id: str, locked: bool) -> Optional[Job]:
        """Set lock state for a job. Returns updated job or None."""
        job = self._store.get(job_id)
        if job is None:
            return None
        job.locked = bool(locked)
        self._store.save(job)
        return job

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
        # Also persist to JobStore so the job survives server restarts
        try:
            legacy_job = Job(
                job_id=job_id,
                dataset_id=str(params.get("dataset_id", "")),
                model=str(params.get("model", "yolov8n")),
                env_path="",
                data_yaml=str(params.get("data_yaml", "")),
                epochs=int(params.get("epochs", 50)),
                imgsz=int(params.get("imgsz", 640)),
                batch=int(params.get("batch", 16)),
                name=str(params.get("name", "train")),
                patience=int(params.get("patience", 50)),
                optimizer=str(params.get("optimizer", "auto")),
                lr0=float(params.get("lr0", 0.01)),
                lrf=float(params.get("lrf", 0.01)),
                device=str(params.get("device", "auto")),
                status=JobStatus.QUEUED,
            )
            self._store.save(legacy_job)
        except Exception as exc:
            logger.warning("Failed to persist legacy job %s to store: %s", job_id, exc)
        return job_id

    def _update_store_status(
        self,
        job_id: str,
        status: JobStatus,
        *,
        error: Optional[str] = None,
        results_path: Optional[str] = None,
        progress: Optional[int] = None,
    ) -> None:
        """Update the JobStore record for a job (no-op if not found)."""
        job = self._store.get(job_id)
        if job is None:
            return
        job.status = status
        if error is not None:
            job.error = error
        if results_path is not None:
            job.results_path = results_path
        if progress is not None:
            job.progress = progress
        self._store.save(job)

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
        self._update_store_status(job_id, JobStatus.RUNNING)

    def set_done(self, job_id: str, result: Any) -> None:
        with self._lock:
            if job_id in self._legacy_jobs:
                self._legacy_jobs[job_id]["status"] = "done"
                self._legacy_jobs[job_id]["result"] = result
                if self._legacy_active == job_id:
                    self._legacy_active = None
        # Persist completion and results_path to JobStore
        results_path: Optional[str] = None
        if isinstance(result, dict):
            results_path = result.get("best_weights")
        self._update_store_status(
            job_id, JobStatus.COMPLETED, results_path=results_path, progress=100
        )

    def set_failed(self, job_id: str, error: str) -> None:
        with self._lock:
            if job_id in self._legacy_jobs:
                self._legacy_jobs[job_id]["status"] = "failed"
                self._legacy_jobs[job_id]["error"] = error
                if self._legacy_active == job_id:
                    self._legacy_active = None
        self._update_store_status(job_id, JobStatus.FAILED, error=error)


# Module-level singleton shared across all routers
job_manager = JobManager()
