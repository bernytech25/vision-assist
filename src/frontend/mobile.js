const videoElement = document.getElementById('videoElement');
const previewCanvas = document.getElementById('previewCanvas');
const ctx = previewCanvas.getContext('2d');
const statusDiv = document.getElementById('status');
const connectionStatus = document.getElementById('connectionStatus');

        const API_BASE = window.location.origin;

        let videoStream = null;
        let isDetecting = false;
let detectionInterval = null;
let currentVisualizationMode = 'bbox';
let processingFrame = false;
let overlayClearTimer = null;
const OVERLAY_PERSISTENCE_MS = 450;
let latencySamples = [];
const MAX_LATENCY_SAMPLES = 50;
const FIELD_TEST_STORAGE_KEY = 'visionassist.fieldTest.v1';
const MAX_FIELD_TEST_RECORDS = 5000;
const AUDIO_GLOBAL_COOLDOWN_MS = 4500;
const AUDIO_REPEAT_COOLDOWN_MS = 12000;
const AUDIO_MIN_CONFIDENCE = 0.45;
const AUDIO_VEHICLE_LABELS = new Set(['car', 'motorcycle', 'bicycle', 'bus', 'truck']);
const AUDIO_PRIORITY = {
    motorcycle: 105,
    person: 100,
    bicycle: 95,
    car: 90,
    bus: 86,
    truck: 86,
};
let fieldTestRecords = [];
let fieldTestActive = false;
let fieldTestSessionId = null;
let fieldTestSessionStartedAt = 0;
let latestDetections = [];
let latestLatencyMs = null;
let latestAudioAnnouncement = '';
let audioGuidanceEnabled = false;
let lastAudioTime = 0;
const audioPhraseTimes = new Map();
const speechSynth = window.speechSynthesis || null;

function loadFieldTestRecords() {
    try {
        const storedRecords = JSON.parse(localStorage.getItem(FIELD_TEST_STORAGE_KEY) || '[]');
        fieldTestRecords = Array.isArray(storedRecords) ? storedRecords : [];
    } catch (error) {
        console.warn('Unable to restore field test records', error);
        fieldTestRecords = [];
    }
}

function saveFieldTestRecords() {
    try {
        localStorage.setItem(FIELD_TEST_STORAGE_KEY, JSON.stringify(fieldTestRecords));
    } catch (error) {
        console.warn('Unable to save field test records', error);
    }
}

function getFieldTestContext() {
    return {
        lighting: document.getElementById('lightingCondition').value,
        movement: document.getElementById('movementCondition').value,
    };
}

function getConnectionState() {
    if (connectionStatus.classList.contains('is-online')) return 'online';
    if (connectionStatus.classList.contains('is-warning')) return 'warning';
    return 'offline';
}

function appendFieldTestRecord(
    eventType,
    detections = [],
    latencyMs = null,
    marker = '',
    audioAnnouncement = ''
) {
    if (fieldTestRecords.length >= MAX_FIELD_TEST_RECORDS) {
        fieldTestActive = false;
        updateFieldTestUi('Storage limit reached — export or clear the log');
        return;
    }

    const context = getFieldTestContext();
    fieldTestRecords.push({
        session_id: fieldTestSessionId || '',
        event_type: eventType,
        timestamp: new Date().toISOString(),
        elapsed_ms: fieldTestSessionStartedAt ? Math.round(performance.now() - fieldTestSessionStartedAt) : '',
        lighting: context.lighting,
        movement: context.movement,
        latency_ms: latencyMs === null ? '' : Math.round(latencyMs),
        detection_count: detections.length,
        labels: detections.map((detection) => detection.label).join('|'),
        confidences: detections.map((detection) => Number(detection.confidence).toFixed(3)).join('|'),
        zones: detections.map((detection) => detection.zone || '').join('|'),
        marker,
        connection: getConnectionState(),
        audio_enabled: audioGuidanceEnabled ? 'yes' : 'no',
        audio_announcement: audioAnnouncement,
    });

    if (eventType !== 'frame' || fieldTestRecords.length % 10 === 0) {
        saveFieldTestRecords();
    }
    updateFieldTestUi();
}

