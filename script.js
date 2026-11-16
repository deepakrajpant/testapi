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
  serverTimestamp, writeBatch, Timestamp
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
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }) });
  } catch {
    db = getFirestore(app);
  }
} catch (err) {
  firebaseInitError = err;
  console.error("Firebase init failed", err);
}

/* ============ STATE ============ */
const OWNER_EMAIL = "deepakrajpant978@gmail.com";
const NEPAL_TZ = "Asia/Kathmandu";
const S = {
  user: null, profile: null, isOwner: false, isAdmin: false,
  profileLoaded: false, profilePromise: null,
  exams: [], selectedSubjects: [], routeToken: 0, pageCleanup: null,
  // admin form state
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
function nepalDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: NEPAL_TZ, year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
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
  const d = toDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: NEPAL_TZ, year:"numeric", month:"short", day:"numeric" }).format(d);
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
  if (c === "permission-denied") return "Access denied. Verify your email or check that content is published.";
  if (c === "unavailable") return "Network or Firebase unavailable.";
  if (c === "failed-precondition") return "Firestore index missing. See setup docs.";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found") return "Email or password incorrect.";
  if (c === "auth/email-already-in-use") return "Email already in use.";
  if (c === "auth/too-many-requests") return "Too many attempts. Wait a moment.";
  return ctx ? `Failed while ${ctx}. Retry.` : "Something went wrong.";
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
  const u = S.user;
  if (!u) return;
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
      if (snap.exists()) {
        S.profile = { id: snap.id, ...snap.data() };
      } else if (S.user.emailVerified) {
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
    } catch (err) {
      console.warn("Profile load failed", err);
      return null;
    } finally { S.profileLoaded = true; }
  })();
  return S.profilePromise;
}
async function loadRole() {
  S.isOwner = S.user?.email === OWNER_EMAIL && S.user?.emailVerified === true;
  S.isAdmin = S.isOwner;
  if (!S.isOwner && S.user) {
    try {
      const snap = await getDoc(doc(db, "adminRoles", S.user.uid));
      if (snap.exists()) {
        const d = snap.data();
        S.isAdmin = d.active === true && ["admin","editor"].includes(d.role);
      }
    } catch {}
  }
  if (els.adminHeaderBtn) els.adminHeaderBtn.classList.toggle("hidden", !(S.isOwner || S.isAdmin));
}
async function doLogout() {
  cleanup();
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
    if (S.user?.emailVerified) {
      await ensureProfile(true);
      await loadRole();
      renderProfileChrome();
      toast("Email verified.", "success");
      router();
    } else {
      toast("Still not verified.", "error");
    }
  } catch (err) { toast(friendlyError(err, "refreshing"), "error"); }
}
async function googleSignIn() {
  authMsg("");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = err?.code || "";
    if (["auth/popup-blocked","auth/operation-not-supported-in-this-environment","auth/cancelled-popup-request"].includes(code)) {
      authMsg("Popup blocked. Redirecting to Google…", "info");
      try { await signInWithRedirect(auth, provider); }
      catch (re) { authMsg(friendlyError(re, "Google redirect"), "error"); }
    } else if (code === "auth/popup-closed-by-user") {
      authMsg("Sign-in cancelled.", "info");
    } else {
      authMsg(friendlyError(err, "Google sign-in"), "error");
    }
  }
}
function bindAuth() {
  $$(".auth-tab").forEach(b => b.addEventListener("click", () => setAuthTab(b.dataset.authTab)));
  els.loginForm?.addEventListener("submit", async e => {
    e.preventDefault();
    authMsg("");
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
    e.preventDefault();
    authMsg("");
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
    e.preventDefault();
    authMsg("");
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
    setPage(verifyGate());
    bindVerifyGate();
    return;
  }

  try {
    switch (name) {
      case "home": await renderHome(token); break;
      case "all-subjects": await renderAllSubjects(token); break;
      case "my-subjects": await renderMySubjects(token); break;
      case "subject": await renderSubjectDetail(segs[1], token); break;
      case "chapter": await renderChapterDetail(segs[1], token); break;
      case "material": await renderMaterial(segs[1], token); break;
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

/* ============ HOME ============ */
async function renderHome(token) {
  setPage(spinner("Loading…"));
  await Promise.all([loadSelectedSubjects(), loadExams()]);
  if (isStale(token)) return;

  const myExamIds = S.profile?.examIds || [];
  const myExams = S.exams.filter(e => myExamIds.includes(e.id));
  const today = await getTodaySession();

  setPage(`
    <div class="page-head"><div><h1 class="page-title">Namaste, ${escapeHtml((S.profile?.displayName || S.user.displayName || "Student").split(" ")[0])} 👋</h1>
    <p class="page-sub">${today ? `Today: ${today.questionsAttempted || 0} attempted, ${today.materialsRead || 0} read` : "Start your study today."}</p></div>
    <a class="btn btn-primary" href="#/all-subjects">Browse subjects</a></div>

    <div class="grid grid-2 mb-16">
      <div class="card">
        <h2 class="card-title">Quick actions</h2>
        <div class="row">
          <a class="btn" href="#/all-subjects">🌐 All Subjects</a>
          <a class="btn" href="#/my-subjects">📚 My Subjects</a>
          <a class="btn" href="#/progress">📈 Progress</a>
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">My target exams</h2>
        ${myExams.length
          ? `<div class="chip-list">${myExams.map(e => `<span class="chip">${escapeHtml(e.title || e.code || "Exam")}</span>`).join("")}</div>`
          : `<p class="small muted mb-0">No exams yet. Add subjects from All Subjects.</p>`}
      </div>
    </div>

    <div class="card">
      <div class="row-between mb-8"><h2 class="card-title mb-0">My selected subjects</h2><a class="btn btn-small" href="#/my-subjects">Manage</a></div>
      ${S.selectedSubjects.length
        ? `<div class="grid grid-2">${S.selectedSubjects.slice(0, 4).map(s => `<a class="card" style="box-shadow:none;text-decoration:none;color:var(--text)" href="#/subject/${encodeURIComponent(s.id)}">
            <strong>${escapeHtml(s.title || "Subject")}</strong>
            <p class="small muted mb-0 mt-8">Open to see chapters →</p>
          </a>`).join("")}</div>`
        : `<p class="small muted">No subjects selected. <a href="#/all-subjects">Browse all subjects →</a></p>`}
    </div>
  `);
}

/* ============ ALL SUBJECTS (student browse) ============ */
async function loadAllSubjects() {
  try {
    const snap = await getDocs(query(collection(db, "subjects"), where("status","==","published"), limit(300)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("All subjects load error", err);
    return [];
  }
}
async function loadSelectedSubjects() {
  try {
    const snap = await getDocs(collection(db, "users", S.user.uid, "selectedSubjects"));
    S.selectedSubjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { S.selectedSubjects = []; }
  return S.selectedSubjects;
}
async function loadExams() {
  try {
    const snap = await getDocs(query(collection(db, "exams"), where("status","==","published"), limit(50)));
    S.exams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { S.exams = []; }
  return S.exams;
}
async function renderAllSubjects(token) {
  setPage(spinner("Loading subjects…"));
  const [all, selected] = await Promise.all([loadAllSubjects(), loadSelectedSubjects()]);
  if (isStale(token)) return;
  const selectedIds = new Set(selected.map(s => s.id));

  setPage(`
    <div class="page-head"><div><h1 class="page-title">All Subjects</h1>
    <p class="page-sub">Browse all published subjects. Add any to your personal list.</p></div></div>
    ${all.length === 0
      ? emptyState("No subjects yet", "The administrator hasn't published any subjects. Check back soon.", `<a class="btn" href="#/home">Home</a>`)
      : `<div class="grid grid-2">${all.map(s => {
          const isMine = selectedIds.has(s.id);
          return `<div class="card">
            <div class="row-between"><strong>${escapeHtml(s.title || s.code || "Subject")}</strong>
            ${isMine ? '<span class="badge green">In My Subjects</span>' : '<span class="badge">Not selected</span>'}</div>
            <p class="small muted mt-8">${escapeHtml(s.description || "No description.")}</p>
            <div class="row mt-8">
              <a class="btn btn-small" href="#/subject/${encodeURIComponent(s.id)}">View</a>
              <button class="btn btn-small ${isMine ? "btn-ghost" : "btn-primary"}" data-add-subject="${escapeHtml(s.id)}" data-add-title="${escapeHtml(s.title || "")}" data-added="${isMine ? "1" : "0"}">
                ${isMine ? "Remove" : "+ Add to My Subjects"}
              </button>
            </div>
          </div>`;
        }).join("")}</div>`}
  `);

  $$("[data-add-subject]").forEach(b => b.addEventListener("click", async () => {
    b.disabled = true;
    const sid = b.dataset.addSubject;
    const added = b.dataset.added === "1";
    try {
      if (added) {
        await deleteDoc(doc(db, "users", S.user.uid, "selectedSubjects", sid));
        toast("Removed from My Subjects.", "success");
      } else {
        await setDoc(doc(db, "users", S.user.uid, "selectedSubjects", sid), {
          subjectId: sid,
          title: b.dataset.addTitle || "",
          addedAt: serverTimestamp()
        });
        toast("Added to My Subjects.", "success");
      }
      router();
    } catch (err) {
      console.error("Save subject error", err);
      toast(friendlyError(err, "saving subject"), "error", 5000);
      b.disabled = false;
    }
  }));
}

/* ============ MY SUBJECTS ============ */
async function renderMySubjects(token) {
  setPage(spinner("Loading…"));
  await loadSelectedSubjects();
  if (isStale(token)) return;

  setPage(`
    <div class="page-head"><div><h1 class="page-title">My Subjects</h1>
    <p class="page-sub">Your selected subjects.</p></div>
    <a class="btn btn-primary" href="#/all-subjects">+ Add more</a></div>
    ${S.selectedSubjects.length === 0
      ? emptyState("No subjects yet", "Add subjects from All Subjects page.", `<a class="btn btn-primary" href="#/all-subjects">Browse all subjects</a>`)
      : `<div class="grid grid-2">${S.selectedSubjects.map(s => `
          <div class="card">
            <div class="row-between"><strong>${escapeHtml(s.title || "Subject")}</strong>
              <button class="btn btn-small btn-danger" data-remove="${escapeHtml(s.id)}">Remove</button>
            </div>
            <p class="small muted mt-8 mb-8">Open to see chapters and study materials.</p>
            <a class="btn btn-small btn-primary" href="#/subject/${encodeURIComponent(s.id)}">Open</a>
          </div>`).join("")}</div>`}
  `);

  $$("[data-remove]").forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmDialog("Remove this subject from My Subjects?", { danger: true, confirmText: "Remove" }))) return;
    try { await deleteDoc(doc(db, "users", S.user.uid, "selectedSubjects", b.dataset.remove)); router(); }
    catch (err) { toast(friendlyError(err, "removing"), "error"); }
  }));
}

/* ============ SUBJECT DETAIL (student) ============ */
async function renderSubjectDetail(id, token) {
  if (!id) return setPage(errorState("Not found", "No subject specified."));
  setPage(spinner("Loading subject…"));
  let subject = null;
  try { const s = await getDoc(doc(db, "subjects", id)); if (s.exists()) subject = { id: s.id, ...s.data() }; }
  catch (err) { return setPage(errorState("Error", friendlyError(err, "loading subject"))); }
  if (isStale(token)) return;
  if (!subject) return setPage(emptyState("Subject not found", "May be unpublished."));

  let chapters = [];
  try {
    const snap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",id), where("status","==","published"), limit(200)));
    chapters = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  } catch (err) { console.warn("Chapters load error", err); }

  setPage(`
    <div class="breadcrumbs"><a href="#/all-subjects">Subjects</a> / <span>${escapeHtml(subject.title || "")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(subject.title || "Subject")}</h1>
    <p class="page-sub">${escapeHtml(subject.description || "")}</p></div></div>
    ${chapters.length === 0
      ? emptyState("No chapters yet", "The administrator hasn't added published chapters to this subject yet.")
      : `<div class="stack">${chapters.map(c => `<div class="card">
          <div class="row-between"><div><strong>${c.chapterNumber ? `Chapter ${c.chapterNumber}: ` : ""}${escapeHtml(c.title || "")}</strong>
          <p class="small muted mb-0 mt-8">${escapeHtml(c.description || "")}</p></div>
          <a class="btn btn-primary btn-small" href="#/chapter/${encodeURIComponent(c.id)}">Open</a></div>
        </div>`).join("")}</div>`}
  `);
}

/* ============ CHAPTER DETAIL (student) ============ */
async function renderChapterDetail(id, token) {
  if (!id) return setPage(errorState("Not found", "No chapter specified."));
  setPage(spinner("Loading chapter…"));
  let chapter = null;
  try { const s = await getDoc(doc(db, "chapters", id)); if (s.exists()) chapter = { id: s.id, ...s.data() }; }
  catch (err) { return setPage(errorState("Error", friendlyError(err, "loading chapter"))); }
  if (isStale(token)) return;
  if (!chapter) return setPage(emptyState("Chapter not found", "May be unpublished."));

  const [matSnap, qSnap] = await Promise.all([
    getDocs(query(collection(db, "materials"), where("chapterId","==",id), where("status","==","published"), limit(100))).catch(() => null),
    getDocs(query(collection(db, "questions"), where("chapterId","==",id), where("status","==","published"), limit(500))).catch(() => null)
  ]);
  if (isStale(token)) return;
  const materials = (matSnap?.docs || []).map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  const questions = (qSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }));
  const byLevel = { L1: questions.filter(q => q.level === "L1").length, L2: questions.filter(q => q.level === "L2").length, L3: questions.filter(q => q.level === "L3").length };

  // Siblings for prev/next
  let siblings = [];
  try {
    const snap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",chapter.subjectId || ""), where("status","==","published"), limit(200)));
    siblings = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  } catch {}
  const idx = siblings.findIndex(c => c.id === id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  setPage(`
    <div class="breadcrumbs"><a href="#/all-subjects">Subjects</a> / <a href="#/subject/${encodeURIComponent(chapter.subjectId || "")}">Subject</a> / <span>${escapeHtml(chapter.title || "Chapter")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(chapter.title || "Chapter")}</h1>
    <p class="page-sub">${escapeHtml(chapter.description || "")}</p></div></div>

    <div class="card mb-16">
      <h2 class="card-title">Study Materials (${materials.length})</h2>
      ${materials.length === 0
        ? `<p class="small muted">No published materials.</p>`
        : materials.map(m => `<div class="list-item">
            <div class="list-item-main">
              <p class="list-item-title">${escapeHtml(m.title || "Material")}</p>
              <div class="list-item-meta">
                <span class="badge ${escapeHtml(m.level || "L1")}">${levelLabel(m.level)}</span>
                ${m.importance && m.importance !== "normal" ? `<span class="badge ${escapeHtml(m.importance)}">${escapeHtml(m.importance)}</span>` : ""}
              </div>
            </div>
            <a class="btn btn-small" href="#/material/${encodeURIComponent(m.id)}">Read</a>
          </div>`).join("")}
    </div>

    <div class="card">
      <h2 class="card-title">Practice MCQs</h2>
      <div class="grid grid-3">
        ${["L1","L2","L3"].map(l => `<div class="card" style="box-shadow:none;text-align:center">
          <span class="badge ${l}">${levelLabel(l)}</span>
          <p class="stat-value mt-8">${byLevel[l]}</p>
          <p class="tiny muted">questions</p>
          <a class="btn btn-small ${byLevel[l] ? "btn-primary" : ""}" href="#/practice?chapter=${encodeURIComponent(id)}&level=${l}" ${byLevel[l] ? "" : 'style="opacity:.5;pointer-events:none"'}>Practice</a>
        </div>`).join("")}
      </div>
      <div class="mt-16"><a class="btn btn-primary" href="#/practice?chapter=${encodeURIComponent(id)}">Practice all (${questions.length})</a></div>
    </div>

    <div class="row mt-16" style="justify-content:space-between">
      ${prev ? `<a class="btn" href="#/chapter/${encodeURIComponent(prev.id)}">← ${escapeHtml(prev.title || "Previous")}</a>` : "<span></span>"}
      ${next ? `<a class="btn" href="#/chapter/${encodeURIComponent(next.id)}">${escapeHtml(next.title || "Next")} →</a>` : "<span></span>"}
    </div>
  `);
}

/* ============ MATERIAL READER ============ */
async function renderMaterial(id, token) {
  if (!id) return setPage(errorState("Not found", "No material specified."));
  setPage(spinner("Loading…"));
  let m = null;
  try { const s = await getDoc(doc(db, "materials", id)); if (s.exists()) m = { id: s.id, ...s.data() }; }
  catch (err) { return setPage(errorState("Error", friendlyError(err, "loading material"))); }
  if (isStale(token)) return;
  if (!m) return setPage(emptyState("Material not found", "May be unpublished."));

  const html = m.html ? sanitizeHtml(m.html) : (m.content ? sanitizeHtml(m.content) : `<p class="muted">No content.</p>`);
  const resources = Array.isArray(m.resources) ? m.resources : [];

  setPage(`
    <div class="breadcrumbs"><a href="#/all-subjects">Subjects</a> / <a href="#/chapter/${encodeURIComponent(m.chapterId || "")}">Chapter</a> / <span>${escapeHtml(m.title || "Material")}</span></div>
    <div class="card">
      <div class="row-between">
        <div class="row"><span class="badge ${escapeHtml(m.level || "L1")}">${levelLabel(m.level)}</span></div>
        <div class="row">
          <button class="btn btn-small" data-font="-">A−</button>
          <button class="btn btn-small" data-font="+">A+</button>
          <button class="btn btn-small" onclick="window.print()">Print</button>
        </div>
      </div>
      <h1 class="page-title mt-16">${escapeHtml(m.title || "Study material")}</h1>
      <div class="reader-content mt-16" id="readerContent">${html}</div>
    </div>

    ${resources.length ? `<div class="card"><h2 class="card-title">Resources</h2>
      ${resources.map(r => {
        const url = safeUrl(r.url);
        if (!url) return "";
        return `<div class="list-item"><div class="list-item-main"><p class="list-item-title">${escapeHtml(r.title || r.url)}</p><div class="list-item-meta">${escapeHtml(r.type || "link")}</div></div><a class="btn btn-small" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open</a></div>`;
      }).join("")}
    </div>` : ""}

    <div class="row mt-16 no-print">
      <button class="btn btn-primary" id="markReadBtn">Mark as read</button>
      <a class="btn" href="#/practice?chapter=${encodeURIComponent(m.chapterId || "")}&level=${encodeURIComponent(m.level || "L1")}">Practice MCQs</a>
    </div>
  `);

  $$("[data-font]").forEach(b => b.addEventListener("click", () => {
    const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--reader-size")) || 17;
    const next = b.dataset.font === "+" ? Math.min(24, cur + 1) : Math.max(14, cur - 1);
    document.documentElement.style.setProperty("--reader-size", `${next}px`);
  }));

  $("#markReadBtn")?.addEventListener("click", async () => {
    try {
      await setDoc(doc(db, "users", S.user.uid, "materialProgress", id), {
        materialId: id, title: m.title || "", chapterId: m.chapterId || "", subjectId: m.subjectId || "",
        level: m.level || "L1", status: "read", readAt: serverTimestamp(), updatedAt: serverTimestamp()
      }, { merge: true });
      await touchSession({ materialsRead: 1 });
      toast("Marked as read.", "success");
    } catch (err) { toast(friendlyError(err, "saving progress"), "error"); }
  });
}

/* ============ PRACTICE ============ */
async function renderPractice(params, token) {
  setPage(spinner("Loading questions…"));
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
      const snap = await getDocs(query(collection(db, "questions"), where("chapterId","==",chapterId), where("status","==","published"), limit(500)));
      questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (level) questions = questions.filter(q => q.level === level);
    }
  } catch (err) {
    return setPage(errorState("Error", friendlyError(err, "loading questions")));
  }
  if (isStale(token)) return;
  if (!questions.length) return setPage(emptyState("No questions", "No published questions match this scope.", `<a class="btn" href="#/all-subjects">Browse subjects</a>`));

  questions = questions.sort(() => Math.random() - 0.5);
  S.practice = { questions, index: 0, selected: null, revealed: false, recorded: new Set() };
  renderPracticeQuestion();
  bindPracticeKeys();
}

