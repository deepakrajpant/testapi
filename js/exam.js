// Exam + practice engine
import { db } from "./firebase.js";
import {
  $, esc, pad, toast, modal, closeModal, resolveUrl, sceneData,
  loadQuestions, buildSets, totalsFor,
  saveExamState, loadExamState, clearExamState,
  saveResult, bumpStreak
} from "./core.js";
import {
  doc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { EXAM_MIN, MAX_PLAYS, SECTIONS, PASS_PCT } from "./firebase.js";

let exam = null;
let practice = null;
let _tick = null;
let _tickStart = 0;
let _tickLeftAtStart = 0;
let _audio = null;
let currentProfile = null;
let currentUser = null;

export function setExamContext(profile, user) {
  currentProfile = profile;
  currentUser = user;
}

/* ---------- Audio ---------- */
export function stopAudio() {
  if (_audio) { try { _audio.pause(); } catch {} _audio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

export function playAudio(q) {
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
    _audio = new Audio(resolveUrl(src));
    _audio.onended = _audio.onerror = done;
    _audio.play().catch(done);
  }
}

/* ---------- Session save ---------- */
function persist() {
  if (!exam) return;
  saveExamState({
    setIdx: exam.setIdx,
    startedAt: exam.startedAt,
    si: exam.si, qi: exam.qi, left: exam.left,
    maxReachable: exam.maxReachable,
    answers: exam.sections.map(s => s.questions.map(q => q.sel === undefined ? null : q.sel)),
    played: exam.sections.map(s => s.questions.map(q => q.played || 0))
  });
}

/* ---------- Start exam ---------- */
export async function beginExam(setIdx, opts = {}) {
  const { rows } = await loadQuestions();
  const sets = buildSets(rows);
  const set = sets[setIdx];
  if (!set) { toast("Set not found", "err"); return; }
  // Fresh copies so mutations don't leak between attempts
  const sections = set.sections.map(s => ({
    ...s,
    questions: s.questions.map(q => ({ ...q, sel: undefined, locked: false, played: 0 }))
  }));
  exam = {
    set, setIdx, sections, si: 0, qi: 0,
    left: EXAM_MIN * 60, paused: false,
    answeredCount: 0, maxReachable: 0,
    startedAt: Date.now()
  };
  persist();
  startTimer();
  bumpStreak(currentProfile);
  renderExamPage();
}

/* Resume exam from sessionStorage */
export async function resumeExam() {
  const saved = loadExamState();
  if (!saved) { location.href = "./sets.html"; return; }
  const { rows } = await loadQuestions();
  const sets = buildSets(rows);
  const set = sets[saved.setIdx];
  if (!set) { clearExamState(); location.href = "./sets.html"; return; }
  const sections = set.sections.map((s, si) => ({
    ...s,
    questions: s.questions.map((q, qi) => ({
      ...q,
      sel: saved.answers?.[si]?.[qi] ?? undefined,
      locked: false,
      played: saved.played?.[si]?.[qi] || 0
    }))
  }));
  exam = {
    set, setIdx: saved.setIdx, sections,
    si: saved.si || 0, qi: saved.qi || 0,
    left: Math.max(0, saved.left || EXAM_MIN * 60),
    paused: false,
    answeredCount: sections[saved.si || 0].questions.filter(x => x.sel !== undefined).length,
    maxReachable: saved.maxReachable || 0,
    startedAt: saved.startedAt || Date.now()
  };
  startTimer();
  renderExamPage();
}

/* ---------- Timer ---------- */
function startTimer() {
  if (_tick) clearInterval(_tick);
  _tickStart = Date.now();
  _tickLeftAtStart = exam.left;
  _tick = setInterval(tick, 500);
}
function stopTimer() {
  if (_tick) { clearInterval(_tick); _tick = null; }
}
function tick() {
  if (!exam) { stopTimer(); return; }
  if (exam.paused) {
    _tickStart = Date.now();
    _tickLeftAtStart = exam.left;
    return;
  }
  const elapsed = Math.floor((Date.now() - _tickStart) / 1000);
  exam.left = Math.max(0, _tickLeftAtStart - elapsed);
  const el = $("timerDisplay");
  if (el) {
    el.innerHTML = `⏱ <span>${pad(Math.floor(exam.left / 60))}:${pad(exam.left % 60)}</span>`;
    el.classList.toggle("low", exam.left <= 600);
  }
  if (exam.left <= 0) {
    stopTimer();
    modal("Time is up!", "Submitting automatically…",
      [{ label: "View Results", cls: "btn-primary", onClick: finishExam }]);
  }
}

/* ---------- Render ---------- */
function renderExamPage() {
  const sec = exam.sections[exam.si];
  const q = sec.questions[exam.qi];
  const isLastQ = exam.qi === sec.questions.length - 1;
  const isLastSec = exam.si === exam.sections.length - 1;
  const nextLabel = isLastQ ? (isLastSec ? "Submit Exam ✓" : "Finish Section →") : "Next →";

  let mediaHTML = "";
  if (q.img) mediaHTML += `<img src="${esc(q.img)}" loading="lazy" onerror="this.style.display='none'">`;
  if (q.au) mediaHTML += `<div class="audio-row" id="audRow">
    <button class="play-btn" id="playBtn">▶</button>
    <button class="play-btn rep" id="replayBtn">↻</button>
    <div class="wave">${'<i></i>'.repeat(18)}</div>
    <span>${Math.max(0, MAX_PLAYS - (q.played || 0))} left</span></div>`;
  if (mediaHTML) mediaHTML = `<div class="media">${mediaHTML}</div>`;

  const optsHTML = q.o.slice(0, q.o[3] ? 4 : 3).map((t, i) => `
    <div class="opt ${q.sel === i ? "sel" : ""}" data-opt="${i}">
      <div class="opt-ltr">${"ABCD"[i]}</div>
      <div class="opt-tx">${esc(t)}</div>
    </div>`).join("");

  const root = $("examRoot");
  root.innerHTML = `
    <div class="exam-bar"><div class="exam-bar-inner">
      <button class="xback" id="leaveBtn">✕</button>
      <div class="exam-info">
        <b>Set ${exam.set.idx} · ${esc(exam.set.name)}</b>
        <span>Section ${exam.si + 1} of 4 — ${esc(sec.name)}</span>
      </div>
      <div class="timer ${exam.left <= 600 ? "low" : ""}" id="timerDisplay">
        ⏱ <span>${pad(Math.floor(exam.left / 60))}:${pad(exam.left % 60)}</span></div>
    </div></div>

    <div class="wrap" style="padding-bottom:40px">
      <div class="steps">${exam.sections.map((s, i) =>
        `<div class="step ${i === exam.si ? "cur" : i < exam.si ? "done" : ""}">${s.short}</div>`).join("")}</div>
      <div class="progress-bar"><i id="progressFill" style="width:${(exam.answeredCount / sec.questions.length) * 100}%"></i></div>
      <div class="palette">${sec.questions.map((qq, i) =>
        `<button class="pal-btn ${qq.sel !== undefined ? "ans" : ""} ${i === exam.qi ? "cur" : ""}"
          ${i > exam.maxReachable ? "disabled" : ""}
          data-jump="${i}">${i + 1}</button>`).join("")}</div>

      <div class="q-card">
        <div class="q-meta">
          <span class="q-num">Q ${exam.qi + 1} of ${sec.questions.length}</span>
          <span class="q-tag">${sec.short}</span>
          <span class="q-marks">${sec.marks} marks</span>
        </div>
        ${q.p ? `<div class="passage">${esc(q.p)}</div>` : ""}
        <div class="q-text">${esc(q.q)}</div>
        ${mediaHTML}
        <div class="opts" id="opts">${optsHTML}</div>
      </div>

      <div class="exam-nav">
        <button class="btn btn-ghost" id="prevBtn" ${exam.qi === 0 ? "disabled" : ""}>← Previous</button>
        <button class="btn btn-primary" id="nextBtn" ${q.sel === undefined ? "disabled" : ""}>${nextLabel}</button>
      </div>
    </div>`;

  // Wire events
  root.querySelectorAll("[data-opt]").forEach(el => {
    el.onclick = () => selectOpt(+el.dataset.opt);
  });
  root.querySelectorAll("[data-jump]").forEach(el => {
    el.onclick = () => { if (!el.disabled) jumpTo(+el.dataset.jump); };
  });
  $("prevBtn").onclick = prevQ;
  $("nextBtn").onclick = nextQ;
  $("leaveBtn").onclick = askLeave;
  if ($("playBtn")) $("playBtn").onclick = () => playAudio(q);
  if ($("replayBtn")) $("replayBtn").onclick = () => playAudio(q);
}

/* ---------- Actions ---------- */
function selectOpt(i) {
  const sec = exam.sections[exam.si];
  const q = sec.questions[exam.qi];
  if (q.locked) return;
  q.sel = i;
  exam.answeredCount = sec.questions.filter(x => x.sel !== undefined).length;
  document.querySelectorAll(".opt").forEach((el, idx) => el.classList.toggle("sel", idx === i));
  const nextBtn = $("nextBtn"); if (nextBtn) nextBtn.disabled = false;
  const palette = document.querySelectorAll(".pal-btn");
  if (palette[exam.qi]) palette[exam.qi].classList.add("ans");
  const pb = $("progressFill");
  if (pb) pb.style.width = (exam.answeredCount / sec.questions.length * 100) + "%";
  persist();
}

function jumpTo(i) {
  if (i > exam.maxReachable) return;
  stopAudio();
  exam.qi = i;
  persist();
  renderExamPage();
}

function prevQ() {
  if (exam.qi > 0) { stopAudio(); exam.qi--; persist(); renderExamPage(); }
}

function nextQ() {
  const sec = exam.sections[exam.si];
  const q = sec.questions[exam.qi];
  if (q.sel === undefined) return;
  if (exam.qi < sec.questions.length - 1) {
    stopAudio();
    exam.qi++;
    if (exam.qi > exam.maxReachable) exam.maxReachable = exam.qi;
    persist();
    renderExamPage();
  } else {
    finishSection();
  }
}

function finishSection() {
  const sec = exam.sections[exam.si];
  const unanswered = sec.questions.filter(x => x.sel === undefined).length;
  const isLast = exam.si === exam.sections.length - 1;
  modal(isLast ? "Submit your exam?" : "Complete this section?",
    (unanswered ? `${unanswered} unanswered. ` : "") +
    (isLast ? "You cannot change answers after submitting." : "You cannot return to this section."),
    [
      { label: "Cancel", cls: "btn-ghost" },
      { label: isLast ? "Submit" : "Continue", cls: "btn-primary", onClick: () => {
        sec.questions.forEach(q => q.locked = true);
        if (isLast) finishExam();
        else {
          exam.si++; exam.qi = 0; exam.maxReachable = 0;
          persist();
          renderExamPage();
        }
      }}
    ]);
}

/* Back-button interception */
let _backGuardBound = false;
export function setupBackGuard() {
  if (_backGuardBound) return;
  _backGuardBound = true;
  history.pushState({ examGuard: true }, "", location.href);
  window.addEventListener("popstate", () => {
    if (!exam) return;
    history.pushState({ examGuard: true }, "", location.href);
    askLeave();
  });
}

function askLeave() {
  if (!exam) return;
  exam.paused = true;
  stopAudio();
  modal("Leave the exam?", "Progress will be lost and the timer will stop.",
    [
      { label: "Stay", cls: "btn-ghost", onClick: () => { exam.paused = false; } },
      { label: "Leave", cls: "btn-danger", onClick: () => {
        stopTimer();
        exam = null;
        clearExamState();
        location.href = "./sets.html";
      }}
    ]);
}

/* Finish exam → save → redirect */
async function finishExam() {
  stopTimer();
  stopAudio();
  if (!exam) return;
  const { totalQ, fullMarks, passMarks } = totalsFor([exam.set]);
  const used = EXAM_MIN * 60 - exam.left;

  let score = 0, correct = 0, unanswered = 0;
  const sections = exam.sections.map(s => {
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

  const wrong = totalQ - correct - unanswered;
  const percentage = Math.round(score / fullMarks * 100);
  const result = {
    setIdx: exam.set.idx, setName: exam.set.name,
    score, maxScore: fullMarks, percentage,
    correct, wrong, unanswered, sections,
    timeUsed: used,
    startedAt: new Date(exam.startedAt).toISOString(),
    submittedAt: new Date().toISOString()
  };

  try {
    if (currentUser) {
      const attemptId = `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await setDoc(doc(db, "users", currentUser.uid, "results", attemptId), {
        ...result, submittedAt: serverTimestamp()
      });
      if (percentage > (currentProfile?.bestScore || 0)) {
        await updateDoc(doc(db, "users", currentUser.uid), { bestScore: percentage });
      }
    }
  } catch (e) {
    console.error("Save result", e);
    toast("Result saved locally only.", "err");
  }

  saveResult(result);
  clearExamState();
  exam = null;
  location.href = "./result.html";
}

/* ---------- Practice ---------- */
export async function beginPractice(sectionKey) {
  const { rows } = await loadQuestions();
  const sets = buildSets(rows);
  const pool = [];
  sets.forEach(s => {
    const sec = s.sections.find(x => x.key === sectionKey);
    if (sec) sec.questions.forEach(q => pool.push({ ...q, sel: undefined, locked: false, played: 0 }));
  });
  if (pool.length < 5) { toast("Not enough questions in this section", "err"); return; }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, Math.min(10, pool.length));
  const meta = SECTIONS.find(s => s.key === sectionKey);
  practice = {
    sections: [{ key: meta.key, name: meta.name, short: meta.short, marks: meta.marks,
      questions: picked, count: picked.length, icon: meta.icon }],
    si: 0, qi: 0, answeredCount: 0, maxReachable: 0
  };
  renderPracticePage();
}

function renderPracticePage() {
  const sec = practice.sections[0];
  const q = sec.questions[practice.qi];
  let mediaHTML = "";
  if (q.img) mediaHTML += `<img src="${esc(q.img)}" loading="lazy" onerror="this.style.display='none'">`;
  if (q.au) mediaHTML += `<div class="audio-row" id="audRow">
    <button class="play-btn" id="playBtn">▶</button>
    <div class="wave">${'<i></i>'.repeat(18)}</div>
    <span>unlimited</span></div>`;
  if (mediaHTML) mediaHTML = `<div class="media">${mediaHTML}</div>`;
  const optsHTML = q.o.slice(0, q.o[3] ? 4 : 3).map((t, i) => `
    <div class="opt ${q.sel === i ? "sel" : ""}" data-opt="${i}">
      <div class="opt-ltr">${"ABCD"[i]}</div>
      <div class="opt-tx">${esc(t)}</div>
    </div>`).join("");
  const isLast = practice.qi === sec.questions.length - 1;
  const root = $("examRoot");
  root.innerHTML = `
    <div class="exam-bar"><div class="exam-bar-inner">
      <button class="xback" id="leaveBtn">✕</button>
      <div class="exam-info">
        <b>Practice · ${esc(sec.name)}</b>
        <span>Q ${practice.qi + 1} of ${sec.questions.length}</span>
      </div>
    </div></div>
    <div class="wrap" style="padding-bottom:40px">
      <div class="progress-bar"><i id="progressFill" style="width:${(practice.answeredCount / sec.questions.length) * 100}%"></i></div>
      <div class="palette">${sec.questions.map((qq, i) =>
        `<button class="pal-btn ${qq.sel !== undefined ? "ans" : ""} ${i === practice.qi ? "cur" : ""}"
          ${i > practice.maxReachable ? "disabled" : ""} data-jump="${i}">${i + 1}</button>`).join("")}</div>
      <div class="q-card">
        <div class="q-meta">
          <span class="q-num">Q ${practice.qi + 1} of ${sec.questions.length}</span>
          <span class="q-tag">${sec.short}</span>
          <span class="q-marks">${sec.marks} marks</span>
        </div>
        ${q.p ? `<div class="passage">${esc(q.p)}</div>` : ""}
        <div class="q-text">${esc(q.q)}</div>
        ${mediaHTML}
        <div class="opts" id="opts">${optsHTML}</div>
      </div>
      <div class="exam-nav">
        <button class="btn btn-ghost" id="prevBtn" ${practice.qi === 0 ? "disabled" : ""}>← Previous</button>
        <button class="btn btn-primary" id="nextBtn" ${q.sel === undefined ? "disabled" : ""}>${isLast ? "Finish ✓" : "Next →"}</button>
      </div>
    </div>`;
  root.querySelectorAll("[data-opt]").forEach(el => el.onclick = () => practiceSelect(+el.dataset.opt));
  root.querySelectorAll("[data-jump]").forEach(el => el.onclick = () => { if (!el.disabled) practiceJump(+el.dataset.jump); });
  $("prevBtn").onclick = practicePrev;
  $("nextBtn").onclick = practiceNext;
  $("leaveBtn").onclick = () => {
    modal("Leave practice?", "Your progress will not be saved.",
      [{ label:"Stay", cls:"btn-ghost" },
       { label:"Leave", cls:"btn-danger", onClick: () => { practice = null; location.href = "./practice.html"; } }]);
  };
  if ($("playBtn")) $("playBtn").onclick = () => playAudio(q);
}

function practiceSelect(i) {
  const sec = practice.sections[0];
  const q = sec.questions[practice.qi];
  q.sel = i;
  practice.answeredCount = sec.questions.filter(x => x.sel !== undefined).length;
  document.querySelectorAll(".opt").forEach((el, idx) => el.classList.toggle("sel", idx === i));
  const nb = $("nextBtn"); if (nb) nb.disabled = false;
  const palette = document.querySelectorAll(".pal-btn");
  if (palette[practice.qi]) palette[practice.qi].classList.add("ans");
  const pb = $("progressFill");
  if (pb) pb.style.width = (practice.answeredCount / sec.questions.length * 100) + "%";
}
function practiceJump(i) {
  if (i > practice.maxReachable) return;
  stopAudio(); practice.qi = i; renderPracticePage();
}
function practicePrev() { if (practice.qi > 0) { stopAudio(); practice.qi--; renderPracticePage(); } }
function practiceNext() {
  const sec = practice.sections[0];
  const q = sec.questions[practice.qi];
  if (q.sel === undefined) return;
  if (practice.qi < sec.questions.length - 1) {
    stopAudio(); practice.qi++;
    if (practice.qi > practice.maxReachable) practice.maxReachable = practice.qi;
    renderPracticePage();
  } else finishPractice();
}
function finishPractice() {
  const sec = practice.sections[0];
  let correct = 0;
  sec.questions.forEach(q => { if (q.sel === q.a) correct++; });
  const total = sec.questions.length;
  modal("Practice Complete", `
    <div class="center">
      <div style="font-size:48px;margin-bottom:8px">${correct/total >= 0.7 ? "🎉" : "💪"}</div>
      <h3 style="font-size:32px;color:var(--purple);margin-bottom:4px">${correct}/${total}</h3>
      <p class="muted">${Math.round(correct/total*100)}% correct</p>
    </div>`,
    [{ label: "Done", cls: "btn-primary", onClick: () => { practice = null; location.href = "./home.html"; } }]);
}

export function cleanupExam() {
  stopTimer();
  stopAudio();
}
