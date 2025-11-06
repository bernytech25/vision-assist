from flask import Flask, request, jsonify
from ultralytics import YOLO
import cv2
import numpy as np
import time

app = Flask(__name__)

# ✅ LOAD YOLOv8m MODEL (Better precision than nano)
try:
    model = YOLO("yolov8m-seg.pt")  # Medium model for better accuracy
    MODEL_LOADED = True
    print("✅ YOLOv8m-seg model loaded (Optimized for precision)")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    MODEL_LOADED = False

# ✅ OPTIMIZED CONFIGURATION
app.config['MAX_CONTENT_LENGTH'] = 6 * 1024 * 1024  # 6MB limit

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route("/detect", methods=["POST", "OPTIONS"])
def detect():
    if request.method == "OPTIONS":
        return "", 200
        
    try:
        if not MODEL_LOADED:
            return jsonify({"error": "Model not loaded"}), 503
        
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        # Read image directly
        image_data = file.read()
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({"error": "Invalid image file"}), 400

        # ✅ OPTIMIZED YOLO INFERENCE
        start_time = time.time()
        results = model(img, verbose=False)  # Disable logs for performance
        
        detections = []
        for r in results:
            if r.masks is not None:
                for mask, cls, conf in zip(r.masks.xy, r.boxes.cls, r.boxes.conf):
                    detections.append({
                        "label": model.names[int(cls)],
                        "confidence": float(conf),
                        "polygon": mask.tolist()
                    })

        processing_time = time.time() - start_time
        print(f"⏱️ Detection time: {processing_time:.2f}s - Objects: {len(detections)}")

        return jsonify({
            "success": True,
            "detections": detections,
            "count": len(detections),
            "processing_time": f"{processing_time:.2f}s",
            "model": "yolov8m-seg"
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    status = "healthy" if MODEL_LOADED else "model_not_loaded"
    return jsonify({
        "status": status,
        "model": "YOLOv8m-seg",
        "model_loaded": MODEL_LOADED
    })

@app.route("/model-info", methods=["GET"])
def model_info():
    """Endpoint for model information"""
    if not MODEL_LOADED:
        return jsonify({"error": "Model not loaded"}), 503
        
    return jsonify({
        "model_name": "yolov8m-seg",
        "task": "instance-segmentation",
        "classes": list(model.names.values()) if hasattr(model, 'names') else []
    })

if __name__ == "__main__":
    print("🚀 Starting Vision Assist Server - YOLOv8m Precision")
    print(f"📦 Model loaded: {MODEL_LOADED}")
    app.run(host="0.0.0.0", port=5001, debug=False)