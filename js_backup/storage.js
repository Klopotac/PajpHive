// storage.js — Firebase Storage for audio uploads

import { storage } from "./firebase-config.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Upload an audio Blob to Firebase Storage.
// Returns the public download URL.
export async function uploadAudio(blob, inspectionId, apiaryId) {
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  const path = `audio/${apiaryId}/${inspectionId}.${ext}`;
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, blob, { contentType: blob.type });
  const url = await getDownloadURL(snapshot.ref);
  return url;
}
