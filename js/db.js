// db.js — Firestore data operations

import { db } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Inline invite code generator — avoids circular import with ui.js
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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

// Listen for inspections — requires composite index: hiveId ASC + createdAt DESC
// Falls back to a simple getDocs if the index is not yet built.
export function listenInspections(hiveId, callback) {
  let q;
  try {
    q = query(
      collection(db, "inspections"),
      where("hiveId", "==", hiveId),
      orderBy("createdAt", "desc")
    );
  } catch (e) {
    // Shouldn't happen at query-build time, but guard anyway
    callback([]);
    return () => {};
  }

  return onSnapshot(q,
    (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      console.warn("listenInspections error:", err.message);
      if (err.code === "failed-precondition") {
        // Index not ready yet — fall back to unordered getDocs
        getDocs(query(collection(db, "inspections"), where("hiveId", "==", hiveId)))
          .then(snap => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort client-side by createdAt desc
            docs.sort((a, b) => {
              const ta = a.createdAt?.toDate?.() ?? new Date(0);
              const tb = b.createdAt?.toDate?.() ?? new Date(0);
              return tb - ta;
            });
            callback(docs);
          })
          .catch(() => callback([]));
      } else {
        callback([]);
      }
    }
  );
}

// ── Reminders ─────────────────────────────────────────────────────────────────

export async function addReminder(apiaryId, hiveId, text, dueDate) {
  const ref = await addDoc(collection(db, "reminders"), {
    apiaryId, hiveId, text,
    dueDate: Timestamp.fromDate(new Date(dueDate + "T00:00:00")),
    done: false,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function deleteReminder(reminderId) {
  await deleteDoc(doc(db, "reminders", reminderId));
}

export async function toggleReminder(reminderId, done) {
  await updateDoc(doc(db, "reminders", reminderId), { done });
}

// Listen for reminders — requires composite index: apiaryId ASC + dueDate ASC
// Falls back to getDocs + client-side sort if the index is not yet ready.
export function listenReminders(apiaryId, callback) {
  let q;
  try {
    q = query(
      collection(db, "reminders"),
      where("apiaryId", "==", apiaryId),
      orderBy("dueDate", "asc")
    );
  } catch (e) {
    callback([]);
    return () => {};
  }

  return onSnapshot(q,
    (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      console.warn("listenReminders error:", err.message);
      if (err.code === "failed-precondition") {
        // Index not ready — fall back to unordered getDocs + client-side sort
        getDocs(query(collection(db, "reminders"), where("apiaryId", "==", apiaryId)))
          .then(snap => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a, b) => {
              const ta = a.dueDate?.toDate?.() ?? new Date(0);
              const tb = b.dueDate?.toDate?.() ?? new Date(0);
              return ta - tb;
            });
            callback(docs);
          })
          .catch(() => callback([]));
      } else {
        callback([]);
      }
    }
  );
}

// One-time fetch of reminders (no real-time — used as index-safe fallback)
export async function getRemindersOnce(apiaryId) {
  const snap = await getDocs(query(collection(db, "reminders"), where("apiaryId", "==", apiaryId)));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  docs.sort((a, b) => {
    const ta = a.dueDate?.toDate?.() ?? new Date(0);
    const tb = b.dueDate?.toDate?.() ?? new Date(0);
    return ta - tb;
  });
  return docs;
}


// ── AI Inspection (4-bucket save) ─────────────────────────────────────────────

/**
 * Save a full AI inspection result (all 4 buckets) to Firestore.
 * Creates: 1 inspection doc, N warning docs, N reminder docs, N todo docs.
 * Also updates the hive's lastInspection timestamp.
 *
 * @param {object} aiResult - the 4-bucket JSON from the AI
 * @param {string} hiveId
 * @param {string} apiaryId
 * @param {string} userId
 * @returns {Promise<string>} inspection document ID
 */
