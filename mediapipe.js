const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const BUNDLE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

let visionModulePromise = null;
let handLandmarker = null;
let mediaStream = null;
let animationFrameId = null;
let latestPointerX = 0.5;
let latestPointerY = 0.5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function drawCircle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawLine(ctx, a, b, color, width = 2) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20]
];

async function loadVisionModule() {
  if (!visionModulePromise) {
    visionModulePromise = import(BUNDLE_URL);
  }
  return visionModulePromise;
}

async function createLandmarker() {
  if (handLandmarker) return handLandmarker;

  const vision = await loadVisionModule();
  const { FilesetResolver, HandLandmarker } = vision;

  const filesetResolver = await FilesetResolver.forVisionTasks(WASM_URL);
  handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return handLandmarker;
}

function isFingerUp(landmarks, tip, pip) {
  return landmarks[tip].y < landmarks[pip].y;
}

function getGestureLabel(landmarks) {
  if (!landmarks || landmarks.length < 21) return "-";
  return getExtendedGestureFromLandmarks(landmarks);
}

function getExtendedGestureFromLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 21) return "-";

  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];
  const wrist = landmarks[0];

  const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
  if (pinchDist < 0.06) return "Pinch";

  const idx  = isFingerUp(landmarks, 8, 6);
  const mid  = isFingerUp(landmarks, 12, 10);
  const ring = isFingerUp(landmarks, 16, 14);
  const pink = isFingerUp(landmarks, 20, 18);
  const upCount = [idx, mid, ring, pink].filter(Boolean).length;

  if (upCount === 4) return "Open Palm";
  if (upCount === 3 && idx && mid && ring) return "Three Fingers";
  if (upCount === 2 && idx && mid) return "Two Fingers";
  if (upCount === 1 && idx) return "One Finger";
  if (upCount === 0) return "Fist";

  return "Tracking";
}

function getExtendedGesture(result) {
  if (!result?.landmarks?.length) return "-";
  return getExtendedGestureFromLandmarks(result.landmarks[0]);
}

function mirrorX(normalizedX) {
  // Camera/game direction fix: keep real X direction instead of reversing it.
  return normalizedX;
}

function drawLandmarks(result, canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!result?.landmarks?.length) return;

  const landmarks = result.landmarks[0].map((point) => ({
    x: mirrorX(point.x) * canvas.width,
    y: point.y * canvas.height,
  }));

  for (const [aIndex, bIndex] of CONNECTIONS) {
    drawLine(ctx, landmarks[aIndex], landmarks[bIndex], "rgba(110,168,255,0.85)", 3);
  }

  for (let i = 0; i < landmarks.length; i += 1) {
    drawCircle(ctx, landmarks[i].x, landmarks[i].y, i === 8 ? 8 : 5, i === 8 ? "#74f0c1" : "#ffffff");
  }
}

function updatePointerFromResult(result) {
  if (!result?.landmarks?.length) return { hasHand: false, gesture: "-" };

  const landmarks = result.landmarks[0];
  const gesture = getExtendedGestureFromLandmarks(landmarks);
  const indexTip = landmarks[8];

  // IMPORTANT: this must run even when statusElements is null.
  // Game mode passes statusElements:null, so updating pointer only inside
  // updateStatusElements made the games stay stuck at center (0.5).
  latestPointerX = clamp(mirrorX(indexTip.x), 0, 1);
  latestPointerY = clamp(indexTip.y, 0, 1);

  return { hasHand: true, gesture };
}

function updateStatusElements(statusElements, result, pointerInfo) {
  if (!statusElements) return;

  const info = pointerInfo || updatePointerFromResult(result);
  statusElements.hand.textContent = info.hasHand ? "Илэрсэн" : "Илрээгүй";

  if (!info.hasHand) {
    statusElements.gesture.textContent = "-";
    statusElements.x.textContent = "-";
    return;
  }

  statusElements.gesture.textContent = info.gesture;
  statusElements.x.textContent = latestPointerX.toFixed(2);
}

function stopLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function stopStream(video) {
  stopLoop();

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (video) {
    video.srcObject = null;
  }
}

async function startCamera({ video, canvas, statusElements, onResults }) {
  await createLandmarker();
  stopStream(video);

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
    audio: false,
  });

  video.srcObject = mediaStream;

  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });

  await video.play();

  if (statusElements?.camera) {
    statusElements.camera.textContent = "Асаалттай";
  }

  const render = () => {
    if (!handLandmarker || video.readyState < 2) {
      animationFrameId = requestAnimationFrame(render);
      return;
    }

    canvas.width = video.videoWidth || canvas.clientWidth || 640;
    canvas.height = video.videoHeight || canvas.clientHeight || 480;

    const result = handLandmarker.detectForVideo(video, performance.now());
    const pointerInfo = updatePointerFromResult(result);
    drawLandmarks(result, canvas);
    updateStatusElements(statusElements, result, pointerInfo);

    if (typeof onResults === "function") {
      onResults({
        result,
        pointerX: latestPointerX,
        pointerY: latestPointerY,
        gesture: pointerInfo.gesture,
        hasHand: pointerInfo.hasHand,
      });
    }

    animationFrameId = requestAnimationFrame(render);
  };

  render();
}

function stopCamera({ video, canvas, statusElements }) {
  stopStream(video);

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (statusElements?.camera) statusElements.camera.textContent = "Унтарсан";
  if (statusElements?.hand) statusElements.hand.textContent = "Илрээгүй";
  if (statusElements?.gesture) statusElements.gesture.textContent = "-";
  if (statusElements?.x) statusElements.x.textContent = "-";
}

export { startCamera, stopCamera, getExtendedGesture };
