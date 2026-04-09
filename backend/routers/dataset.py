"""
Dataset router.
  POST /dataset/upload → accept a YOLO-format zip, unzip it, validate data.yaml
"""

import logging
import shutil
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dataset", tags=["Dataset"])

DATASETS_DIR = Path("datasets")
DATASETS_DIR.mkdir(exist_ok=True)

_MAX_ZIP_SIZE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB hard limit


@router.post("/upload", summary="Upload a YOLO-format dataset as a ZIP file")
async def upload_dataset(
    file: UploadFile = File(
        ...,
        description="ZIP archive containing a YOLO dataset (must include data.yaml)",
    ),
):
    """
    Accepts a `.zip` file, unzips it into `datasets/<dataset_id>/`,
    and validates that a `data.yaml` file is present inside.

    Returns the `dataset_id` and the resolved path to `data.yaml` which can be
    passed directly to `POST /train`.
    """
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")

    dataset_id = str(uuid.uuid4())
    dataset_dir = DATASETS_DIR / dataset_id
    zip_tmp = dataset_dir / "_upload.zip"

    try:
        dataset_dir.mkdir(parents=True)

        # Stream zip to disk while checking size
        content = await file.read()
        if len(content) > _MAX_ZIP_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="ZIP file exceeds 2 GB limit")

        zip_tmp.write_bytes(content)

        # Validate and extract
        try:
            with zipfile.ZipFile(zip_tmp, "r") as zf:
                # Guard against zip-slip path traversal
                for member in zf.namelist():
                    member_path = (dataset_dir / member).resolve()
                    if not str(member_path).startswith(str(dataset_dir.resolve())):
                        raise HTTPException(
                            status_code=400,
                            detail="ZIP contains unsafe paths (zip-slip detected)",
                        )
                zf.extractall(dataset_dir)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file")
        finally:
            if zip_tmp.exists():
                zip_tmp.unlink()

        # Locate data.yaml (search recursively)
        yaml_files = list(dataset_dir.rglob("data.yaml"))
        if not yaml_files:
            raise HTTPException(
                status_code=422,
                detail="data.yaml not found in the uploaded dataset. "
                       "Ensure the ZIP follows YOLO format.",
            )

        data_yaml_path = yaml_files[0]
        logger.info(
            "Dataset %s uploaded successfully | data.yaml=%s", dataset_id, data_yaml_path
        )

        return {
            "dataset_id": dataset_id,
            "path": str(dataset_dir),
            "data_yaml": str(data_yaml_path),
        }

    except HTTPException:
        # Clean up partial directory on expected errors
        if dataset_dir.exists():
            shutil.rmtree(dataset_dir, ignore_errors=True)
        raise
    except Exception as exc:
        if dataset_dir.exists():
            shutil.rmtree(dataset_dir, ignore_errors=True)
        logger.error("Dataset upload failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
