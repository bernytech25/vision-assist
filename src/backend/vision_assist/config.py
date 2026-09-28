"""Runtime configuration for the VisionAssist backend."""

import logging
import os
from pathlib import Path


logger = logging.getLogger(__name__)


class PrecisionConfig:
    """Load and validate backend configuration from environment variables."""

    def __init__(self):
        base_dir = Path(__file__).resolve().parents[1]
        configured_model = Path(os.getenv("MODEL_PATH", "yolo26n-seg.pt"))
        self.MODEL_PATH = configured_model if configured_model.is_absolute() else base_dir / configured_model
        self.IMAGE_SIZE = int(os.getenv("IMAGE_SIZE", "640"))
        self.CONFIDENCE = float(os.getenv("CONFIDENCE", "0.45"))
        self.IOU = float(os.getenv("IOU", "0.4"))
        self.MAX_DETECTIONS = int(os.getenv("MAX_DETECTIONS", "100"))
        self.MAX_IMAGE_SIZE = int(os.getenv("MAX_IMAGE_SIZE_MB", "12")) * 1024 * 1024
        self.MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "16000000"))
        self.DEVICE = "cpu"
        self.APP_ENV = os.getenv("APP_ENV", "development").lower()
        self.API_TOKEN = os.getenv("API_TOKEN", "")
        self.ALLOWED_ORIGINS = frozenset(
            origin.strip() for origin in os.getenv(
                "FRONTEND_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500"
            ).split(",") if origin.strip()
        )
        self.ADVANCED_FEATURES = {
            "instance_segmentation": True,
            "spatial_analysis": True,
            "performance_monitoring": True,
        }

        if self.APP_ENV == "production" and not self.API_TOKEN:
            raise RuntimeError("API_TOKEN is required when APP_ENV=production")

        logger.info("CPU model configured: %s", self.MODEL_PATH.name)
        logger.info("CPU inference: imgsz=%s, conf=%s", self.IMAGE_SIZE, self.CONFIDENCE)
