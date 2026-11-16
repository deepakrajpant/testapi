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
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, writeBatch, Timestamp, getCountFromServer
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

/* ============ FIREBASE ============ */
const firebaseConfig = {
  apiKey: "AIzaSyDK1wwahwoJxNAH_Iats2wrSMUA42jVhSI",
  authDomain: "loksewa-2083.firebaseapp.com",
  projectId: "loksewa-2083",
  storageBucket: "loksewa-2083.firebasestorage.app",
  messagingSenderId: "484441818228",
  appId: "1:484441818228:web:fb43d456131cd40ec1fd21",
  measurementId: "G-D5RTD5R7B4"
};
let app, auth, db, firebaseInitError = null;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }) }); }
  catch { db = getFirestore(app); }
} catch (err) { firebaseInitError = err; console.error("Firebase init failed", err); }

/* ============ IN-MEMORY CACHE ============ */
const MEM = {
  data: new Map(),
  get(key, ttl = 120000) {
    const e = this.data.get(key);
    if (!e) return null;
    if (Date.now() - e.t > ttl) { this.data.delete(key); return null; }
    return e.v;
  },
  set(key, v) { this.data.set(key, { v, t: Date.now() }); },
  del(key) { this.data.delete(key); },
  clear() { this.data.clear(); }
};

/* ============ STATE ============ */
const OWNER_EMAIL = "deepakrajpant978@gmail.com";
const NEPAL_TZ = "Asia/Kathmandu";
const S = {
  user: null, profile: null, isOwner: false, isAdmin: false,
  profileLoaded: false, profilePromise: null,
  exams: [], selectedSubjects: [], routeToken: 0, pageCleanup: null,
  editOptions: [], editCorrectId: "a", editResources: [],
  practice: null
};
const els = {};
function cacheEls() {
  ["bootScreen","authView","appShell","app","menuToggle","adminHeaderBtn","themeToggle",
   "profileBtn","profileDropdown","avatarInitial","profileChipName","logoutBtn","mobileLogoutBtn",
   "sidebar","sidebarBackdrop","sidebarLogoutBtn","verifyBanner","resendVerifyBtn","refreshVerifyBtn",
   "modalRoot","toastRoot","loginForm","signupForm","resetForm","googleBtn","authMessage",
   "dropdownAvatar","dropdownName","dropdownEmail","dropdownVerifyBadge"
  ].forEach(id => { els[id] = document.getElementById(id); });
}

/* ============ UTILS ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const escapeHtml = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

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
  const allowed = new Set(["P","BR","STRONG","B","EM","I","U","S","UL","OL","LI","H1","H2","H3","H4","H5","H6","BLOCKQUOTE","CODE","PRE","SPAN","A","TABLE","THEAD","TBODY","TR","TH","TD","IMG","HR","MARK","DIV","FIGURE","FIGCAPTION"]);
  const walk = (node) => {
    Array.from(node.children).forEach(c => {
      if (!allowed.has(c.tagName)) { c.replaceWith(...c.childNodes); return; }
      Array.from(c.attributes).forEach(a => {
        if (a.name === "href" || a.name === "src") {
          if (safeUrl(a.value)) {
            c.setAttribute("rel","noopener noreferrer");
            if (a.name === "href") c.setAttribute("target","_blank");
          } else c.removeAttribute(a.name);
        } else if (!["class","alt","title","colspan","rowspan","width","height"].includes(a.name)) {
          c.removeAttribute(a.name);
        }
      });
      walk(c);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}
function nepalDateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: NEPAL_TZ, year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
}
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return null;
}
function formatDate(v) {
  const d = toDate(v); if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: NEPAL_TZ, year:"numeric", month:"short", day:"numeric" }).format(d);
}
function timeAgo(v) {
  const d = toDate(v); if (!d) return "—";
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
function toast(msg, type = "info", ms = 3400) {
  if (!els.toastRoot) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  els.toastRoot.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function spinner(text = "Loading…") {
  return `<div class="loading-state"><div class="boot-spinner" style="margin:0 auto 12px;border-color:var(--border);border-top-color:var(--primary)"></div><p class="muted">${escapeHtml(text)}</p></div>`;
}
function emptyState(t, txt, action = "") {
  return `<div class="empty-state"><div class="empty-icon">📭</div><h3>${escapeHtml(t)}</h3><p>${escapeHtml(txt)}</p>${action}</div>`;
}
function errorState(t, txt) {
  return `<div class="error-state"><div class="error-icon">⚠️</div><h3>${escapeHtml(t)}</h3><p>${escapeHtml(txt)}</p><button class="btn btn-primary" data-retry>Retry</button></div>`;
}
function friendlyError(err, ctx = "") {
  console.error(`[SajiloGK:${ctx}]`, err);
  const c = err?.code || "";
  if (c === "permission-denied") return "Access denied.";
  if (c === "unavailable") return "Network unavailable.";
  if (c === "failed-precondition") return "Firestore index missing.";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found") return "Email or password incorrect.";
  if (c === "auth/email-already-in-use") return "Email already in use.";
  return ctx ? `Failed while ${ctx}.` : "Something went wrong.";
}
function confirmDialog(msg, { title = "Confirm", confirmText = "Confirm", danger = false } = {}) {
  return new Promise(resolve => {
    const root = els.modalRoot;
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="modal-close" data-cancel>✕</button></div>
      <p>${escapeHtml(msg)}</p>
      <div class="form-actions"><button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${escapeHtml(confirmText)}</button></div></div>`;
    root.classList.add("open");
    document.body.classList.add("no-scroll");
    const done = v => { root.classList.remove("open"); root.innerHTML = ""; document.body.classList.remove("no-scroll"); resolve(v); };
    root.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => done(false));
    root.querySelector("[data-confirm]").onclick = () => done(true);
    root.onclick = e => { if (e.target === root) done(false); };
  });
}
function openModal(html, wide = false) {
  const root = els.modalRoot;
  root.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add("open");
  document.body.classList.add("no-scroll");
  root.querySelectorAll("[data-modal-close]").forEach(b => b.onclick = closeModal);
  root.onclick = e => { if (e.target === root) closeModal(); };
  return root.querySelector(".modal");
}
function closeModal() {
  els.modalRoot.classList.remove("open");
  els.modalRoot.innerHTML = "";
  document.body.classList.remove("no-scroll");
}
function setPage(html) { els.app.innerHTML = html; }
function cleanup() {
  if (typeof S.pageCleanup === "function") { try { S.pageCleanup(); } catch {} }
  S.pageCleanup = null;
}
function newToken() { S.routeToken++; return S.routeToken; }
function isStale(t) { return t !== S.routeToken; }
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  return { segs: pathPart.split("/").filter(Boolean), params: new URLSearchParams(queryPart || "") };
}
function go(path) { location.hash === `#${path}` ? router() : (location.hash = `#${path}`); }
function bindRetry() { const b = els.app.querySelector('[data-retry]'); if (b) b.onclick = () => router(); }
function levelLabel(l) { return l === "L1" ? "L1 · Basic" : l === "L2" ? "L2 · Medium" : l === "L3" ? "L3 · Advanced" : l || "—"; }
function statusBadge(s) { return `<span class="badge ${escapeHtml(s || "draft")}">${escapeHtml(s || "draft")}</span>`; }
function activeNav(path) {
  $$("[data-nav]").forEach(a => {
    const target = (a.getAttribute("href") || "").replace(/^#/, "");
    const cur = location.hash.replace(/^#/, "") || "/home";
    a.classList.toggle("active", target === cur || (target !== "/home" && cur.startsWith(target)));
  });
}
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ============ AUTH ============ */
function showAuth() { els.authView.classList.remove("hidden"); els.appShell.classList.add("hidden"); els.bootScreen.classList.add("hidden"); }
function showShell() { els.authView.classList.add("hidden"); els.appShell.classList.remove("hidden"); els.bootScreen.classList.add("hidden"); }
function authMsg(t, type = "error") {
  if (!els.authMessage) return;
  els.authMessage.textContent = t;
  els.authMessage.className = `auth-message ${type}`;
}
function setAuthTab(tab) {
  $$(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.authTab === tab));
  els.loginForm.classList.toggle("hidden", tab !== "login");
  els.signupForm.classList.toggle("hidden", tab !== "signup");
  els.resetForm.classList.toggle("hidden", tab !== "reset");
  authMsg("");
}
function renderProfileChrome() {
  const u = S.user; if (!u) return;
  const name = S.profile?.displayName || u.displayName || u.email?.split("@")[0] || "Student";
  const initial = (name.trim().charAt(0) || "S").toUpperCase();
  if (els.profileChipName) els.profileChipName.textContent = name;
  if (els.avatarInitial) els.avatarInitial.textContent = initial;
  if (els.dropdownAvatar) els.dropdownAvatar.textContent = initial;
  if (els.dropdownName) els.dropdownName.textContent = name;
  if (els.dropdownEmail) els.dropdownEmail.textContent = u.email || "";
  if (els.dropdownVerifyBadge) {
    els.dropdownVerifyBadge.textContent = u.emailVerified ? "Verified" : "Unverified";
    els.dropdownVerifyBadge.className = `badge ${u.emailVerified ? "green" : "amber"}`;
  }
  if (els.adminHeaderBtn) els.adminHeaderBtn.classList.toggle("hidden", !(S.isOwner || S.isAdmin));
  if (els.verifyBanner) els.verifyBanner.classList.toggle("hidden", !!u.emailVerified);
}
async function ensureProfile(force = false) {
  if (S.profileLoaded && !force) return S.profile;
  if (S.profilePromise && !force) return S.profilePromise;
  S.profilePromise = (async () => {
    try {
      if (!db || !S.user) return null;
      const ref = doc(db, "users", S.user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) S.profile = { id: snap.id, ...snap.data() };
      else if (S.user.emailVerified) {
        const data = {
          uid: S.user.uid, email: S.user.email || "",
          displayName: S.user.displayName || S.user.email?.split("@")[0] || "Student",
          examIds: [], subjectIds: [], suspended: false, premium: false,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        };
        await setDoc(ref, data);
        S.profile = { id: S.user.uid, ...data };
      }
      return S.profile;
    } catch (err) { console.warn("Profile load failed", err); return null; }
    finally { S.profileLoaded = true; }
  })();
  return S.profilePromise;
}
async function loadRole() {
  S.isOwner = S.user?.email === OWNER_EMAIL && S.user?.emailVerified === true;
  S.isAdmin = S.isOwner;
  if (!S.isOwner && S.user) {
    try {
      const snap = await getDoc(doc(db, "adminRoles", S.user.uid));
      if (snap.exists()) { const d = snap.data(); S.isAdmin = d.active === true && ["admin","editor"].includes(d.role); }
    } catch {}
  }
  if (els.adminHeaderBtn) els.adminHeaderBtn.classList.toggle("hidden", !(S.isOwner || S.isAdmin));
}
async function doLogout() {
  cleanup();
  MEM.clear();
  try { await signOut(auth); } catch (err) { console.warn(err); }
  S.user = null; S.profile = null; S.profileLoaded = false; S.profilePromise = null;
  S.isOwner = false; S.isAdmin = false; S.selectedSubjects = []; S.exams = [];
  if (els.profileDropdown) els.profileDropdown.classList.add("hidden");
  showAuth(); setAuthTab("login");
  authMsg("You have been logged out.", "success");
}
async function resendVerify() {
  if (!S.user) return;
  try { await sendEmailVerification(S.user); toast("Verification sent.", "success"); }
  catch (err) { toast(friendlyError(err, "sending verification"), "error"); }
}
async function refreshVerify() {
  if (!S.user) return;
  try {
    await reload(S.user);
    S.user = auth.currentUser;
    if (S.user?.emailVerified) { await ensureProfile(true); await loadRole(); renderProfileChrome(); toast("Email verified.", "success"); router(); }
    else toast("Still not verified.", "error");
  } catch (err) { toast(friendlyError(err, "refreshing"), "error"); }
}
async function googleSignIn() {
  authMsg("");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, provider); }
  catch (err) {
    const code = err?.code || "";
    if (["auth/popup-blocked","auth/operation-not-supported-in-this-environment","auth/cancelled-popup-request"].includes(code)) {
      authMsg("Popup blocked. Redirecting to Google…", "info");
      try { await signInWithRedirect(auth, provider); }
      catch (re) { authMsg(friendlyError(re, "Google redirect"), "error"); }
    } else if (code === "auth/popup-closed-by-user") authMsg("Sign-in cancelled.", "info");
    else authMsg(friendlyError(err, "Google sign-in"), "error");
  }
}
function bindAuth() {
  $$(".auth-tab").forEach(b => b.addEventListener("click", () => setAuthTab(b.dataset.authTab)));
  els.loginForm?.addEventListener("submit", async e => {
    e.preventDefault(); authMsg("");
    const email = $("#loginEmail").value.trim();
    const pw = $("#loginPassword").value;
    if (!email || !pw) return authMsg("Enter email and password.");
    const btn = els.loginForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Logging in…";
    try { await signInWithEmailAndPassword(auth, email, pw); }
    catch (err) { authMsg(friendlyError(err, "logging in")); }
    finally { btn.disabled = false; btn.textContent = "Login"; }
  });
  els.signupForm?.addEventListener("submit", async e => {
    e.preventDefault(); authMsg("");
    const name = $("#signupName").value.trim();
    const email = $("#signupEmail").value.trim();
    const pw = $("#signupPassword").value;
    if (!name || !email || !pw) return authMsg("Fill all fields.");
    if (pw.length < 6) return authMsg("Password min 6 characters.");
    const btn = els.signupForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Creating…";
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user);
      authMsg("Account created. Verify your email.", "success");
    } catch (err) { authMsg(friendlyError(err, "creating account")); }
    finally { btn.disabled = false; btn.textContent = "Create account"; }
  });
  els.resetForm?.addEventListener("submit", async e => {
    e.preventDefault(); authMsg("");
    const email = $("#resetEmail").value.trim();
    if (!email) return authMsg("Enter email.");
    try { await sendPasswordResetEmail(auth, email); authMsg("Reset email sent.", "success"); }
    catch (err) { authMsg(friendlyError(err, "sending reset")); }
  });
  els.googleBtn?.addEventListener("click", googleSignIn);
  els.logoutBtn?.addEventListener("click", doLogout);
  els.sidebarLogoutBtn?.addEventListener("click", doLogout);
  els.mobileLogoutBtn?.addEventListener("click", doLogout);
  els.resendVerifyBtn?.addEventListener("click", resendVerify);
  els.refreshVerifyBtn?.addEventListener("click", refreshVerify);
}

