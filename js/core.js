// Core helpers: utils, auth guard, layout, data layer
import {
  auth, db, provider, ADMIN_EMAIL, REPO_BASE, QUESTIONS_DOC, CACHE_KEY, CACHE_TTL,
  SECTIONS, SET_NAMES, PASS_PCT, EXAM_MIN, MAX_PLAYS
} from "./firebase.js";

import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs,
  addDoc, serverTimestamp, onSnapshot, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ---------- Utils ---------- */
export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
export const pad = n => String(n).padStart(2, "0");
export const qs = name => new URLSearchParams(location.search).get(name);

let _toastTimer;
export function toast(msg, type = "") {
  let t = document.getElementById("djToast");
  if (!t) { t = document.createElement("div"); t.id = "djToast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = "toast show" + (type ? " " + type : "");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

export function modal(title, bodyHTML, buttons) {
  let m = document.getElementById("djModal");
  if (!m) { m = document.createElement("div"); m.id = "djModal"; m.className = "overlay"; document.body.appendChild(m); }
  const btns = buttons || [{ label: "OK", cls: "btn-primary" }];
  const btnHtml = btns.map((b, i) =>
    `<button class="btn ${b.cls || "btn-primary"}" data-idx="${i}">${b.label}</button>`).join("");
  m.innerHTML = `<div class="modal-card"><h3>${esc(title)}</h3>
    <div>${bodyHTML}</div>
    <div class="modal-actions">${btnHtml}</div></div>`;
  m.classList.add("show");
  m.querySelectorAll(".modal-actions button").forEach(btn => {
    btn.onclick = () => {
      m.classList.remove("show");
      const b = btns[+btn.dataset.idx];
      if (b && b.onClick) b.onClick();
    };
  });
}
export function closeModal() {
  const m = document.getElementById("djModal");
  if (m) m.classList.remove("show");
}

export function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function daysLeft(ts) {
  if (!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
}

export function resolveUrl(url) {
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

export function sceneData(kind) {
  const sky = { rain:"#7f94a8", sun:"#6ec1f2", snow:"#c8d6e5", cloud:"#9fb3c4" }[kind] || "#6ec1f2";
  let x = "";
  if (kind === "sun") x = `<circle cx="300" cy="55" r="30" fill="#ffd23f"/>`;
  else x = `<ellipse cx="110" cy="52" rx="55" ry="22" fill="#fff" opacity=".88"/>
    <ellipse cx="255" cy="44" rx="60" ry="24" fill="#fff" opacity=".88"/>`;
  if (kind === "rain") for (let i = 0; i < 24; i++)
    x += `<line x1="${20+i*15}" y1="${90+(i*37)%60}" x2="${14+i*15}" y2="${110+(i*37)%60}" stroke="#d8ecff" stroke-width="2"/>`;
  if (kind === "snow") for (let i = 0; i < 22; i++)
    x += `<circle cx="${15+i*16}" cy="${95+(i*53)%90}" r="3" fill="#fff"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 200">
    <rect width="360" height="200" fill="${sky}"/>${x}
    <rect y="165" width="360" height="35" fill="#5d8a4e"/>
    <polygon points="170,165 215,95 260,165" fill="#c94536"/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export const LOGO_SVG = `<svg viewBox="0 0 24 24"><path d="M12 4L20 19H4L12 4Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;

/* ---------- Auth ---------- */
export async function signInGoogle() {
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (["auth/popup-blocked","auth/popup-closed-by-user","auth/cancelled-popup-request",
         "auth/operation-not-supported-in-this-environment"].includes(e.code)) {
      try { await signInWithRedirect(auth, provider); }
      catch (re) { toast(re.message, "err"); }
    } else { toast("Login failed: " + (e.code || e.message), "err"); }
  }
}
export async function signInEmail(email, pass) {
  try { await signInWithEmailAndPassword(auth, email, pass); return true; }
  catch (e) {
    const map = {
      "auth/user-not-found":"No account with this email",
      "auth/wrong-password":"Incorrect password",
      "auth/invalid-email":"Invalid email",
      "auth/invalid-credential":"Invalid email or password",
      "auth/too-many-requests":"Too many attempts — try later"
    };
    toast(map[e.code] || "Login failed", "err");
    return false;
  }
}
export async function signUpEmail(email, pass, name) {
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
export async function resetPassword(email) {
  try { await sendPasswordResetEmail(auth, email); toast("Reset link sent", "ok"); }
  catch (e) { toast("Failed: " + e.message, "err"); }
}
export async function logout() {
  await signOut(auth);
  location.href = "./index.html";
}

/* ---------- Auth guard ----------
   Usage at top of every protected page:
   const ctx = await requireAuth();
   if (!ctx) return;               // already redirected
*/
export async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { lastLogin: serverTimestamp() }).catch(() => {});
    return { uid: user.uid, ...snap.data() };
  }
  const isAdmin = user.email === ADMIN_EMAIL;
  const profile = {
    name: user.displayName || (user.email || "").split("@")[0],
    email: user.email || "",
    photoURL: user.photoURL || "",
    emailVerified: !!user.emailVerified,
    role: isAdmin ? "admin" : "student",
    status: "active",
    practiceAccess: false,
    premium: null,
    bookmarks: [],
    streak: { count: 0, last: null },
    bestScore: 0,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp()
  };
  try { await setDoc(ref, profile); }
  catch (e) { console.warn("Profile create skipped:", e.code); }
  return { uid: user.uid, ...profile };
}

export function onAuthReady() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => { resolve(user); });
  });
}

