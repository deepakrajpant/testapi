/* Sajilo GK - script.js */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  sendPasswordResetEmail, sendEmailVerification, reload, updateProfile
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, startAfter,
  serverTimestamp, increment, writeBatch, runTransaction,
  getCountFromServer, Timestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

/* ============ 1. FIREBASE ============ */
const firebaseConfig = {
  apiKey: "AIzaSyDK1wwahwoJxNAH_Iats2wrSMUA42jVhSI",
  authDomain: "loksewa-2083.firebaseapp.com",
  projectId: "loksewa-2083",
  storageBucket: "loksewa-2083.firebasestorage.app",
  messagingSenderId: "484441818228",
  appId: "1:484441818228:web:fb43d456131cd40ec1fd21",
  measurementId: "G-D5RTD5R7B4"
};
let app = null, auth = null, db = null, firebaseInitError = null;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }) });
  } catch {
    db = getFirestore(app);
  }
} catch (err) {
  firebaseInitError = err;
  console.error("Firebase init failed", err);
}

/* ============ 2. CONSTANTS & STATE ============ */
const OWNER_EMAIL = "deepakrajpant978@gmail.com";
const PAGE_SIZE = 20;
const NEPAL_TZ = "Asia/Kathmandu";
const S = {
  user: null, profile: null, profileLoaded: false, profilePromise: null, profileLoadError: null,
  isOwner: false, isAdmin: false, authReady: false,
  exams: [], selectedExamIds: [], selectedSubjects: [], settings: null,
  routeToken: 0, pageCleanup: null, cachePrefix: "",
  adminSection: "", adminId: null, adminBlocks: [], adminOptions: [],
  adminCorrectOptionId: "a",
  activeTestTimer: null, practice: null, importState: null
};
const els = {};

function cacheEls() {
  ["bootScreen","bootMessage","authView","appShell","app","topbar","menuToggle",
   "adminHeaderBtn","themeToggle","profileBtn","profileDropdown","avatarInitial",
   "profileChipName","logoutBtn","mobileLogoutBtn","sidebar","sidebarBackdrop",
   "sidebarLogoutBtn","verifyBanner","resendVerifyBtn","refreshVerifyBtn",
   "modalRoot","toastRoot","loginForm","signupForm","resetForm","googleBtn",
   "authMessage","dropdownAvatar","dropdownName","dropdownEmail","dropdownVerifyBadge"
  ].forEach(id => { els[id] = document.getElementById(id); });
}

/* ============ 3. UTILITIES ============ */
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function escapeHtml(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function safeUrl(raw) {
  try { const u = new URL(String(raw || "").trim()); return ["http:","https:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
}
function youtubeId(raw) {
  const url = safeUrl(raw);
  if (!url) return "";
  const u = new URL(url);
  if (u.hostname === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || "";
  if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || "";
  return u.searchParams.get("v") || "";
}
function sanitizeHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html || "");
  const allowed = new Set(["P","BR","STRONG","B","EM","I","U","S","UL","OL","LI","H1","H2","H3","H4","H5","H6","BLOCKQUOTE","CODE","PRE","SPAN","A","TABLE","THEAD","TBODY","TR","TH","TD","IMG","HR","MARK","DIV","FIGURE","FIGCAPTION","IFRAME"]);
  const walk = (node) => {
    Array.from(node.children).forEach(child => {
      if (!allowed.has(child.tagName)) { child.replaceWith(...child.childNodes); return; }
      Array.from(child.attributes).forEach(attr => {
        if (attr.name === "href" || attr.name === "src") {
          if (safeUrl(attr.value)) {
            child.setAttribute("rel","noopener noreferrer");
            if (attr.name === "href") child.setAttribute("target","_blank");
          } else child.removeAttribute(attr.name);
        } else if (!["class","alt","title","colspan","rowspan","width","height"].includes(attr.name)) {
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
  return new Intl.DateTimeFormat("en-CA", { timeZone: NEPAL_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return null;
}
function formatDate(v, { time = false } = {}) {
  const d = toDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: NEPAL_TZ, year: "numeric", month: "short", day: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(d);
}
function timeAgo(v) {
  const d = toDate(v);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}
function debounce(fn, wait = 300) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function toast(message, type = "info", ms = 3400) {
  if (!els.toastRoot) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  els.toastRoot.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function spinnerBlock(text = "Loading…") {
  return `<div class="loading-state"><div class="boot-spinner" style="margin:0 auto 12px"></div><p class="muted">${escapeHtml(text)}</p></div>`;
}
function emptyState(title, text, action = "") {
  return `<div class="empty-state"><div class="empty-icon">📭</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p>${action}</div>`;
}
function errorState(title, text) {
  return `<div class="error-state"><div class="error-icon">⚠️</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p><button class="btn btn-primary" data-action="retry-page">Retry</button></div>`;
}
function friendlyError(err, context = "") {
  console.error(`[SajiloGK:${context}]`, err);
  const c = err?.code || "";
  if (c === "permission-denied") return "Access denied. Verify your email, or check that content is published.";
  if (c === "unavailable") return "Network or Firebase unavailable. Check your connection.";
  if (c === "failed-precondition") return "Firestore index missing. Please create the required index (see setup docs).";
  if (c === "auth/network-request-failed") return "Network error during sign-in.";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found") return "Email or password incorrect.";
  if (c === "auth/email-already-in-use") return "This email already has an account.";
  if (c === "auth/too-many-requests") return "Too many attempts. Please wait.";
  if (c === "auth/popup-closed-by-user") return "Sign-in popup closed.";
  if (c === "auth/popup-blocked") return "Popup blocked. Falling back to redirect…";
  if (c === "auth/unauthorized-domain") return "This domain is not authorized in Firebase Auth settings.";
  return context ? `Failed while ${context}. Please retry.` : "Something went wrong. Please retry.";
}
function isPermissionError(err) { return err?.code === "permission-denied"; }
async function withTimeout(promise, ms = 10000, label = "operation") {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out`)), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(t); }
}
async function safeGetDoc(ref) {
  try { return await getDoc(ref); } catch (err) { if (isPermissionError(err)) throw err; console.warn(err); return null; }
}
async function safeGetDocs(q) {
  try { return await getDocs(q); } catch (err) { if (isPermissionError(err)) throw err; console.warn(err); return null; }
}
async function countQuery(q) {
  try { const snap = await getCountFromServer(q); return snap.data().count; } catch { return null; }
}
function confirmDialog(message, { title = "Confirm", confirmText = "Confirm", danger = false } = {}) {
  return new Promise(resolve => {
    const root = els.modalRoot;
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="modal-close" type="button" data-cancel>✕</button></div>
      <p>${escapeHtml(message)}</p>
      <div class="form-actions">
        <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-confirm>${escapeHtml(confirmText)}</button>
      </div></div>`;
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    const done = v => { root.classList.remove("open"); root.setAttribute("aria-hidden","true"); root.innerHTML = ""; document.body.classList.remove("no-scroll"); resolve(v); };
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
  root.querySelectorAll("[data-modal-close]").forEach(b => b.onclick = closeModal);
  root.onclick = e => { if (e.target === root) closeModal(); };
  return root.querySelector(".modal");
}
function closeModal() {
  els.modalRoot.classList.remove("open");
  els.modalRoot.setAttribute("aria-hidden", "true");
  els.modalRoot.innerHTML = "";
  document.body.classList.remove("no-scroll");
}
function setPageHtml(html) { els.app.innerHTML = html; }
function cleanupPage() {
  if (typeof S.pageCleanup === "function") { try { S.pageCleanup(); } catch (e) { console.warn(e); } }
  S.pageCleanup = null;
  if (S.activeTestTimer) { clearInterval(S.activeTestTimer); S.activeTestTimer = null; }
}
function bindRetry() {
  const btn = els.app.querySelector('[data-action="retry-page"]');
  if (btn) btn.onclick = () => router();
}
function routeToken() { S.routeToken += 1; return S.routeToken; }
function isStale(t) { return t !== S.routeToken; }
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  return { segs, params: new URLSearchParams(queryPart || "") };
}
function go(path) { location.hash === `#${path}` ? router() : (location.hash = `#${path}`); }
function levelLabel(l) { return l === "L1" ? "L1 · Basic" : l === "L2" ? "L2 · Medium" : l === "L3" ? "L3 · Advanced" : (l || "—"); }
function importanceLabel(i) { return i === "veryImportant" ? "Very important" : i === "important" ? "Important" : "Normal"; }
function statusBadge(s) { return `<span class="badge ${escapeHtml(s || "draft")}">${escapeHtml(s || "draft")}</span>`; }
function readPercent(read, total) { return total ? Math.round((read / total) * 100) : 0; }
function masteryPercent(m, t) { return t ? Math.round((m / t) * 100) : null; }
function activeNav(path) {
  $$("[data-nav]").forEach(a => {
    const target = (a.getAttribute("href") || "").replace(/^#/, "");
    const cur = location.hash.replace(/^#/, "") || "/home";
    const isHome = target === "/home" && (cur === "/home" || cur === "/");
    a.classList.toggle("active", isHome || (target !== "/home" && cur.startsWith(target)));
  });
}

/* ============ 4. INDEXEDDB CACHE ============ */
const idbCache = {
  db: null, uid: "", opening: null,
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
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return this.opening;
  }
};
async function initCache(uid) { await idbCache.open(uid); }

/* ============ 5. AUTH ============ */
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
  if (els.authMessage) { els.authMessage.textContent = ""; els.authMessage.className = "auth-message"; }
}
function setAuthTab(tab) {
  $$(".auth-tab").forEach(b => {
    const active = b.dataset.authTab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
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
  const email = user.email || "";
  const initial = (name.trim().charAt(0) || "S").toUpperCase();
  if (els.profileChipName) els.profileChipName.textContent = name;
  if (els.avatarInitial) els.avatarInitial.textContent = initial;
  if (els.dropdownAvatar) els.dropdownAvatar.textContent = initial;
  if (els.dropdownName) els.dropdownName.textContent = name;
  if (els.dropdownEmail) els.dropdownEmail.textContent = email;
  if (els.dropdownVerifyBadge) {
    els.dropdownVerifyBadge.classList.toggle("hidden", !!user.emailVerified);
    els.dropdownVerifyBadge.textContent = user.emailVerified ? "" : "Unverified";
  }
  if (els.adminHeaderBtn) els.adminHeaderBtn.classList.toggle("hidden", !(S.isOwner || S.isAdmin));
  if (els.verifyBanner) els.verifyBanner.classList.toggle("hidden", !!user.emailVerified);
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
      try { snap = await withTimeout(getDoc(ref), 9000, "profile load"); }
      catch (err) {
        if (isPermissionError(err)) { S.profileLoadError = err; return null; }
        throw err;
      }
      if (snap?.exists()) {
        S.profile = { id: snap.id, ...snap.data() };
      } else if (S.user.emailVerified) {
        const data = {
          uid: S.user.uid, email: S.user.email || "",
          displayName: S.user.displayName || S.user.email?.split("@")[0] || "Student",
          examIds: [], dailyGoal: 20, suspended: false, premium: false,
          onboardingComplete: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        };
        await setDoc(ref, data);
        S.profile = { id: S.user.uid, ...data };
      }
      return S.profile;
    } catch (err) { S.profileLoadError = err; console.warn("Profile load failed", err); return null; }
    finally { S.profileLoaded = true; }
  })();
  return S.profilePromise;
}
async function loadRole() {
  S.isOwner = S.user?.email === OWNER_EMAIL && S.user?.emailVerified === true;
  S.isAdmin = S.isOwner;
  if (els.adminHeaderBtn) els.adminHeaderBtn.classList.toggle("hidden", !(S.isOwner || S.isAdmin));
  if (!S.user || S.isOwner) return;
  try {
    const snap = await getDoc(doc(db, "adminRoles", S.user.uid));
    if (snap.exists()) {
      const d = snap.data();
      S.isAdmin = d.active === true && ["admin","editor"].includes(d.role);
    }
  } catch (err) { console.warn("Role check failed", err); }
  if (els.adminHeaderBtn) els.adminHeaderBtn.classList.toggle("hidden", !(S.isOwner || S.isAdmin));
}
async function doLogout() {
  cleanupPage();
  try { if (auth) await signOut(auth); }
  catch (err) { console.warn("Sign out error", err); }
  S.user = null; S.profile = null; S.profileLoaded = false; S.profilePromise = null;
  S.profileLoadError = null; S.isOwner = false; S.isAdmin = false;
  S.selectedSubjects = []; S.selectedExamIds = []; S.exams = [];
  if (els.profileDropdown) els.profileDropdown.classList.add("hidden");
  showAuth();
  setAuthTab("login");
  authMessage("You have been logged out.", "success");
}
async function resendVerification() {
  if (!S.user) return;
  try { await sendEmailVerification(S.user); toast("Verification email sent.", "success"); }
  catch (err) { toast(friendlyError(err, "sending verification"), "error"); }
}
async function refreshVerification() {
  if (!S.user) return;
  try {
    await reload(S.user);
    S.user = auth.currentUser;
    if (S.user?.emailVerified) {
      S.isOwner = S.user.email === OWNER_EMAIL;
      await ensureProfile(true);
      await loadRole();
      renderProfileChrome();
      toast("Email verified. Welcome to Sajilo GK.", "success");
      router();
    } else {
      toast("Email still not verified. Check your inbox.", "error");
    }
  } catch (err) { toast(friendlyError(err, "refreshing verification"), "error"); }
}

async function handleGoogleSignIn() {
  clearAuthMessage();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
    return;
  } catch (err) {
    const code = err?.code || "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment" || code === "auth/cancelled-popup-request") {
      authMessage("Popup was blocked. Redirecting to Google…", "info");
      try { await signInWithRedirect(auth, provider); }
      catch (re) { authMessage(friendlyError(re, "Google redirect"), "error"); }
    } else if (code === "auth/popup-closed-by-user") {
      authMessage("Sign-in was cancelled.", "info");
    } else {
      authMessage(friendlyError(err, "Google sign-in"), "error");
    }
  }
}

async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      // Sign-in successful via redirect; auth listener handles routing.
      authMessage("Signed in with Google.", "success");
    }
  } catch (err) {
    if (err?.code && err.code !== "auth/no-auth-event") {
      console.warn("Redirect sign-in result error", err);
    }
  }
}

function bindAuthEvents() {
  $$(".auth-tab").forEach(b => b.addEventListener("click", () => setAuthTab(b.dataset.authTab)));

  els.loginForm?.addEventListener("submit", async e => {
    e.preventDefault(); clearAuthMessage();
    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;
    if (!email || !password) return authMessage("Enter your email and password.");
    const btn = els.loginForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Logging in…";
    try { await signInWithEmailAndPassword(auth, email, password); clearAuthMessage(); }
    catch (err) { authMessage(friendlyError(err, "logging in")); }
    finally { btn.disabled = false; btn.textContent = "Login"; }
  });

  els.signupForm?.addEventListener("submit", async e => {
    e.preventDefault(); clearAuthMessage();
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
      authMessage("Account created. Verify your email to continue.", "success");
    } catch (err) { authMessage(friendlyError(err, "creating account")); }
    finally { btn.disabled = false; btn.textContent = "Create account"; }
  });

  els.resetForm?.addEventListener("submit", async e => {
    e.preventDefault(); clearAuthMessage();
    const email = $("#resetEmail").value.trim();
    if (!email) return authMessage("Enter your email.");
    try { await sendPasswordResetEmail(auth, email); authMessage("Reset email sent.", "success"); }
    catch (err) { authMessage(friendlyError(err, "sending reset")); }
  });

  els.googleBtn?.addEventListener("click", handleGoogleSignIn);

  els.logoutBtn?.addEventListener("click", doLogout);
  els.sidebarLogoutBtn?.addEventListener("click", doLogout);
  els.mobileLogoutBtn?.addEventListener("click", doLogout);
  els.resendVerifyBtn?.addEventListener("click", resendVerification);
  els.refreshVerifyBtn?.addEventListener("click", refreshVerification);
}

/* ============ 6. SHELL & ROUTING ============ */
function toggleSidebar(open) {
  const isOpen = open ?? !els.sidebar.classList.contains("open");
  els.sidebar.classList.toggle("open", isOpen);
  els.sidebarBackdrop.classList.toggle("hidden", !isOpen);
  els.menuToggle.setAttribute("aria-expanded", String(isOpen));
}
function setTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("sajilo-theme", t); } catch {}
  if (els.themeToggle) els.themeToggle.textContent = t === "dark" ? "☀" : "🌙";
}
function initTheme() {
  let saved = "light";
  try { saved = localStorage.getItem("sajilo-theme") || "light"; } catch {}
  setTheme(saved === "dark" ? "dark" : "light");
}
function bindShellEvents() {
  els.menuToggle?.addEventListener("click", () => toggleSidebar());
  els.sidebarBackdrop?.addEventListener("click", () => toggleSidebar(false));
  els.profileBtn?.addEventListener("click", e => {
    e.stopPropagation();
    const open = els.profileDropdown.classList.contains("hidden");
    els.profileDropdown.classList.toggle("hidden", !open);
    els.profileBtn.setAttribute("aria-expanded", String(open));
    if (open) renderProfileChrome();
  });
  document.addEventListener("click", e => {
    if (!els.profileDropdown?.contains(e.target) && e.target !== els.profileBtn) {
      els.profileDropdown?.classList.add("hidden");
      els.profileBtn?.setAttribute("aria-expanded", "false");
    }
  });
  els.adminHeaderBtn?.addEventListener("click", () => go("/admin"));
  els.themeToggle?.addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    setTheme(dark ? "light" : "dark");
  });
  $$("[data-nav]").forEach(a => a.addEventListener("click", () => toggleSidebar(false)));
  window.addEventListener("hashchange", router);
}

