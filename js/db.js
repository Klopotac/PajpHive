// db.js — Firestore data operations

import { db } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { generateInviteCode } from "./ui.js";

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function deleteRefsInBatches(refs, batchSize = 450) {
  for (let i = 0; i < refs.length; i += batchSize) {
    const batch = writeBatch(db);
    refs.slice(i, i + batchSize).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

// ── Apiaries ──────────────────────────────────────────────────────────────────

export async function createApiary(userId, apiaryName) {
  const inviteCode = generateInviteCode();
  const ref = doc(collection(db, "apiaries"));
  await setDoc(ref, {
    name: apiaryName,
    ownerId: userId,
    members: [userId],
    inviteCode,
    createdAt: serverTimestamp()
  });
  return { id: ref.id, inviteCode };
}

export async function getApiariesByUser(userId) {
  const q = query(collection(db, "apiaries"), where("members", "array-contains", userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getApiaryByInviteCode(code) {
  const q = query(collection(db, "apiaries"), where("inviteCode", "==", code));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function joinApiary(apiaryId, userId) {
  const ref = doc(db, "apiaries", apiaryId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Apiary not found");
  const data = snap.data();
  if (data.members.length >= 3) throw new Error("Apiary is full (max 3 members)");
  if (data.members.includes(userId)) return;
  await updateDoc(ref, { members: [...data.members, userId] });
}

export async function getApiary(apiaryId) {
  const snap = await getDoc(doc(db, "apiaries", apiaryId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function deleteApiary(apiaryId) {
  await deleteDoc(doc(db, "apiaries", apiaryId));
}

export async function deleteHiveDeep(hiveId) {
  // Deletes a hive doc plus its related inspections and reminders.
  const inspectionsQ = query(collection(db, "inspections"), where("hiveId", "==", hiveId));
  const remindersQ = query(collection(db, "reminders"), where("hiveId", "==", hiveId));

  const [inspectionsSnap, remindersSnap] = await Promise.all([
    getDocs(inspectionsQ),
    getDocs(remindersQ)
  ]);

  const inspectionRefs = inspectionsSnap.docs.map(d => d.ref);
  const reminderRefs = remindersSnap.docs.map(d => d.ref);

  if (inspectionRefs.length > 0) await deleteRefsInBatches(inspectionRefs);
  if (reminderRefs.length > 0) await deleteRefsInBatches(reminderRefs);

  await deleteDoc(doc(db, "hives", hiveId));
}

export async function deleteApiaryDeep(apiaryId) {
  // Deletes an apiary plus all its hives, and related inspections/reminders.
  const hivesSnap = await getDocs(query(collection(db, "hives"), where("apiaryId", "==", apiaryId)));
  const hiveIds = hivesSnap.docs.map(d => d.id);

  // Delete inspections/reminders by hiveId to ensure correctness even if some docs were mis-assigned.
  const inspectionRefsMap = new Map(); // path -> DocumentReference
  const reminderRefsMap = new Map(); // path -> DocumentReference

  const addToMap = (map, docRef) => map.set(docRef.path, docRef);

  const hiveIdChunks = chunkArray(hiveIds, 10); // Firestore 'in' supports up to 10 values
  for (const chunk of hiveIdChunks) {
    if (chunk.length === 0) continue;

    const inspectionsQ = query(collection(db, "inspections"), where("hiveId", "in", chunk));
    const remindersQ = query(collection(db, "reminders"), where("hiveId", "in", chunk));

    const [inspectionsSnap, remindersSnap] = await Promise.all([
      getDocs(inspectionsQ),
      getDocs(remindersQ)
    ]);

    inspectionsSnap.docs.forEach(d => addToMap(inspectionRefsMap, d.ref));
    remindersSnap.docs.forEach(d => addToMap(reminderRefsMap, d.ref));
  }

  // Extra safety: also delete by apiaryId in case any docs were created with inconsistent hiveId.
  const [inspectionsByApiary, remindersByApiary] = await Promise.all([
    getDocs(query(collection(db, "inspections"), where("apiaryId", "==", apiaryId))),
    getDocs(query(collection(db, "reminders"), where("apiaryId", "==", apiaryId)))
  ]);

  inspectionsByApiary.docs.forEach(d => addToMap(inspectionRefsMap, d.ref));
  remindersByApiary.docs.forEach(d => addToMap(reminderRefsMap, d.ref));

  const inspectionRefs = [...inspectionRefsMap.values()];
  const reminderRefs = [...reminderRefsMap.values()];

  if (reminderRefs.length > 0) await deleteRefsInBatches(reminderRefs);
  if (inspectionRefs.length > 0) await deleteRefsInBatches(inspectionRefs);

  const hiveRefs = hivesSnap.docs.map(d => d.ref);
  if (hiveRefs.length > 0) await deleteRefsInBatches(hiveRefs);

  await deleteDoc(doc(db, "apiaries", apiaryId));
}

// ── Hives ──────────────────────────────────────────────────────────────────────

export async function createHive(apiaryId, name) {
  const ref = doc(collection(db, "hives"));
  const nfcUrl = `${window.location.origin}/hive.html?id=${ref.id}`;
  await setDoc(ref, {
    apiaryId,
    name,
    nfcUrl,
    createdAt: serverTimestamp(),
    lastInspection: null
  });
  return { id: ref.id, nfcUrl };
}

export async function getHive(hiveId) {
  const snap = await getDoc(doc(db, "hives", hiveId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateHive(hiveId, data) {
  await updateDoc(doc(db, "hives", hiveId), data);
}

export async function deleteHive(hiveId) {
  await deleteDoc(doc(db, "hives", hiveId));
}

export function listenHives(apiaryId, callback) {
  const q = query(collection(db, "hives"), where("apiaryId", "==", apiaryId));
  return onSnapshot(q, (snap) => {
    const hives = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    hives.sort((a, b) => {
      const at = a.createdAt?.seconds || 0;
      const bt = b.createdAt?.seconds || 0;
      return bt - at;
    });
    callback(hives);
  });
}

// ── Inspections ───────────────────────────────────────────────────────────────

export async function saveInspection(data) {
  const ref = doc(collection(db, "inspections"));
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    syncedAt: serverTimestamp()
  });
  if (data.hiveId) {
    await updateDoc(doc(db, "hives", data.hiveId), { lastInspection: serverTimestamp() });
  }
  return ref.id;
}

export function listenInspections(hiveId, callback) {
  const q = query(collection(db, "inspections"), where("hiveId", "==", hiveId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── Reminders ─────────────────────────────────────────────────────────────────

export async function addReminder(apiaryId, hiveId, text, dueDate) {
  await addDoc(collection(db, "reminders"), {
    apiaryId, hiveId, text,
    dueDate: Timestamp.fromDate(new Date(dueDate)),
    done: false,
    createdAt: serverTimestamp()
  });
}

export async function toggleReminder(reminderId, done) {
  await updateDoc(doc(db, "reminders", reminderId), { done });
}

export function listenReminders(apiaryId, callback) {
  const q = query(collection(db, "reminders"), where("apiaryId", "==", apiaryId), orderBy("dueDate", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
