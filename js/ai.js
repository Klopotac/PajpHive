// ai.js — Communication with the local HiveVoice AI server

// On LAN (home wifi): use direct IP for speed
// On cellular (away from home): use external URL via Caddy
// Switch between the two by changing this constant:
const AI_SERVER = "https://hiveapi.pajp.duckdns.org";
// const AI_SERVER = "http://192.168.0.50:7700"; // LAN fallback

// API key — must match API_KEY env var on your server
const AI_API_KEY = "hivevoice-secret-key-change-me";

/**
 * Send an audio blob to the server for STT + AI processing.
 * Returns the 4-bucket JSON or throws on error.
 *
 * @param {Blob} audioBlob - the recorded audio blob from stopRecording()
 * @param {string} hiveId - Firestore hive ID
 * @param {string} apiaryId - Firestore apiary ID
 * @returns {Promise<{transcript, notes, warnings, reminders, todos}>}
 */
export async function processInspection(audioBlob, hiveId, apiaryId) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "inspection.webm");
  formData.append("hive_id", hiveId);
  formData.append("apiary_id", apiaryId);
  formData.append("today", new Date().toISOString().split("T")[0]); // YYYY-MM-DD

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min max

  try {
    const resp = await fetch(`${AI_SERVER}/api/process-inspection`, {
      method: "POST",
      body: formData,
      headers: {
        "X-HiveVoice-Key": AI_API_KEY
      },
      signal: controller.signal
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`AI server error ${resp.status}: ${err}`);
    }

    const result = await resp.json();
    return result;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("AI processing timed out after 2 minutes.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if the AI server is reachable.
 * Returns { reachable: bool, whisper: bool, ollama: bool }
 */
export async function checkAIServerHealth() {
  try {
    const resp = await fetch(`${AI_SERVER}/health`, {
      headers: { "X-HiveVoice-Key": AI_API_KEY },
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return { reachable: false, whisper: false, ollama: false };
    const data = await resp.json();
    return {
      reachable: true,
      whisper: !!data.whisper,
      ollama: !!data.ollama
    };
  } catch {
    return { reachable: false, whisper: false, ollama: false };
  }
}