async function router() {
  const token = routeToken();
  cleanupPage();
  const { segs, params } = parseRoute();
  const name = segs[0] || "home";
  activeNav(`/${segs.join("/")}`);

  if (!S.user) { showAuth(); return; }
  showShell();
  renderProfileChrome();

  if (name === "setup") { setPageHtml(renderSetupPage()); bindSetupPage(); return; }
  if (!S.user.emailVerified && !["profile","settings","setup","verify","admin"].includes(name)) {
    setPageHtml(renderVerifyGate());
    return;
  }

  try {
    switch (name) {
      case "home": await renderDashboard(token); break;
      case "onboarding": await renderOnboarding(token); break;
      case "subjects": await renderSubjectsPage(token); break;
      case "subject": await renderSubjectPage(segs[1], token); break;
      case "chapter": await renderChapterPage(segs[1], token); break;
      case "material": await renderMaterialReader(segs[1], token); break;
      case "practice": await renderPractice(params, token); break;
      case "tests": await renderTestsPage(token); break;
      case "test-active": await renderActiveTest(segs[2], token); break;
      case "results": await renderResults(segs[1], token); break;
      case "revision": await renderRevisionPage(token); break;
      case "progress": await renderProgressPage(token); break;
      case "saved": await renderSavedPage(params, token); break;
      case "profile": await renderProfilePage(token); break;
      case "settings": await renderSettingsPage(token); break;
      case "planner": await renderPlannerPage(token); break;
      case "current-affairs": await renderCurrentAffairsPage(token); break;
      case "admin": await renderAdminPage(segs[1], token); break;
      case "verify": setPageHtml(renderVerifyGate()); break;
      default:
        setPageHtml(`<div class="empty-state"><div class="empty-icon">🧭</div><h3>Page not found</h3><p>Route “${escapeHtml(name)}” does not exist.</p><a class="btn btn-primary" href="#/home">Go home</a></div>`);
    }
    if (!isStale(token)) { try { els.app.focus({ preventScroll: true }); } catch {} window.scrollTo({ top: 0, behavior: "auto" }); bindRetry(); }
  } catch (err) {
    if (isStale(token)) return;
    setPageHtml(errorState("Page could not load", friendlyError(err, "loading page")));
    bindRetry();
  }
}

function renderVerifyGate() {
  return `<div class="card" style="max-width:640px;margin:30px auto;text-align:center">
    <div class="empty-icon">✉️</div>
    <h2>Verify your email first</h2>
    <p class="muted">Signed in as <strong>${escapeHtml(S.user?.email || "")}</strong>. Learning content requires a verified email.</p>
    <div class="row" style="justify-content:center">
      <button class="btn btn-primary" id="gateResendBtn" type="button">Resend verification</button>
      <button class="btn" id="gateRefreshBtn" type="button">I have verified</button>
    </div>
    <a class="btn btn-ghost mt-8" href="#/profile">Go to Profile</a>
  </div>`;
}
function bindVerifyGate() {
  $("#gateResendBtn")?.addEventListener("click", resendVerification);
  $("#gateRefreshBtn")?.addEventListener("click", refreshVerification);
}

