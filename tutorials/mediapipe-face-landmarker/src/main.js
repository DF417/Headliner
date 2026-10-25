import {
  FaceLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

import "./style.css";

// Initial settings. Adjust these after testing.
const SETTINGS = {
  tiltDegrees: 15,
  neutralDegrees: 7,
  holdMs: 300,
  cooldownMs: 800,
  calibrationMs: 1000,
  calibrationMaxSpread: 4,
  smoothingMs: 100,
};

// MediaPipe outer eye-corner landmarks.
const EYE_CORNERS = [33, 263];

const video = document.querySelector("#webcam");
const canvas = document.querySelector("#output");
const context = canvas.getContext("2d");

const startButton = document.querySelector("#startButton");
const calibrateButton = document.querySelector("#calibrateButton");
const pauseButton = document.querySelector("#pauseButton");
const reverseDirection = document.querySelector("#reverseDirection");

const statusText = document.querySelector("#status");
const gestureStatus = document.querySelector("#gestureStatus");
const angleValue = document.querySelector("#angleValue");
const pageValue = document.querySelector("#pageValue");
const actionValue = document.querySelector("#actionValue");

let faceLandmarker;
let drawingUtils;
let animationId;
let lastVideoTime = -1;
let lastFrameTime = null;

let smoothedRoll = null;
let neutralRoll = null;
let calibration = null;
let faceVisible = false;
let paused = false;

// A gesture must start from neutral.
let armed = false;
let candidateDirection = null;
let candidateStartedAt = null;
let lastTurnAt = -Infinity;

let page = 5;
const totalPages = 10;

function resetGesture() {
  armed = false;
  candidateDirection = null;
  candidateStartedAt = null;
}

function clearCandidate() {
  candidateDirection = null;
  candidateStartedAt = null;
}

// These callbacks are the future PDF viewer connection points.
function onNextPage() {
  page = Math.min(totalPages, page + 1);
  pageValue.textContent = page;
  actionValue.textContent = "Next";
}

function onPreviousPage() {
  page = Math.max(1, page - 1);
  pageValue.textContent = page;
  actionValue.textContent = "Previous";
}

async function startTracking() {
  startButton.disabled = true;
  statusText.textContent = "Loading MediaPipe...";

  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      },
      runningMode: "VIDEO",
      numFaces: 1,
    });

    drawingUtils = new DrawingUtils(context);

    statusText.textContent = "Requesting webcam permission...";

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    video.srcObject = stream;
    await video.play();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    lastVideoTime = -1;
    lastFrameTime = null;

    statusText.textContent = "Camera started. Looking for your face...";
    renderFrame();
  } catch (error) {
    console.error(error);

    cancelAnimationFrame(animationId);
    video.srcObject?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;

    faceLandmarker?.close();
    faceLandmarker = null;

    startButton.disabled = false;
    calibrateButton.disabled = true;
    pauseButton.disabled = true;

    statusText.textContent = `Error: ${error.message}`;
  }
}

function calculateRoll(landmarks) {
  // Convert normalized coordinates into video pixels.
  const points = EYE_CORNERS.map((index) => ({
    x: landmarks[index].x * canvas.width,
    y: landmarks[index].y * canvas.height,
  }));

  // Always measure from image-left to image-right.
  points.sort((a, b) => a.x - b.x);

  const [left, right] = points;
  const dx = right.x - left.x;
  const dy = right.y - left.y;

  // Draw the eye reference line on the overlay.
  context.beginPath();
  context.moveTo(left.x, left.y);
  context.lineTo(right.x, right.y);
  context.strokeStyle = "#ffeb3b";
  context.lineWidth = 4;
  context.stroke();

  return Math.atan2(dy, dx) * (180 / Math.PI);
}

function updateCalibration(rawRoll, now) {
  calibration.samples.push(rawRoll);

  const elapsed = now - calibration.startedAt;

  gestureStatus.textContent =
    "Calibrating: keep your comfortable playing position still.";

  if (elapsed < SETTINGS.calibrationMs) {
    return;
  }

  const samples = calibration.samples;
  const spread = Math.max(...samples) - Math.min(...samples);

  calibration = null;
  calibrateButton.disabled = false;

  if (
    samples.length < 10 ||
    spread > SETTINGS.calibrationMaxSpread
  ) {
    gestureStatus.textContent =
      "Calibration unsuccessful. Hold still and calibrate again.";
    return;
  }

  neutralRoll =
    samples.reduce((sum, angle) => sum + angle, 0) / samples.length;

  smoothedRoll = neutralRoll;
  paused = false;

  pauseButton.disabled = false;
  pauseButton.textContent = "Pause page turns";
  angleValue.textContent = "0.0°";

  resetGesture();

  gestureStatus.textContent =
    "Calibrated. Stay neutral briefly, then try a tilt.";
}

