"""YOLO inference service for VisionAssist."""

import logging
import threading
import time

import cv2
import numpy as np
import psutil
import torch
from ultralytics import YOLO

logger = logging.getLogger(__name__)


class HighPrecisionYOLOService:
    def __init__(self, config):
        self.config = config
        self.model = None
        self.device = self.config.DEVICE
        self.inference_lock = threading.Lock()
        self.stats_lock = threading.Lock()
        self.warmup_complete = False
        self.initialized = False
        self.performance_stats = {
            "total_processed": 0,
            "avg_processing_time": 0,
            "max_detections": 0,
            "total_objects_detected": 0
        }

    def initialize(self):
        """Inicialización con todas las capacidades - SIMPLIFICADA"""
        try:
            if not self.initialized:
                logger.info("🚀 Iniciando inicialización del servicio...")
                self._setup_device()
                self._load_model_simple()
                self._simple_warmup()
                self.initialized = True
                logger.info("Servicio %s listo para CPU", self.config.MODEL_PATH.name)
        except Exception as e:
            logger.error(f"❌ Error en inicialización: {e}")
            self.initialized = False

    def _setup_device(self):
        """El despliegue está deliberadamente limitado a CPU."""
        self.device = "cpu"
        logger.info("Usando CPU para inferencia")

    def _load_model_simple(self):
        """Carga un artefacto previamente desplegado; nunca descarga en producción."""
        if not self.config.MODEL_PATH.is_file():
            raise FileNotFoundError(
                f"Modelo no encontrado: {self.config.MODEL_PATH}. "
                "Despliega yolo26n-seg.pt o define MODEL_PATH."
            )

        logger.info("Cargando modelo desde %s", self.config.MODEL_PATH)
        self.model = YOLO(str(self.config.MODEL_PATH))
        logger.info("Modelo cargado exitosamente")

        self.model.overrides.update({
            'conf': self.config.CONFIDENCE,
            'iou': self.config.IOU,
            'device': self.device,
            'max_det': self.config.MAX_DETECTIONS,
            'verbose': False,
            'imgsz': self.config.IMAGE_SIZE,
            'agnostic_nms': False,
            'classes': None,
        })

        logger.info(f"🔧 Modelo configurado para dispositivo: {self.device}")

    def _simple_warmup(self):
        """Warm-up simple"""
        if self.warmup_complete:
            return

        logger.info("🔥 Calentamiento del modelo...")
        try:
            dummy_image = np.zeros((self.config.IMAGE_SIZE, self.config.IMAGE_SIZE, 3), dtype=np.uint8)
            with torch.no_grad():
                results = self.model(dummy_image, verbose=False)
            self.warmup_complete = True
            logger.info("✅ Modelo calentado y listo")
        except Exception as e:
            logger.warning(f"⚠️ Warm-up falló: {e}")
            self.warmup_complete = True

    def _high_quality_preprocess(self, image_data: bytes):
        """Pre-procesamiento de ALTA CALIDAD"""
        try:
            nparr = np.frombuffer(image_data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                raise ValueError("No se pudo decodificar la imagen")

            original_h, original_w = image.shape[:2]
            if original_h * original_w > self.config.MAX_IMAGE_PIXELS:
                raise ValueError("La imagen supera el límite de píxeles permitido")

            max_dimension = 1280
            if max(original_h, original_w) > max_dimension:
                scale = max_dimension / max(original_h, original_w)
                new_w = int(original_w * scale)
                new_h = int(original_h * scale)
                image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
                logger.info(f"📐 Imagen optimizada: {original_w}x{original_h} -> {new_w}x{new_h}")
            else:
                logger.info(f"📐 Imagen en resolución original: {original_w}x{original_h}")

            return image, (original_w, original_h)
        except Exception as e:
            logger.error(f"❌ Error en pre-procesamiento: {e}")
            raise

    def _extract_detections_safe(self, result, original_size, processed_size):
        """Extraer detecciones de forma segura sin errores de tensor"""
        detections = []

        if result.boxes is not None and len(result.boxes) > 0:
            orig_w, orig_h = original_size
            proc_h, proc_w = processed_size[:2]

            scale_x = orig_w / proc_w
            scale_y = orig_h / proc_h

            for i, box in enumerate(result.boxes):
                try:
                    bbox_original = box.xyxy[0].cpu().numpy()
                    confidence = float(box.conf[0].cpu().numpy())
                    class_id = int(box.cls[0].cpu().numpy())
                    label = result.names[class_id]

                    bbox_scaled = [
                        float(bbox_original[0] * scale_x),
                        float(bbox_original[1] * scale_y),
                        float(bbox_original[2] * scale_x),
                        float(bbox_original[3] * scale_y)
                    ]

                    detection = {
                        "label": label,
                        "confidence": float(confidence),
                        "bbox": bbox_scaled,
                        "class_id": int(class_id),
                    }

                    if result.masks is not None and i < len(result.masks.data):
                        mask = result.masks[i]
                        if hasattr(mask, 'xy'):
                            polygons = mask.xy
                            if polygons and len(polygons) > 0:
                                raw_polygon = polygons[0].tolist()
                                if raw_polygon and len(raw_polygon) > 0:
                                    refined_polygon = []
                                    for point in raw_polygon:
                                        x = float(point[0] * scale_x)
                                        y = float(point[1] * scale_y)
                                        refined_polygon.append([x, y])
                                    detection["polygon"] = refined_polygon
                                    detection["mask_quality"] = {"quality": "standard"}

                    detections.append(detection)
                    logger.info(f"✅ Detección {i}: {detection['label']} - Conf: {detection['confidence']:.2f}")

                except Exception as e:
                    logger.warning(f"⚠️ Error procesando detección {i}: {e}")
                    continue

        return detections

    def _advanced_spatial_analysis(self, detections, image_width, image_height):
        """Análisis espacial AVANZADO"""
        for detection in detections:
            if "bbox" in detection:
                bbox = detection["bbox"]
                center_x = (bbox[0] + bbox[2]) / 2
                center_y = (bbox[1] + bbox[3]) / 2

                detection["position"] = {
                    "x_relative": float(center_x / image_width),
                    "y_relative": float(center_y / image_height),
                    "area_relative": float(((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) / (image_width * image_height))
                }

                if center_x < image_width / 3:
                    detection["zone"] = "left"
                elif center_x < 2 * image_width / 3:
                    detection["zone"] = "center"
                else:
                    detection["zone"] = "right"

        return detections

    def _comprehensive_quality_analysis(self, detections, processing_time):
        """Análisis de calidad COMPLETO"""
        try:
            detections_count = len(detections)
            high_conf_count = len([d for d in detections if d["confidence"] > 0.7])
            medium_conf_count = len([d for d in detections if 0.4 <= d["confidence"] <= 0.7])
            masks_count = len([d for d in detections if "polygon" in d])
            bbox_count = len([d for d in detections if "bbox" in d])

            confidences = [d["confidence"] for d in detections]
            avg_confidence = float(np.mean(confidences)) if detections else 0.0

            quality_metrics = {
                "total_objects": int(detections_count),
                "high_confidence_objects": int(high_conf_count),
                "medium_confidence_objects": int(medium_conf_count),
                "objects_with_masks": int(masks_count),
                "objects_with_bbox": int(bbox_count),
                "avg_confidence": float(avg_confidence),
                "processing_time": float(processing_time),
                "objects_per_second": float(detections_count / processing_time) if processing_time > 0 else 0.0,
            }

            return quality_metrics
        except Exception as e:
            logger.error(f"❌ Error en análisis de calidad: {e}")
            return {
                "total_objects": len(detections),
                "processing_time": float(processing_time),
                "error": str(e)
            }

    def _format_comprehensive_results(self, result, inference_time: float, original_size, processed_size):
        """Formateo de resultados COMPLETO"""
        detections = self._extract_detections_safe(result, original_size, processed_size)

        if self.config.ADVANCED_FEATURES["spatial_analysis"] and detections:
            detections = self._advanced_spatial_analysis(detections, original_size[0], original_size[1])

        quality_metrics = self._comprehensive_quality_analysis(detections, inference_time)

        with self.stats_lock:
            self.performance_stats["total_processed"] += 1
            self.performance_stats["total_objects_detected"] += len(detections)

            if self.performance_stats["total_processed"] == 1:
                self.performance_stats["avg_processing_time"] = float(inference_time)
            else:
                self.performance_stats["avg_processing_time"] = float(
                    (self.performance_stats["avg_processing_time"] * (self.performance_stats["total_processed"] - 1) + inference_time)
                    / self.performance_stats["total_processed"]
                )

            self.performance_stats["max_detections"] = max(
                self.performance_stats["max_detections"], len(detections)
            )

            serializable_stats = {
                "total_processed": int(self.performance_stats["total_processed"]),
                "avg_processing_time": float(self.performance_stats["avg_processing_time"]),
                "max_detections": int(self.performance_stats["max_detections"]),
                "total_objects_detected": int(self.performance_stats["total_objects_detected"])
            }

        return {
            "detections": detections,
            "processing_time": float(inference_time),
            "total_detections": int(len(detections)),
            "image_size": [int(original_size[0]), int(original_size[1])],
            "quality_metrics": quality_metrics,
            "performance_stats": serializable_stats,
            "system_info": {
                "model": self.config.MODEL_PATH.name,
                "device": str(self.device),
                "resolution": f"{self.config.IMAGE_SIZE}px",
                "advanced_features": self.config.ADVANCED_FEATURES
            }
        }

    def process_image(self, image_data: bytes):
        """Procesamiento con TODAS las capacidades - COMPLETAMENTE CORREGIDO"""
        try:
            start_time = time.time()

            processed_image, original_size = self._high_quality_preprocess(image_data)

            inference_start = time.time()
            with self.inference_lock, torch.no_grad():
                results = self.model(processed_image, verbose=False)
            inference_time = time.time() - inference_start

            if len(results) == 0:
                return {
                    "detections": [],
                    "processing_time": float(inference_time),
                    "total_detections": 0,
                    "image_size": [int(original_size[0]), int(original_size[1])],
                    "quality_metrics": {"total_objects": 0, "processing_time": float(inference_time)},
                    "message": "No se detectaron objetos"
                }

            formatted_results = self._format_comprehensive_results(
                results[0], inference_time, original_size, processed_image.shape
            )
            total_time = time.time() - start_time

            quality = formatted_results["quality_metrics"]
            logger.info(f"🎯 PROCESADO: {total_time:.2f}s - {quality['total_objects']} objetos")

            return formatted_results
        except Exception as e:
            logger.error(f"❌ Error en procesamiento: {e}")
            return {"error": str(e), "detections": []}

    def get_comprehensive_diagnostics(self):
        """Diagnóstico COMPLETO del sistema"""
        try:
            process = psutil.Process()
            memory_info = process.memory_info()
            system_memory = psutil.virtual_memory()

            return {
                "active_model": {
                    "name": self.config.MODEL_PATH.name,
                    "size_mb": round(self.config.MODEL_PATH.stat().st_size / (1024 * 1024), 1)
                    if self.config.MODEL_PATH.exists() else None,
                    "type": "instance_segmentation",
                    "description": "Modelo de segmentación configurado para CPU"
                },
                "system_resources": {
                    "device": self.device,
                    "device_active": True,
                    "system_memory_mb": int(round(system_memory.total / (1024 * 1024))),
                    "process_memory_mb": int(round(memory_info.rss / (1024 * 1024))),
                    "memory_usage_percent": float(round(system_memory.percent, 1))
                },
                "active_capabilities": self.config.ADVANCED_FEATURES,
                "performance_metrics": {
                    "total_processed": int(self.performance_stats["total_processed"]),
                    "avg_processing_time": float(self.performance_stats["avg_processing_time"]),
                    "max_detections": int(self.performance_stats["max_detections"]),
                    "total_objects_detected": int(self.performance_stats["total_objects_detected"])
                },
                "configuration_details": {
                    "inference_resolution": f"{self.config.IMAGE_SIZE}px",
                    "confidence_threshold": float(self.config.CONFIDENCE),
                    "iou_threshold": float(self.config.IOU),
                    "max_detections": int(self.config.MAX_DETECTIONS),
                },
                "model_capabilities": {
                    "total_classes": 80,
                    "segmentation": True,
                    "object_detection": True,
                    "instance_segmentation": True,
                    "bbox_detection": True,
                },
                "service_status": {
                    "initialized": self.initialized,
                    "warmup_complete": self.warmup_complete,
                }
            }
        except Exception as e:
            logger.error(f"❌ Error en diagnóstico: {e}")
            return {"error": f"Error en diagnóstico: {str(e)}"}
