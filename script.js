/* ============================================================
   Sajilo GK — script.js
   Sections:
   1. Firebase bootstrap
   2. Constants and state
   3. Utilities
   4. IndexedDB cache
   5. Authentication
   6. Shell and routing
   7. Dashboard
   8. Onboarding
   9. Subjects, chapters and topics
   10. Material reader
   11. Question practice
   12. Revision
   13. Tests and results
   14. Progress, saved, profile, planner, current affairs
   15. Administration
   16. Import and export
   17. Boot
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  updateProfile,
  getIdToken
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  writeBatch,
  runTransaction,
  getCountFromServer,
  documentId,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

/* ============================================================
   1. FIREBASE BOOTSTRAP
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyDK1wwahwoJxNAH_Iats2wrSMUA42jVhSI",
  authDomain: "loksewa-2083.firebaseapp.com",
  projectId: "loksewa-2083",
  storageBucket: "loksewa-2083.firebasestorage.app",
  messagingSenderId: "484441818228",
  appId: "1:484441818228:web:fb43d456131cd40ec1fd21",
  measurementId: "G-D5RTD5R7B4"
};

let app = null;
let auth = null;
let db = null;
let firebaseInitError = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({})
      })
    });
  } catch (cacheErr) {
    console.warn("Persistent Firestore cache unavailable; using memory cache.", cacheErr);
    db = getFirestore(app);
  }
} catch (err) {
  console.error("Firebase initialization failed.", err);
  firebaseInitError = err;
}

/* ============================================================
   2. CONSTANTS AND STATE
   ============================================================ */

const OWNER_EMAIL = "deepakrajpant978@gmail.com";
const PAGE_SIZE = 20;
const CACHE_TTL = 1000 * 60 * 30;
const NEPAL_TZ = "Asia/Kathmandu";

const S = {
  user: null,
  profile: null,
  profileLoaded: false,
  profilePromise: null,
  profileLoadError: null,
  isOwner: false,
  isAdmin: false,
  authReady: false,
  exams: [],
  selectedExamIds: [],
  selectedSubjects: [],
  settings: null,
  routeToken: 0,
  pageCleanup: null,
  cachePrefix: "",
  adminFormState: null,
  adminListStack: [],
  adminListLast: null,
  activeTestTimer: null,
  practice: null,
  reader: null,
  importState: null
};

const els = {};

function cacheEls() {
  [
    "bootScreen", "bootMessage", "authView", "appShell", "app", "topbar",
    "menuToggle", "adminHeaderBtn", "themeToggle", "profileBtn", "profileDropdown",
    "avatarInitial", "profileChipName", "logoutBtn", "mobileLogoutBtn",
    "sidebar", "sidebarBackdrop", "sidebarLogoutBtn", "verifyBanner",
    "resendVerifyBtn", "refreshVerifyBtn", "modalRoot", "toastRoot",
    "loginForm", "signupForm", "resetForm", "googleBtn", "authMessage"
  ].forEach(id => { els[id] = document.getElementById(id); });
}