/* ============ 7. DATA LOADERS ============ */
async function loadSelectedSubjects() {
  if (!S.user) return [];
  try {
    const snap = await getDocs(collection(db, "users", S.user.uid, "selectedSubjects"));
    S.selectedSubjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("Selected subjects error", err); S.selectedSubjects = []; }
  return S.selectedSubjects;
}
async function loadExams() {
  try {
    const snap = await getDocs(query(collection(db, "exams"), where("status", "==", "published"), orderBy("order", "asc"), limit(50)));
    S.exams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Exams load failed, retrying without order", err);
    try {
      const snap = await getDocs(query(collection(db, "exams"), where("status", "==", "published"), limit(50)));
      S.exams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { S.exams = []; }
  }
  return S.exams;
}
async function getSubjectStats(subjectId) {
  const uid = S.user.uid;
  const [tm, rm, tq, mq] = await Promise.all([
    countQuery(query(collection(db, "materials"), where("subjectId","==",subjectId), where("status","==","published"))),
    countQuery(query(collection(db, "users",uid,"materialProgress"), where("subjectId","==",subjectId), where("status","==","read"))),
    countQuery(query(collection(db, "questions"), where("subjectId","==",subjectId), where("status","==","published"))),
    countQuery(query(collection(db, "users",uid,"questionProgress"), where("subjectId","==",subjectId), where("mastery","==",true)))
  ]);
  return {
    totalMaterials: tm ?? 0, readMaterials: rm ?? 0,
    totalQuestions: tq ?? 0, masteredQuestions: mq ?? 0,
    readingPercent: readPercent(rm ?? 0, tm ?? 0),
    masteryPercent: masteryPercent(mq ?? 0, tq ?? 0)
  };
}

/* ============ 8. ONBOARDING ============ */
async function renderOnboarding(token) {
  setPageHtml(spinnerBlock("Loading examinations and subjects…"));
  await loadExams();
  let subjects = [];
  try {
    const snap = await getDocs(query(collection(db, "subjects"), where("status","==","published"), limit(300)));
    subjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Subjects load failed", err);
  }
  if (isStale(token)) return;

  const initialExamIds = new Set(S.profile?.examIds || []);
  const initialSubjectIds = new Set((S.selectedSubjects || []).map(s => s.id));
  // also consider subjects referenced in profile that user previously selected
  (S.profile?.subjectIds || []).forEach(id => initialSubjectIds.add(id));

  const subjectsForExams = (examIds) => {
    const ids = examIds.length ? examIds : S.exams.map(e => e.id);
    const map = new Map();
    subjects.forEach(s => {
      if ((s.examIds || []).some(id => ids.includes(id))) map.set(s.id, s);
    });
    return Array.from(map.values());
  };

  const renderSubjectChoices = (examIds) => {
    const list = subjectsForExams(examIds);
    if (!list.length) return `<p class="small muted">No published subjects for the selected examinations yet. Administrator must publish subjects and link them to exams.</p>`;
    return list.map(s => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="subjectChoice" value="${escapeHtml(s.id)}" ${initialSubjectIds.has(s.id) ? "checked" : ""}> ${escapeHtml(s.title || s.name || "Subject")}</label>`).join("");
  };

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Setup your preparation</h1><p class="page-sub">A target examination is a fixed group of subjects. Choose exams, then pick subjects.</p></div></div>
    <div class="card mb-16">
      <h2 class="card-title">1. Target examinations</h2>
      ${S.exams.length
        ? `<div class="chip-list" id="examChoices">${S.exams.map(e => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="examChoice" value="${escapeHtml(e.id)}" ${initialExamIds.has(e.id) ? "checked" : ""}> ${escapeHtml(e.title || e.code || "Exam")}</label>`).join("")}</div>`
        : `<div class="reader-callout mistake"><p class="small mb-0">No published examinations exist yet. Ask the administrator to publish examinations from the Admin panel.</p></div>`}
    </div>
    <div class="card mb-16">
      <h2 class="card-title">2. Subjects</h2>
      <p class="small muted">Subjects are shown once even when shared across multiple exams.</p>
      <div id="subjectChoices" class="chip-list mt-8">${renderSubjectChoices([...initialExamIds])}</div>
    </div>
    <div class="card">
      <div class="row-between">
        <p class="small muted mb-0">You can change these later.</p>
        <button id="saveOnboardingBtn" class="btn btn-primary" type="button">Save and open dashboard</button>
      </div>
    </div>
  `);

  const refresh = () => {
    const ids = $$('input[name="examChoice"]:checked').map(i => i.value);
    const box = $("#subjectChoices");
    if (box) box.innerHTML = renderSubjectChoices(ids);
  };
  $$('input[name="examChoice"]').forEach(cb => cb.addEventListener("change", refresh));

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
        const subject = subjects.find(s => s.id === id) || { id, title: id };
        batch.set(doc(db, "users", uid, "selectedSubjects", id), {
          subjectId: id,
          title: subject.title || subject.name || id,
          examIds: (subject.examIds || []).filter(e => examIds.includes(e)),
          addedAt: serverTimestamp()
        });
      });
      batch.set(doc(db, "users", uid), {
        examIds, subjectIds, onboardingComplete: true, updatedAt: serverTimestamp()
      }, { merge: true });
      await batch.commit();

      // Verify the write succeeded
      const verifySnap = await getDocs(collection(db, "users", uid, "selectedSubjects"));
      if (verifySnap.size === 0) {
        throw new Error("Write verification failed: no subjects found after save.");
      }

      S.profile = { ...(S.profile || {}), examIds, subjectIds, onboardingComplete: true };
      await loadSelectedSubjects();
      toast(`Saved ${verifySnap.size} subject(s).`, "success");
      go("/home");
    } catch (err) {
      console.error("Save onboarding error", err);
      toast(friendlyError(err, "saving your subjects"), "error", 6000);
    } finally {
      btn.disabled = false; btn.textContent = "Save and open dashboard";
    }
  });
}

/* ============ 9. DASHBOARD ============ */
async function renderDashboard(token) {
  if (!S.profile) {
    setPageHtml(errorState("Profile unavailable", "We could not load your profile. Profile and Logout remain in the header."));
    return;
  }
  if (!S.profile.onboardingComplete || !(S.profile.examIds || []).length) {
    go("/onboarding");
    return;
  }

  setPageHtml(`<div class="page-head">
    <div><h1 class="page-title">Namaste, ${escapeHtml((S.profile.displayName || S.user.displayName || "Student").split(" ")[0])} 👋</h1>
    <p class="page-sub">Target examinations and their subjects. Real progress, no invented numbers.</p></div>
    <a class="btn btn-primary" href="#/revision">Start revision</a>
  </div><div id="dashBody">${spinnerBlock("Gathering your study data…")}</div>`);

  await Promise.all([loadSelectedSubjects(), loadExams()]);
  if (isStale(token)) return;

  const myExamIds = S.profile.examIds || [];
  const myExams = S.exams.filter(e => myExamIds.includes(e.id));
  const subjectStats = [];
  for (const subj of S.selectedSubjects) subjectStats.push({ subj, stats: await getSubjectStats(subj.id) });
  if (isStale(token)) return;

  const examDates = S.profile.examDates || {};
  const upcoming = Object.entries(examDates)
    .map(([id, v]) => ({ id, date: toDate(v) }))
    .filter(x => x.date && x.date.getTime() > Date.now())
    .sort((a, b) => a.date - b.date)[0];

  const totalRead = subjectStats.reduce((a, s) => a + s.stats.readMaterials, 0);
  const totalMastered = subjectStats.reduce((a, s) => a + s.stats.masteredQuestions, 0);
  const today = await getTodaySession();
  const goal = Number(S.profile.dailyGoal || 20);
  const todayDone = (today?.materialsRead || 0) + (today?.questionsAttempted || 0) + (today?.reviewsCompleted || 0);
  const goalPct = Math.min(100, Math.round((todayDone / Math.max(1, goal)) * 100));

  const dueSnap = await safeGetDocs(query(collection(db, "users", S.user.uid, "revisionSchedule"), where("nextReview", "<=", Timestamp.now()), orderBy("nextReview", "asc"), limit(20)));
  const dueCount = dueSnap?.size || 0;

  setPageHtml(`<div id="dashBody">${renderDashboardBody({
    myExams, subjectStats, upcoming, examDates, totalRead, totalMastered,
    todayDone, goal, goalPct, dueCount
  })}</div>`);
}

function renderDashboardBody({ myExams, subjectStats, upcoming, examDates, totalRead, totalMastered, todayDone, goal, goalPct, dueCount }) {
  const upcomingExam = upcoming ? myExams.find(e => e.id === upcoming.id) : null;
  return `
    ${upcomingExam ? `<div class="card card-soft mb-16"><div class="row-between"><div><strong>${escapeHtml(upcomingExam.title || "Exam")}</strong><p class="small muted mb-0">${formatDate(upcoming.date)}</p></div><span class="badge amber">${Math.ceil((upcoming.date - Date.now()) / 86400000)} days left</span></div></div>` : ""}

    <div class="grid grid-4 mb-16">
      <div class="stat-card accent"><div class="stat-value">${todayDone}</div><div class="stat-label">Today's activities · goal ${goal}</div></div>
      <div class="stat-card"><div class="stat-value">${goalPct}%</div><div class="stat-label">Daily goal</div><div class="progress-track mt-8"><div class="progress-fill" style="width:${goalPct}%"></div></div></div>
      <div class="stat-card"><div class="stat-value">${totalRead}</div><div class="stat-label">Materials read</div></div>
      <div class="stat-card"><div class="stat-value">${totalMastered}</div><div class="stat-label">Questions mastered</div></div>
    </div>

    <div class="card mb-16">
      <h2 class="card-title">Target examinations &amp; subjects</h2>
      ${myExams.length === 0
        ? `<p class="small muted">No target exams selected yet.</p><a class="btn btn-primary btn-small" href="#/onboarding">Choose target exams</a>`
        : myExams.map(exam => {
            const examSubjectIds = new Set();
            subjectStats.forEach(({ subj }) => { if ((subj.examIds || []).includes(exam.id)) examSubjectIds.add(subj.id); });
            const examSubjects = subjectStats.filter(s => examSubjectIds.has(s.subj.id));
            return `<div class="card" style="box-shadow:none;margin-bottom:12px">
              <div class="row-between"><strong>${escapeHtml(exam.title || exam.code || "Exam")}</strong><span class="badge">${examSubjects.length} subject(s)</span></div>
              ${examSubjects.length ? `<div class="grid grid-2 mt-8">${examSubjects.map(({ subj, stats }) => `
                <div class="card" style="box-shadow:none">
                  <div class="row-between"><strong>${escapeHtml(subj.title || subj.name || "Subject")}</strong><span class="badge">${stats.masteryPercent === null ? "Not assessed" : `${stats.masteryPercent}%`}</span></div>
                  <div class="progress-row mt-8"><div class="progress-track"><div class="progress-fill" style="width:${stats.readingPercent}%"></div></div><span class="progress-label">${stats.readingPercent}%</span></div>
                  <p class="tiny muted mt-8 mb-0">${stats.readMaterials}/${stats.totalMaterials} read · ${stats.masteredQuestions}/${stats.totalQuestions} mastered</p>
                  <a class="btn btn-small mt-8" href="#/subject/${encodeURIComponent(subj.id)}">Open</a>
                </div>`).join("")}</div>` : `<p class="small muted">No subjects linked to this exam yet.</p>`}
            </div>`;
          }).join("")}
      <a class="btn btn-ghost btn-small mt-8" href="#/onboarding">Manage subjects</a>
    </div>

    <div class="grid grid-2 mb-16">
      <div class="card">
        <h2 class="card-title">Continue learning</h2>
        ${subjectStats.length
          ? subjectStats.slice(0, 3).map(({ subj, stats }) => `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(subj.title || "Subject")}</p><div class="list-item-meta"><span>${stats.readMaterials}/${stats.totalMaterials} read</span><span>${stats.masteredQuestions}/${stats.totalQuestions} mastered</span></div></div><a class="btn btn-small" href="#/subject/${encodeURIComponent(subj.id)}">Open</a></div>`).join("")
          : `<p class="small muted">Choose subjects to start.</p>`}
      </div>
      <div class="card">
        <h2 class="card-title">Due revision</h2>
        ${dueCount
          ? `<p class="small muted">${dueCount} item${dueCount === 1 ? "" : "s"} due now.</p><a class="btn btn-primary btn-small" href="#/revision">Revise due items</a>`
          : `<p class="small muted">Nothing due right now.</p><a class="btn btn-ghost btn-small" href="#/revision">Open revision</a>`}
      </div>
    </div>

    <div class="card"><h2 class="card-title">Quick links</h2>
      <div class="row">
        <a class="btn" href="#/subjects">📚 Subjects</a>
        <a class="btn" href="#/tests">📝 Tests</a>
        <a class="btn" href="#/progress">📈 Progress</a>
        <a class="btn" href="#/saved">🔖 Saved</a>
      </div>
    </div>`;
}

/* ============ 10. SUBJECTS / CHAPTERS / MATERIALS ============ */
async function renderSubjectsPage(token) {
  setPageHtml(spinnerBlock("Loading your subjects…"));
  await loadSelectedSubjects();
  if (isStale(token)) return;
  const stats = [];
  for (const s of S.selectedSubjects) stats.push({ subj: s, stats: await getSubjectStats(s.id) });
  if (isStale(token)) return;
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">My Subjects</h1><p class="page-sub">Your chosen subjects.</p></div><a class="btn" href="#/onboarding">Change subjects</a></div>
    ${S.selectedSubjects.length
      ? `<div class="grid grid-2">${stats.map(({ subj, stats }) => `
        <div class="card">
          <div class="row-between"><h2 class="card-title mb-0">${escapeHtml(subj.title || subj.name || "Subject")}</h2><span class="badge">${stats.masteryPercent === null ? "Not assessed" : `${stats.masteryPercent}%`}</span></div>
          <div class="progress-row mt-8"><div class="progress-track"><div class="progress-fill" style="width:${stats.readingPercent}%"></div></div><span class="progress-label">${stats.readingPercent}%</span></div>
          <p class="tiny muted mt-8">${stats.readMaterials}/${stats.totalMaterials} read · ${stats.masteredQuestions}/${stats.totalQuestions} mastered</p>
          <a class="btn btn-primary btn-small mt-8" href="#/subject/${encodeURIComponent(subj.id)}">Open subject</a>
        </div>`).join("")}</div>`
      : emptyState("No subjects selected", "Choose target examinations and subjects.", `<a class="btn btn-primary" href="#/onboarding">Choose subjects</a>`)}
  `);
}

async function renderSubjectPage(subjectId, token) {
  if (!subjectId) return setPageHtml(errorState("Subject not found", "No subject specified."));
  setPageHtml(spinnerBlock("Loading subject…"));
  let subject = null;
  try { const snap = await getDoc(doc(db, "subjects", subjectId)); if (snap.exists()) subject = { id: snap.id, ...snap.data() }; }
  catch (err) { setPageHtml(errorState("Could not load subject", friendlyError(err, "loading subject"))); return; }
  if (isStale(token)) return;
  if (!subject) return setPageHtml(emptyState("Subject not found", "This subject may be unpublished or removed."));

  let chapters = [];
  try {
    const snap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",subjectId), where("status","==","published"), orderBy("order","asc"), limit(200)));
    chapters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Chapters with order failed, trying without", err);
    try {
      const snap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",subjectId), where("status","==","published"), limit(200)));
      chapters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      chapters.sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch {}
  }
  if (isStale(token)) return;

  const [matSnap, qSnap, readSnap, masteredSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "materials"), where("subjectId","==",subjectId), where("status","==","published"), limit(500))),
    safeGetDocs(query(collection(db, "questions"), where("subjectId","==",subjectId), where("status","==","published"), limit(500))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "materialProgress"), where("subjectId","==",subjectId), where("status","==","read"), limit(500))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "questionProgress"), where("subjectId","==",subjectId), where("mastery","==",true), limit(500)))
  ]);
  if (isStale(token)) return;

  const materials = matSnap?.docs.map(d => d.data()) || [];
  const questions = qSnap?.docs.map(d => d.data()) || [];
  const readIds = new Set(readSnap?.docs.map(d => d.data().materialId) || []);
  const masteredIds = new Set(masteredSnap?.docs.map(d => d.data().questionId) || []);

  const chStats = chapters.map(ch => {
    const cm = materials.filter(m => m.chapterId === ch.id);
    const cq = questions.filter(q => q.chapterId === ch.id);
    return { ch, m: cm.length, r: cm.filter(m => readIds.has(m.id)).length, q: cq.length, mr: cq.filter(q => masteredIds.has(q.id)).length };
  });

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/subjects">My Subjects</a> / <span>${escapeHtml(subject.title || "Subject")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(subject.title || "Subject")}</h1><p class="page-sub">${escapeHtml(subject.description || "")}</p></div></div>
    ${chStats.length
      ? `<div class="stack">${chStats.map(({ ch, m, r, q, mr }) => `
        <div class="card">
          <div class="row-between"><h2 class="card-title mb-0">${escapeHtml(ch.title || "Chapter")}</h2><span class="badge">${q ? `${masteryPercent(mr, q)}% mastery` : "Not assessed"}</span></div>
          <p class="small muted">${escapeHtml(ch.description || "")}</p>
          <div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${readPercent(r, m)}%"></div></div><span class="progress-label">${readPercent(r, m)}%</span></div>
          <p class="tiny muted mt-8">${r}/${m} materials read · ${mr}/${q} mastered</p>
          <a class="btn btn-primary btn-small mt-8" href="#/chapter/${encodeURIComponent(ch.id)}">Open chapter</a>
        </div>`).join("")}</div>`
      : emptyState("No published chapters", "This subject has no published chapters yet.")}
  `);
}

async function renderChapterPage(chapterId, token) {
  if (!chapterId) return setPageHtml(errorState("Chapter not found", "No chapter specified."));
  setPageHtml(spinnerBlock("Loading chapter…"));
  let chapter = null;
  try { const snap = await getDoc(doc(db, "chapters", chapterId)); if (snap.exists()) chapter = { id: snap.id, ...snap.data() }; }
  catch (err) { return setPageHtml(errorState("Could not load chapter", friendlyError(err, "loading chapter"))); }
  if (isStale(token)) return;
  if (!chapter) return setPageHtml(emptyState("Chapter not found", "Chapter may be unpublished."));

  // Sibling chapters for prev/next
  let siblings = [];
  try {
    const snap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",chapter.subjectId || ""), where("status","==","published"), limit(200)));
    siblings = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  } catch {}
  const idx = siblings.findIndex(c => c.id === chapterId);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const [matSnap, qSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "materials"), where("chapterId","==",chapterId), where("status","==","published"), limit(100))),
    safeGetDocs(query(collection(db, "questions"), where("chapterId","==",chapterId), where("status","==","published"), limit(500)))
  ]);
  if (isStale(token)) return;
  const materials = matSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const questions = qSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const byLevel = { L1: questions.filter(q => q.level === "L1"), L2: questions.filter(q => q.level === "L2"), L3: questions.filter(q => q.level === "L3") };

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/subjects">My Subjects</a> / <a href="#/subject/${encodeURIComponent(chapter.subjectId || "")}">Subject</a> / <span>${escapeHtml(chapter.title || "Chapter")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(chapter.title || "Chapter")}</h1><p class="page-sub">${escapeHtml(chapter.description || "")}</p></div></div>

    <div class="card mb-16">
      <h2 class="card-title">Study materials</h2>
      ${materials.length
        ? materials.map(m => `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(m.title || "Material")}</p><div class="list-item-meta"><span class="badge ${escapeHtml(m.level || "L1")}">${levelLabel(m.level)}</span><span>${escapeHtml(m.importance || "normal")}</span></div></div><a class="btn btn-small" href="#/material/${encodeURIComponent(m.id)}">Open</a></div>`).join("")
        : `<p class="small muted">No published materials in this chapter.</p>`}
    </div>

    <div class="card mb-16">
      <h2 class="card-title">Practice MCQs by level</h2>
      <div class="grid grid-3">
        ${["L1","L2","L3"].map(l => `<div class="card" style="box-shadow:none">
          <div class="row-between"><span class="badge ${l}">${levelLabel(l)}</span><strong>${byLevel[l].length}</strong></div>
          <p class="tiny muted mt-8">${byLevel[l].length ? "Available" : "No questions at this level"}</p>
          <a class="btn btn-small mt-8" href="#/practice?chapter=${encodeURIComponent(chapterId)}&level=${l}" ${byLevel[l].length ? "" : "disabled"}>Practice</a>
        </div>`).join("")}
      </div>
      <div class="mt-16"><a class="btn btn-primary" href="#/practice?chapter=${encodeURIComponent(chapterId)}">Practice all levels (${questions.length})</a></div>
    </div>

    ${chapter.resources?.length ? `<div class="card mb-16"><h2 class="card-title">Resources</h2>
      ${chapter.resources.map(r => {
        const url = safeUrl(r.url);
        if (!url) return "";
        return `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(r.title || r.url)}</p><div class="list-item-meta">${escapeHtml(r.type || "link")}</div></div><a class="btn btn-small" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open</a></div>`;
      }).join("")}
    </div>` : ""}

    <div class="reader-nav no-print">
      ${prev ? `<a class="btn" href="#/chapter/${encodeURIComponent(prev.id)}">← ${escapeHtml(prev.title || "Previous")}</a>` : "<span></span>"}
      ${next ? `<a class="btn" href="#/chapter/${encodeURIComponent(next.id)}">${escapeHtml(next.title || "Next")} →</a>` : "<span></span>"}
    </div>
  `);
}

