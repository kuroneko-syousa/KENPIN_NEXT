"""
Dataset router.

Endpoints
---------
  POST   /datasets/upload           Upload YOLO dataset zip (global dataset registry)
  GET    /datasets                  List datasets (uploaded + workspace-generated)
  GET    /datasets/{id}             Get one dataset detail
  POST   /datasets/{id}/lock        Lock/unlock delete protection
  POST   /datasets/{id}/share       Add/remove shared user email
  DELETE /datasets/{id}             Delete dataset folder (when unlocked)
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import yaml
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/datasets", tags=["Datasets"])

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_WORKSPACE_DIR = _BACKEND_DIR.parent
DATASETS_DIR = _BACKEND_DIR / "datasets"
WORKSPACE_DATASETS_ROOT = _WORKSPACE_DIR / "tmp" / "workspaces"
_DATA_PATH = _BACKEND_DIR / "data"
_DATASET_META_PATH = _DATA_PATH / "datasets_meta.json"
_META_LOCK = threading.Lock()

DATASETS_DIR.mkdir(parents=True, exist_ok=True)
_DATA_PATH.mkdir(parents=True, exist_ok=True)

_MAX_ZIP_SIZE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


class DatasetInfo(BaseModel):
    dataset_id: str
    workspace_id: Optional[str] = None
    source: str = Field(default="uploaded", description="uploaded | workspace")
    image_count: int
    classes: List[str]
    created_at: datetime
    data_yaml: Optional[str] = None
    path: str
    locked: bool = False
    shared_with: List[str] = Field(default_factory=list)


class DatasetLockRequest(BaseModel):
    locked: bool


class DatasetShareRequest(BaseModel):
    email: str
    revoke: bool = False


class DatasetSampleImage(BaseModel):
    id: str
    file_name: str
    image_path: str
    split: Optional[str] = None


def _load_meta() -> Dict[str, Dict[str, object]]:
    with _META_LOCK:
        if not _DATASET_META_PATH.exists():
            return {}
        try:
            raw = json.loads(_DATASET_META_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return raw
        except (json.JSONDecodeError, OSError):
            pass
        return {}


def _save_meta(meta: Dict[str, Dict[str, object]]) -> None:
    payload = json.dumps(meta, ensure_ascii=False, indent=2)
    with _META_LOCK:
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=_DATASET_META_PATH.parent,
            suffix=".tmp",
            prefix="datasets_meta_",
        )
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
                fh.write(payload)
            os.replace(tmp_path, _DATASET_META_PATH)
        finally:
            try:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
            except OSError:
                pass


def _workspace_dataset_id(workspace_id: str) -> str:
    return f"ws-{workspace_id}"


def _count_images(dataset_dir: Path) -> int:
    count = 0
    try:
        for p in dataset_dir.rglob("*"):
            if p.is_file() and p.suffix.lower() in _IMAGE_SUFFIXES:
                if any(part.startswith("_") or part.startswith(".") for part in p.parts):
                    continue
                count += 1
    except OSError as exc:
        logger.warning("Image count failed for %s: %s", dataset_dir, exc)
    return count


def _read_classes_txt(classes_txt: Path) -> List[str]:
    try:
        return [
            line.strip()
            for line in classes_txt.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    except OSError:
        return []


def _read_classes_yaml(data_yaml_path: Path) -> List[str]:
    try:
        with data_yaml_path.open("r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        if not isinstance(data, dict):
            return []
        names = data.get("names", [])
        if isinstance(names, list):
            return [str(v) for v in names]
        if isinstance(names, dict):
            return [str(v) for _, v in sorted(names.items())]
    except Exception:
        pass
    return []


def _get_classes(dataset_dir: Path) -> List[str]:
    root_classes = dataset_dir / "classes.txt"
    if root_classes.is_file():
        classes = _read_classes_txt(root_classes)
        if classes:
            return classes

    txt_candidates = sorted(dataset_dir.rglob("classes.txt"), key=lambda p: len(p.parts))
    for p in txt_candidates:
        classes = _read_classes_txt(p)
        if classes:
            return classes

    yaml_candidates = sorted(dataset_dir.rglob("data.yaml"), key=lambda p: len(p.parts))
    for p in yaml_candidates:
        classes = _read_classes_yaml(p)
        if classes:
            return classes
    return []


def _parse_dataset_folder(
    dataset_dir: Path,
    *,
    dataset_id: str,
    workspace_id: Optional[str],
    source: str,
    meta: Dict[str, Dict[str, object]],
) -> DatasetInfo:
    try:
        created_at = datetime.fromtimestamp(dataset_dir.stat().st_ctime, tz=timezone.utc)
    except OSError:
        created_at = datetime.now(timezone.utc)

    yaml_files = sorted(dataset_dir.rglob("data.yaml"), key=lambda p: len(p.parts))
    data_yaml = str(yaml_files[0].resolve()) if yaml_files else None

    meta_row = meta.get(dataset_id, {})
    locked = bool(meta_row.get("locked", False))
    raw_shared = meta_row.get("shared_with", [])
    shared_with = [str(v) for v in raw_shared] if isinstance(raw_shared, list) else []

    return DatasetInfo(
        dataset_id=dataset_id,
        workspace_id=workspace_id,
        source=source,
        image_count=_count_images(dataset_dir),
        classes=_get_classes(dataset_dir),
        created_at=created_at,
        data_yaml=data_yaml,
        path=str(dataset_dir.resolve()),
        locked=locked,
        shared_with=shared_with,
    )


def _collect_workspace_dataset_dirs() -> List[Tuple[str, Path]]:
    if not WORKSPACE_DATASETS_ROOT.is_dir():
        return []

    rows: List[Tuple[str, Path]] = []
    for ws_dir in WORKSPACE_DATASETS_ROOT.iterdir():
        if not ws_dir.is_dir():
            continue
        dataset_dir = ws_dir / "dataset"
        if dataset_dir.is_dir():
            rows.append((ws_dir.name, dataset_dir))
    return rows


def _resolve_dataset(dataset_id: str) -> Tuple[Path, Optional[str], str]:
    if ".." in dataset_id or "/" in dataset_id or "\\" in dataset_id:
        raise HTTPException(status_code=400, detail="Invalid dataset_id")

    # Workspace-generated dataset id format: ws-{workspace_id}
    if dataset_id.startswith("ws-"):
        workspace_id = dataset_id[3:]
        target = WORKSPACE_DATASETS_ROOT / workspace_id / "dataset"
        if target.is_dir():
            return target, workspace_id, "workspace"
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")

    # Uploaded dataset
    target = DATASETS_DIR / dataset_id
    if target.is_dir():
        return target, None, "uploaded"
    raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")


def _collect_sample_images(dataset_dir: Path, limit: int) -> List[DatasetSampleImage]:
    rows: List[DatasetSampleImage] = []

    def append_from_dir(base: Path, split: Optional[str]) -> None:
        if not base.is_dir() or len(rows) >= limit:
            return
        for p in sorted(base.iterdir(), key=lambda v: v.name.lower()):
            if len(rows) >= limit:
                return
            if not p.is_file() or p.suffix.lower() not in _IMAGE_SUFFIXES:
                continue
            rel = p.relative_to(dataset_dir).as_posix()
            rows.append(
                DatasetSampleImage(
                    id=f"{split or 'root'}:{rel}",
                    file_name=p.name,
                    image_path=rel,
                    split=split,
                )
            )

    # Prefer train/val splits first for stable and representative preview.
    append_from_dir(dataset_dir / "images" / "train", "train")
    append_from_dir(dataset_dir / "images" / "val", "val")
    append_from_dir(dataset_dir / "images" / "test", "test")

    if len(rows) < limit:
        # Fallback: scan the dataset root recursively.
        for p in sorted(dataset_dir.rglob("*"), key=lambda v: str(v).lower()):
            if len(rows) >= limit:
                break
            if not p.is_file() or p.suffix.lower() not in _IMAGE_SUFFIXES:
                continue
            rel = p.relative_to(dataset_dir).as_posix()
            if any(r.image_path == rel for r in rows):
                continue
            rows.append(
                DatasetSampleImage(
                    id=f"scan:{rel}",
                    file_name=p.name,
                    image_path=rel,
                    split=None,
                )
            )

    return rows


@router.post("/upload", summary="Upload a YOLO-format dataset as a ZIP file")
async def upload_dataset(
    file: UploadFile = File(
        ...,
        description="ZIP archive containing a YOLO dataset (must include data.yaml)",
    ),
):
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")

    dataset_id = str(uuid.uuid4())
    dataset_dir = DATASETS_DIR / dataset_id
    zip_tmp = dataset_dir / "_upload.zip"

    try:
        dataset_dir.mkdir(parents=True)
        content = await file.read()
        if len(content) > _MAX_ZIP_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="ZIP file exceeds 2 GB limit")
        zip_tmp.write_bytes(content)

        try:
            with zipfile.ZipFile(zip_tmp, "r") as zf:
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

        yaml_files = list(dataset_dir.rglob("data.yaml"))
        if not yaml_files:
            raise HTTPException(
                status_code=422,
                detail="data.yaml not found in uploaded dataset",
            )

        logger.info("Dataset %s uploaded", dataset_id)
        return {
            "dataset_id": dataset_id,
            "path": str(dataset_dir.resolve()),
            "data_yaml": str(yaml_files[0].resolve()),
        }
    except HTTPException:
        if dataset_dir.exists():
            shutil.rmtree(dataset_dir, ignore_errors=True)
        raise
    except Exception as exc:
        if dataset_dir.exists():
            shutil.rmtree(dataset_dir, ignore_errors=True)
        logger.error("Dataset upload failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/",
    response_model=List[DatasetInfo],
    summary="List datasets (uploaded + workspace-generated)",
)
def list_datasets() -> List[DatasetInfo]:
    meta = _load_meta()
    results: List[DatasetInfo] = []

    # Uploaded datasets under backend/datasets/*
    if DATASETS_DIR.is_dir():
        for entry in DATASETS_DIR.iterdir():
            if not entry.is_dir() or entry.name.startswith(".") or entry.name.startswith("_"):
                continue
            try:
                results.append(
                    _parse_dataset_folder(
                        entry,
                        dataset_id=entry.name,
                        workspace_id=None,
                        source="uploaded",
                        meta=meta,
                    )
                )
            except Exception as exc:
                logger.warning("Skipping dataset %s: %s", entry.name, exc)

    # Workspace-generated datasets under tmp/workspaces/{workspaceId}/dataset
    for workspace_id, dataset_dir in _collect_workspace_dataset_dirs():
        dataset_id = _workspace_dataset_id(workspace_id)
        try:
            results.append(
                _parse_dataset_folder(
                    dataset_dir,
                    dataset_id=dataset_id,
                    workspace_id=workspace_id,
                    source="workspace",
                    meta=meta,
                )
            )
        except Exception as exc:
            logger.warning("Skipping workspace dataset %s: %s", dataset_id, exc)

    results.sort(key=lambda d: d.created_at, reverse=True)
    return results


@router.get(
    "/{dataset_id}",
    response_model=DatasetInfo,
    summary="Get details of a single dataset",
)
def get_dataset(dataset_id: str) -> DatasetInfo:
    dataset_dir, workspace_id, source = _resolve_dataset(dataset_id)
    meta = _load_meta()
    try:
        return _parse_dataset_folder(
            dataset_dir,
            dataset_id=dataset_id,
            workspace_id=workspace_id,
            source=source,
            meta=meta,
        )
    except Exception as exc:
        logger.error("Failed to parse dataset %s: %s", dataset_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read dataset")


@router.get(
    "/{dataset_id}/samples",
    response_model=List[DatasetSampleImage],
    summary="List sample images for dataset preview",
)
def list_dataset_samples(
    dataset_id: str,
    limit: int = Query(6, ge=1, le=30),
) -> List[DatasetSampleImage]:
    dataset_dir, _workspace_id, _source = _resolve_dataset(dataset_id)
    return _collect_sample_images(dataset_dir, limit)


@router.get(
    "/{dataset_id}/images/{image_path:path}",
    response_class=FileResponse,
    summary="Serve one dataset image",
)
def get_dataset_image(dataset_id: str, image_path: str) -> FileResponse:
    if not image_path or ".." in image_path:
        raise HTTPException(status_code=400, detail="Invalid image path")

    dataset_dir, _workspace_id, _source = _resolve_dataset(dataset_id)
    target = (dataset_dir / image_path).resolve()
    dataset_root = dataset_dir.resolve()

    if not target.is_relative_to(dataset_root):
        raise HTTPException(status_code=400, detail="Invalid image path")
    if not target.is_file() or target.suffix.lower() not in _IMAGE_SUFFIXES:
        raise HTTPException(status_code=404, detail="Image not found")

    suffix = target.suffix.lower()
    media_type = "image/jpeg"
    if suffix == ".png":
        media_type = "image/png"
    elif suffix == ".webp":
        media_type = "image/webp"
    elif suffix in {".bmp"}:
        media_type = "image/bmp"
    elif suffix in {".tif", ".tiff"}:
        media_type = "image/tiff"

    return FileResponse(path=str(target), media_type=media_type)


@router.post(
    "/{dataset_id}/lock",
    response_model=DatasetInfo,
    summary="Lock or unlock a dataset",
)
def lock_dataset(dataset_id: str, req: DatasetLockRequest) -> DatasetInfo:
    dataset_dir, workspace_id, source = _resolve_dataset(dataset_id)
    meta = _load_meta()
    row = meta.setdefault(dataset_id, {})
    row["locked"] = bool(req.locked)
    _save_meta(meta)
    return _parse_dataset_folder(
        dataset_dir,
        dataset_id=dataset_id,
        workspace_id=workspace_id,
        source=source,
        meta=meta,
    )


@router.post(
    "/{dataset_id}/share",
    response_model=DatasetInfo,
    summary="Share dataset with another user email",
)
def share_dataset(dataset_id: str, req: DatasetShareRequest) -> DatasetInfo:
    dataset_dir, workspace_id, source = _resolve_dataset(dataset_id)
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required")

    meta = _load_meta()
    row = meta.setdefault(dataset_id, {})
    shared = row.get("shared_with", [])
    share_list = [str(v).lower() for v in shared] if isinstance(shared, list) else []

    if req.revoke:
        share_list = [v for v in share_list if v != email]
    else:
        if email not in share_list:
            share_list.append(email)

    row["shared_with"] = sorted(set(share_list))
    _save_meta(meta)

    return _parse_dataset_folder(
        dataset_dir,
        dataset_id=dataset_id,
        workspace_id=workspace_id,
        source=source,
        meta=meta,
    )


@router.delete(
    "/{dataset_id}",
    status_code=204,
    summary="Delete a dataset (requires unlocked state)",
)
def delete_dataset(dataset_id: str) -> None:
    dataset_dir, _workspace_id, _source = _resolve_dataset(dataset_id)
    meta = _load_meta()
    row = meta.get(dataset_id, {})
    if bool(row.get("locked", False)):
        raise HTTPException(
            status_code=423,
            detail=f"Dataset '{dataset_id}' is locked. Unlock it before deleting.",
        )

    try:
        shutil.rmtree(dataset_dir)
    except OSError as exc:
        logger.error("Failed to delete dataset %s: %s", dataset_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete dataset")

    if dataset_id in meta:
        meta.pop(dataset_id, None)
        _save_meta(meta)
