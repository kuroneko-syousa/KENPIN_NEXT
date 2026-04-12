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
import os
import shutil
import sys
import time
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
    status: str | None = None,
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
    if status is not None:
        data["status"] = status
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
    class StopTraining(Exception):
        """Raised when stop.request is detected."""

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
    stop_path_raw: str = str(params.get("stop_path", ""))
    stop_path = Path(stop_path_raw) if stop_path_raw else None

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
    print("TRAIN STARTED", flush=True)

    # Determine output directory structure
    # If workspace_dir is provided, use workspace_dir/models; otherwise use legacy backend/runs/train
    workspace_dir_raw = str(params.get("workspace_dir", ""))
    if workspace_dir_raw:
        workspace_dir = Path(workspace_dir_raw)
        models_dir = workspace_dir / "models"
        models_dir.mkdir(parents=True, exist_ok=True)
        project = str(models_dir)
        _write_progress(10, log=f"[INFO] Output directory: {project}")
    else:
        # Legacy fallback
        project = str(backend_dir / "runs" / "train")
        _write_progress(10, log=f"[INFO] Legacy output directory: {project}")

    model = YOLO(model_key)
    if stop_path is not None and stop_path.exists():
        print("STOP REQUEST DETECTED", flush=True)
        _write_progress(100, log="Training stopped by user", status="stopped")
        return

    # ------------------------------------------------------------------
    # Epoch callback — updates progress.json after each epoch (incl. val)
    # Progress range: 10 → 100 (first 10% used by dataset prep)
    # on_fit_epoch_end fires after both train AND validation, so
    # trainer.metrics contains mAP / P / R / val-loss values.
    # ------------------------------------------------------------------
    def _on_fit_epoch_end(trainer) -> None:  # type: ignore[no-untyped-def]
        if stop_path is not None and stop_path.exists():
            print("STOP REQUEST DETECTED", flush=True)
            raise StopTraining()

        epoch: int = trainer.epoch + 1
        total: int = trainer.epochs
        pct = 10 + round(epoch / total * 90) if total > 0 else 10

        # ── Training losses ──────────────────────────────────────────
        loss_names = list(getattr(trainer, "loss_names", ("box_loss", "cls_loss", "dfl_loss")))
        loss_items = getattr(trainer, "loss_items", None)
        loss_parts: list = []
        if loss_items is not None:
            try:
                for lname, lval in zip(loss_names, loss_items):
                    loss_parts.append(f"{lname}={float(lval):.4f}")
            except Exception:
                pass

        # ── Validation metrics ───────────────────────────────────────
        metrics: dict = getattr(trainer, "metrics", {}) or {}
        metric_pairs = [
            ("metrics/precision(B)", "P"),
            ("metrics/recall(B)",    "R"),
            ("metrics/mAP50(B)",     "mAP50"),
            ("metrics/mAP50-95(B)",  "mAP50-95"),
        ]
        metric_parts: list = []
        for mkey, mshort in metric_pairs:
            if mkey in metrics:
                metric_parts.append(f"{mshort}={float(metrics[mkey]):.4f}")

        # ── Learning rates ───────────────────────────────────────────
        lr: dict = getattr(trainer, "lr", {}) or {}
        lr_parts = [f"lr/pg{i}={v:.2e}" for i, v in enumerate(lr.values())]

        # ── GPU memory ───────────────────────────────────────────────
        gpu_part = ""
        try:
            import torch as _torch
            if _torch.cuda.is_available():
                mem_gb = _torch.cuda.memory_reserved() / 1e9
                gpu_part = f"GPU={mem_gb:.2f}G"
            else:
                gpu_part = "CPU"
        except Exception:
            pass

        # ── Format line ──────────────────────────────────────────────
        epoch_field = f"[Epoch {epoch}/{total}]"
        fields = [epoch_field]
        if gpu_part:
            fields.append(gpu_part)
        fields.extend(loss_parts)
        fields.extend(metric_parts)
        fields.extend(lr_parts)
        line = "  ".join(fields)

        # Print to stdout → captured to backend/logs/{job_id}.log
        print(line, flush=True)

        # ── JSON_LOG for frontend graph ──────────────────────────────
        try:
            loss_by_name: dict = {}
            if loss_items is not None:
                for lname, lval in zip(loss_names, loss_items):
                    try:
                        loss_by_name[lname] = round(float(lval), 6)
                    except Exception:
                        loss_by_name[lname] = 0.0

            lr_val = 0.0
            if hasattr(trainer, "optimizer") and trainer.optimizer:
                try:
                    lr_val = float(trainer.optimizer.param_groups[0].get("lr", 0))
                except Exception:
                    pass

            log_data = {
                "epoch": epoch,
                "total_epoch": total,
                "box_loss": loss_by_name.get("box_loss", 0.0),
                "cls_loss": loss_by_name.get("cls_loss", 0.0),
                "dfl_loss": loss_by_name.get("dfl_loss", 0.0),
                "map50":    round(float(metrics.get("metrics/mAP50(B)",     0) or 0), 6),
                "map":      round(float(metrics.get("metrics/mAP50-95(B)",  0) or 0), 6),
                "precision":round(float(metrics.get("metrics/precision(B)", 0) or 0), 6),
                "recall":   round(float(metrics.get("metrics/recall(B)",    0) or 0), 6),
                "lr": round(lr_val, 8),
            }
            print("JSON_LOG:" + json.dumps(log_data), flush=True)
        except Exception:
            pass

        # progress.json summary (used by job-list UI)
        summary = f"Epoch {epoch}/{total}"
        if metric_parts:
            summary += "  " + "  ".join(metric_parts)
        _write_progress(pct, log=summary)

    model.add_callback("on_fit_epoch_end", _on_fit_epoch_end)

    try:
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
            verbose=True,
            amp=False,  # Windows + CUDA で AMP チェックがクラッシュする問題を回避
        )
    except StopTraining:
        print("TRAINING STOPPED BY USER", flush=True)
        _write_progress(100, log="Training stopped by user", status="stopped")
        return

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

    # Temporary realtime streaming sanity check mode:
    # set KENPIN_TEST_LOG_STREAM=1 to verify one-line-per-second delivery.
    if os.getenv("KENPIN_TEST_LOG_STREAM") == "1":
        for i in range(5):
            print(f"TEST LOG {i}", flush=True)
            time.sleep(1)
        _write_progress(100, log="Test log stream complete")
        return

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
