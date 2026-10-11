
import {
  FaceLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

import "./style.css";

const video = document.querySelector("#webcam");
const canvas = document.querySelector("#output");
const startButton = document.querySelector("#startButton");
const statusText = document.querySelector("#status");
const context = canvas.getContext("2d");

let faceLandmarker;
let drawingUtils;
let animationId;
let lastVideoTime = -1;

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

    statusText.textContent = "Camera started. Looking for your face...";
    renderFrame();
  } catch (error) {
    console.error(error);
    statusText.textContent = `Error: ${error.message}`;
    startButton.disabled = false;
  }
}

function renderFrame() {
  if (
    video.readyState >= 2 &&
    video.currentTime !== lastVideoTime
  ) {
    lastVideoTime = video.currentTime;

    const results = faceLandmarker.detectForVideo(
      video,
      performance.now()
    );

    context.clearRect(0, 0, canvas.width, canvas.height);

    if (results.faceLandmarks.length > 0) {
      for (const landmarks of results.faceLandmarks) {
        drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          {
            color: "#00E5FF",
            lineWidth: 0.5,
          }
        );
      }

      statusText.textContent =
        `Tracking active. Faces detected: ${results.faceLandmarks.length}`;
    } else {
      statusText.textContent =
        "Camera running. Move your face into view.";
    }
  }

  animationId = requestAnimationFrame(renderFrame);
}

startButton.addEventListener("click", startTracking);

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationId);

  if (video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
  }

  faceLandmarker?.close();
});