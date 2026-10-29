// Minhas Finanças — app de despesas com login Google (Firebase Auth) e dados no Firestore.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

/* ================= helpers ================= */
const $ = (s) => document.querySelector(s);
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents) => BRL.format((cents || 0) / 100);
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const pad = (n) => String(n).padStart(2, "0");
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const keyOf = (iso) => iso.slice(0, 7);
const keyFor = (y, m) => `${y}-${pad(m)}`;
const fmtDate = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const daysIn = (y, m) => new Date(y, m, 0).getDate();
const addMonths = (iso, k, day) => {
  let [y, m] = iso.split("-").map(Number);
  const t = (y * 12 + (m - 1)) + k;
  y = Math.floor(t / 12); m = (t % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(day, daysIn(y, m)))}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0));
const suffix = (it) => (it.sn ? ` - ${it.si}/${it.sn}` : "");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  checks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12.5l4 4L14 8.5"/><path d="M11 15.5l1 1 9-9"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h13v4"/><path d="M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2z"/><circle cx="16" cy="14.5" r="1.3"/></svg>',
};

/* ================= state ================= */
const now = new Date();
const state = { y: now.getFullYear(), m: now.getMonth() + 1, ready: false, user: null };

/* ================= screens ================= */
// A abertura rosa fica pelo menos BOOT_MIN ms na tela e depois some suavemente.
const BOOT_MIN = 1300;
const bootStart = performance.now();
let bootDone = false, pendingScreen = null, pendingTimer = null;

function applyScreen(name) {
  $("#loginScreen").hidden = name !== "login";
  $("#app").hidden = name !== "app";
  if (name !== "app") { $("#formScreen").hidden = true; closeSheet(); closeMenu(); }
  if (!bootDone) {
    bootDone = true;
    const boot = $("#boot");
    boot.classList.add("leaving");
    setTimeout(() => { boot.hidden = true; }, 450);
  }
}

function showScreen(name) {
  if (name === "boot") return; // já começa visível
  pendingScreen = name;
  const wait = bootDone ? 0 : BOOT_MIN - (performance.now() - bootStart);
  if (wait <= 0) { applyScreen(name); return; }
  if (!pendingTimer) pendingTimer = setTimeout(() => { pendingTimer = null; applyScreen(pendingScreen); }, wait);
}

function loginError(msg) {
  const el = $("#loginError");
  el.textContent = msg || ""; el.hidden = !msg;
}

/* ================= Firebase ================= */
let auth = null, db = null;

function loadConfig() {
  const c = window.FIREBASE_CONFIG;
  return c && c.apiKey && !String(c.apiKey).startsWith("COLE") ? c : null;
}

const AUTH_ERRORS = {
  "auth/unauthorized-domain": "Este endereço ainda não está autorizado no Firebase. Abra Authentication → Configurações → Domínios autorizados e adicione o endereço do site.",
  "auth/network-request-failed": "Sem conexão com a internet. Confira e tente de novo.",
  "auth/operation-not-allowed": "O login com Google ainda não foi ativado no Firebase (Authentication → Método de login → Google).",
  "auth/too-many-requests": "Muitas tentativas seguidas. Espere um pouquinho e tente de novo.",
  "auth/user-disabled": "Esta conta foi desativada.",
  "auth/internal-error": "O Google não respondeu direito. Tente de novo.",
};

async function login() {
  if (!auth) return;
  loginError("");
  const btn = $("#googleBtn");
  btn.disabled = true; $("#googleBtnText").textContent = "Abrindo o Google…";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = e && e.code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment" || code === "auth/web-storage-unsupported") {
      try { await signInWithRedirect(auth, provider); return; } catch (e2) { loginError(AUTH_ERRORS[e2.code] || "Não foi possível entrar. Tente de novo."); }
    } else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled") {
      /* ela fechou a janela: não é erro */
    } else {
      loginError(AUTH_ERRORS[code] || "Não foi possível entrar. Tente de novo.");
      console.error(e);
    }
  } finally {
    btn.disabled = false; $("#googleBtnText").textContent = "Entrar com Google";
  }
}
$("#googleBtn").addEventListener("click", login);

