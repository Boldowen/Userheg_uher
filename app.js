import { startCamera, stopCamera } from "./mediapipe.js";
import { GestureGameEngine } from "./game.js";

// ─── Game Engine ───────────────────────────────────────────────
const gameEngine = new GestureGameEngine({
  canvas:  document.getElementById("gameCanvas"),
  scoreEl: document.getElementById("scoreValue"),
  livesEl: document.getElementById("livesValue"),
  stateEl: document.getElementById("gameState"),
  levelEl: document.getElementById("levelValue"),
});
window.gameEngine = gameEngine;

// ─── Camera elements ──────────────────────────────────────────
const camera     = document.getElementById("camera");
const overlay    = document.getElementById("overlay");
const gameCamera = document.getElementById("gameCamera");
const gameOverlay= document.getElementById("gameOverlay");

// Mouse / touch fallback: тоглоом камергүй үед ч хөдөлнө
function bindGamePointerFallback() {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas || canvas.dataset.fallbackBound === "1") return;
  canvas.dataset.fallbackBound = "1";

  function setFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    gameEngine.setPointerXY(x, y);
  }

  canvas.addEventListener("mousemove", (e) => setFromClient(e.clientX, e.clientY));
  canvas.addEventListener("touchmove", (e) => {
    if (!e.touches.length) return;
    e.preventDefault();
    setFromClient(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    const step = e.shiftKey ? 0.095 : 0.06;
    if (e.key === "ArrowLeft" || key === "a") {
      e.preventDefault();
      gameEngine.setPointerX(gameEngine.pointerX - step);
    } else if (e.key === "ArrowRight" || key === "d") {
      e.preventDefault();
      gameEngine.setPointerX(gameEngine.pointerX + step);
    } else if (key === " " || key === "enter") {
      e.preventDefault();
      gameEngine.start();
    }
  });
}
bindGamePointerFallback();

// ─── Status elements ─────────────────────────────────────────
const statEls = {
  camera:  document.getElementById("cameraStatus"),
  hand:    document.getElementById("handStatus"),
  gesture: document.getElementById("gestureStatus"),
  x:       document.getElementById("xStatus"),
};

// ─── Smart Home gesture debounce ─────────────────────────────
const gestureLog = {};
const DEBOUNCE   = 1400;

function applySmartHomeGesture(gesture) {
  const now = Date.now();
  if (gestureLog[gesture] && now - gestureLog[gesture] < DEBOUNCE) return;
  gestureLog[gesture] = now;

  const sys   = document.getElementById("sysStatus");
  const pulse = document.getElementById("sysPulse");
  pulse.classList.add("active");
  setTimeout(() => pulse.classList.remove("active"), 1500);

  switch (gesture) {
    case "One Finger":
      document.getElementById("tog-light").classList.toggle("on");
      sys.textContent = "ГЭРЭЛ: " + (document.getElementById("tog-light").classList.contains("on") ? "ON" : "OFF");
      // Sync brightness bar
      _updateBrightnessFromGesture();
      break;
    case "Two Fingers":
      document.getElementById("tog-temp").classList.toggle("on");
      sys.textContent = "ДУЛААН: " + (document.getElementById("tog-temp").classList.contains("on") ? "ON" : "OFF");
      break;
    case "Three Fingers":
      document.getElementById("tog-music").classList.toggle("on");
      sys.textContent = "ХӨГЖИМ: " + (document.getElementById("tog-music").classList.contains("on") ? "ON" : "OFF");
      break;
    case "Open Palm":
      ["tog-light","tog-temp","tog-music"].forEach(id =>
        document.getElementById(id).classList.remove("on")
      );
      sys.textContent = "БҮГД: УНТРААСАН";
      break;
    case "Pinch":
      if (typeof window.togDoor === "function") window.togDoor();
      sys.textContent = "ХААЛГА: ТОХИРУУЛСАН";
      break;
    case "Fist":
      sys.textContent = "⚠ АЮУЛЫН ДОХИО";
      _flashAlert();
      break;
    default:
      break;
  }
}

function _updateBrightnessFromGesture() {
  const on = document.getElementById("tog-light").classList.contains("on");
  const bar = document.getElementById("brightBar");
  const val = document.getElementById("brightVal");
  if (bar && val) { bar.style.width = on ? "70%" : "0%"; val.textContent = on ? "70%" : "0%"; }
}