function renderPracticeQuestion() {
  const p = S.practice;
  if (!p) return;
  const q = p.questions[p.index];
  const options = q.options || [];

  setPage(`
    <div class="page-head"><div><h1 class="page-title">Practice</h1>
    <p class="page-sub">Q ${p.index + 1} of ${p.questions.length}</p></div><a class="btn" href="#/all-subjects">Back</a></div>
    <div class="question-card" style="max-width:840px;margin:0 auto">
      <div class="card">
        <div class="row mb-16">
          <span class="badge ${escapeHtml(q.level || "L1")}">${levelLabel(q.level)}</span>
          ${q.importance && q.importance !== "normal" ? `<span class="badge ${escapeHtml(q.importance)}">${escapeHtml(q.importance)}</span>` : ""}
        </div>
        <div class="question-stem">${escapeHtml(q.questionText || "Question")}</div>
        <div class="option-list" id="optList">
          ${options.map((opt, i) => {
            const key = opt.id || String.fromCharCode(97 + i);
            const sel = p.selected === key;
            const correct = p.revealed && q.correctOptionId === key;
            const wrong = p.revealed && sel && q.correctOptionId !== key;
            return `<button class="option-btn ${sel ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}" data-opt="${escapeHtml(key)}" type="button">
              <span class="option-key">${String.fromCharCode(65 + i)}</span>
              <span>${escapeHtml(opt.text || "")}</span>
            </button>`;
          }).join("")}
        </div>
        ${p.revealed ? `<div class="explanation-box">
          <h4>Correct answer: ${escapeHtml(options.find(o => o.id === q.correctOptionId)?.text || "—")}</h4>
          <p>${sanitizeHtml(q.explanation || "No explanation.")}</p>
        </div>` : ""}
        <div class="row mt-16" style="justify-content:space-between">
          <button class="btn" id="prevBtn" ${p.index === 0 ? "disabled" : ""}>← Previous</button>
          <button class="btn btn-primary" id="checkBtn">${p.revealed ? "Hide" : "Check Answer"}</button>
          <button class="btn" id="nextBtn" ${p.index >= p.questions.length - 1 ? "disabled" : ""}>Next →</button>
        </div>
      </div>
    </div>
  `);

  $$("[data-opt]").forEach(b => b.addEventListener("click", () => {
    if (p.revealed) return;
    p.selected = b.dataset.opt;
    renderPracticeQuestion();
  }));
  $("#checkBtn")?.addEventListener("click", async () => {
    if (p.revealed) { p.revealed = false; renderPracticeQuestion(); return; }
    if (!p.selected) return toast("Select an option.", "error");
    p.revealed = true;
    if (!p.recorded.has(q.id)) { p.recorded.add(q.id); await recordAttempt(q, p.selected); }
    renderPracticeQuestion();
  });
  $("#prevBtn")?.addEventListener("click", () => { if (p.index > 0) { p.index--; p.selected = null; p.revealed = false; renderPracticeQuestion(); } });
  $("#nextBtn")?.addEventListener("click", () => { if (p.index < p.questions.length - 1) { p.index++; p.selected = null; p.revealed = false; renderPracticeQuestion(); } });
}

