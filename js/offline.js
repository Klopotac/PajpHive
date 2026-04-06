// offline.js — IndexedDB offline sync logic

const DB_NAME = "hivevoice";
const DB_VERSION = 1;
const STORE_AUDIO = "pending_audio";
const STORE_META = "pending_meta";

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

export async function saveAudioOffline(localId, blob) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, "readwrite");
    tx.objectStore(STORE_AUDIO).put({ localId, blob });
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function saveMetaOffline(meta) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    // Preserve all meta fields (including notes) exactly as passed
    tx.objectStore(STORE_META).put(meta);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getPendingMetas() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getAudioBlob(localId) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, "readonly");
    const req = tx.objectStore(STORE_AUDIO).get(localId);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = (e) => reject(e.target.error);
  });
}

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

export async function syncPending(apiaryId) {
  if (!navigator.onLine) return 0;

  const { uploadAudio } = await import("./storage.js");
  const { saveInspection } = await import("./db.js");

  const pending = await getPendingMetas();
  let count = 0;
  const errors = [];

  for (const meta of pending) {
    try {
      const blob = await getAudioBlob(meta.localId);
      let audioUrl = "";
      if (blob) {
        // Use the meta's own apiaryId, not the currently active one — they may differ
        audioUrl = await uploadAudio(blob, meta.localId, meta.apiaryId || apiaryId);
      }
      await saveInspection({
        hiveId: meta.hiveId,
        apiaryId: meta.apiaryId || apiaryId,
        recordedBy: meta.recordedBy,
        audioUrl,
        transcript: "",
        notes: meta.notes || "",   // Preserve offline-entered notes
        reminders: []
      });
      await deleteSynced(meta.localId);
      count++;
    } catch (err) {
      console.error("Sync failed for", meta.localId, err);
      errors.push(meta.localId);
    }
  }

  if (errors.length > 0) {
    console.warn(`${errors.length} recording(s) failed to sync and will retry next time.`);
  }

  return count;
}

export async function pendingCount() {
  const metas = await getPendingMetas();
  return metas.length;
}
