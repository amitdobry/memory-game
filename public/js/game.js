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
 * @param {Function} options.onRename (fieldKey, value) when a player renames themselves.
 */
export function createGame(
  root,
  config,
  { avatars = [], me = null, speak = null, onFace = null, onRename = null } = {},
) {
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

  /**
   * The cast for this deal, drawn fresh from the set's bank every game.
   *
   * Briefly made deterministic per config, on a misreading of "new game changes
   * my setup" — that turned out to be the reset button, and a fixed cast made
   * every round identical instead. Variety between rounds is the point: the bank
   * is much larger than any board, so the same ocean board keeps producing
   * different creatures without a single extra API call.
   */
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
        { name: config.player1Name || "שחקן 1", avatar: null, emoji: "🔵", score: 0, isAI: false, nameKey: "player1Name" },
        { name: config.player2Name || "שחקן 2", avatar: null, emoji: "🔴", score: 0, isAI: false, nameKey: "player2Name" },
      ];
    }
    return [{ name: me?.name ?? "אני", avatar: me?.avatar ?? null, score: 0, isAI: false }];
  }

  function build() {
    const players = makePlayers();
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
      players,
      current: 0,
      score: 0,
      secondsLeft: config.timerSeconds,
      running: false,
      over: false,
      busy: false,
      flipBackMs: config.flipBackMs,
      tickMs: 1000,
      saidLines: [],
      /*
        Every card ever turned face-up, by anyone.

        Global on purpose: in a two-player game a card Claude revealed is a card
        you watched. Judging your memory only on cards you turned yourself would
        let you off for forgetting everything your opponent showed you, which is
        most of the game.
      */
      seen: new Map(),
      turnStart: null,
      stats: players.map(() => ({
        luckHits: 0,
        luckExpected: 0,
        luckEvents: 0,
        knownChances: 0,
        knownHits: 0,
      })),
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

      /*
        Two children sitting at one screen are not "שחקן 1" and "שחקן 2". Tapping
        the name renames them — and because the name is a config field like every
        other, it persists, travels in the share link, and the Firekeeper can set
        it too ("תקרא לשחקן הראשון יואב").
      */
      if (player.nameKey && onRename) {
        const name = el("button", "player__name player__name--editable", player.name);
        name.type = "button";
        name.title = "לחצו כדי לשנות את השם";
        name.addEventListener("click", () => {
          const next = prompt("מה השם?", player.name);
          if (next && next.trim()) onRename(player.nameKey, next.trim().slice(0, 12));
        });
        meta.append(name);
      } else {
        meta.append(el("div", "player__name", player.name));
      }

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

  const partnerOf = (card) =>
    state.deck.find((c) => c.pairId === card.pairId && c.id !== card.id);

  /** Unmatched cards nobody has turned over yet, excluding one. */
  function unseenCount(excludeId) {
    return state.deck.filter(
      (c) => !state.matched.has(c.id) && c.id !== excludeId && !state.seen.has(c.id),
    ).length;
  }

  /**
   * Separate what a player KNEW from what they GUESSED.
   *
   * Two numbers come out of this, and the difference between them is the whole
   * point — a child with a great memory and terrible luck played better than a
   * child who got lucky, and until you measure both, the scoreboard cannot say so.
   *
   * 🧠 memory: at the moment you turned the first card, was its twin already
   *    face-up in your history? If so the correct second card was fully
   *    determined and no luck was involved. Getting it right is skill; getting it
   *    wrong is forgetting. Turns where the twin was unknown are not counted at
   *    all — you cannot fail to remember what you never saw.
   *
   * 🍀 luck: only when the twin was NOT known and you picked a card nobody had
   *    seen. Then the chance of hitting was exactly 1/unseen. Summing those gives
   *    the matches chance owed you; counting the real ones gives what you took.
   */
  function scoreTurn(first, second) {
    const context = state.turnStart;
    if (!context) return;
    const stat = state.stats[context.player];
    const matched = first.pairId === second.pairId;

    if (context.partnerKnown) {
      stat.knownChances += 1;
      if (matched) stat.knownHits += 1;
      return;
    }

    // Picking a card they had already seen is a decision, not a gamble — it tells
    // us nothing about luck either way.
    if (state.seen.has(second.id) || context.unseen <= 0) return;

    stat.luckEvents += 1;
    stat.luckExpected += 1 / context.unseen;
    if (matched) stat.luckHits += 1;
  }

  /** What a player's two numbers mean, in words a ten-year-old can check. */
  function readStats(index) {
    const stat = state.stats[index];
    const ratio = (stat.luckHits + 1) / (stat.luckExpected + 1);
    const memory =
      stat.knownChances > 0 ? Math.round((100 * stat.knownHits) / stat.knownChances) : null;

    return {
      luck: {
        // Under a handful of gambles the ratio is noise, and telling a child they
        // are blessed on the strength of two coin flips is worse than saying
        // nothing.
        enough: stat.luckEvents >= 5,
        ratio,
        label: stat.luckEvents < 5 ? "עוד מוקדם לדעת" : `פי ${ratio.toFixed(1)}`,
        detail:
          stat.luckEvents === 0
            ? "עוד לא ניחשת אף קלף שלא הכרת."
            : `מצאת ${stat.luckHits} זוגות בניחוש. לפי הסיכויים היית אמור/ה למצוא ${stat.luckExpected.toFixed(1)}.`,
      },
      memory: {
        enough: stat.knownChances > 0,
        percent: memory,
        label: memory === null ? "—" : `${memory}%`,
        detail:
          stat.knownChances === 0
            ? "עוד לא הפכת קלף שכבר ראית את התאום שלו."
            : `${stat.knownChances} פעמים הפכת קלף שכבר ראית את התאום שלו. מצאת אותו ${stat.knownHits} פעמים.`,
      },
    };
  }

  function onFlip(card, byAI) {
    if (destroyed || state.over || state.busy) return;
    if (state.flipped.length >= 2) return;
    if (state.matched.has(card.id) || state.flipped.some((c) => c.id === card.id)) return;
    // During Claude's turn the board belongs to Claude.
    if (!byAI && activePlayer().isAI) return;
    if (!state.running && !isTurnBased) startTimer();

    // Everything the scorer needs must be read BEFORE this card joins `seen`.
    if (state.flipped.length === 0) {
      const partner = partnerOf(card);
      state.turnStart = {
        player: state.current,
        partnerKnown: partner ? state.seen.has(partner.id) : false,
        unseen: unseenCount(card.id),
      };
    }

    state.flipped.push(card);
    cardEl(card.id)?.classList.add("is-flipped");
    opponent?.observe(card.id, card.pairId);
    if (config.sound) beep(520, 70, "triangle");

    if (state.flipped.length === 2) scoreTurn(state.flipped[0], state.flipped[1]);
    state.seen.set(card.id, card.pairId);

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

    if (config.showStats) overlay.append(renderStats());

    const again = el("button", "btn", "עוד פעם");
    again.type = "button";
    again.addEventListener("click", restart);
    overlay.append(again);

    if (config.sound) {
      if (won) [660, 830, 990].forEach((f, i) => later(() => beep(f, 160), i * 140));
      else beep(140, 500, "sawtooth");
    }
  }

  /**
   * The scoreboard: one row per player, two tappable chips each.
   *
   * Tappable rather than always-expanded because the number is the hook and the
   * arithmetic is the lesson — a child looks at "פי 2.4", wants to know why, and
   * finds a sentence they can check against the game they just played.
   */
  function renderStats() {
    const box = el("div", "scores");
    const detail = el("div", "scores__detail");

    state.players.forEach((player, i) => {
      const read = readStats(i);
      const row = el("div", "scores__row");
      if (state.players.length > 1) row.append(el("div", "scores__who", player.name));

      for (const [kind, icon, data] of [
        ["luck", "🍀", read.luck],
        ["memory", "🧠", read.memory],
      ]) {
        const chip = el("button", `scores__chip scores__chip--${kind}`);
        chip.type = "button";
        chip.append(el("span", "scores__icon", icon));
        chip.append(el("span", "scores__value", data.label));
        chip.addEventListener("click", () => {
          const same = detail.dataset.open === `${String(i)}:${kind}`;
          for (const other of box.querySelectorAll(".scores__chip")) {
            other.classList.remove("is-open");
          }
          if (same) {
            detail.dataset.open = "";
            detail.textContent = "";
            detail.classList.remove("is-open");
            return;
          }
          chip.classList.add("is-open");
          detail.dataset.open = `${String(i)}:${kind}`;
          detail.textContent =
            `${icon} ${kind === "luck" ? "מזל" : "זיכרון"} — ${player.name}
${data.detail}`;
          detail.classList.add("is-open");
        });
        row.append(chip);
      }
      box.append(row);
    });

    box.append(detail);
    return box;
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
