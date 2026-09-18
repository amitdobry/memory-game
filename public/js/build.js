// ---------------------------------------------------------------------------
// The workbench: game on one side, AI + control panel on the other.
//
// One rule runs the whole screen: applyConfig() is the ONLY way the game
// changes. The AI, the control panel, undo and reset all go through it, so
// every path is saved, undoable and visible in the code tab.
// ---------------------------------------------------------------------------
import { createGame } from "./game.js";
import { requestChange, requestBanter, unlock, getGrant, clearGrant } from "./api.js";
import { createFirekeeper, runOnboarding } from "./firekeeper.js";
import { userById } from "./users.js";
import {
  FIELDS,
  GROUPS,
  STARTER_CONFIG,
  sanitize,
  diff,
  displayValue,
} from "./schema.js";
import {
  loadConfig,
  saveConfig,
  pushHistory,
  popHistory,
  loadHistory,
  shareUrl,
} from "./storage.js";

// --- who is this? -----------------------------------------------------------

const user = userById(new URLSearchParams(location.search).get("u"));
if (!user) {
  // No child by that id: back to the picker. The picker lives at workshop.html now —
  // index.html is the public landing page, which would be a confusing place to land a
  // child who mistyped a link.
  location.replace("workshop.html");
  // The page is leaving. A module has no `return`, and letting the rest of this file
  // run would throw on `user.avatar` and litter the console on the way out — so wait
  // on a promise that never settles instead.
  await new Promise(() => {});
}

document.getElementById("avatar").src = `avatars/${user.avatar}`;
document.getElementById("who").textContent = user.name;
document.documentElement.style.setProperty("--shell-accent", user.color);

const avatars = await fetch("avatars/manifest.json").then((r) => r.json());

// --- state ------------------------------------------------------------------

let config = loadConfig(user.id);
let lastChanges = [];
let game = null;
const chatHistory = [];

// Declared up here because the intro reads it before the door section runs.
let locked = getGrant() === null;

const gameRoot = document.getElementById("game");
const log = document.getElementById("log");

// The host of the whole session. Everything the AI says comes out of his mouth.
const keeper = createFirekeeper(document.getElementById("keeper"));
keeper.say(`היי ${user.name}! מה נשנה במשחק?`);

function renderGame() {
  game?.destroy();
  game = createGame(gameRoot, config, {
    avatars,
    me: { name: user.name, avatar: user.avatar },
    speak: requestBanter,
    onFace: (face) => keeper.face(face),
    onRename: (key, value) => applyConfig({ ...config, [key]: value }),
  });
  document.title = config.title;
}

/**
 * The single entry point for changing the game.
 * @param {object} next        the new config (will be sanitized)
 * @param {object} options     {record: false} skips the undo stack (used by undo itself)
 */
function applyConfig(next, { record = true } = {}) {
  const { config: clean } = sanitize(next, { avatarCount: avatars.length });
  if (record) pushHistory(user.id, config);
  lastChanges = diff(config, clean);
  config = clean;
  saveConfig(user.id, config);
  renderGame();
  renderSettings();
  renderCode();
  refreshUndo();
}

renderGame();

// --- tabs -------------------------------------------------------------------

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    for (const other of document.querySelectorAll(".tab")) {
      const on = other === tab;
      other.setAttribute("aria-selected", String(on));
      document.getElementById(`panel-${other.dataset.panel}`).hidden = !on;
    }
  });
}

// ===========================================================================
// 1. The AI panel
// ===========================================================================

const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const passwordInput = document.getElementById("password");

const IDEAS = [
  "תעשה לי לוח 6 על 6",
  "אני רוצה 30 שניות בלבד",
  "תחליף לערכת נושא של חלל",
  "תוסיף ניקוד ותראה אותו",
  "שהמשחק יהיה קשה יותר תוך כדי",
  "כשאני מנצח תכתוב משהו מצחיק",
];

const ideasBox = document.getElementById("ideas");
for (const idea of IDEAS) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "idea";
  chip.textContent = idea;
  chip.addEventListener("click", () => {
    input.value = idea;
    input.focus();
  });
  ideasBox.append(chip);
}