/* ============ THEME & SHELL ============ */
function setTheme(t) {
  const theme = t === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("sajilo-theme", theme); } catch {}
  if (els.themeToggle) els.themeToggle.textContent = theme === "dark" ? "☀" : "🌙";
}
function initTheme() {
  let saved = "light";
  try { saved = localStorage.getItem("sajilo-theme") || "light"; } catch {}
  setTheme(saved);
}
function toggleSidebar(open) {
  const isOpen = open ?? !els.sidebar.classList.contains("open");
  els.sidebar.classList.toggle("open", isOpen);
  els.sidebarBackdrop.classList.toggle("hidden", !isOpen);
  els.menuToggle.setAttribute("aria-expanded", String(isOpen));
}
function bindShell() {
  els.menuToggle?.addEventListener("click", () => toggleSidebar());
  els.sidebarBackdrop?.addEventListener("click", () => toggleSidebar(false));
  els.themeToggle?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "dark" ? "light" : "dark");
  });
  els.profileBtn?.addEventListener("click", e => {
    e.stopPropagation();
    const open = els.profileDropdown.classList.contains("hidden");
    els.profileDropdown.classList.toggle("hidden", !open);
    if (open) renderProfileChrome();
  });
  document.addEventListener("click", e => {
    if (!els.profileDropdown?.contains(e.target) && e.target !== els.profileBtn) {
      els.profileDropdown?.classList.add("hidden");
    }
  });
  els.adminHeaderBtn?.addEventListener("click", () => go("/admin"));
  $$("[data-nav]").forEach(a => a.addEventListener("click", () => toggleSidebar(false)));
  window.addEventListener("hashchange", router);
}