/* ============================================================
   3. UTILITIES
   ============================================================ */

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(raw, { youtube = false } = {}) {
  try {
    const u = new URL(String(raw || "").trim());
    if (!["http:", "https:"].includes(u.protocol)) return "";
    if (youtube && !/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return "";
    return u.href;
  } catch { return ""; }
}

function youtubeId(raw) {
  const url = safeUrl(raw, { youtube: true });
  if (!url) return "";
  const u = new URL(url);
  if (u.hostname === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || "";
  if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || "";
  return u.searchParams.get("v") || "";
}

function sanitizeHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html || "");
  const allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "H3", "H4", "BLOCKQUOTE", "CODE", "PRE", "SPAN", "A"]);
  const walk = (node) => {
    Array.from(node.children).forEach(child => {
      if (!allowed.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        return;
      }
      Array.from(child.attributes).forEach(attr => {
        if (attr.name === "href") {
          if (safeUrl(attr.value)) {
            child.setAttribute("rel", "noopener noreferrer");
            child.setAttribute("target", "_blank");
          } else {
            child.removeAttribute("href");
          }
        } else {
          child.removeAttribute(attr.name);
        }
      });
      walk(child);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

function nepalDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NEPAL_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

function nepalDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NEPAL_TZ, year: "numeric", month: "short", day: "numeric"
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value || "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

function formatDate(value, { time = false } = {}) {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: NEPAL_TZ,
    year: "numeric", month: "short", day: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(d);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function timeAgo(value) {
  const d = toDate(value);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function toast(message, type = "info", ms = 3200) {
  const root = els.toastRoot;
  if (!root) return;
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  root.appendChild(item);
  setTimeout(() => item.remove(), ms);
}

function spinnerBlock(text = "Loading…") {
  return `<div class="loading-state"><div class="boot-spinner" style="margin:0 auto 12px"></div><p class="muted">${escapeHtml(text)}</p></div>`;
}

function emptyState(title, text, actionHtml = "") {
  return `<div class="empty-state">
    <div class="empty-icon">📭</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(text)}</p>
    ${actionHtml}
  </div>`;
}

function errorState(title, text, retryLabel = "Retry") {
  return `<div class="error-state">
    <div class="error-icon">⚠️</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(text)}</p>
    <button class="btn btn-primary" data-action="retry-page">${escapeHtml(retryLabel)}</button>
  </div>`;
}

function friendlyError(err, context = "") {
  console.error(`[Sajilo GK] ${context}`, err);
  const code = err?.code || "";
  if (code === "permission-denied") {
    return "Access was denied. Your account may be unverified, suspended, or trying to read content that is not published. Check your email verification and try again.";
  }
  if (code === "unavailable" || code === "firestore/unavailable") {
    return "The network or Firebase is unavailable. Check your connection and retry.";
  }
  if (code === "failed-precondition") {
    return "This query needs a Firestore index. The exact index is documented in the setup section. Ask the administrator to create it.";
  }
  if (code === "not-found") return "The requested document was not found.";
  if (code === "auth/network-request-failed") return "Authentication network request failed. Check your connection.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Email or password is incorrect.";
  }
  if (code === "auth/email-already-in-use") return "An account with this email already exists. Try logging in.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a moment and try again.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was closed before completion.";
  if (code === "auth/popup-blocked") return "The Google popup was blocked. Allow popups for this site and retry.";
  return context ? `Something went wrong while ${context}. Please retry.` : "Something went wrong. Please retry.";
}

function isPermissionError(err) {
  return err?.code === "permission-denied" || /permission/i.test(err?.message || "");
}

async function withTimeout(promise, ms = 8000, label = "operation") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function safeGetDoc(ref, label = "document") {
  try {
    return await getDoc(ref);
  } catch (err) {
    if (isPermissionError(err)) throw err;
    console.warn(`Failed to read ${label}`, err);
    return null;
  }
}

async function safeGetDocs(q, label = "query") {
  try {
    return await getDocs(q);
  } catch (err) {
    if (isPermissionError(err)) throw err;
    console.warn(`Failed to run ${label}`, err);
    return null;
  }
}

async function countQuery(q, label = "count") {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (err) {
    console.warn(`Count failed: ${label}`, err);
    return null;
  }
}

function confirmDialog(message, { title = "Please confirm", confirmText = "Confirm", danger = false } = {}) {
  return new Promise(resolve => {
    const root = els.modalRoot;
    root.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="modal-close" type="button" data-cancel aria-label="Close">✕</button>
        </div>
        <p>${escapeHtml(message)}</p>
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    const done = value => {
      root.classList.remove("open");
      root.setAttribute("aria-hidden", "true");
      root.innerHTML = "";
      document.body.classList.remove("no-scroll");
      resolve(value);
    };
    root.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => done(false));
    root.querySelector("[data-confirm]").onclick = () => done(true);
    root.onclick = e => { if (e.target === root) done(false); };
  });
}

function openModal(html, { wide = false } = {}) {
  const root = els.modalRoot;
  root.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add("open");
  root.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
  const close = () => closeModal();
  root.querySelectorAll("[data-modal-close]").forEach(b => b.onclick = close);
  root.onclick = e => { if (e.target === root) close(); };
  return root.querySelector(".modal");
}

function closeModal() {
  const root = els.modalRoot;
  root.classList.remove("open");
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = "";
  document.body.classList.remove("no-scroll");
}

function setPageHtml(html) {
  els.app.innerHTML = html;
}

function cleanupPage() {
  if (typeof S.pageCleanup === "function") {
    try { S.pageCleanup(); } catch (err) { console.warn("Page cleanup failed", err); }
  }
  S.pageCleanup = null;
  if (S.activeTestTimer) {
    clearInterval(S.activeTestTimer);
    S.activeTestTimer = null;
  }
}

function bindRetry() {
  const btn = els.app.querySelector('[data-action="retry-page"]');
  if (btn) btn.onclick = () => router();
}

function routeToken() {
  S.routeToken += 1;
  return S.routeToken;
}

function isStale(token) {
  return token !== S.routeToken;
}

function activeNav(path) {
  $$("[data-nav]").forEach(a => {
    const href = a.getAttribute("href") || "";
    const target = href.replace(/^#/, "");
    const current = location.hash.replace(/^#/, "") || "/home";
    const isHome = target === "/home" && (current === "/home" || current === "/");
    a.classList.toggle("active", isHome || (target !== "/home" && current.startsWith(target)));
  });
}

function go(path) {
  if (location.hash === `#${path}`) {
    router();
  } else {
    location.hash = `#${path}`;
  }
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  return { segs, params: new URLSearchParams(queryPart || "") };
}

function routeSegments(segs) {
  return segs.map(s => encodeURIComponent(s)).join("/");
}

function levelLabel(level) {
  return level === "L1" ? "L1 · Basic & Very Important"
    : level === "L2" ? "L2 · Medium & Very Important"
    : level === "L3" ? "L3 · Advanced & Important"
    : level || "—";
}

function importanceLabel(importance) {
  return importance === "veryImportant" ? "Very important"
    : importance === "important" ? "Important"
    : "Normal";
}

function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status || "draft")}">${escapeHtml(status || "draft")}</span>`;
}

function readPercent(read, total) {
  if (!total) return 0;
  return Math.round((read / total) * 100);
}

function masteryPercent(mastered, total) {
  if (!total) return null;
  return Math.round((mastered / total) * 100);
}

/* ============================================================
   4. INDEXEDDB CACHE
   ============================================================ */

const idbCache = {
  db: null,
  uid: "",
  opening: null,
  open(uid) {
    this.uid = uid;
    if (this.opening) return this.opening;
    this.opening = new Promise(resolve => {
      try {
        if (!("indexedDB" in window)) return resolve(null);
        const req = indexedDB.open("sajilo-gk-cache", 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv", { keyPath: "key" });
        };
        req.onsuccess = () => { this.db = req.result; resolve(this.db); };
        req.onerror = () => { console.warn("IndexedDB unavailable", req.error); resolve(null); };
        req.onblocked = () => resolve(null);
      } catch (err) {
        console.warn("IndexedDB open failed", err);
        resolve(null);
      }
    });
    return this.opening;
  },
  async get(key, ttl = CACHE_TTL) {
    if (!this.db) return null;
    try {
      return await withTimeout(new Promise(resolve => {
        const tx = this.db.transaction("kv", "readonly");
        const req = tx.objectStore("kv").get(`${this.uid}:${key}`);
        req.onsuccess = () => {
          const row = req.result;
          if (!row || (ttl && Date.now() - row.savedAt > ttl)) return resolve(null);
          resolve(row.value);
        };
        req.onerror = () => resolve(null);
      }), 1200, "cache read");
    } catch { return null; }
  },
  async set(key, value) {
    if (!this.db) return false;
    try {
      return await withTimeout(new Promise(resolve => {
        const tx = this.db.transaction("kv", "readwrite");
        tx.objectStore("kv").put({ key: `${this.uid}:${key}`, value, savedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      }), 1200, "cache write");
    } catch { return false; }
  }
};

async function initCache(uid) {
  await idbCache.open(uid);
}

/* ============================================================
   5. AUTHENTICATION
   ============================================================ */

function showAuth() {
  els.authView.classList.remove("hidden");
  els.appShell.classList.add("hidden");
  els.bootScreen.classList.add("hidden");
}

function showShell() {
  els.authView.classList.add("hidden");
  els.appShell.classList.remove("hidden");
  els.bootScreen.classList.add("hidden");
}

function authMessage(text, type = "error") {
  if (!els.authMessage) return;
  els.authMessage.textContent = text;
  els.authMessage.className = `auth-message ${type}`;
}

function clearAuthMessage() {
  if (els.authMessage) {
    els.authMessage.textContent = "";
    els.authMessage.className = "auth-message";
  }
}

function setAuthTab(tab) {
  $$(".auth-tab").forEach(b => {
    const active = b.dataset.authTab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  els.loginForm.classList.toggle("hidden", tab !== "login");
  els.signupForm.classList.toggle("hidden", tab !== "signup");
  els.resetForm.classList.toggle("hidden", tab !== "reset");
  clearAuthMessage();
}

function renderProfileChrome() {
  const user = S.user;
  if (!user) return;
  const name = S.profile?.displayName || user.displayName || user.email?.split("@")[0] || "Student";
  if (els.profileChipName) els.profileChipName.textContent = name;
  if (els.avatarInitial) els.avatarInitial.textContent = name.trim().charAt(0).toUpperCase() || "S";
  if (els.adminHeaderBtn) {
    const show = S.isOwner || S.isAdmin;
    els.adminHeaderBtn.classList.toggle("hidden", !show);
  }
  if (els.verifyBanner) {
    els.verifyBanner.classList.toggle("hidden", !!user.emailVerified);
  }
}

function updateAdminVisibility() {
  if (els.adminHeaderBtn) els.adminHeaderBtn.classList.toggle("hidden", !(S.isOwner || S.isAdmin));
}

async function ensureProfile(force = false) {
  if (S.profileLoaded && !force) return S.profile;
  if (S.profilePromise && !force) return S.profilePromise;
  S.profilePromise = (async () => {
    try {
      S.profileLoadError = null;
      if (!db || !S.user) return null;
      const ref = doc(db, "users", S.user.uid);
      let snap = null;
      try {
        snap = await withTimeout(getDoc(ref), 8000, "profile load");
      } catch (err) {
        if (err?.code === "permission-denied") {
          S.profileLoadError = err;
          return null;
        }
        throw err;
      }
      if (snap?.exists()) {
        S.profile = { id: snap.id, ...snap.data() };
      } else if (S.user.emailVerified) {
        const data = {
          uid: S.user.uid,
          email: S.user.email || "",
          displayName: S.user.displayName || S.user.email?.split("@")[0] || "Student",
          examIds: [],
          dailyGoal: 20,
          suspended: false,
          premium: false,
          onboardingComplete: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        await setDoc(ref, data);
        S.profile = { id: S.user.uid, ...data };
      }
      return S.profile;
    } catch (err) {
      S.profileLoadError = err;
      console.warn("Profile load failed", err);
      return null;
    } finally {
      S.profileLoaded = true;
    }
  })();
  return S.profilePromise;
}

async function loadRole() {
  S.isOwner = S.user?.email === OWNER_EMAIL && S.user?.emailVerified === true;
  S.isAdmin = S.isOwner;
  updateAdminVisibility();
  if (!S.user || S.isOwner) return;
  try {
    const snap = await getDoc(doc(db, "adminRoles", S.user.uid));
    if (snap.exists()) {
      const data = snap.data();
      S.isAdmin = data.active === true && ["admin", "editor"].includes(data.role);
    }
  } catch (err) {
    console.warn("Admin role check failed", err);
  }
  updateAdminVisibility();
}

async function doLogout() {
  try {
    if (auth) await signOut(auth);
  } catch (err) {
    console.warn("Sign out failed", err);
  }
  cleanupPage();
  S.user = null;
  S.profile = null;
  S.profileLoaded = false;
  S.profilePromise = null;
  S.profileLoadError = null;
  S.isOwner = false;
  S.isAdmin = false;
  S.selectedSubjects = [];
  S.selectedExamIds = [];
  S.exams = [];
  S.settings = null;
  if (els.profileDropdown) els.profileDropdown.classList.add("hidden");
  showAuth();
  setAuthTab("login");
  authMessage("You have been logged out.", "success");
}

async function resendVerification() {
  if (!S.user) return;
  try {
    await sendEmailVerification(S.user);
    toast("Verification email sent. Check your inbox and spam folder.", "success");
  } catch (err) {
    toast(friendlyError(err, "sending verification email"), "error");
  }
}

async function refreshVerification() {
  if (!S.user) return;
  try {
    await reload(S.user);
    await getIdToken(S.user, true);
    S.user = auth.currentUser;
    if (S.user.emailVerified) {
      S.isOwner = S.user.email === OWNER_EMAIL;
      await ensureProfile(true);
      await loadRole();
      renderProfileChrome();
      toast("Email verified. Welcome to Sajilo GK.", "success");
      router();
    } else {
      toast("Email is still not verified. Check your inbox and click the verification link.", "error");
    }
  } catch (err) {
    toast(friendlyError(err, "refreshing verification"), "error");
  }
}

function bindAuthEvents() {
  $$(".auth-tab").forEach(btn => {
    btn.addEventListener("click", () => setAuthTab(btn.dataset.authTab));
  });

  els.loginForm?.addEventListener("submit", async e => {
    e.preventDefault();
    clearAuthMessage();
    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;
    if (!email || !password) return authMessage("Enter your email and password.");
    const btn = els.loginForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Logging in…";
    try {
      await signInWithEmailAndPassword(auth, email, password);
      clearAuthMessage();
    } catch (err) {
      authMessage(friendlyError(err, "logging in"));
    } finally {
      btn.disabled = false; btn.textContent = "Login";
    }
  });

  els.signupForm?.addEventListener("submit", async e => {
    e.preventDefault();
    clearAuthMessage();
    const name = $("#signupName").value.trim();
    const email = $("#signupEmail").value.trim();
    const password = $("#signupPassword").value;
    if (!name || !email || !password) return authMessage("Fill in all fields.");
    if (password.length < 6) return authMessage("Password must be at least 6 characters.");
    const btn = els.signupForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Creating…";
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user);
      authMessage("Account created. Check your email and verify before entering learning content.", "success");
    } catch (err) {
      authMessage(friendlyError(err, "creating account"));
    } finally {
      btn.disabled = false; btn.textContent = "Create account";
    }
  });

  els.resetForm?.addEventListener("submit", async e => {
    e.preventDefault();
    clearAuthMessage();
    const email = $("#resetEmail").value.trim();
    if (!email) return authMessage("Enter your email.");
    try {
      await sendPasswordResetEmail(auth, email);
      authMessage("Password reset email sent. Check your inbox and spam folder.", "success");
    } catch (err) {
      authMessage(friendlyError(err, "sending reset email"));
    }
  });

  els.googleBtn?.addEventListener("click", async () => {
    clearAuthMessage();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      authMessage(friendlyError(err, "Google sign-in"));
    }
  });

  els.logoutBtn?.addEventListener("click", doLogout);
  els.sidebarLogoutBtn?.addEventListener("click", doLogout);
  els.mobileLogoutBtn?.addEventListener("click", doLogout);
  els.resendVerifyBtn?.addEventListener("click", resendVerification);
  els.refreshVerifyBtn?.addEventListener("click", refreshVerification);
}

/* ============================================================
   6. SHELL AND ROUTING
   ============================================================ */

function toggleSidebar(open) {
  const isOpen = open ?? !els.sidebar.classList.contains("open");
  els.sidebar.classList.toggle("open", isOpen);
  els.sidebarBackdrop.classList.toggle("hidden", !isOpen);
  els.menuToggle.setAttribute("aria-expanded", String(isOpen));
}

function bindShellEvents() {
  els.menuToggle?.addEventListener("click", () => toggleSidebar());
  els.sidebarBackdrop?.addEventListener("click", () => toggleSidebar(false));

  els.profileBtn?.addEventListener("click", e => {
    e.stopPropagation();
    const open = els.profileDropdown.classList.contains("hidden");
    els.profileDropdown.classList.toggle("hidden", !open);
    els.profileBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", e => {
    if (!els.profileDropdown?.contains(e.target) && e.target !== els.profileBtn) {
      els.profileDropdown?.classList.add("hidden");
      els.profileBtn?.setAttribute("aria-expanded", "false");
    }
  });

  els.adminHeaderBtn?.addEventListener("click", () => {
    if (!S.user) return;
    if (!S.user.emailVerified && S.isOwner) {
      toast("Verify your email before using admin tools. The Admin page is visible, but writes require verification.", "error", 5000);
    }
    go("/admin");
  });

  els.themeToggle?.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark";
    setTheme(dark ? "light" : "dark");
  });

  $$("[data-nav]").forEach(a => {
    a.addEventListener("click", () => toggleSidebar(false));
  });

  window.addEventListener("hashchange", router);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("sajilo-theme", theme); } catch {}
  if (els.themeToggle) els.themeToggle.textContent = theme === "dark" ? "☀" : "◐";
}

function initTheme() {
  let saved = "light";
  try { saved = localStorage.getItem("sajilo-theme") || "light"; } catch {}
  setTheme(saved === "dark" ? "dark" : "light");
}

async function router() {
  const token = routeToken();
  cleanupPage();
  const { segs, params } = parseRoute();
  const name = segs[0] || "home";

  activeNav(`/${segs.join("/")}`);

  if (!S.user) {
    showAuth();
    return;
  }

  showShell();
  renderProfileChrome();

  if (name === "setup") {
    setPageHtml(renderSetupPage());
    bindSetupPage();
    return;
  }

  const noVerifyRoutes = new Set(["profile", "settings", "setup", "verify", "admin"]);
  if (!S.user.emailVerified && !noVerifyRoutes.has(name)) {
    setPageHtml(renderVerifyGate());
    return;
  }

  const needsProfile = ["onboarding", "home", "subjects", "dashboard"].includes(name);
  if (needsProfile) {
    if (!S.profileLoaded) {
      setPageHtml(spinnerBlock("Loading your account…"));
    }
    await ensureProfile();
    if (isStale(token)) return;
    if (!S.profile && S.profileLoadError) {
      setPageHtml(errorState(
        "Could not load your profile",
        friendlyError(S.profileLoadError, "loading your profile") + " Profile and Logout are still available in the header.",
        "Retry"
      ));
      bindRetry();
      return;
    }
  }

  try {
    switch (name) {
      case "home":
        await renderDashboard(token);
        break;
      case "onboarding":
        await renderOnboarding(token);
        break;
      case "subjects":
        await renderSubjectsPage(token);
        break;
      case "subject":
        await renderSubjectPage(segs[1], token);
        break;
      case "chapter":
        await renderChapterPage(segs[1], token);
        break;
      case "topic":
        await renderTopicPage(segs[1], token);
        break;
      case "level":
        await renderLevelPage(segs[1], segs[2], token);
        break;
      case "material":
        await renderMaterialReader(segs[1], token);
        break;
      case "practice":
        await renderPractice(params, token);
        break;
      case "revision":
        await renderRevisionPage(token);
        break;
      case "exam-day":
        await renderExamDay(token);
        break;
      case "tests":
        await renderTestsPage(token);
        break;
      case "test":
        if (segs[1] === "active") await renderActiveTest(segs[2], token);
        else setPageHtml(errorState("Unknown test route", "The requested test route does not exist.", "Go to tests"));
        break;
      case "results":
        await renderResults(segs[1], token);
        break;
      case "progress":
        await renderProgressPage(token);
        break;
      case "saved":
        await renderSavedPage(params, token);
        break;
      case "profile":
        await renderProfilePage(token);
        break;
      case "settings":
        await renderSettingsPage(token);
        break;
      case "planner":
        await renderPlannerPage(token);
        break;
      case "current-affairs":
        await renderCurrentAffairsPage(token);
        break;
      case "admin":
        await renderAdminPage(segs[1], token);
        break;
      case "verify":
        setPageHtml(renderVerifyGate());
        break;
      default:
        setPageHtml(`<div class="empty-state"><div class="empty-icon">🧭</div><h3>Page not found</h3><p>The route “${escapeHtml(name)}” does not exist.</p><a class="btn btn-primary" href="#/home">Go home</a></div>`);
    }
    if (!isStale(token)) {
      els.app.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
      bindRetry();
    }
  } catch (err) {
    if (isStale(token)) return;
    setPageHtml(errorState("This page could not load", friendlyError(err, "loading the page")));
    bindRetry();
  }
}

function renderVerifyGate() {
  return `<div class="card" style="max-width:640px;margin:30px auto;text-align:center">
    <div class="empty-icon">✉️</div>
    <h2>Verify your email first</h2>
    <p class="muted">Your account <strong>${escapeHtml(S.user?.email || "")}</strong> is signed in, but the email address is not verified. Learning content and admin writes require a verified email.</p>
    <div class="row" style="justify-content:center">
      <button class="btn btn-primary" id="gateResendBtn" type="button">Resend verification</button>
      <button class="btn" id="gateRefreshBtn" type="button">I have verified</button>
    </div>
    <p class="small muted mt-16">After verifying, click “I have verified”. If it still fails, sign out and sign in again.</p>
    <a class="btn btn-ghost mt-8" href="#/profile">Go to Profile</a>
  </div>`;
}

function bindVerifyGate() {
  $("#gateResendBtn")?.addEventListener("click", resendVerification);
  $("#gateRefreshBtn")?.addEventListener("click", refreshVerification);
}

/* ============================================================
   7. DASHBOARD
   ============================================================ */

async function loadSelectedSubjects() {
  if (!S.user) return [];
  try {
    const snap = await getDocs(collection(db, "users", S.user.uid, "selectedSubjects"));
    S.selectedSubjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Selected subjects load failed", err);
    S.selectedSubjects = [];
  }
  return S.selectedSubjects;
}

async function loadExams() {
  try {
    const snap = await getDocs(query(collection(db, "exams"), where("status", "==", "published"), orderBy("order", "asc"), limit(50)));
    S.exams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Exams load failed", err);
    S.exams = [];
  }
  return S.exams;
}

async function getSubjectStats(subjectId) {
  const uid = S.user.uid;
  const [totalMaterials, readMaterials, totalQuestions, masteredQuestions] = await Promise.all([
    countQuery(query(collection(db, "materials"), where("subjectId", "==", subjectId), where("status", "==", "published")), "materials"),
    countQuery(query(collection(db, "users", uid, "materialProgress"), where("subjectId", "==", subjectId), where("status", "==", "read")), "read materials"),
    countQuery(query(collection(db, "questions"), where("subjectId", "==", subjectId), where("status", "==", "published")), "questions"),
    countQuery(query(collection(db, "users", uid, "questionProgress"), where("subjectId", "==", subjectId), where("mastery", "==", true)), "mastered")
  ]);
  return {
    totalMaterials: totalMaterials ?? 0,
    readMaterials: readMaterials ?? 0,
    totalQuestions: totalQuestions ?? 0,
    masteredQuestions: masteredQuestions ?? 0,
    readingPercent: readPercent(readMaterials || 0, totalMaterials || 0),
    masteryPercent: masteryPercent(masteredQuestions || 0, totalQuestions || 0)
  };
}

async function getTodaySession() {
  const key = nepalDateKey();
  try {
    const snap = await getDoc(doc(db, "users", S.user.uid, "studySessions", key));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

async function touchStudySession(updates = {}) {
  if (!S.user) return;
  const key = nepalDateKey();
  const ref = doc(db, "users", S.user.uid, "studySessions", key);
  const data = {
    dateKey: key,
    updatedAt: serverTimestamp()
  };
  Object.entries(updates).forEach(([k, v]) => {
    data[k] = typeof v === "number" ? increment(v) : v;
  });
  try {
    await setDoc(ref, data, { merge: true });
  } catch (err) {
    console.warn("Study session update failed", err);
  }
}

async function getStreak() {
  try {
    const snap = await getDocs(query(collection(db, "users", S.user.uid, "studySessions"), orderBy("dateKey", "desc"), limit(60)));
    const keys = new Set(snap.docs.map(d => d.data().dateKey).filter(Boolean));
    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 60; i++) {
      const key = nepalDateKey(cursor);
      if (keys.has(key)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else if (i === 0) {
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  } catch { return 0; }
}

async function renderDashboard(token) {
  if (!S.profile) {
    setPageHtml(errorState("Profile unavailable", "We could not load your profile. You can still open Profile or Logout from the header.", "Retry"));
    return;
  }

  if (!S.profile.onboardingComplete || !(S.profile.examIds || []).length) {
    go("/onboarding");
    return;
  }

  setPageHtml(`<div class="page-head"><div><h1 class="page-title">Namaste, ${escapeHtml((S.profile.displayName || S.user.displayName || "Student").split(" ")[0])} 👋</h1><p class="page-sub">Here is your real study picture for today.</p></div><a class="btn btn-primary" href="#/revision">Start revision</a></div>
    <div id="dashBody">${spinnerBlock("Gathering your progress…")}</div>`);

  try {
    await Promise.all([loadSelectedSubjects(), loadExams()]);
  } catch (err) {
    console.warn(err);
  }

  const uid = S.user.uid;
  const [todaySession, streak, attemptsSnap, dueSnap, savedSnap, recentMaterialsSnap, progressMaterialsSnap, questionProgressSnap] = await Promise.all([
    getTodaySession(),
    getStreak(),
    safeGetDocs(query(collection(db, "users", uid, "testAttempts"), orderBy("startedAt", "desc"), limit(5)), "attempts"),
    safeGetDocs(query(collection(db, "users", uid, "revisionSchedule"), where("nextReview", "<=", Timestamp.now()), orderBy("nextReview", "asc"), limit(8)), "due revisions"),
    safeGetDocs(query(collection(db, "users", uid, "savedItems"), orderBy("createdAt", "desc"), limit(6)), "saved"),
    safeGetDocs(query(collection(db, "users", uid, "materialProgress"), orderBy("updatedAt", "desc"), limit(5)), "material progress"),
    safeGetDocs(query(collection(db, "users", uid, "materialProgress"), where("status", "==", "read"), limit(500)), "read materials"),
    safeGetDocs(query(collection(db, "users", uid, "questionProgress"), orderBy("updatedAt", "desc"), limit(500)), "question progress")
  ]);

  if (isStale(token)) return;

  const subjectStats = [];
  for (const subject of S.selectedSubjects.slice(0, 8)) {
    subjectStats.push({ subject, stats: await getSubjectStats(subject.id) });
  }
  if (isStale(token)) return;

  const totalRead = progressMaterialsSnap?.size || 0;
  const qpDocs = questionProgressSnap?.docs.map(d => d.data()) || [];
  const mastered = qpDocs.filter(q => q.mastery === true).length;
  const attempted = qpDocs.filter(q => (q.attempts || 0) > 0).length;
  const dueCount = dueSnap?.size || 0;
  const today = todaySession || {};
  const dailyGoal = Number(S.profile.dailyGoal || 20);
  const todayDone = (today.materialsRead || 0) + (today.questionsAttempted || 0) + (today.reviewsCompleted || 0);
  const goalPct = Math.min(100, Math.round((todayDone / Math.max(1, dailyGoal)) * 100));

  const recentAttempts = attemptsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const lastAttempt = recentAttempts[0];
  const recommendations = buildRecommendations({ subjectStats, dueCount, qpDocs, mastered, totalRead });

  const examDates = S.profile.examDates || {};
  const upcoming = Object.entries(examDates)
    .map(([examId, date]) => ({ examId, date: toDate(date) }))
    .filter(x => x.date && x.date.getTime() > Date.now())
    .sort((a, b) => a.date - b.date)[0];
  const examTitle = upcoming ? (S.exams.find(e => e.id === upcoming.examId)?.title || "Exam") : "";

  const announcements = await loadAnnouncements(3);
  if (isStale(token)) return;

  const html = `
    <div class="grid grid-4 mb-16">
      <div class="stat-card accent"><div class="stat-value">${streak}</div><div class="stat-label">Day study streak</div></div>
      <div class="stat-card"><div class="stat-value">${goalPct}%</div><div class="stat-label">Daily goal · ${todayDone}/${dailyGoal}</div><div class="progress-track mt-8"><div class="progress-fill" style="width:${goalPct}%"></div></div></div>
      <div class="stat-card"><div class="stat-value">${totalRead}</div><div class="stat-label">Materials marked read</div></div>
      <div class="stat-card"><div class="stat-value">${mastered}</div><div class="stat-label">Questions mastered</div></div>
    </div>

    ${upcoming ? `<div class="card card-soft mb-16"><div class="row-between"><div><strong>${escapeHtml(examTitle)}</strong><p class="small muted mb-0">${formatDate(upcoming.date)}</p></div><span class="badge amber">${Math.ceil((upcoming.date - Date.now()) / 86400000)} days left</span></div></div>` : ""}

    <div class="grid grid-2 mb-16">
      <div class="card">
        <h2 class="card-title">Continue learning</h2>
        <div id="continueList">
          ${recentMaterialsSnap?.size
            ? recentMaterialsSnap.docs.map(d => {
                const p = d.data();
                return `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(p.title || "Study material")}</p><div class="list-item-meta"><span>${escapeHtml(p.subjectTitle || "")}</span><span>${p.status === "read" ? "Read" : "Opened"}</span></div></div><a class="btn btn-small" href="#/material/${encodeURIComponent(d.id)}">Open</a></div>`;
              }).join("")
            : `<p class="muted small">Nothing opened yet. Pick a subject and start with L1.</p>`}
        </div>
        <a class="btn btn-ghost btn-small mt-8" href="#/subjects">Browse subjects</a>
      </div>

      <div class="card">
        <h2 class="card-title">Due revision</h2>
        ${dueCount
          ? `<p class="small muted">${dueCount} item${dueCount === 1 ? "" : "s"} due now.</p><a class="btn btn-primary btn-small" href="#/revision?filter=due">Revise due items</a>`
          : `<p class="small muted">No revision is due right now. Add materials or questions to revision and they will appear here on schedule.</p><a class="btn btn-ghost btn-small" href="#/revision">Open revision</a>`}
      </div>
    </div>

    <div class="card mb-16">
      <div class="row-between mb-8"><h2 class="card-title mb-0">My subjects</h2><a class="btn btn-small" href="#/subjects">Manage</a></div>
      ${subjectStats.length
        ? `<div class="grid grid-2">${subjectStats.map(({ subject, stats }) => `
          <div class="card" style="box-shadow:none">
            <div class="row-between"><strong>${escapeHtml(subject.title || subject.name || "Subject")}</strong><span class="badge">${stats.masteryPercent === null ? "Not assessed" : `${stats.masteryPercent}% mastery`}</span></div>
            <div class="progress-row mt-8"><div class="progress-track"><div class="progress-fill" style="width:${stats.readingPercent}%"></div></div><span class="progress-label">${stats.readingPercent}%</span></div>
            <p class="tiny muted mt-8 mb-0">${stats.readMaterials}/${stats.totalMaterials} materials read · ${stats.masteredQuestions}/${stats.totalQuestions} mastered</p>
            <a class="btn btn-small mt-8" href="#/subject/${encodeURIComponent(subject.id)}">Open subject</a>
          </div>`).join("")}</div>`
        : `<p class="muted small">No subjects selected yet.</p><a class="btn btn-primary btn-small" href="#/onboarding">Choose subjects</a>`}
    </div>

    <div class="grid grid-2 mb-16">
      <div class="card">
        <h2 class="card-title">Recommended next</h2>
        ${recommendations.length
          ? `<div class="stack">${recommendations.map(r => `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(r.title)}</p><div class="list-item-meta"><span>${escapeHtml(r.reason)}</span></div></div><a class="btn btn-small" href="${r.href}">${escapeHtml(r.action || "Open")}</a></div>`).join("")}</div>`
          : `<p class="muted small">Start with an L1 topic or add a subject to get recommendations.</p>`}
      </div>

      <div class="card">
        <h2 class="card-title">Recent tests</h2>
        ${recentAttempts.length
          ? recentAttempts.map(a => `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(a.title || "Test attempt")}</p><div class="list-item-meta"><span>${a.status === "submitted" ? `${a.percentage ?? 0}%` : "In progress"}</span><span>${timeAgo(a.startedAt)}</span></div></div><a class="btn btn-small" href="#/results/${encodeURIComponent(a.id)}">${a.status === "submitted" ? "Result" : "Resume"}</a></div>`).join("")
          : `<p class="muted small">No tests attempted yet.</p><a class="btn btn-small btn-primary" href="#/tests">Take a test</a>`}
      </div>
    </div>

    ${announcements.length ? `<div class="card mb-16"><h2 class="card-title">Announcements</h2>${announcements.map(a => `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(a.title)}</p><div class="list-item-meta"><span>${escapeHtml(a.body || "")}</span><span>${timeAgo(a.publishAt || a.createdAt)}</span></div></div></div>`).join("")}</div>` : ""}

    <div class="card">
      <h2 class="card-title">Quick links</h2>
      <div class="row">
        <a class="btn" href="#/revision">🔁 Revision</a>
        <a class="btn" href="#/tests">📝 Tests</a>
        <a class="btn" href="#/progress">📈 Progress</a>
        <a class="btn" href="#/saved">🔖 Saved</a>
        <a class="btn" href="#/planner">🗓️ Planner</a>
        <a class="btn" href="#/exam-day">⚡ Exam Day Mode</a>
      </div>
    </div>
  `;

  const body = $("#dashBody");
  if (body) body.innerHTML = html;
  bindVerifyGate();
}

function buildRecommendations({ subjectStats, dueCount, qpDocs, mastered, totalRead }) {
  const recs = [];
  if (dueCount > 0) recs.push({ title: `${dueCount} revision item${dueCount === 1 ? "" : "s"} due`, reason: "Spaced revision is most effective when it is done on time.", href: "#/revision?filter=due", action: "Revise" });
  const weak = qpDocs.filter(q => (q.attempts || 0) > 0 && q.mastery !== true).slice(0, 2);
  weak.forEach(q => recs.push({ title: q.title || "Weak question", reason: "You attempted this but have not reached mastery yet.", href: `#/practice?ids=${encodeURIComponent(q.questionId || q.id)}`, action: "Practise" }));
  const unassessed = subjectStats.find(x => x.stats.totalQuestions > 0 && (x.stats.masteredQuestions || 0) === 0);
  if (unassessed) recs.push({ title: `Start ${unassessed.subject.title || "subject"} L1`, reason: "You have not assessed any questions in this subject yet.", href: `#/subject/${encodeURIComponent(unassessed.subject.id)}`, action: "Open" });
  if (!recs.length && totalRead === 0) recs.push({ title: "Read your first L1 material", reason: "Reading is the first step; mastery comes from recall practice afterwards.", href: "#/subjects", action: "Browse" });
  return recs.slice(0, 4);
}

async function loadAnnouncements(limitCount = 5) {
  try {
    const snap = await getDocs(query(collection(db, "announcements"), where("status", "==", "published"), orderBy("publishAt", "desc"), limit(limitCount)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

/* ============================================================
   8. ONBOARDING
   ============================================================ */

async function renderOnboarding(token) {
  setPageHtml(spinnerBlock("Loading examinations…"));
  await loadExams();
  if (isStale(token)) return;

  let subjects = [];
  try {
    const snap = await getDocs(query(collection(db, "subjects"), where("status", "==", "published"), orderBy("order", "asc"), limit(250)));
    subjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Subjects load failed", err);
  }
  if (isStale(token)) return;

  const selectedExamIds = new Set(S.profile?.examIds || []);
  const selectedSubjectIds = new Set(S.selectedSubjects.map(s => s.id));

  const subjectForExams = (examIds) => {
    const ids = examIds.length ? examIds : S.exams.map(e => e.id);
    return subjects.filter(s => (s.examIds || []).some(id => ids.includes(id)));
  };

  const renderSubjectChoices = (examIds) => {
    const list = subjectForExams(examIds);
    const unique = [];
    const seen = new Set();
    list.forEach(s => { if (!seen.has(s.id)) { seen.add(s.id); unique.push(s); } });
    return unique.length
      ? unique.map(s => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="subjectChoice" value="${escapeHtml(s.id)}" ${selectedSubjectIds.has(s.id) ? "checked" : ""}> ${escapeHtml(s.title || s.name || "Subject")}</label>`).join("")
      : `<p class="small muted">No published subjects for the selected examinations yet.</p>`;
  };

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Set up your preparation</h1><p class="page-sub">Choose your target examinations, then select one or more subjects. A shared subject appears only once.</p></div></div>
    <div class="card">
      <h2 class="card-title">1. Target examinations</h2>
      ${S.exams.length ? `<div class="chip-list" id="examChoices">${S.exams.map(e => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="examChoice" value="${escapeHtml(e.id)}" ${selectedExamIds.has(e.id) ? "checked" : ""}> ${escapeHtml(e.title || e.code || "Exam")}</label>`).join("")}</div>` : `<p class="muted">No published examinations yet. Ask the administrator to publish examinations.</p>`}
    </div>
    <div class="card">
      <h2 class="card-title">2. Subjects</h2>
      <p class="small muted">Shared subjects are shown once even when they belong to multiple selected examinations.</p>
      <div id="subjectChoices" class="chip-list">${renderSubjectChoices([...selectedExamIds])}</div>
    </div>
    <div class="card">
      <div class="row-between">
        <p class="small muted mb-0">You can change these later. Removing a subject keeps your past learning history.</p>
        <button id="saveOnboardingBtn" class="btn btn-primary" type="button">Save and open dashboard</button>
      </div>
    </div>
  `);

  const refreshSubjects = () => {
    const ids = $$('input[name="examChoice"]:checked').map(i => i.value);
    const box = $("#subjectChoices");
    if (box) box.innerHTML = renderSubjectChoices(ids);
  };
  $$('input[name="examChoice"]').forEach(cb => cb.addEventListener("change", refreshSubjects));

  $("#saveOnboardingBtn")?.addEventListener("click", async () => {
    const examIds = $$('input[name="examChoice"]:checked').map(i => i.value);
    const subjectIds = $$('input[name="subjectChoice"]:checked').map(i => i.value);
    if (!examIds.length) return toast("Choose at least one examination.", "error");
    if (!subjectIds.length) return toast("Choose at least one subject.", "error");
    const btn = $("#saveOnboardingBtn");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const uid = S.user.uid;
      const existing = await getDocs(collection(db, "users", uid, "selectedSubjects"));
      const batch = writeBatch(db);
      existing.docs.forEach(d => batch.delete(d.ref));
      subjectIds.forEach(id => {
        const subject = subjects.find(s => s.id === id);
        batch.set(doc(db, "users", uid, "selectedSubjects", id), {
          subjectId: id,
          title: subject?.title || subject?.name || "",
          examIds: (subject?.examIds || []).filter(e => examIds.includes(e)),
          addedAt: serverTimestamp()
        });
      });
      batch.set(doc(db, "users", uid), {
        examIds,
        onboardingComplete: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await batch.commit();
      S.profile = { ...(S.profile || {}), examIds, onboardingComplete: true };
      await loadSelectedSubjects();
      toast("Your subjects are saved.", "success");
      go("/home");
    } catch (err) {
      toast(friendlyError(err, "saving onboarding"), "error");
    } finally {
      btn.disabled = false; btn.textContent = "Save and open dashboard";
    }
  });
}

/* ============================================================
   9. SUBJECTS, CHAPTERS, TOPICS, LEVELS
   ============================================================ */

async function renderSubjectsPage(token) {
  setPageHtml(spinnerBlock("Loading your subjects…"));
  await loadSelectedSubjects();
  if (isStale(token)) return;

  const subjects = S.selectedSubjects;
  const stats = [];
  for (const s of subjects) stats.push({ subject: s, stats: await getSubjectStats(s.id) });
  if (isStale(token)) return;

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">My Subjects</h1><p class="page-sub">Your selected subjects and honest reading/mastery progress.</p></div><a class="btn" href="#/onboarding">Change subjects</a></div>
    ${subjects.length
      ? `<div class="grid grid-2">${stats.map(({ subject, stats }) => `
        <div class="card">
          <div class="row-between"><h2 class="card-title mb-0">${escapeHtml(subject.title || subject.name || "Subject")}</h2><span class="badge">${stats.masteryPercent === null ? "Not assessed" : `${stats.masteryPercent}% mastered`}</span></div>
          <p class="small muted">${escapeHtml(subject.description || "")}</p>
          <div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${stats.readingPercent}%"></div></div><span class="progress-label">${stats.readingPercent}%</span></div>
          <p class="tiny muted mt-8">Reading: ${stats.readMaterials}/${stats.totalMaterials} materials · Questions mastered: ${stats.masteredQuestions}/${stats.totalQuestions}</p>
          <div class="row mt-8"><a class="btn btn-primary btn-small" href="#/subject/${encodeURIComponent(subject.id)}">Open subject</a><a class="btn btn-small" href="#/revision?subject=${encodeURIComponent(subject.id)}">Revise</a></div>
        </div>`).join("")}</div>`
      : emptyState("No subjects selected", "Choose your examinations and subjects to start.", `<a class="btn btn-primary" href="#/onboarding">Choose subjects</a>`)}
  `);
}

async function renderSubjectPage(subjectId, token) {
  if (!subjectId) {
    setPageHtml(errorState("Subject not found", "No subject was specified.", "Back to subjects"));
    return;
  }
  setPageHtml(spinnerBlock("Loading subject…"));
  let subject = null;
  try {
    const snap = await getDoc(doc(db, "subjects", subjectId));
    if (snap.exists()) subject = { id: snap.id, ...snap.data() };
  } catch (err) {
    setPageHtml(errorState("Could not load subject", friendlyError(err, "loading subject")));
    return;
  }
  if (isStale(token)) return;
  if (!subject) {
    setPageHtml(emptyState("Subject not found", "This subject may have been removed or is not published.", `<a class="btn btn-primary" href="#/subjects">Back to subjects</a>`));
    return;
  }

  let chapters = [];
  try {
    const snap = await getDocs(query(collection(db, "chapters"), where("subjectId", "==", subjectId), where("status", "==", "published"), orderBy("order", "asc"), limit(200)));
    chapters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Chapters load failed", err);
  }

  const [materialsSnap, questionsSnap, readSnap, masteredSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "materials"), where("subjectId", "==", subjectId), where("status", "==", "published"), limit(500)), "materials"),
    safeGetDocs(query(collection(db, "questions"), where("subjectId", "==", subjectId), where("status", "==", "published"), limit(500)), "questions"),
    safeGetDocs(query(collection(db, "users", S.user.uid, "materialProgress"), where("subjectId", "==", subjectId), where("status", "==", "read"), limit(500)), "read"),
    safeGetDocs(query(collection(db, "users", S.user.uid, "questionProgress"), where("subjectId", "==", subjectId), where("mastery", "==", true), limit(500)), "mastered")
  ]);
  if (isStale(token)) return;

  const materials = materialsSnap?.docs.map(d => d.data()) || [];
  const questions = questionsSnap?.docs.map(d => d.data()) || [];
  const readIds = new Set(readSnap?.docs.map(d => d.data().materialId) || []);
  const masteredIds = new Set(masteredSnap?.docs.map(d => d.data().questionId) || []);

  const chapterStats = chapters.map(ch => {
    const chMaterials = materials.filter(m => m.chapterId === ch.id);
    const chQuestions = questions.filter(q => q.chapterId === ch.id);
    const read = chMaterials.filter(m => readIds.has(m.id) || readIds.has(m.materialId)).length;
    const mastered = chQuestions.filter(q => masteredIds.has(q.id) || masteredIds.has(q.questionId)).length;
    return {
      chapter: ch,
      materials: chMaterials.length,
      read,
      questions: chQuestions.length,
      mastered
    };
  });

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/subjects">My Subjects</a> / <span>${escapeHtml(subject.title || "Subject")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(subject.title || "Subject")}</h1><p class="page-sub">${escapeHtml(subject.description || "")}</p></div><div class="row"><a class="btn btn-small" href="#/revision?subject=${encodeURIComponent(subjectId)}">Revise subject</a><a class="btn btn-primary btn-small" href="#/tests?subject=${encodeURIComponent(subjectId)}">Subject test</a></div></div>
    ${chapterStats.length
      ? `<div class="stack">${chapterStats.map(({ chapter, materials: mTotal, read, questions: qTotal, mastered }) => `
        <div class="card">
          <div class="row-between"><h2 class="card-title mb-0">${escapeHtml(chapter.title || "Chapter")}</h2><span class="badge">${qTotal ? `${masteryPercent(mastered, qTotal)}% mastery` : "Not assessed"}</span></div>
          <p class="small muted">${escapeHtml(chapter.description || "")}</p>
          <div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${readPercent(read, mTotal)}%"></div></div><span class="progress-label">${readPercent(read, mTotal)}%</span></div>
          <p class="tiny muted mt-8">${read}/${mTotal} materials read · ${mastered}/${qTotal} questions mastered</p>
          <a class="btn btn-small mt-8" href="#/chapter/${encodeURIComponent(chapter.id)}">Open chapter</a>
        </div>`).join("")}</div>`
      : emptyState("No published chapters", "This subject has no published chapters yet.", `<a class="btn" href="#/subjects">Back</a>`)}
  `);
}

async function renderChapterPage(chapterId, token) {
  if (!chapterId) return setPageHtml(errorState("Chapter not found", "No chapter was specified."));
  setPageHtml(spinnerBlock("Loading chapter…"));
  let chapter = null;
  try {
    const snap = await getDoc(doc(db, "chapters", chapterId));
    if (snap.exists()) chapter = { id: snap.id, ...snap.data() };
  } catch (err) {
    setPageHtml(errorState("Could not load chapter", friendlyError(err, "loading chapter")));
    return;
  }
  if (isStale(token)) return;
  if (!chapter) return setPageHtml(emptyState("Chapter not found", "This chapter may have been removed.", `<a class="btn" href="#/subjects">Back</a>`));

  let topics = [];
  try {
    const snap = await getDocs(query(collection(db, "topics"), where("chapterId", "==", chapterId), where("status", "==", "published"), orderBy("order", "asc"), limit(200)));
    topics = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }

  const [materialsSnap, questionsSnap, readSnap, masteredSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "materials"), where("chapterId", "==", chapterId), where("status", "==", "published"), limit(500))),
    safeGetDocs(query(collection(db, "questions"), where("chapterId", "==", chapterId), where("status", "==", "published"), limit(500))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "materialProgress"), where("chapterId", "==", chapterId), where("status", "==", "read"), limit(500))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "questionProgress"), where("chapterId", "==", chapterId), where("mastery", "==", true), limit(500)))
  ]);
  if (isStale(token)) return;

  const materials = materialsSnap?.docs.map(d => d.data()) || [];
  const questions = questionsSnap?.docs.map(d => d.data()) || [];
  const readIds = new Set(readSnap?.docs.map(d => d.data().materialId) || []);
  const masteredIds = new Set(masteredSnap?.docs.map(d => d.data().questionId) || []);

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/subjects">My Subjects</a> / <a href="#/subject/${encodeURIComponent(chapter.subjectId || "")}">Subject</a> / <span>${escapeHtml(chapter.title || "Chapter")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(chapter.title || "Chapter")}</h1><p class="page-sub">${escapeHtml(chapter.description || "")}</p></div><a class="btn btn-primary" href="#/tests?chapter=${encodeURIComponent(chapterId)}">Chapter test</a></div>
    ${topics.length
      ? `<div class="grid grid-2">${topics.map(t => {
          const tm = materials.filter(m => m.topicId === t.id);
          const tq = questions.filter(q => q.topicId === t.id);
          const tr = tm.filter(m => readIds.has(m.id)).length;
          const tmastered = tq.filter(q => masteredIds.has(q.id)).length;
          return `<div class="card">
            <div class="row-between"><h2 class="card-title mb-0">${escapeHtml(t.title || "Topic")}</h2><span class="badge">${tq.length ? `${masteryPercent(tmastered, tq.length)}% mastery` : "Not assessed"}</span></div>
            <p class="small muted">${escapeHtml(t.description || "")}</p>
            <div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${readPercent(tr, tm.length)}%"></div></div><span class="progress-label">${readPercent(tr, tm.length)}%</span></div>
            <p class="tiny muted mt-8">${tr}/${tm.length} materials read · ${tmastered}/${tq.length} mastered</p>
            <a class="btn btn-small mt-8" href="#/topic/${encodeURIComponent(t.id)}">Open topic</a>
          </div>`;
        }).join("")}</div>`
      : emptyState("No published topics", "This chapter has no published topics yet.", `<a class="btn" href="#/subjects">Back</a>`)}
  `);
}

async function renderTopicPage(topicId, token) {
  if (!topicId) return setPageHtml(errorState("Topic not found", "No topic was specified."));
  setPageHtml(spinnerBlock("Loading topic…"));
  let topic = null;
  try {
    const snap = await getDoc(doc(db, "topics", topicId));
    if (snap.exists()) topic = { id: snap.id, ...snap.data() };
  } catch (err) {
    setPageHtml(errorState("Could not load topic", friendlyError(err, "loading topic")));
    return;
  }
  if (isStale(token)) return;
  if (!topic) return setPageHtml(emptyState("Topic not found", "This topic may have been removed.", `<a class="btn" href="#/subjects">Back</a>`));

  const [materialsSnap, questionsSnap, readSnap, masteredSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "materials"), where("topicId", "==", topicId), where("status", "==", "published"), orderBy("order", "asc"), limit(200))),
    safeGetDocs(query(collection(db, "questions"), where("topicId", "==", topicId), where("status", "==", "published"), orderBy("order", "asc"), limit(300))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "materialProgress"), where("topicId", "==", topicId), where("status", "==", "read"), limit(300))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "questionProgress"), where("topicId", "==", topicId), where("mastery", "==", true), limit(300)))
  ]);
  if (isStale(token)) return;

  const materials = materialsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const questions = questionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const readIds = new Set(readSnap?.docs.map(d => d.data().materialId) || []);
  const masteredIds = new Set(masteredSnap?.docs.map(d => d.data().questionId) || []);

  const levels = ["L1", "L2", "L3"].map(level => {
    const lm = materials.filter(m => m.level === level);
    const lq = questions.filter(q => q.level === level);
    return {
      level,
      materials: lm,
      questions: lq,
      read: lm.filter(m => readIds.has(m.id)).length,
      mastered: lq.filter(q => masteredIds.has(q.id)).length
    };
  });

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/subjects">My Subjects</a> / <span>${escapeHtml(topic.title || "Topic")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(topic.title || "Topic")}</h1><p class="page-sub">${escapeHtml(topic.description || "")}</p></div><div class="row"><a class="btn btn-small" href="#/practice?topic=${encodeURIComponent(topicId)}">Practise all</a><a class="btn btn-primary btn-small" href="#/revision?topic=${encodeURIComponent(topicId)}">Revise topic</a></div></div>
    <div class="grid grid-3">
      ${levels.map(l => `<div class="card">
        <div class="row-between"><span class="badge ${l.level}">${levelLabel(l.level)}</span><span class="badge">${l.questions.length ? `${masteryPercent(l.mastered, l.questions.length)}%` : "Not assessed"}</span></div>
        <p class="small muted mt-8">${l.materials.length} materials · ${l.questions.length} questions</p>
        <div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${readPercent(l.read, l.materials.length)}%"></div></div><span class="progress-label">${readPercent(l.read, l.materials.length)}%</span></div>
        <div class="row mt-8"><a class="btn btn-small" href="#/level/${encodeURIComponent(topicId)}/${l.level}">Open ${l.level}</a><a class="btn btn-small" href="#/practice?topic=${encodeURIComponent(topicId)}&level=${l.level}">Practise</a></div>
      </div>`).join("")}
    </div>
  `);
}

async function renderLevelPage(topicId, level, token) {
  if (!topicId || !["L1", "L2", "L3"].includes(level)) return setPageHtml(errorState("Level not found", "Invalid topic or level."));
  setPageHtml(spinnerBlock("Loading level…"));
  let topic = null;
  try {
    const snap = await getDoc(doc(db, "topics", topicId));
    if (snap.exists()) topic = { id: snap.id, ...snap.data() };
  } catch (err) { console.warn(err); }
  if (isStale(token)) return;
  if (!topic) return setPageHtml(emptyState("Topic not found", "This topic may have been removed."));

  const [materialsSnap, questionsSnap, readSnap, masteredSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "materials"), where("topicId", "==", topicId), where("level", "==", level), where("status", "==", "published"), orderBy("order", "asc"), limit(100))),
    safeGetDocs(query(collection(db, "questions"), where("topicId", "==", topicId), where("level", "==", level), where("status", "==", "published"), orderBy("order", "asc"), limit(200))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "materialProgress"), where("topicId", "==", topicId), where("level", "==", level), where("status", "==", "read"), limit(200))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "questionProgress"), where("topicId", "==", topicId), where("level", "==", level), where("mastery", "==", true), limit(200)))
  ]);
  if (isStale(token)) return;

  const materials = materialsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const questions = questionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const readIds = new Set(readSnap?.docs.map(d => d.data().materialId) || []);
  const masteredIds = new Set(masteredSnap?.docs.map(d => d.data().questionId) || []);

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/subjects">My Subjects</a> / <a href="#/topic/${encodeURIComponent(topicId)}">${escapeHtml(topic.title || "Topic")}</a> / <span>${level}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(topic.title || "Topic")} — ${levelLabel(level)}</h1><p class="page-sub">Study materials and questions for this level.</p></div><a class="btn btn-primary" href="#/practice?topic=${encodeURIComponent(topicId)}&level=${level}">Practise ${level}</a></div>
    <div class="grid grid-2">
      <div class="card">
        <h2 class="card-title">Study materials (${materials.length})</h2>
        ${materials.length ? materials.map(m => `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(m.title || "Material")}</p><div class="list-item-meta"><span>${readIds.has(m.id) ? "Read" : "Unread"}</span><span>${escapeHtml(m.importance || "normal")}</span></div></div><a class="btn btn-small" href="#/material/${encodeURIComponent(m.id)}">Open</a></div>`).join("") : `<p class="muted small">No published materials for this level.</p>`}
      </div>
      <div class="card">
        <h2 class="card-title">Questions (${questions.length})</h2>
        <p class="small muted">${questions.length ? `${masteredIds.size} mastered` : "No questions published for this level."}</p>
        ${questions.length ? `<a class="btn btn-primary btn-small" href="#/practice?topic=${encodeURIComponent(topicId)}&level=${level}">Start practice</a>` : ""}
      </div>
    </div>
  `);
}

