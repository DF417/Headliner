# Headliner

## Overview

This project demonstrates real-time facial landmark tracking using MediaPipe in a web browser. It uses a webcam to detect a face and display landmarks that follow facial movements.

This is an initial experiment for our hands-free page-turning project. It helps us test facial tracking before implementing head movement gestures to turn PDF pages.

## Sources

- Official MediaPipe Face Landmarker Web Guide: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
- MediaPipe Tasks Vision npm Package: https://www.npmjs.com/package/@mediapipe/tasks-vision

## Requirements

- Node.js and npm installed
- A webcam
- A supported web browser, such as Google Chrome
- An internet connection to load the MediaPipe model and WebAssembly files

## Setup

1. Open a terminal at the root of the `Headliner` repository.
2. Navigate to the MediaPipe tutorial folder:

   ```bash
   cd tutorials/mediapipe-face-landmarker
   ```

3. Install the required dependencies:

   ```bash
   npm install
   ```

## Running the Project

1. Make sure your terminal is inside the `tutorials/mediapipe-face-landmarker` folder.
2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open the local URL displayed in the terminal, usually `http://localhost:5173/`.
4. Click **Start webcam tracking**.
5. Allow the browser to access your webcam.
6. Move your head and check that the facial landmarks follow your movements.

## Expected Result

The webcam feed should appear on the page, with facial landmarks drawn over the detected face. The status message should indicate when a face is being tracked.

## Notes

The application processes webcam video in the browser. It loads the MediaPipe model and WebAssembly resources from online URLs, so an internet connection is required.

## Next Steps

Explore detecting head tilts and nods to support hands-free PDF page turning.