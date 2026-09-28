FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

# Bake the model into the image so Cloud Run does not download it at startup.
RUN cd src/backend \
    && python -c "from ultralytics import YOLO; YOLO('yolo26n-seg.pt')"

CMD ["gunicorn", "--chdir", "src/backend", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "1", "--timeout", "0", "wsgi:app"]
