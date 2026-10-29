/* ============================================================
   Dream Japan — JFT Mock Test (3-file SPA)
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============ CONFIG ============ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD_JxMqTdYiW2DF8lgAlojh1quO32M0CuI",
  authDomain: "dream-japan-9cad8.firebaseapp.com",
  projectId: "dream-japan-9cad8",
  storageBucket: "dream-japan-9cad8.firebasestorage.app",
  messagingSenderId: "587561440248",
  appId: "1:587561440248:web:5a97ae4d2366e3b5583c0d",
  measurementId: "G-V3M5626QM5"
};
const ADMIN_EMAIL = "deepakrajpant978@gmail.com";
const REPO_BASE = "https://raw.githubusercontent.com/deepakrajpant/photo/main/";
const QUESTIONS_DOC = "jftoctnovset/QORwII8D7qLZ7wuCDW36";
const CACHE_KEY = "dj_q_cache_v4";
const CACHE_TTL = 30 * 60 * 1000;
const EXAM_MIN = 60;
const MAX_PLAYS = 2;
const PASS_PCT = 0.8;
const EXAM_STATE_KEY = "dj_exam_state";
const RESULT_KEY = "dj_result";

const SECTIONS = [
  { key:"sv", name:"Script & Vocabulary", short:"VOCAB", marks:3, icon:"📝" },
  { key:"ce", name:"Conversation & Expression", short:"CONV", marks:4, icon:"💬" },
  { key:"lc", name:"Listening Comprehension", short:"LISTEN", marks:6, icon:"🎧" },
  { key:"rc", name:"Reading Comprehension", short:"READ", marks:7, icon:"📖" }
];
const SET_NAMES = [
  { name:"SHIMEMASU", kana:"し" },{ name:"HARE", kana:"は" },
  { name:"GAKUSEI", kana:"が" },{ name:"ORIMASU", kana:"お" },
  { name:"PONPYUTA", kana:"ぽ" },{ name:"MAGARIMASU", kana:"ま" }
];

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/* ============ STATE ============ */
const state = {
  user: null, profile: null, isAdmin: false,
  screen: "loading", params: {},
  sets: [], plans: [], results: [],
  exam: null, practice: null,
  bookmarks: [], leaderboard: [],
  _userSub: null, _tick: null, _audio: null,
  _allStudents: null, _allQs: null,
  totalQ: 52, fullMarks: 250, passMarks: 200
};

/* ============ UTILS ============ */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const pad = n => String(n).padStart(2, "0");

