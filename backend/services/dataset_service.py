"""
Dataset service — server-side helpers for dataset preparation.

These functions are called by the job router / job manager (before spawning the
training worker).  They perform path validation and early-rejection so the
client receives a meaningful HTTP error instead of a silent FAILED job.

The same logic is duplicated as private functions inside
``workers/train_worker.py`` because that script must be self-contained and
cannot import from the backend application.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import List, Optional

import yaml

logger = logging.getLogger(__name__)

_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

# Per-job work directory (backend/jobs/{job_id}/)
_BACKEND_DIR = Path(__file__).parent.parent
_JOBS_DIR = _BACKEND_DIR / "jobs"


# ---------------------------------------------------------------------------
# Class name resolution
# ---------------------------------------------------------------------------


def read_dataset_classes(dataset_path: Path) -> List[str]:
    """Return class names from a dataset directory.

    Resolution order:
    1. ``classes.txt`` at the dataset root (one name per line).
    2. Any ``classes.txt`` found recursively (shallowest first).
    3. Any ``data.yaml`` found recursively (shallowest first), reading ``names``.
    """
    # 1. Root-level classes.txt
    root_txt = dataset_path / "classes.txt"
    if root_txt.is_file():
        names = [l.strip() for l in root_txt.read_text(encoding="utf-8").splitlines() if l.strip()]
        if names:
            return names

    # 2. Recursive classes.txt
    for p in sorted(dataset_path.rglob("classes.txt"), key=lambda x: len(x.parts)):
        names = [l.strip() for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
        if names:
            return names

    # 3. data.yaml
    for p in sorted(dataset_path.rglob("data.yaml"), key=lambda x: len(x.parts)):
        try:
            with p.open("r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            if not isinstance(data, dict):
                continue
            raw = data.get("names", [])
            if isinstance(raw, list) and raw:
                return [str(n) for n in raw]
            if isinstance(raw, dict) and raw:
                return [str(v) for _, v in sorted(raw.items())]
        except Exception as exc:
            logger.debug("Failed to parse %s: %s", p, exc)

    return []


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_dataset(dataset_path: Path) -> None:
    """Raise ``FileNotFoundError`` or ``ValueError`` when the dataset is invalid.

    Checks:
    * ``images/train/`` directory exists and contains at least one image.
    * Every image in ``images/train/`` has a matching ``.txt`` label file under
      ``labels/train/``.
    * If ``images/val/`` is present it also contains at least one image.
    """
    images_train = dataset_path / "images" / "train"

    if not images_train.is_dir():
        raise FileNotFoundError(
            f"images/train/ not found in dataset: {dataset_path}. "
            "Expected layout: images/train/, images/val/, labels/train/, labels/val/"
        )

    image_files = [
        f for f in images_train.iterdir()
        if f.is_file() and f.suffix.lower() in _IMAGE_SUFFIXES
    ]

    if not image_files:
        raise FileNotFoundError(
            f"No image files found under {images_train}. "
            f"Supported extensions: {sorted(_IMAGE_SUFFIXES)}"
        )

    # Label-image correspondence
    labels_train = dataset_path / "labels" / "train"
    if labels_train.is_dir():
        label_stems = {f.stem for f in labels_train.iterdir() if f.suffix == ".txt"}
        image_stems = {f.stem for f in image_files}
        missing = image_stems - label_stems
        if missing:
            sample = sorted(missing)[:5]
            raise FileNotFoundError(
                f"{len(missing)} image(s) in images/train/ have no matching label in "
                f"labels/train/. Examples: {sample}"
                + (f" (and {len(missing) - 5} more)" if len(missing) > 5 else "")
            )
    else:
        logger.warning(
            "labels/train/ not found under %s — proceeding without label validation.",
            dataset_path,
        )

    # Val set (optional)
    images_val = dataset_path / "images" / "val"
    if images_val.is_dir():
        val_images = [
            f for f in images_val.iterdir()
            if f.is_file() and f.suffix.lower() in _IMAGE_SUFFIXES
        ]
        if not val_images:
            logger.warning(
                "images/val/ exists but contains no image files under %s — "
                "YOLO validation phase will be skipped.",
                dataset_path,
            )


# ---------------------------------------------------------------------------
# Dataset isolation (copy)
# ---------------------------------------------------------------------------


def prepare_dataset(job_id: str, dataset_source: str) -> Path:
    """Copy *dataset_source* into ``jobs/{job_id}/dataset/`` and return the path.

    Args:
        job_id: The unique job identifier.
        dataset_source: Absolute path to the source dataset directory.

    Returns:
        The absolute ``Path`` of the isolated copy at
        ``backend/jobs/{job_id}/dataset/``.

    Raises:
        FileNotFoundError: When *dataset_source* does not exist.
    """
    src = Path(dataset_source)
    if not src.is_dir():
        raise FileNotFoundError(f"Dataset source directory not found: {src}")

    dst = _JOBS_DIR / job_id / "dataset"

    # Clean up a potentially stale copy from a previous (failed) attempt
    if dst.exists():
        shutil.rmtree(dst)

    shutil.copytree(src, dst)
    logger.info("Dataset copied: %s -> %s", src, dst)
    return dst


# ---------------------------------------------------------------------------
# runtime.yaml generation
# ---------------------------------------------------------------------------


def create_runtime_yaml(job_id: str, job_dataset_path: Path) -> Path:
    """Generate ``runtime.yaml`` with absolute paths next to the dataset copy.

    The file is written to ``jobs/{job_id}/runtime.yaml`` (one level above
    ``dataset/``), and uses absolute paths so it is always portable within the
    same machine even when the working directory changes.

    Args:
        job_id: The unique job identifier (used only for the output path).
        job_dataset_path: Absolute ``Path`` to ``jobs/{job_id}/dataset/``.

    Returns:
        Absolute ``Path`` to the generated ``runtime.yaml``.
    """
    train_dir = (job_dataset_path / "images" / "train").resolve()
    val_candidate = job_dataset_path / "images" / "val"
    val_dir = val_candidate.resolve() if val_candidate.is_dir() else train_dir

    classes = read_dataset_classes(job_dataset_path)
    if not classes:
        logger.warning(
            "No class names found in dataset %s — using placeholder ['object']",
            job_dataset_path,
        )
        classes = ["object"]

    runtime_data = {
        "path": str(job_dataset_path.resolve()),
        "train": str(train_dir),
        "val": str(val_dir),
        "nc": len(classes),
        "names": classes,
    }

    runtime_path = _JOBS_DIR / job_id / "runtime.yaml"
    with open(runtime_path, "w", encoding="utf-8") as fh:
        yaml.dump(runtime_data, fh, allow_unicode=True, default_flow_style=False)

    logger.info("runtime.yaml written: %s  (nc=%d  classes=%s)", runtime_path, len(classes), classes)
    return runtime_path


# ---------------------------------------------------------------------------
# Convenience: full preparation pipeline
# ---------------------------------------------------------------------------


def prepare_job_dataset(job_id: str, dataset_source: str) -> Optional[str]:
    """Run the full dataset preparation pipeline and return the path to runtime.yaml.

    Steps:
    1. Copy dataset source to ``jobs/{job_id}/dataset/``
    2. Validate structure (raises on error)
    3. Generate ``jobs/{job_id}/runtime.yaml``

    Returns the absolute path of ``runtime.yaml`` as a string, or raises on
    any failure.
    """
    job_dataset_path = prepare_dataset(job_id, dataset_source)
    validate_dataset(job_dataset_path)
    runtime_yaml = create_runtime_yaml(job_id, job_dataset_path)
    return str(runtime_yaml)