/* ============================================================
   10. MATERIAL READER
   ============================================================ */

function renderMaterialBlock(block) {
  if (!block || typeof block !== "object") return "";
  const type = block.type || "paragraph";
  if (type === "heading") {
    const level = block.level === 2 ? 2 : 3;
    return `<h${level} id="block-${escapeHtml(block.id || "")}">${escapeHtml(block.text || "")}</h${level}>`;
  }
  if (type === "paragraph") return `<p>${sanitizeHtml(block.html || escapeHtml(block.text || ""))}</p>`;
  if (type === "bullets" || type === "list") {
    const items = Array.isArray(block.items) ? block.items : [];
    return `<ul>${items.map(i => `<li>${sanitizeHtml(i)}</li>`).join("")}</ul>`;
  }
  if (type === "table") {
    const headers = Array.isArray(block.headers) ? block.headers : [];
    const rows = Array.isArray(block.rows) ? block.rows : [];
    if (!headers.length && !rows.length) return "";
    return `<div class="table-wrap"><table>${headers.length ? `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>` : ""}<tbody>${rows.map(r => `<tr>${(Array.isArray(r) ? r : []).map(c => `<td>${sanitizeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  if (type === "image") {
    const src = safeUrl(block.url);
    if (!src) return "";
    return `<figure class="reader-block media-block"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt || "Study diagram")}" loading="lazy" data-zoom><figcaption class="tiny muted mt-8">${escapeHtml(block.caption || "")}</figcaption></figure>`;
  }
  if (type === "audio") {
    const src = safeUrl(block.url);
    if (!src) return "";
    return `<div class="reader-block media-block"><p class="small"><strong>Audio explanation</strong></p><audio controls preload="none" src="${escapeHtml(src)}"></audio><p class="tiny muted mt-8">${escapeHtml(block.caption || "")}</p></div>`;
  }
  if (type === "youtube") {
    const id = youtubeId(block.url);
    if (!id) return "";
    return `<div class="reader-block media-block"><p class="small"><strong>Video explanation</strong></p><div class="video-facade" data-video="${escapeHtml(id)}"><img src="https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg" alt="Video thumbnail" loading="lazy"><span class="play-badge">▶</span></div><p class="tiny muted mt-8">${escapeHtml(block.caption || "Tap to play video")}</p></div>`;
  }
  if (type === "keyFacts" || type === "memoryTrick" || type === "commonMistakes" || type === "examTips" || type === "summary") {
    const labels = { keyFacts: "Key facts", memoryTrick: "Memory trick", commonMistakes: "Common mistakes", examTips: "Exam tips", summary: "Remember this" };
    const cls = type === "memoryTrick" ? "trick" : type === "commonMistakes" ? "mistake" : type === "examTips" ? "tip" : type === "summary" ? "summary" : "";
    const items = Array.isArray(block.items) ? block.items : [];
    return `<div class="reader-block reader-callout ${cls}"><h4>${labels[type]}</h4>${block.html ? `<p>${sanitizeHtml(block.html)}</p>` : ""}${items.length ? `<ul>${items.map(i => `<li>${sanitizeHtml(i)}</li>`).join("")}</ul>` : ""}</div>`;
  }
  if (type === "reference") {
    const url = safeUrl(block.url);
    return `<div class="reader-block reader-callout"><h4>Reference</h4>${block.text ? `<p>${escapeHtml(block.text)}</p>` : ""}${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(block.label || url)}</a>` : ""}</div>`;
  }
  return "";
}

async function renderMaterialReader(materialId, token) {
  if (!materialId) return setPageHtml(errorState("Material not found", "No material was specified."));
  setPageHtml(spinnerBlock("Loading material…"));
  let material = null;
  try {
    const snap = await getDoc(doc(db, "materials", materialId));
    if (snap.exists()) material = { id: snap.id, ...snap.data() };
  } catch (err) {
    setPageHtml(errorState("Could not load material", friendlyError(err, "loading material")));
    return;
  }
  if (isStale(token)) return;
  if (!material) return setPageHtml(emptyState("Material not found", "This material may have been removed or is not published.", `<a class="btn" href="#/subjects">Back</a>`));

  let siblings = [];
  try {
    const snap = await getDocs(query(collection(db, "materials"), where("topicId", "==", material.topicId || ""), where("status", "==", "published"), orderBy("order", "asc"), limit(100)));
    siblings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  const index = siblings.findIndex(m => m.id === materialId);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  const progressRef = doc(db, "users", S.user.uid, "materialProgress", materialId);
  let progress = null;
  try {
    const snap = await getDoc(progressRef);
    if (snap.exists()) progress = snap.data();
  } catch (err) { console.warn(err); }

  const blocks = Array.isArray(material.blocks) ? material.blocks : [];
  const headings = blocks.filter(b => b.type === "heading" && b.text);
  const read = progress?.status === "read";
  const saved = await isSaved("material", materialId);
  const inRevision = await isInRevision(materialId);
  if (isStale(token)) return;

  const readingMinutes = Math.max(2, Math.round((blocks.reduce((acc, b) => acc + JSON.stringify(b).length, 0) / 1100) || 3));

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/subjects">Subjects</a> / <a href="#/topic/${encodeURIComponent(material.topicId || "")}">Topic</a> / <span>${escapeHtml(material.title || "Material")}</span></div>
    <div class="reader-shell">
      <aside class="reader-toc ${headings.length ? "" : "hidden"}" id="readerToc">
        <h4>On this page</h4>
        ${headings.map(h => `<a href="#block-${escapeHtml(h.id || "")}">${escapeHtml(h.text)}</a>`).join("")}
      </aside>
      <article class="reader-main">
        <div class="card">
          <div class="row-between">
            <div>
              <span class="badge ${escapeHtml(material.level || "L1")}">${levelLabel(material.level)}</span>
              <span class="badge ${escapeHtml(material.importance || "normal")}">${importanceLabel(material.importance)}</span>
              <span class="badge">${readingMinutes} min read</span>
              ${read ? `<span class="badge green">Read</span>` : `<span class="badge">Unread</span>`}
            </div>
            <div class="media-controls">
              <button class="btn btn-small" type="button" data-font="-">A−</button>
              <button class="btn btn-small" type="button" data-font="+">A+</button>
              <button class="btn btn-small" type="button" id="readerSearchBtn">Search</button>
            </div>
          </div>
          <h1 class="page-title mt-16">${escapeHtml(material.title || "Study material")}</h1>
          <p class="small muted">${escapeHtml(material.summary || material.description || "")}</p>
          <div id="readerSearchBox" class="row hidden mb-16"><input id="readerSearchInput" class="w-full" style="min-height:44px;border:1px solid var(--border);border-radius:10px;padding:8px 11px" placeholder="Search inside this material"><button class="btn btn-small" id="readerSearchClear" type="button">Clear</button></div>
          <div class="reader-content" id="readerContent">
            ${blocks.length ? blocks.map(renderMaterialBlock).join("") : `<p class="muted">This material has no content blocks yet.</p>`}
          </div>
          ${material.source ? `<p class="tiny muted mt-16">Source: ${escapeHtml(material.source)} ${material.verified ? "· Verified" : ""}</p>` : ""}
        </div>

        <div class="card no-print">
          <div class="row">
            <button class="btn ${read ? "btn-ghost" : "btn-primary"}" type="button" id="markReadBtn">${read ? "Mark as unread" : "Mark as read"}</button>
            <button class="btn" type="button" id="favouriteBtn">${saved ? "★ Saved" : "☆ Favourite"}</button>
            <button class="btn" type="button" id="revisionBtn">${inRevision ? "Remove from revision" : "Add to revision"}</button>
            <button class="btn" type="button" id="importantBtn">${progress?.important ? "★ Personally important" : "☆ Mark important"}</button>
            <button class="btn" type="button" id="noteBtn">Personal note</button>
            <button class="btn" type="button" id="reportBtn">Report error</button>
            <button class="btn" type="button" id="printBtn">Print / PDF</button>
            <a class="btn btn-primary" href="#/practice?topic=${encodeURIComponent(material.topicId || "")}&level=${encodeURIComponent(material.level || "L1")}">Test what you learned</a>
          </div>
        </div>

        <div class="reader-nav no-print">
          ${prev ? `<a class="btn" href="#/material/${encodeURIComponent(prev.id)}">← ${escapeHtml(prev.title || "Previous")}</a>` : "<span></span>"}
          ${next ? `<a class="btn" href="#/material/${encodeURIComponent(next.id)}">${escapeHtml(next.title || "Next")} →</a>` : "<span></span>"}
        </div>
      </article>
    </div>
  `);

  const cleanup = [];
  S.pageCleanup = () => cleanup.forEach(fn => fn());

  $$("[data-font]").forEach(btn => btn.addEventListener("click", () => {
    const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--reader-size")) || 17;
    const next = btn.dataset.font === "+" ? Math.min(24, current + 1) : Math.max(14, current - 1);
    document.documentElement.style.setProperty("--reader-size", `${next}px`);
    localStorage.setItem("sajilo-reader-size", String(next));
  }));

  $("#markReadBtn")?.addEventListener("click", async () => {
    try {
      const newStatus = read ? "unread" : "read";
      await setDoc(progressRef, {
        materialId,
        title: material.title || "",
        topicId: material.topicId || "",
        chapterId: material.chapterId || "",
        subjectId: material.subjectId || "",
        level: material.level || "L1",
        status: newStatus,
        readAt: newStatus === "read" ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      }, { merge: true });
      if (newStatus === "read") await touchStudySession({ materialsRead: 1 });
      toast(newStatus === "read" ? "Marked as read." : "Marked as unread.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "saving reading status"), "error"); }
  });

  $("#favouriteBtn")?.addEventListener("click", async () => {
    try {
      await toggleSaved("material", materialId, { title: material.title || "", topicId: material.topicId || "", subjectId: material.subjectId || "", href: `#/material/${materialId}` });
      toast(saved ? "Removed from saved items." : "Saved.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "saving favourite"), "error"); }
  });

  $("#revisionBtn")?.addEventListener("click", async () => {
    try {
      if (inRevision) await removeRevision(materialId);
      else await addRevision({
        itemId: materialId, type: "material", title: material.title || "Study material",
        topicId: material.topicId || "", subjectId: material.subjectId || "", level: material.level || "L1",
        importance: material.importance || "normal"
      });
      toast(inRevision ? "Removed from revision." : "Added to revision schedule.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "updating revision"), "error"); }
  });

  $("#importantBtn")?.addEventListener("click", async () => {
    try {
      await setDoc(progressRef, {
        materialId, important: !progress?.important, updatedAt: serverTimestamp()
      }, { merge: true });
      toast("Personal important mark updated.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "updating important mark"), "error"); }
  });

  $("#noteBtn")?.addEventListener("click", () => openPersonalNote("material", materialId, material.title || "Study material"));
  $("#reportBtn")?.addEventListener("click", () => openReportDialog("material", materialId, material.title || "Study material"));
  $("#printBtn")?.addEventListener("click", () => window.print());
  $("#readerSearchBtn")?.addEventListener("click", () => $("#readerSearchBox")?.classList.toggle("hidden"));

  $("#readerSearchClear")?.addEventListener("click", () => {
    const input = $("#readerSearchInput");
    if (input) input.value = "";
    clearHighlights($("#readerContent"));
  });

  const doSearch = debounce(value => {
    const article = $("#readerContent");
    if (!article) return;
    clearHighlights(article);
    if (!value.trim()) return;
    highlightText(article, value.trim());
  }, 300);
  $("#readerSearchInput")?.addEventListener("input", e => doSearch(e.target.value));

  const savePosition = debounce(async () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / max));
    try {
      await setDoc(progressRef, { materialId, lastPosition: ratio, lastOpenedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    } catch {}
  }, 900);
  window.addEventListener("scroll", savePosition, { passive: true });
  cleanup.push(() => window.removeEventListener("scroll", savePosition));

  $$("[data-zoom]").forEach(img => img.addEventListener("click", () => {
    openModal(`<div class="modal-head"><h2>${escapeHtml(img.alt || "Image")}</h2><button class="modal-close" data-modal-close>✕</button></div><img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt || "")}" style="width:100%;border-radius:12px">`, { wide: true });
  }));

  $$("[data-video]").forEach(box => box.addEventListener("click", () => {
    const id = box.dataset.video;
    box.outerHTML = `<div class="ratio-embed"><iframe width="100%" height="360" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1" title="Video explanation" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }));

  try { document.documentElement.style.setProperty("--reader-size", localStorage.getItem("sajilo-reader-size") || "17px"); } catch {}
}

function clearHighlights(root) {
  if (!root) return;
  root.querySelectorAll("mark.reader-search-hit").forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
}

function highlightText(root, term) {
  if (!root || !term) return;
  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest("script,style,mark")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    if (!regex.test(node.nodeValue)) return;
    regex.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    node.nodeValue.replace(regex, (match, offset) => {
      frag.appendChild(document.createTextNode(node.nodeValue.slice(last, offset)));
      const mark = document.createElement("mark");
      mark.className = "reader-search-hit";
      mark.textContent = match;
      frag.appendChild(mark);
      last = offset + match.length;
      return match;
    });
    frag.appendChild(document.createTextNode(node.nodeValue.slice(last)));
    node.replaceWith(frag);
  });
}

/* ============================================================
   11. QUESTION PRACTICE
   ============================================================ */

async function loadQuestionsForPractice(params) {
  const ids = params.get("ids");
  if (ids) {
    const list = ids.split(",").map(s => s.trim()).filter(Boolean).slice(0, 100);
    const out = [];
    for (const id of list) {
      try {
        const snap = await getDoc(doc(db, "questions", id));
        if (snap.exists()) out.push({ id: snap.id, ...snap.data() });
      } catch {}
    }
    return out;
  }
  const topicId = params.get("topic");
  const level = params.get("level");
  const subjectId = params.get("subject");
  const chapterId = params.get("chapter");
  if (!topicId && !subjectId && !chapterId) return [];
  const field = topicId ? "topicId" : chapterId ? "chapterId" : "subjectId";
  const value = topicId || chapterId || subjectId;
  let q = query(collection(db, "questions"), where("status", "==", "published"), where(field, "==", value), limit(300));
  const snap = await getDocs(q);
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (level) items = items.filter(qq => qq.level === level);
  return items.slice(0, 100);
}

async function renderPractice(params, token) {
  setPageHtml(spinnerBlock("Preparing questions…"));
  let questions = [];
  try {
    questions = await loadQuestionsForPractice(params);
  } catch (err) {
    setPageHtml(errorState("Could not load questions", friendlyError(err, "loading questions")));
    return;
  }
  if (isStale(token)) return;
  if (!questions.length) {
    setPageHtml(emptyState("No questions found", "There are no published questions matching this scope. Try another level or topic.", `<a class="btn btn-primary" href="#/subjects">Browse subjects</a>`));
    return;
  }

  const progressSnap = await safeGetDocs(query(collection(db, "users", S.user.uid, "questionProgress"), where("topicId", "==", questions[0].topicId || ""), limit(300)));
  const progressMap = new Map((progressSnap?.docs || []).map(d => [d.data().questionId, d.data()]));

  S.practice = {
    questions,
    index: 0,
    selected: null,
    revealed: false,
    recorded: new Set(),
    progressMap,
    startedAt: Date.now()
  };

  renderPracticeQuestion();
  bindPracticeKeyboard();
}

function practiceQuestionHtml() {
  const p = S.practice;
  const q = p.questions[p.index];
  const progress = p.progressMap.get(q.id);
  const options = Array.isArray(q.options) ? q.options : [];
  const isSaved = false;
  return `
    <div class="question-card">
      <div class="row-between mb-8">
        <div class="row">
          <span class="badge ${escapeHtml(q.level || "L1")}">${levelLabel(q.level)}</span>
          <span class="badge ${escapeHtml(q.importance || "normal")}">${importanceLabel(q.importance)}</span>
          ${progress?.mastery ? `<span class="badge green">Mastered</span>` : `<span class="badge">${progress?.attempts ? "In progress" : "Not assessed"}</span>`}
        </div>
        <span class="small muted">${p.index + 1} / ${p.questions.length}</span>
      </div>
      <div class="progress-track mb-16"><div class="progress-fill" style="width:${((p.index + 1) / p.questions.length) * 100}%"></div></div>
      <div class="question-stem">${escapeHtml(q.questionText || q.stem || "Question")}</div>
      <div class="option-list" id="optionList">
        ${options.map((opt, i) => {
          const key = opt.id || String.fromCharCode(97 + i);
          const selected = p.selected === key;
          const correct = p.revealed && q.correctOptionId === key;
          const wrong = p.revealed && selected && q.correctOptionId !== key;
          return `<button class="option-btn ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}" data-option="${escapeHtml(key)}" type="button"><span class="option-key">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(opt.text || opt.label || "")}</span></button>`;
        }).join("")}
      </div>
      ${p.revealed ? `<div class="explanation-box">
        <h4>Answer: ${escapeHtml(options.find(o => (o.id || "") === q.correctOptionId)?.text || q.correctOptionId || "—")}</h4>
        <p>${sanitizeHtml(q.explanation || "No explanation was provided.")}</p>
        ${q.memoryTrick ? `<div class="reader-callout trick"><h4>Memory trick</h4><p>${escapeHtml(q.memoryTrick)}</p></div>` : ""}
        ${q.source ? `<p class="tiny muted">Source: ${escapeHtml(q.source)} ${q.verified ? "· Verified" : ""}</p>` : ""}
      </div>` : ""}
      <div class="practice-footer">
        <button class="btn" type="button" id="practicePrevBtn" ${p.index === 0 ? "disabled" : ""}>← Previous</button>
        <button class="btn" type="button" id="practiceNextBtn" ${p.index >= p.questions.length - 1 ? "disabled" : ""}>Next →</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" type="button" id="checkAnswerBtn">${p.revealed ? "Hide answer" : "Check / reveal"}</button>
      </div>
      <div class="row mt-16 small muted">
        <span class="kbd">J</span>/<span class="kbd">K</span> navigate
        <span class="kbd">1</span>–<span class="kbd">6</span> select
        <span class="kbd">Space</span> reveal
        <span class="kbd">B</span> bookmark
      </div>
      <div class="row mt-16 no-print">
        <button class="btn btn-small" type="button" id="practiceBookmarkBtn">${isSaved ? "★ Bookmarked" : "☆ Bookmark"}</button>
        <button class="btn btn-small" type="button" id="practiceNoteBtn">Personal note</button>
        <button class="btn btn-small" type="button" id="practiceDifficultBtn">${progress?.difficult ? "Difficult ✓" : "Mark difficult"}</button>
        <button class="btn btn-small" type="button" id="practiceLearnedBtn">${progress?.learned ? "Learned ✓" : "Mark learned"}</button>
        <button class="btn btn-small" type="button" id="practiceReportBtn">Report error</button>
        <button class="btn btn-small" type="button" id="practiceCopyBtn">Copy question</button>
      </div>
    </div>`;
}

function renderPracticeQuestion() {
  const p = S.practice;
  if (!p) return;
  const q = p.questions[p.index];
  const progress = p.progressMap.get(q.id);
  const isSavedNow = false;
  els.app.innerHTML = `
    <div class="page-head"><div><h1 class="page-title">Question practice</h1><p class="page-sub">Study mode. Revealing an answer without selecting an option does not count as a correct attempt.</p></div><a class="btn" href="#/revision">Revision</a></div>
    <div id="practiceBox">${practiceQuestionHtml()}</div>
  `;
  bindPracticeQuestion();
}

function bindPracticeQuestion() {
  const p = S.practice;
  if (!p) return;
  const q = p.questions[p.index];

  $$("[data-option]").forEach(btn => btn.addEventListener("click", () => {
    if (p.revealed) return;
    p.selected = btn.dataset.option;
    renderPracticeQuestion();
  }));

  $("#checkAnswerBtn")?.addEventListener("click", async () => {
    if (p.revealed) {
      p.revealed = false;
      renderPracticeQuestion();
      return;
    }
    if (!p.selected) return toast("Select an option first. Revealing without a selection does not create a correct attempt.", "error");
    p.revealed = true;
    if (!p.recorded.has(q.id)) {
      p.recorded.add(q.id);
      await recordQuestionAttempt(q, p.selected);
    }
    renderPracticeQuestion();
  });

  $("#practicePrevBtn")?.addEventListener("click", () => {
    if (p.index > 0) { p.index--; p.selected = null; p.revealed = false; renderPracticeQuestion(); }
  });
  $("#practiceNextBtn")?.addEventListener("click", () => {
    if (p.index < p.questions.length - 1) { p.index++; p.selected = null; p.revealed = false; renderPracticeQuestion(); }
  });

  $("#practiceBookmarkBtn")?.addEventListener("click", async () => {
    try {
      await toggleSaved("question", q.id, { title: q.questionText || "Question", topicId: q.topicId || "", subjectId: q.subjectId || "", href: `#/practice?ids=${encodeURIComponent(q.id)}` });
      toast("Bookmark updated.", "success");
    } catch (err) { toast(friendlyError(err, "bookmarking question"), "error"); }
  });

  $("#practiceNoteBtn")?.addEventListener("click", () => openPersonalNote("question", q.id, q.questionText || "Question"));
  $("#practiceReportBtn")?.addEventListener("click", () => openReportDialog("question", q.id, q.questionText || "Question"));
  $("#practiceCopyBtn")?.addEventListener("click", async () => {
    const text = `${q.questionText || ""}\n${(q.options || []).map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text || ""}`).join("\n")}`;
    try { await navigator.clipboard.writeText(text); toast("Question copied.", "success"); }
    catch { toast("Copy failed. Select the text manually.", "error"); }
  });

  $("#practiceDifficultBtn")?.addEventListener("click", async () => {
    try {
      const current = p.progressMap.get(q.id)?.difficult || false;
      await setDoc(doc(db, "users", S.user.uid, "questionProgress", q.id), {
        questionId: q.id, title: q.questionText || "", topicId: q.topicId || "", subjectId: q.subjectId || "", level: q.level || "L1", difficult: !current, updatedAt: serverTimestamp()
      }, { merge: true });
      p.progressMap.set(q.id, { ...(p.progressMap.get(q.id) || {}), difficult: !current });
      toast("Difficult mark updated.", "success");
      renderPracticeQuestion();
    } catch (err) { toast(friendlyError(err, "updating difficult mark"), "error"); }
  });

  $("#practiceLearnedBtn")?.addEventListener("click", async () => {
    try {
      const current = p.progressMap.get(q.id)?.learned || false;
      await setDoc(doc(db, "users", S.user.uid, "questionProgress", q.id), {
        questionId: q.id, title: q.questionText || "", topicId: q.topicId || "", subjectId: q.subjectId || "", level: q.level || "L1", learned: !current, updatedAt: serverTimestamp()
      }, { merge: true });
      p.progressMap.set(q.id, { ...(p.progressMap.get(q.id) || {}), learned: !current });
      toast("Learned mark updated. Mastery still requires repeated correct recall.", "success");
      renderPracticeQuestion();
    } catch (err) { toast(friendlyError(err, "updating learned mark"), "error"); }
  });
}

function bindPracticeKeyboard() {
  const handler = e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag) || e.target.isContentEditable) return;
    const p = S.practice;
    if (!p) return;
    if (e.key.toLowerCase() === "j") {
      e.preventDefault();
      if (p.index < p.questions.length - 1) { p.index++; p.selected = null; p.revealed = false; renderPracticeQuestion(); }
    } else if (e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (p.index > 0) { p.index--; p.selected = null; p.revealed = false; renderPracticeQuestion(); }
    } else if (/^[1-6]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const q = p.questions[p.index];
      const opt = (q.options || [])[idx];
      if (opt && !p.revealed) { p.selected = opt.id || String.fromCharCode(97 + idx); renderPracticeQuestion(); }
    } else if (e.key === " ") {
      e.preventDefault();
      $("#checkAnswerBtn")?.click();
    } else if (e.key.toLowerCase() === "b") {
      e.preventDefault();
      $("#practiceBookmarkBtn")?.click();
    }
  };
  document.addEventListener("keydown", handler);
  const cleanup = () => document.removeEventListener("keydown", handler);
  const old = S.pageCleanup;
  S.pageCleanup = () => { if (old) old(); cleanup(); };
}

async function recordQuestionAttempt(question, selectedOptionId) {
  const correct = selectedOptionId === question.correctOptionId;
  const ref = doc(db, "users", S.user.uid, "questionProgress", question.id);
  const today = nepalDateKey();
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? snap.data() : {};
      let consecutive = Number(data.consecutiveCorrect || 0);
      let correctDays = Array.isArray(data.correctDays) ? [...data.correctDays] : [];
      if (correct) {
        if (!correctDays.includes(today)) correctDays = [...correctDays, today].slice(-10);
        if (data.lastCorrectDate !== today) consecutive += 1;
      } else {
        consecutive = 0;
      }
      const ratingBonus = data.lastRating === "good" || data.lastRating === "easy";
      const mastery = correct && (consecutive >= 3 || (correctDays.length >= 2 && ratingBonus));
      tx.set(ref, {
        questionId: question.id,
        title: question.questionText || "",
        topicId: question.topicId || "",
        chapterId: question.chapterId || "",
        subjectId: question.subjectId || "",
        level: question.level || "L1",
        importance: question.importance || "normal",
        attempts: increment(1),
        correct: increment(correct ? 1 : 0),
        consecutiveCorrect: consecutive,
        correctDays,
        lastCorrectDate: correct ? today : data.lastCorrectDate || null,
        mastery,
        lastSelected: selectedOptionId,
        lastCorrect: correct,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    S.practice.progressMap.set(question.id, {
      ...(S.practice.progressMap.get(question.id) || {}),
      attempts: (S.practice.progressMap.get(question.id)?.attempts || 0) + 1,
      correct: (S.practice.progressMap.get(question.id)?.correct || 0) + (correct ? 1 : 0),
      mastery: S.practice.progressMap.get(question.id)?.mastery || false
    });
    await touchStudySession({ questionsAttempted: 1 });
  } catch (err) {
    console.warn("Question attempt save failed", err);
    toast("Answer shown, but progress could not be saved. Check your connection.", "error");
  }
}

/* ============================================================
   12. REVISION
   ============================================================ */

async function isSaved(type, itemId) {
  try {
    const snap = await getDoc(doc(db, "users", S.user.uid, "savedItems", `${type}_${itemId}`));
    return snap.exists();
  } catch { return false; }
}

async function toggleSaved(type, itemId, meta = {}) {
  const ref = doc(db, "users", S.user.uid, "savedItems", `${type}_${itemId}`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, {
    type, itemId,
    title: meta.title || "",
    href: meta.href || "",
    topicId: meta.topicId || "",
    subjectId: meta.subjectId || "",
    createdAt: serverTimestamp()
  });
  return true;
}

async function isInRevision(itemId) {
  try {
    const snap = await getDoc(doc(db, "users", S.user.uid, "revisionSchedule", itemId));
    return snap.exists();
  } catch { return false; }
}

async function addRevision(meta) {
  const ref = doc(db, "users", S.user.uid, "revisionSchedule", meta.itemId);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    itemId: meta.itemId,
    type: meta.type || "material",
    title: meta.title || "",
    topicId: meta.topicId || "",
    subjectId: meta.subjectId || "",
    level: meta.level || "L1",
    importance: meta.importance || "normal",
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    lapses: 0,
    nextReview: Timestamp.now(),
    lastRating: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

async function removeRevision(itemId) {
  await deleteDoc(doc(db, "users", S.user.uid, "revisionSchedule", itemId));
}

function sm2Update(data, rating) {
  let ease = Number(data.ease || 2.5);
  let interval = Number(data.interval || 0);
  let repetitions = Number(data.repetitions || 0);
  let lapses = Number(data.lapses || 0);

  if (rating === "again") {
    repetitions = 0;
    interval = 1;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
  } else if (rating === "hard") {
    ease = Math.max(1.3, ease - 0.15);
    interval = Math.max(1, Math.round(interval * 1.2));
    repetitions += 1;
  } else if (rating === "good") {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.max(1, Math.round(interval * ease));
    repetitions += 1;
  } else if (rating === "easy") {
    ease = Math.min(3.2, ease + 0.15);
    interval = Math.max(2, Math.round((interval || 1) * ease * 1.3));
    repetitions += 1;
  }

  const nextReview = new Date(Date.now() + interval * 86400000);
  return { ease, interval, repetitions, lapses, nextReview, lastRating: rating };
}

async function rateRevision(item, rating) {
  const ref = doc(db, "users", S.user.uid, "revisionSchedule", item.itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const updated = sm2Update(data, rating);
  await setDoc(ref, { ...updated, nextReview: Timestamp.fromDate(updated.nextReview), updatedAt: serverTimestamp() }, { merge: true });

  if (item.type === "question") {
    const qRef = doc(db, "users", S.user.uid, "questionProgress", item.itemId);
    const qSnap = await getDoc(qRef);
    const qData = qSnap.exists() ? qSnap.data() : {};
    const today = nepalDateKey();
    const correctDays = Array.isArray(qData.correctDays) ? [...qData.correctDays] : [];
    if (!correctDays.includes(today)) correctDays.push(today);
    const ratingBonus = rating === "good" || rating === "easy";
    const mastery = correctDays.length >= 2 && ratingBonus;
    await setDoc(qRef, {
      questionId: item.itemId,
      title: item.title || "",
      topicId: item.topicId || "",
      subjectId: item.subjectId || "",
      level: item.level || "L1",
      correctDays: correctDays.slice(-10),
      lastRating: rating,
      mastery: qData.mastery === true || mastery,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
  await touchStudySession({ reviewsCompleted: 1 });
}

async function renderRevisionPage(token) {
  setPageHtml(spinnerBlock("Loading revision queue…"));
  const [dueSnap, allSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "users", S.user.uid, "revisionSchedule"), where("nextReview", "<=", Timestamp.now()), orderBy("nextReview", "asc"), limit(50)), "due revision"),
    safeGetDocs(query(collection(db, "users", S.user.uid, "revisionSchedule"), orderBy("nextReview", "asc"), limit(100)), "revision")
  ]);
  if (isStale(token)) return;

  const due = dueSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const all = allSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const params = parseRoute().params;
  const filter = params.get("filter") || "";
  const subject = params.get("subject") || "";
  const topic = params.get("topic") || "";

  let queue = filter === "due" ? due : all;
  if (subject) queue = queue.filter(i => i.subjectId === subject);
  if (topic) queue = queue.filter(i => i.topicId === topic);

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Quick Revision</h1><p class="page-sub">Spaced recall using Again / Hard / Good / Easy. Rating a material never fabricates question correctness.</p></div><a class="btn" href="#/exam-day">Exam Day Mode</a></div>
    <div class="card mb-16">
      <div class="row">
        <a class="btn ${filter === "due" ? "btn-primary" : ""}" href="#/revision?filter=due">Due now (${due.length})</a>
        <a class="btn ${!filter ? "btn-primary" : ""}" href="#/revision">All scheduled (${all.length})</a>
        <button class="btn" type="button" id="startFlashcardsBtn" ${queue.length ? "" : "disabled"}>Start flashcards</button>
        <button class="btn" type="button" id="startQaBtn" ${queue.length ? "" : "disabled"}>Questions & answers</button>
      </div>
      <p class="small muted mt-8">${queue.length} item${queue.length === 1 ? "" : "s"} in this queue. Ratings update the SM-2 schedule.</p>
    </div>
    ${queue.length
      ? `<div class="stack">${queue.map(item => `<div class="card"><div class="row-between"><div><strong>${escapeHtml(item.title || "Revision item")}</strong><div class="list-item-meta"><span>${escapeHtml(item.type || "material")}</span><span>${item.level || ""}</span><span>Next: ${formatDate(item.nextReview)}</span></div></div><div class="row"><button class="btn btn-small" data-rate="again" data-id="${escapeHtml(item.itemId)}">Again</button><button class="btn btn-small" data-rate="hard" data-id="${escapeHtml(item.itemId)}">Hard</button><button class="btn btn-small" data-rate="good" data-id="${escapeHtml(item.itemId)}">Good</button><button class="btn btn-small" data-rate="easy" data-id="${escapeHtml(item.itemId)}">Easy</button><a class="btn btn-small" href="${item.type === "question" ? `#/practice?ids=${encodeURIComponent(item.itemId)}` : `#/material/${encodeURIComponent(item.itemId)}`}">Open</a></div></div></div>`).join("")}</div>`
      : emptyState("Revision queue is empty", "Add materials or questions to revision, or add wrong answers from a test result.", `<a class="btn btn-primary" href="#/subjects">Browse subjects</a>`)}
  `);

  $$("[data-rate]").forEach(btn => btn.addEventListener("click", async () => {
    const item = queue.find(i => i.itemId === btn.dataset.id);
    if (!item) return;
    btn.disabled = true;
    try {
      await rateRevision(item, btn.dataset.rate);
      toast("Revision scheduled.", "success");
      router();
    } catch (err) {
      toast(friendlyError(err, "saving revision rating"), "error");
      btn.disabled = false;
    }
  }));

  $("#startFlashcardsBtn")?.addEventListener("click", () => startRevisionSession(queue, "flashcards"));
  $("#startQaBtn")?.addEventListener("click", () => startRevisionSession(queue, "qa"));
}

function startRevisionSession(queue, mode) {
  if (!queue.length) return;
  let index = 0;
  let showBack = false;
  const render = () => {
    const item = queue[index];
    openModal(`
      <div class="modal-head"><h2>${mode === "flashcards" ? "Flashcards" : "Questions & answers"}</h2><button class="modal-close" data-modal-close>✕</button></div>
      <p class="small muted">${index + 1} / ${queue.length}</p>
      <div class="card" style="box-shadow:none;min-height:180px;display:flex;flex-direction:column;justify-content:center">
        <h3 class="center">${escapeHtml(item.title || "Revision item")}</h3>
        ${showBack ? `<p class="center muted">Open the source to review the full explanation.</p><div class="center mt-8"><a class="btn btn-small" href="${item.type === "question" ? `#/practice?ids=${encodeURIComponent(item.itemId)}` : `#/material/${encodeURIComponent(item.itemId)}`}" data-modal-close>Open source</a></div>` : `<p class="center muted">Recall the answer before revealing.</p>`}
      </div>
      <div class="row mt-16" style="justify-content:center">
        <button class="btn" id="revPrev" ${index === 0 ? "disabled" : ""}>←</button>
        <button class="btn btn-primary" id="revReveal">${showBack ? "Hide" : "Reveal"}</button>
        <button class="btn" id="revNext" ${index >= queue.length - 1 ? "disabled" : ""}>→</button>
      </div>
    `);
    $("#revReveal").onclick = () => { showBack = !showBack; render(); };
    $("#revPrev").onclick = () => { if (index > 0) { index--; showBack = false; render(); } };
    $("#revNext").onclick = () => { if (index < queue.length - 1) { index++; showBack = false; render(); } };
  };
  render();
}

async function renderExamDay(token) {
  setPageHtml(spinnerBlock("Building your Exam Day sequence…"));
  const [dueSnap, weakSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "users", S.user.uid, "revisionSchedule"), where("nextReview", "<=", Timestamp.now()), orderBy("nextReview", "asc"), limit(30))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "questionProgress"), where("mastery", "==", false), limit(50)))
  ]);
  if (isStale(token)) return;
  const due = dueSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const weak = weakSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const items = [
    ...due.map(i => ({ ...i, reason: "Overdue revision" })),
    ...weak.filter(w => (w.attempts || 0) > 0).map(w => ({ itemId: w.questionId || w.id, type: "question", title: w.title || "Weak question", reason: "Weak recall", href: `#/practice?ids=${encodeURIComponent(w.questionId || w.id)}` }))
  ].slice(0, 30);

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Exam Day Mode</h1><p class="page-sub">A distraction-free sequence prioritizing overdue reviews and weak questions.</p></div><a class="btn" href="#/revision">Normal revision</a></div>
    ${items.length
      ? `<div class="card"><div class="stack">${items.map((item, i) => `<div class="list-item"><span class="badge">${i + 1}</span><div class="list-item-main"><p class="list-item-title">${escapeHtml(item.title || "Item")}</p><div class="list-item-meta"><span>${escapeHtml(item.reason)}</span></div></div><a class="btn btn-small btn-primary" href="${item.type === "question" ? `#/practice?ids=${encodeURIComponent(item.itemId)}` : `#/material/${encodeURIComponent(item.itemId)}`}">Open</a></div>`).join("")}</div></div>`
      : emptyState("No urgent items", "Take a test or add revision items so Exam Day Mode has something meaningful to prioritise.", `<a class="btn btn-primary" href="#/tests">Take a test</a>`)}
  `);
}

/* ============================================================
   13. TESTS AND RESULTS
   ============================================================ */

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function renderTestsPage(token) {
  setPageHtml(spinnerBlock("Loading tests…"));
  let testSets = [];
  try {
    const snap = await getDocs(query(collection(db, "testSets"), where("status", "==", "published"), orderBy("order", "asc"), limit(100)));
    testSets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }

  const attemptsSnap = await safeGetDocs(query(collection(db, "users", S.user.uid, "testAttempts"), orderBy("startedAt", "desc"), limit(20)), "attempts");
  if (isStale(token)) return;
  const attempts = attemptsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Tests</h1><p class="page-sub">Timed tests with absolute deadlines, autosave, refresh recovery and detailed results.</p></div><a class="btn" href="#/results">Past results</a></div>
    <div class="card mb-16">
      <h2 class="card-title">Available tests</h2>
      ${testSets.length ? `<div class="grid grid-2">${testSets.map(t => `<div class="card" style="box-shadow:none"><strong>${escapeHtml(t.title || "Test")}</strong><p class="small muted">${escapeHtml(t.description || "")}</p><p class="tiny muted">${t.questionCount || 0} questions · ${t.durationMin || 0} min · pass ${t.passPercent || 50}%${t.negativeMarking ? " · negative marking" : ""}</p><button class="btn btn-primary btn-small" type="button" data-start-test="${escapeHtml(t.id)}">Start test</button></div>`).join("")}</div>` : `<p class="muted small">No published test sets yet. An administrator can create topic, chapter, subject or mock tests.</p>`}
    </div>
    <div class="card">
      <h2 class="card-title">Recent attempts</h2>
      ${attempts.length ? attempts.map(a => `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(a.title || "Attempt")}</p><div class="list-item-meta"><span>${a.status === "submitted" ? `${a.percentage ?? 0}%` : "In progress"}</span><span>${timeAgo(a.startedAt)}</span></div></div><a class="btn btn-small" href="#/results/${encodeURIComponent(a.id)}">${a.status === "submitted" ? "Result" : "Resume"}</a></div>`).join("") : `<p class="muted small">No attempts yet.</p>`}
    </div>
  `);

  $$("[data-start-test]").forEach(btn => btn.addEventListener("click", () => startTest(btn.dataset.startTest)));
}

async function fetchTestPool(testSet) {
  const scopeType = testSet.scopeType || "subject";
  const scopeId = testSet.scopeId || "";
  const field = scopeType === "topic" ? "topicId" : scopeType === "chapter" ? "chapterId" : scopeType === "subject" ? "subjectId" : "subjectId";
  let q = query(collection(db, "questions"), where("status", "==", "published"), where(field, "==", scopeId), limit(400));
  const snap = await getDocs(q);
  let pool = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (testSet.level) pool = pool.filter(qq => qq.level === testSet.level);
  if (testSet.importanceOnly) pool = pool.filter(qq => ["important", "veryImportant"].includes(qq.importance));
  return pool;
}

async function startTest(testSetId) {
  try {
    const snap = await getDoc(doc(db, "testSets", testSetId));
    if (!snap.exists()) return toast("Test not found.", "error");
    const testSet = { id: snap.id, ...snap.data() };
    let pool = [];
    try { pool = await fetchTestPool(testSet); }
    catch (err) {
      if (err?.code === "failed-precondition") return toast("This test query needs a Firestore index. Ask the administrator to create the documented index.", "error", 6000);
      throw err;
    }
    const requested = Number(testSet.questionCount || 10);
    const available = pool.length;
    if (!available) return toast("No published questions match this test scope yet.", "error");
    const count = Math.min(requested, available);
    if (count < requested) {
      const ok = await confirmDialog(`This test requests ${requested} questions, but only ${available} matching published questions exist. Continue with ${count}?`, { confirmText: `Use ${count}` });
      if (!ok) return;
    }
    const selected = shuffleArray(pool).slice(0, count);
    const attemptRef = doc(collection(db, "users", S.user.uid, "testAttempts"));
    const durationMin = Number(testSet.durationMin || 20);
    const deadline = new Date(Date.now() + durationMin * 60000);
    await setDoc(attemptRef, {
      uid: S.user.uid,
      testId: testSetId,
      title: testSet.title || "Test",
      scopeType: testSet.scopeType || "subject",
      scopeId: testSet.scopeId || "",
      level: testSet.level || "",
      totalQuestions: count,
      marksPerQuestion: Number(testSet.marksPerQuestion || 1),
      negativeMarking: Number(testSet.negativeMarking || 0),
      passPercent: Number(testSet.passPercent || 50),
      durationMin,
      startedAt: serverTimestamp(),
      deadline: Timestamp.fromDate(deadline),
      status: "active",
      score: 0,
      percentage: 0
    });
    const batch = writeBatch(db);
    selected.forEach((q, i) => {
      const itemRef = doc(collection(attemptRef, "items"));
      batch.set(itemRef, {
        order: i,
        questionId: q.id,
        questionText: q.questionText || "",
        options: q.options || [],
        correctOptionId: q.correctOptionId || "",
        explanation: q.explanation || "",
        memoryTrick: q.memoryTrick || "",
        topicId: q.topicId || "",
        chapterId: q.chapterId || "",
        subjectId: q.subjectId || "",
        level: q.level || "L1",
        importance: q.importance || "normal",
        source: q.source || "",
        verified: q.verified === true,
        selectedOption: null,
        markedForReview: false
      });
    });
    await batch.commit();
    go(`/test/active/${attemptRef.id}`);
  } catch (err) {
    toast(friendlyError(err, "starting test"), "error");
  }
}

async function renderActiveTest(attemptId, token) {
  if (!attemptId) return setPageHtml(errorState("Attempt not found", "No attempt was specified."));
  setPageHtml(spinnerBlock("Loading your test…"));
  let attempt = null;
  try {
    const snap = await getDoc(doc(db, "users", S.user.uid, "testAttempts", attemptId));
    if (snap.exists()) attempt = { id: snap.id, ...snap.data() };
  } catch (err) {
    setPageHtml(errorState("Could not load attempt", friendlyError(err, "loading attempt")));
    return;
  }
  if (isStale(token)) return;
  if (!attempt) return setPageHtml(emptyState("Attempt not found", "This attempt does not exist."));
  if (attempt.status !== "active") { go(`/results/${attemptId}`); return; }

  const itemsSnap = await safeGetDocs(query(collection(db, "users", S.user.uid, "testAttempts", attemptId, "items"), orderBy("order", "asc"), limit(200)), "test items");
  if (isStale(token)) return;
  const items = itemsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  if (!items.length) return setPageHtml(emptyState("No test items", "This attempt has no questions."));

  let current = 0;
  const answers = new Map(items.map(i => [i.id, i.selectedOption || null]));
  const reviews = new Map(items.map(i => [i.id, i.markedForReview === true]));

  const render = () => {
    const item = items[current];
    const selected = answers.get(item.id);
    const deadline = toDate(attempt.deadline) || new Date(Date.now() + 60000);
    const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
    const ss = String(remaining % 60).padStart(2, "0");

    els.app.innerHTML = `
      <div class="page-head"><div><h1 class="page-title">${escapeHtml(attempt.title || "Test")}</h1><p class="page-sub">Autosaved. Refreshing recovers this attempt until the absolute deadline.</p></div><div class="test-timer ${remaining < 120 ? "danger" : ""}" id="testTimer">⏱ ${mm}:${ss}</div></div>
      <div class="test-layout">
        <div class="question-card">
          <div class="row-between mb-8"><span class="badge ${escapeHtml(item.level || "L1")}">${levelLabel(item.level)}</span><span class="small muted">${current + 1} / ${items.length}</span></div>
          <div class="progress-track mb-16"><div class="progress-fill" style="width:${((current + 1) / items.length) * 100}%"></div></div>
          <div class="question-stem">${escapeHtml(item.questionText || "")}</div>
          <div class="option-list">
            ${(item.options || []).map((opt, i) => {
              const key = opt.id || String.fromCharCode(97 + i);
              return `<button class="option-btn ${selected === key ? "selected" : ""}" data-test-option="${escapeHtml(key)}" type="button"><span class="option-key">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(opt.text || "")}</span></button>`;
            }).join("")}
          </div>
          <div class="practice-footer">
            <button class="btn" id="testPrev" type="button" ${current === 0 ? "disabled" : ""}>←</button>
            <button class="btn" id="testNext" type="button" ${current >= items.length - 1 ? "disabled" : ""}>→</button>
            <button class="btn" id="testClear" type="button">Clear answer</button>
            <button class="btn ${reviews.get(item.id) ? "btn-warning" : ""}" id="testMark" type="button">${reviews.get(item.id) ? "Unmark review" : "Mark for review"}</button>
            <span class="spacer"></span>
            <button class="btn btn-primary" id="testSubmit" type="button">Submit test</button>
          </div>
        </div>
        <div class="card">
          <h3 class="card-title">Question palette</h3>
          <div class="palette">${items.map((it, i) => `<button type="button" class="${answers.get(it.id) ? "answered" : ""} ${reviews.get(it.id) ? "review" : ""} ${i === current ? "current" : ""}" data-palette="${i}">${i + 1}</button>`).join("")}</div>
          <div class="test-legend mt-8"><span><span class="legend-dot" style="background:var(--green)"></span>Answered</span><span><span class="legend-dot" style="background:var(--amber)"></span>Review</span><span><span class="legend-dot" style="background:var(--surface-2);border:1px solid var(--border)"></span>Unanswered</span></div>
          <button class="btn btn-block btn-danger mt-16" id="testSubmit2" type="button">Submit test</button>
        </div>
      </div>
    `;
    bindActiveTest(attemptId, items, current, answers, reviews, render, attempt);
  };
  render();

  const tick = () => {
    const deadline = toDate(attempt.deadline);
    if (!deadline) return;
    const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    const el = document.getElementById("testTimer");
    if (el) {
      const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
      const ss = String(remaining % 60).padStart(2, "0");
      el.textContent = `⏱ ${mm}:${ss}`;
      el.classList.toggle("danger", remaining < 120);
    }
    if (remaining <= 0) {
      clearInterval(S.activeTestTimer);
      S.activeTestTimer = null;
      submitTest(attemptId, items, answers, true);
    }
  };
  S.activeTestTimer = setInterval(tick, 1000);
  S.pageCleanup = () => {
    if (S.activeTestTimer) clearInterval(S.activeTestTimer);
    S.activeTestTimer = null;
  };

  const beforeUnload = e => { e.preventDefault(); e.returnValue = ""; };
  window.addEventListener("beforeunload", beforeUnload);
  const oldCleanup = S.pageCleanup;
  S.pageCleanup = () => { oldCleanup(); window.removeEventListener("beforeunload", beforeUnload); };
}

function bindActiveTest(attemptId, items, currentIndex, answers, reviews, render, attempt) {
  const item = items[currentIndex];
  $$("[data-test-option]").forEach(btn => btn.addEventListener("click", async () => {
    const key = btn.dataset.testOption;
    answers.set(item.id, key);
    try {
      await updateDoc(doc(db, "users", S.user.uid, "testAttempts", attemptId, "items", item.id), { selectedOption: key });
    } catch (err) { toast("Autosave failed. Check your connection.", "error"); }
    render();
  }));

  $("#testPrev")?.addEventListener("click", () => { if (currentIndex > 0) { window.__testCurrent = currentIndex - 1; render(); } });
  $("#testNext")?.addEventListener("click", () => { if (currentIndex < items.length - 1) { window.__testCurrent = currentIndex + 1; render(); } });
  $("#testClear")?.addEventListener("click", async () => {
    answers.set(item.id, null);
    try { await updateDoc(doc(db, "users", S.user.uid, "testAttempts", attemptId, "items", item.id), { selectedOption: null }); } catch {}
    render();
  });
  $("#testMark")?.addEventListener("click", async () => {
    const next = !reviews.get(item.id);
    reviews.set(item.id, next);
    try { await updateDoc(doc(db, "users", S.user.uid, "testAttempts", attemptId, "items", item.id), { markedForReview: next }); } catch {}
    render();
  });
  $$("[data-palette]").forEach(btn => btn.addEventListener("click", () => {
    window.__testCurrent = Number(btn.dataset.palette);
    render();
  }));
  $("#testSubmit")?.addEventListener("click", () => submitTest(attemptId, items, answers));
  $("#testSubmit2")?.addEventListener("click", () => submitTest(attemptId, items, answers));
}

// The active test re-renders through a small global override so palette navigation keeps state.
const originalRenderActiveTest = renderActiveTest;
window.__testCurrent = 0;

async function submitTest(attemptId, items, answers, auto = false) {
  if (!auto) {
    const unanswered = items.filter(i => !answers.get(i.id)).length;
    const ok = await confirmDialog(`Submit this test? ${unanswered} question${unanswered === 1 ? "" : "s"} unanswered.`, { confirmText: "Submit", danger: false });
    if (!ok) return;
  }
  try {
    const attemptRef = doc(db, "users", S.user.uid, "testAttempts", attemptId);
    const attemptSnap = await getDoc(attemptRef);
    if (!attemptSnap.exists()) return;
    const attempt = attemptSnap.data();
    if (attempt.status !== "active") { go(`/results/${attemptId}`); return; }

    let correct = 0, incorrect = 0, unanswered = 0;
    items.forEach(item => {
      const selected = answers.get(item.id);
      if (!selected) unanswered++;
      else if (selected === item.correctOptionId) correct++;
      else incorrect++;
    });
    const marksPer = Number(attempt.marksPerQuestion || 1);
    const negative = Number(attempt.negativeMarking || 0);
    const score = correct * marksPer - incorrect * negative;
    const totalMarks = items.length * marksPer;
    const percentage = totalMarks ? Math.max(0, Math.round((score / totalMarks) * 1000) / 10) : 0;
    const pass = percentage >= Number(attempt.passPercent || 50);

    await updateDoc(attemptRef, {
      status: "submitted",
      submittedAt: serverTimestamp(),
      autoSubmitted: auto,
      correct,
      incorrect,
      unanswered,
      score,
      totalMarks,
      percentage,
      passed: pass,
      timeTakenSec: Math.max(0, Math.floor((Date.now() - (toDate(attempt.startedAt)?.getTime() || Date.now())) / 1000))
    });
    await touchStudySession({ testsCompleted: 1 });
    toast(auto ? "Time expired. Test submitted automatically." : "Test submitted.", "success");
    go(`/results/${attemptId}`);
  } catch (err) {
    toast(friendlyError(err, "submitting test"), "error");
  }
}

async function renderResults(attemptId, token) {
  if (!attemptId) return setPageHtml(errorState("Result not found", "No attempt was specified."));
  setPageHtml(spinnerBlock("Loading result…"));
  let attempt = null;
  try {
    const snap = await getDoc(doc(db, "users", S.user.uid, "testAttempts", attemptId));
    if (snap.exists()) attempt = { id: snap.id, ...snap.data() };
  } catch (err) {
    setPageHtml(errorState("Could not load result", friendlyError(err, "loading result")));
    return;
  }
  if (isStale(token)) return;
  if (!attempt) return setPageHtml(emptyState("Result not found", "This attempt does not exist."));
  if (attempt.status === "active") { go(`/test/active/${attemptId}`); return; }

  const itemsSnap = await safeGetDocs(query(collection(db, "users", S.user.uid, "testAttempts", attemptId, "items"), orderBy("order", "asc"), limit(200)), "items");
  if (isStale(token)) return;
  const items = itemsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];

  const total = items.length;
  const correct = items.filter(i => i.selectedOption && i.selectedOption === i.correctOptionId).length;
  const incorrect = items.filter(i => i.selectedOption && i.selectedOption !== i.correctOptionId).length;
  const unanswered = items.filter(i => !i.selectedOption).length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  const byLevel = {};
  const byTopic = {};
  items.forEach(i => {
    const l = i.level || "L1";
    byLevel[l] = byLevel[l] || { total: 0, correct: 0 };
    byLevel[l].total++;
    if (i.selectedOption === i.correctOptionId) byLevel[l].correct++;
    const t = i.topicId || "unknown";
    byTopic[t] = byTopic[t] || { total: 0, correct: 0, title: i.topicTitle || t };
    byTopic[t].total++;
    if (i.selectedOption === i.correctOptionId) byTopic[t].correct++;
  });

  const weakTopics = Object.entries(byTopic).filter(([, v]) => v.correct / v.total < 0.6).sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total)).slice(0, 3);

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/tests">Tests</a> / <span>Result</span></div>
    <div class="result-hero mb-16">
      <div class="result-score">${attempt.percentage ?? 0}%</div>
      <div class="result-status">${attempt.passed ? "Passed" : "Not passed yet"}</div>
      <p class="small" style="opacity:.85">${escapeHtml(attempt.title || "Test")} · ${attempt.score ?? 0} / ${attempt.totalMarks ?? 0} marks</p>
    </div>
    <div class="grid grid-4 mb-16">
      <div class="stat-card"><div class="stat-value">${correct}</div><div class="stat-label">Correct</div></div>
      <div class="stat-card"><div class="stat-value">${incorrect}</div><div class="stat-label">Incorrect</div></div>
      <div class="stat-card"><div class="stat-value">${unanswered}</div><div class="stat-label">Unanswered</div></div>
      <div class="stat-card"><div class="stat-value">${accuracy}%</div><div class="stat-label">Accuracy</div></div>
    </div>
    <div class="card mb-16">
      <h2 class="card-title">Breakdown</h2>
      <div class="breakdown-bar mb-8"><span style="width:${total ? (correct / total) * 100 : 0}%;background:var(--green)"></span><span style="width:${total ? (incorrect / total) * 100 : 0}%;background:var(--red)"></span><span style="width:${total ? (unanswered / total) * 100 : 0}%;background:var(--border)"></span></div>
      <div class="table-wrap"><table><thead><tr><th>Level</th><th>Correct</th><th>Total</th><th>Accuracy</th></tr></thead><tbody>${Object.entries(byLevel).map(([l, v]) => `<tr><td>${levelLabel(l)}</td><td>${v.correct}</td><td>${v.total}</td><td>${Math.round((v.correct / v.total) * 100)}%</td></tr>`).join("")}</tbody></table></div>
    </div>
    ${weakTopics.length ? `<div class="card mb-16"><h2 class="card-title">Weak areas</h2>${weakTopics.map(([id, v]) => `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(v.title)}</p><div class="list-item-meta"><span>${v.correct}/${v.total} correct</span></div></div><a class="btn btn-small" href="#/practice?topic=${encodeURIComponent(id)}">Practise</a></div>`).join("")}</div>` : ""}
    <div class="card mb-16">
      <h2 class="card-title">Recommended next steps</h2>
      <div class="row">
        <button class="btn btn-primary" type="button" id="retryWrongBtn">Retry wrong questions</button>
        <button class="btn" type="button" id="addWrongRevisionBtn">Add wrong answers to revision</button>
        <button class="btn" type="button" id="retakeBtn">Retake this test</button>
        <button class="btn" type="button" onclick="window.print()">Print / PDF</button>
      </div>
    </div>
    <div class="card">
      <h2 class="card-title">Question review</h2>
      ${items.map((i, idx) => {
        const sel = i.selectedOption;
        const isCorrect = sel && sel === i.correctOptionId;
        const isWrong = sel && sel !== i.correctOptionId;
        return `<div class="card mb-8" style="box-shadow:none">
          <div class="row-between"><strong>Q${idx + 1}. ${escapeHtml(i.questionText || "")}</strong><span class="badge ${isCorrect ? "green" : isWrong ? "red" : ""}">${isCorrect ? "Correct" : isWrong ? "Incorrect" : "Unanswered"}</span></div>
          <div class="option-list mt-8">${(i.options || []).map((o, oi) => {
            const key = o.id || String.fromCharCode(97 + oi);
            const cls = key === i.correctOptionId ? "correct" : (sel === key && key !== i.correctOptionId ? "wrong" : "");
            return `<div class="option-btn ${cls}" style="cursor:default"><span class="option-key">${String.fromCharCode(65 + oi)}</span><span>${escapeHtml(o.text || "")}</span></div>`;
          }).join("")}</div>
          ${i.explanation ? `<div class="explanation-box"><h4>Explanation</h4><p>${sanitizeHtml(i.explanation)}</p>${i.memoryTrick ? `<p class="small"><strong>Trick:</strong> ${escapeHtml(i.memoryTrick)}</p>` : ""}</div>` : ""}
        </div>`;
      }).join("")}
    </div>
    <p class="tiny muted mt-16">Frontend-only grading is not tamper-proof. For high-stakes examinations use trusted server-side grading.</p>
  `);

  $("#retryWrongBtn")?.addEventListener("click", () => {
    const ids = items.filter(i => i.selectedOption && i.selectedOption !== i.correctOptionId).map(i => i.questionId).filter(Boolean).slice(0, 50);
    if (!ids.length) return toast("There are no wrong questions to retry.", "info");
    go(`/practice?ids=${encodeURIComponent(ids.join(","))}`);
  });

  $("#addWrongRevisionBtn")?.addEventListener("click", async () => {
    const wrong = items.filter(i => i.selectedOption && i.selectedOption !== i.correctOptionId);
    if (!wrong.length) return toast("There are no wrong questions to add.", "info");
    try {
      for (const i of wrong.slice(0, 50)) {
        await addRevision({ itemId: i.questionId, type: "question", title: i.questionText || "Question", topicId: i.topicId || "", subjectId: i.subjectId || "", level: i.level || "L1", importance: i.importance || "normal" });
      }
      toast(`${Math.min(wrong.length, 50)} wrong question(s) added to revision.`, "success");
    } catch (err) { toast(friendlyError(err, "adding wrong answers to revision"), "error"); }
  });

  $("#retakeBtn")?.addEventListener("click", () => startTest(attempt.testId));
}

/* ============================================================
   14. PROGRESS, SAVED, PROFILE, PLANNER, CURRENT AFFAIRS, SETTINGS
   ============================================================ */

function svgBarChart(data, { height = 180 } = {}) {
  if (!data.length) return `<p class="muted small">No chart data yet.</p>`;
  const max = Math.max(1, ...data.map(d => d.value));
  const barW = 100 / data.length;
  return `<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 420 ${height}" role="img" aria-label="Bar chart">
    <line x1="0" y1="${height - 26}" x2="420" y2="${height - 26}" stroke="var(--border)" stroke-width="1"/>
    ${data.map((d, i) => {
      const h = Math.round((d.value / max) * (height - 56));
      return `<rect x="${i * barW * 4 + 8}" y="${height - 26 - h}" width="${Math.max(10, barW * 2.2)}" height="${h}" rx="5" fill="url(#barGrad)"></rect>
        <text x="${i * barW * 4 + 8 + barW * 1.1}" y="${height - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${escapeHtml(d.label)}</text>`;
    }).join("")}
    <defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient></defs>
  </svg></div>`;
}

function svgDonut(percent, label = "") {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = 42, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 120 120" width="130" height="130" role="img" aria-label="${escapeHtml(label)} ${p}%">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="url(#donutGrad)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c - (p / 100) * c}" transform="rotate(-90 60 60)"/>
    <text x="60" y="64" text-anchor="middle" font-size="18" font-weight="700" fill="var(--text)">${p}%</text>
    <defs><linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4f46e5"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs>
  </svg>`;
}

