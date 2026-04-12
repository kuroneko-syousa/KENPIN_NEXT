"""
Thread-safe JSON persistence for Job records.

File layout:
    backend/data/jobs.json   — registry of all job records

All writes are atomic (write-then-move) to avoid corrupt reads.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional

from models.job import Job

logger = logging.getLogger(__name__)

_DEFAULT_PATH = Path(__file__).parent.parent / "data" / "jobs.json"


class JobStore:
    """Reads/writes the jobs.json file.  All public methods are thread-safe."""

    def __init__(self, path: Path = _DEFAULT_PATH) -> None:
        self._path = path
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._cache: Dict[str, Job] = {}
        self._load()

    # ------------------------------------------------------------------
    # Init / persistence
    # ------------------------------------------------------------------

    def _load(self) -> None:
        """Deserialise jobs.json into in-memory cache on startup."""
        if not self._path.exists():
            return
        try:
            raw: dict = json.loads(self._path.read_text(encoding="utf-8"))
            for k, v in raw.items():
                try:
                    self._cache[k] = Job.model_validate(v)
                except Exception as exc:
                    logger.warning("Skipping invalid job record %s: %s", k, exc)
            logger.info("JobStore loaded %d record(s) from %s", len(self._cache), self._path)
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("Failed to load %s: %s — starting with empty store", self._path, exc)

    def _flush(self) -> None:
        """Serialize cache to disk atomically.  Caller must hold self._lock."""
        data = {k: v.model_dump(mode="json") for k, v in self._cache.items()}
        payload = json.dumps(data, ensure_ascii=False, indent=2, default=str)
        last_perm_error: Optional[PermissionError] = None
        for attempt in range(3):
            # Write to a temp file in the same directory, then rename atomically.
            tmp_fd, tmp_path = tempfile.mkstemp(
                dir=self._path.parent, suffix=".tmp", prefix="jobs_"
            )
            try:
                with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                    f.write(payload)
                os.replace(tmp_path, self._path)
                return
            except PermissionError as exc:
                last_perm_error = exc
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                if attempt < 2:
                    time.sleep(0.05 * (attempt + 1))
                    continue
            except OSError:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                raise

        if last_perm_error is not None:
            raise last_perm_error

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def save(self, job: Job) -> None:
        """Insert or update a job record."""
        with self._lock:
            self._cache[job.job_id] = job
            self._flush()

    def get(self, job_id: str) -> Optional[Job]:
        """Return the Job or None."""
        with self._lock:
            return self._cache.get(job_id)

    def list_all(self) -> List[Job]:
        """Return all jobs sorted by created_at descending."""
        with self._lock:
            return sorted(
                self._cache.values(), key=lambda j: j.created_at, reverse=True
            )

    def delete(self, job_id: str) -> bool:
        """Remove a job record.  Returns True if it existed."""
        with self._lock:
            if job_id not in self._cache:
                return False
            del self._cache[job_id]
            self._flush()
            return True