function detectGesture(relativeRoll, now) {
  if (paused) {
    gestureStatus.textContent = "Page turns paused.";
    return;
  }

  const magnitude = Math.abs(relativeRoll);

  // Returning to neutral re-arms the detector.
  if (magnitude <= SETTINGS.neutralDegrees) {
    clearCandidate();

    if (now - lastTurnAt >= SETTINGS.cooldownMs) {
      armed = true;
      gestureStatus.textContent = "Ready for a tilt.";
    } else {
      gestureStatus.textContent = "Wait briefly in neutral.";
    }

    return;
  }

  if (!armed) {
    gestureStatus.textContent = "Return to neutral before another tilt.";
    return;
  }

  // Between the neutral zone and trigger angle: no gesture yet.
  if (magnitude < SETTINGS.tiltDegrees) {
    clearCandidate();
    gestureStatus.textContent = "Ready. Tilt a little farther.";
    return;
  }

  // In the unmirrored video coordinates, negative roll is
  // expected for the user's right tilt. Verify with the webcam.
  const direction = relativeRoll < 0 ? "next" : "previous";

  if (candidateDirection !== direction) {
    candidateDirection = direction;
    candidateStartedAt = now;
  }

  gestureStatus.textContent =
    `Hold ${direction === "next" ? "right" : "left"} tilt...`;

  if (now - candidateStartedAt < SETTINGS.holdMs) {
    return;
  }

  if (direction === "next") {
    onNextPage();
  } else {
    onPreviousPage();
  }

  lastTurnAt = now;
  resetGesture();

  gestureStatus.textContent = "Gesture accepted. Return to neutral.";
}

function handleMissingFace() {
  faceVisible = false;
  smoothedRoll = null;
  lastFrameTime = null;

  resetGesture();

  calibrateButton.disabled = true;
  angleValue.textContent = "—";

  if (calibration) {
    calibration = null;
    gestureStatus.textContent =
      "Calibration interrupted. Bring your face into view and try again.";
  } else {
    gestureStatus.textContent =
      "Face not detected. Page turns are waiting.";
  }

  statusText.textContent = "Camera running. Move your face into view.";
}

function renderFrame() {
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    const now = performance.now();

    // A long interruption must not count toward the gesture hold.
    if (lastFrameTime !== null && now - lastFrameTime > 250) {
      resetGesture();
      smoothedRoll = null;
      calibration = null;
    }

    const results = faceLandmarker.detectForVideo(video, now);

    context.clearRect(0, 0, canvas.width, canvas.height);

    const landmarks = results.faceLandmarks[0];

    if (!landmarks) {
      handleMissingFace();
    } else {
      faceVisible = true;
      calibrateButton.disabled = calibration !== null;
      statusText.textContent = "Face tracking active.";

      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#00E5FF", lineWidth: 0.5 }
      );

      const rawRoll = calculateRoll(landmarks);

      // Time-based smoothing reduces jitter.
      const dt = lastFrameTime === null ? 33 : now - lastFrameTime;
      const alpha = 1 - Math.exp(-dt / SETTINGS.smoothingMs);

      smoothedRoll =
        smoothedRoll === null
          ? rawRoll
          : smoothedRoll + alpha * (rawRoll - smoothedRoll);

      lastFrameTime = now;

      if (calibration) {
        updateCalibration(rawRoll, now);
      } else if (neutralRoll === null) {
        gestureStatus.textContent =
          "Sit in your playing position and click Calibrate.";
      } else {
        const directionMultiplier = reverseDirection.checked ? -1 : 1;

        const relativeRoll =
          (smoothedRoll - neutralRoll) * directionMultiplier;

        angleValue.textContent = `${relativeRoll.toFixed(1)}°`;

        detectGesture(relativeRoll, now);
      }
    }
  }

  animationId = requestAnimationFrame(renderFrame);
}

startButton.addEventListener("click", startTracking);

calibrateButton.addEventListener("click", () => {
  if (!faceVisible) return;

  neutralRoll = null;
  resetGesture();

  calibration = {
    startedAt: performance.now(),
    samples: [],
  };

  calibrateButton.disabled = true;
  pauseButton.disabled = true;
  angleValue.textContent = "—";
  gestureStatus.textContent = "Hold your comfortable position still.";
});

pauseButton.addEventListener("click", () => {
  paused = !paused;
  resetGesture();

  pauseButton.textContent =
    paused ? "Resume page turns" : "Pause page turns";

  gestureStatus.textContent =
    paused ? "Page turns paused." : "Return to neutral to continue.";
});

reverseDirection.addEventListener("change", () => {
  resetGesture();
  gestureStatus.textContent =
    "Direction mapping changed. Return to neutral.";
});

document.addEventListener("visibilitychange", () => {
  resetGesture();
  smoothedRoll = null;
  lastFrameTime = null;

  if (calibration) {
    calibration = null;
    calibrateButton.disabled = !faceVisible;
    gestureStatus.textContent =
      "Calibration interrupted. Calibrate again.";
  }
});

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationId);
  video.srcObject?.getTracks().forEach((track) => track.stop());
  faceLandmarker?.close();
});