async function renderProgressPage(token) {
  setPageHtml(spinnerBlock("Calculating progress…"));
  const uid = S.user.uid;
  const [readSnap, qpSnap, attemptsSnap, sessionsSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "users", uid, "materialProgress"), where("status", "==", "read"), limit(500))),
    safeGetDocs(query(collection(db, "users", uid, "questionProgress"), limit(500))),
    safeGetDocs(query(collection(db, "users", uid, "testAttempts"), where("status", "==", "submitted"), orderBy("submittedAt", "desc"), limit(10))),
    safeGetDocs(query(collection(db, "users", uid, "studySessions"), orderBy("dateKey", "desc"), limit(14)))
  ]);
  if (isStale(token)) return;

  const read = readSnap?.size || 0;
  const qp = qpSnap?.docs.map(d => d.data()) || [];
  const attempted = qp.filter(q => (q.attempts || 0) > 0).length;
  const correct = qp.reduce((a, q) => a + (q.correct || 0), 0);
  const mastered = qp.filter(q => q.mastery === true).length;
  const attempts = attemptsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const avg = attempts.length ? Math.round(attempts.reduce((a, t) => a + (t.percentage || 0), 0) / attempts.length) : null;

  const sessions = sessionsSnap?.docs.map(d => d.data()).reverse() || [];
  const chartData = sessions.map(s => ({ label: String(s.dateKey || "").slice(5), value: (s.materialsRead || 0) + (s.questionsAttempted || 0) + (s.reviewsCompleted || 0) }));

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Progress</h1><p class="page-sub">Viewed, read, attempted, correct, performance and mastery are separate measures.</p></div><a class="btn" href="#/revision?filter=due">Revise due</a></div>
    <div class="grid grid-4 mb-16">
      <div class="stat-card"><div class="stat-value">${read}</div><div class="stat-label">Materials read</div></div>
      <div class="stat-card"><div class="stat-value">${attempted}</div><div class="stat-label">Questions attempted</div></div>
      <div class="stat-card"><div class="stat-value">${correct}</div><div class="stat-label">Correct recall events</div></div>
      <div class="stat-card"><div class="stat-value">${mastered}</div><div class="stat-label">Mastered questions</div></div>
    </div>
    <div class="grid grid-2 mb-16">
      <div class="card"><h2 class="card-title">Question mastery</h2><div class="center">${svgDonut(attempted ? Math.round((mastered / attempted) * 100) : 0, "Mastery")}</div><p class="small muted center">Mastery requires repeated correct recall on separate Nepal calendar days.</p></div>
      <div class="card"><h2 class="card-title">Recent activity</h2>${chartData.length ? svgBarChart(chartData) : `<p class="muted small">No study sessions recorded yet.</p>`}</div>
    </div>
    <div class="card mb-16">
      <h2 class="card-title">Test performance</h2>
      ${attempts.length ? `<div class="table-wrap"><table><thead><tr><th>Test</th><th>Score</th><th>Percentage</th><th>Date</th><th></th></tr></thead><tbody>${attempts.map(a => `<tr><td>${escapeHtml(a.title || "Test")}</td><td>${a.score ?? 0}/${a.totalMarks ?? 0}</td><td>${a.percentage ?? 0}%</td><td>${formatDate(a.submittedAt)}</td><td><a class="btn btn-small" href="#/results/${encodeURIComponent(a.id)}">Open</a></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">No submitted tests yet.</p>`}
      <p class="tiny muted mt-8">Average: ${avg === null ? "Not assessed" : `${avg}%`}. Frontend grading is not tamper-proof.</p>
    </div>
    <div class="card">
      <h2 class="card-title">Mastery rule used by Sajilo GK</h2>
      <p class="small">A question is mastered after three consecutive correct recall events on separate Nepal calendar days, or two correct events on separate days followed by a later qualifying Good/Easy revision rating. A wrong recall resets consecutive mastery credit.</p>
    </div>
  `);
}

async function renderSavedPage(params, token) {
  setPageHtml(spinnerBlock("Loading saved items…"));
  const tab = params.get("tab") || "materials";
  const [savedSnap, notesSnap, revisionSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "users", S.user.uid, "savedItems"), orderBy("createdAt", "desc"), limit(100))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "personalNotes"), orderBy("updatedAt", "desc"), limit(100))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "revisionSchedule"), orderBy("nextReview", "asc"), limit(100)))
  ]);
  if (isStale(token)) return;

  const saved = savedSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const notes = notesSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const revision = revisionSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];

  const materials = saved.filter(s => s.type === "material");
  const questions = saved.filter(s => s.type === "question");
  const important = saved.filter(s => s.type === "important");
  const list = tab === "materials" ? materials : tab === "questions" ? questions : tab === "notes" ? notes : tab === "important" ? important : revision;

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Saved</h1><p class="page-sub">Bookmarks, personal notes, personally important items and revision queue.</p></div></div>
    <div class="tabs">
      <a class="tab ${tab === "materials" ? "active" : ""}" href="#/saved?tab=materials">Materials (${materials.length})</a>
      <a class="tab ${tab === "questions" ? "active" : ""}" href="#/saved?tab=questions">Questions (${questions.length})</a>
      <a class="tab ${tab === "notes" ? "active" : ""}" href="#/saved?tab=notes">Notes (${notes.length})</a>
      <a class="tab ${tab === "important" ? "active" : ""}" href="#/saved?tab=important">Important (${important.length})</a>
      <a class="tab ${tab === "revision" ? "active" : ""}" href="#/saved?tab=revision">Revision (${revision.length})</a>
    </div>
    ${list.length
      ? `<div class="stack">${list.map(item => `<div class="card"><div class="row-between"><div><strong>${escapeHtml(item.title || "Saved item")}</strong><div class="list-item-meta"><span>${escapeHtml(item.type || "note")}</span><span>${item.nextReview ? `Next: ${formatDate(item.nextReview)}` : ""}</span></div></div><div class="row">${item.href ? `<a class="btn btn-small" href="${escapeHtml(item.href)}">Open</a>` : ""}${item.type === "question" ? `<a class="btn btn-small" href="#/practice?ids=${encodeURIComponent(item.itemId || item.id)}">Practise</a>` : item.type === "material" ? `<a class="btn btn-small" href="#/material/${encodeURIComponent(item.itemId || item.id)}">Read</a>` : ""}</div></div></div>`).join("")}</div>`
      : emptyState("Nothing saved here", "Bookmark materials or questions, create personal notes, or add items to revision.", `<a class="btn btn-primary" href="#/subjects">Browse subjects</a>`)}
  `);
}

