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
    Expected keys:
        job_id, model, data_yaml, epochs, imgsz, batch,
        name, patience, optimizer, lr0, lrf, device,
        progress_path, logs_path (optional)

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

    model_key: str = params["model"]
    data_yaml: str = params["data_yaml"]
    epochs: int = int(params.get("epochs", 50))
    imgsz: int = int(params.get("imgsz", 640))
    batch: int = int(params.get("batch", 16))
    name: str = str(params.get("name", "exp"))
    patience: int = int(params.get("patience", 50))
    optimizer: str = str(params.get("optimizer", "auto"))
    lr0: float = float(params.get("lr0", 0.01))
    lrf: float = float(params.get("lrf", 0.01))

    device = _resolve_device(params.get("device", "auto"))
    _write_progress(0, log=f"[INFO] device={device}  model={model_key}  epochs={epochs}")

    # Build project/name so results land in backend/runs/train/<name>
    backend_dir = Path(__file__).parent.parent
    project = str(backend_dir / "runs" / "train")

    model = YOLO(model_key)

    # ------------------------------------------------------------------
    # Epoch callback — updates progress.json after each epoch
    # ------------------------------------------------------------------
    def _on_epoch_end(trainer) -> None:  # type: ignore[no-untyped-def]
        epoch: int = trainer.epoch + 1
        total: int = trainer.epochs
        pct = round(epoch / total * 100) if total > 0 else 0
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
