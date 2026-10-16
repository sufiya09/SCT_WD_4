const KEY = "taskflow-v1";
const COLORS = ["#1d7a74", "#c28a2c", "#b95a52", "#5b7fa6", "#7b6a9c", "#6f8f4e"];
const RANK = { high: 0, medium: 1, low: 2 };
const LABEL = { high: "High", medium: "Medium", low: "Low" };

let state, filter = "all", query = "", editingId = null, deleted = null, timer;

const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Data ---------- */
function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) { state = JSON.parse(s); return; }
  } catch (e) {}
  state = {
    theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    current: "all", sort: "due",
    lists: [
      { id: uid(), name: "Personal", color: COLORS[0] },
      { id: uid(), name: "Work", color: COLORS[1] }
    ],
    tasks: []
  };
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

/* ---------- Helpers ---------- */
const getList = id => state.lists.find(l => l.id === id);
const scoped = () => state.tasks.filter(t => state.current === "all" || t.listId === state.current);
const due = t => t.date ? new Date(t.date + "T" + (t.time || "23:59")) : null;
const cmpDue = (a, b) => { const x = due(a), y = due(b); return x && y ? x - y : x ? -1 : y ? 1 : 0; };

function fmt(t) {
  let s = new Date(t.date + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  if (t.time) s += ", " + new Date(t.date + "T" + t.time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return s;
}
function status(t) {
  if (t.done || !t.date) return "";
  const d = due(t), n = new Date();
  if (d < n) return "over";
  if (d.toDateString() === n.toDateString()) return "today";
  return "";
}
function visible() {
  let ts = scoped();
  if (filter === "active") ts = ts.filter(t => !t.done);
  if (filter === "done") ts = ts.filter(t => t.done);
  if (query) ts = ts.filter(t => (t.title + " " + t.desc).toLowerCase().includes(query));
  return ts.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (state.sort === "priority") return RANK[a.priority] - RANK[b.priority] || cmpDue(a, b);
    if (state.sort === "newest") return b.created - a.created;
    return cmpDue(a, b) || RANK[a.priority] - RANK[b.priority];
  });
}

/* ---------- Drawing ---------- */
function render() {
  document.documentElement.setAttribute("data-theme", state.theme);
  $("themeBtn").textContent = state.theme === "dark" ? "☀ Light mode" : "☾ Dark mode";
  $("sort").value = state.sort;

  // Sidebar lists
  const open = state.tasks.filter(t => !t.done).length;
  $("lists").innerHTML =
    `<li><button class="li" data-list="all" aria-current="${state.current === "all"}">
       <span class="dot"></span><span class="name">All tasks</span><span class="cnt">${open}</span></button></li>` +
    state.lists.map(l => {
      const n = state.tasks.filter(t => t.listId === l.id && !t.done).length;
      return `<li><button class="li" data-list="${l.id}" aria-current="${state.current === l.id}">
        <span class="dot" style="--c:${l.color}"></span><span class="name">${esc(l.name)}</span><span class="cnt">${n}</span></button></li>`;
    }).join("");

  // Header
  const cur = getList(state.current), all = scoped();
  $("listTitle").textContent = cur ? cur.name : "All tasks";
  $("listSub").innerHTML = cur
    ? `<button class="link" id="renList">Rename list</button><button class="link" id="delList">Delete list</button>`
    : "Everything across your lists";

  // Stats
  const done = all.filter(t => t.done).length;
  const today = all.filter(t => status(t) === "today").length;
  const over = all.filter(t => status(t) === "over").length;
  $("stats").innerHTML =
    `<div class="stat"><b>${all.length}</b><span>Total tasks</span></div>
     <div class="stat ok"><b>${done}</b><span>Completed</span></div>
     <div class="stat"><b>${today}</b><span>Due today</span></div>
     <div class="stat over"><b>${over}</b><span>Overdue</span></div>`;

  // Filter tabs
  $("tabs").innerHTML = [["all", "All"], ["active", "To do"], ["done", "Completed"]]
    .map(([f, l]) => `<button data-f="${f}" aria-pressed="${filter === f}">${l}</button>`).join("");

  // Tasks
  const ts = visible();
  if (!ts.length) {
    $("tasks").innerHTML = `<div class="empty">${query ? "No tasks match your search."
      : filter === "done" ? "Nothing completed yet." : "No tasks here yet. Click “New task” to add one."}</div>`;
    return;
  }
  $("tasks").innerHTML = ts.map(t => {
    const l = getList(t.listId) || { name: "", color: COLORS[0] };
    const s = status(t);
    let chips = "";
    if (t.date) chips += `<span class="chip ${s}">${s === "over" ? "Overdue: " : s === "today" ? "Due today: " : ""}${esc(fmt(t))}</span>`;
    if (state.current === "all") chips += `<span class="chip list" style="--c:${l.color}">${esc(l.name)}</span>`;
    return `<article class="task ${t.priority}${t.done ? " done" : ""}" data-id="${t.id}">
      <input type="checkbox" class="chk" data-act="toggle" ${t.done ? "checked" : ""} aria-label="Mark complete">
      <div class="tbody">
        <div class="trow"><h3 class="ttitle">${esc(t.title)}</h3><span class="pri ${t.priority}">${LABEL[t.priority]}</span></div>
        ${t.desc ? `<p class="tdesc" data-act="expand" title="Click to expand">${esc(t.desc)}</p>` : ""}
        ${chips ? `<div class="meta">${chips}</div>` : ""}
      </div>
      <div class="acts">
        <button class="btn ghost sm" data-act="edit">Edit</button>
        <button class="btn ghost sm" data-act="del">Delete</button>
      </div></article>`;
  }).join("");
}