async function boot() {
  showScreen("boot");
  const cfg = loadConfig();
  if (!cfg) {
    showScreen("login");
    $("#googleBtn").disabled = true;
    loginError("Falta a configuração do Firebase: preencha o arquivo firebase-config.js.");
    return;
  }
  const app = initializeApp(cfg);
  auth = getAuth(app);
  auth.languageCode = "pt-BR";
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  getRedirectResult(auth).catch((e) => { if (e && e.code) loginError(AUTH_ERRORS[e.code] || "Não foi possível entrar. Tente de novo."); });

  onAuthStateChanged(auth, (user) => {
    state.user = user;
    if (user) {
      loginError("");
      showScreen("app");
      Store.start(user.uid);
    } else {
      Store.stop();
      showScreen("login");
    }
  });
}

/* ================= storage (Firestore) =================
   users/{uid}/months/{AAAA-MM} = { items: [...], updatedAt }
   server: último snapshot; local: meses editados aqui ainda sendo salvos */
const Store = {
  col: null, unsub: null,
  server: {}, local: {}, ver: {},

  items(key) { return (key in this.local ? this.local[key] : this.server[key]) || []; },
  keys() { return Array.from(new Set([...Object.keys(this.server), ...Object.keys(this.local)])).sort(); },
  find(id) {
    for (const k of this.keys()) { const it = this.items(k).find((x) => x.id === id); if (it) return it; }
    return null;
  },

  start(userId) {
    this.stop();
    state.ready = false; render();
    this.col = collection(db, "users", userId, "months");
    this.unsub = onSnapshot(this.col, (snap) => {
      const next = {};
      snap.forEach((d) => { const data = d.data(); if (data && Array.isArray(data.items)) next[d.id] = data.items; });
      this.server = next;
      state.ready = true;
      render();
    }, (err) => {
      console.error(err);
      state.ready = true; render();
      toast(err && err.code === "permission-denied"
        ? "Sem permissão para ler os dados. Confira as regras do Firestore."
        : "Não foi possível carregar suas despesas. Confira a internet.");
    });
  },

  stop() {
    if (this.unsub) this.unsub();
    this.unsub = null; this.col = null;
    this.server = {}; this.local = {}; this.ver = {};
    state.ready = false;
  },

  put(key, items) {
    if (!this.col) return;
    items = items.slice().sort(byDate);
    this.local[key] = items;
    const v = this.ver[key] = (this.ver[key] || 0) + 1;
    const ref = doc(this.col, key);
    // Sem internet, o Firestore guarda no aparelho e envia quando voltar.
    const p = items.length
      ? setDoc(ref, { items: items.map((x) => ({ ...x })), updatedAt: serverTimestamp() })
      : deleteDoc(ref);
    p.then(() => {
      if (this.ver[key] === v) { delete this.local[key]; render(); }
    }).catch((e) => {
      console.error(e);
      if (this.ver[key] === v) delete this.local[key];
      render();
      toast(e && e.code === "permission-denied"
        ? "Sem permissão para salvar. Saia e entre de novo."
        : "Não foi possível salvar. Tente de novo.");
    });
  },
};

/* ================= rendering ================= */
const listEl = $("#list");

function monthItems() { return Store.items(keyFor(state.y, state.m)).slice().sort(byDate); }

