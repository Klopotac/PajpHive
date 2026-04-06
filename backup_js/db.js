// db.js — Firestore data operations

import { db } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { generateInviteCode } from "./ui.js";

// ── Apiaries ──────────────────────────────────────────────────────────────────

export async function createApiary(userId, apiaryName) {
  const inviteCode = generateInviteCode();
  const ref = doc(collection(db, "apiaries"));
  await setDoc(ref, {
    name: apiaryName,
    members: [userId],
    inviteCode,
    createdAt: serverTimestamp()
  });
  return { id: ref.id, inviteCode };
}

export async function getApiaryByUser(userId) {
  const q = query(collection(db, "apiaries"), where("members", "array-contains", userId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
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
  if (data.members.includes(userId)) return; // already member
  await updateDoc(ref, { members: [...data.members, userId] });
}

export async function getApiary(apiaryId) {
  const snap = await getDoc(doc(db, "apiaries", apiaryId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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
  const q = query(collection(db, "hives"), where("apiaryId", "==", apiaryId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
  // Update hive lastInspection timestamp
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
