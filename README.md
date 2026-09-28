<div align="center">

<img src="src/frontend/icons/vision-assist-3.svg" alt="VisionAssist logo" width="96">

# VisionAssist

### AI Visual Assistant for Reduced Vision

[![Model: YOLO26n-seg](https://img.shields.io/badge/Model-YOLO26n--seg-111827?logo=ultralytics&logoColor=white)](https://docs.ultralytics.com/)
![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Inference: CPU](https://img.shields.io/badge/Inference-CPU-16A34A)
![Mobile PWA](https://img.shields.io/badge/Mobile-PWA-7C3AED)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial-2563EB.svg)](LICENSE.md)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

</div>

## About

VisionAssist is an assistive-vision system for people with reduced vision. It
turns camera input into useful spatial context through computer vision,
accessible visual overlays, and controlled audio guidance.

The current product is a mobile PWA powered by **YOLO26n-seg on CPU**. It is
designed to scale toward smart glasses as the primary point of view, with a
phone as an optional companion and cloud inference for concise audio or haptic
guidance.

```mermaid
flowchart LR
    A[Phone camera] --> B[VisionAssist mobile PWA]
    B --> C[YOLO26n-seg inference]
    C --> D[Accessible visual overlays]
    C --> E[Controlled audio guidance]
```

## Global impact

- **2,200 million** people have vision impairment (WHO)
- **1 billion** have moderate or severe distance vision impairment
- The affected population is projected to **double by 2050**
- **250 million** are of working age

## What it delivers

- **Real-time object detection and segmentation** with YOLO26n-seg
- **Accessible visual modes:** boxes, polygons, thick borders, and high contrast
- **Controlled audio guidance:** prioritizes people and vehicles, reports
  left/center/right position, and limits repetition to reduce audio overload
- **Installable mobile PWA** with camera access and a clear live-status view
- **Privacy-conscious field validation:** no images, video, or location are
  retained in the test log

## Technologies

- **Backend:** Python 3.12, Flask, Ultralytics, YOLO26n-seg, PyTorch CPU,
  OpenCV, NumPy
- **Frontend:** HTML5, Canvas API, Web Speech API, JavaScript
- **Computer Vision:** object detection and instance segmentation

## Validation

Mobile validation on a Poco X6 measured **501 ms average end-to-end latency**
and **747 ms p95** across 50 requests. A subsequent walking session confirmed
sustained operation with controlled audio guidance.

These results reflect the complete mobile path, not only model inference.

## License

This project is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md). You may use, modify, and
redistribute it only for noncommercial purposes, subject to the full license
terms. Contact the project owner before any commercial use.
