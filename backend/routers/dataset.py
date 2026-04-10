"""
Dataset router.
  POST /datasets/upload  → accept a YOLO-format zip, unzip it, validate data.yaml
  GET  /datasets         → list all datasets (sorted by created_at DESC)
  GET  /datasets/{id}    → get a single dataset detail
"""

import logging
import shutil
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import yaml
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/datasets", tags=["Datasets"])

DATASETS_DIR = Path("datasets")
DATASETS_DIR.mkdir(exist_ok=True)

_MAX_ZIP_SIZE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB hard limit

# Image file extensions counted as "images" in a dataset
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------


class DatasetInfo(BaseModel):
    """Summary information about a single dataset directory."""

    dataset_id: str
    image_count: int
    classes: List[str]
    created_at: datetime
    data_yaml: Optional[str] = None
    path: str


# ---------------------------------------------------------------------------
# Folder-analysis helpers
# ---------------------------------------------------------------------------


def _count_images(dataset_dir: Path) -> int:
    """Recursively count all image files inside *dataset_dir*.

    Skips any file whose path component starts with ``_`` (e.g., ``_upload.zip``
    temporary files) and skips hidden folders.
    """
    count = 0
    try:
        for p in dataset_dir.rglob("*"):
            if p.is_file() and p.suffix.lower() in _IMAGE_SUFFIXES:
                # Skip temporary / hidden entries
                if any(part.startswith("_") or part.startswith(".") for part in p.parts):
                    continue
                count += 1
    except OSError as exc:
        logger.warning("Image-count walk failed for %s: %s", dataset_dir, exc)
    return count


def _read_classes_txt(classes_txt: Path) -> List[str]:
    """Parse a ``classes.txt`` file (one class name per line)."""
    try:
        lines = classes_txt.read_text(encoding="utf-8").splitlines()
        return [line.strip() for line in lines if line.strip()]
    except OSError:
        return []


def _read_classes_yaml(data_yaml_path: Path) -> List[str]:
    """Extract class names from a YOLO ``data.yaml``.

    Handles both list form ``names: [cat, dog]`` and dict form
    ``names: {0: cat, 1: dog}``.
    """
    try:
        with data_yaml_path.open("r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        if not isinstance(data, dict):
            return []
        names = data.get("names", [])
        if isinstance(names, list):
            return [str(n) for n in names]
        if isinstance(names, dict):
            # Keys are integer class indices; return values in sorted key order
            return [str(v) for _, v in sorted(names.items())]
    except Exception as exc:
        logger.debug("Failed to parse %s for classes: %s", data_yaml_path, exc)
    return []


def _get_classes(dataset_dir: Path) -> List[str]:
    """Return class names for a dataset, trying multiple sources in order:

    1. ``classes.txt`` at the dataset root
    2. Any ``classes.txt`` found recursively (first match, shallowest path)
    3. Any ``data.yaml`` found recursively (first match, shallowest path)
    """
    # 1. Root-level classes.txt
    root_classes_txt = dataset_dir / "classes.txt"
    if root_classes_txt.is_file():
        classes = _read_classes_txt(root_classes_txt)
        if classes:
            return classes

    # 2. Recursive classes.txt (sorted by depth for determinism)
    candidates = sorted(dataset_dir.rglob("classes.txt"), key=lambda p: len(p.parts))
    for p in candidates:
        classes = _read_classes_txt(p)
        if classes:
            return classes

    # 3. Recursive data.yaml
    yaml_candidates = sorted(dataset_dir.rglob("data.yaml"), key=lambda p: len(p.parts))
    for p in yaml_candidates:
        classes = _read_classes_yaml(p)
        if classes:
            return classes

    return []


def _parse_dataset_folder(dataset_dir: Path) -> DatasetInfo:
    """Derive a :class:`DatasetInfo` from the contents of *dataset_dir*.

    ``created_at`` is taken from the directory's ``st_ctime`` (creation time on
    Windows, inode-change time on POSIX).
    """
    dataset_id = dataset_dir.name

    try:
        stat = dataset_dir.stat()
        created_at = datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc)
    except OSError:
        created_at = datetime.now(timezone.utc)

    image_count = _count_images(dataset_dir)
    classes = _get_classes(dataset_dir)

    # Resolve data.yaml path (first match, shallowest)
    yaml_files = sorted(dataset_dir.rglob("data.yaml"), key=lambda p: len(p.parts))
    data_yaml = str(yaml_files[0].resolve()) if yaml_files else None

    return DatasetInfo(
        dataset_id=dataset_id,
        image_count=image_count,
        classes=classes,
        created_at=created_at,
        data_yaml=data_yaml,
        path=str(dataset_dir.resolve()),
    )


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


# ---------------------------------------------------------------------------
# GET /datasets  — list all datasets
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=List[DatasetInfo],
    summary="List all datasets (newest first)",
)
def list_datasets() -> List[DatasetInfo]:
    """
    Scans the ``datasets/`` directory and returns one :class:`DatasetInfo`
    record per dataset folder, sorted by **created_at descending**.

    Each record includes:
    - ``image_count`` — total image files found recursively
    - ``classes`` — class names read from ``classes.txt`` or ``data.yaml``
    - ``created_at`` — directory creation time (UTC)
    """
    if not DATASETS_DIR.is_dir():
        return []

    results: List[DatasetInfo] = []
    for entry in DATASETS_DIR.iterdir():
        # Skip hidden / temporary entries and plain files
        if not entry.is_dir() or entry.name.startswith(".") or entry.name.startswith("_"):
            continue
        try:
            info = _parse_dataset_folder(entry)
            results.append(info)
        except Exception as exc:
            logger.warning("Skipping dataset dir %s — parse failed: %s", entry.name, exc)

    results.sort(key=lambda d: d.created_at, reverse=True)
    return results


# ---------------------------------------------------------------------------
# GET /datasets/{dataset_id}  — single dataset detail
# ---------------------------------------------------------------------------


@router.get(
    "/{dataset_id}",
    response_model=DatasetInfo,
    summary="Get details of a single dataset",
)
def get_dataset(dataset_id: str) -> DatasetInfo:
    """
    Returns the :class:`DatasetInfo` for the dataset identified by
    *dataset_id* (the UUID folder name under ``datasets/``).

    Raises **404** when the folder does not exist.
    """
    # Guard against path-traversal attacks
    if ".." in dataset_id or "/" in dataset_id or "\\" in dataset_id:
        raise HTTPException(status_code=400, detail="Invalid dataset_id")

    dataset_dir = DATASETS_DIR / dataset_id
    if not dataset_dir.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{dataset_id}' not found",
        )

    try:
        return _parse_dataset_folder(dataset_dir)
    except Exception as exc:
        logger.error("Failed to parse dataset %s: %s", dataset_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read dataset")
