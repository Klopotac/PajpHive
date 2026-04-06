// offline.js — IndexedDB + localStorage offline sync logic

const DB_NAME = "hivevoice";
const DB_VERSION = 1;
const STORE_AUDIO = "pending_audio";
const STORE_META = "pending_meta";

// ── IndexedDB Setup ───────────────────────────────────────────────────────────

let _db = null;

export function openOfflineDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: "localId" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "localId" });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

// Save audio blob locally for offline use
export async function saveAudioOffline(localId, blob) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, "readwrite");
    tx.objectStore(STORE_AUDIO).put({ localId, blob });
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

// Save inspection metadata for offline use
export async function saveMetaOffline(meta) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put(meta);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

// Get all pending (unsynced) metas
export async function getPendingMetas() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

// Get audio blob by localId
export async function getAudioBlob(localId) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, "readonly");
    const req = tx.objectStore(STORE_AUDIO).get(localId);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = (e) => reject(e.target.error);
  });
}

// Delete synced records
export async function deleteSynced(localId) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_AUDIO, STORE_META], "readwrite");
    tx.objectStore(STORE_AUDIO).delete(localId);
    tx.objectStore(STORE_META).delete(localId);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ── Sync Engine ───────────────────────────────────────────────────────────────

// Called when app loads online. Syncs any pending offline recordings.
export async function syncPending(apiaryId) {
  if (!navigator.onLine) return 0;

  // Lazy import to avoid circular deps
  const { uploadAudio } = await import("./storage.js");
  const { saveInspection } = await import("./db.js");

  const pending = await getPendingMetas();
  let count = 0;

  for (const meta of pending) {
    try {
      const blob = await getAudioBlob(meta.localId);
      let audioUrl = "";
      if (blob) {
        audioUrl = await uploadAudio(blob, meta.localId, apiaryId);
      }
      await saveInspection({
        hiveId: meta.hiveId,
        apiaryId: meta.apiaryId,
        recordedBy: meta.recordedBy,
        audioUrl,
        transcript: "",
        notes: "",
        reminders: []
      });
      await deleteSynced(meta.localId);
      count++;
    } catch (err) {
      console.error("Sync failed for", meta.localId, err);
    }
  }
  return count;
}

// Count how many recordings are waiting
export async function pendingCount() {
  const metas = await getPendingMetas();
  return metas.length;
}
