// ai.js — Communication with the local HiveVoice AI server

// API key — must match API_KEY env var on your server
const AI_API_KEY = "hivevoice-secret-key-change-me";

// LAN address (direct, fast when on home wifi)
const AI_SERVER_LAN = "http://192.168.0.50:7700";

// External address via DuckDNS / Caddy (used when away from home)
// Replace with your actual DuckDNS hostname:
const AI_SERVER_WAN = "https://hiveapi.pajp.duckdns.org";

/**
 * Pick the best server: try LAN first (fast), fall back to WAN.
 * Result is cached for the lifetime of the page.
 */
let _resolvedServer = null;
async function getAIServer() {
  if (_resolvedServer) return _resolvedServer;

  // Try LAN first — if blocked or unreachable, always fall back to WAN
  try {
    const resp = await fetch(`${AI_SERVER_LAN}/health`, {
      headers: { "X-HiveVoice-Key": AI_API_KEY },
      signal: AbortSignal.timeout(3000)
    });
    if (resp.ok) {
      _resolvedServer = AI_SERVER_LAN;
      console.log("[AI] Using LAN server");
      return _resolvedServer;
    }
  } catch (e) {
    // Covers: timeout, network blocked, permission denied — all fall through to WAN
    console.log("[AI] LAN not available (", e.message, "), trying WAN...");
  }

  // Try WAN (DuckDNS) — verify it's actually reachable before committing
  try {
    const resp = await fetch(`${AI_SERVER_WAN}/health`, {
      headers: { "X-HiveVoice-Key": AI_API_KEY },
      signal: AbortSignal.timeout(8000)
    });
    if (resp.ok) {
      _resolvedServer = AI_SERVER_WAN;
      console.log("[AI] Using WAN server (DuckDNS)");
      return _resolvedServer;
    }
  } catch (e) {
    console.log("[AI] WAN also not available:", e.message);
  }

  // Both unreachable — return WAN anyway so the main request gives a clear error
  _resolvedServer = AI_SERVER_WAN;
  return _resolvedServer;
}

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
  const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min max

  const server = await getAIServer();
  try {
    const resp = await fetch(`${server}/api/process-inspection`, {
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
  const server = await getAIServer();
  try {
    const resp = await fetch(`${server}/health`, {
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
