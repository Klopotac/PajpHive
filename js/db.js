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
  if (data.members.includes(userId)) throw new Error("You are already a member of this apiary");
  if (data.members.length >= 3) throw new Error("This apiary is full (max 3 members). Ask the owner to remove a member first.");
  await updateDoc(ref, { members: [...data.members, userId] });
}

export async function leaveApiary(apiaryId, userId) {
  const ref = doc(db, "apiaries", apiaryId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Apiary not found");
  const data = snap.data();
  if (data.ownerId === userId) throw new Error("You are the owner — transfer ownership or delete the apiary instead.");
  const newMembers = data.members.filter(uid => uid !== userId);
  await updateDoc(ref, { members: newMembers });
}

export async function getApiary(apiaryId) {
  const snap = await getDoc(doc(db, "apiaries", apiaryId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function renameApiary(apiaryId, newName) {
  await updateDoc(doc(db, "apiaries", apiaryId), { name: newName });
}

export async function regenerateInviteCode(apiaryId) {
  const newCode = generateInviteCode();
  await updateDoc(doc(db, "apiaries", apiaryId), { inviteCode: newCode });
  return newCode;
}

// Deep delete: apiary + all its hives + their inspections/reminders
export async function deleteApiaryDeep(apiaryId) {
  const hivesSnap = await getDocs(query(collection(db, "hives"), where("apiaryId", "==", apiaryId)));
  const hiveIds = hivesSnap.docs.map(d => d.id);

  const inspectionRefsMap = new Map();
  const reminderRefsMap = new Map();
  const addToMap = (map, docRef) => map.set(docRef.path, docRef);

  const hiveIdChunks = chunkArray(hiveIds, 10);
  for (const chunk of hiveIdChunks) {
    if (chunk.length === 0) continue;
    const [inspectionsSnap, remindersSnap] = await Promise.all([
      getDocs(query(collection(db, "inspections"), where("hiveId", "in", chunk))),
      getDocs(query(collection(db, "reminders"), where("hiveId", "in", chunk)))
    ]);
    inspectionsSnap.docs.forEach(d => addToMap(inspectionRefsMap, d.ref));
    remindersSnap.docs.forEach(d => addToMap(reminderRefsMap, d.ref));
  }

  // Extra safety: also delete by apiaryId
  const [inspectionsByApiary, remindersByApiary] = await Promise.all([
    getDocs(query(collection(db, "inspections"), where("apiaryId", "==", apiaryId))),
    getDocs(query(collection(db, "reminders"), where("apiaryId", "==", apiaryId)))
  ]);
  inspectionsByApiary.docs.forEach(d => addToMap(inspectionRefsMap, d.ref));
  remindersByApiary.docs.forEach(d => addToMap(reminderRefsMap, d.ref));

  if ([...reminderRefsMap.values()].length > 0) await deleteRefsInBatches([...reminderRefsMap.values()]);
  if ([...inspectionRefsMap.values()].length > 0) await deleteRefsInBatches([...inspectionRefsMap.values()]);
  if (hivesSnap.docs.length > 0) await deleteRefsInBatches(hivesSnap.docs.map(d => d.ref));

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

// Deep delete: hive + its inspections/reminders
export async function deleteHiveDeep(hiveId) {
  const [inspectionsSnap, remindersSnap] = await Promise.all([
    getDocs(query(collection(db, "inspections"), where("hiveId", "==", hiveId))),
    getDocs(query(collection(db, "reminders"), where("hiveId", "==", hiveId)))
  ]);

  const inspectionRefs = inspectionsSnap.docs.map(d => d.ref);
  const reminderRefs = remindersSnap.docs.map(d => d.ref);

  if (reminderRefs.length > 0) await deleteRefsInBatches(reminderRefs);
  if (inspectionRefs.length > 0) await deleteRefsInBatches(inspectionRefs);

  await deleteDoc(doc(db, "hives", hiveId));
}

export function listenHives(apiaryId, callback) {
  const q = query(collection(db, "hives"), where("apiaryId", "==", apiaryId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── User display names ────────────────────────────────────────────────────────

// Cache resolved display names for the session to avoid repeat lookups
const _nameCache = new Map();

export async function getDisplayName(uid, currentUserUid) {
  if (uid === currentUserUid) return "You";
  if (_nameCache.has(uid)) return _nameCache.get(uid);
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const name = snap.exists() ? (snap.data().displayName || "Partner") : "Partner";
    _nameCache.set(uid, name);
    return name;
  } catch {
    return "Partner";
  }
}

// Saves user display name to Firestore so partners can look it up
export async function saveUserProfile(uid, displayName, email) {
  await setDoc(doc(db, "users", uid), { displayName, email, updatedAt: serverTimestamp() }, { merge: true });
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
  const q = query(
    collection(db, "inspections"),
    where("hiveId", "==", hiveId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── Reminders ─────────────────────────────────────────────────────────────────

export async function addReminder(apiaryId, hiveId, text, dueDate) {
  await addDoc(collection(db, "reminders"), {
    apiaryId, hiveId, text,
    dueDate: Timestamp.fromDate(new Date(dueDate + "T00:00:00")),
    done: false,
    createdAt: serverTimestamp()
  });
}

export async function deleteReminder(reminderId) {
  await deleteDoc(doc(db, "reminders", reminderId));
}

export async function toggleReminder(reminderId, done) {
  await updateDoc(doc(db, "reminders", reminderId), { done });
}

export function listenReminders(apiaryId, callback) {
  const q = query(
    collection(db, "reminders"),
    where("apiaryId", "==", apiaryId),
    orderBy("dueDate", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