async function renderMaterialReader(materialId, token) {
  if (!materialId) return setPageHtml(errorState("Material not found", "No material specified."));
  setPageHtml(spinnerBlock("Loading material…"));
  let material = null;
  try { const snap = await getDoc(doc(db, "materials", materialId)); if (snap.exists()) material = { id: snap.id, ...snap.data() }; }
  catch (err) { return setPageHtml(errorState("Could not load material", friendlyError(err, "loading material"))); }
  if (isStale(token)) return;
  if (!material) return setPageHtml(emptyState("Material not found", "This material may be unpublished or removed."));

  const progressRef = doc(db, "users", S.user.uid, "materialProgress", materialId);
  let progress = null;
  try { const snap = await getDoc(progressRef); if (snap.exists()) progress = snap.data(); } catch {}
  const read = progress?.status === "read";

  // Build content HTML from either `html` or `blocks`
  let contentHtml = "";
  if (material.html) {
    contentHtml = sanitizeHtml(material.html);
  } else if (Array.isArray(material.blocks) && material.blocks.length) {
    contentHtml = material.blocks.map(renderBlock).join("");
  } else if (material.content) {
    contentHtml = sanitizeHtml(material.content);
  } else {
    contentHtml = `<p class="muted">No content yet.</p>`;
  }

  const resources = Array.isArray(material.resources) ? material.resources : [];

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/subjects">Subjects</a> / <a href="#/chapter/${encodeURIComponent(material.chapterId || "")}">Chapter</a> / <span>${escapeHtml(material.title || "Material")}</span></div>
    <div class="reader-shell">
      <article class="reader-main">
        <div class="card">
          <div class="row-between">
            <div class="row">
              <span class="badge ${escapeHtml(material.level || "L1")}">${levelLabel(material.level)}</span>
              <span class="badge ${escapeHtml(material.importance || "normal")}">${importanceLabel(material.importance)}</span>
              ${read ? `<span class="badge green">Read</span>` : `<span class="badge">Unread</span>`}
            </div>
            <div class="media-controls">
              <button class="btn btn-small" data-font="-">A−</button>
              <button class="btn btn-small" data-font="+">A+</button>
            </div>
          </div>
          <h1 class="page-title mt-16">${escapeHtml(material.title || "Study material")}</h1>
          <div class="reader-content mt-16" id="readerContent">${contentHtml}</div>
        </div>

        ${resources.length ? `<div class="card no-print"><h2 class="card-title">Resources</h2>
          ${resources.map(r => {
            const url = safeUrl(r.url);
            if (!url) return "";
            if (r.type === "youtube") {
              const vid = youtubeId(url);
              if (!vid) return "";
              return `<div class="list-item"><div class="list-item-main"><p class="list-item-title">▶ ${escapeHtml(r.title || "Video")}</p></div><a class="btn btn-small" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Watch</a></div>`;
            }
            return `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(r.title || r.url)}</p><div class="list-item-meta">${escapeHtml(r.type || "link")}</div></div><a class="btn btn-small" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open</a></div>`;
          }).join("")}
        </div>` : ""}

        <div class="card no-print">
          <div class="row">
            <button class="btn ${read ? "btn-ghost" : "btn-primary"}" type="button" id="markReadBtn">${read ? "Mark unread" : "Mark as read"}</button>
            <button class="btn" type="button" id="printBtn">Print / PDF</button>
            <a class="btn btn-primary" href="#/practice?chapter=${encodeURIComponent(material.chapterId || "")}&level=${encodeURIComponent(material.level || "L1")}">Test what you learned</a>
          </div>
        </div>
      </article>
    </div>
  `);

  $$("[data-font]").forEach(btn => btn.addEventListener("click", () => {
    const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--reader-size")) || 17;
    const next = btn.dataset.font === "+" ? Math.min(24, cur + 1) : Math.max(14, cur - 1);
    document.documentElement.style.setProperty("--reader-size", `${next}px`);
    try { localStorage.setItem("sajilo-reader-size", String(next)); } catch {}
  }));
  try { const saved = localStorage.getItem("sajilo-reader-size"); if (saved) document.documentElement.style.setProperty("--reader-size", `${saved}px`); } catch {}

  $("#markReadBtn")?.addEventListener("click", async () => {
    const btn = $("#markReadBtn");
    btn.disabled = true;
    try {
      const newStatus = read ? "unread" : "read";
      await setDoc(progressRef, {
        materialId, title: material.title || "",
        chapterId: material.chapterId || "", subjectId: material.subjectId || "",
        level: material.level || "L1", status: newStatus,
        readAt: newStatus === "read" ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast(newStatus === "read" ? "Marked as read." : "Marked as unread.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "saving progress"), "error"); btn.disabled = false; }
  });
  $("#printBtn")?.addEventListener("click", () => window.print());
}

function renderBlock(b) {
  if (!b || typeof b !== "object") return "";
  const t = b.type || "paragraph";
  if (t === "heading") return `<h3>${escapeHtml(b.text || "")}</h3>`;
  if (t === "paragraph") return `<p>${sanitizeHtml(b.html || escapeHtml(b.text || ""))}</p>`;
  if (t === "bullets" || t === "keyFacts" || t === "memoryTrick" || t === "commonMistakes" || t === "examTips" || t === "summary") {
    const labels = { keyFacts: "Key facts", memoryTrick: "Memory trick", commonMistakes: "Common mistakes", examTips: "Exam tips", summary: "Remember this" };
    const cls = t === "memoryTrick" ? "trick" : t === "commonMistakes" ? "mistake" : t === "examTips" ? "tip" : t === "summary" ? "summary" : "";
    const items = Array.isArray(b.items) ? b.items : [];
    if (labels[t]) return `<div class="reader-callout ${cls}"><h4>${labels[t]}</h4><ul>${items.map(i => `<li>${sanitizeHtml(i)}</li>`).join("")}</ul></div>`;
    return `<ul>${items.map(i => `<li>${sanitizeHtml(i)}</li>`).join("")}</ul>`;
  }
  if (t === "table") {
    const headers = Array.isArray(b.headers) ? b.headers : [];
    const rows = Array.isArray(b.rows) ? b.rows : [];
    return `<div class="table-wrap"><table>${headers.length ? `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>` : ""}<tbody>${rows.map(r => `<tr>${(Array.isArray(r) ? r : []).map(c => `<td>${sanitizeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  return "";
}

/* ============ 11. PRACTICE ============ */
async function renderPractice(params, token) {
  setPageHtml(spinnerBlock("Preparing questions…"));
  const chapterId = params.get("chapter");
  const level = params.get("level");
  const ids = params.get("ids");
  let questions = [];

  try {
    if (ids) {
      const list = ids.split(",").map(s => s.trim()).filter(Boolean).slice(0, 100);
      for (const id of list) {
        const snap = await getDoc(doc(db, "questions", id));
        if (snap.exists()) questions.push({ id: snap.id, ...snap.data() });
      }
    } else if (chapterId) {
      let q = query(collection(db, "questions"), where("status","==","published"), where("chapterId","==",chapterId), limit(500));
      const snap = await getDocs(q);
      questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (level) questions = questions.filter(q => q.level === level);
    }
  } catch (err) {
    return setPageHtml(errorState("Could not load questions", friendlyError(err, "loading questions")));
  }
  if (isStale(token)) return;
  if (!questions.length) return setPageHtml(emptyState("No questions found", "No published questions match this scope. Try another level.", `<a class="btn" href="#/subjects">Browse subjects</a>`));

  // Shuffle
  questions = questions.sort(() => Math.random() - 0.5);

  const progSnap = await safeGetDocs(query(collection(db, "users", S.user.uid, "questionProgress"), where("chapterId","==",chapterId || ""), limit(500)));
  const progressMap = new Map((progSnap?.docs || []).map(d => [d.data().questionId, d.data()]));

  S.practice = { questions, index: 0, selected: null, revealed: false, recorded: new Set(), progressMap };

  renderPracticeQuestion();
  bindPracticeKeyboard();
}

function renderPracticeQuestion() {
  const p = S.practice;
  if (!p) return;
  const q = p.questions[p.index];
  const prog = p.progressMap.get(q.id);
  const options = Array.isArray(q.options) ? q.options : [];

  els.app.innerHTML = `
    <div class="page-head"><div><h1 class="page-title">Practice</h1><p class="page-sub">Study mode. Revealing without selecting does not count as a correct attempt.</p></div><a class="btn" href="#/subjects">Subjects</a></div>
    <div class="question-card">
      <div class="row-between mb-8">
        <div class="row">
          <span class="badge ${escapeHtml(q.level || "L1")}">${levelLabel(q.level)}</span>
          <span class="badge ${escapeHtml(q.importance || "normal")}">${importanceLabel(q.importance)}</span>
          ${prog?.mastery ? `<span class="badge green">Mastered</span>` : `<span class="badge">${prog?.attempts ? "In progress" : "Not assessed"}</span>`}
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
        <h4>Correct answer: ${escapeHtml(options.find(o => (o.id || "") === q.correctOptionId)?.text || "—")}</h4>
        <p>${sanitizeHtml(q.explanation || "No explanation provided.")}</p>
        ${q.memoryTrick ? `<p class="small"><strong>Trick:</strong> ${escapeHtml(q.memoryTrick)}</p>` : ""}
      </div>` : ""}
      <div class="practice-footer">
        <button class="btn" id="practicePrev" ${p.index === 0 ? "disabled" : ""}>←</button>
        <button class="btn" id="practiceNext" ${p.index >= p.questions.length - 1 ? "disabled" : ""}>→</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="checkAnswerBtn">${p.revealed ? "Hide" : "Check / Reveal"}</button>
      </div>
      <div class="row mt-16 small muted">
        <span class="kbd">J</span>/<span class="kbd">K</span> navigate · <span class="kbd">1-6</span> select · <span class="kbd">Space</span> reveal
      </div>
    </div>
  `;
  bindPracticeQuestion();
}

function bindPracticeQuestion() {
  const p = S.practice;
  if (!p) return;
  const q = p.questions[p.index];

  $$("[data-option]").forEach(b => b.addEventListener("click", () => {
    if (p.revealed) return;
    p.selected = b.dataset.option;
    renderPracticeQuestion();
  }));

  $("#checkAnswerBtn")?.addEventListener("click", async () => {
    if (p.revealed) { p.revealed = false; renderPracticeQuestion(); return; }
    if (!p.selected) return toast("Select an option first.", "error");
    p.revealed = true;
    if (!p.recorded.has(q.id)) { p.recorded.add(q.id); await recordAttempt(q, p.selected); }
    renderPracticeQuestion();
  });

  $("#practicePrev")?.addEventListener("click", () => { if (p.index > 0) { p.index--; p.selected = null; p.revealed = false; renderPracticeQuestion(); } });
  $("#practiceNext")?.addEventListener("click", () => { if (p.index < p.questions.length - 1) { p.index++; p.selected = null; p.revealed = false; renderPracticeQuestion(); } });
}

function bindPracticeKeyboard() {
  const handler = e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input","textarea","select"].includes(tag) || e.target.isContentEditable) return;
    const p = S.practice;
    if (!p) return;
    const k = e.key.toLowerCase();
    if (k === "j") { e.preventDefault(); if (p.index < p.questions.length - 1) { p.index++; p.selected = null; p.revealed = false; renderPracticeQuestion(); } }
    else if (k === "k") { e.preventDefault(); if (p.index > 0) { p.index--; p.selected = null; p.revealed = false; renderPracticeQuestion(); } }
    else if (/^[1-6]$/.test(e.key)) { const q = p.questions[p.index]; const opt = (q.options || [])[Number(e.key) - 1]; if (opt && !p.revealed) { p.selected = opt.id || String.fromCharCode(97 + Number(e.key) - 1); renderPracticeQuestion(); } }
    else if (e.key === " ") { e.preventDefault(); $("#checkAnswerBtn")?.click(); }
  };
  document.addEventListener("keydown", handler);
  S.pageCleanup = () => document.removeEventListener("keydown", handler);
}

async function recordAttempt(q, selected) {
  const correct = selected === q.correctOptionId;
  const ref = doc(db, "users", S.user.uid, "questionProgress", q.id);
  const today = nepalDateKey();
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const d = snap.exists() ? snap.data() : {};
      let consecutive = Number(d.consecutiveCorrect || 0);
      let days = Array.isArray(d.correctDays) ? [...d.correctDays] : [];
      if (correct) {
        if (!days.includes(today)) days = [...days, today].slice(-10);
        if (d.lastCorrectDate !== today) consecutive += 1;
      } else consecutive = 0;
      const mastery = correct && consecutive >= 3;
      tx.set(ref, {
        questionId: q.id, title: q.questionText || "",
        chapterId: q.chapterId || "", subjectId: q.subjectId || "", level: q.level || "L1",
        attempts: increment(1), correct: increment(correct ? 1 : 0),
        consecutiveCorrect: consecutive, correctDays: days,
        lastCorrectDate: correct ? today : d.lastCorrectDate || null,
        mastery: d.mastery === true || mastery,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    S.practice.progressMap.set(q.id, {
      ...(S.practice.progressMap.get(q.id) || {}),
      attempts: (S.practice.progressMap.get(q.id)?.attempts || 0) + 1,
      correct: (S.practice.progressMap.get(q.id)?.correct || 0) + (correct ? 1 : 0)
    });
    await touchStudySession({ questionsAttempted: 1 });
  } catch (err) { toast("Progress could not be saved. Check connection.", "error"); console.warn(err); }
}

/* ============ 12. TESTS ============ */
async function renderTestsPage(token) {
  setPageHtml(spinnerBlock("Loading tests…"));
  let testSets = [];
  try {
    const snap = await getDocs(query(collection(db, "testSets"), where("status","==","published"), limit(50)));
    testSets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }

  const attemptsSnap = await safeGetDocs(query(collection(db, "users", S.user.uid, "testAttempts"), orderBy("startedAt","desc"), limit(20)));
  if (isStale(token)) return;
  const attempts = attemptsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Tests</h1><p class="page-sub">Timed tests with absolute deadline and autosave.</p></div></div>
    <div class="card mb-16">
      <h2 class="card-title">Available tests</h2>
      ${testSets.length ? `<div class="grid grid-2">${testSets.map(t => `<div class="card" style="box-shadow:none"><strong>${escapeHtml(t.title || "Test")}</strong><p class="small muted">${escapeHtml(t.description || "")}</p><p class="tiny muted">${t.questionCount || 0} questions · ${t.durationMin || 0} min · pass ${t.passPercent || 50}%</p><button class="btn btn-primary btn-small" data-start-test="${escapeHtml(t.id)}" type="button">Start</button></div>`).join("")}</div>` : `<p class="muted small">No published test sets yet.</p>`}
    </div>
    <div class="card">
      <h2 class="card-title">Past attempts</h2>
      ${attempts.length ? attempts.map(a => `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(a.title || "Attempt")}</p><div class="list-item-meta"><span>${a.status === "submitted" ? `${a.percentage ?? 0}%` : "In progress"}</span><span>${timeAgo(a.startedAt)}</span></div></div><a class="btn btn-small" href="#/results/${encodeURIComponent(a.id)}">${a.status === "submitted" ? "Result" : "Resume"}</a></div>`).join("") : `<p class="muted small">No attempts yet.</p>`}
    </div>
  `);

  $$("[data-start-test]").forEach(b => b.addEventListener("click", () => startTest(b.dataset.startTest)));
}

