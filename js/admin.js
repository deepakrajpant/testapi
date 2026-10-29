// Admin panel logic
import { db, QUESTIONS_DOC, ADMIN_EMAIL, SECTIONS, SET_NAMES } from "./firebase.js";
import {
  $, esc, toast, modal, daysLeft, fmtDate,
  loadPlans, fetchQuestionsFromFirestore, setCache, clearQCache,
  buildSets, totalsFor
} from "./core.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs,
  orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let adminTab = "overview";
let allQs = null;
let allStudents = null;
let ctx = null;
let setsRef = null; // function to rebuild sets externally

export function setAdminContext(context) { ctx = context; }
export function setSetsRebuilder(fn) { setsRef = fn; }

export function renderAdmin(root) {
  const tabs = [
    { id:"overview", label:"Overview" },
    { id:"students", label:"Students" },
    { id:"requests", label:"Requests" },
    { id:"questions", label:"Questions" },
    { id:"settings", label:"Settings" }
  ];
  root.innerHTML = `
    <div class="wrap" style="padding:16px 0 40px">
      <button class="btn btn-ghost btn-sm mb-2" onclick="location.href='./profile.html'">← Back</button>
      <h2 class="mb-2">⚙ Admin Dashboard</h2>
      <div class="admin-tabs">
        ${tabs.map(t => `<button class="admin-tab ${adminTab === t.id ? "on" : ""}" data-tab="${t.id}">${t.label}</button>`).join("")}
      </div>
      <div id="adminContent"></div>
    </div>`;
  root.querySelectorAll("[data-tab]").forEach(b => {
    b.onclick = () => { adminTab = b.dataset.tab; renderAdmin(root); };
  });
  const content = $("adminContent");
  if (adminTab === "overview") renderOverview(content);
  else if (adminTab === "students") renderStudents(content);
  else if (adminTab === "requests") renderRequests(content);
  else if (adminTab === "questions") renderQuestions(content);
  else renderSettings(content);
}

/* ---------- Overview ---------- */
function renderOverview(content) {
  content.innerHTML = `
    <div class="grid-2">
      <div class="stat-card"><div class="num" id="statTotal">…</div><div class="lbl">Total Students</div></div>
      <div class="stat-card"><div class="num" id="statActive">…</div><div class="lbl">Active</div></div>
      <div class="stat-card"><div class="num" id="statBlocked">…</div><div class="lbl">Blocked</div></div>
      <div class="stat-card"><div class="num" id="statPremium">…</div><div class="lbl">Premium</div></div>
      <div class="stat-card"><div class="num" id="statPending">…</div><div class="lbl">Pending Requests</div></div>
      <div class="stat-card"><div class="num" id="statQuestions">…</div><div class="lbl">Questions</div></div>
    </div>
    <div class="card mt-2">
      <h3 class="mb-1">Quick Actions</h3>
      <div class="grid-2">
        <button class="btn btn-primary btn-sm" data-act="students">Students</button>
        <button class="btn btn-teal btn-sm" data-act="questions">Questions</button>
        <button class="btn btn-ghost btn-sm" data-act="requests">Requests</button>
        <button class="btn btn-ghost btn-sm" id="refreshBtn">↻ Refresh Questions</button>
      </div>
    </div>`;
  content.querySelectorAll("[data-act]").forEach(b => {
    b.onclick = () => { adminTab = b.dataset.act; renderAdmin(document.getElementById("adminRoot")); };
  });
  $("refreshBtn").onclick = () => refreshQuestions();
  loadStats();
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
    let qCount = 0;
    try {
      const rows = await fetchQuestionsFromFirestore();
      qCount = rows.length;
    } catch {}
    if ($("statTotal")) $("statTotal").textContent = total;
    if ($("statActive")) $("statActive").textContent = active;
    if ($("statBlocked")) $("statBlocked").textContent = blocked;
    if ($("statPremium")) $("statPremium").textContent = premiumActive;
    if ($("statPending")) $("statPending").textContent = reqSnap.size;
    if ($("statQuestions")) $("statQuestions").textContent = qCount;
  } catch {}
}