export async function saveInspectionWithBuckets(aiResult, hiveId, apiaryId, userId) {
  const batch = writeBatch(db);
  const now = serverTimestamp();

  // 1. Inspection document
  const inspectionRef = doc(collection(db, "inspections"));
  batch.set(inspectionRef, {
    hiveId,
    apiaryId,
    recordedBy: userId,
    transcript: aiResult.transcript || "",
    notes: aiResult.notes || "",
    warningCount:  (aiResult.warnings  || []).filter(w => w.severity === "warning").length,
    dangerCount:   (aiResult.warnings  || []).filter(w => w.severity === "danger").length,
    reminderCount: (aiResult.reminders || []).length,
    todoCount:     (aiResult.todos     || []).length,
    warningsSnapshot:  aiResult.warnings  || [],
    remindersSnapshot: aiResult.reminders || [],
    todosSnapshot:     aiResult.todos     || [],
    createdAt: now,
    syncedAt:  now
  });

  // 2. Active warnings (per-hive, dismissable)
  for (const w of (aiResult.warnings || [])) {
    const wRef = doc(collection(db, "hive_warnings"));
    batch.set(wRef, {
      hiveId,
      apiaryId,
      inspectionId: inspectionRef.id,
      text:      w.text,
      severity:  w.severity,   // "warning" | "danger"
      dismissed: false,
      createdAt: now
    });
  }

  // 3. Timed reminders → calendar
  for (const r of (aiResult.reminders || [])) {
    const dueDate = new Date(r.due_date + "T00:00:00");
    const rRef = doc(collection(db, "reminders"));
    batch.set(rRef, {
      hiveId,
      apiaryId,
      inspectionId: inspectionRef.id,
      text:    r.text,
      dueDate: Timestamp.fromDate(dueDate),
      done:    false,
      createdAt: now
    });
  }

  // 4. Todos → hive checklist
  for (const t of (aiResult.todos || [])) {
    const tRef = doc(collection(db, "hive_todos"));
    batch.set(tRef, {
      hiveId,
      apiaryId,
      inspectionId: inspectionRef.id,
      text:                 t.text,
      done:                 false,
      showAtNextInspection: t.next_inspection || false,
      scheduledDate:        null,
      createdAt:            now
    });
  }

  // 5. Update hive lastInspection
  batch.update(doc(db, "hives", hiveId), { lastInspection: now });

  await batch.commit();
  return inspectionRef.id;
}


// ── Active Warnings ───────────────────────────────────────────────────────────

/** Listen to active (non-dismissed) warnings for a hive. Returns unsubscribe fn. */
export function listenActiveWarnings(hiveId, callback) {
  const q = query(
    collection(db, "hive_warnings"),
    where("hiveId", "==", hiveId),
    where("dismissed", "==", false)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => {
    console.warn("listenActiveWarnings error:", err.message);
    callback([]);
  });
}

/** Dismiss a warning (keeps it in history but removes from active list). */
export async function dismissWarning(warningId) {
  await updateDoc(doc(db, "hive_warnings", warningId), { dismissed: true });
}

/**
 * Get warning counts for multiple hives at once.
 * Returns { [hiveId]: { warnings: N, dangers: N } }
 */
export async function getWarningCountsForHives(hiveIds) {
  if (!hiveIds || hiveIds.length === 0) return {};
  const counts = {};
  hiveIds.forEach(id => { counts[id] = { warnings: 0, dangers: 0 }; });

  const chunks = [];
  for (let i = 0; i < hiveIds.length; i += 10) chunks.push(hiveIds.slice(i, i + 10));

  for (const chunk of chunks) {
    try {
      const snap = await getDocs(query(
        collection(db, "hive_warnings"),
        where("hiveId", "in", chunk),
        where("dismissed", "==", false)
      ));
      snap.docs.forEach(d => {
        const { hiveId, severity } = d.data();
        if (counts[hiveId]) {
          if (severity === "danger") counts[hiveId].dangers++;
          else counts[hiveId].warnings++;
        }
      });
    } catch (e) {
      console.warn("getWarningCountsForHives chunk error:", e.message);
    }
  }
  return counts;
}


// ── Hive Todos ────────────────────────────────────────────────────────────────

/** Listen to undone todos for a hive. Returns unsubscribe fn. */
export function listenHiveTodos(hiveId, callback) {
  const q = query(
    collection(db, "hive_todos"),
    where("hiveId", "==", hiveId),
    where("done", "==", false)
  );
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort: next-inspection items first, then by createdAt desc
    docs.sort((a, b) => {
      if (a.showAtNextInspection && !b.showAtNextInspection) return -1;
      if (!a.showAtNextInspection && b.showAtNextInspection) return 1;
      const ta = a.createdAt?.toDate?.() ?? new Date(0);
      const tb = b.createdAt?.toDate?.() ?? new Date(0);
      return tb - ta;
    });
    callback(docs);
  }, err => {
    console.warn("listenHiveTodos error:", err.message);
    callback([]);
  });
}

export async function toggleTodo(todoId, done) {
  await updateDoc(doc(db, "hive_todos", todoId), { done });
}

/** Get todos flagged for next inspection — shown at top of recording page. */
export async function getNextInspectionTodos(hiveId) {
  try {
    const snap = await getDocs(query(
      collection(db, "hive_todos"),
      where("hiveId", "==", hiveId),
      where("done", "==", false),
      where("showAtNextInspection", "==", true)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("getNextInspectionTodos error:", e.message);
    return [];
  }
}