function bindPracticeKeys() {
  const handler = e => {
    if (["input","textarea","select"].includes((e.target.tagName || "").toLowerCase())) return;
    const p = S.practice; if (!p) return;
    const k = e.key.toLowerCase();
    if (k === "j" && p.index < p.questions.length - 1) { p.index++; p.selected = null; p.revealed = false; renderPracticeQuestion(); }
    else if (k === "k" && p.index > 0) { p.index--; p.selected = null; p.revealed = false; renderPracticeQuestion(); }
    else if (e.key === " ") { e.preventDefault(); $("#checkBtn")?.click(); }
  };
  document.addEventListener("keydown", handler);
  S.pageCleanup = () => document.removeEventListener("keydown", handler);
}

async function recordAttempt(q, selected) {
  const correct = selected === q.correctOptionId;
  const ref = doc(db, "users", S.user.uid, "questionProgress", q.id);
  try {
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
  } catch (err) { console.warn("Session save failed", err); }
}
async function getTodaySession() {
  if (!S.user) return null;
  try { const s = await getDoc(doc(db, "users", S.user.uid, "studySessions", nepalDateKey())); return s.exists() ? s.data() : null; }
  catch { return null; }
}

/* ============ PROGRESS, SAVED, PROFILE, SETTINGS ============ */
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
    <div class="page-head"><div><h1 class="page-title">Progress</h1><p class="page-sub">Real data only.</p></div></div>
    <div class="grid grid-4 mb-16">
      <div class="stat-card"><div class="stat-value">${read}</div><div class="stat-label">Materials read</div></div>
      <div class="stat-card"><div class="stat-value">${attempted}</div><div class="stat-label">Questions attempted</div></div>
      <div class="stat-card"><div class="stat-value">${correct}</div><div class="stat-label">Correct answers</div></div>
      <div class="stat-card"><div class="stat-value">${attempted ? Math.round(correct / Math.max(1, attempted) * 100) : 0}%</div><div class="stat-label">Accuracy</div></div>
    </div>
    <div class="card"><h2 class="card-title">About</h2>
      <p class="small muted">Reading and mastery are separate. Mastery requires repeated correct recall.</p>
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
    ${items.length ? `<div class="stack">${items.map(i => `<div class="card"><strong>${escapeHtml(i.title || "Saved")}</strong>${i.href ? `<a class="btn btn-small mt-8" href="${escapeHtml(i.href)}">Open</a>` : ""}</div>`).join("")}</div>` : emptyState("Nothing saved yet", "Bookmark materials or questions to see them here.")}
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
      <h2 class="card-title">Account details</h2>
      <div class="form-grid">
        <div><label>Display name</label><input id="profName" value="${escapeHtml(S.profile?.displayName || name)}"></div>
        <div><label>Daily goal (questions)</label><input id="profGoal" type="number" min="5" max="200" value="${S.profile?.dailyGoal || 20}"></div>
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
      renderProfileChrome();
      toast("Saved.", "success");
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
  if (!S.isOwner && !S.isAdmin) return setPage(emptyState("Admin only", "Access restricted."));
  if (!S.user.emailVerified) {
    setPage(`<div class="card"><h2>Verify email to use admin</h2><button class="btn btn-primary" id="vBtn">Resend</button></div>`);
    $("#vBtn")?.addEventListener("click", resendVerify);
    return;
  }

  const section = segs[0];

  if (!section) {
    setPage(`
      <div class="page-head"><div><h1 class="page-title">Admin Panel</h1><p class="page-sub">Manage all content.</p></div><a class="btn" href="#/home">Exit</a></div>
      <div class="admin-grid">
        <a href="#/admin/subjects" class="admin-card"><strong>📚 Subjects</strong><span>Create, edit, delete subjects</span></a>
        <a href="#/admin/import" class="admin-card"><strong>📦 JSON Import/Export</strong><span>Bulk load content</span></a>
      </div>
    `);
    return;
  }

  if (section === "subjects") return renderAdminSubjects(token);
  if (section === "subject") return renderAdminSubjectDetail(segs[1], token);
  if (section === "chapter") return renderAdminChapterDetail(segs[1], token);
  if (section === "import") return renderAdminImport(token);

  setPage(errorState("Unknown admin section", "Section does not exist."));
}

