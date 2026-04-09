"""
KENPIN AI Training Backend
FastAPI application entry point.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import dataset, predict, train
from utils.logging_config import setup_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    setup_logging()
    logger.info("KENPIN backend starting up")
    yield
    logger.info("KENPIN backend shutting down")


app = FastAPI(
    title="KENPIN AI Training API",
    version="1.0.0",
    description="FastAPI backend for YOLO model training and inference",
    lifespan=lifespan,
)

# Allow requests from the Next.js frontend (adjust origin in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(train.router)
app.include_router(predict.router)
app.include_router(dataset.router)


@app.get("/health", tags=["Health"])
def health_check():
    """Liveness probe."""
    return {"status": "ok"}