async function renderProfilePage(token) {
  const user = S.user;
  const name = S.profile?.displayName || user.displayName || user.email?.split("@")[0] || "Student";
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Profile</h1><p class="page-sub">Your Firebase identity is shown immediately. Firestore details load in the background.</p></div><button class="btn btn-danger" id="profileLogoutBtn" type="button">Logout</button></div>
    <div class="card mb-16">
      <div class="row">
        <span class="avatar" style="width:64px;height:64px;font-size:1.4rem">${escapeHtml(name.charAt(0).toUpperCase())}</span>
        <div><h2 class="mb-0">${escapeHtml(name)}</h2><p class="small muted mb-0">${escapeHtml(user.email || "")}</p><span class="badge ${user.emailVerified ? "green" : "amber"}">${user.emailVerified ? "Email verified" : "Email not verified"}</span>${S.isOwner ? `<span class="badge">Primary owner</span>` : ""}</div>
      </div>
    </div>
    <div class="card mb-16">
      <h2 class="card-title">Account</h2>
      <div class="form-grid">
        <div><label for="profileName">Display name</label><input id="profileName" value="${escapeHtml(S.profile?.displayName || name)}" maxlength="80"></div>
        <div><label for="profileGoal">Daily goal (activities)</label><input id="profileGoal" type="number" min="5" max="200" value="${escapeHtml(S.profile?.dailyGoal || 20)}"></div>
        <div><label for="profileExamDates">Exam dates (optional JSON map: examId → YYYY-MM-DD)</label><textarea id="profileExamDates" placeholder='{"examId":"2026-06-01"}'>${escapeHtml(JSON.stringify(S.profile?.examDates || {}, null, 2))}</textarea></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" id="saveProfileBtn" type="button">Save profile</button></div>
    </div>
    <div class="card mb-16">
      <h2 class="card-title">Examinations and subjects</h2>
      <p class="small muted">Selected exams: ${escapeHtml((S.profile?.examIds || []).join(", ") || "None")}</p>
      <a class="btn" href="#/onboarding">Change selections</a>
    </div>
    <div class="card">
      <h2 class="card-title">Email verification</h2>
      ${user.emailVerified ? `<p class="small">Your email is verified.</p>` : `<p class="small">Verify your email to unlock learning content and admin writes.</p><div class="row"><button class="btn btn-primary" id="profileResendBtn" type="button">Resend verification</button><button class="btn" id="profileRefreshBtn" type="button">I have verified</button></div>`}
    </div>
  `);

  $("#profileLogoutBtn")?.addEventListener("click", doLogout);
  $("#profileResendBtn")?.addEventListener("click", resendVerification);
  $("#profileRefreshBtn")?.addEventListener("click", refreshVerification);

  $("#saveProfileBtn")?.addEventListener("click", async () => {
    const displayName = $("#profileName").value.trim();
    const dailyGoal = Number($("#profileGoal").value || 20);
    let examDates = {};
    try { examDates = JSON.parse($("#profileExamDates").value || "{}"); } catch { return toast("Exam dates must be valid JSON.", "error"); }
    try {
      await updateProfile(user, { displayName });
      await updateDoc(doc(db, "users", user.uid), { displayName, dailyGoal, examDates, updatedAt: serverTimestamp() });
      S.profile = { ...(S.profile || {}), displayName, dailyGoal, examDates };
      renderProfileChrome();
      toast("Profile saved.", "success");
    } catch (err) { toast(friendlyError(err, "saving profile"), "error"); }
  });
}

async function renderSettingsPage(token) {
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Settings</h1><p class="page-sub">Appearance and account controls.</p></div></div>
    <div class="card mb-16"><h2 class="card-title">Appearance</h2><div class="row"><button class="btn" id="settingsThemeBtn" type="button">Toggle dark mode</button><button class="btn" id="settingsLogoutBtn" type="button">Logout</button></div></div>
    <div class="card"><h2 class="card-title">About Sajilo GK</h2><p class="small muted">Sajilo GK stores content and progress in Cloud Firestore. Offline reading relies on IndexedDB and Firestore caching; changes made offline may not save until you reconnect. A service worker is not implemented, so full offline app installation is not claimed.</p></div>
  `);
  $("#settingsThemeBtn")?.addEventListener("click", () => els.themeToggle?.click());
  $("#settingsLogoutBtn")?.addEventListener("click", doLogout);
}

