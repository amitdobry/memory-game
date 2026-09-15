// ---------------------------------------------------------------------------
// The memory-match engine — part of the 75% we prepare.
//
// Three modes share one engine:
//   solo    — one player against the clock
//   claude  — turn-based against the AI opponent (public/js/opponent.js)
//   friend  — turn-based, two humans on the same screen
//
// It reads a config object and never writes one. Everything a child can change
// arrives here as plain data, so the same engine runs every child's version.
// ---------------------------------------------------------------------------
import { CARD_SETS } from "./schema.js";
import { createOpponent } from "./opponent.js";

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Short beeps generated on the fly — no audio files to load or fail.
function makeBeeper() {
  let ctx = null;
  return (freq, ms = 120, type = "sine") => {
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + ms / 1000);
    } catch {
      /* sound is a nice-to-have; never let it break the game */
    }
  };
}

/**
 * Mount a playable game inside `root`.
 *
 * @param {HTMLElement} root
 * @param {object} config
 * @param {object} options
 * @param {Array}  options.avatars   the avatar manifest
 * @param {object} options.me        {name, avatar} of the child who owns this game
 * @param {Function} options.speak   async (event) => {line, face} — Claude's voice.
 *                                   Optional: without it a local line bank is used.
 * @param {Function} options.onFace  called with the expression Claude chose, so the
 *                                   Firekeeper elsewhere on the page can react too.
 */
