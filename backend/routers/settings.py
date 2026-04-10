"""
Settings router.

Endpoints
─────────
  GET  /settings   — Read application settings
  PUT  /settings   — Update application settings (full replace)

Storage
───────
  Settings are persisted as JSON in backend/data/settings.json.
  If the file does not exist, defaults are returned and served.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["Settings"])

_SETTINGS_FILE = Path(__file__).parent.parent / "data" / "settings.json"


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------


class AppSettings(BaseModel):
    """Application-wide settings persisted to disk."""

    default_model: str = Field(
        default="yolov8n",
        description="Default YOLO model key (must be a key in MODEL_MAP)",
    )
    default_epochs: int = Field(default=50, ge=1, le=1000)
    default_imgsz: int = Field(default=640, ge=32, le=1280)
    default_batch: int = Field(default=16, ge=1, le=256)
    max_concurrent_jobs: int = Field(default=4, ge=1, le=32)
    device_mode: str = Field(
        default="auto",
        description="Training device: auto | cpu | cuda",
    )
    storage_note: str = Field(
        default="",
        description="Free-text storage / retention policy note",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load() -> AppSettings:
    """Load settings from disk, returning defaults on any error."""
    if _SETTINGS_FILE.exists():
        try:
            raw = json.loads(_SETTINGS_FILE.read_text(encoding="utf-8"))
            return AppSettings(**raw)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to parse settings.json: %s — using defaults", exc)
    return AppSettings()


def _save(settings: AppSettings) -> None:
    """Persist settings to disk atomically via a temp-then-rename pattern."""
    _SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = _SETTINGS_FILE.with_suffix(".json.tmp")
    try:
        tmp.write_text(settings.model_dump_json(indent=2), encoding="utf-8")
        tmp.replace(_SETTINGS_FILE)
    except Exception as exc:
        logger.error("Failed to write settings.json: %s", exc)
        raise HTTPException(status_code=500, detail="設定の保存に失敗しました") from exc


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=AppSettings, summary="Get application settings")
def get_settings() -> AppSettings:
    """Return current application settings (or defaults if not yet configured)."""
    return _load()


@router.put("", response_model=AppSettings, summary="Update application settings")
def update_settings(payload: AppSettings) -> AppSettings:
    """Replace application settings and persist to disk."""
    _save(payload)
    logger.info("Settings updated: %s", payload.model_dump())
    return payload
