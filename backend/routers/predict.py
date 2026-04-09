"""
Prediction router.
  POST /predict → run YOLO inference on an uploaded image
"""

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.yolo_service import RUNS_DIR, run_prediction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/predict", tags=["Inference"])

# Temporary directory for uploaded images (cleaned up after each request)
_UPLOAD_TMP = Path("tmp") / "predict_uploads"
_UPLOAD_TMP.mkdir(parents=True, exist_ok=True)

_ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@router.post("/", summary="Run YOLO inference on an uploaded image")
async def predict(
    file: UploadFile = File(..., description="Image file to run inference on"),
    weights: str = Form(
        default="yolov8n.pt",
        description="Path to .pt weights file, or a pretrained model name",
    ),
    conf: float = Form(default=0.25, ge=0.0, le=1.0, description="Confidence threshold"),
    imgsz: int = Form(default=640, ge=32, le=1280, description="Inference image size"),
):
    """
    Accepts an image upload, runs YOLO inference, and returns structured detections.
    The saved visualisation is written to runs/predict/.
    """
    # Validate file extension
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_IMAGE_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format '{suffix}'. Allowed: {sorted(_ALLOWED_IMAGE_SUFFIXES)}",
        )

    # Validate weights path (skip check for pretrained model names like yolov8n.pt)
    weights_path = Path(weights)
    if weights_path.suffix == ".pt" and weights_path.is_absolute() and not weights_path.exists():
        raise HTTPException(status_code=400, detail=f"Weights file not found: {weights}")

    # Save uploaded image to a temporary location
    tmp_file = _UPLOAD_TMP / f"{uuid.uuid4()}{suffix}"
    try:
        tmp_file.write_bytes(await file.read())

        result = run_prediction(
            weights_path=weights,
            source=str(tmp_file),
            conf=conf,
            imgsz=imgsz,
        )
        return result

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Prediction failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if tmp_file.exists():
            tmp_file.unlink()