/* ---- Admin: Subjects list ---- */
async function renderAdminSubjects(token) {
  setPage(spinner("Loading subjects…"));
  const snap = await getDocs(query(collection(db, "subjects"), limit(300))).catch(() => null);
  if (isStale(token)) return;
  const subjects = (snap?.docs || []).map(d => ({ id: d.id, ...d.data() }));

  setPage(`
    <div class="page-head"><div><h1 class="page-title">Manage Subjects</h1>
    <p class="page-sub">${subjects.length} total</p></div>
    <div class="row"><a class="btn" href="#/admin">← Back</a><button class="btn btn-primary" id="newSubjectBtn">+ New Subject</button></div></div>
    ${subjects.length === 0
      ? emptyState("No subjects yet", "Create your first subject to start building content.", `<button class="btn btn-primary" id="newSubjectEmpty">+ New Subject</button>`)
      : `<div class="stack">${subjects.map(s => `<div class="card">
          <div class="row-between">
            <div><strong>${escapeHtml(s.title || "Untitled")}</strong>
              <div class="list-item-meta mt-8">${statusBadge(s.status)}</div>
            </div>
            <div class="row">
              <a class="btn btn-small btn-primary" href="#/admin/subject/${encodeURIComponent(s.id)}">Manage Chapters</a>
              <button class="btn btn-small" data-edit-sub="${escapeHtml(s.id)}">Edit</button>
              <button class="btn btn-small btn-danger" data-del-sub="${escapeHtml(s.id)}" data-del-title="${escapeHtml(s.title || "")}">Delete</button>
            </div>
          </div>
        </div>`).join("")}</div>`}
  `);

  const openNew = () => openSubjectForm(null);
  $("#newSubjectBtn")?.addEventListener("click", openNew);
  $("#newSubjectEmpty")?.addEventListener("click", openNew);
  $$("[data-edit-sub]").forEach(b => b.addEventListener("click", () => openSubjectForm(b.dataset.editSub)));
  $$("[data-del-sub]").forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmDialog(`Delete subject "${b.dataset.delTitle}"? All chapters, materials and MCQs inside will remain orphaned in Firestore but will no longer be visible. This cannot be undone.`, { danger: true, confirmText: "Delete" }))) return;
    try {
      await deleteDoc(doc(db, "subjects", b.dataset.delSub));
      toast("Subject deleted.", "success");
      router();
    } catch (err) { toast(friendlyError(err, "deleting"), "error"); }
  }));
}

function openSubjectForm(id) {
  const fetchExisting = async () => {
    if (!id) return {};
    const s = await getDoc(doc(db, "subjects", id));
    return s.exists() ? s.data() : {};
  };
  fetchExisting().then(existing => {
    openModal(`
      <div class="modal-head"><h2>${id ? "Edit" : "New"} Subject</h2><button class="modal-close" data-modal-close>✕</button></div>
      <div class="form-grid">
        <div><label>Title <span class="required">*</span></label><input id="subTitle" value="${escapeHtml(existing.title || "")}" placeholder="e.g., General Knowledge"></div>
        <div><label>Code (optional)</label><input id="subCode" value="${escapeHtml(existing.code || "")}"></div>
        <div><label>Description</label><textarea id="subDesc">${escapeHtml(existing.description || "")}</textarea></div>
        <div><label>Order</label><input id="subOrder" type="number" value="${existing.order || 0}"></div>
        <div><label>Status</label><select id="subStatus">
          <option value="draft" ${existing.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${existing.status === "published" ? "selected" : ""}>Published</option>
          <option value="archived" ${existing.status === "archived" ? "selected" : ""}>Archived</option>
        </select></div>
      </div>
      <div class="form-actions"><button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="saveSub">Save</button></div>
    `, true);

    $("#saveSub").onclick = async () => {
      const btn = $("#saveSub");
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const title = $("#subTitle").value.trim();
        if (!title) { toast("Title is required.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        const data = {
          title, code: $("#subCode").value.trim(), description: $("#subDesc").value.trim(),
          order: Number($("#subOrder").value || 0), status: $("#subStatus").value,
          updatedAt: serverTimestamp()
        };
        if (!id) data.createdAt = serverTimestamp();
        const ref = id ? doc(db, "subjects", id) : doc(collection(db, "subjects"));
        await setDoc(ref, data, { merge: true });
        toast("Subject saved.", "success");
        closeModal();
        router();
      } catch (err) {
        console.error("Save subject error", err);
        toast(friendlyError(err, "saving subject"), "error", 5000);
        btn.disabled = false; btn.textContent = "Save";
      }
    };
  });
}

/* ---- Admin: Subject detail (manage chapters) ---- */
async function renderAdminSubjectDetail(subjectId, token) {
  if (!subjectId) return setPage(errorState("Not found", "No subject ID."));
  setPage(spinner("Loading…"));
  let subject = null;
  try { const s = await getDoc(doc(db, "subjects", subjectId)); if (s.exists()) subject = { id: s.id, ...s.data() }; }
  catch (err) { return setPage(errorState("Error", friendlyError(err, "loading"))); }
  if (isStale(token)) return;
  if (!subject) return setPage(emptyState("Subject not found", "May have been deleted."));

  const chSnap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",subjectId), limit(300))).catch(() => null);
  if (isStale(token)) return;
  const chapters = (chSnap?.docs || []).map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));

  setPage(`
    <div class="breadcrumbs"><a href="#/admin/subjects">Subjects</a> / <span>${escapeHtml(subject.title || "")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(subject.title || "Subject")} — Chapters</h1>
    <p class="page-sub">${chapters.length} chapters</p></div>
    <div class="row"><a class="btn" href="#/admin/subjects">← Subjects</a><button class="btn btn-primary" id="newChBtn">+ New Chapter</button></div></div>
    ${chapters.length === 0
      ? emptyState("No chapters yet", "Create your first chapter.", `<button class="btn btn-primary" id="newChEmpty">+ New Chapter</button>`)
      : `<div class="stack">${chapters.map(c => `<div class="card">
          <div class="row-between">
            <div><strong>${c.chapterNumber ? `Ch ${c.chapterNumber}: ` : ""}${escapeHtml(c.title || "")}</strong>
              <div class="list-item-meta mt-8">${statusBadge(c.status)}</div>
            </div>
            <div class="row">
              <a class="btn btn-small btn-primary" href="#/admin/chapter/${encodeURIComponent(c.id)}">Open (Materials + MCQs)</a>
              <button class="btn btn-small" data-edit-ch="${escapeHtml(c.id)}">Edit</button>
              <button class="btn btn-small btn-danger" data-del-ch="${escapeHtml(c.id)}" data-del-title="${escapeHtml(c.title || "")}">Delete</button>
            </div>
          </div>
        </div>`).join("")}</div>`}
  `);

  const openNew = () => openChapterForm(subjectId, null);
  $("#newChBtn")?.addEventListener("click", openNew);
  $("#newChEmpty")?.addEventListener("click", openNew);
  $$("[data-edit-ch]").forEach(b => b.addEventListener("click", () => openChapterForm(subjectId, b.dataset.editCh)));
  $$("[data-del-ch]").forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmDialog(`Delete chapter "${b.dataset.delTitle}"?`, { danger: true, confirmText: "Delete" }))) return;
    try { await deleteDoc(doc(db, "chapters", b.dataset.delCh)); toast("Deleted.", "success"); router(); }
    catch (err) { toast(friendlyError(err, "deleting"), "error"); }
  }));
}

