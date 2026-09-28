"""VisionAssist application entrypoint."""

import logging
import os
from pathlib import Path
from vision_assist.config import PrecisionConfig
from vision_assist.service import HighPrecisionYOLOService
from vision_assist.web import create_web_app

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

config = PrecisionConfig()
FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"

yolo_service = HighPrecisionYOLOService(config)
app = create_web_app(config, lambda: yolo_service, FRONTEND_DIR)

if __name__ == "__main__":
    print("\n" + "="*70)
    print("🎯 VISION ASSIST - APP MÓVIL + API CPU")
    print("="*70)
    print(f"📦 Modelo configurado: {config.MODEL_PATH.name}")
    print(f"🎯 Resolución: {config.IMAGE_SIZE}px - CPU")
    print("🚀 ACCESOS DISPONIBLES:")
    print("   • GET  / - Inicio móvil")
    print("   • GET  /app - Detector móvil")
    print("   • POST /api/process - Procesar imágenes")
    print("="*70 + "\n")

    yolo_service.initialize()
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5001")),
        debug=False,
        threaded=False,
    )
