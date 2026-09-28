"""Flask application factory and HTTP routes."""

import logging
import secrets
import time
from functools import wraps

from flask import Flask, jsonify, request, send_from_directory


logger = logging.getLogger(__name__)


def create_web_app(config, get_service, frontend_dir):
    """Create the HTTP application without initializing the vision model."""
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_IMAGE_SIZE + 1024 * 1024

    def require_api_token(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if request.method == "OPTIONS":
                return view(*args, **kwargs)
            if not config.API_TOKEN and config.APP_ENV == "development":
                return view(*args, **kwargs)

            supplied = request.headers.get("Authorization", "")
            expected = f"Bearer {config.API_TOKEN}"
            if not config.API_TOKEN or not secrets.compare_digest(supplied, expected):
                return jsonify({"success": False, "error": "Unauthorized"}), 401
            return view(*args, **kwargs)

        return wrapped

    @app.after_request
    def apply_cors(response):
        origin = request.headers.get("Origin")
        if origin in config.ALLOWED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

    @app.route("/api/process", methods=["POST", "OPTIONS"])
    @require_api_token
    def process_image():
        if request.method == "OPTIONS":
            return "", 200
        if "image" not in request.files:
            return jsonify({"success": False, "error": "No image provided"}), 400

        uploaded_file = request.files["image"]
        if not uploaded_file.filename:
            return jsonify({"success": False, "error": "No file selected"}), 400
        if not (uploaded_file.mimetype or "").startswith("image/"):
            return jsonify({"success": False, "error": "Only image files allowed"}), 400

        try:
            image_data = uploaded_file.read()
            if len(image_data) > config.MAX_IMAGE_SIZE:
                return jsonify({"success": False, "error": "Image too large"}), 400

            service = get_service()
            if not service.initialized:
                return jsonify({"success": False, "error": "Service not initialized"}), 503
            results = service.process_image(image_data)
            if "error" in results:
                return jsonify({"success": False, "error": results["error"]}), 500
            return jsonify({"success": True, "data": results})
        except Exception:
            logger.exception("Image processing request failed")
            return jsonify({"success": False, "error": "Internal server error"}), 500

    @app.route("/api/diagnostics", methods=["GET"])
    @require_api_token
    def diagnostics():
        return jsonify(get_service().get_comprehensive_diagnostics())

    @app.route("/api/capabilities", methods=["GET"])
    @require_api_token
    def capabilities():
        service = get_service()
        diagnostics_data = service.get_comprehensive_diagnostics()
        return jsonify({
            "active_capabilities": diagnostics_data["active_capabilities"],
            "performance_level": "cpu_optimized",
            "visualization_modes": ["bbox", "polygons", "thick-borders", "high-contrast"],
            "service_initialized": service.initialized,
        })

    @app.route("/api/health", methods=["GET"])
    def health():
        service = get_service()
        return jsonify({
            "status": "healthy" if service.initialized else "initializing",
            "timestamp": time.time(),
            "initialized": service.initialized,
        })

    @app.route("/")
    @app.route("/index.html")
    def home():
        return send_from_directory(frontend_dir, "index.html")

    @app.route("/app")
    @app.route("/app.html")
    def mobile_app():
        return send_from_directory(frontend_dir, "app.html")

    @app.route("/mobile.css")
    def mobile_styles():
        return send_from_directory(frontend_dir, "mobile.css")

    @app.route("/mobile.js")
    def mobile_javascript():
        return send_from_directory(frontend_dir, "mobile.js")

    @app.route("/manifest.webmanifest")
    def manifest():
        return send_from_directory(frontend_dir, "manifest.webmanifest")

    @app.route("/service-worker.js")
    def service_worker():
        response = send_from_directory(frontend_dir, "service-worker.js")
        response.headers["Cache-Control"] = "no-cache"
        return response

    @app.route("/pwa.js")
    def pwa_javascript():
        return send_from_directory(frontend_dir, "pwa.js")

    @app.route("/icons/<path:filename>")
    def pwa_icons(filename):
        return send_from_directory(frontend_dir / "icons", filename)

    return app
