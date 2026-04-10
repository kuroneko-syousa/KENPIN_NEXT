"""
Job domain model.

Represents a single YOLO training job lifecycle:
    QUEUED → RUNNING → COMPLETED | FAILED

Jobs are persisted to JSON and survive server restarts.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Job(BaseModel):
    """Persistent job record stored in data/jobs.json."""

    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dataset_id: str = Field(default="", description="Dataset identifier")
    model: str = Field(default="yolov8n", description="YOLO model key (e.g. yolov8n)")
    yolo_version: str = Field(default="8.0.0", description="Ultralytics YOLO version in the venv")
    env_path: str = Field(
        default="",
        description="Absolute path to the venv root (e.g. /envs/yolo_8.0.0). "
        "Python binary resolved as <env_path>/bin/python (Linux) or "
        "<env_path>/Scripts/python.exe (Windows).",
    )
    status: JobStatus = Field(default=JobStatus.QUEUED)
    progress: int = Field(default=0, ge=0, le=100, description="Training progress 0-100")
    logs_path: Optional[str] = Field(default=None, description="Path to train.log file")
    results_path: Optional[str] = Field(default=None, description="Path to best.pt weights")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC creation timestamp",
    )

    # Error message (FAILED state only)
    error: Optional[str] = None

    # Append-only recent log lines (last N lines, full log is in logs_path)
    log_lines: List[str] = Field(default_factory=list)

    # Training hyperparameters — stored so reruns are reproducible
    data_yaml: str = Field(default="", description="Absolute path to data.yaml (legacy mode)")
    dataset_source_path: Optional[str] = Field(
        default=None,
        description="Absolute path to the source dataset directory. "
        "When provided the dataset is copied to jobs/{job_id}/dataset/ before training, "
        "and a runtime.yaml with absolute paths is generated automatically.",
    )
    epochs: int = Field(default=50, ge=1, le=1000)
    imgsz: int = Field(default=640, ge=32, le=1280)
    batch: int = Field(default=16, ge=1)
    name: str = Field(default="exp", description="Subdirectory name inside runs/train/")
    patience: int = Field(default=50, ge=0)
    optimizer: str = Field(default="auto")
    lr0: float = Field(default=0.01, gt=0)
    lrf: float = Field(default=0.01, gt=0)
    device: str = Field(default="auto", description="auto | cpu | cuda")


class JobCreate(BaseModel):
    """Request body for POST /jobs."""

    dataset_id: str
    model: str = Field(default="yolov8n")
    yolo_version: str = Field(default="8.0.0")
    env_path: str = Field(
        ...,
        description="Absolute path to the venv root (e.g. /envs/yolo_8.0.0)",
    )
    data_yaml: str = Field(
        default="",
        description="Absolute path to data.yaml (legacy). "
        "Provide dataset_source_path instead for portable, reproducible jobs.",
    )
    dataset_source_path: Optional[str] = Field(
        default=None,
        description="Absolute path to the dataset directory (images/, labels/, classes.txt). "
        "When provided the dataset is isolated per-job automatically.",
    )
    epochs: int = Field(default=50, ge=1, le=1000)
    imgsz: int = Field(default=640, ge=32, le=1280)
    batch: int = Field(default=16, ge=1)
    name: str = Field(default="exp")
    patience: int = Field(default=50, ge=0)
    optimizer: str = Field(default="auto")
    lr0: float = Field(default=0.01, gt=0)
    lrf: float = Field(default=0.01, gt=0)
    device: str = Field(default="auto")


class JobSummary(BaseModel):
    """Lightweight response model for job listings."""

    job_id: str
    dataset_id: Optional[str]
    model: str
    yolo_version: str
    status: JobStatus
    progress: int
    created_at: datetime
    logs_path: Optional[str]
    results_path: Optional[str]
    error: Optional[str]