function updateFieldTestUi(statusMessage = '') {
    const status = document.getElementById('testSessionStatus');
    const frameCount = fieldTestRecords.filter((record) => record.event_type === 'frame').length;
    const markerCount = fieldTestRecords.filter((record) => record.event_type === 'marker').length;
    const sessionCount = new Set(
        fieldTestRecords.map((record) => record.session_id).filter(Boolean)
    ).size;

    status.textContent = statusMessage || (fieldTestActive ? 'Recording' : 'Ready');
    status.className = `session-status${fieldTestActive ? ' is-recording' : ''}`;
    document.getElementById('startTestSessionBtn').disabled = fieldTestActive;
    document.getElementById('stopTestSessionBtn').disabled = !fieldTestActive;
    document.getElementById('exportTestBtn').disabled = fieldTestRecords.length === 0 || fieldTestActive;
    document.getElementById('clearTestBtn').disabled = fieldTestRecords.length === 0 || fieldTestActive;
    document.querySelectorAll('[data-test-marker]').forEach((button) => {
        button.disabled = !fieldTestActive;
    });
    document.getElementById('fieldTestQuickBar').hidden = !fieldTestActive;
    document.body.classList.toggle('field-test-active', fieldTestActive);
    document.getElementById('testSessionSummary').textContent = fieldTestRecords.length
        ? `${frameCount} samples · ${markerCount} markers · ${sessionCount} sessions`
        : 'No samples recorded';
}

function startFieldTestSession() {
    if (fieldTestActive) return;

    fieldTestSessionId = `session-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fieldTestSessionStartedAt = performance.now();
    fieldTestActive = true;
    appendFieldTestRecord('session_start');
}

function stopFieldTestSession() {
    if (!fieldTestActive) return;

    appendFieldTestRecord(
        'session_end',
        latestDetections,
        latestLatencyMs,
        '',
        latestAudioAnnouncement
    );
    fieldTestActive = false;
    saveFieldTestRecords();
    updateFieldTestUi('Session saved');
}

function recordFieldTestSample(detections, latencyMs, audioAnnouncement = '') {
    latestDetections = detections;
    latestLatencyMs = latencyMs;
    latestAudioAnnouncement = audioAnnouncement || latestAudioAnnouncement;
    if (fieldTestActive) {
        appendFieldTestRecord('frame', detections, latencyMs, '', audioAnnouncement);
    }
}

function addFieldTestMarker(marker, button = null) {
    if (!fieldTestActive) return;
    appendFieldTestRecord(
        'marker',
        latestDetections,
        latestLatencyMs,
        marker,
        latestAudioAnnouncement
    );
    updateFieldTestUi('Marker saved');

    if (button) {
        if (button._markerFeedbackTimer) {
            window.clearTimeout(button._markerFeedbackTimer);
        }
        const originalLabel = button.dataset.originalLabel || button.textContent;
        button.dataset.originalLabel = originalLabel;
        button.classList.add('is-recorded');
        button.textContent = 'Saved';
        button._markerFeedbackTimer = window.setTimeout(() => {
            button.classList.remove('is-recorded');
            button.textContent = originalLabel;
            delete button._markerFeedbackTimer;
        }, 1200);
    }
}

function escapeCsvValue(value) {
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
}

function exportFieldTestCsv() {
    if (!fieldTestRecords.length) return;

    saveFieldTestRecords();
    const headers = [
        'session_id', 'event_type', 'timestamp', 'elapsed_ms', 'lighting', 'movement',
        'latency_ms', 'detection_count', 'labels', 'confidences', 'zones', 'marker', 'connection',
        'audio_enabled', 'audio_announcement'
    ];
    const rows = fieldTestRecords.map((record) =>
        headers.map((header) => escapeCsvValue(record[header])).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `visionassist-field-test-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadLink.click();
    URL.revokeObjectURL(downloadUrl);
    updateFieldTestUi('CSV exported');
}