async function renderPlannerPage(token) {
  setPageHtml(spinnerBlock("Loading planner…"));
  let plans = [];
  try {
    const snap = await getDocs(query(collection(db, "users", S.user.uid, "plans"), orderBy("date", "asc"), limit(100)));
    plans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  if (isStale(token)) return;

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Study Planner</h1><p class="page-sub">Simple daily targets stored in Firestore.</p></div><button class="btn btn-primary" id="addPlanBtn" type="button">Add plan</button></div>
    <div id="planList">${plans.length ? plans.map(p => `<div class="card mb-8"><div class="row-between"><div><strong>${escapeHtml(p.title || "Study plan")}</strong><p class="small muted mb-0">${escapeHtml(p.date || "")} · ${escapeHtml(p.notes || "")}</p></div><span class="badge ${p.done ? "green" : ""}">${p.done ? "Done" : "Planned"}</span><div class="row"><button class="btn btn-small" data-toggle-plan="${escapeHtml(p.id)}" data-done="${p.done ? "false" : "true"}">${p.done ? "Undo" : "Done"}</button><button class="btn btn-small btn-danger" data-delete-plan="${escapeHtml(p.id)}">Delete</button></div></div></div>`).join("") : emptyState("No plans yet", "Add a small daily target and keep it realistic.", `<button class="btn btn-primary" id="emptyAddPlanBtn" type="button">Add plan</button>`)}</div>
  `);

  const openAdd = () => {
    openModal(`<div class="modal-head"><h2>Add study plan</h2><button class="modal-close" data-modal-close>✕</button></div>
      <div class="form-grid"><div><label>Title</label><input id="planTitle" placeholder="Revise L1 constitution notes"></div><div><label>Date</label><input id="planDate" type="date" value="${nepalDateKey()}"></div><div><label>Notes</label><textarea id="planNotes"></textarea></div></div>
      <div class="form-actions"><button class="btn" data-modal-close type="button">Cancel</button><button class="btn btn-primary" id="savePlanBtn" type="button">Save</button></div>`);
    $("#savePlanBtn").onclick = async () => {
      const title = $("#planTitle").value.trim();
      if (!title) return toast("Enter a title.", "error");
      try {
        await addDoc(collection(db, "users", S.user.uid, "plans"), { title, date: $("#planDate").value, notes: $("#planNotes").value.trim(), done: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        closeModal();
        router();
      } catch (err) { toast(friendlyError(err, "saving plan"), "error"); }
    };
  };
  $("#addPlanBtn")?.addEventListener("click", openAdd);
  $("#emptyAddPlanBtn")?.addEventListener("click", openAdd);

  $$("[data-toggle-plan]").forEach(btn => btn.addEventListener("click", async () => {
    try { await updateDoc(doc(db, "users", S.user.uid, "plans", btn.dataset.togglePlan), { done: btn.dataset.done === "true", updatedAt: serverTimestamp() }); router(); }
    catch (err) { toast(friendlyError(err, "updating plan"), "error"); }
  }));
  $$("[data-delete-plan]").forEach(btn => btn.addEventListener("click", async () => {
    if (!(await confirmDialog("Delete this plan?", { danger: true, confirmText: "Delete" }))) return;
    try { await deleteDoc(doc(db, "users", S.user.uid, "plans", btn.dataset.deletePlan)); router(); }
    catch (err) { toast(friendlyError(err, "deleting plan"), "error"); }
  }));
}

async function renderCurrentAffairsPage(token) {
  setPageHtml(spinnerBlock("Loading current affairs…"));
  let items = [];
  try {
    const snap = await getDocs(query(collection(db, "currentAffairs"), where("status", "==", "published"), orderBy("date", "desc"), limit(50)));
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  if (isStale(token)) return;
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Current Affairs</h1><p class="page-sub">Published by administrators.</p></div></div>
    ${items.length ? `<div class="stack">${items.map(i => `<div class="card"><div class="row-between"><h2 class="card-title mb-0">${escapeHtml(i.title || "Update")}</h2><span class="badge">${formatDate(i.date)}</span></div><div class="reader-content" style="font-size:1rem">${sanitizeHtml(i.body || "")}</div>${i.link ? `<a class="btn btn-small" href="${escapeHtml(safeUrl(i.link))}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}</div>`).join("")}</div>` : emptyState("No current affairs yet", "Administrators can publish current affairs from the admin panel.", `<a class="btn" href="#/home">Home</a>`)}
  `);
}

/* ============================================================
   PERSONAL NOTES, REPORT DIALOG, SETUP PAGE
   ============================================================ */

async function openPersonalNote(type, itemId, title) {
  const id = `${type}_${itemId}`;
  let note = "";
  try {
    const snap = await getDoc(doc(db, "users", S.user.uid, "personalNotes", id));
    if (snap.exists()) note = snap.data().text || "";
  } catch {}
  openModal(`<div class="modal-head"><h2>Personal note</h2><button class="modal-close" data-modal-close>✕</button></div>
    <p class="small muted">${escapeHtml(title)}</p><textarea id="noteText" style="width:100%;min-height:180px;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--surface-2)">${escapeHtml(note)}</textarea>
    <div class="form-actions"><button class="btn" data-modal-close type="button">Cancel</button><button class="btn btn-primary" id="saveNoteBtn" type="button">Save note</button></div>`);
  $("#saveNoteBtn").onclick = async () => {
    try {
      await setDoc(doc(db, "users", S.user.uid, "personalNotes", id), { noteId: id, type, itemId, title, text: $("#noteText").value.trim(), updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
      toast("Note saved.", "success");
      closeModal();
    } catch (err) { toast(friendlyError(err, "saving note"), "error"); }
  };
}

async function openReportDialog(type, itemId, title) {
  openModal(`<div class="modal-head"><h2>Report an error</h2><button class="modal-close" data-modal-close>✕</button></div>
    <p class="small muted">${escapeHtml(title)}</p><textarea id="reportText" placeholder="Describe the problem clearly" style="width:100%;min-height:130px;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--surface-2)"></textarea>
    <div class="form-actions"><button class="btn" data-modal-close type="button">Cancel</button><button class="btn btn-primary" id="sendReportBtn" type="button">Submit report</button></div>`);
  $("#sendReportBtn").onclick = async () => {
    const text = $("#reportText").value.trim();
    if (!text) return toast("Describe the error first.", "error");
    try {
      await addDoc(collection(db, "questionReports"), { reporterId: S.user.uid, reporterEmail: S.user.email || "", type, itemId, title, message: text, status: "pending", createdAt: serverTimestamp() });
      toast("Report submitted. An administrator will review it.", "success");
      closeModal();
    } catch (err) { toast(friendlyError(err, "submitting report"), "error"); }
  };
}

function renderSetupPage() {
  return `<div class="card" style="max-width:760px;margin:0 auto">
    <h1 class="page-title">Setup and recovery</h1>
    <p class="muted">Use this page if content does not load or the owner cannot reach Admin.</p>
    <div class="stack mt-16">
      <div class="card" style="box-shadow:none"><strong>1. Verify the owner email</strong><p class="small muted">Sign in as ${escapeHtml(OWNER_EMAIL)} and verify the email. Unverified owners see the Admin button but Firestore Rules reject privileged writes.</p><button class="btn btn-small" id="setupVerifyBtn" type="button">Resend verification</button></div>
      <div class="card" style="box-shadow:none"><strong>2. Check Firestore Rules</strong><p class="small muted">Publish the supplied firestore.rules in Firebase Console. Default deny is intentional.</p></div>
      <div class="card" style="box-shadow:none"><strong>3. Check indexes</strong><p class="small muted">Queries with combined equality filters and orderBy need composite indexes. The documented indexes are listed in the setup instructions.</p></div>
      <div class="card" style="box-shadow:none"><strong>4. Sign out and back in</strong><p class="small muted">This refreshes the ID token after verification.</p><button class="btn btn-small" id="setupLogoutBtn" type="button">Logout</button></div>
    </div>
  </div>`;
}

function bindSetupPage() {
  $("#setupVerifyBtn")?.addEventListener("click", resendVerification);
  $("#setupLogoutBtn")?.addEventListener("click", doLogout);
}

/* ============================================================
   15. ADMINISTRATION
   ============================================================ */

const ADMIN_SCHEMAS = {
  exams: {
    collection: "exams", label: "Examinations",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "code", label: "Code", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "order", label: "Order", type: "number", default: 0 },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "archived"], default: "draft" }
    ]
  },
  subjects: {
    collection: "subjects", label: "Shared Subjects",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "code", label: "Code", type: "text" },
      { key: "examIds", label: "Examinations", type: "multiselect", source: "exams" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "order", label: "Order", type: "number", default: 0 },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "archived"], default: "draft" }
    ]
  },
  chapters: {
    collection: "chapters", label: "Chapters",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "subjectId", label: "Subject", type: "reference", source: "subjects", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "order", label: "Order", type: "number", default: 0 },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "archived"], default: "draft" }
    ]
  },
  topics: {
    collection: "topics", label: "Topics",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "chapterId", label: "Chapter", type: "reference", source: "chapters", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "order", label: "Order", type: "number", default: 0 },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "archived"], default: "draft" }
    ]
  },
  materials: {
    collection: "materials", label: "Study Materials",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "topicId", label: "Topic", type: "reference", source: "topics", required: true },
      { key: "level", label: "Level", type: "select", options: ["L1", "L2", "L3"], required: true, default: "L1" },
      { key: "importance", label: "Importance", type: "select", options: ["normal", "important", "veryImportant"], default: "normal" },
      { key: "summary", label: "Summary", type: "textarea" },
      { key: "blocks", label: "Content blocks", type: "blocks" },
      { key: "source", label: "Source", type: "text" },
      { key: "verified", label: "Verified", type: "checkbox" },
      { key: "order", label: "Order", type: "number", default: 0 },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "archived"], default: "draft" }
    ]
  },
  questions: {
    collection: "questions", label: "Questions",
    fields: [
      { key: "questionText", label: "Question", type: "textarea", required: true },
      { key: "topicId", label: "Topic", type: "reference", source: "topics", required: true },
      { key: "level", label: "Level", type: "select", options: ["L1", "L2", "L3"], required: true, default: "L1" },
      { key: "importance", label: "Importance", type: "select", options: ["normal", "important", "veryImportant"], default: "normal" },
      { key: "options", label: "Answer options", type: "options" },
      { key: "explanation", label: "Explanation", type: "textarea" },
      { key: "memoryTrick", label: "Memory trick", type: "text" },
      { key: "source", label: "Source", type: "text" },
      { key: "verified", label: "Verified", type: "checkbox" },
      { key: "tags", label: "Tags (comma separated)", type: "tags" },
      { key: "order", label: "Order", type: "number", default: 0 },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "archived"], default: "draft" }
    ]
  },
  testSets: {
    collection: "testSets", label: "Tests",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "scopeType", label: "Scope", type: "select", options: ["topic", "chapter", "subject"], default: "subject" },
      { key: "scopeId", label: "Scope ID", type: "text", required: true },
      { key: "level", label: "Level filter", type: "select", options: ["", "L1", "L2", "L3"] },
      { key: "importanceOnly", label: "Important only", type: "checkbox" },
      { key: "questionCount", label: "Question count", type: "number", default: 10 },
      { key: "durationMin", label: "Duration (minutes)", type: "number", default: 20 },
      { key: "marksPerQuestion", label: "Marks per question", type: "number", default: 1 },
      { key: "negativeMarking", label: "Negative marking", type: "number", default: 0 },
      { key: "passPercent", label: "Pass percentage", type: "number", default: 50 },
      { key: "order", label: "Order", type: "number", default: 0 },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "archived"], default: "draft" }
    ]
  },
  announcements: {
    collection: "announcements", label: "Announcements",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "body", label: "Body", type: "textarea" },
      { key: "publishAt", label: "Publish at", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "archived"], default: "draft" }
    ]
  },
  currentAffairs: {
    collection: "currentAffairs", label: "Current Affairs",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "body", label: "Body (safe HTML)", type: "textarea" },
      { key: "date", label: "Date", type: "date" },
      { key: "link", label: "Source link", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "archived"], default: "draft" }
    ]
  }
};

const ADMIN_SECTIONS = [
  { id: "exams", label: "Examinations", icon: "🏛️" },
  { id: "subjects", label: "Shared Subjects", icon: "📚" },
  { id: "chapters", label: "Chapters", icon: "📑" },
  { id: "topics", label: "Topics", icon: "🧩" },
  { id: "materials", label: "Study Materials", icon: "📖" },
  { id: "questions", label: "Questions", icon: "❓" },
  { id: "testSets", label: "Tests", icon: "📝" },
  { id: "announcements", label: "Announcements", icon: "📣" },
  { id: "currentAffairs", label: "Current Affairs", icon: "📰" },
  { id: "reports", label: "Reports", icon: "🚩" },
  { id: "students", label: "Students", icon: "👥" },
  { id: "settings", label: "Site Settings", icon: "⚙️" },
  { id: "import", label: "Import / Export", icon: "📦" },
  { id: "audit", label: "Audit Logs", icon: "📋" }
];

async function renderAdminPage(section, token) {
  if (!S.isAdmin && !S.isOwner) {
    setPageHtml(emptyState("Admin access only", "This area is restricted to the verified primary owner and delegated staff.", `<a class="btn" href="#/home">Home</a>`));
    return;
  }
  if (!S.user.emailVerified) {
    setPageHtml(`<div class="card"><h2>Verification required</h2><p>Admin tools are visible, but privileged writes require a verified email. Verify your email first.</p><button class="btn btn-primary" id="adminVerifyBtn" type="button">Resend verification</button></div>`);
    $("#adminVerifyBtn")?.addEventListener("click", resendVerification);
    return;
  }

  if (!section) {
    setPageHtml(`
      <div class="page-head"><div><h1 class="page-title">Administration</h1><p class="page-sub">Manage content, tests, students, reports and settings.</p></div><a class="btn" href="#/home">Back to app</a></div>
      <div class="admin-grid">${ADMIN_SECTIONS.map(s => `<a class="admin-card" href="#/admin/${s.id}"><strong>${s.icon} ${escapeHtml(s.label)}</strong><span>Open ${escapeHtml(s.label.toLowerCase())}</span></a>`).join("")}</div>
    `);
    return;
  }

  if (section === "reports") return renderAdminReports(token);
  if (section === "students") return renderAdminStudents(token);
  if (section === "settings") return renderAdminSettings(token);
  if (section === "import") return renderAdminImportExport(token);
  if (section === "audit") return renderAdminAudit(token);

  const schema = ADMIN_SCHEMAS[section];
  if (!schema) return setPageHtml(errorState("Unknown admin section", "This section does not exist."));

  setPageHtml(spinnerBlock("Loading records…"));
  let docs = [];
  try {
    const snap = await getDocs(query(collection(db, schema.collection), orderBy("updatedAt", "desc"), limit(PAGE_SIZE)));
    docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn(err);
    try {
      const snap = await getDocs(query(collection(db, schema.collection), limit(PAGE_SIZE)));
      docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err2) {
      setPageHtml(errorState("Could not load records", friendlyError(err2, "loading admin records")));
      return;
    }
  }
  if (isStale(token)) return;

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(schema.label)}</h1><p class="page-sub">Create, edit, preview, publish, draft and archive records.</p></div><div class="row"><a class="btn" href="#/admin">Admin home</a><button class="btn btn-primary" id="adminCreateBtn" type="button">New ${escapeHtml(schema.label.replace(/s$/, ""))}</button></div></div>
    ${docs.length ? `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${docs.map(d => `<tr><td>${escapeHtml(d.title || d.questionText || d.id)}</td><td>${statusBadge(d.status)}</td><td>${timeAgo(d.updatedAt)}</td><td><div class="admin-row-actions"><button class="btn btn-small" data-admin-edit="${escapeHtml(d.id)}">Edit</button><button class="btn btn-small" data-admin-preview="${escapeHtml(d.id)}">Preview</button><button class="btn btn-small btn-danger" data-admin-archive="${escapeHtml(d.id)}">Archive</button></div></td></tr>`).join("")}</tbody></table></div>` : emptyState("No records yet", `Create the first ${schema.label.toLowerCase()} record.`)}
  `);

  $("#adminCreateBtn")?.addEventListener("click", () => openAdminForm(section, null));
  $$("[data-admin-edit]").forEach(b => b.addEventListener("click", () => openAdminForm(section, b.dataset.adminEdit)));
  $$("[data-admin-preview]").forEach(b => b.addEventListener("click", () => previewAdminDoc(section, b.dataset.adminPreview)));
  $$("[data-admin-archive]").forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmDialog("Archive this record? It will stop appearing to students but can be restored by editing the status.", { danger: true, confirmText: "Archive" }))) return;
    try {
      await updateDoc(doc(db, schema.collection, b.dataset.adminArchive), { status: "archived", updatedAt: serverTimestamp() });
      await writeAudit("archive", schema.collection, b.dataset.adminArchive, { section });
      toast("Archived.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "archiving"), "error"); }
  }));
}