/* ---------- Students ---------- */
function renderStudents(content) {
  content.innerHTML = `
    <div class="field">
      <input type="text" id="studentSearch" class="input" placeholder="Search by name or email…">
    </div>
    <div id="studentsList"><p class="muted center" style="padding:24px">Loading…</p></div>`;
  $("studentSearch").oninput = filterStudents;
  loadStudents();
}
async function loadStudents() {
  const list = $("studentsList");
  if (!list) return;
  try {
    const snap = await getDocs(collection(db, "users"));
    const users = [];
    snap.forEach(d => {
      if (ctx?.user?.uid && d.id === ctx.user.uid) return;
      users.push({ uid: d.id, ...d.data() });
    });
    allStudents = users;
    renderStudentRows(users);
  } catch (e) {
    list.innerHTML = `<p class="muted" style="color:var(--red)">Error: ${esc(e.message)}</p>`;
  }
}
function filterStudents() {
  const q = ($("studentSearch").value || "").toLowerCase();
  const all = allStudents || [];
  renderStudentRows(all.filter(u =>
    (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)));
}
function renderStudentRows(users) {
  const list = $("studentsList");
  if (!list) return;
  if (!users.length) { list.innerHTML = `<p class="muted center" style="padding:24px">No students found.</p>`; return; }
  list.innerHTML = users.map(u => {
    const premActive = u.premium && daysLeft(u.premium.expiry) > 0;
    return `<div class="admin-q-item">
      <div class="flex-between mb-1">
        <div>
          <h4>${esc(u.name || "Unnamed")}</h4>
          <p class="muted small">${esc(u.email)}</p>
        </div>
        <div class="badges">
          ${u.status === "blocked" ? '<span class="badge badge-danger">Blocked</span>' : '<span class="badge badge-success">Active</span>'}
          ${premActive ? '<span class="badge badge-prem">Premium</span>' : ""}
          ${u.practiceAccess ? '<span class="badge badge-info">Practice</span>' : ""}
        </div>
      </div>
      <div class="actions">
        <button data-act="grant-prem" data-uid="${u.uid}">Grant Premium</button>
        <button data-act="toggle-practice" data-uid="${u.uid}" data-val="${!u.practiceAccess}">${u.practiceAccess ? "Revoke" : "Grant"} Practice</button>
        <button class="${u.status === "blocked" ? "preview" : "del"}" data-act="toggle-block" data-uid="${u.uid}" data-status="${u.status}">${u.status === "blocked" ? "Unblock" : "Block"}</button>
      </div>
    </div>`;
  }).join("");
  list.querySelectorAll("[data-act]").forEach(b => {
    b.onclick = () => {
      if (b.dataset.act === "grant-prem") grantPremium(b.dataset.uid);
      else if (b.dataset.act === "toggle-practice") togglePractice(b.dataset.uid, b.dataset.val === "true");
      else if (b.dataset.act === "toggle-block") toggleBlock(b.dataset.uid, b.dataset.status);
    };
  });
}
async function grantPremium(uid) {
  const plans = await loadPlans();
  const planOptions = plans.map(p =>
    `<option value="${p.id}">${esc(p.name)} — NPR ${p.price} (${p.days}d)</option>`).join("");
  modal("Grant Premium", `
    <div class="field"><label>Plan</label>
      <select id="grantPlan" class="input">${planOptions}</select></div>
    <div class="field"><label>Note (optional)</label>
      <input type="text" id="grantNote" class="input" placeholder="Payment reference…"></div>`,
    [
      { label: "Cancel", cls: "btn-ghost" },
      { label: "Grant", cls: "btn-primary", onClick: async () => {
        const planId = $("grantPlan").value;
        const plan = plans.find(p => p.id === planId);
        if (!plan) return;
        const start = new Date();
        const expiry = new Date(Date.now() + plan.days * 86400000);
        try {
          await updateDoc(doc(db, "users", uid), {
            premium: { plan: plan.name, start, expiry, note: ($("grantNote") || {}).value || "" }
          });
          toast("Premium granted ✓", "ok");
          loadStudents();
        } catch (e) { toast("Failed: " + e.message, "err"); }
      }}
    ]);
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
  modal(`${newStatus === "blocked" ? "Block" : "Unblock"} this user?`,
    `Status will change to "${newStatus}".`,
    [
      { label: "Cancel", cls: "btn-ghost" },
      { label: "Confirm", cls: newStatus === "blocked" ? "btn-danger" : "btn-primary", onClick: async () => {
        try {
          await updateDoc(doc(db, "users", uid), { status: newStatus });
          toast(`User ${newStatus}`, "ok");
          loadStudents();
        } catch (e) { toast("Failed: " + e.message, "err"); }
      }}
    ]);
}

