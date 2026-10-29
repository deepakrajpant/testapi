// Firebase init + shared config
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD_JxMqTdYiW2DF8lgAlojh1quO32M0CuI",
  authDomain: "dream-japan-9cad8.firebaseapp.com",
  projectId: "dream-japan-9cad8",
  storageBucket: "dream-japan-9cad8.firebasestorage.app",
  messagingSenderId: "587561440248",
  appId: "1:587561440248:web:5a97ae4d2366e3b5583c0d",
  measurementId: "G-V3M5626QM5"
};

export const app      = initializeApp(FIREBASE_CONFIG);
export const auth     = getAuth(app);
export const db       = getFirestore(app);
export const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export const ADMIN_EMAIL   = "deepakrajpant978@gmail.com";
export const REPO_BASE     = "https://raw.githubusercontent.com/deepakrajpant/photo/main/";
export const QUESTIONS_DOC = "jftoctnovset/QORwII8D7qLZ7wuCDW36";
export const CACHE_KEY     = "dj_q_cache_v4";
export const CACHE_TTL     = 30 * 60 * 1000;
export const EXAM_MIN      = 60;
export const MAX_PLAYS     = 2;
export const PASS_PCT      = 0.8;
export const EXAM_STATE_KEY = "dj_exam_state";
export const RESULT_KEY    = "dj_result";

export const SECTIONS = [
  { key:"sv", name:"Script & Vocabulary",       short:"VOCAB",  count:16, marks:3, icon:"📝" },
  { key:"ce", name:"Conversation & Expression", short:"CONV",   count:13, marks:4, icon:"💬" },
  { key:"lc", name:"Listening Comprehension",   short:"LISTEN", count:11, marks:6, icon:"🎧" },
  { key:"rc", name:"Reading Comprehension",     short:"READ",   count:12, marks:7, icon:"📖" }
];
export const SET_NAMES = [
  { name:"SHIMEMASU", kana:"し" }, { name:"HARE",       kana:"は" },
  { name:"GAKUSEI",   kana:"が" }, { name:"ORIMASU",    kana:"お" },
  { name:"PONPYUTA",  kana:"ぽ" }, { name:"MAGARIMASU", kana:"ま" }
];