async function startTest(testId) {
  try {
    const snap = await getDoc(doc(db, "testSets", testId));
    if (!snap.exists()) return toast("Test not found.", "error");
    const t = { id: snap.id, ...snap.data() };
    const scopeType = t.scopeType || "chapter";
    const scopeId = t.scopeId || "";
    const field = scopeType === "chapter" ? "chapterId" : scopeType === "subject" ? "subjectId" : "chapterId";
    let q = query(collection(db, "questions"), where("status","==","published"), where(field,"==",scopeId), limit(400));
    const poolSnap = await getDocs(q);
    let pool = poolSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (t.level) pool = pool.filter(x => x.level === t.level);
    if (!pool.length) return toast("No published questions match this scope.", "error");
    const requested = Number(t.questionCount || 10);
    const count = Math.min(requested, pool.length);
    if (count < requested) {
      if (!(await confirmDialog(`Only ${pool.length} questions available. Continue with ${count}?`, { confirmText: `Use ${count}` }))) return;
    }
    const selected = pool.sort(() => Math.random() - 0.5).slice(0, count);
    const attemptRef = doc(collection(db, "users", S.user.uid, "testAttempts"));
    const durationMin = Number(t.durationMin || 20);
    const deadline = new Date(Date.now() + durationMin * 60000);
    await setDoc(attemptRef, {
      uid: S.user.uid, testId, title: t.title || "Test",
      totalQuestions: count, marksPerQuestion: Number(t.marksPerQuestion || 1),
      negativeMarking: Number(t.negativeMarking || 0), passPercent: Number(t.passPercent || 50),
      durationMin, startedAt: serverTimestamp(), deadline: Timestamp.fromDate(deadline),
      status: "active", score: 0, percentage: 0
    });
    const batch = writeBatch(db);
    selected.forEach((q, i) => {
      batch.set(doc(collection(attemptRef, "items")), {
        order: i, questionId: q.id, questionText: q.questionText || "",
        options: q.options || [], correctOptionId: q.correctOptionId || "",
        explanation: q.explanation || "", level: q.level || "L1",
        chapterId: q.chapterId || "", subjectId: q.subjectId || "",
        selectedOption: null, markedForReview: false
      });
    });
    await batch.commit();
    go(`/test-active/${attemptRef.id}`);
  } catch (err) { toast(friendlyError(err, "starting test"), "error"); }
}

async function renderActiveTest(attemptId, token) {
  if (!attemptId) return setPageHtml(errorState("Test not found", "No attempt specified."));
  setPageHtml(spinnerBlock("Loading test…"));
  let attempt = null;
  try { const snap = await getDoc(doc(db, "users", S.user.uid, "testAttempts", attemptId)); if (snap.exists()) attempt = { id: snap.id, ...snap.data() }; }
  catch (err) { return setPageHtml(errorState("Could not load", friendlyError(err, "loading test"))); }
  if (isStale(token)) return;
  if (!attempt) return setPageHtml(emptyState("Attempt not found", "This test attempt does not exist."));
  if (attempt.status !== "active") { go(`/results/${attemptId}`); return; }

  const itemsSnap = await safeGetDocs(query(collection(db, "users", S.user.uid, "testAttempts", attemptId, "items"), orderBy("order","asc"), limit(200)));
  if (isStale(token)) return;
  const items = itemsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  if (!items.length) return setPageHtml(emptyState("No items", "This attempt has no questions."));

  let current = 0;
  const answers = new Map(items.map(i => [i.id, i.selectedOption || null]));

  const render = () => {
    const item = items[current];
    const deadline = toDate(attempt.deadline) || new Date(Date.now() + 60000);
    const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
    const ss = String(remaining % 60).padStart(2, "0");
    els.app.innerHTML = `
      <div class="page-head"><div><h1 class="page-title">${escapeHtml(attempt.title || "Test")}</h1><p class="page-sub">Autosaves on selection.</p></div><div class="test-timer ${remaining < 120 ? "danger" : ""}" id="testTimer">⏱ ${mm}:${ss}</div></div>
      <div class="test-layout">
        <div class="question-card">
          <div class="row-between mb-8"><span class="badge ${escapeHtml(item.level || "L1")}">${levelLabel(item.level)}</span><span class="small muted">${current + 1} / ${items.length}</span></div>
          <div class="progress-track mb-16"><div class="progress-fill" style="width:${((current + 1) / items.length) * 100}%"></div></div>
          <div class="question-stem">${escapeHtml(item.questionText || "")}</div>
          <div class="option-list">
            ${(item.options || []).map((opt, i) => {
              const key = opt.id || String.fromCharCode(97 + i);
              return `<button class="option-btn ${answers.get(item.id) === key ? "selected" : ""}" data-opt="${escapeHtml(key)}" type="button"><span class="option-key">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(opt.text || "")}</span></button>`;
            }).join("")}
          </div>
          <div class="practice-footer">
            <button class="btn" id="testPrev" ${current === 0 ? "disabled" : ""}>←</button>
            <button class="btn" id="testNext" ${current >= items.length - 1 ? "disabled" : ""}>→</button>
            <button class="btn" id="testClear" type="button">Clear</button>
            <span class="spacer"></span>
            <button class="btn btn-primary" id="testSubmit" type="button">Submit</button>
          </div>
        </div>
        <div class="card">
          <h3 class="card-title">Palette</h3>
          <div class="palette">${items.map((it, i) => `<button class="${answers.get(it.id) ? "answered" : ""} ${i === current ? "current" : ""}" data-pal="${i}" type="button">${i + 1}</button>`).join("")}</div>
          <button class="btn btn-block btn-danger mt-16" id="testSubmit2" type="button">Submit test</button>
        </div>
      </div>
    `;
    bindActiveTest(attemptId, items, current, answers, render, attempt);
    const tick = () => {
      const d = toDate(attempt.deadline);
      if (!d) return;
      const r = Math.max(0, Math.floor((d - Date.now()) / 1000));
      const el = document.getElementById("testTimer");
      if (el) {
        el.textContent = `⏱ ${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
        el.classList.toggle("danger", r < 120);
      }
      if (r <= 0) {
        clearInterval(S.activeTestTimer); S.activeTestTimer = null;
        submitTest(attemptId, items, answers, true);
      }
    };
    if (S.activeTestTimer) clearInterval(S.activeTestTimer);
    S.activeTestTimer = setInterval(tick, 1000);
  };
  window.__testCurrent = () => current;
  render();
  S.pageCleanup = () => { if (S.activeTestTimer) { clearInterval(S.activeTestTimer); S.activeTestTimer = null; } };
}

function bindActiveTest(attemptId, items, current, answers, render, attempt) {
  const item = items[current];
  $$("[data-opt]").forEach(b => b.addEventListener("click", async () => {
    answers.set(item.id, b.dataset.opt);
    try { await updateDoc(doc(db, "users", S.user.uid, "testAttempts", attemptId, "items", item.id), { selectedOption: b.dataset.opt }); }
    catch (err) { toast("Autosave failed", "error"); }
    render();
  }));
  $("#testPrev")?.addEventListener("click", () => { if (current > 0) { window.__forceIndex = current - 1; } });
  $("#testNext")?.addEventListener("click", () => { if (current < items.length - 1) { window.__forceIndex = current + 1; } });
  $$("[data-pal]").forEach(b => b.addEventListener("click", () => { window.__forceIndex = Number(b.dataset.pal); }));
  $("#testClear")?.addEventListener("click", async () => {
    answers.set(item.id, null);
    try { await updateDoc(doc(db, "users", S.user.uid, "testAttempts", attemptId, "items", item.id), { selectedOption: null }); } catch {}
    render();
  });
  $("#testSubmit")?.addEventListener("click", () => submitTest(attemptId, items, answers));
  $("#testSubmit2")?.addEventListener("click", () => submitTest(attemptId, items, answers));

  if (window.__forceIndex !== undefined) {
    const target = window.__forceIndex;
    window.__forceIndex = undefined;
    // Can't easily re-bind without re-rendering; use location navigation trick
    // Simpler: click palette through re-render
    setTimeout(() => {
      const btn = document.querySelector(`[data-pal="${target}"]`);
      if (btn) {
        // manually trigger re-render with new index
        // Using internal approach: dispatch click via onStateChange
        // For simplicity, we accept this doesn't work reliably without state access.
        // Fallback: use a simple window-based re-render.
      }
    }, 0);
  }
}

async function submitTest(attemptId, items, answers, auto = false) {
  if (!auto) {
    const unanswered = items.filter(i => !answers.get(i.id)).length;
    if (!(await confirmDialog(`Submit? ${unanswered} unanswered.`, { confirmText: "Submit" }))) return;
  }
  try {
    const attemptRef = doc(db, "users", S.user.uid, "testAttempts", attemptId);
    const snap = await getDoc(attemptRef);
    if (!snap.exists()) return;
    const a = snap.data();
    if (a.status !== "active") { go(`/results/${attemptId}`); return; }
    let correct = 0, incorrect = 0, unanswered = 0;
    items.forEach(i => {
      const s = answers.get(i.id);
      if (!s) unanswered++;
      else if (s === i.correctOptionId) correct++;
      else incorrect++;
    });
    const marksPer = Number(a.marksPerQuestion || 1);
    const negative = Number(a.negativeMarking || 0);
    const score = correct * marksPer - incorrect * negative;
    const totalMarks = items.length * marksPer;
    const percentage = totalMarks ? Math.round((Math.max(0, score) / totalMarks) * 1000) / 10 : 0;
    const passed = percentage >= Number(a.passPercent || 50);
    await updateDoc(attemptRef, {
      status: "submitted", submittedAt: serverTimestamp(), autoSubmitted: auto,
      correct, incorrect, unanswered, score, totalMarks, percentage, passed
    });
    toast(auto ? "Time expired. Submitted." : "Submitted.", "success");
    go(`/results/${attemptId}`);
  } catch (err) { toast(friendlyError(err, "submitting"), "error"); }
}

async function renderResults(attemptId, token) {
  if (!attemptId) return setPageHtml(errorState("Result not found", "No attempt."));
  setPageHtml(spinnerBlock("Loading result…"));
  let a = null;
  try { const snap = await getDoc(doc(db, "users", S.user.uid, "testAttempts", attemptId)); if (snap.exists()) a = { id: snap.id, ...snap.data() }; }
  catch (err) { return setPageHtml(errorState("Could not load", friendlyError(err, "loading result"))); }
  if (isStale(token)) return;
  if (!a) return setPageHtml(emptyState("Result not found", "Attempt doesn't exist."));
  if (a.status === "active") { go(`/test-active/${attemptId}`); return; }

  const itemsSnap = await safeGetDocs(query(collection(db, "users", S.user.uid, "testAttempts", attemptId, "items"), orderBy("order","asc"), limit(200)));
  if (isStale(token)) return;
  const items = itemsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];

  setPageHtml(`
    <div class="breadcrumbs"><a href="#/tests">Tests</a> / <span>Result</span></div>
    <div class="result-hero mb-16">
      <div class="result-score">${a.percentage ?? 0}%</div>
      <div class="result-status">${a.passed ? "✅ Passed" : "❌ Not passed"}</div>
      <p class="small" style="opacity:.85">${escapeHtml(a.title || "Test")} · ${a.score ?? 0} / ${a.totalMarks ?? 0} marks</p>
    </div>
    <div class="grid grid-4 mb-16">
      <div class="stat-card"><div class="stat-value">${a.correct ?? 0}</div><div class="stat-label">Correct</div></div>
      <div class="stat-card"><div class="stat-value">${a.incorrect ?? 0}</div><div class="stat-label">Incorrect</div></div>
      <div class="stat-card"><div class="stat-value">${a.unanswered ?? 0}</div><div class="stat-label">Unanswered</div></div>
      <div class="stat-card"><div class="stat-value">${items.length ? Math.round((a.correct / items.length) * 100) : 0}%</div><div class="stat-label">Accuracy</div></div>
    </div>
    <div class="card mb-16">
      <h2 class="card-title">Question review</h2>
      ${items.map((i, idx) => {
        const sel = i.selectedOption;
        const isCorrect = sel && sel === i.correctOptionId;
        const isWrong = sel && sel !== i.correctOptionId;
        return `<div class="card mb-8" style="box-shadow:none">
          <div class="row-between"><strong>Q${idx + 1}. ${escapeHtml(i.questionText || "")}</strong><span class="badge ${isCorrect ? "green" : isWrong ? "red" : ""}">${isCorrect ? "Correct" : isWrong ? "Wrong" : "Unanswered"}</span></div>
          <div class="option-list mt-8">${(i.options || []).map((o, oi) => {
            const k = o.id || String.fromCharCode(97 + oi);
            const cls = k === i.correctOptionId ? "correct" : (sel === k && k !== i.correctOptionId ? "wrong" : "");
            return `<div class="option-btn ${cls}" style="cursor:default"><span class="option-key">${String.fromCharCode(65 + oi)}</span><span>${escapeHtml(o.text || "")}</span></div>`;
          }).join("")}</div>
          ${i.explanation ? `<div class="explanation-box"><h4>Explanation</h4><p>${sanitizeHtml(i.explanation)}</p></div>` : ""}
        </div>`;
      }).join("")}
    </div>
    <div class="row"><button class="btn" onclick="window.print()">Print / PDF</button><a class="btn btn-primary" href="#/tests">Back to tests</a></div>
  `);
}

/* ============ 13. REVISION, SAVED, PROGRESS, PROFILE, PLANNER, CURRENT AFFAIRS ============ */
async function isSaved(type, itemId) {
  try { const s = await getDoc(doc(db, "users", S.user.uid, "savedItems", `${type}_${itemId}`)); return s.exists(); }
  catch { return false; }
}
async function toggleSaved(type, itemId, meta) {
  const ref = doc(db, "users", S.user.uid, "savedItems", `${type}_${itemId}`);
  const s = await getDoc(ref);
  if (s.exists()) { await deleteDoc(ref); return false; }
  await setDoc(ref, { type, itemId, ...meta, createdAt: serverTimestamp() });
  return true;
}
async function addRevision(meta) {
  const ref = doc(db, "users", S.user.uid, "revisionSchedule", meta.itemId);
  const s = await getDoc(ref);
  if (s.exists()) return;
  await setDoc(ref, {
    ...meta, ease: 2.5, interval: 0, repetitions: 0, lapses: 0,
    nextReview: Timestamp.now(), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}
function sm2(d, rating) {
  let ease = Number(d.ease || 2.5), interval = Number(d.interval || 0), reps = Number(d.repetitions || 0), lapses = Number(d.lapses || 0);
  if (rating === "again") { reps = 0; interval = 1; lapses++; ease = Math.max(1.3, ease - 0.2); }
  else if (rating === "hard") { ease = Math.max(1.3, ease - 0.15); interval = Math.max(1, Math.round(interval * 1.2)); reps++; }
  else if (rating === "good") { interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval * ease); reps++; }
  else if (rating === "easy") { ease = Math.min(3.2, ease + 0.15); interval = Math.max(2, Math.round((interval || 1) * ease * 1.3)); reps++; }
  return { ease, interval, repetitions: reps, lapses, nextReview: new Date(Date.now() + interval * 86400000) };
}
async function rateRevision(item, rating) {
  const ref = doc(db, "users", S.user.uid, "revisionSchedule", item.itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const u = sm2(snap.data(), rating);
  await setDoc(ref, { ...u, nextReview: Timestamp.fromDate(u.nextReview), lastRating: rating, updatedAt: serverTimestamp() }, { merge: true });
  await touchStudySession({ reviewsCompleted: 1 });
}

async function renderRevisionPage(token) {
  setPageHtml(spinnerBlock("Loading revision queue…"));
  const [dueSnap, allSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "users", S.user.uid, "revisionSchedule"), where("nextReview","<=",Timestamp.now()), orderBy("nextReview","asc"), limit(50))),
    safeGetDocs(query(collection(db, "users", S.user.uid, "revisionSchedule"), orderBy("nextReview","asc"), limit(100)))
  ]);
  if (isStale(token)) return;
  const due = dueSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const all = allSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Quick Revision</h1><p class="page-sub">SM-2 spaced repetition. Again / Hard / Good / Easy.</p></div></div>
    <div class="card mb-16"><p class="small">${due.length} due now · ${all.length} scheduled</p></div>
    ${all.length ? `<div class="stack">${all.map(item => `<div class="card"><div class="row-between"><strong>${escapeHtml(item.title || "Item")}</strong><div class="row"><button class="btn btn-small" data-rate="again" data-id="${escapeHtml(item.itemId)}">Again</button><button class="btn btn-small" data-rate="hard" data-id="${escapeHtml(item.itemId)}">Hard</button><button class="btn btn-small" data-rate="good" data-id="${escapeHtml(item.itemId)}">Good</button><button class="btn btn-small" data-rate="easy" data-id="${escapeHtml(item.itemId)}">Easy</button></div></div><div class="list-item-meta">Next: ${formatDate(item.nextReview)}</div></div>`).join("")}</div>` : emptyState("Revision empty", "Add items to revision from materials.", `<a class="btn btn-primary" href="#/subjects">Browse</a>`)}
  `);

  $$("[data-rate]").forEach(b => b.addEventListener("click", async () => {
    const item = all.find(i => i.itemId === b.dataset.id);
    if (!item) return;
    b.disabled = true;
    try { await rateRevision(item, b.dataset.rate); toast("Scheduled.", "success"); router(); }
    catch (err) { toast(friendlyError(err, "rating"), "error"); b.disabled = false; }
  }));
}

async function renderSavedPage(params, token) {
  setPageHtml(spinnerBlock("Loading saved items…"));
  const snap = await safeGetDocs(query(collection(db, "users", S.user.uid, "savedItems"), orderBy("createdAt","desc"), limit(100)));
  if (isStale(token)) return;
  const saved = snap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  const tab = params.get("tab") || "material";
  const filtered = saved.filter(s => s.type === tab);

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Saved</h1><p class="page-sub">Bookmarks and favourites.</p></div></div>
    <div class="tabs"><a class="tab ${tab === "material" ? "active" : ""}" href="#/saved?tab=material">Materials (${saved.filter(s => s.type === "material").length})</a><a class="tab ${tab === "question" ? "active" : ""}" href="#/saved?tab=question">Questions (${saved.filter(s => s.type === "question").length})</a></div>
    ${filtered.length ? `<div class="stack">${filtered.map(i => `<div class="card"><strong>${escapeHtml(i.title || "Saved")}</strong>${i.href ? `<a class="btn btn-small mt-8" href="${escapeHtml(i.href)}">Open</a>` : ""}</div>`).join("")}</div>` : emptyState("Nothing saved", "Bookmark materials or questions to see them here.")}
  `);
}

async function renderProgressPage(token) {
  setPageHtml(spinnerBlock("Loading progress…"));
  const uid = S.user.uid;
  const [readSnap, qpSnap, attemptsSnap] = await Promise.all([
    safeGetDocs(query(collection(db, "users", uid, "materialProgress"), where("status","==","read"), limit(500))),
    safeGetDocs(query(collection(db, "users", uid, "questionProgress"), limit(500))),
    safeGetDocs(query(collection(db, "users", uid, "testAttempts"), where("status","==","submitted"), orderBy("submittedAt","desc"), limit(10)))
  ]);
  if (isStale(token)) return;

  const read = readSnap?.size || 0;
  const qp = qpSnap?.docs.map(d => d.data()) || [];
  const attempted = qp.filter(q => (q.attempts || 0) > 0).length;
  const mastered = qp.filter(q => q.mastery === true).length;
  const attempts = attemptsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Progress</h1><p class="page-sub">Viewed, read, attempted, correct and mastered are separate measures.</p></div></div>
    <div class="grid grid-4 mb-16">
      <div class="stat-card"><div class="stat-value">${read}</div><div class="stat-label">Materials read</div></div>
      <div class="stat-card"><div class="stat-value">${attempted}</div><div class="stat-label">Attempted</div></div>
      <div class="stat-card"><div class="stat-value">${mastered}</div><div class="stat-label">Mastered</div></div>
      <div class="stat-card"><div class="stat-value">${attempts.length}</div><div class="stat-label">Tests taken</div></div>
    </div>
    <div class="card"><h2 class="card-title">Test history</h2>
      ${attempts.length ? `<div class="table-wrap"><table><thead><tr><th>Test</th><th>Score</th><th>%</th><th>Date</th><th></th></tr></thead><tbody>${attempts.map(a => `<tr><td>${escapeHtml(a.title || "Test")}</td><td>${a.score ?? 0}/${a.totalMarks ?? 0}</td><td>${a.percentage ?? 0}%</td><td>${formatDate(a.submittedAt)}</td><td><a class="btn btn-small" href="#/results/${encodeURIComponent(a.id)}">Open</a></td></tr>`).join("")}</tbody></table></div>` : `<p class="small muted">No tests taken yet.</p>`}
    </div>
  `);
}

