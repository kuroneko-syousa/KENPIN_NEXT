#!/usr/bin/env python
"""
YOLO Training Worker
====================
Standalone script invoked inside a venv by the job manager:

    /envs/yolo_8.0.0/bin/python train_worker.py <params_path>

This script is intentionally self-contained — it MUST NOT import
anything from the parent backend application.

Args
----
params_path : str
    Absolute path to a JSON file written by JobManager.submit_job().
    Expected keys (new portable mode):
        job_id, model, dataset_source_path, epochs, imgsz, batch,
        name, patience, optimizer, lr0, lrf, device, progress_path

    Legacy keys (still supported for backward compatibility):
        data_yaml  — used directly when dataset_source_path is absent

Dataset preparation (when dataset_source_path is provided)
----------------------------------------------------------
1. Copy ``dataset_source_path`` → ``backend/jobs/{job_id}/dataset/``
2. Validate: images/train/ exists and contains images; labels match.
3. Generate ``backend/jobs/{job_id}/runtime.yaml`` with absolute paths.
4. Pass ``runtime.yaml`` to ``model.train(data=...)``.

This guarantees:
* Training images are never lost when the user navigates tabs.
* ``data.yaml`` contains absolute paths → no CWD dependency.
* Each job is isolated; reruns use the same copy.

Progress protocol
-----------------
The worker writes a progress.json file at progress_path after every epoch
and on completion/failure.  The job manager polls this file every ~2 s.

Schema::

    {
      "progress": 0-100,        # int
      "log": "Epoch 1/50 ...",  # latest log line   (optional)
      "error": "...",           # set on exception  (optional)
      "results_path": "..."     # set on completion (optional)
    }

Exit codes
----------
0  — training completed successfully
1  — training failed (error written to progress.json)
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Progress helpers
# ---------------------------------------------------------------------------

_progress_path: Path | None = None


def _write_progress(
    progress: int,
    *,
    log: str | None = None,
    error: str | None = None,
    results_path: str | None = None,
) -> None:
    """Overwrite progress.json with the latest status snapshot."""
    if _progress_path is None:
        return
    data: dict = {"progress": progress}
    if log is not None:
        data["log"] = log
    if error is not None:
        data["error"] = error
    if results_path is not None:
        data["results_path"] = results_path
    try:
        _progress_path.write_text(json.dumps(data), encoding="utf-8")
    except OSError:
        pass  # best-effort


# ---------------------------------------------------------------------------
# Dataset preparation (self-contained — mirrors services/dataset_service.py)
# ---------------------------------------------------------------------------

_IMAGE_SUFFIXES_SET = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def _read_dataset_classes(dataset_path: Path) -> list:
    """Return class names from dataset (classes.txt → data.yaml fallback)."""
    import yaml  # bundled with ultralytics / PyYAML dependency

    # 1. Root-level classes.txt
    root_txt = dataset_path / "classes.txt"
    if root_txt.is_file():
        names = [ln.strip() for ln in root_txt.read_text(encoding="utf-8").splitlines() if ln.strip()]
        if names:
            return names

    # 2 & 3. Recursive classes.txt then data.yaml
    for txt in sorted(dataset_path.rglob("classes.txt"), key=lambda p: len(p.parts)):
        names = [ln.strip() for ln in txt.read_text(encoding="utf-8").splitlines() if ln.strip()]
        if names:
            return names

    for yf in sorted(dataset_path.rglob("data.yaml"), key=lambda p: len(p.parts)):
        try:
            with yf.open("r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            if not isinstance(data, dict):
                continue
            raw = data.get("names", [])
            if isinstance(raw, list) and raw:
                return [str(n) for n in raw]
            if isinstance(raw, dict) and raw:
                return [str(v) for _, v in sorted(raw.items())]
        except Exception:
            continue

    return []


def _validate_dataset(dataset_path: Path) -> None:
    """Raise FileNotFoundError when the dataset structure is invalid.

    Checks:
    * images/train/ exists and is non-empty.
    * Every image in images/train/ has a matching label in labels/train/.
    * images/val/ (if present) is non-empty.
    """
    images_train = dataset_path / "images" / "train"

    if not images_train.is_dir():
        raise FileNotFoundError(
            f"images/train/ not found in dataset: {dataset_path}. "
            "Expected layout: images/train/, images/val/, labels/train/, labels/val/"
        )

    image_files = [
        f for f in images_train.iterdir()
        if f.is_file() and f.suffix.lower() in _IMAGE_SUFFIXES_SET
    ]
    if not image_files:
        raise FileNotFoundError(
            f"No image files found under {images_train}. "
            f"Supported extensions: {sorted(_IMAGE_SUFFIXES_SET)}"
        )

    # Label-image correspondence
    labels_train = dataset_path / "labels" / "train"
    if labels_train.is_dir():
        label_stems = {f.stem for f in labels_train.iterdir() if f.suffix == ".txt"}
        image_stems = {f.stem for f in image_files}
        missing = image_stems - label_stems
        if missing:
            sample = sorted(missing)[:5]
            extras = f" (and {len(missing) - 5} more)" if len(missing) > 5 else ""
            raise FileNotFoundError(
                f"{len(missing)} image(s) in images/train/ have no matching label in "
                f"labels/train/. Examples: {sample}{extras}"
            )
    else:
        _write_progress(0, log="[WARN] labels/train/ not found — proceeding without label validation")

    # Optional val set
    images_val = dataset_path / "images" / "val"
    if images_val.is_dir():
        val_files = [
            f for f in images_val.iterdir()
            if f.is_file() and f.suffix.lower() in _IMAGE_SUFFIXES_SET
        ]
        if not val_files:
            _write_progress(0, log="[WARN] images/val/ exists but contains no images — val phase will be skipped")


def _prepare_dataset(job_id: str, dataset_source: str, backend_dir: Path) -> Path:
    """Copy *dataset_source* → ``backend/jobs/{job_id}/dataset/``.

    Raises FileNotFoundError if the source directory does not exist.
    Returns the Path of the isolated copy.
    """
    src = Path(dataset_source)
    if not src.is_dir():
        raise FileNotFoundError(f"Dataset source directory not found: {src}")

    dst = backend_dir / "jobs" / job_id / "dataset"
    if dst.exists():
        shutil.rmtree(dst)  # clean stale copy from a previous failed run
    shutil.copytree(src, dst)
    return dst


def _create_runtime_yaml(job_id: str, job_dataset_path: Path, backend_dir: Path) -> Path:
    """Write ``backend/jobs/{job_id}/runtime.yaml`` with absolute paths.

    Returns the Path of the generated runtime.yaml.
    """
    import yaml  # PyYAML is a transitive dependency of ultralytics

    train_dir = (job_dataset_path / "images" / "train").resolve()
    val_candidate = job_dataset_path / "images" / "val"
    val_dir = val_candidate.resolve() if val_candidate.is_dir() else train_dir

    classes = _read_dataset_classes(job_dataset_path)
    if not classes:
        _write_progress(0, log="[WARN] No class names found — using placeholder ['object']")
        classes = ["object"]

    runtime_data = {
        "path": str(job_dataset_path.resolve()),
        "train": str(train_dir),
        "val": str(val_dir),
        "nc": len(classes),
        "names": classes,
    }

    runtime_path = backend_dir / "jobs" / job_id / "runtime.yaml"
    with open(runtime_path, "w", encoding="utf-8") as fh:
        yaml.dump(runtime_data, fh, allow_unicode=True, default_flow_style=False)

    return runtime_path


# ---------------------------------------------------------------------------
# Device detection
# ---------------------------------------------------------------------------

def _resolve_device(requested: str) -> str:
    """Map 'auto' → 'cuda'/'cpu'; validate explicit requests."""
    try:
        import torch  # type: ignore[import-untyped]
    except ImportError:
        return "cpu"

    req = (requested or "auto").lower().strip()
    if req == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if req == "cuda" and not torch.cuda.is_available():
        _write_progress(0, log="[WARN] CUDA not available — falling back to CPU")
        return "cpu"
    return req


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def _train(params: dict) -> None:
    from ultralytics import YOLO  # type: ignore[import-untyped]

    job_id: str = params["job_id"]
    model_key: str = params["model"]
    epochs: int = int(params.get("epochs", 50))
    imgsz: int = int(params.get("imgsz", 640))
    batch: int = int(params.get("batch", 16))
    name: str = str(params.get("name", "exp"))
    patience: int = int(params.get("patience", 50))
    optimizer: str = str(params.get("optimizer", "auto"))
    lr0: float = float(params.get("lr0", 0.01))
    lrf: float = float(params.get("lrf", 0.01))

    device = _resolve_device(params.get("device", "auto"))

    # backend/ root (two levels up from workers/train_worker.py)
    backend_dir = Path(__file__).parent.parent

    # ------------------------------------------------------------------
    # Dataset preparation
    # New portable mode: dataset_source_path → copy → validate → runtime.yaml
    # Legacy mode: data_yaml used directly (no copy, no validation)
    # ------------------------------------------------------------------
    dataset_source_path: str | None = params.get("dataset_source_path")

    if dataset_source_path:
        _write_progress(0, log=f"[INFO] Preparing dataset from: {dataset_source_path}")

        # Step ①: Isolate dataset in a per-job directory
        try:
            job_dataset_path = _prepare_dataset(job_id, dataset_source_path, backend_dir)
        except FileNotFoundError as exc:
            raise FileNotFoundError(
                f"Dataset preparation failed: {exc}. "
                "Ensure the dataset directory still exists and has not been moved."
            ) from exc
        _write_progress(5, log=f"[INFO] Dataset copied to: {job_dataset_path}")

        # Step ②: Validate structure and image-label correspondence
        _validate_dataset(job_dataset_path)
        _write_progress(8, log="[INFO] Dataset validated OK")

        # Step ③: Generate runtime.yaml with absolute paths
        runtime_yaml_path = _create_runtime_yaml(job_id, job_dataset_path, backend_dir)
        data_yaml = str(runtime_yaml_path)
        _write_progress(10, log=f"[INFO] runtime.yaml created: {data_yaml}")

    else:
        # Legacy fallback: use data_yaml directly
        data_yaml = str(params.get("data_yaml", ""))
        if not data_yaml:
            raise ValueError(
                "Neither dataset_source_path nor data_yaml was provided in job params. "
                "Provide dataset_source_path for reliable portable training."
            )
        if not Path(data_yaml).is_file():
            raise FileNotFoundError(
                f"data.yaml not found: {data_yaml}. "
                "Provide dataset_source_path to enable automatic dataset isolation."
            )
        _write_progress(0, log=f"[INFO] Legacy mode — using data_yaml directly: {data_yaml}")

    _write_progress(10, log=f"[INFO] device={device}  model={model_key}  epochs={epochs}")

    # Build project/name so results land in backend/runs/train/<name>
    project = str(backend_dir / "runs" / "train")

    model = YOLO(model_key)

    # ------------------------------------------------------------------
    # Epoch callback — updates progress.json after each epoch
    # Progress range: 10 → 100 (first 10% used by dataset prep)
    # ------------------------------------------------------------------
    def _on_epoch_end(trainer) -> None:  # type: ignore[no-untyped-def]
        epoch: int = trainer.epoch + 1
        total: int = trainer.epochs
        pct = 10 + round(epoch / total * 90) if total > 0 else 10
        msg = f"Epoch {epoch}/{total} complete"
        _write_progress(pct, log=msg)

    model.add_callback("on_train_epoch_end", _on_epoch_end)

    model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=device,
        project=project,
        name=name,
        patience=patience,
        optimizer=optimizer,
        lr0=lr0,
        lrf=lrf,
        exist_ok=True,
    )

    best_weights = str(Path(project) / name / "weights" / "best.pt")
    _write_progress(100, log="Training complete", results_path=best_weights)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    global _progress_path  # noqa: PLW0603

    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <params_path>", file=sys.stderr)
        sys.exit(1)

    params_path = Path(sys.argv[1])
    if not params_path.exists():
        print(f"params file not found: {params_path}", file=sys.stderr)
        sys.exit(1)

    params: dict = json.loads(params_path.read_text(encoding="utf-8"))
    _progress_path = Path(params["progress_path"])

    _write_progress(0, log="[INFO] Worker started")

    try:
        _train(params)
    except Exception as exc:  # noqa: BLE001
        err_msg = f"{type(exc).__name__}: {exc}"
        _write_progress(0, error=err_msg)
        print(f"[ERROR] {err_msg}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
