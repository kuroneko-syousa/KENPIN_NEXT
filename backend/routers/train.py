"""
Training router.
  POST /train          → queue a new training job
  GET  /train/status/{job_id} → poll job status
"""

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from services.job_manager import job_manager
from services.model_registry import MODEL_MAP
from services.yolo_service import RUNS_DIR, run_training

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/train", tags=["Training"])


# ------------------------------------------------------------------
# Schema
# ------------------------------------------------------------------


class TrainRequest(BaseModel):
    data_yaml: str = Field(
        ..., description="Absolute or relative path to data.yaml in the uploaded dataset"
    )
    model: str = Field(
        default="yolov8n",
        description="YOLO model key without extension (e.g. yolov8n, yolov8s). Must be a key in MODEL_MAP.",
    )
    epochs: int = Field(default=50, ge=1, le=1000, description="Number of training epochs")
    imgsz: int = Field(default=640, ge=32, le=1280, description="Input image size (square)")
    batch: int = Field(default=16, ge=1, le=256, description="Batch size (-1 for auto)")
    name: str = Field(default="exp", description="Subdirectory name inside runs/train/")
    patience: int = Field(default=50, ge=0, le=500, description="Early stopping patience (0 = disabled)")
    optimizer: str = Field(default="auto", description="Optimizer name (auto/SGD/Adam/AdamW/...)")
    lr0: float = Field(default=0.01, gt=0, le=1, description="Initial learning rate")
    lrf: float = Field(default=0.01, gt=0, le=1, description="Final LR as fraction of lr0")
    device: str = Field(default="auto", description="Training device: 'auto', 'cpu', or 'cuda'")


# ------------------------------------------------------------------
# Background worker
# ------------------------------------------------------------------


def _run_training_task(job_id: str, req: TrainRequest, model_name: str) -> None:
    """Executed in a background thread via FastAPI BackgroundTasks."""
    job_manager.set_running(job_id)
    try:
        result = run_training(
            job_id=job_id,
            data_yaml=req.data_yaml,
            model_name=model_name,
            epochs=req.epochs,
            imgsz=req.imgsz,
            batch=req.batch,
            patience=req.patience,
            optimizer=req.optimizer,
            lr0=req.lr0,
            lrf=req.lrf,
            device=req.device,
            project=str(RUNS_DIR / "train"),
            name=req.name,
        )
        job_manager.set_done(job_id, result)
        logger.info("Job %s completed successfully", job_id)
    except Exception as exc:
        logger.error("Job %s failed: %s", job_id, exc, exc_info=True)
        job_manager.set_failed(job_id, str(exc))


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.post("/", summary="Start a YOLO training job")
def start_training(req: TrainRequest, background_tasks: BackgroundTasks):
    """
    Queues a training job.  Returns immediately with a `job_id` that can be
    polled via GET /train/status/{job_id}.

    Returns 409 when another job is already running.
    """
    if job_manager.is_busy():
        raise HTTPException(
            status_code=409,
            detail="A training job is already running. Wait for it to finish before starting a new one.",
        )

    if not Path(req.data_yaml).exists():
        raise HTTPException(
            status_code=400,
            detail=f"data.yaml not found at path: {req.data_yaml}",
        )

    model_key = req.model.replace(".pt", "").strip()
    model_name = MODEL_MAP.get(model_key)
    if not model_name:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model key: '{model_key}'. Valid keys: {sorted(MODEL_MAP)}",
        )
    logger.info("Model resolved: %s -> %s", model_key, model_name)

    device = req.device.lower().strip() if req.device else "auto"
    if device not in ("auto", "cpu", "cuda"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid device '{device}'. Must be auto, cpu, or cuda.",
        )

    job_id = job_manager.create_job(req.model_dump())
    background_tasks.add_task(_run_training_task, job_id, req, model_name)
    logger.info("Training job %s queued | model=%s epochs=%d", job_id, req.model, req.epochs)

    return {"job_id": job_id, "status": "pending"}


@router.get("/status/{job_id}", summary="Get training job status")
def get_job_status(job_id: str):
    """
    Poll the status of a training job.

    Possible status values: `pending`, `running`, `done`, `failed`.
    """
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return job
