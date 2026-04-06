// auth.js — Firebase Auth helpers

import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function getCurrentUser() {
  return auth.currentUser;
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function register(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  return cred.user;
}

export async function logOut() {
  await signOut(auth);
}

export function requireAuth(returnPath) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        const path = returnPath || window.location.pathname + window.location.search;
        window.location.href = `/login.html?return=${encodeURIComponent(path)}`;
      } else {
        resolve(user);
      }
    });
  });
}

// Active apiary ID for current session
export function cacheApiaryId(apiaryId) {
  localStorage.setItem("hv_apiaryId", apiaryId);
}

export function getCachedApiaryId() {
  return localStorage.getItem("hv_apiaryId");
}

export function clearCachedApiaryId() {
  localStorage.removeItem("hv_apiaryId");
}