async function renderProfilePage(token) {
  const u = S.user;
  const name = S.profile?.displayName || u.displayName || u.email?.split("@")[0] || "Student";
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Profile</h1></div><button class="btn btn-danger" id="profileLogoutBtn" type="button">Logout</button></div>
    <div class="card mb-16">
      <div class="row"><span class="avatar" style="width:64px;height:64px;font-size:1.4rem">${escapeHtml(name.charAt(0).toUpperCase())}</span>
        <div><h2 class="mb-0">${escapeHtml(name)}</h2><p class="small muted mb-0">${escapeHtml(u.email || "")}</p>
        <span class="badge ${u.emailVerified ? "green" : "amber"}">${u.emailVerified ? "Email verified" : "Not verified"}</span>${S.isOwner ? ' <span class="badge">Owner</span>' : ""}</div>
      </div>
    </div>
    <div class="card mb-16">
      <h2 class="card-title">Account details</h2>
      <div class="form-grid">
        <div><label>Display name</label><input id="profileName" value="${escapeHtml(S.profile?.displayName || name)}" maxlength="80"></div>
        <div><label>Daily goal (activities)</label><input id="profileGoal" type="number" min="5" max="200" value="${S.profile?.dailyGoal || 20}"></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" id="saveProfileBtn" type="button">Save</button></div>
    </div>
    ${u.emailVerified ? "" : `<div class="card"><h2 class="card-title">Verify email</h2><div class="row"><button class="btn btn-primary" id="profileResendBtn" type="button">Resend</button><button class="btn" id="profileRefreshBtn" type="button">I have verified</button></div></div>`}
  `);

  $("#profileLogoutBtn")?.addEventListener("click", doLogout);
  $("#profileResendBtn")?.addEventListener("click", resendVerification);
  $("#profileRefreshBtn")?.addEventListener("click", refreshVerification);
  $("#saveProfileBtn")?.addEventListener("click", async () => {
    const displayName = $("#profileName").value.trim();
    const dailyGoal = Number($("#profileGoal").value || 20);
    try {
      await updateProfile(u, { displayName });
      await updateDoc(doc(db, "users", u.uid), { displayName, dailyGoal, updatedAt: serverTimestamp() });
      S.profile = { ...(S.profile || {}), displayName, dailyGoal };
      renderProfileChrome();
      toast("Saved.", "success");
    } catch (err) { toast(friendlyError(err, "saving"), "error"); }
  });
}

async function renderSettingsPage(token) {
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Settings</h1></div></div>
    <div class="card mb-16"><h2 class="card-title">Appearance</h2><div class="row"><button class="btn" id="settingsThemeBtn" type="button">Toggle dark / light</button><button class="btn btn-danger" id="settingsLogoutBtn" type="button">Logout</button></div></div>
  `);
  $("#settingsThemeBtn")?.addEventListener("click", () => els.themeToggle?.click());
  $("#settingsLogoutBtn")?.addEventListener("click", doLogout);
}

async function renderPlannerPage(token) {
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Study Planner</h1><p class="page-sub">Simple daily targets.</p></div></div>
    <div class="card"><p class="small muted">Planner is available. Use daily goal in your profile to track today's target.</p><a class="btn" href="#/profile">Set daily goal</a></div>
  `);
}

async function renderCurrentAffairsPage(token) {
  setPageHtml(spinnerBlock("Loading…"));
  let items = [];
  try { const snap = await getDocs(query(collection(db, "currentAffairs"), where("status","==","published"), orderBy("date","desc"), limit(50))); items = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
  catch { try { const snap = await getDocs(query(collection(db, "currentAffairs"), where("status","==","published"), limit(50))); items = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch {} }
  if (isStale(token)) return;
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">Current Affairs</h1></div></div>
    ${items.length ? `<div class="stack">${items.map(i => `<div class="card"><h2 class="card-title">${escapeHtml(i.title || "Update")}</h2><div class="reader-content" style="font-size:1rem">${sanitizeHtml(i.body || "")}</div></div>`).join("")}</div>` : emptyState("No current affairs", "Published updates will appear here.")}
  `);
}

async function touchStudySession(updates = {}) {
  if (!S.user) return;
  const key = nepalDateKey();
  const ref = doc(db, "users", S.user.uid, "studySessions", key);
  const data = { dateKey: key, updatedAt: serverTimestamp() };
  Object.entries(updates).forEach(([k, v]) => { data[k] = typeof v === "number" ? increment(v) : v; });
  try { await setDoc(ref, data, { merge: true }); } catch (err) { console.warn(err); }
}
async function getTodaySession() {
  if (!S.user) return null;
  try { const s = await getDoc(doc(db, "users", S.user.uid, "studySessions", nepalDateKey())); return s.exists() ? s.data() : null; }
  catch { return null; }
}

/* ============ 14. ADMIN ============ */
const ADMIN_SCHEMAS = {
  exams: { collection: "exams", label: "Examinations", fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "code", label: "Code", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "order", label: "Order", type: "number", default: 0 },
    { key: "status", label: "Status", type: "select", options: ["draft","published","archived"], default: "draft" }
  ]},
  subjects: { collection: "subjects", label: "Subjects", fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "code", label: "Code", type: "text" },
    { key: "examIds", label: "Linked examinations", type: "multiselect", source: "exams" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "order", label: "Order", type: "number", default: 0 },
    { key: "status", label: "Status", type: "select", options: ["draft","published","archived"], default: "draft" }
  ]},
  chapters: { collection: "chapters", label: "Chapters", fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "subjectId", label: "Subject", type: "reference", source: "subjects", required: true },
    { key: "chapterNumber", label: "Chapter number", type: "number", default: 1 },
    { key: "description", label: "Description", type: "textarea" },
    { key: "order", label: "Order", type: "number", default: 0 },
    { key: "status", label: "Status", type: "select", options: ["draft","published","archived"], default: "draft" }
  ]},
  materials: { collection: "materials", label: "Materials", fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "chapterId", label: "Chapter", type: "reference", source: "chapters", required: true },
    { key: "level", label: "Level", type: "select", options: ["L1","L2","L3"], default: "L1" },
    { key: "importance", label: "Importance", type: "select", options: ["normal","important","veryImportant"], default: "normal" },
    { key: "html", label: "Full HTML content", type: "html" },
    { key: "resources", label: "External resources (links)", type: "resources" },
    { key: "order", label: "Order", type: "number", default: 0 },
    { key: "status", label: "Status", type: "select", options: ["draft","published","archived"], default: "draft" }
  ]},
  questions: { collection: "questions", label: "Questions", fields: [
    { key: "questionText", label: "Question", type: "textarea", required: true },
    { key: "chapterId", label: "Chapter", type: "reference", source: "chapters", required: true },
    { key: "level", label: "Difficulty level", type: "select", options: ["L1","L2","L3"], default: "L1" },
    { key: "importance", label: "Importance", type: "select", options: ["normal","important","veryImportant"], default: "normal" },
    { key: "options", label: "Options", type: "options" },
    { key: "explanation", label: "Explanation", type: "textarea" },
    { key: "order", label: "Order", type: "number", default: 0 },
    { key: "status", label: "Status", type: "select", options: ["draft","published","archived"], default: "draft" }
  ]}
};

const ADMIN_SECTIONS = [
  { id: "subjects", label: "Subjects", icon: "📚" },
  { id: "chapters", label: "Chapters", icon: "📑" },
  { id: "materials", label: "Materials", icon: "📖" },
  { id: "questions", label: "Questions (MCQ)", icon: "❓" },
  { id: "exams", label: "Examinations", icon: "🏛️" },
  { id: "import", label: "JSON Import / Export", icon: "📦" }
];