/* ---------- New / Edit window ---------- */
function openDlg(t) {
  if (!state.lists.length) { toast("Create a list first"); return; }
  editingId = t ? t.id : null;
  $("dlgTitle").textContent = t ? "Edit task" : "New task";
  $("tTitle").value = t ? t.title : "";
  $("tDesc").value = t ? t.desc : "";
  document.querySelector(`input[name="pri"][value="${t ? t.priority : "medium"}"]`).checked = true;
  $("tDate").value = t ? t.date : "";
  $("tTime").value = t ? t.time : "";
  $("tList").innerHTML = state.lists.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join("");
  $("tList").value = t ? t.listId : (state.current !== "all" ? state.current : state.lists[0].id);
  $("dlg").showModal();
  $("tTitle").focus();
}
$("taskForm").onsubmit = e => {
  e.preventDefault();
  const title = $("tTitle").value.trim();
  if (!title) return;
  const d = $("tDate").value;
  const data = {
    title, desc: $("tDesc").value.trim(),
    priority: document.querySelector('input[name="pri"]:checked').value,
    date: d, time: d ? $("tTime").value : "", listId: $("tList").value
  };
  if (editingId) Object.assign(state.tasks.find(t => t.id === editingId), data);
  else state.tasks.push({ id: uid(), done: false, created: Date.now(), ...data });
  $("dlg").close(); save(); render();
};
$("cancelBtn").onclick = () => $("dlg").close();
$("dlg").addEventListener("click", e => { if (e.target === $("dlg")) $("dlg").close(); });

/* ---------- Toast with Undo ---------- */
function toast(msg, undo) {
  const t = $("toast");
  t.innerHTML = `<span>${msg}</span>` + (undo ? `<button id="undo">Undo</button>` : "");
  t.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove("show"), 5000);
}

/* ---------- Controls ---------- */
$("newTask").onclick = () => openDlg(null);
$("themeBtn").onclick = () => { state.theme = state.theme === "dark" ? "light" : "dark"; save(); render(); };
$("search").oninput = e => { query = e.target.value.trim().toLowerCase(); render(); };
$("sort").onchange = e => { state.sort = e.target.value; save(); render(); };
$("listForm").onsubmit = e => {
  e.preventDefault();
  const n = $("newList").value.trim();
  if (!n) return;
  const id = uid();
  state.lists.push({ id, name: n, color: COLORS[state.lists.length % COLORS.length] });
  state.current = id; $("newList").value = "";
  save(); render();
};
$("clearDone").onclick = () => {
  const n = state.tasks.filter(t => t.done).length;
  if (!n) { toast("No completed tasks to clear"); return; }
  if (confirm(`Remove ${n} completed task(s)?`)) {
    state.tasks = state.tasks.filter(t => !t.done); save(); render();
  }
};

/* ---------- Clicks inside lists and tasks ---------- */
document.addEventListener("click", e => {
  let b = e.target.closest("[data-list]");
  if (b) { state.current = b.dataset.list; save(); render(); return; }
  b = e.target.closest("[data-f]");
  if (b) { filter = b.dataset.f; render(); return; }

  if (e.target.id === "renList") {
    const cur = getList(state.current), n = prompt("Rename list", cur.name);
    if (n && n.trim()) { cur.name = n.trim(); save(); render(); }
    return;
  }
  if (e.target.id === "delList") {
    if (confirm(`Delete "${getList(state.current).name}" and all its tasks?`)) {
      const id = state.current;
      state.lists = state.lists.filter(l => l.id !== id);
      state.tasks = state.tasks.filter(t => t.listId !== id);
      state.current = "all"; save(); render();
    }
    return;
  }
  if (e.target.id === "undo") {
    if (deleted) { state.tasks.push(deleted); deleted = null; save(); render(); }
    $("toast").classList.remove("show");
    return;
  }

  const a = e.target.closest("[data-act]");
  if (!a) return;
  if (a.dataset.act === "expand") { a.classList.toggle("open"); return; }
  const card = a.closest("[data-id]");
  const t = card && state.tasks.find(x => x.id === card.dataset.id);
  if (!t) return;

  if (a.dataset.act === "toggle") t.done = a.checked;
  else if (a.dataset.act === "edit") { openDlg(t); return; }
  else if (a.dataset.act === "del") {
    deleted = t;
    state.tasks = state.tasks.filter(x => x !== t);
    toast("Task deleted", true);
  }
  save(); render();
});

/* ---------- Start ---------- */
load();
render();