async function loadReferenceOptions(source) {
  const map = { exams: "exams", subjects: "subjects", chapters: "chapters", topics: "topics" };
  const col = map[source];
  if (!col) return [];
  try {
    const snap = await getDocs(query(collection(db, col), limit(500)));
    return snap.docs.map(d => ({ id: d.id, label: d.data().title || d.data().code || d.id }));
  } catch { return []; }
}

async function openAdminForm(section, id) {
  const schema = ADMIN_SCHEMAS[section];
  if (!schema) return;
  let existing = {};
  if (id) {
    try {
      const snap = await getDoc(doc(db, schema.collection, id));
      if (snap.exists()) existing = snap.data();
    } catch (err) { return toast(friendlyError(err, "loading record"), "error"); }
  }

  S.adminFormState = {
    section,
    id,
    blocks: Array.isArray(existing.blocks) ? JSON.parse(JSON.stringify(existing.blocks)) : [],
    options: Array.isArray(existing.options) ? JSON.parse(JSON.stringify(existing.options)) : [{ id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }, { id: "d", text: "" }],
    correctOptionId: existing.correctOptionId || "a"
  };

  const fieldsHtml = [];
  for (const f of schema.fields) {
    fieldsHtml.push(await renderAdminField(f, existing));
  }

  openModal(`
    <div class="modal-head"><h2>${id ? "Edit" : "New"} ${escapeHtml(schema.label.replace(/s$/, ""))}</h2><button class="modal-close" data-modal-close>✕</button></div>
    <div class="form-grid" id="adminForm">${fieldsHtml.join("")}</div>
    <div class="form-actions"><button class="btn" data-modal-close type="button">Cancel</button><button class="btn btn-primary" id="adminSaveBtn" type="button">Save</button></div>
  `, { wide: true });

  bindAdminDynamicFields();

  $("#adminSaveBtn").onclick = async () => {
    const data = collectAdminForm(schema);
    if (data === null) return;
    try {
      const payload = { ...data, updatedAt: serverTimestamp() };
      if (!id) payload.createdAt = serverTimestamp();
      if (payload.status === "published" && !id) payload.publishedAt = serverTimestamp();
      if (payload.status === "published" && existing.status !== "published") payload.publishedAt = serverTimestamp();
      const ref = id ? doc(db, schema.collection, id) : doc(collection(db, schema.collection));
      await setDoc(ref, payload, { merge: true });
      await writeAudit(id ? "update" : "create", schema.collection, ref.id, { section, status: payload.status });
      toast("Saved.", "success");
      closeModal();
      router();
    } catch (err) { toast(friendlyError(err, "saving record"), "error"); }
  };
}

async function renderAdminField(field, existing) {
  const value = existing?.[field.key] ?? field.default ?? "";
  const required = field.required ? '<span class="required">*</span>' : "";
  if (field.type === "textarea") {
    return `<div><label>${escapeHtml(field.label)} ${required}</label><textarea name="${escapeHtml(field.key)}">${escapeHtml(value)}</textarea></div>`;
  }
  if (field.type === "number") {
    return `<div><label>${escapeHtml(field.label)} ${required}</label><input type="number" name="${escapeHtml(field.key)}" value="${escapeHtml(value)}"></div>`;
  }
  if (field.type === "checkbox") {
    return `<div class="checkbox-row"><input type="checkbox" name="${escapeHtml(field.key)}" ${value ? "checked" : ""}><label style="margin:0">${escapeHtml(field.label)}</label></div>`;
  }
  if (field.type === "select") {
    return `<div><label>${escapeHtml(field.label)} ${required}</label><select name="${escapeHtml(field.key)}">${field.options.map(o => `<option value="${escapeHtml(o)}" ${String(value) === String(o) ? "selected" : ""}>${escapeHtml(o || "Any")}</option>`).join("")}</select></div>`;
  }
  if (field.type === "multiselect") {
    const opts = await loadReferenceOptions(field.source);
    const selected = Array.isArray(value) ? value : [];
    return `<div><label>${escapeHtml(field.label)} ${required}</label><div class="chip-list">${opts.map(o => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="${escapeHtml(field.key)}" value="${escapeHtml(o.id)}" ${selected.includes(o.id) ? "checked" : ""}> ${escapeHtml(o.label)}</label>`).join("") || '<span class="small muted">No options</span>'}</div></div>`;
  }
  if (field.type === "reference") {
    const opts = await loadReferenceOptions(field.source);
    return `<div><label>${escapeHtml(field.label)} ${required}</label><select name="${escapeHtml(field.key)}"><option value="">— choose —</option>${opts.map(o => `<option value="${escapeHtml(o.id)}" ${value === o.id ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select></div>`;
  }
  if (field.type === "tags") {
    const tags = Array.isArray(value) ? value.join(", ") : value || "";
    return `<div><label>${escapeHtml(field.label)}</label><input name="${escapeHtml(field.key)}" value="${escapeHtml(tags)}"></div>`;
  }
  if (field.type === "date") {
    return `<div><label>${escapeHtml(field.label)}</label><input type="date" name="${escapeHtml(field.key)}" value="${escapeHtml(value || "")}"></div>`;
  }
  if (field.type === "blocks") {
    return `<div><label>${escapeHtml(field.label)}</label><div id="blocksEditor" class="block-editor"></div><button class="btn btn-small mt-8" id="addBlockBtn" type="button">+ Add block</button><div id="blocksPreview" class="mt-8"></div></div>`;
  }
  if (field.type === "options") {
    return `<div><label>${escapeHtml(field.label)}</label><div id="optionsEditor" class="options-editor"></div><button class="btn btn-small mt-8" id="addOptionBtn" type="button">+ Add option</button></div>`;
  }
  return `<div><label>${escapeHtml(field.label)} ${required}</label><input name="${escapeHtml(field.key)}" value="${escapeHtml(value)}"></div>`;
}

function bindAdminDynamicFields() {
  const st = S.adminFormState;
  if (!st) return;
  renderBlockEditor();
  renderOptionsEditor();
  $("#addBlockBtn")?.addEventListener("click", () => {
    st.blocks.push({ type: "paragraph", text: "" });
    renderBlockEditor();
  });
  $("#addOptionBtn")?.addEventListener("click", () => {
    if (st.options.length >= 6) return toast("Maximum 6 options.", "error");
    const id = String.fromCharCode(97 + st.options.length);
    st.options.push({ id, text: "" });
    renderOptionsEditor();
  });
}