function render() {
  $("#monthLabel").innerHTML = `${MONTHS[state.m - 1]}<span class="sep">/</span>${state.y}`;

  const notice = $("#notice");
  if (!navigator.onLine) {
    notice.textContent = "Sem internet. O que você lançar será enviado quando a conexão voltar.";
    notice.hidden = false;
  } else notice.hidden = true;

  if (!state.ready) {
    listEl.innerHTML = '<div class="empty"><span>Carregando suas despesas…</span></div>';
    $("#totalVal").textContent = money(0);
    $("#balanceVal").textContent = money(0);
    return;
  }

  const items = monthItems();
  const total = items.reduce((s, it) => s + it.amount, 0);
  const toPay = items.reduce((s, it) => s + (it.paid ? 0 : it.amount), 0);
  $("#totalVal").textContent = money(total);
  $("#balanceVal").textContent = money(toPay);

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${ICON.wallet}<strong>Nenhuma despesa em ${MONTHS[state.m - 1].toLowerCase()}</strong><span>Toque em + para adicionar.</span></div>`;
    return;
  }
  const today = todayISO();
  listEl.innerHTML = items.map((it) => {
    const late = !it.paid && it.date < today;
    return `<button type="button" class="item${it.paid ? " is-paid" : ""}" data-id="${esc(it.id)}">
      <span class="item-main">
        <span class="item-desc">${esc(it.desc)}${it.sn ? `<span class="parc">${esc(suffix(it))}</span>` : ""}</span>
        <span class="item-date${late ? " late" : ""}">${fmtDate(it.date)}${late ? " · vencida" : ""}</span>
      </span>
      <span class="item-side">
        <span class="item-amt">${money(it.amount)}</span>
        ${it.paid ? `<span class="pill">${ICON.check}Paga</span>` : ""}
      </span>
    </button>`;
  }).join("");
}
window.addEventListener("online", render);
window.addEventListener("offline", render);

/* ================= month navigation ================= */
function shiftMonth(k) {
  const t = state.y * 12 + (state.m - 1) + k;
  state.y = Math.floor(t / 12); state.m = (t % 12) + 1;
  render();
  listEl.scrollTop = 0;
}
$("#prevBtn").addEventListener("click", () => shiftMonth(-1));
$("#nextBtn").addEventListener("click", () => shiftMonth(1));

let tx = null, ty = null;
listEl.addEventListener("touchstart", (e) => { const t = e.touches[0]; tx = t.clientX; ty = t.clientY; }, { passive: true });
listEl.addEventListener("touchend", (e) => {
  if (tx === null) return;
  const t = e.changedTouches[0]; const dx = t.clientX - tx, dy = t.clientY - ty;
  tx = ty = null;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 45) shiftMonth(dx < 0 ? 1 : -1);
}, { passive: true });

/* ================= toast ================= */
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ================= mutations ================= */
function addExpense({ desc, amount, date, times }) {
  const n = times > 1 ? times : 0;
  const created = Date.now();
  const byKey = {};
  if (!n) {
    const it = { id: uid(), desc, amount, date, paid: false, createdAt: created };
    (byKey[keyOf(date)] = byKey[keyOf(date)] || []).push(it);
  } else {
    const sid = uid();
    const day = Number(date.slice(8, 10));
    for (let i = 0; i < n; i++) {
      const d = addMonths(date, i, day);
      const it = { id: uid(), desc, amount, date: d, paid: false, createdAt: created + i, sid, si: i + 1, sn: n };
      (byKey[keyOf(d)] = byKey[keyOf(d)] || []).push(it);
    }
  }
  Object.keys(byKey).forEach((k) => Store.put(k, [...Store.items(k), ...byKey[k]]));
}

function updateExpense(orig, { desc, amount, date }, applyNext) {
  const oldKey = keyOf(orig.date), newKey = keyOf(date);
  const updated = { ...orig, desc, amount, date };
  if (oldKey === newKey) {
    Store.put(oldKey, Store.items(oldKey).map((x) => (x.id === orig.id ? updated : x)));
  } else {
    Store.put(oldKey, Store.items(oldKey).filter((x) => x.id !== orig.id));
    Store.put(newKey, [...Store.items(newKey), updated]);
  }
  if (applyNext && orig.sid) {
    Store.keys().forEach((k) => {
      const list = Store.items(k);
      if (list.some((x) => x.sid === orig.sid && x.si > orig.si)) {
        Store.put(k, list.map((x) => (x.sid === orig.sid && x.si > orig.si ? { ...x, desc, amount } : x)));
      }
    });
  }
}

function setPaid(item, paid) {
  const k = keyOf(item.date);
  Store.put(k, Store.items(k).map((x) => (x.id === item.id ? { ...x, paid } : x)));
}

function removeExpense(item, andNext) {
  if (!andNext || !item.sid) {
    const k = keyOf(item.date);
    Store.put(k, Store.items(k).filter((x) => x.id !== item.id));
    return 1;
  }
  let count = 0;
  Store.keys().forEach((k) => {
    const list = Store.items(k);
    const keep = list.filter((x) => !(x.sid === item.sid && x.si >= item.si));
    if (keep.length !== list.length) { count += list.length - keep.length; Store.put(k, keep); }
  });
  return count;
}

/* ================= sheet ================= */
const scrim = $("#scrim"), sheet = $("#sheet");
let lastFocus = null;
function openSheet(html) {
  lastFocus = document.activeElement;
  sheet.innerHTML = `<div class="grab" aria-hidden="true"></div>${html}`;
  scrim.hidden = false;
  const first = sheet.querySelector("button");
  if (first) first.focus({ preventScroll: true });
}
function closeSheet() {
  if (scrim.hidden) return;
  scrim.hidden = true; sheet.innerHTML = "";
  if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}
scrim.addEventListener("click", (e) => { if (e.target === scrim) closeSheet(); });

function itemHead(it) {
  return `<div class="sheet-head">
    <h3 class="sheet-title" id="sheetTitle">${esc(it.desc)}${esc(suffix(it))}</h3>
    <p class="sheet-sub">${fmtDate(it.date)} · ${money(it.amount)} · ${it.paid ? "Paga" : "A pagar"}</p>
  </div>`;
}

function openItemSheet(id) {
  const it = Store.find(id);
  if (!it) return;
  openSheet(`${itemHead(it)}
    <div class="sheet-actions">
      <button type="button" class="act ${it.paid ? "" : "good"}" data-act="pay">${it.paid ? ICON.undo + "Marcar como não paga" : ICON.check + "Marcar como paga"}</button>
      <button type="button" class="act" data-act="edit">${ICON.edit}Editar</button>
      <button type="button" class="act danger" data-act="del">${ICON.trash}Excluir</button>
      <button type="button" class="act cancel" data-act="close">Cancelar</button>
    </div>`);
  sheet.onclick = (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "close") return closeSheet();
    if (act === "pay") { setPaid(it, !it.paid); closeSheet(); render(); toast(it.paid ? "Marcada como não paga" : "Marcada como paga"); return; }
    if (act === "edit") { closeSheet(); openForm(it); return; }
    if (act === "del") return openDeleteSheet(it);
  };
}

function openDeleteSheet(it) {
  const later = it.sid ? Store.keys().reduce((s, k) => s + Store.items(k).filter((x) => x.sid === it.sid && x.si >= it.si).length, 0) : 0;
  const body = it.sid && later > 1
    ? `<p class="confirm-text">Esta despesa faz parte de uma repetição. O que você quer excluir?</p>
       <div class="sheet-actions">
         <button type="button" class="act danger" data-act="one">${ICON.trash}Excluir só esta</button>
         <button type="button" class="act danger" data-act="next">${ICON.trash}Excluir esta e as próximas (${later})</button>
         <button type="button" class="act cancel" data-act="close">Cancelar</button>
       </div>`
    : `<p class="confirm-text">Excluir esta despesa? Não dá para desfazer.</p>
       <div class="sheet-actions">
         <button type="button" class="act danger" data-act="one">${ICON.trash}Excluir</button>
         <button type="button" class="act cancel" data-act="close">Cancelar</button>
       </div>`;
  openSheet(itemHead(it) + body);
  sheet.onclick = (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "close") return closeSheet();
    const n = removeExpense(it, act === "next");
    closeSheet(); render();
    toast(n > 1 ? `${n} despesas excluídas` : "Despesa excluída");
  };
}

listEl.addEventListener("click", (e) => {
  const b = e.target.closest(".item"); if (b) openItemSheet(b.dataset.id);
});

/* ================= year summary ================= */
function openYearSheet() {
  const y = state.y;
  const rows = MONTHS_SHORT.map((label, i) => {
    const items = Store.items(keyFor(y, i + 1));
    const total = items.reduce((s, it) => s + it.amount, 0);
    const paid = items.reduce((s, it) => s + (it.paid ? it.amount : 0), 0);
    return { m: i + 1, label, total, paid };
  });
  const max = Math.max(1, ...rows.map((r) => r.total));
  const yearTotal = rows.reduce((s, r) => s + r.total, 0);
  const yearPaid = rows.reduce((s, r) => s + r.paid, 0);
  const curKey = keyFor(now.getFullYear(), now.getMonth() + 1);
  openSheet(`<div class="sheet-head">
      <h3 class="sheet-title" id="sheetTitle">Resumo de ${y}</h3>
      <p class="sheet-sub">Toque num mês para abrir.</p>
    </div>
    <div class="year-list">
      ${rows.map((r) => `<button type="button" class="year-row${keyFor(y, r.m) === curKey ? " current" : ""}" data-m="${r.m}" aria-label="${MONTHS[r.m - 1]}: ${money(r.total)}, pago ${money(r.paid)}">
        <span class="ym">${r.label}</span>
        <span class="ybar" aria-hidden="true">
          <span class="ybar-total" style="width:${(r.total / max * 100).toFixed(2)}%"></span>
          <span class="ybar-paid" style="width:${(r.paid / max * 100).toFixed(2)}%"></span>
        </span>
        <span class="yval${r.total ? "" : " zero"}">${money(r.total)}</span>
      </button>`).join("")}
    </div>
    <div class="legend"><span><i style="background:var(--paid)"></i>Pago</span><span><i style="background:var(--accent-soft)"></i>A pagar</span></div>
    <div class="year-foot">
      <div><small>Total no ano</small><b>${money(yearTotal)}</b></div>
      <div><small>Falta pagar</small><b>${money(yearTotal - yearPaid)}</b></div>
    </div>
    <div class="sheet-actions"><button type="button" class="act cancel" data-act="close">Fechar</button></div>`);
  sheet.onclick = (e) => {
    const row = e.target.closest("[data-m]");
    if (row) { state.m = Number(row.dataset.m); closeSheet(); render(); return; }
    if (e.target.closest('[data-act="close"]')) closeSheet();
  };
}

/* ================= menu ================= */
const menuLayer = $("#menuLayer"), menu = $("#menu"), menuBtn = $("#menuBtn");
function openMenu() {
  const items = monthItems();
  const allPaid = items.length > 0 && items.every((x) => x.paid);
  const isCurrent = state.y === now.getFullYear() && state.m === now.getMonth() + 1;
  menu.innerHTML = `
    <div class="menu-user"><img alt="" id="menuAvatar" referrerpolicy="no-referrer"><div><b id="menuName"></b><small id="menuEmail"></small></div></div>
    <button type="button" class="act" role="menuitem" data-act="year">${ICON.chart}Resumo do ano</button>
    ${items.length ? `<button type="button" class="act" role="menuitem" data-act="payall">${allPaid ? ICON.undo + "Desmarcar todas do mês" : ICON.checks + "Marcar todas do mês como pagas"}</button>` : ""}
    ${isCurrent ? "" : `<button type="button" class="act" role="menuitem" data-act="today">${ICON.today}Ir para o mês atual</button>`}
    <button type="button" class="act" role="menuitem" data-act="csv">${ICON.download}Exportar planilha (.csv)</button>
    <button type="button" class="act danger" role="menuitem" data-act="logout">${ICON.logout}Sair da conta</button>`;
  const u = state.user || {};
  $("#menuName").textContent = u.displayName || "Minha conta";
  $("#menuEmail").textContent = u.email || "";
  const av = $("#menuAvatar");
  if (u.photoURL) av.src = u.photoURL; else av.hidden = true;
  menuLayer.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
  const first = menu.querySelector("button"); if (first) first.focus({ preventScroll: true });
}
function closeMenu() { if (menuLayer.hidden) return; menuLayer.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
menuBtn.addEventListener("click", () => (menuLayer.hidden ? openMenu() : closeMenu()));
menuLayer.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) { if (!e.target.closest(".menu-user")) closeMenu(); return; }
  const act = b.dataset.act;
  closeMenu();
  if (act === "year") openYearSheet();
  else if (act === "today") { state.y = now.getFullYear(); state.m = now.getMonth() + 1; render(); }
  else if (act === "payall") {
    const k = keyFor(state.y, state.m);
    const list = Store.items(k);
    const allPaid = list.every((x) => x.paid);
    Store.put(k, list.map((x) => ({ ...x, paid: !allPaid })));
    render();
    toast(allPaid ? "Todas desmarcadas" : "Todas marcadas como pagas");
  }
  else if (act === "csv") exportCsv();
  else if (act === "logout") { signOut(auth).catch(() => toast("Não foi possível sair. Tente de novo.")); }
});

function exportCsv() {
  const all = Store.keys().flatMap((k) => Store.items(k)).sort(byDate);
  if (!all.length) { toast("Ainda não há despesas para exportar."); return; }
  const cell = (v) => { const s = String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [["Data", "Descrição", "Valor", "Situação"]].concat(
    all.map((it) => [fmtDate(it.date), it.desc + suffix(it), (it.amount / 100).toFixed(2).replace(".", ","), it.paid ? "Paga" : "A pagar"])
  );
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = "minhas-financas.csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ================= form ================= */
const formScreen = $("#formScreen"), form = $("#expForm");
const fDesc = $("#fDesc"), fAmount = $("#fAmount"), fDate = $("#fDate"), fRepeat = $("#fRepeat"), fTimes = $("#fTimes");
const repeatBox = $("#repeatBox"), repeatRow = $("#repeatRow"), applyNextRow = $("#applyNextRow"), fApplyNext = $("#fApplyNext");
const formError = $("#formError");
let editing = null;
let cents = 0;

function setAmount(c) {
  cents = Math.max(0, Math.min(c, 99999999999));
  fAmount.value = cents ? money(cents) : "";
}
fAmount.addEventListener("input", () => {
  const digits = fAmount.value.replace(/\D/g, "").slice(0, 11);
  setAmount(parseInt(digits || "0", 10));
  updateRepeatHint();
});

function setRepeat(on) {
  fRepeat.setAttribute("aria-checked", on ? "true" : "false");
  repeatBox.hidden = !on;
  updateRepeatHint();
}
fRepeat.addEventListener("click", () => setRepeat(fRepeat.getAttribute("aria-checked") !== "true"));

function clampTimes(v) { v = parseInt(v, 10); if (!Number.isFinite(v)) v = 2; return Math.max(2, Math.min(120, v)); }
function updateRepeatHint() {
  const n = clampTimes(fTimes.value);
  $("#repeatHint").textContent = `Cria uma despesa por mês com o mesmo valor, numeradas 1/${n}, 2/${n}…` + (cents ? ` Total: ${money(cents * n)}.` : "");
}
$("#timesMinus").addEventListener("click", () => { fTimes.value = Math.max(2, clampTimes(fTimes.value) - 1); updateRepeatHint(); });
$("#timesPlus").addEventListener("click", () => { fTimes.value = Math.min(120, clampTimes(fTimes.value) + 1); updateRepeatHint(); });
fTimes.addEventListener("input", updateRepeatHint);
fTimes.addEventListener("blur", () => { fTimes.value = clampTimes(fTimes.value); updateRepeatHint(); });

function defaultDate() {
  const t = todayISO();
  if (keyOf(t) === keyFor(state.y, state.m)) return t;
  const day = Math.min(now.getDate(), daysIn(state.y, state.m));
  return `${state.y}-${pad(state.m)}-${pad(day)}`;
}

function openForm(item) {
  editing = item || null;
  formError.hidden = true;
  $("#formTitle").textContent = editing ? "Editar despesa" : "Nova despesa";
  fDesc.value = editing ? editing.desc : "";
  setAmount(editing ? editing.amount : 0);
  fDate.value = editing ? editing.date : defaultDate();
  fTimes.value = 2;
  setRepeat(false);
  repeatRow.hidden = !!editing;
  const hasNext = !!(editing && editing.sid && editing.si < editing.sn);
  applyNextRow.hidden = !hasNext;
  fApplyNext.checked = false;
  if (hasNext) $("#applyNextText").textContent = `Aplicar descrição e valor também às próximas parcelas (${editing.si + 1}/${editing.sn} em diante)`;
  formScreen.hidden = false;
  if (!editing) setTimeout(() => fDesc.focus(), 60);
}
function closeForm() { formScreen.hidden = true; editing = null; }
$("#formBack").addEventListener("click", closeForm);
$("#addBtn").addEventListener("click", () => openForm(null));
fDesc.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fAmount.focus(); } });

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const desc = fDesc.value.trim().replace(/\s+/g, " ");
  const date = fDate.value;
  let msg = "";
  if (!desc) msg = "Escreva uma descrição.";
  else if (!cents) msg = "Informe o valor da despesa.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) msg = "Escolha a data.";
  if (msg) { formError.textContent = msg; formError.hidden = false; return; }

  const repeatOn = !editing && fRepeat.getAttribute("aria-checked") === "true";
  const times = repeatOn ? clampTimes(fTimes.value) : 0;
  if (editing) {
    const orig = Store.find(editing.id) || editing;
    updateExpense(orig, { desc, amount: cents, date }, fApplyNext.checked && !applyNextRow.hidden);
    toast("Despesa atualizada");
  } else {
    addExpense({ desc, amount: cents, date, times });
    toast(times ? `${times} despesas criadas` : "Despesa salva");
  }
  const [y, m] = date.split("-").map(Number);
  state.y = y; state.m = m;
  closeForm();
  render();
});

/* ================= keyboard ================= */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!menuLayer.hidden) { closeMenu(); menuBtn.focus(); return; }
  if (!scrim.hidden) { closeSheet(); return; }
  if (!formScreen.hidden) closeForm();
});

/* ================= start ================= */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
render();
boot();