function openChapterForm(subjectId, id) {
  (async () => {
    let existing = {};
    if (id) { const s = await getDoc(doc(db, "chapters", id)); if (s.exists()) existing = s.data(); }
    openModal(`
      <div class="modal-head"><h2>${id ? "Edit" : "New"} Chapter</h2><button class="modal-close" data-modal-close>✕</button></div>
      <div class="form-grid">
        <div><label>Chapter number</label><input id="chNum" type="number" value="${existing.chapterNumber || 1}"></div>
        <div><label>Title <span class="required">*</span></label><input id="chTitle" value="${escapeHtml(existing.title || "")}"></div>
        <div><label>Description</label><textarea id="chDesc">${escapeHtml(existing.description || "")}</textarea></div>
        <div><label>Status</label><select id="chStatus">
          <option value="draft" ${existing.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${existing.status === "published" ? "selected" : ""}>Published</option>
          <option value="archived" ${existing.status === "archived" ? "selected" : ""}>Archived</option>
        </select></div>
      </div>
      <div class="form-actions"><button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="saveCh">Save</button></div>
    `, true);
    $("#saveCh").onclick = async () => {
      const btn = $("#saveCh"); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const title = $("#chTitle").value.trim();
        if (!title) { toast("Title required.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        const data = {
          title, chapterNumber: Number($("#chNum").value || 1), description: $("#chDesc").value.trim(),
          subjectId, status: $("#chStatus").value, updatedAt: serverTimestamp()
        };
        if (!id) data.createdAt = serverTimestamp();
        const ref = id ? doc(db, "chapters", id) : doc(collection(db, "chapters"));
        await setDoc(ref, data, { merge: true });
        toast("Chapter saved.", "success");
        closeModal();
        router();
      } catch (err) { toast(friendlyError(err, "saving chapter"), "error"); btn.disabled = false; btn.textContent = "Save"; }
    };
  })();
}

/* ---- Admin: Chapter detail (materials + MCQs) ---- */
async function renderAdminChapterDetail(chapterId, token) {
  if (!chapterId) return setPage(errorState("Not found", "No chapter ID."));
  setPage(spinner("Loading chapter…"));
  let chapter = null;
  try { const s = await getDoc(doc(db, "chapters", chapterId)); if (s.exists()) chapter = { id: s.id, ...s.data() }; }
  catch (err) { return setPage(errorState("Error", friendlyError(err, "loading"))); }
  if (isStale(token)) return;
  if (!chapter) return setPage(emptyState("Chapter not found", "May have been deleted."));

  const [matSnap, qSnap] = await Promise.all([
    getDocs(query(collection(db, "materials"), where("chapterId","==",chapterId), limit(100))).catch(() => null),
    getDocs(query(collection(db, "questions"), where("chapterId","==",chapterId), limit(500))).catch(() => null)
  ]);
  if (isStale(token)) return;
  const materials = (matSnap?.docs || []).map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  const questions = (qSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }));
  const lc = { L1: questions.filter(q => q.level === "L1").length, L2: questions.filter(q => q.level === "L2").length, L3: questions.filter(q => q.level === "L3").length };

  setPage(`
    <div class="breadcrumbs"><a href="#/admin/subjects">Subjects</a> / <a href="#/admin/subject/${encodeURIComponent(chapter.subjectId || "")}">Chapters</a> / <span>${escapeHtml(chapter.title || "")}</span></div>
    <div class="page-head"><div><h1 class="page-title">${escapeHtml(chapter.title || "Chapter")}</h1>
    <p class="page-sub">Manage materials and MCQs</p></div>
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
          <button class="btn btn-primary" id="addMatBtn">+ Add Material</button>
          <span style="flex:1"></span>
          <input type="file" id="matImportFile" accept=".json" style="display:none">
          <button class="btn" id="matImportBtn">📥 Import Materials JSON</button>
          <button class="btn" id="matExportBtn">📤 Export Materials JSON</button>
        </div>
        ${materials.length === 0
          ? emptyState("No materials yet", "Add your first material with HTML content.", "")
          : `<div class="stack">${materials.map(m => `<div class="card">
              <div class="row-between">
                <div><strong>${escapeHtml(m.title || "Untitled")}</strong>
                  <div class="list-item-meta mt-8">
                    <span class="badge ${escapeHtml(m.level || "L1")}">${levelLabel(m.level)}</span>
                    ${statusBadge(m.status)}
                  </div>
                </div>
                <div class="row">
                  <button class="btn btn-small" data-preview-mat="${escapeHtml(m.id)}">Preview</button>
                  <button class="btn btn-small" data-edit-mat="${escapeHtml(m.id)}">Edit</button>
                  <button class="btn btn-small btn-danger" data-del-mat="${escapeHtml(m.id)}">Delete</button>
                </div>
              </div>
            </div>`).join("")}</div>`}
      `;
      $("#addMatBtn").onclick = () => openMaterialForm(chapterId, null, chapter.subjectId || "");
      $$("[data-edit-mat]").forEach(b => b.addEventListener("click", () => openMaterialForm(chapterId, b.dataset.editMat, chapter.subjectId || "")));
      $$("[data-preview-mat]").forEach(b => b.addEventListener("click", () => previewMaterial(b.dataset.previewMat)));
      $$("[data-del-mat]").forEach(b => b.addEventListener("click", async () => {
        if (!(await confirmDialog("Delete this material?", { danger: true, confirmText: "Delete" }))) return;
        try { await deleteDoc(doc(db, "materials", b.dataset.delMat)); toast("Deleted.", "success"); router(); }
        catch (err) { toast(friendlyError(err, "deleting"), "error"); }
      }));
      $("#matImportBtn").onclick = () => $("#matImportFile").click();
      $("#matImportFile").onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const items = Array.isArray(parsed) ? parsed : (parsed.materials || [parsed]);
          if (!items.length) return toast("No materials found.", "error");
          const ok = await confirmDialog(`Import ${items.length} material(s) into this chapter?`, { confirmText: "Import" });
          if (!ok) return;
          for (const m of items) {
            const ref = m.id ? doc(db, "materials", m.id) : doc(collection(db, "materials"));
            await setDoc(ref, {
              title: m.title || "Imported", html: m.html || m.content || "",
              level: m.level || "L1", importance: m.importance || "normal",
              resources: m.resources || [], chapterId, subjectId: chapter.subjectId || "",
              order: Number(m.order || 0), status: m.status || "draft",
              createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            }, { merge: true });
          }
          toast(`Imported ${items.length} material(s).`, "success");
          router();
        } catch (err) { toast(friendlyError(err, "importing"), "error"); }
      };
      $("#matExportBtn").onclick = () => {
        const data = materials.map(m => ({
          title: m.title, html: m.html, level: m.level, importance: m.importance,
          resources: m.resources || [], order: m.order || 0, status: m.status
        }));
        downloadFile(`materials-${chapterId}.json`, JSON.stringify({ materials: data }, null, 2), "application/json");
      };
    } else if (tab === "mcqs") {
      box.innerHTML = `
        <div class="row mb-16">
          <button class="btn btn-primary" id="addQBtn">+ Add MCQ</button>
          <span style="flex:1"></span>
          <select id="qLevelFilter" style="min-height:44px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface)">
            <option value="">All levels (${questions.length})</option>
            <option value="L1">L1 (${lc.L1})</option>
            <option value="L2">L2 (${lc.L2})</option>
            <option value="L3">L3 (${lc.L3})</option>
          </select>
          <input type="file" id="qImportFile" accept=".json" style="display:none">
          <button class="btn" id="qImportBtn">📥 Import MCQ JSON</button>
          <button class="btn" id="qExportBtn">📤 Export MCQ JSON</button>
        </div>
        <div id="qList"></div>
      `;
      const renderQList = (filterLevel = "") => {
        const filtered = filterLevel ? questions.filter(q => q.level === filterLevel) : questions;
        $("#qList").innerHTML = filtered.length === 0
          ? emptyState("No questions", "Add your first MCQ.", "")
          : `<div class="stack">${filtered.map(q => `<div class="card">
              <div class="row-between">
                <div style="flex:1">
                  <strong>${escapeHtml((q.questionText || "").slice(0, 120))}${(q.questionText || "").length > 120 ? "…" : ""}</strong>
                  <div class="list-item-meta mt-8">
                    <span class="badge ${escapeHtml(q.level || "L1")}">${levelLabel(q.level)}</span>
                    ${statusBadge(q.status)}
                    <span>${(q.options || []).length} options</span>
                  </div>
                </div>
                <div class="row">
                  <button class="btn btn-small" data-preview-q="${escapeHtml(q.id)}">Preview</button>
                  <button class="btn btn-small" data-edit-q="${escapeHtml(q.id)}">Edit</button>
                  <button class="btn btn-small btn-danger" data-del-q="${escapeHtml(q.id)}">Delete</button>
                </div>
              </div>
            </div>`).join("")}</div>`;
        $$("[data-edit-q]").forEach(b => b.addEventListener("click", () => openQuestionForm(chapterId, b.dataset.editQ, chapter.subjectId || "")));
        $$("[data-preview-q]").forEach(b => b.addEventListener("click", () => previewQuestion(b.dataset.previewQ)));
        $$("[data-del-q]").forEach(b => b.addEventListener("click", async () => {
          if (!(await confirmDialog("Delete this MCQ?", { danger: true, confirmText: "Delete" }))) return;
          try { await deleteDoc(doc(db, "questions", b.dataset.delQ)); toast("Deleted.", "success"); router(); }
          catch (err) { toast(friendlyError(err, "deleting"), "error"); }
        }));
      };
      renderQList();
      $("#qLevelFilter").onchange = e => renderQList(e.target.value);
      $("#addQBtn").onclick = () => openQuestionForm(chapterId, null, chapter.subjectId || "");
      $("#qImportBtn").onclick = () => $("#qImportFile").click();
      $("#qImportFile").onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const items = Array.isArray(parsed) ? parsed : (parsed.questions || [parsed]);
          if (!items.length) return toast("No questions found.", "error");
          const errors = [];
          items.forEach((q, i) => {
            if (!q.questionText) errors.push(`Row ${i + 1}: missing questionText`);
            if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`Row ${i + 1}: needs ≥2 options`);
            if (q.options && !q.options.some(o => o.id === q.correctOptionId)) errors.push(`Row ${i + 1}: correctOptionId invalid`);
          });
          const previewHtml = `<div class="card" style="box-shadow:none">
            <h3>Preview: ${items.length} MCQ(s)</h3>
            ${errors.length ? `<div class="reader-callout" style="border-color:var(--red);background:#fee2e2;color:#991b1b"><strong>${errors.length} error(s):</strong><ul>${errors.slice(0, 10).map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>` : '<p class="badge green">✓ Validation passed</p>'}
            <p class="small muted">They will be linked to chapter: <strong>${escapeHtml(chapter.title || "")}</strong></p>
            <div class="form-actions"><button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="confirmQImport" ${errors.length ? "disabled" : ""}>Import ${items.length} MCQ(s)</button></div>
          </div>`;
          openModal(`<div class="modal-head"><h2>Import MCQs</h2><button class="modal-close" data-modal-close>✕</button></div>${previewHtml}`, true);
          $("#confirmQImport")?.addEventListener("click", async () => {
            const btn = $("#confirmQImport"); btn.disabled = true; btn.textContent = "Importing…";
            try {
              for (const q of items) {
                const ref = q.id ? doc(db, "questions", q.id) : doc(collection(db, "questions"));
                await setDoc(ref, {
                  questionText: q.questionText, options: q.options,
                  correctOptionId: q.correctOptionId, explanation: q.explanation || "",
                  level: q.level || "L1", importance: q.importance || "normal",
                  chapterId, subjectId: chapter.subjectId || "",
                  order: Number(q.order || 0), status: q.status || "draft",
                  createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                }, { merge: true });
              }
              toast(`Imported ${items.length} MCQ(s).`, "success");
              closeModal();
              router();
            } catch (err) { toast(friendlyError(err, "importing MCQs"), "error"); btn.disabled = false; btn.textContent = "Import"; }
          });
        } catch (err) { toast(`Invalid JSON: ${err.message}`, "error"); }
      };
      $("#qExportBtn").onclick = () => {
        const data = questions.map(q => ({
          questionText: q.questionText, options: q.options, correctOptionId: q.correctOptionId,
          explanation: q.explanation || "", level: q.level, importance: q.importance || "normal",
          order: q.order || 0, status: q.status
        }));
        downloadFile(`mcqs-${chapterId}.json`, JSON.stringify({ questions: data }, null, 2), "application/json");
      };
    }
  };
  $$(".tab").forEach(t => t.addEventListener("click", () => renderTab(t.dataset.tab)));
  renderTab("materials");
}