function renderBlockEditor() {
  const root = $("#blocksEditor");
  if (!root) return;
  const st = S.adminFormState;
  root.innerHTML = st.blocks.map((b, i) => `
    <div class="editor-block" data-block-index="${i}">
      <div class="editor-block-head">
        <select data-block-type="${i}">${["heading", "paragraph", "bullets", "table", "image", "audio", "youtube", "keyFacts", "memoryTrick", "commonMistakes", "examTips", "summary", "reference"].map(t => `<option value="${t}" ${b.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        <span class="spacer"></span>
        <button class="btn btn-small" type="button" data-block-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-small" type="button" data-block-down="${i}" ${i === st.blocks.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn btn-small btn-danger" type="button" data-block-remove="${i}">Remove</button>
      </div>
      ${renderBlockFields(b, i)}
    </div>`).join("");
  if (!st.blocks.length) root.innerHTML = `<p class="small muted">No blocks yet. Add a heading or paragraph.</p>`;

  $$("[data-block-type]").forEach(sel => sel.addEventListener("change", () => {
    const i = Number(sel.dataset.blockType);
    st.blocks[i] = { type: sel.value, text: "", items: [], url: "" };
    renderBlockEditor();
  }));
  $$("[data-block-up]").forEach(b => b.addEventListener("click", () => {
    const i = Number(b.dataset.blockUp);
    if (i > 0) { [st.blocks[i - 1], st.blocks[i]] = [st.blocks[i], st.blocks[i - 1]]; renderBlockEditor(); }
  }));
  $$("[data-block-down]").forEach(b => b.addEventListener("click", () => {
    const i = Number(b.dataset.blockDown);
    if (i < st.blocks.length - 1) { [st.blocks[i + 1], st.blocks[i]] = [st.blocks[i], st.blocks[i + 1]]; renderBlockEditor(); }
  }));
  $$("[data-block-remove]").forEach(b => b.addEventListener("click", () => {
    st.blocks.splice(Number(b.dataset.blockRemove), 1); renderBlockEditor();
  }));
  $$("[data-block-field]").forEach(input => input.addEventListener("input", () => {
    const i = Number(input.dataset.blockField);
    const key = input.dataset.key;
    st.blocks[i][key] = input.value;
  }));
}

function renderBlockFields(block, index) {
  if (block.type === "heading") return `<input data-block-field="${index}" data-key="text" value="${escapeHtml(block.text || "")}" placeholder="Heading text">`;
  if (block.type === "paragraph") return `<textarea data-block-field="${index}" data-key="html" placeholder="Paragraph HTML (safe tags only)">${escapeHtml(block.html || block.text || "")}</textarea>`;
  if (["bullets", "keyFacts", "memoryTrick", "commonMistakes", "examTips", "summary"].includes(block.type)) {
    return `<textarea data-block-field="${index}" data-key="items" placeholder="One item per line">${escapeHtml((block.items || []).join("\n"))}</textarea>`;
  }
  if (block.type === "table") return `<textarea data-block-field="${index}" data-key="rows" placeholder='JSON rows, e.g. [["A","B"],["1","2"]]'>${escapeHtml(JSON.stringify(block.rows || [], null, 2))}</textarea><input class="mt-8" data-block-field="${index}" data-key="headers" value="${escapeHtml((block.headers || []).join(","))}" placeholder="Headers comma separated">`;
  if (["image", "audio", "youtube"].includes(block.type)) return `<input data-block-field="${index}" data-key="url" value="${escapeHtml(block.url || "")}" placeholder="https://…"><input class="mt-8" data-block-field="${index}" data-key="caption" value="${escapeHtml(block.caption || "")}" placeholder="Caption">`;
  if (block.type === "reference") return `<input data-block-field="${index}" data-key="url" value="${escapeHtml(block.url || "")}" placeholder="https://…"><input class="mt-8" data-block-field="${index}" data-key="text" value="${escapeHtml(block.text || "")}" placeholder="Reference label">`;
  return "";
}

function renderOptionsEditor() {
  const root = $("#optionsEditor");
  if (!root) return;
  const st = S.adminFormState;
  root.innerHTML = st.options.map((o, i) => `<div class="editor-option"><div class="mini-row"><input type="text" data-option-text="${i}" value="${escapeHtml(o.text || "")}" placeholder="Option text"><label class="small"><input type="radio" name="correctOption" value="${escapeHtml(o.id)}" ${st.correctOptionId === o.id ? "checked" : ""}> Correct</label><button class="btn btn-small btn-danger" type="button" data-option-remove="${i}" ${st.options.length <= 2 ? "disabled" : ""}>✕</button></div></div>`).join("");
  $$("[data-option-text]").forEach(inp => inp.addEventListener("input", () => {
    S.adminFormState.options[Number(inp.dataset.optionText)].text = inp.value;
  }));
  $$('input[name="correctOption"]').forEach(r => r.addEventListener("change", () => {
    S.adminFormState.correctOptionId = r.value;
  }));
  $$("[data-option-remove]").forEach(b => b.addEventListener("click", () => {
    S.adminFormState.options.splice(Number(b.dataset.optionRemove), 1);
    if (!S.adminFormState.options.some(o => o.id === S.adminFormState.correctOptionId)) S.adminFormState.correctOptionId = S.adminFormState.options[0]?.id || "a";
    renderOptionsEditor();
  }));
}

function collectAdminForm(schema) {
  const st = S.adminFormState;
  const data = {};
  for (const f of schema.fields) {
    if (f.type === "blocks") { data.blocks = st.blocks; continue; }
    if (f.type === "options") { data.options = st.options; data.correctOptionId = st.correctOptionId; continue; }
    if (f.type === "multiselect") {
      data[f.key] = $$(`input[name="${f.key}"]:checked`).map(i => i.value);
      continue;
    }
    if (f.type === "checkbox") {
      data[f.key] = !!document.querySelector(`input[name="${f.key}"]`)?.checked;
      continue;
    }
    const el = document.querySelector(`[name="${f.key}"]`);
    if (!el) continue;
    if (f.type === "number") data[f.key] = Number(el.value || 0);
    else if (f.type === "tags") data[f.key] = el.value.split(",").map(s => s.trim()).filter(Boolean);
    else if (f.type === "date") data[f.key] = el.value || null;
    else data[f.key] = el.value.trim();
    if (f.required && !data[f.key]) { toast(`${f.label} is required.`, "error"); return null; }
  }
  if (schema.collection === "questions") {
    if (!data.options || data.options.length < 2 || data.options.some(o => !String(o.text || "").trim())) {
      toast("Questions need at least two options with text.", "error"); return null;
    }
    if (!data.options.some(o => o.id === data.correctOptionId)) {
      toast("Choose a correct option.", "error"); return null;
    }
    data.options = data.options.map((o, i) => ({ id: o.id || String.fromCharCode(97 + i), text: o.text }));
  }
  if (data.status === "published") {
    if (!data.title && !data.questionText) { toast("A published record needs a title or question.", "error"); return null; }
  }
  return data;
}

async function previewAdminDoc(section, id) {
  const schema = ADMIN_SCHEMAS[section];
  try {
    const snap = await getDoc(doc(db, schema.collection, id));
    if (!snap.exists()) return toast("Record not found.", "error");
    const data = snap.data();
    let preview = "";
    if (section === "materials") preview = (data.blocks || []).map(renderMaterialBlock).join("");
    else if (section === "questions") preview = `<p><strong>${escapeHtml(data.questionText || "")}</strong></p><div class="option-list">${(data.options || []).map((o, i) => `<div class="option-btn" style="cursor:default"><span class="option-key">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(o.text || "")}</span></div>`).join("")}</div><div class="explanation-box"><p>${sanitizeHtml(data.explanation || "")}</p></div>`;
    else preview = `<pre style="white-space:pre-wrap;font-size:.8rem">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
    openModal(`<div class="modal-head"><h2>${escapeHtml(data.title || data.questionText || id)}</h2><button class="modal-close" data-modal-close>✕</button></div><div class="admin-preview reader-content">${preview}</div>`, { wide: true });
  } catch (err) { toast(friendlyError(err, "previewing"), "error"); }
}

async function writeAudit(action, collectionName, docId, extra = {}) {
  try {
    await addDoc(collection(db, "adminAuditLogs"), {
      action, collection: collectionName, docId, actorId: S.user.uid, actorEmail: S.user.email || "",
      ...extra, createdAt: serverTimestamp()
    });
  } catch (err) { console.warn("Audit log failed", err); }
}

async function renderAdminReports(token) {
  let reports = [];
  try {
    const snap = await getDocs(query(collection(db, "questionReports"), orderBy("createdAt", "desc"), limit(50)));
    reports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  if (isStale(token)) return;
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Reports</h1><p class="page-sub">Student-submitted content errors.</p></div><a class="btn" href="#/admin">Admin home</a></div>
    ${reports.length ? `<div class="stack">${reports.map(r => `<div class="card"><div class="row-between"><div><strong>${escapeHtml(r.title || r.itemId)}</strong><div class="list-item-meta"><span>${escapeHtml(r.type)}</span><span>${escapeHtml(r.status)}</span><span>${timeAgo(r.createdAt)}</span></div></div><span class="badge ${r.status === "resolved" ? "green" : "amber"}">${escapeHtml(r.status)}</span></div><p class="small mt-8">${escapeHtml(r.message || "")}</p>${r.status === "pending" ? `<div class="row"><button class="btn btn-small btn-success" data-resolve-report="${escapeHtml(r.id)}" data-status="resolved" type="button">Resolve</button><button class="btn btn-small" data-resolve-report="${escapeHtml(r.id)}" data-status="dismissed" type="button">Dismiss</button></div>` : `<p class="tiny muted">Resolution: ${escapeHtml(r.resolutionNote || "—")}</p>`}</div>`).join("")}</div>` : emptyState("No reports", "Student error reports will appear here.")}
  `);
  $$("[data-resolve-report]").forEach(btn => btn.addEventListener("click", async () => {
    const note = prompt("Resolution note (optional):") || "";
    try {
      await updateDoc(doc(db, "questionReports", btn.dataset.resolveReport), { status: btn.dataset.status, resolutionNote: note, resolvedBy: S.user.uid, resolvedAt: serverTimestamp() });
      toast("Report updated.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "resolving report"), "error"); }
  }));
}

async function renderAdminStudents(token) {
  let users = [];
  try {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(50)));
    users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  if (isStale(token)) return;
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Students and access</h1><p class="page-sub">Application suspension and premium entitlement. Firebase Authentication accounts cannot be disabled from client JavaScript.</p></div><a class="btn" href="#/admin">Admin home</a></div>
    ${users.length ? `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Status</th><th>Premium</th><th>Actions</th></tr></thead><tbody>${users.map(u => `<tr><td>${escapeHtml(u.displayName || u.email || u.id)}<br><span class="tiny muted">${escapeHtml(u.email || "")}</span></td><td>${u.suspended ? '<span class="badge red">Suspended</span>' : '<span class="badge green">Active</span>'}</td><td>${u.premium ? '<span class="badge green">Premium</span>' : '<span class="badge">Standard</span>'}</td><td><div class="row"><button class="btn btn-small" data-toggle-suspend="${escapeHtml(u.id)}" data-value="${u.suspended ? "false" : "true"}">${u.suspended ? "Unsuspend" : "Suspend"}</button><button class="btn btn-small" data-toggle-premium="${escapeHtml(u.id)}" data-value="${u.premium ? "false" : "true"}">${u.premium ? "Remove premium" : "Grant premium"}</button></div></td></tr>`).join("")}</tbody></table></div>` : emptyState("No students yet", "Student profiles will appear here after they sign up.")}
  `);
  $$("[data-toggle-suspend]").forEach(b => b.addEventListener("click", async () => {
    try { await updateDoc(doc(db, "users", b.dataset.toggleSuspend), { suspended: b.dataset.value === "true", updatedAt: serverTimestamp() }); await writeAudit("student-suspend", "users", b.dataset.toggleSuspend, { value: b.dataset.value }); router(); }
    catch (err) { toast(friendlyError(err, "updating student"), "error"); }
  }));
  $$("[data-toggle-premium]").forEach(b => b.addEventListener("click", async () => {
    try { await updateDoc(doc(db, "users", b.dataset.togglePremium), { premium: b.dataset.value === "true", updatedAt: serverTimestamp() }); await writeAudit("student-premium", "users", b.dataset.togglePremium, { value: b.dataset.value }); router(); }
    catch (err) { toast(friendlyError(err, "updating student"), "error"); }
  }));
}

async function renderAdminSettings(token) {
  let settings = {};
  try {
    const snap = await getDoc(doc(db, "appSettings", "site"));
    if (snap.exists()) settings = snap.data();
  } catch (err) { console.warn(err); }
  if (isStale(token)) return;
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Site Settings</h1><p class="page-sub">Invalid values are rejected before saving.</p></div><a class="btn" href="#/admin">Admin home</a></div>
    <div class="card">
      <div class="form-grid">
        <div><label>Site title</label><input id="settingTitle" value="${escapeHtml(settings.title || "Sajilo GK")}" maxlength="80"></div>
        <div><label>Welcome text</label><textarea id="settingWelcome">${escapeHtml(settings.welcomeText || "")}</textarea></div>
        <div><label>Accent colour (hex)</label><input id="settingAccent" value="${escapeHtml(settings.accentColor || "#4f46e5")}" placeholder="#4f46e5"></div>
        <div><label>Active examinations (comma-separated exam IDs)</label><input id="settingActiveExams" value="${escapeHtml((settings.activeExamIds || []).join(","))}"></div>
        <div class="checkbox-row"><input type="checkbox" id="settingRegistration" ${settings.registrationOpen !== false ? "checked" : ""}><label style="margin:0">Registration open</label></div>
        <div class="checkbox-row"><input type="checkbox" id="settingMaintenance" ${settings.maintenance ? "checked" : ""}><label style="margin:0">Maintenance notice</label></div>
        <div><label>Visible features (comma-separated)</label><input id="settingFeatures" value="${escapeHtml((settings.features || []).join(","))}" placeholder="revision,tests,currentAffairs"></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" id="saveSettingsBtn" type="button">Save settings</button></div>
    </div>
  `);
  $("#saveSettingsBtn")?.addEventListener("click", async () => {
    const accent = $("#settingAccent").value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(accent)) return toast("Accent colour must be a 6-digit hex colour.", "error");
    try {
      await setDoc(doc(db, "appSettings", "site"), {
        title: $("#settingTitle").value.trim() || "Sajilo GK",
        welcomeText: $("#settingWelcome").value.trim(),
        accentColor: accent,
        activeExamIds: $("#settingActiveExams").value.split(",").map(s => s.trim()).filter(Boolean),
        registrationOpen: $("#settingRegistration").checked,
        maintenance: $("#settingMaintenance").checked,
        features: $("#settingFeatures").value.split(",").map(s => s.trim()).filter(Boolean),
        updatedAt: serverTimestamp()
      }, { merge: true });
      await writeAudit("settings-update", "appSettings", "site", {});
      toast("Settings saved.", "success");
    } catch (err) { toast(friendlyError(err, "saving settings"), "error"); }
  });
}

async function renderAdminAudit(token) {
  let logs = [];
  try {
    const snap = await getDocs(query(collection(db, "adminAuditLogs"), orderBy("createdAt", "desc"), limit(50)));
    logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  if (isStale(token)) return;
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Audit Logs</h1><p class="page-sub">Immutable administrative actions.</p></div><a class="btn" href="#/admin">Admin home</a></div>
    ${logs.length ? `<div class="table-wrap"><table><thead><tr><th>Action</th><th>Collection</th><th>Document</th><th>Actor</th><th>Time</th></tr></thead><tbody>${logs.map(l => `<tr><td>${escapeHtml(l.action)}</td><td>${escapeHtml(l.collection)}</td><td>${escapeHtml(l.docId)}</td><td>${escapeHtml(l.actorEmail || l.actorId)}</td><td>${timeAgo(l.createdAt)}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No audit records", "Administrative actions will be logged here.")}
  `);
}

/* ============================================================
   16. IMPORT AND EXPORT
   ============================================================ */

function renderAdminImportExport(token) {
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Import / Export</h1><p class="page-sub">Validate before committing. No sample data is written automatically.</p></div><a class="btn" href="#/admin">Admin home</a></div>
    <div class="card mb-16">
      <h2 class="card-title">Import JSON</h2>
      <div class="form-grid">
        <div><label>Content type</label><select id="importType">${Object.keys(ADMIN_SCHEMAS).map(k => `<option value="${k}">${escapeHtml(ADMIN_SCHEMAS[k].label)}</option>`).join("")}</select></div>
        <div><label>Mode</label><select id="importMode"><option value="addNew">Add New</option><option value="updateById">Update by ID</option><option value="addOrUpdate">Add or Update</option><option value="skipDuplicates">Skip Duplicates</option></select></div>
        <div><label>JSON file</label><input id="importFile" type="file" accept=".json,application/json"></div>
      </div>
      <div class="row mt-8"><button class="btn btn-primary" id="previewImportBtn" type="button">Validate and preview</button><button class="btn" id="downloadTemplateBtn" type="button">Download example template</button></div>
      <div id="importPreview" class="mt-16"></div>
    </div>
    <div class="card">
      <h2 class="card-title">Export</h2>
      <div class="form-grid"><div><label>Content type</label><select id="exportType">${Object.keys(ADMIN_SCHEMAS).map(k => `<option value="${k}">${escapeHtml(ADMIN_SCHEMAS[k].label)}</option>`).join("")}</select></div><div><label>Format</label><select id="exportFormat"><option value="json">JSON</option><option value="csv">CSV</option></select></div></div>
      <div class="form-actions"><button class="btn btn-primary" id="exportBtn" type="button">Export</button></div>
      <p class="tiny muted mt-8">Answer keys are included only in this administrator export.</p>
    </div>
  `);

  $("#downloadTemplateBtn")?.addEventListener("click", () => {
    const type = $("#importType").value;
    const schema = ADMIN_SCHEMAS[type];
    const sample = {};
    schema.fields.forEach(f => {
      if (f.type === "blocks") sample[f.key] = [{ type: "heading", text: "Example heading" }, { type: "paragraph", html: "Example paragraph." }];
      else if (f.type === "options") sample[f.key] = [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }];
      else if (f.type === "number") sample[f.key] = f.default || 0;
      else if (f.type === "checkbox") sample[f.key] = false;
      else if (f.type === "multiselect" || f.type === "tags") sample[f.key] = [];
      else sample[f.key] = f.default || "";
    });
    sample.id = "optional_custom_id";
    downloadFile(`${type}-template.json`, JSON.stringify([sample], null, 2), "application/json");
  });

  $("#previewImportBtn")?.addEventListener("click", async () => {
    const file = $("#importFile").files[0];
    if (!file) return toast("Choose a JSON file.", "error");
    const type = $("#importType").value;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items)) throw new Error("JSON must be an array or an object with an items array.");
      const schema = ADMIN_SCHEMAS[type];
      const existingIds = new Set();
      const ids = items.map(i => i.id).filter(Boolean);
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        const snap = await getDocs(query(collection(db, schema.collection), where(documentId(), "in", chunk)));
        snap.docs.forEach(d => existingIds.add(d.id));
      }
      const errors = [];
      items.forEach((item, idx) => {
        if (!item || typeof item !== "object") errors.push(`Row ${idx + 1}: not an object.`);
        schema.fields.filter(f => f.required).forEach(f => {
          const value = item[f.key];
          if (value === undefined || value === null || value === "") errors.push(`Row ${idx + 1}: missing required “${f.label}”.`);
        });
        if (type === "questions") {
          const opts = Array.isArray(item.options) ? item.options : [];
          if (opts.length < 2) errors.push(`Row ${idx + 1}: at least 2 options required.`);
          if (!opts.some(o => o.id === item.correctOptionId)) errors.push(`Row ${idx + 1}: correctOptionId does not match an option.`);
        }
      });
      S.importState = { type, mode: $("#importMode").value, items, errors, existingIds };
      const preview = $("#importPreview");
      preview.innerHTML = `<div class="card" style="box-shadow:none"><strong>${items.length} row(s)</strong><p class="small muted">${errors.length ? `${errors.length} validation error(s)` : "Validation passed."} ${existingIds.size} duplicate ID(s) already exist.</p>${errors.length ? `<ul class="small" style="color:var(--red)">${errors.slice(0, 20).map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}<div class="form-actions"><button class="btn btn-danger" id="commitImportBtn" type="button" ${errors.length ? "disabled" : ""}>Confirm import</button><button class="btn" id="downloadErrorsBtn" type="button" ${errors.length ? "" : "disabled"}>Download error report</button></div></div>`;
      $("#commitImportBtn")?.addEventListener("click", commitImport);
      $("#downloadErrorsBtn")?.addEventListener("click", () => downloadFile("import-errors.txt", errors.join("\n"), "text/plain"));
    } catch (err) {
      toast(`Invalid JSON: ${err.message}`, "error");
    }
  });

  $("#exportBtn")?.addEventListener("click", exportAdminContent);
}

async function commitImport() {
  const st = S.importState;
  if (!st) return;
  const schema = ADMIN_SCHEMAS[st.type];
  const batchSize = 400;
  let written = 0, skipped = 0, failed = 0;
  try {
    for (let i = 0; i < st.items.length; i += batchSize) {
      const chunk = st.items.slice(i, i + batchSize);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const hasId = item.id && st.existingIds.has(item.id);
        if (st.mode === "skipDuplicates" && hasId) { skipped++; continue; }
        if (st.mode === "addNew" && hasId) { skipped++; continue; }
        if (st.mode === "updateById" && !hasId) { skipped++; continue; }
        const ref = item.id ? doc(db, schema.collection, item.id) : doc(collection(db, schema.collection));
        const payload = { ...item, updatedAt: serverTimestamp() };
        delete payload.id;
        if (!hasId) payload.createdAt = serverTimestamp();
        batch.set(ref, payload, { merge: true });
        written++;
      }
      await batch.commit();
    }
    await writeAudit("import", schema.collection, "bulk", { written, skipped, failed, type: st.type });
    toast(`Import complete: ${written} written, ${skipped} skipped, ${failed} failed.`, "success", 5000);
    $("#importPreview").innerHTML = `<p class="small">Import finished: ${written} written, ${skipped} skipped, ${failed} failed.</p>`;
  } catch (err) {
    toast(friendlyError(err, "committing import"), "error");
  }
}

async function exportAdminContent() {
  const type = $("#exportType").value;
  const format = $("#exportFormat").value;
  const schema = ADMIN_SCHEMAS[type];
  try {
    let all = [];
    let last = null;
    while (true) {
      let q = query(collection(db, schema.collection), orderBy(documentId()), limit(500));
      if (last) q = query(collection(db, schema.collection), orderBy(documentId()), startAfter(last), limit(500));
      const snap = await getDocs(q);
      if (snap.empty) break;
      all.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 500) break;
    }
    if (format === "json") {
      downloadFile(`${type}-export.json`, JSON.stringify(all, null, 2), "application/json");
    } else {
      const rows = all.map(item => {
        const flat = { id: item.id };
        schema.fields.forEach(f => {
          let v = item[f.key];
          if (Array.isArray(v) || (v && typeof v === "object")) v = JSON.stringify(v);
          flat[f.key] = v ?? "";
        });
        return flat;
      });
      const headers = Object.keys(rows[0] || { id: "" });
      const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
      downloadFile(`${type}-export.csv`, csv, "text/csv");
    }
    toast(`Exported ${all.length} record(s).`, "success");
  } catch (err) {
    toast(friendlyError(err, "exporting"), "error");
  }
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ============================================================
   17. BOOT
   ============================================================ */

async function applySiteSettings() {
  try {
    const snap = await getDoc(doc(db, "appSettings", "site"));
    if (!snap.exists()) return;
    const settings = snap.data();
    S.settings = settings;
    if (settings.title) document.title = `${settings.title} — Smart Loksewa Preparation`;
    if (settings.accentColor && /^#[0-9a-f]{6}$/i.test(settings.accentColor)) {
      document.documentElement.style.setProperty("--primary", settings.accentColor);
    }
  } catch (err) {
    console.warn("Site settings unavailable", err);
  }
}

function showBootError(err) {
  const boot = els.bootScreen;
  if (boot) {
    boot.innerHTML = `<div class="boot-logo">Sajilo<span>GK</span></div><p style="max-width:520px;color:var(--red)">The application could not initialise Firebase. Check your network and Firebase configuration.</p><button class="btn btn-primary" onclick="location.reload()">Reload</button>`;
  }
  console.error(err);
}

function boot() {
  cacheEls();
  initTheme();
  bindAuthEvents();
  bindShellEvents();
  bindVerifyGate();

  if (firebaseInitError) { showBootError(firebaseInitError); return; }

  onAuthStateChanged(auth, async user => {
    S.authReady = true;
    S.user = user;
    if (!user) {
      S.profile = null;
      S.profileLoaded = false;
      S.profilePromise = null;
      S.isOwner = false;
      S.isAdmin = false;
      S.selectedSubjects = [];
      showAuth();
      setAuthTab("login");
      return;
    }

    S.isOwner = user.email === OWNER_EMAIL && user.emailVerified === true;
    S.isAdmin = S.isOwner;
    showShell();
    renderProfileChrome();
    updateAdminVisibility();
    await initCache(user.uid);
    applySiteSettings();
    loadRole();
    ensureProfile().then(() => {
      renderProfileChrome();
      if (S.profile && !S.profile.onboardingComplete && !["onboarding", "profile", "settings", "setup", "admin"].includes(parseRoute().segs[0])) {
        go("/onboarding");
      }
    });
    router();
  });

  // Deep-link recovery: if already signed in when the page loads, auth listener handles routing.
  window.addEventListener("online", () => toast("You are back online. Firestore will retry pending reads.", "success"));
  window.addEventListener("offline", () => toast("You are offline. Cached content may still open; new saves may fail.", "info", 4500));
}

document.addEventListener("DOMContentLoaded", boot);

if (document.readyState === "interactive" || document.readyState === "complete") {
  boot();
}