export async function requireAuth(opts = {}) {
  document.body.insertAdjacentHTML("afterbegin",
    `<div id="djBoot" class="loading-screen" style="position:fixed;inset:0;background:var(--bg);z-index:999">
      <div class="spinner"></div><p class="muted">Loading Dream Japan…</p></div>`);
  const user = await onAuthReady();
  if (!user) {
    location.replace("./index.html?next=" + encodeURIComponent(location.pathname + location.search));
    return null;
  }
  let profile;
  try { profile = await ensureUserProfile(user); }
  catch (e) {
    toast("Could not load profile — check your connection.", "err");
    return null;
  }
  if (profile.status === "blocked") {
    modal("Account Blocked", "Your account has been blocked. Contact the administrator.",
      [{ label: "Logout", cls: "btn-danger", onClick: logout }]);
    return null;
  }
  const isAdmin = user.email === ADMIN_EMAIL || profile.role === "admin";
  if (opts.adminOnly && !isAdmin) {
    location.replace("./home.html");
    return null;
  }
  const boot = document.getElementById("djBoot");
  if (boot) boot.remove();
  return { user, profile, isAdmin };
}

/* ---------- Layout ---------- */
export function renderLayout(profile, activePage, isAdmin) {
  const p = profile || {};
  const initial = (p.name || p.email || "U")[0].toUpperCase();
  const avatarHTML = p.photoURL
    ? `<img src="${esc(p.photoURL)}" class="avatar" alt="" loading="lazy">`
    : `<div class="avatar">${initial}</div>`;

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `<div class="topbar-inner">
    <div class="logo" onclick="location.href='./home.html'">${LOGO_SVG}</div>
    <div class="brand" onclick="location.href='./home.html'">
      <h1>Dream Japan</h1><p>JFT MOCK TEST</p>
    </div>
    <button class="user-btn" onclick="location.href='./profile.html'">${avatarHTML}
      <span>${esc(p.name || p.email || "")}</span></button>
  </div>`;
  document.body.insertBefore(topbar, document.body.firstChild);

  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  const items = [
    { key:"home",      icon:"🏠", label:"Home",     href:"./home.html" },
    { key:"sets",      icon:"📚", label:"Tests",    href:"./sets.html" },
    { key:"premium",   icon:"⭐", label:"Premium",  href:"./premium.html" },
    { key:"profile",   icon:"👤", label:"Profile",  href:"./profile.html" }
  ];
  nav.innerHTML = `<div class="bnav-inner">${items.map(it => `
    <a class="bnav-item ${activePage === it.key ? "on" : ""}" href="${it.href}">
      <span class="ic">${it.icon}</span><span>${it.label}</span>
    </a>`).join("")}</div>`;
  document.body.appendChild(nav);

  const toastEl = document.createElement("div");
  toastEl.id = "djToast"; toastEl.className = "toast";
  document.body.appendChild(toastEl);
}

export function navigate(page, params = {}) {
  const usp = new URLSearchParams(params);
  const q = usp.toString();
  location.href = `./${page}${q ? "?" + q : ""}`;
}

/* ---------- Data: questions ---------- */
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

export function getCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || c.v !== 4 || !Array.isArray(c.rows)) return null;
    return c;
  } catch { return null; }
}
export function setCache(rows) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: 4, ts: Date.now(), rows })); } catch {}
}
export function clearQCache() { try { sessionStorage.removeItem(CACHE_KEY); } catch {} }