let _toastTimer;
function toast(msg, type="") {
  const t = $("toast"); t.textContent = msg; t.className = "toast show" + (type ? " " + type : "");
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}
function modal(title, bodyHTML, buttons) {
  const m = $("modal");
  const btns = buttons || [{ label: "OK", cls: "btn-primary" }];
  const btnHtml = btns.map((b, i) => `<button class="btn ${b.cls || "btn-primary"}" data-idx="${i}">${b.label}</button>`).join("");
  m.innerHTML = `<div class="modal-card"><h3>${esc(title)}</h3><div>${bodyHTML}</div><div class="modal-actions">${btnHtml}</div></div>`;
  m.classList.add("show");
  m.querySelectorAll(".modal-actions button").forEach(btn => {
    btn.onclick = () => {
      m.classList.remove("show");
      const b = btns[+btn.dataset.idx];
      if (b && b.onClick) b.onClick();
    };
  });
}
function closeModal() { $("modal").classList.remove("show"); }

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}
function daysLeft(ts) {
  if (!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
}
function resolveUrl(url) {
  if (!url) return "";
  url = String(url).trim();
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("scene:") || url.startsWith("tts:")) return url;
  const gh = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
  if (gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`;
  if (url.startsWith("//")) return "https:" + url;
  if (/^https?:\/\//.test(url)) return url;
  return REPO_BASE + url.replace(/^\/+/, "");
}
function sceneData(kind) {
  const sky = { rain:"#7f94a8", sun:"#6ec1f2", snow:"#c8d6e5", cloud:"#9fb3c4" }[kind] || "#6ec1f2";
  let x = kind === "sun" ? `<circle cx="300" cy="55" r="30" fill="#ffd23f"/>`
    : `<ellipse cx="110" cy="52" rx="55" ry="22" fill="#fff" opacity=".88"/><ellipse cx="255" cy="44" rx="60" ry="24" fill="#fff" opacity=".88"/>`;
  if (kind === "rain") for (let i = 0; i < 24; i++) x += `<line x1="${20+i*15}" y1="${90+(i*37)%60}" x2="${14+i*15}" y2="${110+(i*37)%60}" stroke="#d8ecff" stroke-width="2"/>`;
  if (kind === "snow") for (let i = 0; i < 22; i++) x += `<circle cx="${15+i*16}" cy="${95+(i*53)%90}" r="3" fill="#fff"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 200"><rect width="360" height="200" fill="${sky}"/>${x}<rect y="165" width="360" height="35" fill="#5d8a4e"/><polygon points="170,165 215,95 260,165" fill="#c94536"/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
const LOGO_SVG = `<svg viewBox="0 0 24 24"><path d="M12 4L20 19H4L12 4Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;

/* ============ ROUTER ============ */
function navigate(screen, params = {}) {
  const search = new URLSearchParams(params).toString();
  const hash = "#/" + screen + (search ? "?" + search : "");
  if (location.hash !== hash) history.pushState({ screen, params }, "", hash);
  state.screen = screen;
  state.params = params;
  render();
  window.scrollTo(0, 0);
}
function parseHash() {
  const raw = location.hash || "#/home";
  const [screen, qs] = raw.slice(2).split("?");
  const params = {};
  if (qs) new URLSearchParams(qs).forEach((v, k) => params[k] = v);
  return { screen: screen || "home", params };
}
window.addEventListener("popstate", () => {
  if (state.screen === "exam" && state.exam) {
    history.pushState({ screen: "exam" }, "", "#/exam");
    askLeaveExam();
    return;
  }
  const { screen, params } = parseHash();
  state.screen = screen;
  state.params = params;
  render();
});
window.addEventListener("hashchange", () => {
  if (state.screen === "exam" && state.exam) return;
  const { screen, params } = parseHash();
  if (state.screen === screen && JSON.stringify(state.params) === JSON.stringify(params)) return;
  state.screen = screen;
  state.params = params;
  render();
});

/* ============ AUTH ============ */
async function signInGoogle() {
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (["auth/popup-blocked","auth/popup-closed-by-user","auth/cancelled-popup-request",
         "auth/operation-not-supported-in-this-environment"].includes(e.code)) {
      try { await signInWithRedirect(auth, provider); }
      catch (re) { toast(re.message, "err"); }
    } else { toast("Login failed: " + (e.code || e.message), "err"); }
  }
}
async function signInEmail(email, pass) {
  try { await signInWithEmailAndPassword(auth, email, pass); return true; }
  catch (e) {
    const map = {
      "auth/user-not-found":"No account with this email",
      "auth/wrong-password":"Incorrect password",
      "auth/invalid-email":"Invalid email",
      "auth/invalid-credential":"Invalid email or password"
    };
    toast(map[e.code] || "Login failed", "err");
    return false;
  }
}
async function signUpEmail(email, pass, name) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "users", cred.user.uid), {
      name: name || email.split("@")[0], email, photoURL: "",
      emailVerified: false, role: email === ADMIN_EMAIL ? "admin" : "student",
      status: "active", practiceAccess: false, premium: null,
      bookmarks: [], streak: { count: 0, last: null }, bestScore: 0,
      createdAt: serverTimestamp(), lastLogin: serverTimestamp()
    });
    try { await sendEmailVerification(cred.user); } catch {}
    toast("Account created! Check email to verify.", "ok");
    return true;
  } catch (e) {
    const map = {
      "auth/email-already-in-use":"Email already in use",
      "auth/weak-password":"Password too weak (6+ chars)",
      "auth/invalid-email":"Invalid email"
    };
    toast(map[e.code] || "Signup failed", "err");
    return false;
  }
}
async function resetPassword(email) {
  try { await sendPasswordResetEmail(auth, email); toast("Reset link sent", "ok"); }
  catch (e) { toast("Failed: " + e.message, "err"); }
}
async function logout() {
  if (state._userSub) { state._userSub(); state._userSub = null; }
  await signOut(auth);
}

async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { lastLogin: serverTimestamp() }).catch(() => {});
    return { uid: user.uid, ...snap.data() };
  }
  const isAdmin = user.email === ADMIN_EMAIL;
  const profile = {
    name: user.displayName || (user.email || "").split("@")[0],
    email: user.email || "", photoURL: user.photoURL || "",
    emailVerified: !!user.emailVerified,
    role: isAdmin ? "admin" : "student", status: "active",
    practiceAccess: false, premium: null, bookmarks: [],
    streak: { count: 0, last: null }, bestScore: 0,
    createdAt: serverTimestamp(), lastLogin: serverTimestamp()
  };
  try { await setDoc(ref, profile); } catch (e) { console.warn("Profile create:", e.code); }
  return { uid: user.uid, ...profile };
}

/* ============ DATA ============ */
function normalizeRow(r) {
  if (!r) return null;
  if (Array.isArray(r)) {
    if (r.length < 11) return null;
    return {
      set: Number(r[0]) || 1, section: String(r[1] || "sv").toLowerCase(),
      question: String(r[2] || "").trim(), passage: String(r[3] || "").trim(),
      image: String(r[4] || "").trim(), audio: String(r[5] || "").trim(),
      answer: String(r[6] || "A").toUpperCase(),
      A: String(r[7] || "").trim(), B: String(r[8] || "").trim(),
      C: String(r[9] || "").trim(), D: String(r[10] || "").trim()
    };
  }
  return {
    set: Number(r.set) || 1, section: String(r.section || "sv").toLowerCase(),
    question: String(r.question || "").trim(), passage: String(r.passage || "").trim(),
    image: String(r.image || "").trim(), audio: String(r.audio || "").trim(),
    answer: String(r.answer || "A").toUpperCase(),
    A: String(r.A || "").trim(), B: String(r.B || "").trim(),
    C: String(r.C || "").trim(), D: String(r.D || "").trim()
  };
}
function getCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || c.v !== 4 || !Array.isArray(c.rows)) return null;
    return c;
  } catch { return null; }
}
function setCache(rows) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: 4, ts: Date.now(), rows })); } catch {}
}
function clearQCache() { try { sessionStorage.removeItem(CACHE_KEY); } catch {} }

async function fetchQuestionsFromFirestore() {
  const snap = await getDoc(doc(db, QUESTIONS_DOC));
  if (!snap.exists()) throw new Error("Questions not found");
  const data = snap.data();
  let rows = null;
  if (Array.isArray(data)) rows = data;
  else if (Array.isArray(data.questions)) rows = data.questions;
  else for (const k of Object.keys(data)) { if (Array.isArray(data[k])) { rows = data[k]; break; } }
  if (!rows || !rows.length) throw new Error("No questions found");
  return rows.map(normalizeRow).filter(Boolean);
}
async function loadQuestions(force = false) {
  const cached = getCache();
  if (!force && cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return { rows: cached.rows, fromCache: true };
  }
  try {
    const rows = await fetchQuestionsFromFirestore();
    setCache(rows);
    return { rows, fromCache: false };
  } catch (e) {
    if (cached) return { rows: cached.rows, fromCache: true, error: e };
    throw e;
  }
}
function buildSets(rows) {
  const sets = SET_NAMES.map((n, i) => ({
    idx: i + 1, name: n.name, kana: n.kana,
    sections: SECTIONS.map(s => ({
      key: s.key, name: s.name, short: s.short, marks: s.marks, count: 0, questions: [], icon: s.icon
    }))
  }));
  rows.forEach(r => {
    const row = normalizeRow(r);
    if (!row || row.set < 1 || row.set > 6) return;
    const set = sets[row.set - 1];
    const sec = set.sections.find(s => s.key === row.section);
    if (!sec) return;
    const ansIdx = Math.max(0, Math.min(3, row.answer.charCodeAt(0) - 65));
    sec.questions.push({
      q: row.question, p: row.passage || null,
      img: row.image ? (row.image.startsWith("scene:") ? sceneData(row.image.slice(6)) : resolveUrl(row.image)) : null,
      au: row.audio || null,
      o: [row.A, row.B, row.C, row.D],
      a: ansIdx, sel: undefined, locked: false, played: 0
    });
  });
  sets.forEach(s => s.sections.forEach(sec => sec.count = sec.questions.length));
  return sets;
}
function recomputeTotals() {
  if (!state.sets.length) return;
  const secs = state.sets[0].sections;
  state.totalQ = secs.reduce((a, s) => a + s.questions.length, 0);
  state.fullMarks = secs.reduce((a, s) => a + s.questions.length * s.marks, 0);
  state.passMarks = Math.round(state.fullMarks * PASS_PCT);
}
async function loadResults(uid) {
  try {
    const q = query(collection(db, "users", uid, "results"), orderBy("submittedAt", "desc"), limit(30));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    return out;
  } catch { return []; }
}
async function loadPlans() {
  try {
    const snap = await getDocs(collection(db, "plans"));
    const plans = [];
    snap.forEach(d => plans.push({ id: d.id, ...d.data() }));
    plans.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (!plans.length) {
      const defs = [
        { id:"p15", name:"15-Day Premium", price:500, days:15, active:true,
          benefits:["Full access to all 6 sets","Unlimited attempts","Answer explanations","Progress tracking","Practice Mode access","Bookmarks & Streak"] },
        { id:"p30", name:"30-Day Premium", price:1000, days:30, active:true,
          benefits:["Everything in 15-day","Priority support","Section-wise analytics","Leaderboard eligibility","PDF result export"] }
      ];
      for (const p of defs) try { await setDoc(doc(db, "plans", p.id), p); } catch {}
      return defs;
    }
    return plans;
  } catch { return []; }
}
async function loadLeaderboard() {
  try {
    const q = query(collection(db, "users"), orderBy("bestScore", "desc"), limit(20));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach(d => {
      const u = d.data();
      if ((u.bestScore || 0) > 0) out.push({
        uid: d.id, name: u.name || "Student", photoURL: u.photoURL || "",
        bestScore: u.bestScore, streak: (u.streak && u.streak.count) || 0
      });
    });
    return out;
  } catch { return []; }
}
async function bumpStreak() {
  if (!state.user || !state.profile) return;
  const streak = state.profile.streak || { count: 0, last: null };
  const last = streak.last ? new Date(streak.last) : null;
  const now = new Date();
  let newCount = streak.count || 0;
  if (!last) newCount = 1;
  else {
    const diff = Math.floor((now - last) / 86400000);
    if (diff === 0) return;
    newCount = diff === 1 ? newCount + 1 : 1;
  }
  try {
    await updateDoc(doc(db, "users", state.user.uid), { streak: { count: newCount, last: now.toISOString() } });
    if (state.profile) state.profile.streak = { count: newCount, last: now.toISOString() };
  } catch {}
}
async function requestAccess() {
  if (!state.profile) return;
  try {
    const existing = await getDocs(query(collection(db, "accessRequests"),
      where("uid", "==", state.user.uid), where("status", "==", "pending")));
    if (!existing.empty) return toast("You already have a pending request", "warn");
    await addDoc(collection(db, "accessRequests"), {
      uid: state.user.uid, email: state.profile.email || "", name: state.profile.name || "",
      type: "practice", status: "pending", createdAt: serverTimestamp()
    });
    toast("Request submitted ✓", "ok");
  } catch (e) { toast("Failed: " + e.message, "err"); }
}
async function requestPremium(planId) {
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) return;
  try {
    await addDoc(collection(db, "accessRequests"), {
      uid: state.user.uid, email: state.profile.email || "", name: state.profile.name || "",
      type: "premium", planId, planName: plan.name, planPrice: plan.price,
      status: "pending", createdAt: serverTimestamp()
    });
    toast("Request sent to admin ✓", "ok");
  } catch (e) { toast("Failed: " + e.message, "err"); }
}
async function toggleBookmark(setIdx, secKey, qi) {
  if (!state.user) return;
  const p = state.profile || {};
  const bms = [...(p.bookmarks || [])];
  const idx = bms.findIndex(b => b.set === setIdx && b.section === secKey && b.qi === qi);
  if (idx >= 0) bms.splice(idx, 1);
  else bms.push({ set: setIdx, section: secKey, qi, addedAt: Date.now() });
  try {
    await updateDoc(doc(db, "users", state.user.uid), { bookmarks: bms });
    state.profile.bookmarks = bms;
    toast(idx >= 0 ? "Bookmark removed" : "Bookmarked ✓", "ok");
  } catch (e) { toast("Failed: " + e.message, "err"); }
}

/* ============ EXAM STATE PERSIST ============ */
function saveExamState(ex) {
  try {
    sessionStorage.setItem(EXAM_STATE_KEY, JSON.stringify({
      setIdx: ex.setIdx, startedAt: ex.startedAt,
      si: ex.si, qi: ex.qi, left: ex.left, maxReachable: ex.maxReachable,
      answers: ex.sections.map(s => s.questions.map(q => q.sel === undefined ? null : q.sel)),
      played: ex.sections.map(s => s.questions.map(q => q.played || 0))
    }));
  } catch {}
}
function loadExamState() {
  try {
    const raw = sessionStorage.getItem(EXAM_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearExamState() { try { sessionStorage.removeItem(EXAM_STATE_KEY); } catch {} }
function saveResult(res) { try { sessionStorage.setItem(RESULT_KEY, JSON.stringify(res)); } catch {} }
function loadResult() {
  try { const r = sessionStorage.getItem(RESULT_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function clearResult() { try { sessionStorage.removeItem(RESULT_KEY); } catch {} }

/* ============ RENDER ============ */
function render() {
  const root = $("app");
  const s = state.screen;
  let html = "";

  if (!state.user) {
    if (s === "signup") html = renderSignup();
    else html = renderLogin();
  } else if (s === "loading") {
    html = renderLoading();
  } else if (s === "login" || s === "signup") {
    html = renderHomeScreen();
  } else if (s === "home") html = renderHomeScreen();
  else if (s === "sets") html = renderSets();
  else if (s === "start") html = renderStart();
  else if (s === "exam") html = renderExam();
  else if (s === "result") html = renderResult();
  else if (s === "review") html = renderReview();
  else if (s === "profile") html = renderProfile();
  else if (s === "premium") html = renderPremium();
  else if (s === "practice") html = renderPractice();
  else if (s === "bookmarks") html = renderBookmarks();
  else if (s === "leaderboard") html = renderLeaderboard();
  else if (s === "admin") html = state.isAdmin ? renderAdmin() : renderHomeScreen();
  else html = renderHomeScreen();

  root.innerHTML = html;
  postRender();
}

function topbarHTML() {
  if (!state.user) return "";
  const p = state.profile || {};
  const initial = (p.name || state.user.email || "U")[0].toUpperCase();
  const avatar = p.photoURL
    ? `<img src="${esc(p.photoURL)}" class="avatar" alt="" loading="lazy">`
    : `<div class="avatar">${initial}</div>`;
  return `<div class="topbar"><div class="topbar-inner">
    <div class="logo" data-go="home">${LOGO_SVG}</div>
    <div class="brand" data-go="home"><h1>Dream Japan</h1><p>JFT MOCK TEST</p></div>
    <button class="user-btn" data-go="profile">${avatar}
      <span>${esc(p.name || state.user.email)}</span></button>
  </div></div>`;
}
function bottomNavHTML(active) {
  if (!state.user) return "";
  const items = [
    { key:"home", icon:"🏠", label:"Home" },
    { key:"sets", icon:"📚", label:"Tests" },
    { key:"premium", icon:"⭐", label:"Premium" },
    { key:"profile", icon:"👤", label:"Profile" }
  ];
  return `<nav class="bottom-nav"><div class="bnav-inner">${items.map(it => `
    <button class="bnav-item ${active === it.key ? "on" : ""}" data-nav="${it.key}">
      <span class="ic">${it.icon}</span><span>${it.label}</span>
    </button>`).join("")}</div></nav>`;
}

function renderLoading() {
  return `<div class="loading-screen"><div class="spinner"></div><p class="muted">Loading Dream Japan…</p></div>`;
}

function renderLogin() {
  const nextParam = state.params.next || "";
  return `<div class="login-wrap"><div class="login-card">
    <div class="login-logo">${LOGO_SVG}</div>
    <h2>Dream Japan</h2>
    <p class="sub">Sign in to access JFT-BASIC mock tests</p>
    <button class="gbtn" id="gLogin">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Continue with Google
    </button>
    <div class="divider">or</div>
    <div class="field"><label>Email</label><input type="email" id="loginEmail" class="input" placeholder="you@example.com"></div>
    <div class="field"><label>Password</label><input type="password" id="loginPass" class="input" placeholder="••••••••"></div>
    <button class="btn btn-primary btn-block mt-2" id="emailLogin">Sign In</button>
    <div class="login-link"><a id="forgotLink">Forgot password?</a> · <a id="signupLink">Create account</a></div>
  </div></div>`;
}

function renderSignup() {
  return `<div class="login-wrap"><div class="login-card">
    <div class="login-logo">${LOGO_SVG}</div>
    <h2>Create Account</h2>
    <p class="sub">Join Dream Japan and start practising</p>
    <div class="field"><label>Name</label><input type="text" id="signName" class="input" placeholder="Your name"></div>
    <div class="field"><label>Email</label><input type="email" id="signEmail" class="input" placeholder="you@example.com"></div>
    <div class="field"><label>Password</label><input type="password" id="signPass" class="input" placeholder="6+ characters"></div>
    <div class="field"><label>Confirm Password</label><input type="password" id="signPass2" class="input" placeholder="Re-enter"></div>
    <button class="btn btn-primary btn-block mt-2" id="emailSignup">Create Account</button>
    <div class="login-link">Already have an account? <a id="backLogin">Sign in</a></div>
  </div></div>`;
}

function renderHomeScreen() {
  const p = state.profile || {};
  const results = state.results || [];
  const completed = results.length;
  const best = completed ? Math.max(...results.map(r => r.percentage || 0)) : 0;
  const premiumActive = p.premium && daysLeft(p.premium.expiry) > 0;
  const hasAccess = premiumActive || p.practiceAccess || state.isAdmin;
  const streak = (p.streak && p.streak.count) || 0;

  return `${topbarHTML()}<div class="wrap">
    <div class="hero" data-go="sets">
      <small>JFT-BASIC · PRACTICE SERIES</small>
      <h2>Mock Test 2026</h2>
      <p>Six full-length practice sets built on the official 4-section JFT pattern.</p>
      <div class="hero-stats">
        <div><strong>6</strong><span>Sets</span></div>
        <div><strong>${completed}</strong><span>Completed</span></div>
        <div><strong>${completed ? best + "%" : "–"}</strong><span>Best %</span></div>
      </div>
      <div class="hero-cta">Start practising →</div>
    </div>
    ${streak > 0 ? `<div class="streak-banner"><div class="fire">🔥</div><div style="flex:1"><h4>${streak}-day streak!</h4><p>Keep it up — practice daily to improve faster.</p></div></div>` : ""}
    ${!hasAccess ? `<div class="card mt-2" style="background:#fef3c7;border-color:var(--orange)">
      <div class="flex" style="align-items:flex-start">
        <div style="font-size:28px">🔒</div>
        <div style="flex:1">
          <h3 style="margin-bottom:6px">Access Required</h3>
          <p class="muted" style="margin-bottom:12px">You need practice access or premium to take tests.</p>
          <div class="flex" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" data-go="premium">View Plans</button>
            <button class="btn btn-ghost btn-sm" id="reqAccessBtn">Request Access</button>
          </div>
        </div>
      </div>
    </div>` : ""}
    <div class="grid-2 mt-2">
      <div class="card" style="cursor:pointer;text-align:center" data-go="practice">
        <div style="font-size:28px;margin-bottom:6px">🎯</div>
        <h4 style="font-size:13px">Quick Practice</h4><p class="muted small">Pick a section</p>
      </div>
      <div class="card" style="cursor:pointer;text-align:center" data-go="bookmarks">
        <div style="font-size:28px;margin-bottom:6px">🔖</div>
        <h4 style="font-size:13px">Bookmarks</h4><p class="muted small">${(p.bookmarks || []).length} saved</p>
      </div>
      <div class="card" style="cursor:pointer;text-align:center" data-go="leaderboard">
        <div style="font-size:28px;margin-bottom:6px">🏆</div>
        <h4 style="font-size:13px">Leaderboard</h4><p class="muted small">Top students</p>
      </div>
      <div class="card" style="cursor:pointer;text-align:center" data-go="premium">
        <div style="font-size:28px;margin-bottom:6px">⭐</div>
        <h4 style="font-size:13px">Premium</h4>
        <p class="muted small">${premiumActive ? daysLeft(p.premium.expiry) + "d left" : "View plans"}</p>
      </div>
    </div>
    <div class="card mt-2">
      <div class="flex-between mb-2">
        <h3>Recent Activity</h3>
        <button class="btn btn-ghost btn-sm" data-go="profile">Profile →</button>
      </div>
      ${completed ? results.slice(0, 3).map(r => `
        <div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div><h4>Set ${r.setIdx} · ${esc(r.setName || "—")}</h4><p class="muted small">${fmtDate(r.submittedAt)}</p></div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:900;color:${r.percentage >= 80 ? "var(--green)" : "var(--orange)"}">${r.percentage}%</div>
            <div class="muted small">${r.score}/${r.maxScore}</div>
          </div>
        </div>`).join("") : `<p class="muted center" style="padding:24px 0">No attempts yet. Start your first exam!</p>`}
    </div>
  </div>${bottomNavHTML("home")}`;
}

function renderSets() {
  return `${topbarHTML()}<div class="wrap" style="padding-top:16px;padding-bottom:80px">
    <button class="btn btn-ghost btn-sm mb-2" data-go="home">← Back</button>
    <h2 class="mb-2">Choose a Set</h2>
    ${state.sets.map((s, i) => `
      <div class="set-card" data-set="${i}">
        <div class="set-kana">${s.kana}</div>
        <div class="set-info">
          <small>SET ${s.idx}</small><h3>${s.name}</h3>
          <em>${s.sections.reduce((a, sec) => a + sec.count, 0)} questions · 60 min</em>
        </div>
        <div style="color:var(--purple);font-size:20px">→</div>
      </div>`).join("")}
  </div>${bottomNavHTML("sets")}`;
}

function renderStart() {
  const setIdx = +state.params.set || 0;
  const set = state.sets[setIdx];
  if (!set) return renderSets();
  const p = state.profile || {};
  const premiumActive = p.premium && daysLeft(p.premium.expiry) > 0;
  const hasAccess = premiumActive || p.practiceAccess || state.isAdmin;

  if (!hasAccess) {
    return `${topbarHTML()}<div class="wrap" style="padding-top:16px">
      <button class="btn btn-ghost btn-sm mb-2" data-go="sets">← Back</button>
      <div class="card center">
        <div style="font-size:48px;margin-bottom:12px">🔒</div>
        <h2>Access Required</h2>
        <p class="muted mt-1 mb-3">Practice access or premium is needed to start exams.</p>
        <button class="btn btn-primary btn-block mb-1" data-go="premium">View Plans</button>
        <button class="btn btn-ghost btn-block" id="reqAcc2">Request Access</button>
      </div>
    </div>`;
  }

  return `${topbarHTML()}<div class="wrap" style="padding-top:16px;padding-bottom:40px">
    <button class="btn btn-ghost btn-sm mb-2" data-go="sets">← Back</button>
    <div class="card card-lg">
      <div style="width:70px;height:70px;border-radius:50%;background:var(--grad);color:#fff;
        display:grid;place-items:center;font-size:32px;font-weight:800;margin:0 auto 16px">${set.kana}</div>
      <h2 class="center">${set.name}</h2>
      <p class="center muted mt-1" style="font-size:11px;letter-spacing:1.2px;font-weight:800;color:var(--purple)">JFT-BASIC PRACTICE MOCK TEST</p>
      <div class="grid-2 mt-3 mb-3">
        <div class="center" style="background:var(--bg);border-radius:12px;padding:14px">
          <div style="font-size:22px;font-weight:900">${state.totalQ}</div><div class="muted small">Questions</div></div>
        <div class="center" style="background:var(--bg);border-radius:12px;padding:14px">
          <div style="font-size:22px;font-weight:900">${state.fullMarks}</div><div class="muted small">Total Marks</div></div>
        <div class="center" style="background:var(--bg);border-radius:12px;padding:14px">
          <div style="font-size:22px;font-weight:900">60</div><div class="muted small">Minutes</div></div>
        <div class="center" style="background:var(--bg);border-radius:12px;padding:14px">
          <div style="font-size:22px;font-weight:900">${state.passMarks}</div><div class="muted small">Pass Mark</div></div>
      </div>
      <h3 class="mb-1">Exam Rules</h3>
      <ol class="muted mb-3" style="padding-left:18px;font-size:12.5px;line-height:1.7">
        <li>Once you finish a section you cannot return to it</li>
        <li>Timer auto-submits the exam at 00:00</li>
        <li>Answer each question before moving forward</li>
        <li>Audio can be replayed ${MAX_PLAYS} times per question</li>
        <li>Pass mark: ${state.passMarks} / ${state.fullMarks} (80%)</li>
        <li>Your progress is saved if you refresh the page</li>
      </ol>
      <label class="flex" style="background:var(--bg);padding:12px;border-radius:10px;cursor:pointer">
        <input type="checkbox" id="agree" style="width:18px;height:18px;accent-color:var(--purple)">
        <span style="font-size:12.5px;font-weight:600">I understand the rules and am ready</span>
      </label>
      <button class="btn btn-primary btn-block mt-2" id="startBtn" disabled>START EXAM</button>
    </div>
  </div>`;
}

function renderExam() {
  if (!state.exam) {
    const saved = loadExamState();
    if (saved) {
      setTimeout(() => resumeExamFromSaved(saved), 0);
      return renderLoading();
    }
    setTimeout(() => navigate("sets"), 10);
    return renderLoading();
  }
  const ex = state.exam;
  const sec = ex.sections[ex.si];
  const q = sec.questions[ex.qi];
  const isLastQ = ex.qi === sec.questions.length - 1;
  const isLastSec = ex.si === ex.sections.length - 1;
  const nextLabel = isLastQ ? (isLastSec ? "Submit Exam ✓" : "Finish Section →") : "Next →";

  let mediaHTML = "";
  if (q.img) mediaHTML += `<img src="${esc(q.img)}" loading="lazy" onerror="this.style.display='none'">`;
  if (q.au) mediaHTML += `<div class="audio-row" id="audRow">
    <button class="play-btn" id="playBtn">▶</button>
    <button class="play-btn" style="width:38px;height:38px;background:var(--bg2);color:var(--purple)" id="replayBtn">↻</button>
    <div class="wave">${'<i></i>'.repeat(18)}</div>
    <span>${Math.max(0, MAX_PLAYS - (q.played || 0))} left</span></div>`;
  if (mediaHTML) mediaHTML = `<div class="media">${mediaHTML}</div>`;

  const optsHTML = q.o.slice(0, q.o[3] ? 4 : 3).map((t, i) => `
    <div class="opt ${q.sel === i ? "sel" : ""}" data-opt="${i}">
      <div class="opt-ltr">${"ABCD"[i]}</div>
      <div class="opt-tx">${esc(t)}</div>
    </div>`).join("");

  return `<div class="exam-bar"><div class="exam-bar-inner">
    <button class="xback" id="leaveBtn">✕</button>
    <div class="exam-info">
      <b>Set ${ex.set.idx} · ${esc(ex.set.name)}</b>
      <span>Section ${ex.si + 1} of 4 — ${esc(sec.name)}</span>
    </div>
    <div class="timer ${ex.left <= 600 ? "low" : ""}" id="timerDisplay">
      ⏱ <span>${pad(Math.floor(ex.left / 60))}:${pad(ex.left % 60)}</span></div>
  </div></div>
  <div class="wrap" style="padding-bottom:40px">
    <div class="steps">${ex.sections.map((s, i) =>
      `<div class="step ${i === ex.si ? "cur" : i < ex.si ? "done" : ""}">${s.short}</div>`).join("")}</div>
    <div class="progress-bar"><i id="progressFill" style="width:${(ex.answeredCount / sec.questions.length) * 100}%"></i></div>
    <div class="palette">${sec.questions.map((qq, i) =>
      `<button class="pal-btn ${qq.sel !== undefined ? "ans" : ""} ${i === ex.qi ? "cur" : ""}"
        ${i > ex.maxReachable ? "disabled" : ""} data-jump="${i}">${i + 1}</button>`).join("")}</div>
    <div class="q-card">
      <div class="q-meta">
        <span class="q-num">Q ${ex.qi + 1} of ${sec.questions.length}</span>
        <span class="q-tag">${sec.short}</span>
        <span class="q-marks">${sec.marks} marks</span>
      </div>
      ${q.p ? `<div class="passage">${esc(q.p)}</div>` : ""}
      <div class="q-text">${esc(q.q)}</div>
      ${mediaHTML}
      <div class="opts" id="opts">${optsHTML}</div>
    </div>
    <div class="exam-nav">
      <button class="btn btn-ghost" id="prevBtn" ${ex.qi === 0 ? "disabled" : ""}>← Previous</button>
      <button class="btn btn-primary" id="nextBtn" ${q.sel === undefined ? "disabled" : ""}>${nextLabel}</button>
    </div>
  </div>`;
}

function renderResult() {
  const r = loadResult();
  if (!r) return renderHomeScreen();
  const pass = r.score >= state.passMarks;
  const pct = r.percentage;
  return `${topbarHTML()}<div class="wrap" style="padding:16px 0 40px">
    <div class="result-card">
      <div class="result-badge ${pass ? "pass" : "fail"}">${pass ? "PASSED" : "NOT PASSED"}</div>
      <span class="muted" style="font-size:11px;letter-spacing:1.2px;font-weight:800">SET ${r.setIdx} · ${esc(r.setName)}</span>
      <div class="ring mt-2">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle class="bg" cx="80" cy="80" r="68"/>
          <circle class="fg" id="resultRing" cx="80" cy="80" r="68" stroke-dasharray="427.3" stroke-dashoffset="427.3"
            stroke="${pass ? "var(--green)" : "var(--red)"}"/>
        </svg>
        <div><b>${r.score}</b><span>/ ${r.maxScore}</span></div>
      </div>
      <div class="grade-text">${pass ? (pct >= 95 ? "🌸 Outstanding!" : "✅ Passed — well done!") : `❌ Need ${state.passMarks - r.score} more marks to pass`}</div>
      <div class="result-stats">
        <div><h4>Correct</h4><p class="g">${r.correct}</p></div>
        <div><h4>Wrong</h4><p class="r">${r.wrong}</p></div>
        <div><h4>Skipped</h4><p>${r.unanswered}</p></div>
        <div><h4>Percent</h4><p>${pct}%</p></div>
      </div>
    </div>
    <div class="card mt-2">
      <h3 class="mb-2">Section Breakdown</h3>
      ${r.sections.map(s => `
        <div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;font-weight:800">${esc(s.name)}</div>
          <div style="font-size:12px;font-weight:900;color:var(--purple)">${s.score} / ${s.max}</div>
        </div>`).join("")}
    </div>
    <div class="grid-2 mt-2">
      <button class="btn btn-ghost" data-review="all">All Answers</button>
      <button class="btn btn-ghost" data-review="wrong">Wrong Only</button>
    </div>
    <button class="btn btn-teal btn-block mt-1" id="shareBtn">📤 Share Result</button>
    <button class="btn btn-primary btn-block mt-1" id="retryBtn">Try Again</button>
    <button class="btn btn-ghost btn-block mt-1" data-go="sets">Back to Sets</button>
  </div>`;
}

function renderReview() {
  const r = loadResult();
  const filter = state.params.filter || "all";
  if (!r) return renderHomeScreen();
  return `${topbarHTML()}<div class="wrap" style="padding:16px 0 40px">
    <button class="btn btn-ghost btn-sm mb-2" data-go="result">← Back</button>
    <div class="flex-between mb-2">
      <h2>Answer Review</h2>
      <div class="flex" style="gap:6px">
        <button class="btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}" data-review="all">All</button>
        <button class="btn btn-sm ${filter === "wrong" ? "btn-primary" : "btn-ghost"}" data-review="wrong">Wrong</button>
      </div>
    </div>
    ${r.sections.map(s => {
      const items = s.items.filter(it => filter === "all" || it.yourAns !== it.correctAns);
      if (!items.length) return "";
      return `<h3 class="mt-2 mb-1" style="color:var(--purple);font-size:12px;letter-spacing:.8px;text-transform:uppercase">${esc(s.name)}</h3>
        ${items.map(it => `
          <div class="card mb-1" style="border-left:4px solid ${it.yourAns === it.correctAns ? "var(--green)" : "var(--red)"}">
            <div style="font-size:11px;font-weight:800;color:var(--muted);margin-bottom:6px">Q${it.idx + 1} · ${s.marks} marks${it.yourAns === undefined ? " · not answered" : ""}</div>
            ${it.p ? `<div class="passage" style="font-size:13px;padding:10px;margin-bottom:8px">${esc(it.p)}</div>` : ""}
            ${it.img ? `<img src="${esc(it.img)}" loading="lazy" style="width:100%;border-radius:10px;margin-bottom:8px" onerror="this.style.display='none'">` : ""}
            ${it.au ? `<div class="muted small mb-1" style="font-weight:700">🔊 ${esc(it.au)}</div>` : ""}
            <div style="font-size:13.5px;line-height:1.5;margin-bottom:8px;white-space:pre-line">${esc(it.q)}</div>
            ${it.o.map((txt, i) => {
              if (i === 3 && !txt) return "";
              const isC = i === it.correctAns, isY = i === it.yourAns;
              const style = isC ? "background:#d1fae5;border-color:var(--green)" : (isY && !isC ? "background:#fee2e2;border-color:var(--red)" : "");
              return `<div style="padding:9px 11px;border:1px solid var(--border);border-radius:9px;margin-top:6px;font-size:12.5px;${style}">
                ${"ABCD"[i]}. ${esc(txt)} ${isC ? "✓ Correct" : ""} ${isY && !isC ? "✗ Your answer" : ""}</div>`;
            }).join("")}
          </div>`).join("")}`;
    }).join("")}
  </div>`;
}

function renderProfile() {
  const p = state.profile || {};
  const premActive = p.premium && daysLeft(p.premium.expiry) > 0;
  const streak = (p.streak && p.streak.count) || 0;
  return `${topbarHTML()}<div class="wrap" style="padding-bottom:80px">
    <div class="profile-header">
      ${p.photoURL ? `<img src="${esc(p.photoURL)}" class="profile-avatar" loading="lazy">`
        : `<div class="profile-avatar">${(p.name || "U")[0].toUpperCase()}</div>`}
      <h2>${esc(p.name || "Student")}</h2><p>${esc(p.email || "")}</p>
      <div class="role-badge">${state.isAdmin ? "👑 Administrator" : premActive ? "⭐ Premium" : "Student"}</div>
    </div>
    <div class="grid-3 mt-2">
      <div class="stat-card center"><div class="num">${state.results.length}</div><div class="lbl">Tests</div></div>
      <div class="stat-card center"><div class="num">${streak}</div><div class="lbl">Streak</div></div>
      <div class="stat-card center"><div class="num">${p.bestScore || 0}%</div><div class="lbl">Best</div></div>
    </div>
    <div class="card mt-2">
      <h3 class="mb-2">Account Status</h3>
      <div class="flex-between" style="padding:8px 0"><span class="muted small">Account</span>
        <span class="badge ${p.status === "blocked" ? "badge-danger" : "badge-success"}">${p.status === "blocked" ? "Blocked" : "Active"}</span></div>
      <div class="flex-between" style="padding:8px 0;border-top:1px solid var(--border)">
        <span class="muted small">Practice Access</span>
        <span class="badge ${p.practiceAccess ? "badge-success" : "badge-muted"}">${p.practiceAccess ? "Granted" : "Not granted"}</span></div>
      <div class="flex-between" style="padding:8px 0;border-top:1px solid var(--border)">
        <span class="muted small">Premium</span>
        <span class="badge ${premActive ? "badge-prem" : "badge-muted"}">${premActive ? `${esc(p.premium.plan)} · ${daysLeft(p.premium.expiry)}d` : "Inactive"}</span></div>
      <div class="flex-between" style="padding:8px 0;border-top:1px solid var(--border)">
        <span class="muted small">Member Since</span>
        <span style="font-size:12px;font-weight:700">${fmtDate(p.createdAt)}</span></div>
    </div>
    ${state.isAdmin ? `<button class="btn btn-primary btn-block mt-2" data-go="admin">⚙ Open Admin Dashboard</button>` : ""}
    <button class="btn btn-ghost btn-block mt-1" data-go="bookmarks">🔖 My Bookmarks (${(p.bookmarks || []).length})</button>
    <button class="btn btn-ghost btn-block mt-1" data-go="leaderboard">🏆 Leaderboard</button>
    <button class="btn btn-ghost btn-block mt-1" data-go="premium">View Premium Plans</button>
    <button class="btn btn-danger btn-block mt-1" id="logoutBtn">Logout</button>
  </div>${bottomNavHTML("profile")}`;
}

function renderPremium() {
  const p = state.profile || {};
  const premActive = p.premium && daysLeft(p.premium.expiry) > 0;
  if (premActive) {
    return `${topbarHTML()}<div class="wrap" style="padding:16px 0 80px">
      <button class="btn btn-ghost btn-sm mb-2" data-go="home">← Back</button>
      <div class="premium-status">
        <h3>⭐ Premium Active</h3><p class="plan-name">${esc(p.premium.plan)}</p>
        <div class="grid-2 mt-2">
          <div style="background:rgba(255,255,255,.2);border-radius:10px;padding:10px">
            <div style="font-size:9px;opacity:.8;text-transform:uppercase;font-weight:800">Started</div>
            <div style="font-size:13px;font-weight:800;margin-top:2px">${fmtDate(p.premium.start)}</div></div>
          <div style="background:rgba(255,255,255,.2);border-radius:10px;padding:10px">
            <div style="font-size:9px;opacity:.8;text-transform:uppercase;font-weight:800">Expires</div>
            <div style="font-size:13px;font-weight:800;margin-top:2px">${fmtDate(p.premium.expiry)}</div></div>
        </div>
        <div style="margin-top:14px;background:rgba(255,255,255,.2);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:24px;font-weight:900">${daysLeft(p.premium.expiry)}</div>
          <div style="font-size:10px;opacity:.9;font-weight:700">days remaining</div>
        </div>
      </div>
      <div class="card mt-2"><h3 class="mb-2">Your Premium Benefits</h3>
        <ul style="list-style:none;padding:0">
          ${["Unlimited attempts","Answer explanations","Practice Mode","Bookmarks & Streak tracking","Leaderboard eligibility"]
            .map(b => `<li style="padding:8px 0;font-size:13px;display:flex;gap:8px;align-items:center"><span style="color:var(--green);font-weight:900">✓</span>${b}</li>`).join("")}
        </ul></div>
      <button class="btn btn-primary btn-block mt-3" data-go="sets">Start Practising</button>
    </div>${bottomNavHTML("premium")}`;
  }
  return `${topbarHTML()}<div class="wrap" style="padding:16px 0 80px">
    <button class="btn btn-ghost btn-sm mb-2" data-go="home">← Back</button>
    <div class="card-prem card-lg" style="border-radius:22px;margin-bottom:16px;padding:28px 22px">
      <div style="font-size:36px;margin-bottom:8px">⭐</div>
      <h2 style="color:#fff;font-size:24px;margin-bottom:6px">Unlock Premium</h2>
      <p style="font-size:13px;opacity:.95;max-width:340px">Get full access to all 6 mock tests, unlimited attempts, practice mode, and more.</p>
    </div>
    <h3 class="mb-2">Choose your plan</h3>
    ${state.plans.filter(pl => pl.active).map((pl, i) => `
      <div class="plan-card ${i === 1 ? "featured" : ""}">
        ${i === 1 ? '<span class="badge badge-prem mb-1">Most Popular</span>' : ""}
        <div class="flex-between">
          <h3>${esc(pl.name)}</h3>
          <div style="text-align:right">
            <div class="price">NPR ${pl.price.toLocaleString()}</div>
            <div class="muted small">${pl.days} days</div>
          </div>
        </div>
        <ul class="benefits">${(pl.benefits || []).map(b => `<li>${esc(b)}</li>`).join("")}</ul>
        <button class="btn btn-prem btn-block mt-2" data-plan="${pl.id}">Request ${esc(pl.name)}</button>
      </div>`).join("")}
    <div class="card mt-2" style="background:var(--bg)">
      <h3 class="mb-1" style="font-size:13px">How it works</h3>
      <p class="muted small" style="line-height:1.6">Premium is activated manually by the admin after payment is confirmed. Tap "Request" — admin will activate your access after payment verification.</p>
    </div>
  </div>${bottomNavHTML("premium")}`;
}

function renderPractice() {
  const p = state.profile || {};
  const premActive = p.premium && daysLeft(p.premium.expiry) > 0;
  const hasAccess = premActive || p.practiceAccess || state.isAdmin;
  if (!hasAccess) {
    return `${topbarHTML()}<div class="wrap" style="padding:16px 0 40px">
      <button class="btn btn-ghost btn-sm mb-2" data-go="home">← Back</button>
      <div class="card center">
        <div style="font-size:48px;margin-bottom:12px">⭐</div>
        <h2>Premium Feature</h2>
        <p class="muted mt-1 mb-3">Practice Mode is available for premium members only.</p>
        <button class="btn btn-prem btn-block" data-go="premium">View Plans</button>
      </div>
    </div>`;
  }
  return `${topbarHTML()}<div class="wrap" style="padding:16px 0 80px">
    <button class="btn btn-ghost btn-sm mb-2" data-go="home">← Back</button>
    <h2 class="mb-1">Quick Practice</h2>
    <p class="muted mb-3">Choose a section — 10 questions, no timer</p>
    ${SECTIONS.map(s => `
      <div class="practice-card" data-practice="${s.key}">
        <div class="ic">${s.icon}</div>
        <div style="flex:1"><h4>${esc(s.name)}</h4><p>10 questions · ${s.marks} marks each</p></div>
        <div style="color:var(--purple);font-size:20px">→</div>
      </div>`).join("")}
  </div>`;
}

function renderBookmarks() {
  const p = state.profile || {};
  const bms = p.bookmarks || [];
  if (!bms.length) {
    return `${topbarHTML()}<div class="wrap" style="padding:16px 0 40px">
      <button class="btn btn-ghost btn-sm mb-2" data-go="home">← Back</button>
      <h2 class="mb-2">My Bookmarks</h2>
      <div class="empty"><div class="big">🔖</div>No bookmarks yet.<br>Tap the bookmark icon on any question during practice.</div>
    </div>`;
  }
  return `${topbarHTML()}<div class="wrap" style="padding:16px 0 80px">
    <button class="btn btn-ghost btn-sm mb-2" data-go="home">← Back</button>
    <h2 class="mb-2">My Bookmarks (${bms.length})</h2>
    ${bms.map((bm, i) => {
      const set = state.sets[bm.set - 1]; if (!set) return "";
      const sec = set.sections.find(s => s.key === bm.section); if (!sec) return "";
      const q = sec.questions[bm.qi]; if (!q) return "";
      return `<div class="card mb-1">
        <div class="flex-between mb-1">
          <span class="badge badge-info">Set ${bm.set} · ${sec.short}</span>
          <button class="btn btn-sm btn-ghost" data-rm-bm="${i}">Remove</button>
        </div>
        <div style="font-size:13.5px;line-height:1.5;margin-bottom:8px">${esc(q.q)}</div>
        ${q.o.map((t, oi) => t ? `<div style="padding:7px 10px;font-size:12px;color:var(--muted);border-radius:6px;margin-top:4px;${oi === q.a ? "background:#d1fae5;color:#047857;font-weight:700" : ""}">
          ${"ABCD"[oi]}. ${esc(t)} ${oi === q.a ? "✓" : ""}</div>` : "").join("")}
      </div>`;
    }).join("")}
  </div>`;
}

function renderLeaderboard() {
  const lb = state.leaderboard || [];
  return `${topbarHTML()}<div class="wrap" style="padding:16px 0 80px">
    <button class="btn btn-ghost btn-sm mb-2" data-go="home">← Back</button>
    <h2 class="mb-1">🏆 Leaderboard</h2>
    <p class="muted mb-3">Top 20 students by best score</p>
    <div class="card">
      ${lb.length ? lb.map((u, i) => {
        const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        return `<div class="lb-row">
          <div class="lb-rank ${rankClass}">${i + 1}</div>
          <div class="lb-info"><b>${esc(u.name)}</b><span>🔥 ${u.streak}-day streak</span></div>
          <div class="lb-score">${u.bestScore}%</div>
        </div>`;
      }).join("") : `<div class="empty">No scores yet.</div>`}
    </div>
  </div>`;
}

/* ============ ADMIN ============ */
let adminTab = "overview";
function renderAdmin() {
  const tabs = [
    { id:"overview", label:"Overview" },{ id:"students", label:"Students" },
    { id:"requests", label:"Requests" },{ id:"questions", label:"Questions" },
    { id:"settings", label:"Settings" }
  ];
  const contentMap = {
    overview: adminOverviewHTML, students: adminStudentsHTML, requests: adminRequestsHTML,
    questions: adminQuestionsHTML, settings: adminSettingsHTML
  };
  return `${topbarHTML()}<div class="wrap" style="padding:16px 0 80px">
    <button class="btn btn-ghost btn-sm mb-2" data-go="profile">← Back</button>
    <h2 class="mb-2">⚙ Admin Dashboard</h2>
    <div class="admin-tabs">
      ${tabs.map(t => `<button class="admin-tab ${adminTab === t.id ? "on" : ""}" data-admin-tab="${t.id}">${t.label}</button>`).join("")}
    </div>
    <div id="adminContent">${contentMap[adminTab]()}</div>
  </div>`;
}
function adminOverviewHTML() {
  return `<div class="grid-2">
    <div class="stat-card"><div class="num" id="statTotal">…</div><div class="lbl">Total Students</div></div>
    <div class="stat-card"><div class="num" id="statActive">…</div><div class="lbl">Active</div></div>
    <div class="stat-card"><div class="num" id="statBlocked">…</div><div class="lbl">Blocked</div></div>
    <div class="stat-card"><div class="num" id="statPremium">…</div><div class="lbl">Premium</div></div>
    <div class="stat-card"><div class="num" id="statPending">…</div><div class="lbl">Pending Requests</div></div>
    <div class="stat-card"><div class="num" id="statQuestions">…</div><div class="lbl">Questions</div></div>
  </div>
  <div class="card mt-2"><h3 class="mb-1">Quick Actions</h3>
    <div class="grid-2">
      <button class="btn btn-primary btn-sm" data-admin-tab="students">Students</button>
      <button class="btn btn-teal btn-sm" data-admin-tab="questions">Questions</button>
      <button class="btn btn-ghost btn-sm" data-admin-tab="requests">Requests</button>
      <button class="btn btn-ghost btn-sm" id="refreshQBtn">↻ Refresh Q</button>
    </div>
  </div>`;
}
function adminStudentsHTML() {
  return `<div class="field"><input type="text" id="studentSearch" class="input" placeholder="Search by name or email…"></div>
    <div id="studentsList"><p class="muted center" style="padding:24px">Loading…</p></div>`;
}
function adminRequestsHTML() {
  return `<div id="requestsList"><p class="muted center" style="padding:24px">Loading…</p></div>`;
}
function adminQuestionsHTML() {
  return `<div class="flex-between mb-2">
    <h3>Questions</h3>
    <div class="flex" style="gap:6px">
      <button class="btn btn-ghost btn-sm" id="refreshQ2">↻</button>
      <button class="btn btn-primary btn-sm" id="addQBtn">+ Add</button>
    </div>
  </div>
  <div class="card" style="background:var(--bg);padding:12px;margin-bottom:12px">
    <p class="muted small" style="line-height:1.6">
      <b>📁 GitHub Media:</b> Put images in <code>photos/</code> and audio in <code>audio/</code> in your repo.<br>
      Base URL: <code>${REPO_BASE}</code>
    </p>
  </div>
  <div class="field"><input type="text" id="qSearch" class="input" placeholder="Search questions…"></div>
  <div id="questionsList"><p class="muted center" style="padding:24px">Loading…</p></div>`;
}
function adminSettingsHTML() {
  return `<div class="card">
    <h3 class="mb-2">System Info</h3>
    <div class="flex-between" style="padding:8px 0"><span class="muted small">Admin Email</span><span style="font-size:12px">${esc(ADMIN_EMAIL)}</span></div>
    <div class="flex-between" style="padding:8px 0;border-top:1px solid var(--border)"><span class="muted small">Questions Doc</span><span style="font-size:11px">${esc(QUESTIONS_DOC)}</span></div>
    <div class="flex-between" style="padding:8px 0;border-top:1px solid var(--border)"><span class="muted small">Total Q</span><span style="font-size:12px">${state.totalQ}</span></div>
  </div>
  <div class="card mt-2"><h3 class="mb-2">Export / Import</h3>
    <button class="btn btn-primary btn-block mb-2" id="exportBtn">📥 Download questions.json</button>
    <textarea id="importText" class="input" placeholder='{"questions": [...]}' style="min-height:100px"></textarea>
    <button class="btn btn-teal btn-block mt-2" id="importBtn">Import</button>
  </div>`;
}

/* ============ POST-RENDER ============ */
function postRender() {
  // Universal data-go / data-nav
  document.querySelectorAll("[data-go]").forEach(el => {
    el.onclick = () => navigate(el.dataset.go);
  });
  document.querySelectorAll("[data-nav]").forEach(el => {
    el.onclick = () => navigate(el.dataset.nav);
  });
  document.querySelectorAll("[data-admin-tab]").forEach(el => {
    el.onclick = () => { adminTab = el.dataset.adminTab; render(); };
  });
  document.querySelectorAll("[data-review]").forEach(el => {
    el.onclick = () => navigate("review", { filter: el.dataset.review });
  });

  // Auth screens
  if (state.screen === "login" && !state.user) {
    $("gLogin").onclick = signInGoogle;
    $("emailLogin").onclick = () => {
      const e = $("loginEmail").value.trim(), p = $("loginPass").value;
      if (!e || !p) return toast("Email and password required", "err");
      signInEmail(e, p);
    };
    $("signupLink").onclick = () => navigate("signup");
    $("forgotLink").onclick = () => {
      const email = $("loginEmail").value.trim();
      if (!email) return toast("Enter your email first", "err");
      resetPassword(email);
    };
  }
  if (state.screen === "signup") {
    $("backLogin").onclick = () => navigate("login");
    $("emailSignup").onclick = async () => {
      const name = $("signName").value.trim();
      const email = $("signEmail").value.trim();
      const p1 = $("signPass").value, p2 = $("signPass2").value;
      if (!email || !p1) return toast("All fields required", "err");
      if (p1 !== p2) return toast("Passwords don't match", "err");
      if (p1.length < 6) return toast("Password 6+ characters", "err");
      await signUpEmail(email, p1, name);
    };
  }

  // Home
  const reqBtn = $("reqAccessBtn");
  if (reqBtn) reqBtn.onclick = requestAccess;

  // Sets
  document.querySelectorAll("[data-set]").forEach(el => {
    el.onclick = () => navigate("start", { set: el.dataset.set });
  });

  // Start
  const agree = $("agree"), startBtn = $("startBtn");
  if (agree && startBtn) {
    agree.onchange = () => { startBtn.disabled = !agree.checked; };
    startBtn.onclick = () => {
      if (!agree.checked) return toast("Please agree to the rules", "err");
      beginExam(+state.params.set);
    };
  }
  const reqAcc2 = $("reqAcc2");
  if (reqAcc2) reqAcc2.onclick = requestAccess;

  // Exam
  if (state.screen === "exam" && state.exam) bindExamEvents();

  // Result
  const shareBtn = $("shareBtn");
  if (shareBtn) shareBtn.onclick = shareResult;
  const retryBtn = $("retryBtn");
  if (retryBtn) retryBtn.onclick = () => {
    const r = loadResult();
    if (r) navigate("start", { set: r.setIdx - 1 });
  };
  if (state.screen === "result") {
    setTimeout(() => {
      const r = loadResult();
      const ring = $("resultRing");
      if (ring && r) ring.style.strokeDashoffset = 427.3 * (1 - r.percentage / 100);
    }, 100);
  }

  // Profile
  const logoutBtn = $("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = logout;

  // Premium
  document.querySelectorAll("[data-plan]").forEach(el => {
    el.onclick = () => requestPremium(el.dataset.plan);
  });

  // Practice
  document.querySelectorAll("[data-practice]").forEach(el => {
    el.onclick = () => startPractice(el.dataset.practice);
  });

  // Bookmarks
  document.querySelectorAll("[data-rm-bm]").forEach(el => {
    el.onclick = async () => {
      const bms = [...(state.profile.bookmarks || [])];
      bms.splice(+el.dataset.rmBm, 1);
      try {
        await updateDoc(doc(db, "users", state.user.uid), { bookmarks: bms });
        state.profile.bookmarks = bms;
        render();
        toast("Removed", "ok");
      } catch (e) { toast("Failed: " + e.message, "err"); }
    };
  });

  // Admin bindings
  if (state.screen === "admin" && state.isAdmin) bindAdminTab();
}

/* ============ EXAM ENGINE ============ */
async function beginExam(setIdx) {
  const set = state.sets[setIdx];
  if (!set) return navigate("sets");
  const sections = set.sections.map(s => ({
    ...s,
    questions: s.questions.map(q => ({ ...q, sel: undefined, locked: false, played: 0 }))
  }));
  state.exam = {
    set, setIdx, sections, si: 0, qi: 0,
    left: EXAM_MIN * 60, paused: false,
    answeredCount: 0, maxReachable: 0,
    startedAt: Date.now()
  };
  saveExamState(state.exam);
  startTimer();
  bumpStreak();
  navigate("exam");
}

function resumeExamFromSaved(saved) {
  const set = state.sets[saved.setIdx];
  if (!set) { clearExamState(); navigate("sets"); return; }
  const sections = set.sections.map((s, si) => ({
    ...s,
    questions: s.questions.map((q, qi) => ({
      ...q,
      sel: saved.answers?.[si]?.[qi] ?? undefined,
      locked: false,
      played: saved.played?.[si]?.[qi] || 0
    }))
  }));
  state.exam = {
    set, setIdx: saved.setIdx, sections,
    si: saved.si || 0, qi: saved.qi || 0,
    left: Math.max(0, saved.left || EXAM_MIN * 60),
    paused: false,
    answeredCount: sections[saved.si || 0].questions.filter(x => x.sel !== undefined).length,
    maxReachable: saved.maxReachable || 0,
    startedAt: saved.startedAt || Date.now()
  };
  startTimer();
  render();
}

function startTimer() {
  if (state._tick) clearInterval(state._tick);
  state._tickStart = Date.now();
  state._tickLeftAtStart = state.exam.left;
  state._tick = setInterval(tick, 500);
}
function tick() {
  const ex = state.exam;
  if (!ex) { clearInterval(state._tick); return; }
  if (ex.paused) {
    state._tickStart = Date.now();
    state._tickLeftAtStart = ex.left;
    return;
  }
  const elapsed = Math.floor((Date.now() - state._tickStart) / 1000);
  ex.left = Math.max(0, state._tickLeftAtStart - elapsed);
  const el = $("timerDisplay");
  if (el) {
    el.innerHTML = `⏱ <span>${pad(Math.floor(ex.left / 60))}:${pad(ex.left % 60)}</span>`;
    el.classList.toggle("low", ex.left <= 600);
  }
  if (ex.left <= 0) {
    clearInterval(state._tick);
    modal("Time is up!", "Submitting automatically…",
      [{ label: "View Results", cls: "btn-primary", onClick: finishExam }]);
  }
}

function bindExamEvents() {
  const ex = state.exam;
  const sec = ex.sections[ex.si];
  const q = sec.questions[ex.qi];

  document.querySelectorAll("[data-opt]").forEach(el => {
    el.onclick = () => selectOpt(+el.dataset.opt);
  });
  document.querySelectorAll("[data-jump]").forEach(el => {
    el.onclick = () => { if (!el.disabled) jumpTo(+el.dataset.jump); };
  });
  $("prevBtn").onclick = prevQ;
  $("nextBtn").onclick = nextQ;
  $("leaveBtn").onclick = askLeaveExam;
  const pb = $("playBtn");
  if (pb) pb.onclick = () => playAudio(q);
  const rb = $("replayBtn");
  if (rb) rb.onclick = () => playAudio(q);
}

function selectOpt(i) {
  const ex = state.exam;
  if (!ex) return;
  const sec = ex.sections[ex.si];
  const q = sec.questions[ex.qi];
  if (q.locked) return;
  q.sel = i;
  ex.answeredCount = sec.questions.filter(x => x.sel !== undefined).length;
  document.querySelectorAll(".opt").forEach((el, idx) => el.classList.toggle("sel", idx === i));
  const nextBtn = $("nextBtn"); if (nextBtn) nextBtn.disabled = false;
  const palette = document.querySelectorAll(".pal-btn");
  if (palette[ex.qi]) palette[ex.qi].classList.add("ans");
  const pbar = $("progressFill");
  if (pbar) pbar.style.width = (ex.answeredCount / sec.questions.length * 100) + "%";
  saveExamState(ex);
}

function jumpTo(i) {
  const ex = state.exam;
  if (!ex || i > ex.maxReachable) return;
  stopAudio();
  ex.qi = i;
  saveExamState(ex);
  render();
}
function prevQ() {
  const ex = state.exam;
  if (!ex) return;
  if (ex.qi > 0) { stopAudio(); ex.qi--; saveExamState(ex); render(); }
}
function nextQ() {
  const ex = state.exam;
  if (!ex) return;
  const sec = ex.sections[ex.si];
  const q = sec.questions[ex.qi];
  if (q.sel === undefined) return;
  if (ex.qi < sec.questions.length - 1) {
    stopAudio();
    ex.qi++;
    if (ex.qi > ex.maxReachable) ex.maxReachable = ex.qi;
    saveExamState(ex);
    render();
  } else {
    finishSection();
  }
}
function finishSection() {
  const ex = state.exam;
  const sec = ex.sections[ex.si];
  const unanswered = sec.questions.filter(x => x.sel === undefined).length;
  const isLast = ex.si === ex.sections.length - 1;
  modal(isLast ? "Submit your exam?" : "Complete this section?",
    (unanswered ? `${unanswered} unanswered. ` : "") +
    (isLast ? "You cannot change answers after submitting." : "You cannot return to this section."),
    [
      { label: "Cancel", cls: "btn-ghost" },
      { label: isLast ? "Submit" : "Continue", cls: "btn-primary", onClick: () => {
        sec.questions.forEach(q => q.locked = true);
        if (isLast) finishExam();
        else {
          ex.si++; ex.qi = 0; ex.maxReachable = 0;
          saveExamState(ex);
          render();
        }
      }}
    ]);
}

function askLeaveExam() {
  if (!state.exam) return;
  state.exam.paused = true;
  stopAudio();
  modal("Leave the exam?", "Progress will be lost and timer stops.",
    [
      { label: "Stay", cls: "btn-ghost", onClick: () => { if (state.exam) state.exam.paused = false; } },
      { label: "Leave", cls: "btn-danger", onClick: () => {
        if (state._tick) clearInterval(state._tick);
        state.exam = null;
        clearExamState();
        navigate("sets");
      }}
    ]);
}

async function finishExam() {
  if (state._tick) clearInterval(state._tick);
  stopAudio();
  const ex = state.exam;
  if (!ex) return;
  const used = EXAM_MIN * 60 - ex.left;

  let score = 0, correct = 0, unanswered = 0;
  const sections = ex.sections.map(s => {
    const items = s.questions.map((q, idx) => ({
      idx, q: q.q, p: q.p, img: q.img, au: q.au, o: q.o,
      correctAns: q.a, yourAns: q.sel
    }));
    let c = 0, u = 0;
    s.questions.forEach(q => {
      if (q.sel === undefined) u++;
      else if (q.sel === q.a) c++;
    });
    const sc = c * s.marks;
    score += sc; correct += c; unanswered += u;
    return { name: s.name, short: s.short, marks: s.marks, score: sc, max: s.questions.length * s.marks, items };
  });

  const wrong = state.totalQ - correct - unanswered;
  const percentage = Math.round(score / state.fullMarks * 100);
  const result = {
    setIdx: ex.set.idx, setName: ex.set.name,
    score, maxScore: state.fullMarks, percentage,
    correct, wrong, unanswered, sections, timeUsed: used,
    startedAt: new Date(ex.startedAt).toISOString(),
    submittedAt: new Date().toISOString()
  };

  try {
    const attemptId = `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(db, "users", state.user.uid, "results", attemptId), {
      ...result, submittedAt: serverTimestamp()
    });
    if (percentage > (state.profile?.bestScore || 0)) {
      await updateDoc(doc(db, "users", state.user.uid), { bestScore: percentage });
    }
    state.results.unshift({ ...result, id: attemptId });
  } catch (e) {
    console.error("Save result", e);
    toast("Result saved locally only.", "err");
  }

  saveResult(result);
  clearExamState();
  state.exam = null;
  navigate("result");
}

