// recording.js — MediaRecorder wrapper for voice recording

// Detect best MIME type for this device
function getSupportedMimeType() {
  const types = [
    "audio/mp4",       // iOS Safari prefers mp4
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus"
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

let mediaRecorder = null;
let audioChunks = [];
let stream = null;
let timerInterval = null;
let secondsElapsed = 0;

// Request microphone permission. Returns true if granted.
export async function requestMicPermission() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch (e) {
    console.error("Mic permission denied:", e);
    return false;
  }
}

// Start recording. Calls onTick(seconds) every second.
export function startRecording(onTick) {
  if (!stream) throw new Error("No audio stream. Call requestMicPermission first.");
  audioChunks = [];
  secondsElapsed = 0;

  const mimeType = getSupportedMimeType();
  const options = mimeType ? { mimeType } : {};
  mediaRecorder = new MediaRecorder(stream, options);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.start(1000); // collect data every 1s

  timerInterval = setInterval(() => {
    secondsElapsed++;
    if (onTick) onTick(secondsElapsed);
  }, 1000);
}

// Stop recording. Returns a Blob of the recorded audio.
export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      resolve(null);
      return;
    }
    clearInterval(timerInterval);
    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType || "audio/webm";
      const blob = new Blob(audioChunks, { type: mimeType });
      resolve(blob);
    };
    mediaRecorder.stop();
  });
}

// Release microphone
export function releaseMic() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  clearInterval(timerInterval);
}

// Format seconds as MM:SS
export function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

// Acquire Wake Lock so screen stays on
export async function acquireWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      const lock = await navigator.wakeLock.request("screen");
      return lock;
    }
  } catch (e) {
    console.warn("Wake Lock not available:", e.message);
  }
  return null;
}

// Release Wake Lock
export function releaseWakeLock(lock) {
  try {
    if (lock) lock.release();
  } catch (e) {
    console.warn("Wake Lock release error:", e.message);
  }
}