/* ============ DATA LAYER (cached) ============ */
async function loadAllSubjects(force = false) {
  if (!force) { const c = MEM.get("subjects"); if (c) return c; }
  try {
    const snap = await getDocs(query(collection(db, "subjects"), where("status","==","published"), limit(300)));
    const subjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    MEM.set("subjects", subjects);
    return subjects;
  } catch (err) { console.warn("Subjects load error", err); return []; }
}
async function loadSelectedSubjects(force = false) {
  if (!force) { const c = MEM.get("selectedSubjects"); if (c) { S.selectedSubjects = c; return c; } }
  try {
    const snap = await getDocs(collection(db, "users", S.user.uid, "selectedSubjects"));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    S.selectedSubjects = list;
    MEM.set("selectedSubjects", list);
    return list;
  } catch { S.selectedSubjects = []; return []; }
}
async function loadExams(force = false) {
  if (!force) { const c = MEM.get("exams"); if (c) return c; }
  try {
    const snap = await getDocs(query(collection(db, "exams"), where("status","==","published"), limit(50)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    S.exams = list;
    MEM.set("exams", list);
    return list;
  } catch { S.exams = []; return []; }
}
async function loadChapters(subjectId, force = false) {
  const key = `chapters:${subjectId}`;
  if (!force) { const c = MEM.get(key); if (c) return c; }
  try {
    const snap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",subjectId), where("status","==","published"), limit(200)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
    MEM.set(key, list);
    return list;
  } catch { return []; }
}
async function loadMaterials(chapterId, force = false) {
  const key = `materials:${chapterId}`;
  if (!force) { const c = MEM.get(key); if (c) return c; }
  try {
    const snap = await getDocs(query(collection(db, "materials"), where("chapterId","==",chapterId), where("status","==","published"), limit(100)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    MEM.set(key, list);
    return list;
  } catch { return []; }
}
async function loadQuestions(chapterId, force = false) {
  const key = `questions:${chapterId}`;
  if (!force) { const c = MEM.get(key); if (c) return c; }
  try {
    const snap = await getDocs(query(collection(db, "questions"), where("chapterId","==",chapterId), where("status","==","published"), limit(500)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    MEM.set(key, list);
    return list;
  } catch { return []; }
}

/* ============ ROUTER ============ */
async function router() {
  const token = newToken();
  cleanup();
  const { segs, params } = parseRoute();
  const name = segs[0] || "home";
  activeNav(`/${segs.join("/")}`);

  if (!S.user) { showAuth(); return; }
  showShell();
  renderProfileChrome();

  if (!S.user.emailVerified && !["profile","settings","verify","admin"].includes(name)) {
    setPage(verifyGate()); bindVerifyGate(); return;
  }

  try {
    switch (name) {
      case "home": await renderHome(token); break;
      case "all-subjects": await renderAllSubjects(token); break;
      case "my-subjects": await renderMySubjects(token); break;
      case "subject": await renderSubjectDetail(segs[1], token); break;
      case "chapter": await renderChapterDetail(segs[1], token); break;
      case "practice": await renderPractice(params, token); break;
      case "progress": await renderProgress(token); break;
      case "saved": await renderSaved(token); break;
      case "profile": renderProfile(); break;
      case "settings": renderSettings(); break;
      case "verify": setPage(verifyGate()); bindVerifyGate(); break;
      case "admin": await renderAdmin(segs.slice(1), token); break;
      default: setPage(emptyState("Page not found", `Route "${name}" does not exist.`, `<a class="btn btn-primary" href="#/home">Home</a>`));
    }
    if (!isStale(token)) { bindRetry(); window.scrollTo(0, 0); }
  } catch (err) {
    if (isStale(token)) return;
    setPage(errorState("Page failed to load", friendlyError(err, "loading page")));
    bindRetry();
  }
}

function verifyGate() {
  return `<div class="card" style="max-width:640px;margin:30px auto;text-align:center">
    <div class="empty-icon">✉️</div>
    <h2>Verify your email</h2>
    <p class="muted">Signed in as <strong>${escapeHtml(S.user?.email || "")}</strong>.</p>
    <div class="row" style="justify-content:center">
      <button class="btn btn-primary" id="gateResend">Resend</button>
      <button class="btn" id="gateRefresh">I have verified</button>
    </div>
    <a class="btn btn-ghost mt-16" href="#/profile">Profile</a>
  </div>`;
}
function bindVerifyGate() {
  $("#gateResend")?.addEventListener("click", resendVerify);
  $("#gateRefresh")?.addEventListener("click", refreshVerify);
}

/* ============ HOME (redesigned) ============ */
async function renderHome(token) {
  setPage(spinner("Loading…"));

  // Parallel fetches
  const [subjects, selected, todaySession, streak, recentMaterials, recentQuestions] = await Promise.all([
    loadAllSubjects(),
    loadSelectedSubjects(),
    getTodaySession(),
    getStreak(),
    getRecentMaterials(),
    getRecentQuestions()
  ]);
  if (isStale(token)) return;

  // Compute per-subject progress (only for selected subjects, in parallel)
  const progressList = await Promise.all(selected.map(s => getSubjectProgress(s.id)));
  if (isStale(token)) return;

  const name = (S.profile?.displayName || S.user.displayName || "Student").split(" ")[0];
  const todayDone = (todaySession?.materialsRead || 0) + (todaySession?.questionsAttempted || 0);
  const goal = Number(S.profile?.dailyGoal || 20);
  const goalPct = Math.min(100, Math.round((todayDone / Math.max(1, goal)) * 100));

  const continueItem = recentMaterials[0];
  const subjectProgressMap = new Map(selected.map((s, i) => [s.id, progressList[i]]));

  setPage(`
    <div class="home-hero">
      <div>
        <h1>Namaste, ${escapeHtml(name)} 👋</h1>
        <p>${continueItem ? `Continue where you left off.` : `Ready to start studying?`} Today: ${todayDone} of ${goal} goal.</p>
      </div>
      <div class="home-streak">
        <div class="home-streak-value">${streak}</div>
        <div class="home-streak-label">Day streak 🔥</div>
      </div>
    </div>

    ${continueItem ? `
      <a class="continue-card" href="#/chapter/${encodeURIComponent(continueItem.chapterId || "")}">
        <div class="continue-icon">▶️</div>
        <div class="continue-body">
          <strong>Continue learning</strong>
          <span class="small">${escapeHtml(continueItem.title || "Material")} · ${continueItem.status === "read" ? "Read" : "Opened"} ${timeAgo(continueItem.updatedAt)}</span>
        </div>
        <span class="continue-arrow">→</span>
      </a>
    ` : ""}

    <div class="section-head"><h2>Quick actions</h2></div>
    <div class="quick-tiles">
      <a class="quick-tile" href="#/all-subjects">
        <span class="quick-tile-icon">🌐</span>
        <span class="quick-tile-label">All Subjects</span>
      </a>
      <a class="quick-tile" href="#/my-subjects">
        <span class="quick-tile-icon">📚</span>
        <span class="quick-tile-label">My Subjects</span>
      </a>
      <a class="quick-tile" href="#/progress">
        <span class="quick-tile-icon">📈</span>
        <span class="quick-tile-label">Progress</span>
      </a>
    </div>

    ${selected.length > 0 ? `
      <div class="section-head"><h2>My subjects</h2><a href="#/my-subjects">Manage →</a></div>
      <div class="grid grid-2">
        ${selected.slice(0, 4).map(s => {
          const p = subjectProgressMap.get(s.id) || {};
          const pct = p.totalMaterials ? Math.round((p.readMaterials / p.totalMaterials) * 100) : 0;
          return `<a class="subject-prog" href="#/subject/${encodeURIComponent(s.id)}">
            <div class="row-between">
              <p class="subject-prog-title">${escapeHtml(s.title || "Subject")}</p>
              <span class="badge">${pct}%</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
            <p class="tiny muted mb-0">${p.readMaterials || 0}/${p.totalMaterials || 0} read · ${p.answered || 0}/${p.totalQuestions || 0} MCQs</p>
          </a>`;
        }).join("")}
      </div>
    ` : `
      <div class="card">
        <h2 class="card-title">Get started</h2>
        <p class="small muted">Add subjects to start your preparation.</p>
        <a class="btn btn-primary" href="#/all-subjects">Browse subjects</a>
      </div>
    `}

    ${recentQuestions.length > 0 ? `
      <div class="section-head"><h2>Recent activity</h2></div>
      <div class="card">
        ${recentQuestions.slice(0, 3).map(q => `<div class="list-item">
          <div class="list-item-main">
            <p class="list-item-title">${escapeHtml((q.title || "Question").slice(0, 80))}</p>
            <div class="list-item-meta">
              <span class="badge ${q.level || "L1"}">${levelLabel(q.level)}</span>
              <span>${q.attempts || 0} attempt${(q.attempts || 0) === 1 ? "" : "s"}</span>
              <span>${timeAgo(q.updatedAt)}</span>
            </div>
          </div>
        </div>`).join("")}
      </div>
    ` : ""}
  `);
}

async function getTodaySession() {
  if (!S.user) return null;
  const key = nepalDateKey();
  try { const s = await getDoc(doc(db, "users", S.user.uid, "studySessions", key)); return s.exists() ? s.data() : null; }
  catch { return null; }
}
async function getStreak() {
  try {
    const snap = await getDocs(query(collection(db, "users", S.user.uid, "studySessions"), orderBy("dateKey","desc"), limit(60)));
    const keys = new Set(snap.docs.map(d => d.data().dateKey).filter(Boolean));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const key = nepalDateKey(today);
      if (keys.has(key)) { streak++; today.setDate(today.getDate() - 1); }
      else if (i === 0) today.setDate(today.getDate() - 1);
      else break;
    }
    return streak;
  } catch { return 0; }
}
async function getRecentMaterials() {
  try {
    const snap = await getDocs(query(collection(db, "users", S.user.uid, "materialProgress"), orderBy("updatedAt","desc"), limit(3)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}
async function getRecentQuestions() {
  try {
    const snap = await getDocs(query(collection(db, "users", S.user.uid, "questionProgress"), orderBy("updatedAt","desc"), limit(5)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}
async function getSubjectProgress(subjectId) {
  try {
    const [totalMaterials, readMaterials, totalQuestions, answered] = await Promise.all([
      getCountFromServer(query(collection(db, "materials"), where("subjectId","==",subjectId), where("status","==","published"))).then(r => r.data().count).catch(() => 0),
      getCountFromServer(query(collection(db, "users", S.user.uid, "materialProgress"), where("subjectId","==",subjectId), where("status","==","read"))).then(r => r.data().count).catch(() => 0),
      getCountFromServer(query(collection(db, "questions"), where("subjectId","==",subjectId), where("status","==","published"))).then(r => r.data().count).catch(() => 0),
      getCountFromServer(query(collection(db, "users", S.user.uid, "questionProgress"), where("subjectId","==",subjectId))).then(r => r.data().count).catch(() => 0)
    ]);
    return { totalMaterials, readMaterials, totalQuestions, answered };
  } catch { return { totalMaterials: 0, readMaterials: 0, totalQuestions: 0, answered: 0 }; }
}

/* ============ ALL SUBJECTS ============ */
async function renderAllSubjects(token) {
  setPage(spinner("Loading…"));
  const [all, selected] = await Promise.all([loadAllSubjects(), loadSelectedSubjects()]);
  if (isStale(token)) return;
  const selectedIds = new Set(selected.map(s => s.id));

  setPage(`
    <div class="page-head"><div><h1 class="page-title">All Subjects</h1>
    <p class="page-sub">Browse and add to your study list.</p></div></div>
    ${all.length === 0
      ? emptyState("No subjects yet", "Administrator hasn't published any subjects.")
      : `<div class="grid grid-2">${all.map(s => {
          const isMine = selectedIds.has(s.id);
          return `<div class="card">
            <div class="row-between"><strong>${escapeHtml(s.title || s.code || "Subject")}</strong>
            ${isMine ? '<span class="badge green">In My Subjects</span>' : ''}</div>
            <p class="small muted mt-8">${escapeHtml(s.description || "")}</p>
            <div class="row mt-8">
              <a class="btn btn-small" href="#/subject/${encodeURIComponent(s.id)}">View</a>
              <button class="btn btn-small ${isMine ? "btn-ghost" : "btn-primary"}" data-add="${escapeHtml(s.id)}" data-title="${escapeHtml(s.title || "")}" data-added="${isMine ? "1" : "0"}">
                ${isMine ? "Remove" : "+ Add"}
              </button>
            </div>
          </div>`;
        }).join("")}</div>`}
  `);

  $$("[data-add]").forEach(b => b.addEventListener("click", async () => {
    b.disabled = true;
    const sid = b.dataset.add;
    const added = b.dataset.added === "1";
    try {
      if (added) await deleteDoc(doc(db, "users", S.user.uid, "selectedSubjects", sid));
      else await setDoc(doc(db, "users", S.user.uid, "selectedSubjects", sid), {
        subjectId: sid, title: b.dataset.title || "", addedAt: serverTimestamp()
      });
      MEM.del("selectedSubjects");
      toast(added ? "Removed." : "Added.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "saving"), "error"); b.disabled = false; }
  }));
}

/* ============ MY SUBJECTS (add + remove + click) ============ */
async function renderMySubjects(token) {
  setPage(spinner("Loading…"));
  const [all, selected] = await Promise.all([loadAllSubjects(), loadSelectedSubjects()]);
  if (isStale(token)) return;

  // Filter out deleted/archived subjects
  const selectedIds = new Set(selected.map(s => s.id));
  const validSubjects = all.filter(s => selectedIds.has(s.id));
  // Auto-clean stale refs
  const stale = selected.filter(s => !all.find(a => a.id === s.id));
  if (stale.length) {
    for (const s of stale) { try { await deleteDoc(doc(db, "users", S.user.uid, "selectedSubjects", s.id)); } catch {} }
    MEM.del("selectedSubjects");
  }

  setPage(`
    <div class="page-head">
      <div><h1 class="page-title">My Subjects</h1><p class="page-sub">Tap a card to open</p></div>
      <button class="btn btn-primary" id="manageBtn">⚙ Manage Subjects</button>
    </div>
    ${validSubjects.length === 0
      ? emptyState("No subjects yet", "Add subjects from All Subjects or use Manage Subjects.", `<button class="btn btn-primary" id="emptyManage">+ Add subjects</button>`)
      : `<div class="grid grid-2">${validSubjects.map(s => `
        <a class="card clickable" href="#/subject/${encodeURIComponent(s.id)}">
          <div class="row-between"><strong>${escapeHtml(s.title || "Subject")}</strong><span class="badge">Open →</span></div>
          <p class="small muted mt-8 mb-0">${escapeHtml(s.description || "Tap to see chapters")}</p>
        </a>`).join("")}</div>`}
  `);

  const openManage = () => openManageSubjects(all, selectedIds);
  $("#manageBtn")?.addEventListener("click", openManage);
  $("#emptyManage")?.addEventListener("click", openManage);
}

function openManageSubjects(allSubjects, selectedIds) {
  const yours = allSubjects.filter(s => selectedIds.has(s.id));
  const available = allSubjects.filter(s => !selectedIds.has(s.id));

  const modal = openModal(`
    <div class="modal-head"><h2>Manage Subjects</h2><button class="modal-close" data-modal-close>✕</button></div>
    <div class="tabs">
      <button class="tab active" data-mtab="yours">Your Subjects (${yours.length})</button>
      <button class="tab" data-mtab="available">Available (${available.length})</button>
    </div>
    <div id="mContent"></div>
  `, true);

  const render = (tab) => {
    $$(".tab", modal).forEach(t => t.classList.toggle("active", t.dataset.mtab === tab));
    const box = $("#mContent", modal);
    if (tab === "yours") {
      box.innerHTML = yours.length === 0
        ? '<p class="small muted center">No subjects yet. Switch to Available to add.</p>'
        : `<div class="stack">${yours.map(s => `
          <div class="card" style="box-shadow:none;margin:0">
            <div class="row-between">
              <strong>${escapeHtml(s.title || "Subject")}</strong>
              <button class="btn btn-small btn-danger" data-remove="${escapeHtml(s.id)}">Remove</button>
            </div>
          </div>`).join("")}</div>`;
      $$("[data-remove]", modal).forEach(b => b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await deleteDoc(doc(db, "users", S.user.uid, "selectedSubjects", b.dataset.remove));
          MEM.del("selectedSubjects");
          toast("Removed.", "success");
          closeModal(); router();
        } catch (err) { toast(friendlyError(err, "removing"), "error"); b.disabled = false; }
      }));
    } else {
      box.innerHTML = available.length === 0
        ? '<p class="small muted center">All subjects added!</p>'
        : `<div class="stack">${available.map(s => `
          <div class="card" style="box-shadow:none;margin:0">
            <div class="row-between">
              <div><strong>${escapeHtml(s.title || "Subject")}</strong><p class="tiny muted mb-0">${escapeHtml(s.description || "")}</p></div>
              <button class="btn btn-small btn-primary" data-add-m="${escapeHtml(s.id)}" data-title="${escapeHtml(s.title || "")}">+ Add</button>
            </div>
          </div>`).join("")}</div>`;
      $$("[data-add-m]", modal).forEach(b => b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await setDoc(doc(db, "users", S.user.uid, "selectedSubjects", b.dataset.addM), {
            subjectId: b.dataset.addM, title: b.dataset.title || "", addedAt: serverTimestamp()
          });
          MEM.del("selectedSubjects");
          toast("Added.", "success");
          closeModal(); router();
        } catch (err) { toast(friendlyError(err, "adding"), "error"); b.disabled = false; }
      }));
    }
  };
  $$(".tab", modal).forEach(t => t.addEventListener("click", () => render(t.dataset.mtab)));
  render("yours");
}

/* ============ SUBJECT DETAIL (clickable chapter cards) ============ */
async function renderSubjectDetail(id, token) {
  if (!id) return setPage(errorState("Not found", "No subject specified."));
  setPage(spinner("Loading subject…"));
  let subject = null;
  try { const s = await getDoc(doc(db, "subjects", id)); if (s.exists()) subject = { id: s.id, ...s.data() }; }
  catch (err) { return setPage(errorState("Error", friendlyError(err, "loading subject"))); }
  if (isStale(token)) return;
  if (!subject) return setPage(emptyState("Subject not found", "May be unpublished."));
  if (subject.status === "archived") return setPage(emptyState("Subject unavailable", "Archived by admin."));

  const chapters = await loadChapters(id);
  if (isStale(token)) return;

  setPage(`
    <div class="breadcrumbs"><a href="#/all-subjects">Subjects</a> / <span>${escapeHtml(subject.title || "")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(subject.title || "Subject")}</h1>
    <p class="page-sub">${escapeHtml(subject.description || "")}</p></div></div>
    ${chapters.length === 0
      ? emptyState("No chapters yet", "No published chapters.")
      : `<div class="stack">${chapters.map(c => `
        <a class="card clickable" href="#/chapter/${encodeURIComponent(c.id)}">
          <div class="row-between">
            <div style="flex:1">
              <strong style="font-size:1.02rem">${c.chapterNumber ? `Chapter ${c.chapterNumber}: ` : ""}${escapeHtml(c.title || "")}</strong>
              <p class="small muted mb-0 mt-8">${escapeHtml(c.description || "Tap to see materials and MCQs →")}</p>
            </div>
          </div>
        </a>`).join("")}</div>`}
  `);
}

/* ============ CHAPTER DETAIL (inline YouTube + PDFs) ============ */
function renderResource(r) {
  const url = safeUrl(r.url);
  if (!url) return "";
  const vid = youtubeId(url);
  if (vid) {
    // Inline YouTube thumbnail with play button
    const title = r.title || "YouTube Video";
    return `<div class="youtube-inline" data-vid="${escapeHtml(vid)}">
      <img src="https://img.youtube.com/vi/${escapeHtml(vid)}/hqdefault.jpg" alt="${escapeHtml(title)}" loading="lazy">
      <div class="play-overlay">
        <div class="play-button">▶</div>
        <div class="play-label">${escapeHtml(title)}</div>
      </div>
    </div>`;
  }
  // PDF / website: icon button
  let icon = "🔗"; let label = r.title || "Link";
  if (r.type === "pdf" || url.toLowerCase().endsWith(".pdf")) { icon = "📄"; if (!r.title) label = "PDF"; }
  else if (r.type === "website") { icon = "🌐"; if (!r.title) label = "Website"; }
  return `<a class="resource-icon-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
    <span class="icon">${icon}</span><span>${escapeHtml(label)}</span>
  </a>`;
}

async function renderChapterDetail(id, token) {
  if (!id) return setPage(errorState("Not found", "No chapter specified."));
  setPage(spinner("Loading chapter…"));
  let chapter = null;
  try { const s = await getDoc(doc(db, "chapters", id)); if (s.exists()) chapter = { id: s.id, ...s.data() }; }
  catch (err) { return setPage(errorState("Error", friendlyError(err, "loading chapter"))); }
  if (isStale(token)) return;
  if (!chapter) return setPage(emptyState("Chapter not found", "May be unpublished."));

  const [materials, questions, progSnap, siblings] = await Promise.all([
    loadMaterials(id),
    loadQuestions(id),
    getDocs(query(collection(db, "users", S.user.uid, "materialProgress"), where("chapterId","==",id), limit(100))).catch(() => null),
    loadChapters(chapter.subjectId || "")
  ]);
  if (isStale(token)) return;

  const readIds = new Set((progSnap?.docs || []).filter(d => d.data().status === "read").map(d => d.data().materialId));
  const byLevel = { L1: questions.filter(q => q.level === "L1").length, L2: questions.filter(q => q.level === "L2").length, L3: questions.filter(q => q.level === "L3").length };
  const idx = siblings.findIndex(c => c.id === id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const materialsHtml = materials.length === 0
    ? `<p class="small muted">No published materials.</p>`
    : materials.map(m => {
        const html = sanitizeHtml(m.html || m.content || "");
        const resources = Array.isArray(m.resources) ? m.resources : [];
        const isRead = readIds.has(m.id);
        return `<div class="material-inline" id="mat-${escapeHtml(m.id)}">
          <div class="material-inline-header">
            <div>
              <h3>${escapeHtml(m.title || "Study Material")}</h3>
              <div class="row mt-8">
                <span class="badge ${escapeHtml(m.level || "L1")}">${levelLabel(m.level)}</span>
                ${m.importance && m.importance !== "normal" ? `<span class="badge ${escapeHtml(m.importance)}">${escapeHtml(m.importance)}</span>` : ""}
              </div>
            </div>
            <button class="material-read-btn ${isRead ? "read" : ""}" data-mark-read="${escapeHtml(m.id)}" type="button">
              ${isRead ? "✓ Read" : "Mark as read"}
            </button>
          </div>
          <div class="reader-content">${html || '<p class="muted small">No content.</p>'}</div>
          ${resources.length ? `<div class="resource-icons">${resources.map(renderResource).join("")}</div>` : ""}
        </div>`;
      }).join("");

  setPage(`
    <div class="breadcrumbs"><a href="#/all-subjects">Subjects</a> / <a href="#/subject/${encodeURIComponent(chapter.subjectId || "")}">Subject</a> / <span>${escapeHtml(chapter.title || "Chapter")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(chapter.title || "Chapter")}</h1>
    <p class="page-sub">${escapeHtml(chapter.description || "")}</p></div></div>

    <div class="card mb-16">
      <h2 class="card-title">📖 Study Materials (${materials.length})</h2>
      <p class="small muted mb-16">Click a video thumbnail to play. PDF links open in a new tab.</p>
      ${materialsHtml}
    </div>

    <div class="card">
      <h2 class="card-title">❓ Practice MCQs (${questions.length})</h2>
      ${questions.length === 0
        ? `<p class="small muted">No MCQs yet.</p>`
        : `<div class="grid grid-3">
            ${["L1","L2","L3"].map(l => byLevel[l] > 0 ? `
              <a class="card clickable" href="#/practice?chapter=${encodeURIComponent(id)}&level=${l}" style="text-align:center">
                <span class="badge ${l}">${levelLabel(l)}</span>
                <p class="stat-value mt-8 mb-0">${byLevel[l]}</p>
                <p class="tiny muted mb-0">questions</p>
              </a>` : "").join("")}
          </div>
          <a class="btn btn-primary btn-block mt-16" href="#/practice?chapter=${encodeURIComponent(id)}">Practice All (${questions.length})</a>`}
    </div>

    <div class="row mt-16" style="justify-content:space-between">
      ${prev ? `<a class="btn" href="#/chapter/${encodeURIComponent(prev.id)}">← ${escapeHtml(prev.title || "Previous")}</a>` : "<span></span>"}
      ${next ? `<a class="btn" href="#/chapter/${encodeURIComponent(next.id)}">${escapeHtml(next.title || "Next")} →</a>` : "<span></span>"}
    </div>
  `);

  // YouTube inline play
  $$(".youtube-inline").forEach(el => el.addEventListener("click", () => {
    const vid = el.dataset.vid;
    el.outerHTML = `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(vid)}?autoplay=1" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }));

  // Mark read
  $$("[data-mark-read]").forEach(btn => btn.addEventListener("click", async () => {
    const mid = btn.dataset.markRead;
    btn.disabled = true;
    try {
      await setDoc(doc(db, "users", S.user.uid, "materialProgress", mid), {
        materialId: mid, chapterId: id, subjectId: chapter.subjectId || "",
        status: "read", readAt: serverTimestamp(), updatedAt: serverTimestamp()
      }, { merge: true });
      await touchSession({ materialsRead: 1 });
      btn.classList.add("read"); btn.textContent = "✓ Read";
      toast("Marked as read.", "success");
    } catch (err) { toast(friendlyError(err, "saving"), "error"); btn.disabled = false; }
  }));
}

/* ============ PRACTICE (instant submit, clickable) ============ */
async function renderPractice(params, token) {
  setPage(spinner("Loading…"));
  const chapterId = params.get("chapter");
  const level = params.get("level");
  const ids = params.get("ids");

  let questions = [];
  try {
    if (ids) {
      for (const id of ids.split(",").slice(0, 100)) {
        const s = await getDoc(doc(db, "questions", id.trim()));
        if (s.exists()) questions.push({ id: s.id, ...s.data() });
      }
    } else if (chapterId) {
      questions = await loadQuestions(chapterId);
      if (level) questions = questions.filter(q => q.level === level);
    }
  } catch (err) { return setPage(errorState("Error", friendlyError(err, "loading"))); }
  if (isStale(token)) return;
  if (!questions.length) return setPage(emptyState("No questions", "No published questions match.", `<a class="btn" href="#/all-subjects">Browse</a>`));

  questions = questions.sort(() => Math.random() - 0.5);
  S.practice = { questions, index: 0, answers: new Map(), submitted: false, recorded: new Set() };
  renderPracticeQuestion();
  bindPracticeKeys();
}

function renderPracticeQuestion() {
  const p = S.practice;
  if (!p) return;
  const q = p.questions[p.index];
  const selected = p.answers.get(q.id);
  const options = q.options || [];
  const isLast = p.index === p.questions.length - 1;
  const answeredCount = p.answers.size;

  setPage(`
    <div class="page-head">
      <div>
        <h1 class="page-title">Practice MCQs</h1>
        <p class="page-sub">Q ${p.index + 1} of ${p.questions.length} · ${answeredCount} answered</p>
      </div>
      <button class="btn btn-primary" id="submitTop">Submit</button>
    </div>
    <div class="question-card">
      <div class="card">
        <div class="row mb-16">
          <span class="badge ${escapeHtml(q.level || "L1")}">${levelLabel(q.level)}</span>
          ${q.importance && q.importance !== "normal" ? `<span class="badge ${escapeHtml(q.importance)}">${escapeHtml(q.importance)}</span>` : ""}
        </div>
        <div class="question-stem">${escapeHtml(q.questionText || "Question")}</div>
        <div class="option-list">
          ${options.map((opt, i) => {
            const key = opt.id || String.fromCharCode(97 + i);
            return `<button class="option-btn ${selected === key ? "selected" : ""}" data-opt="${escapeHtml(key)}" type="button">
              <span class="option-key">${String.fromCharCode(65 + i)}</span>
              <span>${escapeHtml(opt.text || "")}</span>
            </button>`;
          }).join("")}
        </div>
        <div class="row mt-16" style="justify-content:space-between">
          <button class="btn" id="prevBtn" ${p.index === 0 ? "disabled" : ""}>← Previous</button>
          ${isLast
            ? `<button class="btn btn-primary" id="submitBottom">Submit & View Results</button>`
            : `<button class="btn" id="nextBtn">Next →</button>`}
        </div>
      </div>
    </div>
  `);

  $$("[data-opt]").forEach(b => b.addEventListener("click", () => {
    const key = b.dataset.opt;
    p.answers.set(q.id, key);
    // Fire-and-forget progress record (only once per question)
    if (!p.recorded.has(q.id)) {
      p.recorded.add(q.id);
      recordAttempt(q, key);
    }
    renderPracticeQuestion();
  }));

  $("#prevBtn")?.addEventListener("click", () => { if (p.index > 0) { p.index--; renderPracticeQuestion(); } });
  $("#nextBtn")?.addEventListener("click", () => { if (p.index < p.questions.length - 1) { p.index++; renderPracticeQuestion(); } });
  $("#submitTop")?.addEventListener("click", () => submitPractice());
  $("#submitBottom")?.addEventListener("click", () => submitPractice());
}

function bindPracticeKeys() {
  const handler = e => {
    if (["input","textarea","select"].includes((e.target.tagName || "").toLowerCase())) return;
    const p = S.practice; if (!p || p.submitted) return;
    const k = e.key.toLowerCase();
    if (k === "j" && p.index < p.questions.length - 1) { p.index++; renderPracticeQuestion(); }
    else if (k === "k" && p.index > 0) { p.index--; renderPracticeQuestion(); }
    else if (/^[1-6]$/.test(e.key)) {
      const q = p.questions[p.index];
      const opt = (q.options || [])[Number(e.key) - 1];
      if (opt) {
        const key = opt.id || String.fromCharCode(97 + Number(e.key) - 1);
        p.answers.set(q.id, key);
        if (!p.recorded.has(q.id)) { p.recorded.add(q.id); recordAttempt(q, key); }
        renderPracticeQuestion();
      }
    }
  };
  document.addEventListener("keydown", handler);
  S.pageCleanup = () => document.removeEventListener("keydown", handler);
}

function submitPractice() {
  const p = S.practice;
  if (!p || p.submitted) return;
  p.submitted = true;
  renderPracticeResults(); // Instant — no Firestore loops
}

function renderPracticeResults() {
  const p = S.practice;
  if (!p) return;
  let correct = 0, incorrect = 0, unanswered = 0;
  p.questions.forEach(q => {
    const sel = p.answers.get(q.id);
    if (!sel) unanswered++;
    else if (sel === q.correctOptionId) correct++;
    else incorrect++;
  });
  const total = p.questions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  setPage(`
    <div class="page-head">
      <div><h1 class="page-title">Practice Results</h1></div>
      <div class="row"><button class="btn" id="retryBtn">🔄 Retry</button><a class="btn btn-primary" href="#/all-subjects">Done</a></div>
    </div>
    <div class="result-hero mb-16">
      <div class="result-score">${pct}%</div>
      <div class="result-status">${correct} of ${total} correct</div>
    </div>
    <div class="grid grid-3 mb-16">
      <div class="stat-card" style="background:var(--green);color:#fff;border:0"><div class="stat-value">${correct}</div><div class="stat-label" style="color:rgba(255,255,255,.85)">Correct</div></div>
      <div class="stat-card" style="background:var(--red);color:#fff;border:0"><div class="stat-value">${incorrect}</div><div class="stat-label" style="color:rgba(255,255,255,.85)">Incorrect</div></div>
      <div class="stat-card"><div class="stat-value">${unanswered}</div><div class="stat-label">Unanswered</div></div>
    </div>
    <div class="card">
      <h2 class="card-title">Review</h2>
      ${p.questions.map((q, i) => {
        const sel = p.answers.get(q.id);
        const isCorrect = sel === q.correctOptionId;
        const isWrong = sel && !isCorrect;
        const options = q.options || [];
        return `<div class="card mb-16" style="box-shadow:none">
          <div class="row-between mb-8">
            <strong>Q${i + 1}. ${escapeHtml(q.questionText || "")}</strong>
            <span class="badge ${!sel ? "" : isCorrect ? "green" : "red"}">${!sel ? "Unanswered" : isCorrect ? "Correct" : "Incorrect"}</span>
          </div>
          <div class="option-list">
            ${options.map((o, oi) => {
              const key = o.id || String.fromCharCode(97 + oi);
              const isRight = key === q.correctOptionId;
              const isChosen = sel === key;
              const cls = isRight ? "result-correct" : (isChosen && !isRight ? "result-wrong" : "result-neutral");
              const marker = isRight ? " ✓" : (isChosen && !isRight ? " ✗ your answer" : "");
              return `<div class="option-btn ${cls}" style="cursor:default">
                <span class="option-key">${String.fromCharCode(65 + oi)}</span>
                <span>${escapeHtml(o.text || "")}${marker}</span>
              </div>`;
            }).join("")}
          </div>
          ${q.explanation ? `<div class="explanation-box"><h4>Explanation</h4><p>${sanitizeHtml(q.explanation)}</p></div>` : ""}
        </div>`;
      }).join("")}
    </div>
    <div class="row mt-16" style="justify-content:center">
      <button class="btn btn-primary" id="retryBtn2">🔄 Retry</button>
      <a class="btn" href="#/all-subjects">Back</a>
    </div>
  `);
  $("#retryBtn")?.addEventListener("click", () => router());
  $("#retryBtn2")?.addEventListener("click", () => router());
}

async function recordAttempt(q, selected) {
  const correct = selected === q.correctOptionId;
  try {
    const ref = doc(db, "users", S.user.uid, "questionProgress", q.id);
    const snap = await getDoc(ref);
    const d = snap.exists() ? snap.data() : {};
    await setDoc(ref, {
      questionId: q.id, title: q.questionText || "", chapterId: q.chapterId || "", subjectId: q.subjectId || "",
      level: q.level || "L1", attempts: (d.attempts || 0) + 1, correct: (d.correct || 0) + (correct ? 1 : 0),
      lastCorrect: correct, updatedAt: serverTimestamp()
    }, { merge: true });
    await touchSession({ questionsAttempted: 1 });
  } catch (err) { console.warn("Save attempt failed", err); }
}

async function touchSession(updates) {
  if (!S.user) return;
  const key = nepalDateKey();
  try {
    const ref = doc(db, "users", S.user.uid, "studySessions", key);
    const snap = await getDoc(ref);
    const d = snap.exists() ? snap.data() : {};
    const merged = { dateKey: key, updatedAt: serverTimestamp() };
    Object.entries(updates).forEach(([k, v]) => { merged[k] = (d[k] || 0) + (typeof v === "number" ? v : 0); });
    await setDoc(ref, merged, { merge: true });
    MEM.del("todaySession");
  } catch (err) { console.warn("Session save failed", err); }
}

/* ============ PROGRESS, SAVED, PROFILE ============ */
async function renderProgress(token) {
  setPage(spinner("Loading…"));
  const [readSnap, qpSnap] = await Promise.all([
    getDocs(query(collection(db, "users", S.user.uid, "materialProgress"), where("status","==","read"), limit(500))).catch(() => null),
    getDocs(query(collection(db, "users", S.user.uid, "questionProgress"), limit(500))).catch(() => null)
  ]);
  if (isStale(token)) return;
  const read = readSnap?.size || 0;
  const qp = (qpSnap?.docs || []).map(d => d.data());
  const attempted = qp.filter(q => (q.attempts || 0) > 0).length;
  const correct = qp.reduce((a, q) => a + (q.correct || 0), 0);
  setPage(`
    <div class="page-head"><div><h1 class="page-title">Progress</h1></div></div>
    <div class="grid grid-4 mb-16">
      <div class="stat-card"><div class="stat-value">${read}</div><div class="stat-label">Materials read</div></div>
      <div class="stat-card"><div class="stat-value">${attempted}</div><div class="stat-label">Attempted</div></div>
      <div class="stat-card"><div class="stat-value">${correct}</div><div class="stat-label">Correct</div></div>
      <div class="stat-card"><div class="stat-value">${attempted ? Math.round(correct / Math.max(1, attempted) * 100) : 0}%</div><div class="stat-label">Accuracy</div></div>
    </div>
  `);
}
async function renderSaved(token) {
  setPage(spinner("Loading…"));
  const snap = await getDocs(query(collection(db, "users", S.user.uid, "savedItems"), limit(100))).catch(() => null);
  if (isStale(token)) return;
  const items = (snap?.docs || []).map(d => ({ id: d.id, ...d.data() }));
  setPage(`
    <div class="page-head"><div><h1 class="page-title">Saved</h1></div></div>
    ${items.length ? `<div class="stack">${items.map(i => `<div class="card"><strong>${escapeHtml(i.title || "Saved")}</strong>${i.href ? `<a class="btn btn-small mt-8" href="${escapeHtml(i.href)}">Open</a>` : ""}</div>`).join("")}</div>` : emptyState("Nothing saved", "Bookmark items to see them here.")}
  `);
}
function renderProfile() {
  const u = S.user;
  const name = S.profile?.displayName || u.displayName || u.email?.split("@")[0] || "Student";
  setPage(`
    <div class="page-head"><div><h1 class="page-title">My Profile</h1></div>
    <button class="btn btn-danger" id="profileLogout">Logout</button></div>
    <div class="card mb-16">
      <div class="row">
        <span class="avatar" style="width:70px;height:70px;font-size:1.6rem">${escapeHtml((name.charAt(0) || "S").toUpperCase())}</span>
        <div><h2 class="mb-0">${escapeHtml(name)}</h2>
        <p class="small muted mb-0">${escapeHtml(u.email || "")}</p>
        <span class="badge ${u.emailVerified ? "green" : "amber"}">${u.emailVerified ? "✓ Verified" : "⚠ Unverified"}</span>
        ${S.isOwner ? ' <span class="badge">Owner</span>' : ""}</div>
      </div>
    </div>
    <div class="card">
      <h2 class="card-title">Account</h2>
      <div class="form-grid">
        <div><label>Display name</label><input id="profName" value="${escapeHtml(S.profile?.displayName || name)}"></div>
        <div><label>Daily goal</label><input id="profGoal" type="number" min="5" max="200" value="${S.profile?.dailyGoal || 20}"></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" id="profSave">Save</button></div>
    </div>
  `);
  $("#profileLogout")?.addEventListener("click", doLogout);
  $("#profSave")?.addEventListener("click", async () => {
    try {
      const n = $("#profName").value.trim();
      const g = Number($("#profGoal").value || 20);
      await updateProfile(u, { displayName: n });
      await updateDoc(doc(db, "users", u.uid), { displayName: n, dailyGoal: g, updatedAt: serverTimestamp() });
      S.profile = { ...(S.profile || {}), displayName: n, dailyGoal: g };
      renderProfileChrome(); toast("Saved.", "success");
    } catch (err) { toast(friendlyError(err, "saving"), "error"); }
  });
}
function renderSettings() {
  setPage(`
    <div class="page-head"><div><h1 class="page-title">Settings</h1></div></div>
    <div class="card mb-16">
      <h2 class="card-title">Appearance</h2>
      <div class="row">
        <button class="btn" onclick="document.getElementById('themeToggle').click()">Toggle Dark/Light</button>
        <button class="btn btn-danger" onclick="document.getElementById('logoutBtn').click()">Logout</button>
      </div>
    </div>
  `);
}

/* ============ ADMIN ============ */
async function renderAdmin(segs, token) {
  if (!S.isOwner && !S.isAdmin) return setPage(emptyState("Admin only", "Restricted."));
  if (!S.user.emailVerified) {
    setPage(`<div class="card"><h2>Verify email</h2><button class="btn btn-primary" id="vBtn">Resend</button></div>`);
    $("#vBtn")?.addEventListener("click", resendVerify);
    return;
  }
  const section = segs[0];
  if (!section) {
    setPage(`
      <div class="page-head"><div><h1 class="page-title">Admin Panel</h1></div><a class="btn" href="#/home">Exit</a></div>
      <div class="admin-grid">
        <a href="#/admin/subjects" class="admin-card"><strong>📚 Subjects</strong><span>Manage subjects, chapters, materials, MCQs</span></a>
        <a href="#/admin/import" class="admin-card"><strong>📦 JSON Import/Export</strong><span>Bulk load and export content</span></a>
      </div>
    `);
    return;
  }
  if (section === "subjects") return renderAdminSubjects(token);
  if (section === "subject") return renderAdminSubjectDetail(segs[1], token);
  if (section === "chapter") return renderAdminChapterDetail(segs[1], token);
  if (section === "import") return renderAdminImport(token);
  setPage(errorState("Unknown section", "Does not exist."));
}

async function renderAdminSubjects(token) {
  setPage(spinner("Loading…"));
  const snap = await getDocs(query(collection(db, "subjects"), limit(300))).catch(() => null);
  if (isStale(token)) return;
  const subjects = (snap?.docs || []).map(d => ({ id: d.id, ...d.data() }));
  setPage(`
    <div class="page-head"><div><h1 class="page-title">Manage Subjects</h1>
    <p class="page-sub">${subjects.length} total</p></div>
    <div class="row"><a class="btn" href="#/admin">← Back</a><button class="btn btn-primary" id="newSub">+ New</button></div></div>
    ${subjects.length === 0
      ? emptyState("No subjects", "Create your first subject.")
      : `<div class="stack">${subjects.map(s => `<div class="card">
          <div class="row-between">
            <div><strong>${escapeHtml(s.title || "Untitled")}</strong><div class="list-item-meta mt-8">${statusBadge(s.status)}</div></div>
            <div class="row">
              <a class="btn btn-small btn-primary" href="#/admin/subject/${encodeURIComponent(s.id)}">Chapters</a>
              <button class="btn btn-small" data-edit="${escapeHtml(s.id)}">Edit</button>
              <button class="btn btn-small btn-danger" data-del="${escapeHtml(s.id)}" data-title="${escapeHtml(s.title || "")}">Delete</button>
            </div>
          </div>
        </div>`).join("")}</div>`}
  `);
  $("#newSub")?.addEventListener("click", () => openSubjectForm(null));
  $$("[data-edit]").forEach(b => b.addEventListener("click", () => openSubjectForm(b.dataset.edit)));
  $$("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmDialog(`Delete "${b.dataset.title}"?`, { danger: true, confirmText: "Delete" }))) return;
    try { await deleteDoc(doc(db, "subjects", b.dataset.del)); MEM.clear(); toast("Deleted.", "success"); router(); }
    catch (err) { toast(friendlyError(err, "deleting"), "error"); }
  }));
}

function openSubjectForm(id) {
  (async () => {
    let ex = {};
    if (id) { const s = await getDoc(doc(db, "subjects", id)); if (s.exists()) ex = s.data(); }
    openModal(`
      <div class="modal-head"><h2>${id ? "Edit" : "New"} Subject</h2><button class="modal-close" data-modal-close>✕</button></div>
      <div class="form-grid">
        <div><label>Title <span class="required">*</span></label><input id="subTitle" value="${escapeHtml(ex.title || "")}"></div>
        <div><label>Description</label><textarea id="subDesc">${escapeHtml(ex.description || "")}</textarea></div>
        <div><label>Status</label><select id="subStatus">
          <option value="draft" ${ex.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${ex.status === "published" ? "selected" : ""}>Published</option>
          <option value="archived" ${ex.status === "archived" ? "selected" : ""}>Archived</option>
        </select></div>
      </div>
      <div class="form-actions"><button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="saveSub">Save</button></div>
    `, true);
    $("#saveSub").onclick = async () => {
      const btn = $("#saveSub"); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const title = $("#subTitle").value.trim();
        if (!title) { toast("Title required.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        const data = { title, description: $("#subDesc").value.trim(), status: $("#subStatus").value, updatedAt: serverTimestamp() };
        if (!id) data.createdAt = serverTimestamp();
        const ref = id ? doc(db, "subjects", id) : doc(collection(db, "subjects"));
        await setDoc(ref, data, { merge: true });
        MEM.clear();
        toast("Saved.", "success"); closeModal(); router();
      } catch (err) { toast(friendlyError(err, "saving"), "error"); btn.disabled = false; btn.textContent = "Save"; }
    };
  })();
}

async function renderAdminSubjectDetail(subjectId, token) {
  if (!subjectId) return setPage(errorState("Not found", "No ID."));
  setPage(spinner("Loading…"));
  let subject = null;
  try { const s = await getDoc(doc(db, "subjects", subjectId)); if (s.exists()) subject = { id: s.id, ...s.data() }; }
  catch (err) { return setPage(errorState("Error", friendlyError(err, "loading"))); }
  if (isStale(token)) return;
  if (!subject) return setPage(emptyState("Not found", "Deleted."));
  const chSnap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",subjectId), limit(300))).catch(() => null);
  if (isStale(token)) return;
  const chapters = (chSnap?.docs || []).map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));

  setPage(`
    <div class="breadcrumbs"><a href="#/admin/subjects">Subjects</a> / <span>${escapeHtml(subject.title || "")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(subject.title || "")} — Chapters</h1>
    <p class="page-sub">${chapters.length} chapters</p></div>
    <div class="row"><a class="btn" href="#/admin/subjects">← Back</a><button class="btn btn-primary" id="newCh">+ New Chapter</button></div></div>
    ${chapters.length === 0
      ? emptyState("No chapters", "Create your first chapter.")
      : `<div class="stack">${chapters.map(c => `<div class="card">
          <div class="row-between">
            <div><strong>${c.chapterNumber ? `Ch ${c.chapterNumber}: ` : ""}${escapeHtml(c.title || "")}</strong><div class="list-item-meta mt-8">${statusBadge(c.status)}</div></div>
            <div class="row">
              <a class="btn btn-small btn-primary" href="#/admin/chapter/${encodeURIComponent(c.id)}">Open</a>
              <button class="btn btn-small" data-edit="${escapeHtml(c.id)}">Edit</button>
              <button class="btn btn-small btn-danger" data-del="${escapeHtml(c.id)}">Delete</button>
            </div>
          </div>
        </div>`).join("")}</div>`}
  `);
  $("#newCh")?.addEventListener("click", () => openChapterForm(subjectId, null));
  $$("[data-edit]").forEach(b => b.addEventListener("click", () => openChapterForm(subjectId, b.dataset.edit)));
  $$("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmDialog("Delete this chapter?", { danger: true, confirmText: "Delete" }))) return;
    try { await deleteDoc(doc(db, "chapters", b.dataset.del)); MEM.clear(); toast("Deleted.", "success"); router(); }
    catch (err) { toast(friendlyError(err, "deleting"), "error"); }
  }));
}

function openChapterForm(subjectId, id) {
  (async () => {
    let ex = {};
    if (id) { const s = await getDoc(doc(db, "chapters", id)); if (s.exists()) ex = s.data(); }
    openModal(`
      <div class="modal-head"><h2>${id ? "Edit" : "New"} Chapter</h2><button class="modal-close" data-modal-close>✕</button></div>
      <div class="form-grid">
        <div><label>Chapter number</label><input id="chNum" type="number" value="${ex.chapterNumber || 1}"></div>
        <div><label>Title <span class="required">*</span></label><input id="chTitle" value="${escapeHtml(ex.title || "")}"></div>
        <div><label>Description</label><textarea id="chDesc">${escapeHtml(ex.description || "")}</textarea></div>
        <div><label>Status</label><select id="chStatus">
          <option value="draft" ${ex.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${ex.status === "published" ? "selected" : ""}>Published</option>
          <option value="archived" ${ex.status === "archived" ? "selected" : ""}>Archived</option>
        </select></div>
      </div>
      <div class="form-actions"><button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="saveCh">Save</button></div>
    `, true);
    $("#saveCh").onclick = async () => {
      const btn = $("#saveCh"); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const title = $("#chTitle").value.trim();
        if (!title) { toast("Title required.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        const data = { title, chapterNumber: Number($("#chNum").value || 1), description: $("#chDesc").value.trim(), subjectId, status: $("#chStatus").value, updatedAt: serverTimestamp() };
        if (!id) data.createdAt = serverTimestamp();
        const ref = id ? doc(db, "chapters", id) : doc(collection(db, "chapters"));
        await setDoc(ref, data, { merge: true });
        MEM.clear();
        toast("Saved.", "success"); closeModal(); router();
      } catch (err) { toast(friendlyError(err, "saving"), "error"); btn.disabled = false; btn.textContent = "Save"; }
    };
  })();
}

async function renderAdminChapterDetail(chapterId, token) {
  if (!chapterId) return setPage(errorState("Not found", "No ID."));
  setPage(spinner("Loading…"));
  let chapter = null;
  try { const s = await getDoc(doc(db, "chapters", chapterId)); if (s.exists()) chapter = { id: s.id, ...s.data() }; }
  catch (err) { return setPage(errorState("Error", friendlyError(err, "loading"))); }
  if (isStale(token)) return;
  if (!chapter) return setPage(emptyState("Not found", "Deleted."));

  const [matSnap, qSnap] = await Promise.all([
    getDocs(query(collection(db, "materials"), where("chapterId","==",chapterId), limit(100))).catch(() => null),
    getDocs(query(collection(db, "questions"), where("chapterId","==",chapterId), limit(500))).catch(() => null)
  ]);
  if (isStale(token)) return;
  const materials = (matSnap?.docs || []).map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  const questions = (qSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }));

  setPage(`
    <div class="breadcrumbs"><a href="#/admin/subjects">Subjects</a> / <a href="#/admin/subject/${encodeURIComponent(chapter.subjectId || "")}">Chapters</a> / <span>${escapeHtml(chapter.title || "")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(chapter.title || "")}</h1></div>
    <a class="btn" href="#/admin/subject/${encodeURIComponent(chapter.subjectId || "")}">← Back</a></div>
    <div class="tabs">
      <button class="tab active" data-tab="materials">📖 Materials (${materials.length})</button>
      <button class="tab" data-tab="mcqs">❓ MCQs (${questions.length})</button>
    </div>
    <div id="tabContent"></div>
  `);

  const renderTab = (tab) => {
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    const box = $("#tabContent");
    if (tab === "materials") {
      box.innerHTML = `
        <div class="row mb-16">
          <button class="btn btn-primary" id="addMat">+ Add Material</button>
          <span style="flex:1"></span>
          <button class="btn" id="impMat">📥 Import</button>
          <button class="btn" id="expMat">📤 Export</button>
        </div>
        ${materials.length === 0 ? emptyState("No materials", "Add your first.")
          : `<div class="stack">${materials.map(m => `<div class="card">
              <div class="row-between">
                <div><strong>${escapeHtml(m.title || "")}</strong>
                  <div class="list-item-meta mt-8"><span class="badge ${m.level || "L1"}">${levelLabel(m.level)}</span>${statusBadge(m.status)}</div>
                </div>
                <div class="row">
                  <button class="btn btn-small" data-preview="${escapeHtml(m.id)}">Preview</button>
                  <button class="btn btn-small" data-edit="${escapeHtml(m.id)}">Edit</button>
                  <button class="btn btn-small btn-danger" data-del="${escapeHtml(m.id)}">Delete</button>
                </div>
              </div>
            </div>`).join("")}</div>`}`;
      $("#addMat").onclick = () => openMaterialForm(chapterId, null, chapter.subjectId || "");
      $$("[data-edit]").forEach(b => b.addEventListener("click", () => openMaterialForm(chapterId, b.dataset.edit, chapter.subjectId || "")));
      $$("[data-preview]").forEach(b => b.addEventListener("click", async () => {
        const s = await getDoc(doc(db, "materials", b.dataset.preview));
        if (!s.exists()) return;
        openModal(`<div class="modal-head"><h2>${escapeHtml(s.data().title || "")}</h2><button class="modal-close" data-modal-close>✕</button></div><div class="reader-content">${sanitizeHtml(s.data().html || "")}</div>`, true);
      }));
      $$("[data-del]").forEach(b => b.addEventListener("click", async () => {
        if (!(await confirmDialog("Delete?", { danger: true, confirmText: "Delete" }))) return;
        try { await deleteDoc(doc(db, "materials", b.dataset.del)); MEM.clear(); router(); }
        catch (err) { toast(friendlyError(err, "deleting"), "error"); }
      }));
      $("#impMat").onclick = () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = ".json";
        input.onchange = async e => {
          const file = e.target.files[0]; if (!file) return;
          try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const items = Array.isArray(parsed) ? parsed : (parsed.materials || [parsed]);
            if (!(await confirmDialog(`Import ${items.length} materials?`, { confirmText: "Import" }))) return;
            for (const m of items) {
              const ref = m.id ? doc(db, "materials", m.id) : doc(collection(db, "materials"));
              await setDoc(ref, { title: m.title || "Imported", html: m.html || m.content || "", level: m.level || "L1", importance: m.importance || "normal", resources: m.resources || [], chapterId, subjectId: chapter.subjectId || "", order: Number(m.order || 0), status: m.status || "draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
            }
            MEM.clear(); toast(`Imported ${items.length}.`, "success"); router();
          } catch (err) { toast(friendlyError(err, "importing"), "error"); }
        };
        input.click();
      };
      $("#expMat").onclick = () => {
        const data = materials.map(m => ({ title: m.title, html: m.html, level: m.level, importance: m.importance, resources: m.resources || [], order: m.order || 0, status: m.status }));
        downloadFile(`materials-${chapterId}.json`, JSON.stringify({ materials: data }, null, 2), "application/json");
      };
    } else {
      box.innerHTML = `
        <div class="row mb-16">
          <button class="btn btn-primary" id="addQ">+ Add MCQ</button>
          <select id="qFilter" style="min-height:44px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface)">
            <option value="">All (${questions.length})</option>
            <option value="L1">L1 (${questions.filter(q => q.level === "L1").length})</option>
            <option value="L2">L2 (${questions.filter(q => q.level === "L2").length})</option>
            <option value="L3">L3 (${questions.filter(q => q.level === "L3").length})</option>
          </select>
          <span style="flex:1"></span>
          <button class="btn" id="impQ">📥 Import MCQs</button>
          <button class="btn" id="expQ">📤 Export MCQs</button>
        </div>
        <div id="qList"></div>
      `;
      const renderList = (filter = "") => {
        const filtered = filter ? questions.filter(q => q.level === filter) : questions;
        $("#qList").innerHTML = filtered.length === 0
          ? emptyState("No questions", "Add your first.")
          : `<div class="stack">${filtered.map(q => `<div class="card">
              <div class="row-between">
                <div style="flex:1"><strong>${escapeHtml((q.questionText || "").slice(0, 100))}</strong>
                  <div class="list-item-meta mt-8"><span class="badge ${q.level || "L1"}">${levelLabel(q.level)}</span>${statusBadge(q.status)}</div>
                </div>
                <div class="row">
                  <button class="btn btn-small" data-preview="${escapeHtml(q.id)}">Preview</button>
                  <button class="btn btn-small" data-edit="${escapeHtml(q.id)}">Edit</button>
                  <button class="btn btn-small btn-danger" data-del="${escapeHtml(q.id)}">Delete</button>
                </div>
              </div>
            </div>`).join("")}</div>`;
        $$("[data-edit]").forEach(b => b.addEventListener("click", () => openQuestionForm(chapterId, b.dataset.edit, chapter.subjectId || "")));
        $$("[data-preview]").forEach(b => b.addEventListener("click", async () => {
          const s = await getDoc(doc(db, "questions", b.dataset.preview));
          if (!s.exists()) return;
          const q = s.data();
          openModal(`<div class="modal-head"><h2>Preview</h2><button class="modal-close" data-modal-close>✕</button></div>
            <div class="question-stem">${escapeHtml(q.questionText || "")}</div>
            <div class="option-list">${(q.options || []).map((o, i) => {
              const isCorrect = (o.id || String.fromCharCode(97 + i)) === q.correctOptionId;
              return `<div class="option-btn ${isCorrect ? "correct" : ""}" style="cursor:default"><span class="option-key">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(o.text || "")} ${isCorrect ? "(correct)" : ""}</span></div>`;
            }).join("")}</div>`, true);
        }));
        $$("[data-del]").forEach(b => b.addEventListener("click", async () => {
          if (!(await confirmDialog("Delete?", { danger: true, confirmText: "Delete" }))) return;
          try { await deleteDoc(doc(db, "questions", b.dataset.del)); MEM.clear(); router(); }
          catch (err) { toast(friendlyError(err, "deleting"), "error"); }
        }));
      };
      renderList();
      $("#qFilter").onchange = e => renderList(e.target.value);
      $("#addQ").onclick = () => openQuestionForm(chapterId, null, chapter.subjectId || "");
      $("#impQ").onclick = () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = ".json";
        input.onchange = async e => {
          const file = e.target.files[0]; if (!file) return;
          try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const items = Array.isArray(parsed) ? parsed : (parsed.questions || [parsed]);
            const errors = [];
            items.forEach((q, i) => {
              if (!q.questionText) errors.push(`Row ${i + 1}: no questionText`);
              if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`Row ${i + 1}: needs ≥2 options`);
              if (q.options && !q.options.some(o => o.id === q.correctOptionId)) errors.push(`Row ${i + 1}: invalid correctOptionId`);
            });
            if (errors.length) return toast(`${errors.length} error(s): ${errors[0]}`, "error", 6000);
            if (!(await confirmDialog(`Import ${items.length} MCQs?`, { confirmText: "Import" }))) return;
            for (const q of items) {
              const ref = q.id ? doc(db, "questions", q.id) : doc(collection(db, "questions"));
              await setDoc(ref, { questionText: q.questionText, options: q.options, correctOptionId: q.correctOptionId, explanation: q.explanation || "", level: q.level || "L1", importance: q.importance || "normal", chapterId, subjectId: chapter.subjectId || "", order: Number(q.order || 0), status: q.status || "draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
            }
            MEM.clear(); toast(`Imported ${items.length}.`, "success"); router();
          } catch (err) { toast(friendlyError(err, "importing"), "error"); }
        };
        input.click();
      };
      $("#expQ").onclick = () => {
        const data = questions.map(q => ({ questionText: q.questionText, options: q.options, correctOptionId: q.correctOptionId, explanation: q.explanation || "", level: q.level, importance: q.importance || "normal", order: q.order || 0, status: q.status }));
        downloadFile(`mcqs-${chapterId}.json`, JSON.stringify({ questions: data }, null, 2), "application/json");
      };
    }
  };
  $$(".tab").forEach(t => t.addEventListener("click", () => renderTab(t.dataset.tab)));
  renderTab("materials");
}

function openMaterialForm(chapterId, id, subjectId) {
  (async () => {
    let ex = {};
    if (id) { const s = await getDoc(doc(db, "materials", id)); if (s.exists()) ex = s.data(); }
    S.editResources = Array.isArray(ex.resources) ? JSON.parse(JSON.stringify(ex.resources)) : [];
    renderResEditor();
    openModal(`
      <div class="modal-head"><h2>${id ? "Edit" : "New"} Material</h2><button class="modal-close" data-modal-close>✕</button></div>
      <div class="form-grid">
        <div><label>Title <span class="required">*</span></label><input id="mTitle" value="${escapeHtml(ex.title || "")}"></div>
        <div><label>Level</label><select id="mLevel">
          <option value="L1" ${ex.level === "L1" ? "selected" : ""}>L1</option>
          <option value="L2" ${ex.level === "L2" ? "selected" : ""}>L2</option>
          <option value="L3" ${ex.level === "L3" ? "selected" : ""}>L3</option>
        </select></div>
        <div><label>HTML Content <span class="required">*</span></label>
          <textarea id="mHtml" rows="12" placeholder="<h2>Heading</h2><p>Text</p><ul><li>Point</li></ul><table>...</table>">${escapeHtml(ex.html || "")}</textarea>
        </div>
        <div><label>Resources (YouTube / PDF / Website)</label>
          <div id="resBox"></div>
          <button class="btn btn-small mt-8" id="addRes" type="button">+ Add Resource</button>
        </div>
        <div><label>Status</label><select id="mStatus">
          <option value="draft" ${ex.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${ex.status === "published" ? "selected" : ""}>Published</option>
          <option value="archived" ${ex.status === "archived" ? "selected" : ""}>Archived</option>
        </select></div>
      </div>
      <div class="form-actions"><button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="saveMat">Save</button></div>
    `, true);
    function renderResEditor() {
      const box = $("#resBox"); if (!box) return;
      box.innerHTML = S.editResources.map((r, i) => `
        <div class="editor-option">
          <div class="mini-row"><input type="text" data-rt="${i}" value="${escapeHtml(r.title || "")}" placeholder="Title" style="flex:1"></div>
          <div class="mini-row mt-8">
            <input type="url" data-ru="${i}" value="${escapeHtml(r.url || "")}" placeholder="https://..." style="flex:1">
            <select data-rty="${i}">
              <option value="youtube" ${r.type === "youtube" ? "selected" : ""}>YouTube</option>
              <option value="pdf" ${r.type === "pdf" ? "selected" : ""}>PDF</option>
              <option value="website" ${r.type === "website" ? "selected" : ""}>Website</option>
            </select>
            <button class="btn btn-small btn-danger" type="button" data-rr="${i}">✕</button>
          </div>
        </div>`).join("");
      $$("[data-rt]").forEach(i => i.addEventListener("input", () => { S.editResources[+i.dataset.rt].title = i.value; }));
      $$("[data-ru]").forEach(i => i.addEventListener("input", () => { S.editResources[+i.dataset.ru].url = i.value; }));
      $$("[data-rty]").forEach(s => s.addEventListener("change", () => { S.editResources[+s.dataset.rty].type = s.value; }));
      $$("[data-rr]").forEach(b => b.addEventListener("click", () => { S.editResources.splice(+b.dataset.rr, 1); renderResEditor(); }));
    }
    renderResEditor();
    $("#addRes").onclick = () => { S.editResources.push({ title: "", url: "", type: "youtube" }); renderResEditor(); };
    $("#saveMat").onclick = async () => {
      const btn = $("#saveMat"); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const title = $("#mTitle").value.trim();
        const html = $("#mHtml").value;
        if (!title || !html.trim()) { toast("Title and HTML required.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        const data = { title, html, level: $("#mLevel").value, resources: S.editResources.filter(r => r.url && r.title), chapterId, subjectId, order: 0, status: $("#mStatus").value, updatedAt: serverTimestamp() };
        if (!id) data.createdAt = serverTimestamp();
        const ref = id ? doc(db, "materials", id) : doc(collection(db, "materials"));
        await setDoc(ref, data, { merge: true });
        MEM.clear();
        toast("Saved.", "success"); closeModal(); router();
      } catch (err) { toast(friendlyError(err, "saving"), "error"); btn.disabled = false; btn.textContent = "Save"; }
    };
  })();
}

function openQuestionForm(chapterId, id, subjectId) {
  (async () => {
    let ex = {};
    if (id) { const s = await getDoc(doc(db, "questions", id)); if (s.exists()) ex = s.data(); }
    S.editOptions = Array.isArray(ex.options) && ex.options.length ? JSON.parse(JSON.stringify(ex.options)) : [{ id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }, { id: "d", text: "" }];
    S.editCorrectId = ex.correctOptionId || "a";
    openModal(`
      <div class="modal-head"><h2>${id ? "Edit" : "New"} MCQ</h2><button class="modal-close" data-modal-close>✕</button></div>
      <div class="form-grid">
        <div><label>Question <span class="required">*</span></label><textarea id="qText" rows="3">${escapeHtml(ex.questionText || "")}</textarea></div>
        <div><label>Level</label><select id="qLevel">
          <option value="L1" ${ex.level === "L1" ? "selected" : ""}>L1 · Easy</option>
          <option value="L2" ${ex.level === "L2" ? "selected" : ""}>L2 · Medium</option>
          <option value="L3" ${ex.level === "L3" ? "selected" : ""}>L3 · Hard</option>
        </select></div>
        <div><label>Options <span class="required">*</span></label><div id="optBox"></div><button class="btn btn-small mt-8" id="addOpt" type="button">+ Add</button></div>
        <div><label>Explanation</label><textarea id="qExpl" rows="3">${escapeHtml(ex.explanation || "")}</textarea></div>
        <div><label>Status</label><select id="qStatus">
          <option value="draft" ${ex.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${ex.status === "published" ? "selected" : ""}>Published</option>
          <option value="archived" ${ex.status === "archived" ? "selected" : ""}>Archived</option>
        </select></div>
      </div>
      <div class="form-actions"><button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="saveQ">Save</button></div>
    `, true);
    function renderOpts() {
      const box = $("#optBox"); if (!box) return;
      box.innerHTML = S.editOptions.map((o, i) => `
        <div class="editor-option">
          <div class="mini-row">
            <input type="text" data-ot="${i}" value="${escapeHtml(o.text || "")}" placeholder="Option ${String.fromCharCode(65 + i)}" style="flex:1">
            <label class="small"><input type="radio" name="corr" value="${escapeHtml(o.id)}" ${S.editCorrectId === o.id ? "checked" : ""}> Correct</label>
            <button class="btn btn-small btn-danger" type="button" data-or="${i}" ${S.editOptions.length <= 2 ? "disabled" : ""}>✕</button>
          </div>
        </div>`).join("");
      $$("[data-ot]").forEach(i => i.addEventListener("input", () => { S.editOptions[+i.dataset.ot].text = i.value; }));
      $$('input[name="corr"]').forEach(r => r.addEventListener("change", () => { S.editCorrectId = r.value; }));
      $$("[data-or]").forEach(b => b.addEventListener("click", () => {
        S.editOptions.splice(+b.dataset.or, 1);
        if (!S.editOptions.some(o => o.id === S.editCorrectId)) S.editCorrectId = S.editOptions[0]?.id || "a";
        renderOpts();
      }));
    }
    renderOpts();
    $("#addOpt").onclick = () => {
      if (S.editOptions.length >= 6) return toast("Max 6", "error");
      S.editOptions.push({ id: String.fromCharCode(97 + S.editOptions.length), text: "" });
      renderOpts();
    };
    $("#saveQ").onclick = async () => {
      const btn = $("#saveQ"); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const qText = $("#qText").value.trim();
        const valid = S.editOptions.filter(o => o.text.trim());
        if (!qText) { toast("Question required.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        if (valid.length < 2) { toast("Need ≥2 options.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        if (!valid.some(o => o.id === S.editCorrectId)) { toast("Mark correct option.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        const data = { questionText: qText, options: valid, correctOptionId: S.editCorrectId, explanation: $("#qExpl").value.trim(), level: $("#qLevel").value, chapterId, subjectId, order: 0, status: $("#qStatus").value, updatedAt: serverTimestamp() };
        if (!id) data.createdAt = serverTimestamp();
        const ref = id ? doc(db, "questions", id) : doc(collection(db, "questions"));
        await setDoc(ref, data, { merge: true });
        MEM.clear();
        toast("Saved.", "success"); closeModal(); router();
      } catch (err) { toast(friendlyError(err, "saving"), "error"); btn.disabled = false; btn.textContent = "Save"; }
    };
  })();
}

/* ============ ADMIN IMPORT/EXPORT with selection ============ */
async function renderAdminImport(token) {
  setPage(spinner("Loading…"));
  const allSubjects = await loadAllSubjects(true);
  if (isStale(token)) return;

  // Load all chapters for all subjects in parallel (admin-only, OK)
  const chaptersBySubject = {};
  await Promise.all(allSubjects.map(async s => {
    try {
      const snap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",s.id), limit(200)));
      chaptersBySubject[s.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { chaptersBySubject[s.id] = []; }
  }));
  if (isStale(token)) return;

  setPage(`
    <div class="page-head"><div><h1 class="page-title">JSON Import / Export</h1>
    <p class="page-sub">Bulk load and export content.</p></div>
    <a class="btn" href="#/admin">← Back</a></div>

    <div class="card mb-16">
      <h2 class="card-title">📥 Import</h2>
      <p class="small muted">Import a full subject JSON with chapters, materials, and MCQs.</p>
      <div class="form-grid">
        <div><label>JSON file</label><input type="file" id="impFile" accept=".json"></div>
        <div><label>Mode</label><select id="impMode">
          <option value="addNew">Add New (skip existing IDs)</option>
          <option value="addOrUpdate">Add or Update</option>
          <option value="updateById">Update by ID only</option>
        </select></div>
      </div>
      <div class="row mt-16">
        <button class="btn btn-primary" id="doImport">Validate & Import</button>
        <button class="btn" id="tplBtn">Download Template</button>
      </div>
      <div id="impResult" class="mt-16"></div>
    </div>

    <div class="card">
      <h2 class="card-title">📤 Export</h2>
      <p class="small muted">Select items to export. Choose what to include.</p>
      <div class="form-grid">
        <div>
          <label>What to export</label>
          <select id="expType">
            <option value="full">Full subject (all content)</option>
            <option value="chapters">Selected chapters only</option>
            <option value="mcqs">MCQs only</option>
            <option value="materials">Materials only</option>
          </select>
        </div>
        <div>
          <label>Include</label>
          <div class="checkbox-row"><input type="checkbox" id="incMaterials" checked><label style="margin:0">Materials</label></div>
          <div class="checkbox-row"><input type="checkbox" id="incQuestions" checked><label style="margin:0">MCQs</label></div>
        </div>
      </div>

      <div class="mt-16">
        <div class="row-between mb-8">
          <label style="font-weight:700">Select subjects / chapters</label>
          <div class="row">
            <button class="btn btn-small" id="selAll">Select all</button>
            <button class="btn btn-small" id="selNone">Clear</button>
          </div>
        </div>
        <div class="export-list" id="exportList">
          ${allSubjects.map(s => `
            <div>
              <label class="export-item" style="font-weight:700">
                <input type="checkbox" class="sub-check" data-sid="${escapeHtml(s.id)}" checked>
                <span class="export-item-label">${escapeHtml(s.title || "")}</span>
                <span class="export-item-sub">${(chaptersBySubject[s.id] || []).length} ch</span>
              </label>
              <div style="padding-left:32px">
                ${(chaptersBySubject[s.id] || []).map(c => `
                  <label class="export-item">
                    <input type="checkbox" class="ch-check" data-cid="${escapeHtml(c.id)}" data-sid="${escapeHtml(s.id)}" checked>
                    <span class="export-item-label">${c.chapterNumber ? `Ch ${c.chapterNumber}: ` : ""}${escapeHtml(c.title || "")}</span>
                  </label>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="form-actions"><button class="btn btn-primary" id="doExport">📤 Export selected</button></div>
    </div>
  `);

  // Subject checkbox toggles child chapters
  $$(".sub-check").forEach(cb => cb.addEventListener("change", () => {
    const sid = cb.dataset.sid;
    $$(`.ch-check[data-sid="${sid}"]`).forEach(ch => ch.checked = cb.checked);
  }));

  $("#selAll").onclick = () => { $$(".sub-check, .ch-check").forEach(c => c.checked = true); };
  $("#selNone").onclick = () => { $$(".sub-check, .ch-check").forEach(c => c.checked = false); };

  $("#tplBtn").onclick = () => {
    const tpl = {
      subject: { title: "Example Subject", description: "", status: "draft" },
      chapters: [{
        title: "Chapter 1", chapterNumber: 1, description: "", status: "draft",
        materials: [{ title: "Intro", level: "L1", html: "<h2>Heading</h2><p>Text</p>", status: "draft", resources: [{ title: "Video", url: "https://youtube.com/watch?v=xxx", type: "youtube" }] }],
        questions: [{ questionText: "Sample?", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctOptionId: "a", level: "L1", status: "draft" }]
      }]
    };
    downloadFile("template.json", JSON.stringify(tpl, null, 2), "application/json");
  };

  $("#doImport").onclick = async () => {
    const file = $("#impFile").files[0];
    if (!file) return toast("Choose a file.", "error");
    const btn = $("#doImport"); btn.disabled = true; btn.textContent = "Importing…";
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const subjects = Array.isArray(parsed) ? parsed : (parsed.subject ? [parsed] : (parsed.subjects || []));
      if (!subjects.length) { toast("No subjects.", "error"); btn.disabled = false; btn.textContent = "Validate & Import"; return; }

      const mode = $("#impMode").value;
      let sub = 0, ch = 0, mat = 0, q = 0, skip = 0;

      for (const sBlock of subjects) {
        const sd = sBlock.subject || sBlock;
        const sRef = sd.id ? doc(db, "subjects", sd.id) : doc(collection(db, "subjects"));
        const ex = await getDoc(sRef);
        if (ex.exists() && mode === "addNew") { skip++; continue; }
        await setDoc(sRef, { title: sd.title || "Untitled", description: sd.description || "", status: sd.status || "draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
        sub++;
        const sid = sRef.id;

        for (const cBlock of (sBlock.chapters || [])) {
          const cRef = cBlock.id ? doc(db, "chapters", cBlock.id) : doc(collection(db, "chapters"));
          const cex = await getDoc(cRef);
          if (cex.exists() && mode === "addNew") { skip++; continue; }
          await setDoc(cRef, { title: cBlock.title || "Untitled", chapterNumber: Number(cBlock.chapterNumber || 1), description: cBlock.description || "", subjectId: sid, status: cBlock.status || "draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
          ch++;
          const cid = cRef.id;

          for (const m of (cBlock.materials || [])) {
            const mRef = m.id ? doc(db, "materials", m.id) : doc(collection(db, "materials"));
            await setDoc(mRef, { title: m.title || "", html: m.html || m.content || "", level: m.level || "L1", importance: m.importance || "normal", resources: m.resources || [], chapterId: cid, subjectId: sid, order: Number(m.order || 0), status: m.status || "draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
            mat++;
          }

          for (const qq of (cBlock.questions || [])) {
            const qRef = qq.id ? doc(db, "questions", qq.id) : doc(collection(db, "questions"));
            await setDoc(qRef, { questionText: qq.questionText || "", options: qq.options || [], correctOptionId: qq.correctOptionId || "", explanation: qq.explanation || "", level: qq.level || "L1", importance: qq.importance || "normal", chapterId: cid, subjectId: sid, order: Number(qq.order || 0), status: qq.status || "draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
            q++;
          }
        }
      }
      MEM.clear();
      toast(`Imported: ${sub} sub, ${ch} ch, ${mat} mat, ${q} MCQ. Skipped: ${skip}.`, "success", 6000);
      $("#impResult").innerHTML = `<div class="card" style="box-shadow:none"><p class="badge green">✓ Import complete</p><p class="small mt-8">${sub} subjects, ${ch} chapters, ${mat} materials, ${q} MCQs</p></div>`;
    } catch (err) {
      toast(friendlyError(err, "importing"), "error", 5000);
    } finally { btn.disabled = false; btn.textContent = "Validate & Import"; }
  };

  $("#doExport").onclick = async () => {
    const btn = $("#doExport"); btn.disabled = true; btn.textContent = "Preparing…";
    try {
      const expType = $("#expType").value;
      const incMaterials = $("#incMaterials").checked;
      const incQuestions = $("#incQuestions").checked;
      const selectedSubjectIds = new Set($$(".sub-check:checked").map(c => c.dataset.sid));
      const selectedChapterIds = new Set($$(".ch-check:checked").map(c => c.dataset.cid));

      if (selectedSubjectIds.size === 0 && selectedChapterIds.size === 0) {
        toast("Select at least one subject or chapter.", "error");
        btn.disabled = false; btn.textContent = "📤 Export selected";
        return;
      }

      const result = { subjects: [], exportedAt: new Date().toISOString() };

      if (expType === "full" || expType === "chapters") {
        for (const s of allSubjects) {
          if (!selectedSubjectIds.has(s.id)) continue;
          const subjectExport = { id: s.id, title: s.title, description: s.description, status: s.status, chapters: [] };
          for (const c of (chaptersBySubject[s.id] || [])) {
            if (expType === "chapters" && !selectedChapterIds.has(c.id)) continue;
            const chExport = { id: c.id, title: c.title, chapterNumber: c.chapterNumber, description: c.description, status: c.status, materials: [], questions: [] };
            if (incMaterials) {
              const mSnap = await getDocs(query(collection(db, "materials"), where("chapterId","==",c.id), limit(500)));
              chExport.materials = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            if (incQuestions) {
              const qSnap = await getDocs(query(collection(db, "questions"), where("chapterId","==",c.id), limit(500)));
              chExport.questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            subjectExport.chapters.push(chExport);
          }
          if (subjectExport.chapters.length > 0) result.subjects.push(subjectExport);
        }
      } else if (expType === "mcqs" || expType === "materials") {
        const questions = []; const materials = [];
        for (const s of allSubjects) {
          if (!selectedSubjectIds.has(s.id)) continue;
          for (const c of (chaptersBySubject[s.id] || [])) {
            if (!selectedChapterIds.has(c.id)) continue;
            if (expType === "mcqs") {
              const qSnap = await getDocs(query(collection(db, "questions"), where("chapterId","==",c.id), limit(500)));
              questions.push(...qSnap.docs.map(d => ({ id: d.id, chapterId: c.id, chapterTitle: c.title, ...d.data() })));
            } else {
              const mSnap = await getDocs(query(collection(db, "materials"), where("chapterId","==",c.id), limit(500)));
              materials.push(...mSnap.docs.map(d => ({ id: d.id, chapterId: c.id, chapterTitle: c.title, ...d.data() })));
            }
          }
        }
        result.questions = questions;
        result.materials = materials;
      }

      downloadFile(`export-${Date.now()}.json`, JSON.stringify(result, null, 2), "application/json");
      toast("Exported.", "success");
    } catch (err) {
      toast(friendlyError(err, "exporting"), "error");
    } finally { btn.disabled = false; btn.textContent = "📤 Export selected"; }
  };
}

/* ============ BOOT ============ */
function boot() {
  cacheEls();
  initTheme();
  bindAuth();
  bindShell();

  if (firebaseInitError) {
    if (els.bootScreen) els.bootScreen.innerHTML = `<div class="boot-logo">Sajilo<span>GK</span></div><p style="color:#fee2e2">Firebase failed.</p><button class="btn" onclick="location.reload()">Reload</button>`;
    return;
  }

  getRedirectResult(auth).catch(err => console.warn("Redirect result:", err));

  onAuthStateChanged(auth, async user => {
    S.user = user;
    if (!user) {
      S.profile = null; S.profileLoaded = false; S.profilePromise = null;
      S.isOwner = false; S.isAdmin = false; S.selectedSubjects = []; S.exams = [];
      MEM.clear();
      showAuth(); setAuthTab("login");
      return;
    }
    S.isOwner = user.email === OWNER_EMAIL && user.emailVerified === true;
    S.isAdmin = S.isOwner;
    showShell();
    renderProfileChrome();
    await ensureProfile();
    await loadRole();
    renderProfileChrome();
    router();
  });

  window.addEventListener("online", () => toast("Back online.", "success"));
  window.addEventListener("offline", () => toast("You are offline.", "info"));
}

document.addEventListener("DOMContentLoaded", boot);
if (document.readyState !== "loading") boot();