function clearFieldTestLog() {
    if (fieldTestActive || !fieldTestRecords.length) return;
    if (!window.confirm('Clear all locally stored field test records?')) return;

    fieldTestRecords = [];
    fieldTestSessionId = null;
    fieldTestSessionStartedAt = 0;
    localStorage.removeItem(FIELD_TEST_STORAGE_KEY);
    updateFieldTestUi();
}

function getAudioPosition(zone) {
    if (zone === 'center') return 'ahead';
    if (zone === 'left') return 'on the left';
    if (zone === 'right') return 'on the right';
    return 'nearby';
}

function getAudioCandidateScore(detection) {
    const label = String(detection.label || '').toLowerCase();
    const priority = AUDIO_PRIORITY[label] || 0;
    const zoneBonus = detection.zone === 'center' ? 40 : 15;
    const confidenceBonus = Number(detection.confidence || 0) * 10;
    let prominenceBonus = 0;

    if (detection.bbox && previewCanvas.width && previewCanvas.height) {
        const [x1, y1, x2, y2] = detection.bbox;
        const frameArea = previewCanvas.width * previewCanvas.height;
        const objectArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        prominenceBonus = Math.min(20, (objectArea / frameArea) * 100);
    }

    return priority + zoneBonus + confidenceBonus + prominenceBonus;
}