export function createGame(root, config, { avatars = [], me = null, speak = null, onFace = null } = {}) {
  const beep = makeBeeper();
  const isTurnBased = config.mode === "claude" || config.mode === "friend";
  const opponent =
    config.mode === "claude" ? createOpponent({ skill: config.claudeSkill }) : null;

  let timerId = null;
  let pendingTimeouts = [];
  let state = null;
  let destroyed = false;

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    pendingTimeouts.push(id);
    return id;
  };

  // --- deck ----------------------------------------------------------------

  function faces(count) {
    if (config.cardSet === "avatars") {
      return shuffle(avatars).slice(0, count).map((a) => ({ type: "image", value: a.file }));
    }
    const pool =
      config.cardSet === "custom"
        ? config.customSymbols
        : (CARD_SETS[config.cardSet]?.symbols ?? []);
    return shuffle(pool).slice(0, count).map((s) => ({ type: "emoji", value: s }));
  }

  function makePlayers() {
    if (config.mode === "claude") {
      return [
        { name: me?.name ?? "אני", avatar: me?.avatar ?? null, emoji: "🙂", score: 0, isAI: false },
        { name: "קלוד", avatar: null, emoji: "🤖", score: 0, isAI: true },
      ];
    }
    if (config.mode === "friend") {
      return [
        { name: "שחקן 1", avatar: null, emoji: "🔵", score: 0, isAI: false },
        { name: "שחקן 2", avatar: null, emoji: "🔴", score: 0, isAI: false },
      ];
    }
    return [{ name: me?.name ?? "אני", avatar: me?.avatar ?? null, score: 0, isAI: false }];
  }

  function build() {
    const pairs = (config.cols * config.rows) / 2;
    const chosen = faces(pairs);
    const deck = shuffle(
      chosen.flatMap((face, i) => [
        { id: `${i}a`, pairId: i, face },
        { id: `${i}b`, pairId: i, face },
      ]),
    );
    state = {
      deck,
      flipped: [],
      matched: new Set(),
      players: makePlayers(),
      current: 0,
      score: 0,
      secondsLeft: config.timerSeconds,
      running: false,
      over: false,
      busy: false,
      flipBackMs: config.flipBackMs,
      tickMs: 1000,
      saidLines: [],
    };
  }

  const available = () => state.deck.filter((c) => !state.matched.has(c.id)).map((c) => c.id);
  const cardById = (id) => state.deck.find((c) => c.id === id);
  const activePlayer = () => state.players[state.current];

  // --- rendering -----------------------------------------------------------

  function render() {
    root.innerHTML = "";
    root.className = "game";
    root.dataset.theme = config.theme;
    root.dataset.mode = config.mode;

    const header = el("div", "game__header");
    header.append(el("h1", "game__title", config.title));

    const stats = el("div", "game__stats");
    if (config.showTimer && !isTurnBased) {
      stats.append(statTile("timer", "⏱", formatTime(state.secondsLeft)));
    }
    if (config.showScore && !isTurnBased) {
      stats.append(statTile("score", "⭐", String(state.score)));
    }
    stats.append(statTile("pairs", "🃏", `${state.matched.size / 2}/${state.deck.length / 2}`));
    header.append(stats);
    root.append(header);

    if (isTurnBased) root.append(renderPlayers());

    const board = el("div", "board");
    board.style.setProperty("--cols", config.cols);
    // Both are needed: the board derives its aspect ratio from them and sizes
    // itself to whatever space is left, rather than overflowing a phone.
    board.style.setProperty("--rows", config.rows);
    for (const card of state.deck) board.append(renderCard(card));
    root.append(board);

    const footer = el("div", "game__footer");
    const again = el("button", "btn btn--ghost", "משחק חדש");
    again.type = "button";
    again.addEventListener("click", restart);
    footer.append(again);
    root.append(footer);

    root.append(el("div", "overlay", ""));
  }

  function renderPlayers() {
    const bar = el("div", "players");
    state.players.forEach((player, i) => {
      const box = el("div", `player${i === state.current ? " is-turn" : ""}`);
      box.dataset.player = i;

      const face = el("div", "player__face");
      if (player.avatar) {
        const img = document.createElement("img");
        img.src = `avatars/${player.avatar}`;
        img.alt = "";
        face.append(img);
      } else {
        face.textContent = player.emoji;
      }

      const meta = el("div", "player__meta");
      meta.append(el("div", "player__name", player.name));
      meta.append(el("div", "player__score", String(player.score)));

      box.append(face, meta);
      if (player.isAI) box.append(el("div", "player__bubble", ""));
      bar.append(box);
    });
    return bar;
  }

  function renderCard(card) {
    const btn = el("button", "card");
    btn.type = "button";
    btn.dataset.id = card.id;
    btn.setAttribute("aria-label", "קלף");

    const inner = el("div", "card__inner");
    const back = el("div", "card__back", "?");
    const front = el("div", "card__front");
    if (card.face.type === "image") {
      const img = document.createElement("img");
      img.src = `avatars/${card.face.value}`;
      img.alt = "";
      img.loading = "lazy";
      front.append(img);
    } else {
      front.textContent = card.face.value;
    }
    inner.append(back, front);
    btn.append(inner);
    btn.addEventListener("click", () => onFlip(card, false));
    return btn;
  }

  const cardEl = (id) => root.querySelector(`.card[data-id="${id}"]`);

  function syncStat(name, text) {
    const node = root.querySelector(`.stat--${name} .stat__value`);
    if (node) node.textContent = text;
  }

  function syncPlayers() {
    state.players.forEach((player, i) => {
      const box = root.querySelector(`.player[data-player="${i}"]`);
      if (!box) return;
      box.classList.toggle("is-turn", i === state.current && !state.over);
      box.querySelector(".player__score").textContent = String(player.score);
    });
  }

  function syncAll() {
    syncStat("score", String(state.score));
    syncStat("pairs", `${state.matched.size / 2}/${state.deck.length / 2}`);
    syncStat("timer", formatTime(state.secondsLeft));
    if (isTurnBased) syncPlayers();
  }

  // --- play ----------------------------------------------------------------

  function onFlip(card, byAI) {
    if (destroyed || state.over || state.busy) return;
    if (state.flipped.length >= 2) return;
    if (state.matched.has(card.id) || state.flipped.some((c) => c.id === card.id)) return;
    // During Claude's turn the board belongs to Claude.
    if (!byAI && activePlayer().isAI) return;
    if (!state.running && !isTurnBased) startTimer();

    state.flipped.push(card);
    cardEl(card.id)?.classList.add("is-flipped");
    opponent?.observe(card.id, card.pairId);
    if (config.sound) beep(520, 70, "triangle");

    if (state.flipped.length === 2) resolvePair();
  }

  function resolvePair() {
    const [a, b] = state.flipped;
    state.flipped = [];
    state.busy = true;

    if (a.pairId === b.pairId) {
      state.matched.add(a.id).add(b.id);
      opponent?.forget([a.id, b.id]);
      activePlayer().score += 1;
      state.score += config.pointsPerMatch;
      for (const c of [a, b]) cardEl(c.id)?.classList.add("is-matched");
      if (config.sound) beep(880, 140, "sine");

      // Difficulty ramp: every match tightens the screws.
      if (config.difficultyRamp === "fasterFlip") {
        state.flipBackMs = Math.max(200, Math.round(state.flipBackMs * 0.85));
      } else if (config.difficultyRamp === "drainTimer" && !isTurnBased) {
        state.tickMs = Math.max(300, Math.round(state.tickMs * 0.88));
        restartTicker();
      }

      syncAll();
      const whoMatched = state.current;
      later(() => {
        state.busy = false;
        if (state.matched.size === state.deck.length) finish();
        // A match earns another turn — the classic rule.
        else if (isTurnBased) afterTurn(whoMatched, true);
      }, 350);
      return;
    }

    state.score = Math.max(0, state.score - config.penaltyPerMiss);
    syncAll();
    if (config.sound) beep(180, 160, "sawtooth");

    for (const c of [a, b]) cardEl(c.id)?.classList.add("is-wrong");
    const whoMissed = state.current;
    later(() => {
      for (const c of [a, b]) cardEl(c.id)?.classList.remove("is-flipped", "is-wrong");
      state.busy = false;
      if (isTurnBased) {
        state.current = (state.current + 1) % state.players.length;
        syncPlayers();
        afterTurn(whoMissed, false);
      }
    }, state.flipBackMs);
  }

  /** Called after every completed turn in a turn-based game. */
  function afterTurn(playerIndex, matched) {
    if (destroyed || state.over) return;
    say(playerIndex, matched);
    if (activePlayer().isAI) later(playAITurn, 700);
  }

  // --- Claude's turn -------------------------------------------------------

  async function playAITurn() {
    if (destroyed || state.over || !activePlayer().isAI) return;

    const first = opponent.chooseFirst(available());
    await wait(500);
    if (destroyed || state.over) return;
    onFlip(cardById(first), true);

    const second = opponent.chooseSecond(first, available());
    await wait(900);
    if (destroyed || state.over) return;
    onFlip(cardById(second), true);
  }

  // --- Claude's voice ------------------------------------------------------

  const FALLBACK = {
    aiMatch: ["מצאתי!", "זה שלי.", "רשמתי לעצמי את הקלף הזה מקודם.", "עוד זוג אליי."],
    aiMiss: ["אוףף, פספסתי.", "הייתי בטוח שזה שם.", "טעות שלי. תורך.", "לא נורא, אני זוכר עכשיו."],
    kidMatch: ["וואו, יפה!", "כל הכבוד, ראית את זה מהר.", "טוב, אתה רציני.", "מרשים."],
    kidMiss: ["כמעט!", "אל תדאג, קורה.", "עכשיו אתה יודע איפה זה.", "התור שלי 😄"],
  };

  function bubble(text) {
    const node = root.querySelector(".player__bubble");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("is-open", Boolean(text));
  }

  let speaking = false;
  let bubbleTimer = null;

  async function say(playerIndex, matched) {
    if (config.mode !== "claude" || !config.claudeTalks) return;
    const wasAI = state.players[playerIndex].isAI;
    const kind = wasAI ? (matched ? "aiMatch" : "aiMiss") : matched ? "kidMatch" : "kidMiss";

    // Always show a line immediately — the game never waits on the network.
    // If Claude answers in time, it replaces the canned line in place.
    const fallback = FALLBACK[kind][Math.floor(Math.random() * FALLBACK[kind].length)];
    bubble(fallback);
    clearTimeout(bubbleTimer);
    bubbleTimer = later(() => bubble(""), 4500);

    if (!speak || speaking) return;
    speaking = true;
    try {
      const scores = state.players.map((p) => `${p.name}: ${p.score}`).join(", ");
      const event =
        `מצב: ${scores}. נשארו ${(state.deck.length - state.matched.size) / 2} זוגות.\n` +
        (wasAI
          ? matched
            ? "אתה (קלוד) בדיוק מצאת זוג."
            : "אתה (קלוד) בדיוק פספסת, והתור עובר לילד."
          : matched
            ? "הילד בדיוק מצא זוג."
            : "הילד בדיוק פספס, והתור עובר אליך.");

      const { line, face } = await speak({ event, recent: state.saidLines });
      if (!destroyed && line) {
        state.saidLines.push(line);
        bubble(line);
        if (face) onFace?.(face);
        clearTimeout(bubbleTimer);
        bubbleTimer = later(() => bubble(""), 4500);
      }
    } catch {
      /* stay with the fallback line */
    } finally {
      speaking = false;
    }
  }

  // --- clock ---------------------------------------------------------------

  function startTimer() {
    state.running = true;
    restartTicker();
  }

  function restartTicker() {
    clearInterval(timerId);
    timerId = setInterval(() => {
      state.secondsLeft -= 1;
      syncStat("timer", formatTime(state.secondsLeft));
      root.querySelector(".stat--timer")?.classList.toggle("is-urgent", state.secondsLeft <= 10);
      if (state.secondsLeft <= 0) finish();
    }, state.tickMs);
  }

  // --- the end -------------------------------------------------------------

  function finish() {
    state.over = true;
    state.running = false;
    clearInterval(timerId);
    bubble("");

    const allFound = state.matched.size === state.deck.length;
    let won = allFound;
    let headline;
    let emoji;

    if (isTurnBased) {
      const [a, b] = state.players;
      if (a.score === b.score) {
        headline = "תיקו!";
        emoji = "🤝";
        won = null;
      } else {
        const winner = a.score > b.score ? a : b;
        won = !winner.isAI && winner === state.players[0];
        headline =
          config.mode === "claude"
            ? winner.isAI
              ? config.loseMessage
              : config.winMessage
            : `${winner.name} ניצח/ה!`;
        emoji = winner.isAI ? "🤖" : "🎉";
      }
    } else {
      if (won && config.speedBonus) state.score += Math.max(0, state.secondsLeft);
      headline = won ? config.winMessage : config.loseMessage;
      emoji = won ? "🎉" : "⏰";
    }

    syncAll();

    const overlay = root.querySelector(".overlay");
    overlay.innerHTML = "";
    overlay.classList.add("is-open", won ? "overlay--win" : "overlay--lose");
    overlay.append(el("div", "overlay__emoji", emoji));
    overlay.append(el("div", "overlay__title", headline));

    if (isTurnBased) {
      const line = state.players.map((p) => `${p.name} ${p.score}`).join("  —  ");
      overlay.append(el("div", "overlay__score", line));
    } else if (config.showScore) {
      overlay.append(el("div", "overlay__score", `${state.score} נקודות`));
    }

    const again = el("button", "btn", "עוד פעם");
    again.type = "button";
    again.addEventListener("click", restart);
    overlay.append(again);

    if (config.sound) {
      if (won) [660, 830, 990].forEach((f, i) => later(() => beep(f, 160), i * 140));
      else beep(140, 500, "sawtooth");
    }
  }

  function peek() {
    if (!config.peekSeconds) return;
    state.busy = true;
    for (const card of state.deck) cardEl(card.id)?.classList.add("is-flipped");
    later(() => {
      for (const card of state.deck) cardEl(card.id)?.classList.remove("is-flipped");
      state.busy = false;
    }, config.peekSeconds * 1000);
  }

  function clearTimers() {
    clearInterval(timerId);
    for (const id of pendingTimeouts) clearTimeout(id);
    pendingTimeouts = [];
  }

  function restart() {
    clearTimers();
    build();
    render();
    peek();
  }

  restart();

  return {
    restart,
    destroy() {
      destroyed = true;
      clearTimers();
      root.innerHTML = "";
    },
  };
}

// --- tiny DOM helpers ------------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statTile(name, icon, value) {
  const tile = el("div", `stat stat--${name}`);
  tile.append(el("span", "stat__icon", icon));
  tile.append(el("span", "stat__value", value));
  return tile;
}

function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : String(s);
}