function stopAudio() {
  if (state._audio) { try { state._audio.pause(); } catch {} state._audio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
function playAudio(q) {
  if (!q) return;
  if ((q.played || 0) >= MAX_PLAYS) {
    modal("Audio limit reached", `Audio can only be played ${MAX_PLAYS} times per question.`);
    return;
  }
  stopAudio();
  q.played = (q.played || 0) + 1;
  const row = $("audRow");
  if (row) {
    row.classList.add("on");
    const span = row.querySelector("span");
    if (span) span.textContent = `${Math.max(0, MAX_PLAYS - q.played)} left`;
  }
  const src = q.au;
  const done = () => { if (row) row.classList.remove("on"); };
  if (!src) { done(); return; }
  if (src.startsWith("tts:")) {
    if (!("speechSynthesis" in window)) { done(); return; }
    const u = new SpeechSynthesisUtterance(src.slice(4));
    u.lang = "ja-JP"; u.rate = 0.85;
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
  } else {
    state._audio = new Audio(resolveUrl(src));
    state._audio.onended = state._audio.onerror = done;
    state._audio.play().catch(done);
  }
}

/* ============ PRACTICE ============ */
function startPractice(sectionKey) {
  const pool = [];
  state.sets.forEach(s => {
    const sec = s.sections.find(x => x.key === sectionKey);
    if (sec) sec.questions.forEach(q => pool.push({ ...q, sel: undefined, locked: false, played: 0 }));
  });
  if (pool.length < 5) return toast("Not enough questions in this section", "err");
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, Math.min(10, pool.length));
  const meta = SECTIONS.find(s => s.key === sectionKey);
  state.practice = {
    sections: [{ key: meta.key, name: meta.name, short: meta.short, marks: meta.marks,
      questions: picked, count: picked.length, icon: meta.icon }],
    si: 0, qi: 0, answeredCount: 0, maxReachable: 0
  };
  renderPracticeScreen();
}
function renderPracticeScreen() {
  const root = $("app");
  const pr = state.practice;
  if (!pr) return renderPractice();
  const sec = pr.sections[0];
  const q = sec.questions[pr.qi];
  let mediaHTML = "";
  if (q.img) mediaHTML += `<img src="${esc(q.img)}" loading="lazy" onerror="this.style.display='none'">`;
  if (q.au) mediaHTML += `<div class="audio-row" id="audRow">
    <button class="play-btn" id="playBtn">▶</button>
    <div class="wave">${'<i></i>'.repeat(18)}</div>
    <span>unlimited</span></div>`;
  if (mediaHTML) mediaHTML = `<div class="media">${mediaHTML}</div>`;
  const optsHTML = q.o.slice(0, q.o[3] ? 4 : 3).map((t, i) => `
    <div class="opt ${q.sel === i ? "sel" : ""}" data-popt="${i}">
      <div class="opt-ltr">${"ABCD"[i]}</div>
      <div class="opt-tx">${esc(t)}</div>
    </div>`).join("");
  const isLast = pr.qi === sec.questions.length - 1;
  root.innerHTML = `
    <div class="exam-bar"><div class="exam-bar-inner">
      <button class="xback" id="leaveBtn">✕</button>
      <div class="exam-info">
        <b>Practice · ${esc(sec.name)}</b>
        <span>Q ${pr.qi + 1} of ${sec.questions.length}</span>
      </div>
    </div></div>
    <div class="wrap" style="padding-bottom:40px">
      <div class="progress-bar"><i id="progressFill" style="width:${(pr.answeredCount / sec.questions.length) * 100}%"></i></div>
      <div class="palette">${sec.questions.map((qq, i) =>
        `<button class="pal-btn ${qq.sel !== undefined ? "ans" : ""} ${i === pr.qi ? "cur" : ""}"
          ${i > pr.maxReachable ? "disabled" : ""} data-pjump="${i}">${i + 1}</button>`).join("")}</div>
      <div class="q-card">
        <div class="q-meta">
          <span class="q-num">Q ${pr.qi + 1} of ${sec.questions.length}</span>
          <span class="q-tag">${sec.short}</span>
          <span class="q-marks">${sec.marks} marks</span>
        </div>
        ${q.p ? `<div class="passage">${esc(q.p)}</div>` : ""}
        <div class="q-text">${esc(q.q)}</div>
        ${mediaHTML}
        <div class="opts">${optsHTML}</div>
      </div>
      <div class="exam-nav">
        <button class="btn btn-ghost" id="prevBtn" ${pr.qi === 0 ? "disabled" : ""}>← Previous</button>
        <button class="btn btn-primary" id="nextBtn" ${q.sel === undefined ? "disabled" : ""}>${isLast ? "Finish ✓" : "Next →"}</button>
      </div>
    </div>`;
  document.querySelectorAll("[data-popt]").forEach(el => el.onclick = () => practiceSelect(+el.dataset.popt));
  document.querySelectorAll("[data-pjump]").forEach(el => el.onclick = () => {
    if (!el.disabled) { stopAudio(); pr.qi = +el.dataset.pjump; renderPracticeScreen(); }
  });
  $("prevBtn").onclick = () => { if (pr.qi > 0) { stopAudio(); pr.qi--; renderPracticeScreen(); } };
  $("nextBtn").onclick = () => {
    if (q.sel === undefined) return;
    if (pr.qi < sec.questions.length - 1) {
      stopAudio(); pr.qi++;
      if (pr.qi > pr.maxReachable) pr.maxReachable = pr.qi;
      renderPracticeScreen();
    } else finishPractice();
  };
  $("leaveBtn").onclick = () => {
    modal("Leave practice?", "Your progress will not be saved.",
      [{ label:"Stay", cls:"btn-ghost" },
       { label:"Leave", cls:"btn-danger", onClick: () => { state.practice = null; navigate("practice"); } }]);
  };
  if ($("playBtn")) $("playBtn").onclick = () => playAudio(q);
}
function practiceSelect(i) {
  const pr = state.practice;
  if (!pr) return;
  const sec = pr.sections[0];
  sec.questions[pr.qi].sel = i;
  pr.answeredCount = sec.questions.filter(x => x.sel !== undefined).length;
  document.querySelectorAll(".opt").forEach((el, idx) => el.classList.toggle("sel", idx === i));
  const nb = $("nextBtn"); if (nb) nb.disabled = false;
  const palette = document.querySelectorAll(".pal-btn");
  if (palette[pr.qi]) palette[pr.qi].classList.add("ans");
  const pb = $("progressFill");
  if (pb) pb.style.width = (pr.answeredCount / sec.questions.length * 100) + "%";
}
function finishPractice() {
  const sec = state.practice.sections[0];
  let correct = 0;
  sec.questions.forEach(q => { if (q.sel === q.a) correct++; });
  const total = sec.questions.length;
  modal("Practice Complete", `<div class="center">
    <div style="font-size:48px;margin-bottom:8px">${correct/total >= 0.7 ? "🎉" : "💪"}</div>
    <h3 style="font-size:32px;color:var(--purple);margin-bottom:4px">${correct}/${total}</h3>
    <p class="muted">${Math.round(correct/total*100)}% correct</p>
  </div>`, [{ label: "Done", cls: "btn-primary", onClick: () => {
    state.practice = null;
    navigate("home");
  }}]);
}

/* ============ SHARE ============ */
async function shareResult() {
  const r = loadResult();
  if (!r) return;
  const pass = r.score >= state.passMarks;
  const text = `🎌 I scored ${r.score}/${r.maxScore} (${r.percentage}%) on Dream Japan JFT Mock Test!\nSet ${r.setIdx} · ${r.setName}\n${pass ? "✅ PASSED" : "📚 Practicing hard"}\n#JFT #DreamJapan`;
  if (navigator.share) {
    try { await navigator.share({ title: "Dream Japan JFT Result", text }); return; } catch {}
  }
  try { await navigator.clipboard.writeText(text); toast("Copied to clipboard ✓", "ok"); }
  catch { modal("Share Result", `<p style="white-space:pre-line;font-size:13px">${esc(text)}</p>`); }
}

/* ============ ADMIN BINDINGS ============ */
function bindAdminTab() {
  if (adminTab === "overview") {
    loadStats();
    const rb = $("refreshQBtn");
    if (rb) rb.onclick = refreshQuestions;
  }
  if (adminTab === "students") {
    $("studentSearch").oninput = filterStudents;
    loadStudents();
  }
  if (adminTab === "requests") loadRequests();
  if (adminTab === "questions") {
    $("qSearch").oninput = filterQuestions;
    $("addQBtn").onclick = () => openQEditor(-1);
    $("refreshQ2").onclick = refreshQuestions;
    loadQs();
  }
  if (adminTab === "settings") {
    $("exportBtn").onclick = exportJSON;
    $("importBtn").onclick = importJSON;
  }
}
async function loadStats() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    let total = 0, active = 0, blocked = 0, premiumActive = 0;
    usersSnap.forEach(d => {
      const u = d.data();
      total++;
      if (u.status === "blocked") blocked++; else active++;
      if (u.premium && u.premium.expiry && daysLeft(u.premium.expiry) > 0) premiumActive++;
    });
    const reqSnap = await getDocs(query(collection(db, "accessRequests"), where("status", "==", "pending")));
    if ($("statTotal")) $("statTotal").textContent = total;
    if ($("statActive")) $("statActive").textContent = active;
    if ($("statBlocked")) $("statBlocked").textContent = blocked;
    if ($("statPremium")) $("statPremium").textContent = premiumActive;
    if ($("statPending")) $("statPending").textContent = reqSnap.size;
    if ($("statQuestions")) $("statQuestions").textContent = state.totalQ;
  } catch {}
}
async function loadStudents() {
  const list = $("studentsList");
  if (!list) return;
  try {
    const snap = await getDocs(collection(db, "users"));
    const users = [];
    snap.forEach(d => {
      if (state.user && d.id === state.user.uid) return;
      users.push({ uid: d.id, ...d.data() });
    });
    state._allStudents = users;
    renderStudentRows(users);
  } catch (e) {
    list.innerHTML = `<p class="muted" style="color:var(--red)">Error: ${esc(e.message)}</p>`;
  }
}
function renderStudentRows(users) {
  const list = $("studentsList");
  if (!list) return;
  if (!users.length) { list.innerHTML = `<p class="muted center" style="padding:24px">No students found.</p>`; return; }
  list.innerHTML = users.map(u => {
    const premActive = u.premium && daysLeft(u.premium.expiry) > 0;
    return `<div class="admin-q-item">
      <div class="flex-between mb-1">
        <div><h4>${esc(u.name || "Unnamed")}</h4><p class="muted small">${esc(u.email)}</p></div>
        <div class="badges">
          ${u.status === "blocked" ? '<span class="badge badge-danger">Blocked</span>' : '<span class="badge badge-success">Active</span>'}
          ${premActive ? '<span class="badge badge-prem">Premium</span>' : ""}
          ${u.practiceAccess ? '<span class="badge badge-info">Practice</span>' : ""}
        </div>
      </div>
      <div class="actions">
        <button data-uact="grant-prem" data-uid="${u.uid}">Grant Premium</button>
        <button data-uact="toggle-practice" data-uid="${u.uid}" data-val="${!u.practiceAccess}">${u.practiceAccess ? "Revoke" : "Grant"} Practice</button>
        <button class="${u.status === "blocked" ? "preview" : "del"}" data-uact="toggle-block" data-uid="${u.uid}" data-status="${u.status}">${u.status === "blocked" ? "Unblock" : "Block"}</button>
      </div>
    </div>`;
  }).join("");
  list.querySelectorAll("[data-uact]").forEach(b => {
    b.onclick = () => {
      if (b.dataset.uact === "grant-prem") grantPremium(b.dataset.uid);
      else if (b.dataset.uact === "toggle-practice") togglePractice(b.dataset.uid, b.dataset.val === "true");
      else if (b.dataset.uact === "toggle-block") toggleBlock(b.dataset.uid, b.dataset.status);
    };
  });
}
function filterStudents() {
  const q = ($("studentSearch").value || "").toLowerCase();
  const all = state._allStudents || [];
  renderStudentRows(all.filter(u => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)));
}
async function loadRequests() {
  const list = $("requestsList");
  if (!list) return;
  try {
    const snap = await getDocs(query(collection(db, "accessRequests"), orderBy("createdAt", "desc"), limit(50)));
    const reqs = [];
    snap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
    if (!reqs.length) { list.innerHTML = `<p class="muted center" style="padding:24px">No requests yet.</p>`; return; }
    list.innerHTML = reqs.map(r => `
      <div class="admin-q-item">
        <div class="flex-between mb-1">
          <div><h4>${esc(r.name || r.email || r.uid)}</h4>
            <p class="muted small">${esc(r.type)}${r.planName ? " · " + esc(r.planName) : ""} · ${fmtDate(r.createdAt)}</p></div>
          <span class="badge badge-${r.status === "pending" ? "warn" : r.status === "approved" ? "success" : "danger"}">${esc(r.status)}</span>
        </div>
        ${r.status === "pending" ? `<div class="actions">
          <button class="preview" data-ract="approve" data-rid="${r.id}" data-uid="${r.uid}" data-type="${esc(r.type)}" data-plan="${esc(r.planId||"")}">Approve</button>
          <button class="del" data-ract="reject" data-rid="${r.id}">Reject</button>
        </div>` : ""}
      </div>`).join("");
    list.querySelectorAll("[data-ract]").forEach(b => {
      b.onclick = () => {
        if (b.dataset.ract === "approve") approveRequest(b.dataset.rid, b.dataset.uid, b.dataset.type, b.dataset.plan);
        else rejectRequest(b.dataset.rid);
      };
    });
  } catch (e) { list.innerHTML = `<p class="muted" style="color:var(--red)">${esc(e.message)}</p>`; }
}
async function loadQs() {
  const list = $("questionsList");
  if (!list) return;
  try {
    const rows = await fetchQuestionsFromFirestore();
    state._allQs = rows;
    renderQRows(rows);
  } catch (e) { list.innerHTML = `<p class="muted" style="color:var(--red)">${esc(e.message)}</p>`; }
}
function filterQuestions() {
  const q = ($("qSearch").value || "").toLowerCase();
  const rows = (state._allQs || []).filter(r =>
    (r.question || "").toLowerCase().includes(q) || (r.passage || "").toLowerCase().includes(q));
  renderQRows(rows);
}
function renderQRows(rows) {
  const list = $("questionsList");
  if (!list) return;
  if (!rows.length) { list.innerHTML = `<p class="muted center" style="padding:24px">No questions.</p>`; return; }
  list.innerHTML = rows.map((r, i) => `
    <div class="admin-q-item">
      <div class="badges">
        <span class="badge badge-info">Set ${r.set}</span>
        <span class="badge badge-muted">${esc((SECTIONS.find(s => s.key === r.section) || {}).short || r.section)}</span>
        <span class="badge badge-muted">Ans: ${esc(r.answer)}</span>
        ${r.image ? '<span class="badge badge-muted">🖼</span>' : ""}
        ${r.audio ? '<span class="badge badge-muted">🔊</span>' : ""}
      </div>
      <div class="qtxt">${esc((r.question || "").slice(0, 200))}</div>
      <div class="actions">
        <button class="preview" data-qact="preview" data-i="${i}">Preview</button>
        <button class="edit" data-qact="edit" data-i="${i}">Edit</button>
        <button class="del" data-qact="del" data-i="${i}">Delete</button>
      </div>
    </div>`).join("");
  list.querySelectorAll("[data-qact]").forEach(b => {
    b.onclick = () => {
      const row = rows[+b.dataset.i];
      if (b.dataset.qact === "preview") previewQ(row);
      else if (b.dataset.qact === "edit") openQEditor(+b.dataset.i);
      else if (b.dataset.qact === "del") deleteQ(row);
    };
  });
}
function openQEditor(idx) {
  const isEdit = idx >= 0;
  const row = isEdit ? (state._allQs || [])[idx] : null;
  const r = row || { set:1, section:"sv", question:"", passage:"", image:"", audio:"", answer:"A", A:"", B:"", C:"", D:"" };
  modal(isEdit ? "Edit Question" : "Add Question", `
    <div class="grid-2">
      <div class="field"><label>Set</label>
        <select id="qeSet" class="input">${SET_NAMES.map((s, i) =>
          `<option value="${i + 1}" ${r.set === i + 1 ? "selected" : ""}>${s.name}</option>`).join("")}</select></div>
      <div class="field"><label>Section</label>
        <select id="qeSec" class="input">${SECTIONS.map(s =>
          `<option value="${s.key}" ${r.section === s.key ? "selected" : ""}>${s.name}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>Question</label><textarea id="qeQ" class="input">${esc(r.question)}</textarea></div>
    <div class="field"><label>Passage (optional)</label><textarea id="qeP" class="input">${esc(r.passage || "")}</textarea></div>
    <div class="field"><label>Image</label><input type="text" id="qeImg" class="input" value="${esc(r.image || "")}" placeholder="photos/q1.jpg"></div>
    <div class="field"><label>Audio</label><input type="text" id="qeAu" class="input" value="${esc(r.audio || "")}" placeholder="audio/q1.mp3"></div>
    <div class="field"><label>Correct</label>
      <select id="qeAns" class="input">${"ABCD".split("").map(l =>
        `<option value="${l}" ${r.answer === l ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="grid-2">
      <div class="field"><label>A</label><input type="text" id="qeA" class="input" value="${esc(r.A)}"></div>
      <div class="field"><label>B</label><input type="text" id="qeB" class="input" value="${esc(r.B)}"></div>
      <div class="field"><label>C</label><input type="text" id="qeC" class="input" value="${esc(r.C)}"></div>
      <div class="field"><label>D (optional)</label><input type="text" id="qeD" class="input" value="${esc(r.D)}"></div>
    </div>`,
    [
      { label: "Cancel", cls: "btn-ghost" },
      { label: isEdit ? "Update" : "Add", cls: "btn-primary", onClick: () => saveQ(idx, isEdit, row) }
    ]);
}
async function saveQ(idx, isEdit, origRow) {
  const newRow = {
    set: +$("qeSet").value, section: $("qeSec").value,
    question: $("qeQ").value.trim(), passage: $("qeP").value.trim(),
    image: $("qeImg").value.trim(), audio: $("qeAu").value.trim(),
    answer: $("qeAns").value,
    A: $("qeA").value.trim(), B: $("qeB").value.trim(),
    C: $("qeC").value.trim(), D: $("qeD").value.trim()
  };
  if (!newRow.question || !newRow.A || !newRow.B || !newRow.C) return toast("Question, A, B, C required", "err");
  if (newRow.answer === "D" && !newRow.D) return toast("Answer D but option D empty", "err");
  try {
    const rows = await fetchQuestionsFromFirestore();
    const list = [...rows];
    if (isEdit && origRow) {
      const gi = list.findIndex(r => r.set === origRow.set && r.section === origRow.section &&
        r.question === origRow.question && r.A === origRow.A);
      if (gi >= 0) list[gi] = newRow; else list.push(newRow);
    } else list.push(newRow);
    await setDoc(doc(db, QUESTIONS_DOC), { questions: list });
    clearQCache(); setCache(list);
    state.sets = buildSets(list); recomputeTotals();
    toast(isEdit ? "Updated ✓" : "Added ✓", "ok");
    loadQs();
  } catch (e) { toast("Failed: " + e.message, "err"); }
}
function previewQ(row) {
  if (!row) return;
  modal("Preview", `
    <div class="flex mb-1" style="gap:6px;flex-wrap:wrap">
      <span class="badge badge-info">Set ${row.set}</span>
      <span class="badge badge-muted">${esc((SECTIONS.find(s => s.key === row.section) || {}).name || row.section)}</span>
      <span class="badge badge-muted">Ans ${esc(row.answer)}</span>
    </div>
    ${row.passage ? `<div class="passage" style="margin-top:12px">${esc(row.passage)}</div>` : ""}
    <div style="font-size:15px;font-weight:700;line-height:1.5;margin:12px 0;white-space:pre-line">${esc(row.question)}</div>
    ${row.image ? `<div class="muted small mb-1">🖼 ${esc(row.image)}</div>` : ""}
    ${row.audio ? `<div class="muted small mb-2">🔊 ${esc(row.audio)}</div>` : ""}
    ${["A","B","C","D"].map(l => {
      const t = row[l]; if (!t) return "";
      const isC = l === row.answer;
      return `<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-top:6px;font-size:13px;${isC ? "background:#d1fae5;border-color:var(--green);font-weight:700" : ""}">
        <b>${l}.</b> ${esc(t)} ${isC ? "✓" : ""}</div>`;
    }).join("")}
  `);
}
async function deleteQ(row) {
  if (!row) return;
  modal("Delete this question?", `"${esc((row.question || "").slice(0, 60))}…" will be removed.`,
    [{ label: "Cancel", cls: "btn-ghost" },
     { label: "Delete", cls: "btn-danger", onClick: async () => {
       try {
         const rows = await fetchQuestionsFromFirestore();
         const filtered = rows.filter(r => !(r.set === row.set && r.section === row.section &&
           r.question === row.question && r.A === row.A));
         await setDoc(doc(db, QUESTIONS_DOC), { questions: filtered });
         clearQCache(); setCache(filtered);
         state.sets = buildSets(filtered); recomputeTotals();
         toast("Deleted ✓", "ok");
         loadQs();
       } catch (e) { toast("Failed: " + e.message, "err"); }
     }}]);
}
async function refreshQuestions() {
  toast("Refreshing…");
  try {
    clearQCache();
    const rows = await fetchQuestionsFromFirestore();
    setCache(rows);
    state.sets = buildSets(rows); recomputeTotals();
    if ($("questionsList")) loadQs();
    toast("Refreshed ✓", "ok");
  } catch (e) { toast("Failed: " + e.message, "err"); }
}
async function exportJSON() {
  try {
    const rows = await fetchQuestionsFromFirestore();
    const blob = new Blob([JSON.stringify({ questions: rows }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "questions.json"; a.click();
    URL.revokeObjectURL(url);
    toast("Downloaded", "ok");
  } catch (e) { toast("Failed: " + e.message, "err"); }
}
async function importJSON() {
  const text = ($("importText").value || "").trim();
  if (!text) return toast("Paste JSON first", "err");
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return toast("Invalid JSON: " + e.message, "err"); }
  const rows = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(rows)) return toast("JSON must contain questions array", "err");
  if (!confirm(`Replace all questions with ${rows.length}? Cannot be undone.`)) return;
  try {
    await setDoc(doc(db, QUESTIONS_DOC), { questions: rows });
    clearQCache(); setCache(rows);
    state.sets = buildSets(rows); recomputeTotals();
    toast(`Imported ${rows.length} ✓`, "ok");
  } catch (e) { toast("Failed: " + e.message, "err"); }
}
async function grantPremium(uid) {
  const plans = state.plans.length ? state.plans : await loadPlans();
  const planOptions = plans.map(p => `<option value="${p.id}">${esc(p.name)} — NPR ${p.price} (${p.days}d)</option>`).join("");
  modal("Grant Premium", `
    <div class="field"><label>Plan</label><select id="grantPlan" class="input">${planOptions}</select></div>
    <div class="field"><label>Note</label><input type="text" id="grantNote" class="input"></div>`,
    [{ label: "Cancel", cls: "btn-ghost" },
     { label: "Grant", cls: "btn-primary", onClick: async () => {
       const plan = plans.find(p => p.id === $("grantPlan").value);
       if (!plan) return;
       const start = new Date();
       const expiry = new Date(Date.now() + plan.days * 86400000);
       try {
         await updateDoc(doc(db, "users", uid), {
           premium: { plan: plan.name, start, expiry, note: ($("grantNote") || {}).value || "" }
         });
         toast("Premium granted ✓", "ok"); loadStudents();
       } catch (e) { toast("Failed: " + e.message, "err"); }
     }}]);
}
async function togglePractice(uid, value) {
  try {
    await updateDoc(doc(db, "users", uid), { practiceAccess: value });
    toast(`Practice ${value ? "granted" : "revoked"} ✓`, "ok");
    loadStudents();
  } catch (e) { toast("Failed: " + e.message, "err"); }
}
async function toggleBlock(uid, currentStatus) {
  const newStatus = currentStatus === "blocked" ? "active" : "blocked";
  modal(`${newStatus === "blocked" ? "Block" : "Unblock"} user?`, `Status will change to "${newStatus}".`,
    [{ label: "Cancel", cls: "btn-ghost" },
     { label: "Confirm", cls: newStatus === "blocked" ? "btn-danger" : "btn-primary", onClick: async () => {
       try {
         await updateDoc(doc(db, "users", uid), { status: newStatus });
         toast(`User ${newStatus}`, "ok"); loadStudents();
       } catch (e) { toast("Failed: " + e.message, "err"); }
     }}]);
}
async function approveRequest(rid, uid, type, planId) {
  try {
    await updateDoc(doc(db, "accessRequests", rid), { status: "approved" });
    if (type === "practice") {
      await updateDoc(doc(db, "users", uid), { practiceAccess: true });
    } else if (type === "premium" && planId) {
      const plans = state.plans.length ? state.plans : await loadPlans();
      const plan = plans.find(p => p.id === planId);
      if (plan) {
        const start = new Date();
        const expiry = new Date(Date.now() + plan.days * 86400000);
        await updateDoc(doc(db, "users", uid), {
          premium: { plan: plan.name, start, expiry, note: "Approved" }
        });
      }
    }
    toast("Approved ✓", "ok"); loadRequests();
  } catch (e) { toast("Failed: " + e.message, "err"); }
}
async function rejectRequest(rid) {
  try {
    await updateDoc(doc(db, "accessRequests", rid), { status: "rejected" });
    toast("Rejected", "ok"); loadRequests();
  } catch (e) { toast("Failed: " + e.message, "err"); }
}

/* ============ AUTH LISTENER & BOOT ============ */
onAuthStateChanged(auth, async (user) => {
  if (state._userSub) { state._userSub(); state._userSub = null; }

  if (!user) {
    state.user = null; state.profile = null; state.isAdmin = false;
    state.sets = []; state.results = []; state.plans = [];
    const { screen, params } = parseHash();
    if (screen === "login" || screen === "signup") {
      state.screen = screen; state.params = params; render();
    } else {
      navigate("login", screen && screen !== "loading" ? { next: screen } : {});
    }
    return;
  }

  state.user = user;
  try {
    state.profile = await ensureUserProfile(user);
    state.isAdmin = user.email === ADMIN_EMAIL || state.profile.role === "admin";
    if (state.profile.status === "blocked") {
      modal("Account Blocked", "Your account has been blocked. Contact the administrator.",
        [{ label: "Logout", cls: "btn-danger", onClick: logout }]);
      return;
    }
    try {
      const qr = await loadQuestions();
      state.sets = buildSets(qr.rows);
      recomputeTotals();
    } catch (e) { console.error("loadQuestions", e); }
    state.plans = await loadPlans();
    state.results = await loadResults(user.uid);

    state._userSub = onSnapshot(doc(db, "users", user.uid), snap => {
      if (snap.exists()) {
        state.profile = { uid: user.uid, ...snap.data() };
        if (!["exam", "practice", "result"].includes(state.screen)) render();
      }
    });

    const { screen, params } = parseHash();
    if (screen === "loading" || screen === "login" || screen === "signup") {
      navigate(params.next || "home");
    } else if (screen === "exam") {
      const saved = loadExamState();
      if (saved) {
        state.screen = "exam";
        resumeExamFromSaved(saved);
      } else {
        navigate("sets");
      }
    } else {
      state.screen = screen;
      state.params = params;
      render();
    }
  } catch (e) {
    console.error("Boot error", e);
    toast("Load error: " + e.message, "err");
    state.screen = "home";
    render();
  }
});

/* Keyboard shortcuts for exam */
window.addEventListener("keydown", (e) => {
  if (state.screen !== "exam") return;
  if (e.target.matches("input, textarea, select")) return;
  const k = e.key.toLowerCase();
  if (["a","b","c","d"].includes(k)) {
    const opt = document.querySelector(`[data-opt="${"abcd".indexOf(k)}"]`);
    if (opt) opt.click();
  } else if (k === "arrowright") $("nextBtn")?.click();
  else if (k === "arrowleft") $("prevBtn")?.click();
});