function addMessage(kind, text) {
  const node = document.createElement("div");
  node.className = `msg msg--${kind}`;
  node.textContent = text;
  log.append(node);
  log.scrollTop = log.scrollHeight;
  return node;
}

/** Show exactly what moved, so the child can check the AI's work. */
function addChangeList(node, changes) {
  if (!changes.length) return;
  const box = document.createElement("div");
  box.className = "msg__changes";
  for (const change of changes) {
    const row = document.createElement("div");
    row.className = "msg__change";
    row.append(Object.assign(document.createElement("b"), { textContent: change.label + ":" }));
    row.append(
      Object.assign(document.createElement("span"), {
        className: "msg__from",
        textContent: displayValue(change.key, change.from),
      }),
    );
    row.append(Object.assign(document.createElement("span"), { textContent: "←" }));
    row.append(
      Object.assign(document.createElement("span"), {
        className: "msg__to",
        textContent: displayValue(change.key, change.to),
      }),
    );
    box.append(row);
  }
  node.append(box);

  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "btn btn--ghost btn--small msg__undo";
  undo.textContent = "לא אהבתי — תחזיר";
  undo.addEventListener("click", () => {
    undoLast();
    undo.remove();
  });
  node.append(undo);
  log.scrollTop = log.scrollHeight;
}

/*
  First visit gets the intro; after that he just waits.

  Kept per child rather than per browser, so two children sharing a laptop each get
  their own first time — and so an instructor can replay it from the top bar.
*/
const INTRO_KEY = `workshop:intro:${user.id}`;

async function showIntro() {
  await runOnboarding(document.body, {
    onStep: (_, step) => keeper.face(step.face),
  });
  try {
    localStorage.setItem(INTRO_KEY, "done");
  } catch {
    /* a browser with storage blocked simply sees the intro again */
  }
  // The intro ends where the child actually is: at the door if it is still shut,
  // at the game if it is already open. Otherwise its closing line overwrites the
  // password prompt and the child is told to start typing wishes at a locked app.
  if (locked) askForPassword();
  else {
    keeper.face("warm");
    keeper.say(`קדימה ${user.name} — מה נשנה קודם?`);
  }
  input.focus();
}

document.getElementById("help").addEventListener("click", showIntro);

try {
  if (!localStorage.getItem(INTRO_KEY)) showIntro();
} catch {
  /* ignore */
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  // A password is not chat: it is never echoed into the log, never kept in the
  // history that later travels to the model, and never left sitting in the field.
  if (locked) {
    const secret = passwordInput.value.trim();
    if (!secret) return;
    passwordInput.value = "";
    sendBtn.disabled = true;
    await handleLocked(secret);
    sendBtn.disabled = false;
    if (locked) passwordInput.focus();
    return;
  }

  const message = input.value.trim();
  if (!message) return;

  addMessage("kid", message);
  input.value = "";
  input.style.height = "auto";
  sendBtn.disabled = true;

  keeper.face("ambient");
  keeper.say("רגע, חושב…");

  const typing = document.createElement("div");
  typing.className = "typing";
  typing.innerHTML = "<span></span><span></span><span></span>";
  log.append(typing);
  log.scrollTop = log.scrollHeight;

  try {
    const data = await requestChange({ message, config, history: chatHistory.slice(-12) });
    typing.remove();

    keeper.face(data.face);
    keeper.say(data.reply);
    const bubble = addMessage("ai", data.reply);
    chatHistory.push({ role: "user", content: message });
    chatHistory.push({ role: "assistant", content: data.reply });

    const changes = diff(config, sanitize(data.config, { avatarCount: avatars.length }).config);
    if (changes.length) {
      applyConfig(data.config);
      addChangeList(bubble, lastChanges);
    }
    for (const note of data.notes ?? []) addMessage("system", note);
  } catch (error) {
    typing.remove();
    if (error.status === 401 || error.status === 403) {
      clearGrant();
      addMessage("error", error.message);
      askForPassword();
    } else {
      keeper.face("concerned");
      const trouble = error.message ?? "לא הצלחתי להגיע ל-AI. אולי אין אינטרנט? תנסו שוב.";
      keeper.say(trouble);
      addMessage("error", trouble);
    }
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});

