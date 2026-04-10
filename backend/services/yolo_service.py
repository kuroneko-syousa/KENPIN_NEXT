"""
YOLO service layer.
All Ultralytics calls are isolated here so routers stay thin.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List

import torch
from ultralytics import YOLO

logger = logging.getLogger(__name__)

# Root output directory for all training / prediction runs
# Use an absolute path so results are always saved to backend/runs/
# regardless of which directory uvicorn was started from.
RUNS_DIR = Path(__file__).parent.parent / "runs"
RUNS_DIR.mkdir(exist_ok=True)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def get_device() -> str:
    """Auto-detect CUDA (first GPU) or fall back to CPU."""
    if torch.cuda.is_available():
        name = torch.cuda.get_device_name(0)
        logger.info("CUDA device detected: %s", name)
        return "cuda"
    logger.info("CUDA not available — using CPU")
    return "cpu"


# ------------------------------------------------------------------
# Training
# ------------------------------------------------------------------


def run_training(
    job_id: str,
    data_yaml: str,
    model_name: str,
    epochs: int,
    imgsz: int,
    batch: int,
    project: str,
    name: str,
    patience: int = 50,
    optimizer: str = "auto",
    lr0: float = 0.01,
    lrf: float = 0.01,
    device: str = "auto",
) -> Dict[str, Any]:
    """
    Train a YOLO model and return a result dict.
    Blocks until training is complete (intended for background thread use).
    """
    from services.job_manager import job_manager  # avoid circular import at module level

    # Resolve device: "auto" → detect CUDA; "cuda" → fall back to CPU if unavailable
    device = device.lower().strip()
    if device == "auto":
        resolved_device = get_device()
    elif device == "cuda" and not torch.cuda.is_available():
        logger.warning("CUDA requested but not available — falling back to CPU")
        resolved_device = "cpu"
    else:
        resolved_device = device

    device_label = (
        f"cuda ({torch.cuda.get_device_name(0)})"
        if resolved_device == "cuda" and torch.cuda.is_available()
        else resolved_device
    )
    job_manager.add_log(job_id, f"[INFO] Using device: {device_label}")
    logger.info(
        "Training started | model=%s epochs=%d imgsz=%d batch=%d device=%s",
        model_name,
        epochs,
        imgsz,
        batch,
        resolved_device,
    )

    model = YOLO(model_name)

    def on_train_epoch_end(trainer):  # type: ignore[no-untyped-def]
        epoch = trainer.epoch + 1
        total = trainer.epochs
        msg = f"Epoch {epoch}/{total} completed"
        job_manager.add_log(job_id, msg)
        job_manager.update_progress(job_id, epoch, total)
        logger.debug("Epoch %d/%d", epoch, total)

    model.add_callback("on_train_epoch_end", on_train_epoch_end)

    model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=resolved_device,
        project=project,
        name=name,
        patience=patience,
        optimizer=optimizer,
        lr0=lr0,
        lrf=lrf,
        exist_ok=True,
    )

    best_weights = Path(project) / name / "weights" / "best.pt"
    last_weights = Path(project) / name / "weights" / "last.pt"
    logger.info("Training complete | best=%s", best_weights)

    return {
        "best_weights": str(best_weights),
        "last_weights": str(last_weights),
        "project": project,
        "name": name,
    }


# ------------------------------------------------------------------
# Inference
# ------------------------------------------------------------------


def run_prediction(
    weights_path: str,
    source: str,
    conf: float = 0.25,
    imgsz: int = 640,
) -> Dict[str, Any]:
    """
    Run YOLO inference on *source* (file path or directory).
    Returns structured detections list.
    """
    device = get_device()
    logger.info(
        "Prediction started | weights=%s source=%s conf=%.2f device=%s",
        weights_path,
        source,
        conf,
        device,
    )

    model = YOLO(weights_path)
    results = model.predict(
        source=source,
        conf=conf,
        imgsz=imgsz,
        device=device,
        save=True,
        project=str(RUNS_DIR / "predict"),
    )

    detections: List[Dict[str, Any]] = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            detections.append(
                {
                    "class_id": int(box.cls[0]),
                    "class_name": r.names[int(box.cls[0])],
                    "confidence": round(float(box.conf[0]), 4),
                    "bbox_xyxy": [round(v, 2) for v in box.xyxy[0].tolist()],
                }
            )

    logger.info("Prediction complete | %d detections", len(detections))
    return {"detections": detections, "count": len(detections)}
