"""
Logging configuration.
Sets up a rotating file handler + console handler for the entire application.
"""

import logging
import logging.handlers
from pathlib import Path

LOGS_DIR = Path("logs")
LOGS_DIR.mkdir(exist_ok=True)

_FORMATTER = logging.Formatter(
    fmt="%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def setup_logging(level: int = logging.INFO) -> None:
    """Configure root logger with console and rotating file outputs."""
    root = logging.getLogger()

    # Avoid adding handlers multiple times (e.g. during hot-reload)
    if root.handlers:
        return

    root.setLevel(level)

    # --- Console ---
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(_FORMATTER)
    root.addHandler(console_handler)

    # --- Rotating file: 10 MB per file, keep 5 backups ---
    file_handler = logging.handlers.RotatingFileHandler(
        LOGS_DIR / "app.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(_FORMATTER)
    root.addHandler(file_handler)

    # Suppress noisy third-party loggers
    logging.getLogger("ultralytics").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