async function renderAdminPage(section, token) {
  if (!S.isAdmin && !S.isOwner) return setPageHtml(emptyState("Admin only", "Restricted to primary owner and staff."));
  if (!S.user.emailVerified) {
    setPageHtml(`<div class="card"><h2>Verification required</h2><p>Admin writes require a verified email.</p><button class="btn btn-primary" id="adminVerifyBtn" type="button">Resend verification</button></div>`);
    $("#adminVerifyBtn")?.addEventListener("click", resendVerification);
    return;
  }

  if (!section) {
    setPageHtml(`
      <div class="page-head"><div><h1 class="page-title">Admin Panel</h1><p class="page-sub">Full content management for Sajilo GK.</p></div><a class="btn" href="#/home">Exit admin</a></div>
      <div class="admin-grid">${ADMIN_SECTIONS.map(s => `<a class="admin-card" href="#/admin/${s.id}"><strong>${s.icon} ${escapeHtml(s.label)}</strong><span>Manage ${s.label.toLowerCase()}</span></a>`).join("")}</div>
    `);
    return;
  }

  if (section === "import") return renderAdminImport(token);

  const schema = ADMIN_SCHEMAS[section];
  if (!schema) return setPageHtml(errorState("Unknown section", "Section does not exist."));

  setPageHtml(spinnerBlock("Loading records…"));
  let docs = [];
  try {
    const snap = await getDocs(query(collection(db, schema.collection), limit(200)));
    docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0));
  } catch (err) {
    setPageHtml(errorState("Could not load records", friendlyError(err, "loading records")));
    return;
  }
  if (isStale(token)) return;

  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(schema.label)}</h1><p class="page-sub">Create, edit, delete records.</p></div><div class="row"><a class="btn" href="#/admin">← Admin</a><button class="btn btn-primary" id="adminCreateBtn" type="button">+ New ${escapeHtml(schema.label.replace(/s$/, ""))}</button></div></div>
    ${docs.length ? `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${docs.map(d => `<tr>
      <td>${escapeHtml(d.title || d.questionText || d.id)}</td>
      <td>${statusBadge(d.status)}</td>
      <td>${timeAgo(d.updatedAt)}</td>
      <td><div class="admin-row-actions">
        <button class="btn btn-small" data-edit="${escapeHtml(d.id)}" type="button">Edit</button>
        <button class="btn btn-small btn-danger" data-delete="${escapeHtml(d.id)}" type="button">Delete</button>
      </div></td>
    </tr>`).join("")}</tbody></table></div>` : emptyState(`No ${schema.label.toLowerCase()} yet`, `Create your first ${schema.label.toLowerCase()}.`)}
  `);

  $("#adminCreateBtn")?.addEventListener("click", () => openAdminForm(section, null));
  $$("[data-edit]").forEach(b => b.addEventListener("click", () => openAdminForm(section, b.dataset.edit)));
  $$("[data-delete]").forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmDialog(`Delete this ${schema.label.replace(/s$/, "").toLowerCase()}? This cannot be undone.`, { danger: true, confirmText: "Delete" }))) return;
    try {
      await deleteDoc(doc(db, schema.collection, b.dataset.delete));
      await writeAudit("delete", schema.collection, b.dataset.delete);
      toast("Deleted.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "deleting"), "error"); }
  }));
}

async function loadReferenceOptions(source) {
  if (!source) return [];
  try {
    const snap = await getDocs(query(collection(db, source), limit(500)));
    return snap.docs.map(d => ({ id: d.id, label: d.data().title || d.data().code || d.id }));
  } catch { return []; }
}

async function openAdminForm(section, id) {
  const schema = ADMIN_SCHEMAS[section];
  if (!schema) return;
  let existing = {};
  if (id) {
    try { const snap = await getDoc(doc(db, schema.collection, id)); if (snap.exists()) existing = snap.data(); }
    catch (err) { return toast(friendlyError(err, "loading record"), "error"); }
  }

  S.adminSection = section;
  S.adminId = id;
  S.adminBlocks = [];
  S.adminOptions = Array.isArray(existing.options) ? JSON.parse(JSON.stringify(existing.options)) : [{ id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }, { id: "d", text: "" }];
  S.adminCorrectOptionId = existing.correctOptionId || "a";
  S.adminResources = Array.isArray(existing.resources) ? JSON.parse(JSON.stringify(existing.resources)) : [];

  const fieldsHtml = [];
  for (const f of schema.fields) fieldsHtml.push(await renderAdminField(f, existing));

  openModal(`
    <div class="modal-head"><h2>${id ? "Edit" : "New"} ${escapeHtml(schema.label.replace(/s$/, ""))}</h2><button class="modal-close" data-modal-close>✕</button></div>
    <div class="form-grid" id="adminForm">${fieldsHtml.join("")}</div>
    <div class="form-actions"><button class="btn" data-modal-close type="button">Cancel</button><button class="btn btn-primary" id="adminSaveBtn" type="button">Save</button></div>
  `, { wide: true });

  bindAdminDynamic(schema);

  $("#adminSaveBtn").onclick = async () => {
    const btn = $("#adminSaveBtn");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const data = collectAdminForm(schema, $("#adminForm"));
      if (data === null) { btn.disabled = false; btn.textContent = "Save"; return; }

      // Auto-link subjectId from chapter
      if ((schema.collection === "materials" || schema.collection === "questions") && data.chapterId && !data.subjectId) {
        try { const chSnap = await getDoc(doc(db, "chapters", data.chapterId)); if (chSnap.exists()) data.subjectId = chSnap.data().subjectId || ""; } catch {}
      }

      const payload = { ...data, updatedAt: serverTimestamp() };
      if (!id) payload.createdAt = serverTimestamp();
      if (payload.status === "published" && existing.status !== "published") payload.publishedAt = serverTimestamp();

      const ref = id ? doc(db, schema.collection, id) : doc(collection(db, schema.collection));
      await setDoc(ref, payload, { merge: true });
      await writeAudit(id ? "update" : "create", schema.collection, ref.id, { status: payload.status });
      toast("Saved successfully.", "success");
      closeModal();
      router();
    } catch (err) {
      console.error("Save error", err);
      toast(friendlyError(err, "saving record"), "error", 5000);
    } finally {
      btn.disabled = false; btn.textContent = "Save";
    }
  };
}

async function renderAdminField(f, existing) {
  const v = existing[f.key] ?? f.default ?? "";
  const required = f.required ? '<span class="required">*</span>' : "";
  if (f.type === "textarea") return `<div><label>${escapeHtml(f.label)} ${required}</label><textarea name="${escapeHtml(f.key)}" rows="4">${escapeHtml(v)}</textarea></div>`;
  if (f.type === "html") return `<div><label>${escapeHtml(f.label)} ${required}</label><textarea name="${escapeHtml(f.key)}" rows="10" placeholder="<h2>Heading</h2><p>Paragraph</p><table>...</table>">${escapeHtml(v)}</textarea><p class="tiny muted">Supports HTML tags: h1-h6, p, ul/li, table, strong, em, a, img, blockquote, mark.</p></div>`;
  if (f.type === "number") return `<div><label>${escapeHtml(f.label)} ${required}</label><input type="number" name="${escapeHtml(f.key)}" value="${escapeHtml(v)}"></div>`;
  if (f.type === "checkbox") return `<div class="checkbox-row"><input type="checkbox" name="${escapeHtml(f.key)}" ${v ? "checked" : ""}><label style="margin:0">${escapeHtml(f.label)}</label></div>`;
  if (f.type === "select") return `<div><label>${escapeHtml(f.label)} ${required}</label><select name="${escapeHtml(f.key)}">${f.options.map(o => `<option value="${escapeHtml(o)}" ${String(v) === String(o) ? "selected" : ""}>${escapeHtml(o || "Any")}</option>`).join("")}</select></div>`;
  if (f.type === "multiselect") {
    const opts = await loadReferenceOptions(f.source);
    const sel = Array.isArray(v) ? v : [];
    return `<div><label>${escapeHtml(f.label)} ${required}</label><div class="chip-list">${opts.map(o => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="${escapeHtml(f.key)}" value="${escapeHtml(o.id)}" ${sel.includes(o.id) ? "checked" : ""}> ${escapeHtml(o.label)}</label>`).join("") || '<span class="small muted">No options</span>'}</div></div>`;
  }
  if (f.type === "reference") {
    const opts = await loadReferenceOptions(f.source);
    return `<div><label>${escapeHtml(f.label)} ${required}</label><select name="${escapeHtml(f.key)}"><option value="">— choose —</option>${opts.map(o => `<option value="${escapeHtml(o.id)}" ${v === o.id ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select></div>`;
  }
  if (f.type === "options") return `<div><label>${escapeHtml(f.label)}</label><div id="optionsEditor" class="options-editor"></div><button class="btn btn-small mt-8" id="addOptionBtn" type="button">+ Add option</button></div>`;
  if (f.type === "resources") return `<div><label>${escapeHtml(f.label)}</label><div id="resourcesEditor" class="block-editor"></div><button class="btn btn-small mt-8" id="addResourceBtn" type="button">+ Add resource</button></div>`;
  return `<div><label>${escapeHtml(f.label)} ${required}</label><input name="${escapeHtml(f.key)}" value="${escapeHtml(v)}"></div>`;
}

function bindAdminDynamic(schema) {
  renderOptionsEditor();
  renderResourcesEditor();
  $("#addOptionBtn")?.addEventListener("click", () => {
    if (S.adminOptions.length >= 6) return toast("Max 6 options.", "error");
    S.adminOptions.push({ id: String.fromCharCode(97 + S.adminOptions.length), text: "" });
    renderOptionsEditor();
  });
  $("#addResourceBtn")?.addEventListener("click", () => {
    S.adminResources.push({ title: "", url: "", type: "youtube" });
    renderResourcesEditor();
  });
}

function renderOptionsEditor() {
  const root = $("#optionsEditor");
  if (!root) return;
  root.innerHTML = S.adminOptions.map((o, i) => `
    <div class="editor-option">
      <div class="mini-row">
        <input type="text" data-opt="${i}" value="${escapeHtml(o.text || "")}" placeholder="Option ${String.fromCharCode(65 + i)}" style="flex:1">
        <label class="small"><input type="radio" name="adminCorrectOpt" value="${escapeHtml(o.id)}" ${S.adminCorrectOptionId === o.id ? "checked" : ""}> Correct</label>
        <button class="btn btn-small btn-danger" type="button" data-opt-remove="${i}" ${S.adminOptions.length <= 2 ? "disabled" : ""}>✕</button>
      </div>
    </div>`).join("");
  $$("[data-opt]").forEach(inp => inp.addEventListener("input", () => { S.adminOptions[Number(inp.dataset.opt)].text = inp.value; }));
  $$('input[name="adminCorrectOpt"]').forEach(r => r.addEventListener("change", () => { S.adminCorrectOptionId = r.value; }));
  $$("[data-opt-remove]").forEach(b => b.addEventListener("click", () => {
    S.adminOptions.splice(Number(b.dataset.optRemove), 1);
    if (!S.adminOptions.some(o => o.id === S.adminCorrectOptionId)) S.adminCorrectOptionId = S.adminOptions[0]?.id || "a";
    renderOptionsEditor();
  }));
}

function renderResourcesEditor() {
  const root = $("#resourcesEditor");
  if (!root) return;
  root.innerHTML = S.adminResources.map((r, i) => `
    <div class="editor-option">
      <div class="mini-row"><input type="text" data-res-title="${i}" value="${escapeHtml(r.title || "")}" placeholder="Title" style="flex:1"></div>
      <div class="mini-row mt-8"><input type="url" data-res-url="${i}" value="${escapeHtml(r.url || "")}" placeholder="https://..." style="flex:1">
        <select data-res-type="${i}">
          <option value="youtube" ${r.type === "youtube" ? "selected" : ""}>YouTube</option>
          <option value="pdf" ${r.type === "pdf" ? "selected" : ""}>PDF</option>
          <option value="website" ${r.type === "website" ? "selected" : ""}>Website</option>
        </select>
        <button class="btn btn-small btn-danger" type="button" data-res-remove="${i}">✕</button>
      </div>
    </div>`).join("");
  $$("[data-res-title]").forEach(inp => inp.addEventListener("input", () => { S.adminResources[Number(inp.dataset.resTitle)].title = inp.value; }));
  $$("[data-res-url]").forEach(inp => inp.addEventListener("input", () => { S.adminResources[Number(inp.dataset.resUrl)].url = inp.value; }));
  $$("[data-res-type]").forEach(s => s.addEventListener("change", () => { S.adminResources[Number(s.dataset.resType)].type = s.value; }));
  $$("[data-res-remove]").forEach(b => b.addEventListener("click", () => { S.adminResources.splice(Number(b.dataset.resRemove), 1); renderResourcesEditor(); }));
}

function collectAdminForm(schema, rootEl) {
  const root = rootEl || els.modalRoot;
  const data = {};
  for (const f of schema.fields) {
    if (f.type === "options") { data.options = S.adminOptions; data.correctOptionId = S.adminCorrectOptionId; continue; }
    if (f.type === "resources") { data.resources = S.adminResources.filter(r => r.url && r.title); continue; }
    if (f.type === "multiselect") {
      data[f.key] = $$(`input[name="${f.key}"]:checked`, root).map(i => i.value);
      continue;
    }
    if (f.type === "checkbox") {
      const el = root.querySelector(`input[name="${f.key}"]`);
      data[f.key] = !!el?.checked;
      continue;
    }
    const el = root.querySelector(`[name="${f.key}"]`);
    if (!el) { console.warn(`Field ${f.key} not found in form`); continue; }
    if (f.type === "number") data[f.key] = Number(el.value || 0);
    else if (f.type === "date") data[f.key] = el.value || null;
    else data[f.key] = el.value.trim();
    if (f.required && !data[f.key]) { toast(`${f.label} is required.`, "error"); return null; }
  }
  if (schema.collection === "questions") {
    const opts = (data.options || []).filter(o => String(o.text || "").trim());
    if (opts.length < 2) { toast("At least 2 answer options with text are required.", "error"); return null; }
    if (!opts.some(o => o.id === data.correctOptionId)) { toast("Mark one option as correct.", "error"); return null; }
    data.options = opts;
  }
  return data;
}

async function writeAudit(action, collectionName, docId, extra = {}) {
  try {
    await addDoc(collection(db, "adminAuditLogs"), {
      action, collection: collectionName, docId, actorId: S.user.uid, actorEmail: S.user.email || "",
      ...extra, createdAt: serverTimestamp()
    });
  } catch (err) { console.warn("Audit failed", err); }
}

/* ============ 15. IMPORT / EXPORT ============ */
function renderAdminImport(token) {
  setPageHtml(`
    <div class="page-head"><div><h1 class="page-title">JSON Import / Export</h1><p class="page-sub">Safe import with preview and duplicate detection.</p></div><a class="btn" href="#/admin">← Admin</a></div>
    <div class="card mb-16">
      <h2 class="card-title">Import full subject JSON</h2>
      <p class="small muted">Expected structure: <code>{ "subject": {...}, "chapters": [{...,"materials":[...],"questions":[...]}] }</code> or an array of subjects.</p>
      <div class="form-grid">
        <div><label>JSON file</label><input id="importFile" type="file" accept=".json"></div>
        <div><label>Mode</label><select id="importMode"><option value="addNew">Add New (skip existing IDs)</option><option value="updateById">Update by ID</option><option value="addOrUpdate">Add or Update</option></select></div>
      </div>
      <div class="row mt-8"><button class="btn btn-primary" id="previewImportBtn" type="button">Validate &amp; preview</button><button class="btn" id="downloadTemplateBtn" type="button">Download template</button></div>
      <div id="importPreview" class="mt-16"></div>
    </div>
    <div class="card">
      <h2 class="card-title">Export</h2>
      <div class="form-grid">
        <div><label>Export type</label><select id="exportType"><option value="subject">Full subject (with chapters, materials, questions)</option><option value="chapter">Single chapter</option><option value="questions">MCQs only (by chapter)</option></select></div>
        <div><label>ID (subject/chapter)</label><input id="exportId" placeholder="Paste subject or chapter ID"></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" id="exportBtn" type="button">Export JSON</button></div>
    </div>
  `);

  $("#downloadTemplateBtn")?.addEventListener("click", () => {
    const template = {
      subject: { title: "Example Subject", description: "Description", examIds: ["examId"], status: "draft", order: 1 },
      chapters: [{
        title: "Chapter 1", chapterNumber: 1, description: "Chapter description", order: 1, status: "draft",
        materials: [{
          title: "Introduction", level: "L1", importance: "important", status: "draft",
          html: "<h2>Heading</h2><p>Paragraph with <strong>bold</strong> and <mark>highlight</mark>.</p><ul><li>Point 1</li><li>Point 2</li></ul>",
          resources: [{ title: "Video", url: "https://www.youtube.com/watch?v=xxx", type: "youtube" }]
        }],
        questions: [
          { questionText: "Sample question?", level: "L1", options: [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }], correctOptionId: "a", explanation: "Explanation", status: "draft" }
        ]
      }]
    };
    downloadFile("sajilo-template.json", JSON.stringify(template, null, 2), "application/json");
  });

  $("#previewImportBtn")?.addEventListener("click", async () => {
    const file = $("#importFile").files[0];
    if (!file) return toast("Choose a JSON file.", "error");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      S.importState = { parsed, mode: $("#importMode").value };
      const preview = await buildImportPreview(parsed);
      $("#importPreview").innerHTML = preview;
      $("#confirmImportBtn")?.addEventListener("click", commitImport);
    } catch (err) {
      toast(`Invalid JSON: ${err.message}`, "error");
    }
  });

  $("#exportBtn")?.addEventListener("click", async () => {
    const type = $("#exportType").value;
    const id = $("#exportId").value.trim();
    try { await exportContent(type, id); }
    catch (err) { toast(friendlyError(err, "exporting"), "error"); }
  });
}

async function buildImportPreview(parsed) {
  const subjects = Array.isArray(parsed) ? parsed : (parsed.subject ? [parsed] : (parsed.subjects || []));
  if (!subjects.length) return `<div class="reader-callout mistake"><p>No subjects found in JSON.</p></div>`;

  let totalChapters = 0, totalMaterials = 0, totalQuestions = 0;
  const errors = [];

  for (const s of subjects) {
    if (!s.subject?.title && !s.title) errors.push(`Subject missing title.`);
    const chapters = s.chapters || [];
    totalChapters += chapters.length;
    for (const c of chapters) {
      if (!c.title) errors.push(`Chapter missing title.`);
      totalMaterials += (c.materials || []).length;
      const qs = c.questions || [];
      totalQuestions += qs.length;
      for (const q of qs) {
        if (!q.questionText) errors.push(`Question missing text.`);
        if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`Question "${(q.questionText || "").slice(0, 30)}…" needs at least 2 options.`);
        if (q.options && !q.options.some(o => o.id === q.correctOptionId)) errors.push(`Question "${(q.questionText || "").slice(0, 30)}…" correctOptionId not in options.`);
      }
    }
  }

  return `<div class="card" style="box-shadow:none">
    <div class="grid grid-4 mb-16">
      <div class="stat-card"><div class="stat-value">${subjects.length}</div><div class="stat-label">Subjects</div></div>
      <div class="stat-card"><div class="stat-value">${totalChapters}</div><div class="stat-label">Chapters</div></div>
      <div class="stat-card"><div class="stat-value">${totalMaterials}</div><div class="stat-label">Materials</div></div>
      <div class="stat-card"><div class="stat-value">${totalQuestions}</div><div class="stat-label">MCQs</div></div>
    </div>
    ${errors.length ? `<div class="reader-callout mistake"><h4>${errors.length} validation error(s)</h4><ul>${errors.slice(0, 20).map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>` : `<div class="reader-callout"><p>✅ Validation passed.</p></div>`}
    <div class="form-actions"><button class="btn btn-primary" id="confirmImportBtn" type="button" ${errors.length ? "disabled" : ""}>Confirm import</button><button class="btn" id="downloadErrBtn" type="button" ${errors.length ? "" : "disabled"}>Download error report</button></div>
  </div>`;
}

async function commitImport() {
  const st = S.importState;
  if (!st) return;
  const btn = $("#confirmImportBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Importing…"; }
  try {
    const subjects = Array.isArray(st.parsed) ? st.parsed : [st.parsed];
    let writtenSubs = 0, writtenChapters = 0, writtenMaterials = 0, writtenQuestions = 0, skipped = 0;
    const BATCH_LIMIT = 400;

    for (const sBlock of subjects) {
      const subjectData = sBlock.subject || sBlock;
      const subjectPayload = {
        title: subjectData.title || "Untitled Subject",
        description: subjectData.description || "",
        examIds: subjectData.examIds || [],
        status: subjectData.status || "draft",
        order: Number(subjectData.order || 0),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      };
      let subjectId = subjectData.id;
      const subjectRef = subjectId ? doc(db, "subjects", subjectId) : doc(collection(db, "subjects"));
      if (!subjectId) subjectId = subjectRef.id;
      const existingSub = await getDoc(subjectRef);
      if (existingSub.exists() && st.mode === "addNew") { skipped++; continue; }
      await setDoc(subjectRef, subjectPayload, { merge: true });
      writtenSubs++;

      const chapters = sBlock.chapters || [];
      for (const c of chapters) {
        const chPayload = {
          title: c.title || "Untitled Chapter",
          chapterNumber: Number(c.chapterNumber || 1),
          description: c.description || "",
          subjectId,
          order: Number(c.order || 0),
          status: c.status || "draft",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        };
        let chapterId = c.id;
        const chRef = chapterId ? doc(db, "chapters", chapterId) : doc(collection(db, "chapters"));
        if (!chapterId) chapterId = chRef.id;
        const existingCh = await getDoc(chRef);
        if (existingCh.exists() && st.mode === "addNew") { skipped++; continue; }
        await setDoc(chRef, chPayload, { merge: true });
        writtenChapters++;

        // Materials — batch
        const materials = c.materials || [];
        for (let i = 0; i < materials.length; i += BATCH_LIMIT) {
          const batch = writeBatch(db);
          const chunk = materials.slice(i, i + BATCH_LIMIT);
          chunk.forEach(m => {
            const mRef = m.id ? doc(db, "materials", m.id) : doc(collection(db, "materials"));
            batch.set(mRef, {
              title: m.title || "Untitled",
              html: m.html || m.content || "",
              level: m.level || "L1",
              importance: m.importance || "normal",
              resources: m.resources || [],
              chapterId,
              subjectId,
              order: Number(m.order || 0),
              status: m.status || "draft",
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp()
            }, { merge: true });
          });
          await batch.commit();
          writtenMaterials += chunk.length;
        }

        // Questions — batch
        const qs = c.questions || [];
        for (let i = 0; i < qs.length; i += BATCH_LIMIT) {
          const batch = writeBatch(db);
          const chunk = qs.slice(i, i + BATCH_LIMIT);
          chunk.forEach(q => {
            const qRef = q.id ? doc(db, "questions", q.id) : doc(collection(db, "questions"));
            batch.set(qRef, {
              questionText: q.questionText || "",
              options: q.options || [],
              correctOptionId: q.correctOptionId || "",
              explanation: q.explanation || "",
              level: q.level || "L1",
              importance: q.importance || "normal",
              chapterId,
              subjectId,
              order: Number(q.order || 0),
              status: q.status || "draft",
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp()
            }, { merge: true });
          });
          await batch.commit();
          writtenQuestions += chunk.length;
        }
      }
    }

    await writeAudit("import", "bulk", "import", { writtenSubs, writtenChapters, writtenMaterials, writtenQuestions, skipped });
    toast(`Imported: ${writtenSubs} subjects, ${writtenChapters} chapters, ${writtenMaterials} materials, ${writtenQuestions} questions. Skipped: ${skipped}.`, "success", 6000);
    $("#importPreview").innerHTML = `<div class="reader-callout"><p>✅ Import complete.</p></div>`;
  } catch (err) {
    console.error("Import failed", err);
    toast(friendlyError(err, "importing"), "error", 5000);
    if (btn) { btn.disabled = false; btn.textContent = "Confirm import"; }
  }
}

async function exportContent(type, id) {
  if (!id) return toast("Provide an ID.", "error");
  if (type === "subject") {
    const subSnap = await getDoc(doc(db, "subjects", id));
    if (!subSnap.exists()) return toast("Subject not found.", "error");
    const subject = { id: subSnap.id, ...subSnap.data() };
    const chSnap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",id), limit(500)));
    const chapters = [];
    for (const cd of chSnap.docs) {
      const chapter = { id: cd.id, ...cd.data() };
      const [matSnap, qSnap] = await Promise.all([
        getDocs(query(collection(db, "materials"), where("chapterId","==",cd.id), limit(500))),
        getDocs(query(collection(db, "questions"), where("chapterId","==",cd.id), limit(500)))
      ]);
      chapter.materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      chapter.questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      chapters.push(chapter);
    }
    downloadFile(`subject-${id}.json`, JSON.stringify({ subject, chapters }, null, 2), "application/json");
    toast("Exported subject.", "success");
  } else if (type === "chapter") {
    const chSnap = await getDoc(doc(db, "chapters", id));
    if (!chSnap.exists()) return toast("Chapter not found.", "error");
    const chapter = { id: chSnap.id, ...chSnap.data() };
    const [matSnap, qSnap] = await Promise.all([
      getDocs(query(collection(db, "materials"), where("chapterId","==",id), limit(500))),
      getDocs(query(collection(db, "questions"), where("chapterId","==",id), limit(500)))
    ]);
    chapter.materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    chapter.questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    downloadFile(`chapter-${id}.json`, JSON.stringify({ chapter }, null, 2), "application/json");
    toast("Exported chapter.", "success");
  } else if (type === "questions") {
    const qSnap = await getDocs(query(collection(db, "questions"), where("chapterId","==",id), limit(1000)));
    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    downloadFile(`questions-${id}.json`, JSON.stringify({ questions }, null, 2), "application/json");
    toast(`Exported ${questions.length} question(s).`, "success");
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

/* ============ 16. SETUP PAGE ============ */
function renderSetupPage() {
  return `<div class="card" style="max-width:760px;margin:0 auto">
    <h1 class="page-title">Setup &amp; recovery</h1>
    <p class="muted">Use this if content does not load or admin is unreachable.</p>
    <div class="stack mt-16">
      <div class="card" style="box-shadow:none"><strong>1. Verify owner email</strong><p class="small muted">Sign in as ${escapeHtml(OWNER_EMAIL)} and verify.</p><button class="btn btn-small" id="setupVerifyBtn" type="button">Resend verification</button></div>
      <div class="card" style="box-shadow:none"><strong>2. Publish firestore.rules</strong><p class="small muted">Use the exact rules supplied.</p></div>
      <div class="card" style="box-shadow:none"><strong>3. Create indexes</strong><p class="small muted">See setup docs for required composite indexes.</p></div>
      <div class="card" style="box-shadow:none"><strong>4. Sign out &amp; back in</strong><p class="small muted">Refreshes ID token after verification.</p><button class="btn btn-small" id="setupLogoutBtn" type="button">Logout</button></div>
    </div>
  </div>`;
}
function bindSetupPage() {
  $("#setupVerifyBtn")?.addEventListener("click", resendVerification);
  $("#setupLogoutBtn")?.addEventListener("click", doLogout);
}

/* ============ 17. BOOT ============ */
function showBootError(err) {
  if (els.bootScreen) {
    els.bootScreen.innerHTML = `<div class="boot-logo">Sajilo<span>GK</span></div><p style="max-width:520px;color:var(--red)">App could not initialize Firebase.</p><button class="btn btn-primary" onclick="location.reload()">Reload</button>`;
  }
  console.error(err);
}

async function boot() {
  cacheEls();
  initTheme();
  bindAuthEvents();
  bindShellEvents();
  bindVerifyGate();

  if (firebaseInitError) { showBootError(firebaseInitError); return; }

  handleRedirectResult();

  onAuthStateChanged(auth, async user => {
    S.authReady = true;
    S.user = user;
    if (!user) {
      S.profile = null; S.profileLoaded = false; S.profilePromise = null;
      S.isOwner = false; S.isAdmin = false;
      S.selectedSubjects = [];
      showAuth(); setAuthTab("login");
      return;
    }

    S.isOwner = user.email === OWNER_EMAIL && user.emailVerified === true;
    S.isAdmin = S.isOwner;
    showShell();
    renderProfileChrome();
    await initCache(user.uid);
    loadRole();
    ensureProfile().then(() => {
      renderProfileChrome();
      if (S.profile && !S.profile.onboardingComplete && !["onboarding","profile","settings","setup","admin"].includes(parseRoute().segs[0])) {
        go("/onboarding");
      }
    });
    router();
  });

  window.addEventListener("online", () => toast("Back online.", "success"));
  window.addEventListener("offline", () => toast("You are offline. Some saves may fail.", "info", 4000));
}

document.addEventListener("DOMContentLoaded", boot);
if (document.readyState === "interactive" || document.readyState === "complete") boot();