// Enter sends, Shift+Enter makes a new line. Textarea grows with the text.
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
});

// ===========================================================================
// 2. The control panel (admin area)
// ===========================================================================

const settingsRoot = document.getElementById("settings");

function renderSettings() {
  settingsRoot.innerHTML = "";

  for (const group of GROUPS) {
    const fields = FIELDS.filter((f) => f.group === group.key);
    if (!fields.length) continue;

    const section = document.createElement("div");
    section.className = "settings__group";
    section.append(
      Object.assign(document.createElement("div"), {
        className: "settings__legend",
        textContent: group.label,
      }),
    );
    for (const field of fields) section.append(renderField(field));
    settingsRoot.append(section);
  }
}

function renderField(field) {
  const wrap = document.createElement("div");
  wrap.className = field.type === "bool" ? "field field--check" : "field";
  const id = `f-${field.key}`;

  const label = document.createElement("label");
  label.className = "field__label";
  label.htmlFor = id;
  label.textContent = field.label;

  const change = (value) => applyConfig({ ...config, [field.key]: value });

  if (field.type === "bool") {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = id;
    box.checked = Boolean(config[field.key]);
    box.addEventListener("change", () => change(box.checked));
    wrap.append(box, label);
    return wrap;
  }

  wrap.append(label);
  if (field.help) {
    wrap.append(
      Object.assign(document.createElement("span"), {
        className: "field__help",
        textContent: field.help,
      }),
    );
  }

  if (field.type === "int") {
    const row = document.createElement("div");
    row.className = "field__row";
    const range = document.createElement("input");
    range.type = "range";
    range.id = id;
    range.min = field.min;
    range.max = field.max;
    range.step = field.key === "flipBackMs" ? 100 : 1;
    range.value = config[field.key];
    const value = Object.assign(document.createElement("span"), {
      className: "field__value",
      textContent: String(config[field.key]),
    });
    range.addEventListener("input", () => (value.textContent = range.value));
    range.addEventListener("change", () => change(Number(range.value)));
    row.append(range, value);
    wrap.append(row);
    return wrap;
  }

  if (field.type === "enum") {
    const select = document.createElement("select");
    select.id = id;
    for (const option of field.options) {
      select.append(new Option(option.label, option.value, false, option.value === config[field.key]));
    }
    select.addEventListener("change", () => change(select.value));
    wrap.append(select);
    return wrap;
  }

  const text = document.createElement("input");
  text.type = "text";
  text.id = id;
  text.value = field.type === "list" ? config[field.key].join(" ") : config[field.key];
  text.addEventListener("change", () => {
    change(field.type === "list" ? [...text.value.replace(/\s+/g, "")] : text.value);
  });
  wrap.append(text);
  return wrap;
}

renderSettings();

// ===========================================================================
// 3. The code view — "this is what the AI actually wrote"
// ===========================================================================

const codeRoot = document.getElementById("code");

function renderCode() {
  const changed = new Set(lastChanges.map((c) => c.key));
  codeRoot.innerHTML = "";

  codeRoot.append(document.createTextNode("{\n"));
  const keys = FIELDS.map((f) => f.key);
  keys.forEach((key, i) => {
    const line = `  "${key}": ${JSON.stringify(config[key])}${i < keys.length - 1 ? "," : ""}\n`;
    if (changed.has(key)) {
      codeRoot.append(Object.assign(document.createElement("b"), { textContent: line }));
    } else {
      codeRoot.append(document.createTextNode(line));
    }
  });
  codeRoot.append(document.createTextNode("}"));
}

renderCode();

// ===========================================================================
// 4. Undo / reset / share
// ===========================================================================

const undoBtn = document.getElementById("undo");

function refreshUndo() {
  undoBtn.disabled = loadHistory(user.id).length === 0;
}