export async function fetchQuestionsFromFirestore() {
  const snap = await getDoc(doc(db, QUESTIONS_DOC));
  if (!snap.exists()) throw new Error("Questions document not found");
  const data = snap.data();
  let rows = null;
  if (Array.isArray(data)) rows = data;
  else if (Array.isArray(data.questions)) rows = data.questions;
  else for (const k of Object.keys(data)) { if (Array.isArray(data[k])) { rows = data[k]; break; } }
  if (!rows || !rows.length) throw new Error("No questions found");
  return rows.map(normalizeRow).filter(Boolean);
}

export async function loadQuestions(force = false) {
  const cached = getCache();
  if (!force && cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return { rows: cached.rows, fromCache: true, ts: cached.ts };
  }
  try {
    const rows = await fetchQuestionsFromFirestore();
    setCache(rows);
    return { rows, fromCache: false, ts: Date.now() };
  } catch (e) {
    if (cached) return { rows: cached.rows, fromCache: true, ts: cached.ts, error: e };
    throw e;
  }
}

export function buildSets(rows) {
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

export function totalsFor(sets) {
  const secs = sets[0].sections;
  const totalQ = secs.reduce((a, s) => a + s.questions.length, 0);
  const fullMarks = secs.reduce((a, s) => a + s.questions.length * s.marks, 0);
  const passMarks = Math.round(fullMarks * PASS_PCT);
  return { totalQ, fullMarks, passMarks };
}

/* ---------- Data: user stuff ---------- */
export async function loadResults(uid) {
  try {
    const q = query(collection(db, "users", uid, "results"), orderBy("submittedAt", "desc"), limit(30));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    return out;
  } catch { return []; }
}

export async function loadPlans() {
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
      for (const p of defs) {
        try { await setDoc(doc(db, "plans", p.id), p); } catch {}
      }
      return defs;
    }
    return plans;
  } catch { return []; }
}

export async function loadLeaderboard() {
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

export async function requestAccess(profile) {
  if (!profile) return;
  try {
    const existing = await getDocs(query(
      collection(db, "accessRequests"),
      where("uid", "==", profile.uid), where("status", "==", "pending")
    ));
    if (!existing.empty) return toast("You already have a pending request", "warn");
    await addDoc(collection(db, "accessRequests"), {
      uid: profile.uid, email: profile.email || "", name: profile.name || "",
      type: "practice", status: "pending", createdAt: serverTimestamp()
    });
    toast("Request submitted ✓", "ok");
  } catch (e) { toast("Failed: " + e.message, "err"); }
}

export async function requestPremium(profile, plan) {
  if (!profile || !plan) return;
  try {
    await addDoc(collection(db, "accessRequests"), {
      uid: profile.uid, email: profile.email || "", name: profile.name || "",
      type: "premium", planId: plan.id, planName: plan.name, planPrice: plan.price,
      status: "pending", createdAt: serverTimestamp()
    });
    toast("Request sent to admin ✓", "ok");
  } catch (e) { toast("Failed: " + e.message, "err"); }
}

/* Realtime profile sub (used to refresh layout instantly after admin changes) */
export function watchProfile(uid, cb) {
  return onSnapshot(doc(db, "users", uid), snap => {
    if (snap.exists()) cb({ uid, ...snap.data() });
  });
}

/* ---------- Streak ---------- */
export async function bumpStreak(profile) {
  if (!profile) return;
  const streak = profile.streak || { count: 0, last: null };
  const last = streak.last ? new Date(streak.last) : null;
  const now = new Date();
  let newCount = streak.count || 0;
  if (!last) newCount = 1;
  else {
    const diffDays = Math.floor((now - last) / 86400000);
    if (diffDays === 0) { /* no change */ }
    else if (diffDays === 1) newCount++;
    else newCount = 1;
  }
  try {
    await updateDoc(doc(db, "users", profile.uid), {
      streak: { count: newCount, last: now.toISOString() }
    });
  } catch {}
}

/* ---------- Exam state persistence ---------- */
export const EXAM_STATE_KEY = "dj_exam_state";
export const RESULT_KEY = "dj_result";

export function saveExamState(state) {
  try { sessionStorage.setItem(EXAM_STATE_KEY, JSON.stringify(state)); } catch {}
}
export function loadExamState() {
  try {
    const raw = sessionStorage.getItem(EXAM_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearExamState() {
  try { sessionStorage.removeItem(EXAM_STATE_KEY); } catch {}
}
export function saveResult(res) {
  try { sessionStorage.setItem(RESULT_KEY, JSON.stringify(res)); } catch {}
}
export function loadResult() {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearResult() {
  try { sessionStorage.removeItem(RESULT_KEY); } catch {}
}

export { SECTIONS, SET_NAMES, EXAM_MIN, MAX_PLAYS, PASS_PCT, ADMIN_EMAIL, QUESTIONS_DOC, REPO_BASE };