/* ---------- Requests ---------- */
function renderRequests(content) {
  content.innerHTML = `<div id="requestsList"><p class="muted center" style="padding:24px">Loading…</p></div>`;
  loadRequests();
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
          <div>
            <h4>${esc(r.name || r.email || r.uid)}</h4>
            <p class="muted small">${esc(r.type)}${r.planName ? " · " + esc(r.planName) : ""} · ${fmtDate(r.createdAt)}</p>
          </div>
          <span class="badge badge-${r.status === "pending" ? "warn" : r.status === "approved" ? "success" : "danger"}">${esc(r.status)}</span>
        </div>
        ${r.status === "pending" ? `<div class="actions">
          <button class="preview" data-act="approve" data-rid="${r.id}" data-uid="${r.uid}" data-type="${esc(r.type)}" data-plan="${esc(r.planId||"")}">Approve</button>
          <button class="del" data-act="reject" data-rid="${r.id}">Reject</button>
        </div>` : ""}
      </div>`).join("");
    list.querySelectorAll("[data-act]").forEach(b => {
      b.onclick = () => {
        if (b.dataset.act === "approve") approveRequest(b.dataset.rid, b.dataset.uid, b.dataset.type, b.dataset.plan);
        else rejectRequest(b.dataset.rid);
      };
    });
  } catch (e) {
    list.innerHTML = `<p class="muted" style="color:var(--red)">${esc(e.message)}</p>`;
  }
}
async function approveRequest(rid, uid, type, planId) {
  try {
    await updateDoc(doc(db, "accessRequests", rid), { status: "approved" });
    if (type === "practice") {
      await updateDoc(doc(db, "users", uid), { practiceAccess: true });
    } else if (type === "premium" && planId) {
      const plans = await loadPlans();
      const plan = plans.find(p => p.id === planId);
      if (plan) {
        const start = new Date();
        const expiry = new Date(Date.now() + plan.days * 86400000);
        await updateDoc(doc(db, "users", uid), {
          premium: { plan: plan.name, start, expiry, note: "Approved request" }
        });
      }
    }
    toast("Request approved ✓", "ok");
    loadRequests();
  } catch (e) { toast("Failed: " + e.message, "err"); }
}
async function rejectRequest(rid) {
  try {
    await updateDoc(doc(db, "accessRequests", rid), { status: "rejected" });
    toast("Request rejected", "ok");
    loadRequests();
  } catch (e) { toast("Failed: " + e.message, "err"); }
}

/* ---------- Questions ---------- */
function renderQuestions(content) {
  content.innerHTML = `
    <div class="flex-between mb-2">
      <h3>Questions</h3>
      <div class="flex" style="gap:6px">
        <button class="btn btn-ghost btn-sm" id="refreshQ">↻</button>
        <button class="btn btn-primary btn-sm" id="addQ">+ Add</button>
      </div>
    </div>
    <div class="field"><input type="text" id="qSearch" class="input" placeholder="Search questions…"></div>
    <div id="questionsList"><p class="muted center" style="padding:24px">Loading…</p></div>`;
  $("refreshQ").onclick = refreshQuestions;
  $("addQ").onclick = () => openQEditor(-1);
  $("qSearch").oninput = filterQs;
  loadQs();
}
async function loadQs() {
  const list = $("questionsList");
  if (!list) return;
  try {
    const rows = await fetchQuestionsFromFirestore();
    allQs = rows;
    renderQRows(rows);
  } catch (e) {
    list.innerHTML = `<p class="muted" style="color:var(--red)">${esc(e.message)}</p>`;
  }
}
function filterQs() {
  const q = ($("qSearch").value || "").toLowerCase();
  const rows = (allQs || []).filter(r =>
    (r.question || "").toLowerCase().includes(q) ||
    (r.passage || "").toLowerCase().includes(q));
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
        <span class="badge badge-muted">${esc(SECTIONS.find(s => s.key === r.section)?.short || r.section)}</span>
        <span class="badge badge-muted">Ans: ${esc(r.answer)}</span>
        ${r.image ? '<span class="badge badge-muted">🖼</span>' : ""}
        ${r.audio ? '<span class="badge badge-muted">🔊</span>' : ""}
      </div>
      <div class="qtxt">${esc((r.question || "").slice(0, 200))}</div>
      <div class="actions">
        <button class="preview" data-act="preview" data-i="${i}">Preview</button>
        <button class="edit" data-act="edit" data-i="${i}">Edit</button>
        <button class="del" data-act="del" data-i="${i}">Delete</button>
      </div>
    </div>`).join("");
  list.querySelectorAll("[data-act]").forEach(b => {
    b.onclick = () => {
      const row = rows[+b.dataset.i];
      if (b.dataset.act === "preview") previewQ(row);
      else if (b.dataset.act === "edit") openQEditor(row);
      else if (b.dataset.act === "del") deleteQ(row);
    };
  });
}
function openQEditor(row) {
  const isEdit = row && typeof row === "object";
  const