function formatAudioDetection(detection) {
    const label = String(detection.label || '').toLowerCase();
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${getAudioPosition(detection.zone)}`;
}

function buildEnvironmentAnnouncement(detections) {
    const candidates = detections
        .filter((detection) => {
            const label = String(detection.label || '').toLowerCase();
            return AUDIO_PRIORITY[label] && Number(detection.confidence) >= AUDIO_MIN_CONFIDENCE;
        })
        .sort((first, second) => getAudioCandidateScore(second) - getAudioCandidateScore(first));

    if (!candidates.length) return '';

    const uniqueCandidates = [];
    const seenPositions = new Set();
    for (const candidate of candidates) {
        const key = `${candidate.label}:${candidate.zone || 'unknown'}`;
        if (seenPositions.has(key)) continue;
        seenPositions.add(key);
        uniqueCandidates.push(candidate);
    }

    const selected = [uniqueCandidates[0]];
    const first = selected[0];
    const complementary = uniqueCandidates.find((candidate) => {
        if (candidate === first) return false;
        const firstIsVehicle = AUDIO_VEHICLE_LABELS.has(first.label);
        const candidateIsVehicle = AUDIO_VEHICLE_LABELS.has(candidate.label);
        return (
            (first.label === 'person' && candidateIsVehicle) ||
            (firstIsVehicle && candidate.label === 'person' && candidate.zone === 'center') ||
            (first.zone !== 'center' && candidate.zone === 'center')
        );
    });
    if (complementary) selected.push(complementary);

    const vehicleCount = detections.filter((detection) =>
        AUDIO_VEHICLE_LABELS.has(String(detection.label || '').toLowerCase()) &&
        Number(detection.confidence) >= AUDIO_MIN_CONFIDENCE
    ).length;
    const parts = [];
    if (vehicleCount >= 3) parts.push('Busy traffic');
    selected.forEach((detection) => parts.push(formatAudioDetection(detection)));
    return `${parts.join('. ')}.`;
}

function setAudioGuidanceStatus(text, state = '') {
    const status = document.getElementById('audioGuidanceStatus');
    status.textContent = text;
    status.className = `audio-status${state ? ` is-${state}` : ''}`;
}

function speakAudioGuidance(text, { updateCooldown = true } = {}) {
    if (!speechSynth || !text) return false;
    if (speechSynth.speaking) return false;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => setAudioGuidanceStatus('Speaking', 'speaking');
    utterance.onend = () => setAudioGuidanceStatus(audioGuidanceEnabled ? 'On' : 'Off', audioGuidanceEnabled ? 'on' : '');
    utterance.onerror = () => setAudioGuidanceStatus('Audio error');
    speechSynth.speak(utterance);

    if (updateCooldown) {
        const now = performance.now();
        lastAudioTime = now;
        audioPhraseTimes.set(text, now);
        latestAudioAnnouncement = text;
        document.getElementById('lastAudioAnnouncement').textContent = text;
    }
    return true;
}

function processAudioGuidance(detections) {
    if (!audioGuidanceEnabled || !speechSynth) return '';

    const now = performance.now();
    if (now - lastAudioTime < AUDIO_GLOBAL_COOLDOWN_MS) return '';

    const announcement = buildEnvironmentAnnouncement(detections);
    if (!announcement) return '';

    const previousAnnouncementTime = audioPhraseTimes.get(announcement) || 0;
    if (now - previousAnnouncementTime < AUDIO_REPEAT_COOLDOWN_MS) return '';

    return speakAudioGuidance(announcement) ? announcement : '';
}

function toggleAudioGuidance() {
    if (!speechSynth) return;

    audioGuidanceEnabled = !audioGuidanceEnabled;
    const button = document.getElementById('toggleAudioBtn');
    button.setAttribute('aria-pressed', String(audioGuidanceEnabled));
    button.textContent = audioGuidanceEnabled ? 'Disable audio' : 'Enable audio';

    speechSynth.cancel();
    if (audioGuidanceEnabled) {
        lastAudioTime = performance.now();
        setAudioGuidanceStatus('On', 'on');
        speakAudioGuidance('Audio guidance on', { updateCooldown: false });
    } else {
        setAudioGuidanceStatus('Off');
    }
}

function initializeAudioGuidance() {
    if (speechSynth) return;
    const button = document.getElementById('toggleAudioBtn');
    button.disabled = true;
    button.textContent = 'Audio unavailable';
    setAudioGuidanceStatus('Unsupported');
}

function setConnectionStatus(state, message) {
    connectionStatus.textContent = message;
    connectionStatus.className = `connection-status is-${state}`;
}

async function refreshBackendStatus() {
    if (!navigator.onLine) {
        setConnectionStatus('offline', 'No internet connection');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
        const health = await response.json();
        if (response.ok && health.initialized) {
            setConnectionStatus('online', 'Detection service connected');
        } else {
            setConnectionStatus('warning', 'The model is still starting');
        }
    } catch (error) {
        setConnectionStatus('offline', 'Unable to reach the detection service');
    }
}

function percentile(sortedValues, percentileValue) {
    const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1);
    return sortedValues[index];
}

function resetLatencyMetrics() {
    latencySamples = [];
    document.getElementById('latencyLast').textContent = '—';
    document.getElementById('latencySummary').textContent = 'Average: — · p95: —';
}

function recordLatency(latencyMs) {
    latencySamples.push(latencyMs);
    if (latencySamples.length > MAX_LATENCY_SAMPLES) {
        latencySamples.shift();
    }

    const sortedSamples = [...latencySamples].sort((first, second) => first - second);
    const average = latencySamples.reduce((total, value) => total + value, 0) / latencySamples.length;
    const p95 = percentile(sortedSamples, 0.95);
    document.getElementById('latencyLast').textContent = `${Math.round(latencyMs)} ms`;
    document.getElementById('latencySummary').textContent =
        `Average: ${Math.round(average)} ms · p95: ${Math.round(p95)} ms · n=${latencySamples.length}`;
}

        function setVisualizationMode(mode) {
            currentVisualizationMode = mode;
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

            const modeNames = {
                'bbox': 'Boxes',
                'polygons': 'Polygons',
                'thick-borders': 'Thick Borders',
                'high-contrast': 'High Contrast',
                'edge-focus': 'Edge Focus'
            };
            document.getElementById('currentMode').textContent = modeNames[mode] || 'Boxes';

            if (isDetecting) {
                processVideoFrame();
            }
        }

        function drawThickBordersDetections(detections) {
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFE66D', '#6A0572'];

            detections.forEach((detection, index) => {
                const color = colors[index % colors.length];

                if (detection.bbox) {
                    const [x1, y1, x2, y2] = detection.bbox;
                    const width = x2 - x1;
                    const height = y2 - y1;

                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 8;
                    ctx.strokeRect(x1, y1, width, height);

                    ctx.strokeStyle = color;
                    ctx.lineWidth = 6;
                    ctx.strokeRect(x1, y1, width, height);

                    ctx.fillStyle = color + '80';
                    ctx.fillRect(x1, y1, width, height);

                    ctx.fillStyle = '#000000';
                    const text = `${detection.label} ${Math.round(detection.confidence * 100)}%`;
                    const textWidth = ctx.measureText(text).width;
                    ctx.fillRect(x1, y1 - 35, textWidth + 15, 30);

                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = 'bold 16px Arial';
                    ctx.fillText(text, x1 + 7, y1 - 15);
                }
            });
        }

        function drawHighContrastDetections(detections) {
            const highContrastColors = ['#FFD400', '#00E5FF', '#FF7A00', '#7CFF6B'];

            detections.forEach((detection, index) => {
                const color = highContrastColors[index % highContrastColors.length];

                if (detection.bbox) {
                    const [x1, y1, x2, y2] = detection.bbox;
                    const width = x2 - x1;
                    const height = y2 - y1;

                    ctx.fillStyle = color + '24';
                    ctx.fillRect(x1, y1, width, height);

                    ctx.strokeStyle = color;
                    ctx.lineWidth = 9;
                    ctx.strokeRect(x1, y1, width, height);

                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x1 + 5, y1 + 5, width - 10, height - 10);

                    const text = `${detection.label} ${Math.round(detection.confidence * 100)}%`;
                    ctx.font = 'bold 18px Arial';
                    const textWidth = ctx.measureText(text).width;
                    ctx.fillStyle = 'rgba(7, 17, 31, 0.92)';
                    ctx.fillRect(x1, y1 - 40, textWidth + 20, 35);

                    ctx.fillStyle = color;
                    ctx.fillText(text, x1 + 10, y1 - 15);

                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x1, y1 - 40, textWidth + 20, 35);
                }
            });
        }

        function drawPolygonsOnlyDetections(detections) {
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFEAA7', '#DDA0DD'];

            detections.forEach((detection, index) => {
                const color = colors[index % colors.length];

                if (detection.polygon) {
                    ctx.beginPath();
                    ctx.moveTo(detection.polygon[0][0], detection.polygon[0][1]);

                    for (let i = 1; i < detection.polygon.length; i++) {
                        ctx.lineTo(detection.polygon[i][0], detection.polygon[i][1]);
                    }
                    ctx.closePath();

                    ctx.strokeStyle = color;
                    ctx.lineWidth = 8;
                    ctx.stroke();

                    if (detection.bbox) {
                        const [x1, y1, x2, y2] = detection.bbox;
                        const centerX = (x1 + x2) / 2;
                        const centerY = (y1 + y2) / 2;

                        ctx.fillStyle = color;
                        const text = `${detection.label} ${Math.round(detection.confidence * 100)}%`;
                        const textWidth = ctx.measureText(text).width;
                        ctx.fillRect(centerX - textWidth/2 - 5, centerY - 35, textWidth + 10, 25);
                        ctx.fillStyle = 'white';
                        ctx.font = '14px Arial';
                        ctx.fillText(text, centerX - textWidth/2, centerY - 15);
                    }
                }
            });
        }

        function drawEdgeFocusDetections(detections) {
            const colors = ['#35D49A', '#36D5F3', '#FFD400', '#FF8A65'];

            detections.forEach((detection, index) => {
                const color = colors[index % colors.length];
                const polygon = detection.polygon;
                const label = `${detection.label} ${Math.round(detection.confidence * 100)}%`;

                ctx.save();
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                if (polygon && polygon.length > 2) {
                    ctx.beginPath();
                    ctx.moveTo(polygon[0][0], polygon[0][1]);
                    for (let pointIndex = 1; pointIndex < polygon.length; pointIndex += 1) {
                        ctx.lineTo(polygon[pointIndex][0], polygon[pointIndex][1]);
                    }
                    ctx.closePath();

                    ctx.fillStyle = `${color}26`;
                    ctx.fill();

                    ctx.shadowColor = '#07111f';
                    ctx.shadowBlur = 10;
                    ctx.strokeStyle = '#07111f';
                    ctx.lineWidth = 14;
                    ctx.stroke();

                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 7;
                    ctx.stroke();
                } else if (detection.bbox) {
                    const [x1, y1, x2, y2] = detection.bbox;
                    ctx.shadowColor = '#07111f';
                    ctx.shadowBlur = 10;
                    ctx.strokeStyle = '#07111f';
                    ctx.lineWidth = 14;
                    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 7;
                    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                }

                if (detection.bbox) {
                    const [x1, y1] = detection.bbox;
                    ctx.font = 'bold 16px Arial';
                    const textWidth = ctx.measureText(label).width;
                    const labelX = Math.max(4, x1);
                    const labelY = Math.max(28, y1);
                    ctx.fillStyle = 'rgba(7, 17, 31, 0.94)';
                    ctx.fillRect(labelX, labelY - 28, textWidth + 16, 26);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(labelX, labelY - 28, textWidth + 16, 26);
                    ctx.fillStyle = '#F5F9FC';
                    ctx.fillText(label, labelX + 8, labelY - 10);
                }

                ctx.restore();
            });
        }

        function drawDetections(detections) {
            if (overlayClearTimer) {
                window.clearTimeout(overlayClearTimer);
                overlayClearTimer = null;
            }
            ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

            if (currentVisualizationMode === 'thick-borders') {
                drawThickBordersDetections(detections);
                return;
            }

            if (currentVisualizationMode === 'high-contrast') {
                drawHighContrastDetections(detections);
                return;
            }

            if (currentVisualizationMode === 'polygons') {
                drawPolygonsOnlyDetections(detections);
                return;
            }

            if (currentVisualizationMode === 'edge-focus') {
                drawEdgeFocusDetections(detections);
                return;
            }

            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFEAA7', '#DDA0DD'];

            detections.forEach((detection, index) => {
                const color = colors[index % colors.length];

                if (detection.bbox) {
                    const [x1, y1, x2, y2] = detection.bbox;
                    const width = x2 - x1;
                    const height = y2 - y1;

                    ctx.strokeStyle = color;
                    ctx.lineWidth = 4;
                    ctx.strokeRect(x1, y1, width, height);

                    ctx.fillStyle = color + '40';
                    ctx.fillRect(x1, y1, width, height);

                    ctx.fillStyle = color;
                    const text = `${detection.label} ${Math.round(detection.confidence * 100)}%`;
                    const textWidth = ctx.measureText(text).width;
                    ctx.fillRect(x1, y1 - 25, textWidth + 10, 25);
                    ctx.fillStyle = 'white';
                    ctx.font = '14px Arial';
                    ctx.fillText(text, x1 + 5, y1 - 8);
                }
            });
        }

        function scheduleOverlayClear() {
            if (overlayClearTimer) {
                window.clearTimeout(overlayClearTimer);
            }
            overlayClearTimer = window.setTimeout(() => {
                ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                overlayClearTimer = null;
            }, OVERLAY_PERSISTENCE_MS);
        }

        async function startCamera() {
            try {
                statusDiv.textContent = 'Starting rear camera...';
                statusDiv.style.borderLeftColor = '#f39c12';

                videoStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                });

                videoElement.srcObject = videoStream;

                videoElement.onloadedmetadata = () => {
                    previewCanvas.width = videoElement.videoWidth;
                    previewCanvas.height = videoElement.videoHeight;
                    document.querySelector('.video-container').style.aspectRatio =
                        `${videoElement.videoWidth} / ${videoElement.videoHeight}`;
                    document.getElementById('detectBtn').disabled = false;
                    document.getElementById('startBtn').disabled = true;
                    statusDiv.textContent = 'Camera active — ready to detect objects';
                    statusDiv.style.borderLeftColor = '#27ae60';
                };

            } catch (error) {
                statusDiv.textContent = 'Unable to access the camera: ' + error.message;
                statusDiv.style.borderLeftColor = '#e74c3c';
            }
        }

function startDetection() {
    isDetecting = true;
    resetLatencyMetrics();
            document.getElementById('detectBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            statusDiv.textContent = 'Detection active — connected to YOLO26';
            statusDiv.style.borderLeftColor = '#f39c12';

            detectionInterval = setInterval(processVideoFrame, 500);
        }

        function stopDetection() {
            isDetecting = false;
            if (fieldTestActive) stopFieldTestSession();
            if (detectionInterval) {
                clearInterval(detectionInterval);
                detectionInterval = null;
            }
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
            }
            if (overlayClearTimer) {
                window.clearTimeout(overlayClearTimer);
                overlayClearTimer = null;
            }
            document.getElementById('detectBtn').disabled = true;
            document.getElementById('stopBtn').disabled = true;
            document.getElementById('startBtn').disabled = false;
            statusDiv.textContent = 'Detection stopped';
            statusDiv.style.borderLeftColor = '#e74c3c';
            document.getElementById('objectCount').textContent = '0';
            document.getElementById('currentMode').textContent = 'Boxes';
            if (speechSynth) speechSynth.cancel();

            ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            document.getElementById('detectionsList').innerHTML = 'Waiting for detections...';
        }

async function processVideoFrame() {
    if (!isDetecting || processingFrame) return;

    processingFrame = true;
    const detectionStartedAt = performance.now();

            try {
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = videoElement.videoWidth;
                tempCanvas.height = videoElement.videoHeight;
                tempCtx.drawImage(videoElement, 0, 0);

                const blob = await new Promise(resolve => {
                    tempCanvas.toBlob(resolve, 'image/jpeg', 0.8);
                });

                const formData = new FormData();
                formData.append('image', blob, 'frame.jpg');

                const response = await fetch(API_BASE + '/api/process', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error('Server error');

                const result = await response.json();

        if (result.success) {
                    const detections = result.data.detections || [];
                    document.getElementById('objectCount').textContent = detections.length;
                    drawDetections(detections);
                    scheduleOverlayClear();
                    updateDetectionsList(detections);

            statusDiv.textContent = `Detected objects: ${detections.length}`;
            statusDiv.style.borderLeftColor = '#27ae60';
            setConnectionStatus('online', 'Detection service connected');
            const latencyMs = performance.now() - detectionStartedAt;
            recordLatency(latencyMs);
            const audioAnnouncement = processAudioGuidance(detections);
            recordFieldTestSample(detections, latencyMs, audioAnnouncement);
                } else {
                    throw new Error(result.error || 'Detection error');
                }

            } catch (error) {
        console.error('Frame processing error:', error);
        statusDiv.textContent = 'Connection error — retrying...';
        statusDiv.style.borderLeftColor = '#e74c3c';
        setConnectionStatus('offline', 'Unable to reach the detection service');
            } finally {
                processingFrame = false;
            }
        }

        function updateDetectionsList(detections) {
            const detectionsList = document.getElementById('detectionsList');

            if (detections.length === 0) {
                detectionsList.innerHTML = '<div style="color: #bdc3c7;">No objects detected</div>';
                return;
            }

            detectionsList.innerHTML = '';

            detections.forEach((detection, index) => {
                const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFEAA7', '#DDA0DD'];
                const color = colors[index % colors.length];

                const detectionItem = document.createElement('div');
                detectionItem.className = 'detection-item';
                detectionItem.style.borderLeftColor = color;
                detectionItem.innerHTML = `
                    <div class="detection-header">
                        <span class="detection-label">${detection.label}</span>
                        <span class="detection-confidence">${Math.round(detection.confidence * 100)}%</span>
                    </div>
                    <div class="detection-position">Position: ${detection.zone || 'N/A'}</div>
                `;
                detectionsList.appendChild(detectionItem);
            });
        }

window.addEventListener('online', refreshBackendStatus);
window.addEventListener('offline', refreshBackendStatus);
window.addEventListener('beforeunload', () => {
    if (fieldTestActive) {
        appendFieldTestRecord(
            'session_end',
            latestDetections,
            latestLatencyMs,
            '',
            latestAudioAnnouncement
        );
        fieldTestActive = false;
    }
    saveFieldTestRecords();
});
loadFieldTestRecords();
updateFieldTestUi();
initializeAudioGuidance();
refreshBackendStatus();
window.setInterval(refreshBackendStatus, 30000);
