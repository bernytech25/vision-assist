"""Production WSGI entrypoint for Cloud Run."""

from app import app, yolo_service


yolo_service.initialize()