/* ---- Admin: Material form ---- */
function openMaterialForm(chapterId, id, subjectId) {
  (async () => {
    let ex = {};
    if (id) { const s = await getDoc(doc(db, "materials", id)); if (s.exists()) ex = s.data(); }
    S.editResources = Array.isArray(ex.resources) ? JSON.parse(JSON.stringify(ex.resources)) : [];
    renderResourcesEditor();
    openModal(`
      <div class="modal-head"><h2>${id ? "Edit" : "New"} Material</h2><button class="modal-close" data-modal-close>✕</button></div>
      <div class="form-grid">
        <div><label>Title <span class="required">*</span></label><input id="matTitle" value="${escapeHtml(ex.title || "")}"></div>
        <div><label>Level</label><select id="matLevel">
          <option value="L1" ${ex.level === "L1" ? "selected" : ""}>L1 · Basic</option>
          <option value="L2" ${ex.level === "L2" ? "selected" : ""}>L2 · Medium</option>
          <option value="L3" ${ex.level === "L3" ? "selected" : ""}>L3 · Advanced</option>
        </select></div>
        <div><label>Importance</label><select id="matImp">
          <option value="normal" ${ex.importance === "normal" ? "selected" : ""}>Normal</option>
          <option value="important" ${ex.importance === "important" ? "selected" : ""}>Important</option>
          <option value="veryImportant" ${ex.importance === "veryImportant" ? "selected" : ""}>Very important</option>
        </select></div>
        <div><label>HTML Content <span class="required">*</span></label>
          <textarea id="matHtml" rows="12" placeholder="<h2>Heading</h2><p>Text</p><ul><li>Point</li></ul><table>...</table><mark>highlight</mark>">${escapeHtml(ex.html || ex.content || "")}</textarea>
          <p class="tiny muted">Supports: h1-h6, p, strong, em, ul/ol/li, table, img, a, blockquote, mark, code</p>
        </div>
        <div><label>External Resources (YouTube / PDF / Website)</label>
          <div id="resEditor"></div>
          <button class="btn btn-small mt-8" id="addResBtn" type="button">+ Add Resource</button>
        </div>
        <div><label>Status</label><select id="matStatus">
          <option value="draft" ${ex.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${ex.status === "published" ? "selected" : ""}>Published</option>
          <option value="archived" ${ex.status === "archived" ? "selected" : ""}>Archived</option>
        </select></div>
      </div>
      <div class="form-actions"><button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="saveMat">Save</button></div>
    `, true);

    function renderResourcesEditor() {
      const box = $("#resEditor"); if (!box) return;
      box.innerHTML = S.editResources.map((r, i) => `
        <div class="editor-option">
          <div class="mini-row"><input type="text" data-res-title="${i}" value="${escapeHtml(r.title || "")}" placeholder="Title" style="flex:1"></div>
          <div class="mini-row mt-8">
            <input type="url" data-res-url="${i}" value="${escapeHtml(r.url || "")}" placeholder="https://..." style="flex:1">
            <select data-res-type="${i}">
              <option value="youtube" ${r.type === "youtube" ? "selected" : ""}>YouTube</option>
              <option value="pdf" ${r.type === "pdf" ? "selected" : ""}>PDF</option>
              <option value="website" ${r.type === "website" ? "selected" : ""}>Website</option>
            </select>
            <button class="btn btn-small btn-danger" type="button" data-res-remove="${i}">✕</button>
          </div>
        </div>`).join("");
      $$("[data-res-title]").forEach(inp => inp.addEventListener("input", () => { S.editResources[+inp.dataset.resTitle].title = inp.value; }));
      $$("[data-res-url]").forEach(inp => inp.addEventListener("input", () => { S.editResources[+inp.dataset.resUrl].url = inp.value; }));
      $$("[data-res-type]").forEach(s => s.addEventListener("change", () => { S.editResources[+s.dataset.resType].type = s.value; }));
      $$("[data-res-remove]").forEach(b => b.addEventListener("click", () => { S.editResources.splice(+b.dataset.resRemove, 1); renderResourcesEditor(); }));
    }
    renderResourcesEditor();
    $("#addResBtn").onclick = () => { S.editResources.push({ title: "", url: "", type: "youtube" }); renderResourcesEditor(); };

    $("#saveMat").onclick = async () => {
      const btn = $("#saveMat"); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const title = $("#matTitle").value.trim();
        const html = $("#matHtml").value;
        if (!title) { toast("Title required.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        if (!html.trim()) { toast("HTML content required.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        const data = {
          title, html, level: $("#matLevel").value, importance: $("#matImp").value,
          resources: S.editResources.filter(r => r.url && r.title),
          chapterId, subjectId, order: 0, status: $("#matStatus").value,
          updatedAt: serverTimestamp()
        };
        if (!id) data.createdAt = serverTimestamp();
        const ref = id ? doc(db, "materials", id) : doc(collection(db, "materials"));
        await setDoc(ref, data, { merge: true });
        toast("Material saved.", "success");
        closeModal();
        router();
      } catch (err) {
        console.error("Save material error", err);
        toast(friendlyError(err, "saving material"), "error", 5000);
        btn.disabled = false; btn.textContent = "Save";
      }
    };
  })();
}

async function previewMaterial(id) {
  const s = await getDoc(doc(db, "materials", id));
  if (!s.exists()) return toast("Not found.", "error");
  const m = s.data();
  openModal(`
    <div class="modal-head"><h2>Preview: ${escapeHtml(m.title || "")}</h2><button class="modal-close" data-modal-close>✕</button></div>
    <div class="reader-content">${sanitizeHtml(m.html || m.content || "")}</div>
  `, true);
}

/* ---- Admin: Question form ---- */
function openQuestionForm(chapterId, id, subjectId) {
  (async () => {
    let ex = {};
    if (id) { const s = await getDoc(doc(db, "questions", id)); if (s.exists()) ex = s.data(); }
    S.editOptions = Array.isArray(ex.options) && ex.options.length ? JSON.parse(JSON.stringify(ex.options)) : [
      { id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }, { id: "d", text: "" }
    ];
    S.editCorrectId = ex.correctOptionId || "a";

    openModal(`
      <div class="modal-head"><h2>${id ? "Edit" : "New"} MCQ</h2><button class="modal-close" data-modal-close>✕</button></div>
      <div class="form-grid">
        <div><label>Question <span class="required">*</span></label><textarea id="qText" rows="3">${escapeHtml(ex.questionText || "")}</textarea></div>
        <div><label>Level / Difficulty</label><select id="qLevel">
          <option value="L1" ${ex.level === "L1" ? "selected" : ""}>L1 · Easy</option>
          <option value="L2" ${ex.level === "L2" ? "selected" : ""}>L2 · Medium</option>
          <option value="L3" ${ex.level === "L3" ? "selected" : ""}>L3 · Hard</option>
        </select></div>
        <div><label>Importance</label><select id="qImp">
          <option value="normal" ${ex.importance === "normal" ? "selected" : ""}>Normal</option>
          <option value="important" ${ex.importance === "important" ? "selected" : ""}>Important</option>
          <option value="veryImportant" ${ex.importance === "veryImportant" ? "selected" : ""}>Very important</option>
        </select></div>
        <div><label>Options <span class="required">*</span></label>
          <div id="optEditor"></div>
          <button class="btn btn-small mt-8" id="addOptBtn" type="button">+ Add Option</button>
        </div>
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
      const box = $("#optEditor"); if (!box) return;
      box.innerHTML = S.editOptions.map((o, i) => `
        <div class="editor-option">
          <div class="mini-row">
            <input type="text" data-opt-text="${i}" value="${escapeHtml(o.text || "")}" placeholder="Option ${String.fromCharCode(65 + i)}" style="flex:1">
            <label class="small"><input type="radio" name="correctOpt" value="${escapeHtml(o.id)}" ${S.editCorrectId === o.id ? "checked" : ""}> Correct</label>
            <button class="btn btn-small btn-danger" type="button" data-opt-remove="${i}" ${S.editOptions.length <= 2 ? "disabled" : ""}>✕</button>
          </div>
        </div>`).join("");
      $$("[data-opt-text]").forEach(inp => inp.addEventListener("input", () => { S.editOptions[+inp.dataset.optText].text = inp.value; }));
      $$('input[name="correctOpt"]').forEach(r => r.addEventListener("change", () => { S.editCorrectId = r.value; }));
      $$("[data-opt-remove]").forEach(b => b.addEventListener("click", () => {
        S.editOptions.splice(+b.dataset.optRemove, 1);
        if (!S.editOptions.some(o => o.id === S.editCorrectId)) S.editCorrectId = S.editOptions[0]?.id || "a";
        renderOpts();
      }));
    }
    renderOpts();
    $("#addOptBtn").onclick = () => {
      if (S.editOptions.length >= 6) return toast("Max 6 options.", "error");
      S.editOptions.push({ id: String.fromCharCode(97 + S.editOptions.length), text: "" });
      renderOpts();
    };

    $("#saveQ").onclick = async () => {
      const btn = $("#saveQ"); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const qText = $("#qText").value.trim();
        if (!qText) { toast("Question required.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        const valid = S.editOptions.filter(o => o.text.trim());
        if (valid.length < 2) { toast("Need ≥2 options with text.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        if (!valid.some(o => o.id === S.editCorrectId)) { toast("Mark the correct option.", "error"); btn.disabled = false; btn.textContent = "Save"; return; }
        const data = {
          questionText: qText, options: valid, correctOptionId: S.editCorrectId,
          explanation: $("#qExpl").value.trim(), level: $("#qLevel").value,
          importance: $("#qImp").value, chapterId, subjectId, order: 0,
          status: $("#qStatus").value, updatedAt: serverTimestamp()
        };
        if (!id) data.createdAt = serverTimestamp();
        const ref = id ? doc(db, "questions", id) : doc(collection(db, "questions"));
        await setDoc(ref, data, { merge: true });
        toast("MCQ saved.", "success");
        closeModal();
        router();
      } catch (err) {
        console.error("Save MCQ error", err);
        toast(friendlyError(err, "saving MCQ"), "error", 5000);
        btn.disabled = false; btn.textContent = "Save";
      }
    };
  })();
}

async function previewQuestion(id) {
  const s = await getDoc(doc(db, "questions", id));
  if (!s.exists()) return toast("Not found.", "error");
  const q = s.data();
  openModal(`
    <div class="modal-head"><h2>Preview MCQ</h2><button class="modal-close" data-modal-close>✕</button></div>
    <div class="question-stem">${escapeHtml(q.questionText || "")}</div>
    <div class="option-list">${(q.options || []).map((o, i) => {
      const key = o.id || String.fromCharCode(97 + i);
      const isCorrect = q.correctOptionId === key;
      return `<div class="option-btn ${isCorrect ? "correct" : ""}" style="cursor:default">
        <span class="option-key">${String.fromCharCode(65 + i)}</span>
        <span>${escapeHtml(o.text || "")} ${isCorrect ? "<strong>(correct)</strong>" : ""}</span>
      </div>`;
    }).join("")}</div>
    ${q.explanation ? `<div class="explanation-box"><h4>Explanation</h4><p>${sanitizeHtml(q.explanation)}</p></div>` : ""}
  `, true);
}

/* ---- Admin: Import/Export full subject ---- */
function renderAdminImport(token) {
  setPage(`
    <div class="page-head"><div><h1 class="page-title">JSON Import / Export</h1>
    <p class="page-sub">Bulk load subjects with chapters, materials, and MCQs.</p></div>
    <a class="btn" href="#/admin">← Back</a></div>

    <div class="card mb-16">
      <h2 class="card-title">Import full subject JSON</h2>
      <p class="small muted">Structure: <code>{ "subject": {...}, "chapters": [{..., "materials": [...], "questions": [...]}] }</code></p>
      <div class="form-grid">
        <div><label>JSON file</label><input type="file" id="importFile" accept=".json"></div>
        <div><label>Mode</label><select id="importMode">
          <option value="addNew">Add New (skip if ID exists)</option>
          <option value="addOrUpdate">Add or Update</option>
          <option value="updateById">Update by ID only</option>
        </select></div>
      </div>
      <div class="row mt-16">
        <button class="btn btn-primary" id="previewImport">Validate &amp; Preview</button>
        <button class="btn" id="downloadTemplate">Download Template</button>
      </div>
      <div id="previewBox" class="mt-16"></div>
    </div>

    <div class="card">
      <h2 class="card-title">Export full subject</h2>
      <div class="form-grid">
        <div><label>Subject ID</label><input id="exportSubId" placeholder="Paste subject ID"></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" id="exportBtn">Export JSON</button></div>
    </div>
  `);

  $("#downloadTemplate").onclick = () => {
    const tpl = {
      subject: { title: "Example Subject", description: "Description", status: "draft", order: 0 },
      chapters: [{
        title: "Chapter 1", chapterNumber: 1, description: "Description", status: "draft",
        materials: [{
          title: "Introduction", level: "L1", importance: "important", status: "draft",
          html: "<h2>Heading</h2><p>Paragraph with <strong>bold</strong> and <mark>highlighted</mark> text.</p><ul><li>Point 1</li><li>Point 2</li></ul>",
          resources: [{ title: "Video", url: "https://www.youtube.com/watch?v=xxx", type: "youtube" }]
        }],
        questions: [{
          questionText: "Sample question?",
          options: [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }, { id: "c", text: "Option C" }, { id: "d", text: "Option D" }],
          correctOptionId: "a", level: "L1", explanation: "Explanation", status: "draft"
        }]
      }]
    };
    downloadFile("sajilo-template.json", JSON.stringify(tpl, null, 2), "application/json");
  };

  $("#previewImport").onclick = async () => {
    const file = $("#importFile").files[0];
    if (!file) return toast("Choose a JSON file.", "error");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const subjects = Array.isArray(parsed) ? parsed : (parsed.subject ? [parsed] : (parsed.subjects || []));
      if (!subjects.length) return toast("No subjects found.", "error");

      let totalChapters = 0, totalMaterials = 0, totalQuestions = 0;
      const errors = [];
      subjects.forEach((sb, si) => {
        const sub = sb.subject || sb;
        if (!sub.title) errors.push(`Subject ${si + 1}: missing title`);
        (sb.chapters || []).forEach((ch, ci) => {
          totalChapters++;
          if (!ch.title) errors.push(`Subject ${si + 1}, Chapter ${ci + 1}: missing title`);
          totalMaterials += (ch.materials || []).length;
          (ch.questions || []).forEach((q, qi) => {
            totalQuestions++;
            if (!q.questionText) errors.push(`Subject ${si + 1}, Ch ${ci + 1}, Q ${qi + 1}: missing questionText`);
            if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`Subject ${si + 1}, Ch ${ci + 1}, Q ${qi + 1}: needs ≥2 options`);
            if (q.options && !q.options.some(o => o.id === q.correctOptionId)) errors.push(`Subject ${si + 1}, Ch ${ci + 1}, Q ${qi + 1}: correctOptionId invalid`);
          });
        });
      });

      $("#previewBox").innerHTML = `<div class="card" style="box-shadow:none">
        <div class="grid grid-4 mb-16">
          <div class="stat-card"><div class="stat-value">${subjects.length}</div><div class="stat-label">Subjects</div></div>
          <div class="stat-card"><div class="stat-value">${totalChapters}</div><div class="stat-label">Chapters</div></div>
          <div class="stat-card"><div class="stat-value">${totalMaterials}</div><div class="stat-label">Materials</div></div>
          <div class="stat-card"><div class="stat-value">${totalQuestions}</div><div class="stat-label">MCQs</div></div>
        </div>
        ${errors.length ? `<div style="padding:12px;background:#fee2e2;color:#991b1b;border-radius:12px"><strong>${errors.length} error(s):</strong><ul>${errors.slice(0, 15).map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>` : '<p class="badge green">✓ Validation passed</p>'}
        <div class="form-actions"><button class="btn btn-primary" id="confirmImport" ${errors.length ? "disabled" : ""}>Confirm Import</button></div>
      </div>`;

      $("#confirmImport")?.addEventListener("click", async () => {
        const btn = $("#confirmImport"); btn.disabled = true; btn.textContent = "Importing…";
        const mode = $("#importMode").value;
        try {
          let subCount = 0, chCount = 0, matCount = 0, qCount = 0, skipped = 0;
          for (const sBlock of subjects) {
            const subData = sBlock.subject || sBlock;
            const subRef = subData.id ? doc(db, "subjects", subData.id) : doc(collection(db, "subjects"));
            const existing = await getDoc(subRef);
            if (existing.exists() && mode === "addNew") { skipped++; continue; }
            await setDoc(subRef, {
              title: subData.title || "Untitled", description: subData.description || "",
              status: subData.status || "draft", order: Number(subData.order || 0),
              createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            }, { merge: true });
            subCount++;
            const subjectId = subRef.id;

            for (const chData of (sBlock.chapters || [])) {
              const chRef = chData.id ? doc(db, "chapters", chData.id) : doc(collection(db, "chapters"));
              const chExisting = await getDoc(chRef);
              if (chExisting.exists() && mode === "addNew") { skipped++; continue; }
              await setDoc(chRef, {
                title: chData.title || "Untitled", chapterNumber: Number(chData.chapterNumber || 1),
                description: chData.description || "", subjectId, status: chData.status || "draft",
                order: Number(chData.order || 0), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
              }, { merge: true });
              chCount++;
              const chapterId = chRef.id;

              for (const mData of (chData.materials || [])) {
                const mRef = mData.id ? doc(db, "materials", mData.id) : doc(collection(db, "materials"));
                await setDoc(mRef, {
                  title: mData.title || "Untitled", html: mData.html || mData.content || "",
                  level: mData.level || "L1", importance: mData.importance || "normal",
                  resources: mData.resources || [], chapterId, subjectId,
                  order: Number(mData.order || 0), status: mData.status || "draft",
                  createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                }, { merge: true });
                matCount++;
              }

              for (const qData of (chData.questions || [])) {
                const qRef = qData.id ? doc(db, "questions", qData.id) : doc(collection(db, "questions"));
                await setDoc(qRef, {
                  questionText: qData.questionText || "", options: qData.options || [],
                  correctOptionId: qData.correctOptionId || "",
                  explanation: qData.explanation || "", level: qData.level || "L1",
                  importance: qData.importance || "normal", chapterId, subjectId,
                  order: Number(qData.order || 0), status: qData.status || "draft",
                  createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                }, { merge: true });
                qCount++;
              }
            }
          }
          toast(`Imported: ${subCount} subjects, ${chCount} chapters, ${matCount} materials, ${qCount} MCQs. Skipped: ${skipped}.`, "success", 6000);
          $("#previewBox").innerHTML = `<div class="card" style="box-shadow:none"><p class="badge green">✓ Import complete</p></div>`;
        } catch (err) {
          console.error("Import error", err);
          toast(friendlyError(err, "importing"), "error", 5000);
          btn.disabled = false; btn.textContent = "Confirm Import";
        }
      });
    } catch (err) {
      toast(`Invalid JSON: ${err.message}`, "error");
    }
  };

  $("#exportBtn").onclick = async () => {
    const id = $("#exportSubId").value.trim();
    if (!id) return toast("Enter subject ID.", "error");
    try {
      const subSnap = await getDoc(doc(db, "subjects", id));
      if (!subSnap.exists()) return toast("Subject not found.", "error");
      const subject = { id: subSnap.id, ...subSnap.data() };
      const chSnap = await getDocs(query(collection(db, "chapters"), where("subjectId","==",id), limit(500)));
      const chapters = [];
      for (const cd of chSnap.docs) {
        const chapter = { id: cd.id, ...cd.data() };
        const [mSnap, qSnap] = await Promise.all([
          getDocs(query(collection(db, "materials"), where("chapterId","==",cd.id), limit(500))),
          getDocs(query(collection(db, "questions"), where("chapterId","==",cd.id), limit(500)))
        ]);
        chapter.materials = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        chapter.questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        chapters.push(chapter);
      }
      downloadFile(`subject-${id}.json`, JSON.stringify({ subject, chapters }, null, 2), "application/json");
      toast("Exported.", "success");
    } catch (err) { toast(friendlyError(err, "exporting"), "error"); }
  };
}

/* ============ BOOT ============ */
function boot() {
  cacheEls();
  initTheme();
  bindAuth();
  bindShell();

  if (firebaseInitError) {
    if (els.bootScreen) els.bootScreen.innerHTML = `<div class="boot-logo">Sajilo<span>GK</span></div><p style="color:#fee2e2">Firebase initialization failed.</p><button class="btn" onclick="location.reload()">Reload</button>`;
    return;
  }

  getRedirectResult(auth).catch(err => console.warn("Redirect result:", err));

  onAuthStateChanged(auth, async user => {
    S.user = user;
    if (!user) {
      S.profile = null; S.profileLoaded = false; S.profilePromise = null;
      S.isOwner = false; S.isAdmin = false; S.selectedSubjects = []; S.exams = [];
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