function _flashAlert() {
  document.body.style.boxShadow = "inset 0 0 60px rgba(255,77,107,0.3)";
  setTimeout(() => document.body.style.boxShadow = "", 800);
}

// ─── Brightness control via X position ───────────────────────
let brightnessControlActive = false;
function updateBrightness(x) {
  if (!document.getElementById("tog-light").classList.contains("on")) return;
  if (!brightnessControlActive) return;
  const pct = Math.round(x * 100);
  const bar = document.getElementById("brightBar");
  const val = document.getElementById("brightVal");
  if (bar) bar.style.width = pct + "%";
  if (val) val.textContent = pct + "%";
}

// Enable brightness mode on Two Finger hold
let brightnessModeTimer = null;

// ─── Mode management ─────────────────────────────────────────
let activeMode = null;

async function enableDetect() {
  if (activeMode === "game") disableGame();
  activeMode = "detect";

  await startCamera({
    video: camera, canvas: overlay,
    statusElements: statEls,
    onResults: ({ gesture, pointerX }) => {
      if (gesture && gesture !== "-" && gesture !== "Tracking") {
        applySmartHomeGesture(gesture);
      }
      // Live brightness: while One Finger held, X controls brightness
      if (gesture === "One Finger") {
        brightnessControlActive = true;
        updateBrightness(pointerX);
      } else {
        brightnessControlActive = false;
      }
      // Volume: while Three Fingers held, X controls volume
      if (gesture === "Three Fingers") {
        _updateVolume(pointerX);
      }
    },
  });
}

function disableDetect() {
  stopCamera({ video: camera, canvas: overlay, statusElements: statEls });
  if (activeMode === "detect") activeMode = null;
}

function _updateVolume(x) {
  const pct = Math.round(x * 100);
  const bar = document.getElementById("volBar");
  const val = document.getElementById("volVal");
  if (bar) bar.style.width = pct + "%";
  if (val) val.textContent = pct + "%";
}

// ─── Game mode ────────────────────────────────────────────────
async function enableGame() {
  disableDetect();
  activeMode = "game";

  // Game loop-ийг эхлээд асаана. Камер/MediaPipe удаан ачаалсан ч тоглоом гацахгүй.
  gameEngine.start();

  try {
    await startCamera({
      video: gameCamera, canvas: gameOverlay,
      statusElements: null,
      onResults: ({ pointerX, pointerY, gesture }) => {
        gameEngine.setPointerXY(pointerX, pointerY);

        // Gesture controls: Fist = pause/resume, Pinch = restart
        if (gesture === "Fist") {
          _handleGameGesture("pause");
        } else if (gesture === "Pinch") {
          _handleGameGesture("restart");
        }
      },
    });
  } catch (e) {
    console.warn("Game camera unavailable, using mouse/touch/keyboard fallback:", e);
  }
}

const gameGestureLog = {};
function _handleGameGesture(action) {
  const now = Date.now();
  if (gameGestureLog[action] && now - gameGestureLog[action] < 1800) return;
  gameGestureLog[action] = now;
  if (action === "pause") gameEngine.togglePause();
  if (action === "restart" && document.getElementById("gameState").textContent === "Game Over") {
    gameEngine.restart();
  }
}

function disableGame() {
  stopCamera({ video: gameCamera, canvas: gameOverlay, statusElements: null });
  gameEngine.stop();
  if (activeMode === "game") activeMode = null;
}

// ─── Button wiring ────────────────────────────────────────────
document.getElementById("startCameraBtn").addEventListener("click", async () => {
  try { await enableDetect(); }
  catch (e) { alert("Камер асаахад алдаа: " + e.message + "\nlocalhost эсвэл https дээр нээнэ үү."); }
});
document.getElementById("stopCameraBtn").addEventListener("click", disableDetect);

document.getElementById("startGameBtn").addEventListener("click", async () => {
  await enableGame();
});
document.getElementById("stopGameBtn").addEventListener("click",    disableGame);
document.getElementById("restartGameBtn").addEventListener("click", () => gameEngine.restart());

// ─── Pause button ─────────────────────────────────────────────
const pauseBtn = document.getElementById("pauseGameBtn");
if (pauseBtn) pauseBtn.addEventListener("click", () => gameEngine.togglePause());

window.addEventListener("beforeunload", () => { disableDetect(); disableGame(); });