function undoLast() {
  const previous = popHistory(user.id);
  if (!previous) return;
  applyConfig(previous, { record: false });
  addMessage("system", "החזרתי את המשחק למה שהיה לפני השינוי האחרון.");
}

undoBtn.addEventListener("click", undoLast);
refreshUndo();

/*
  This button was called "להתחיל מהתחלה" and sat one row above "משחק חדש". Both
  read as "start again" to a ten-year-old; only one of them throws away an hour of
  their work. A child pressed it expecting a fresh round and watched their game go
  back to grey.

  Three things changed. It says what it destroys. It looks dangerous. And it is
  now undoable — it used to clear the history FIRST, so the one button that could
  have saved them was disarmed by the button that hurt them.
*/
document.getElementById("reset").addEventListener("click", () => {
  const changes = diff(STARTER_CONFIG, config).length;
  if (changes === 0) {
    addMessage("system", "המשחק כבר במצב ההתחלתי.");
    return;
  }
  const ok = confirm(
    `למחוק את ${changes} השינויים שעשיתם ולחזור למשחק האפור הבסיסי?

` +
      `אם רק רציתם לשחק סיבוב חדש — סגרו את זה ולחצו על "משחק חדש" מתחת ללוח.`,
  );
  if (!ok) return;

  // Recorded, so "בטל שינוי אחרון" brings the whole game back.
  applyConfig({ ...STARTER_CONFIG });
  addMessage("system", "מחקתי הכל וחזרנו למשחק הבסיסי. אפשר לבטל עם ״בטל שינוי אחרון״.");
});

const dialog = document.getElementById("shareDialog");
const linkInput = document.getElementById("shareLink");

document.getElementById("share").addEventListener("click", async () => {
  const url = shareUrl(config, user.name);
  document.getElementById("shareName").textContent = user.name;
  linkInput.value = url;
  dialog.showModal();
  await drawQR(url);
});

document.getElementById("closeShare").addEventListener("click", () => dialog.close());
document.getElementById("copyLink").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(linkInput.value);
    document.getElementById("copyLink").textContent = "הועתק!";
    setTimeout(() => (document.getElementById("copyLink").textContent = "העתקת הקישור"), 1500);
  } catch {
    linkInput.select();
  }
});

// The QR library is a nice-to-have loaded on demand. If it cannot load, the
// link itself still works — sharing never depends on it.
let qrLoader = null;
function loadQRLibrary() {
  qrLoader ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  return qrLoader;
}

async function drawQR(url) {
  const box = document.getElementById("qr");
  box.innerHTML = "";
  try {
    await loadQRLibrary();
    new window.QRCode(box, {
      text: url,
      width: 220,
      height: 220,
      correctLevel: window.QRCode.CorrectLevel.L,
    });
  } catch {
    box.style.display = "none";
  }
}

// ===========================================================================
// 5. The door
//
// There is no login screen. The Firekeeper simply asks for the password in the
// same box the child will use for everything else, and the first thing they type
// goes to /unlock instead of to the AI.
//
// That is the whole design: a ten-year-old who has just been told "type what you
// want and it happens" should not first meet a form. They meet a character who
// asks them a question.
// ===========================================================================

function askForPassword() {
  locked = true;
  keeper.face("ambient");
  keeper.say("לפני שמתחילים — מה הסיסמה?");
  input.hidden = true;
  passwordInput.hidden = false;
  passwordInput.value = "";
  passwordInput.focus();
}

function opened() {
  locked = false;
  passwordInput.hidden = true;
  passwordInput.value = "";
  input.hidden = false;
  keeper.face("warm");
  keeper.say(`נכנסת! מה נשנה במשחק, ${user.name}?`);
  input.focus();
}

/** @returns true when the message was a password attempt and is now handled. */
async function handleLocked(message) {
  if (!locked) return false;

  try {
    await unlock(message);
    addMessage("system", "הסיסמה התקבלה. אפשר להתחיל.");
    opened();
  } catch (error) {
    keeper.face("concerned");
    const why = error.message ?? "הסיסמה לא נכונה.";
    keeper.say(why);
    addMessage("error", why);
  }
  return true;
}

if (locked) askForPassword();
else opened();
