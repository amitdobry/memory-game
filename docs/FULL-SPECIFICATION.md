# משחק זיכרון — Kids AI Workshop
## Complete Product & Technical Specification

**Version:** 1.0 · built 15 September 2026 · status: **live in production**
**Live:** https://amitdobry.github.io/memory-game/
**Repos:** `amitdobry/memory-game` (public, static) · `amitdobry/live` branch `product/web-v0` (private, holds the API key)

> This document is written to be handed to another model or engineer with **zero prior context**, and to be complete enough to plan a multi-week curriculum from. Everything below was built and verified against the real Claude API on a real phone.

---

# PART 0 — THE ONE-PARAGRAPH VERSION

A Hebrew, right-to-left memory-match game for children aged 10–13. The children do not learn *about* AI — they use AI to finish a real, running application and leave with a playable game that is visibly theirs. About 75% is built in advance (engine, rendering, persistence, layout, safety). The last 25% is built during the workshop by typing ordinary Hebrew at a character called **שומר המדורה** (the Firekeeper), who changes the game in front of them. The static site holds no credential; every AI call goes to an existing Heroku app that already holds the Anthropic key.

---

# PART 1 — THE PRODUCT

## 1.1 The pedagogical thesis

> **We build ~75% before the workshop. The children build the last 25% with AI.**

The prepared 75% is everything boring and fragile: the game engine, card rendering, the data model, persistence, responsive layout, error handling, the share mechanism. It runs perfectly on arrival.

**And it looks deliberately unfinished.** The starting game is grey, silent, generic, 4×4, and called "משחק זיכרון". That gap is the entire curriculum. A child types:

> *"תעשה לי לוח 6 על 6 עם נושא של ממתקים, ו-40 שניות"*

…and the board resizes, turns pink, fills with sweets, and the clock drops to 40. The loop being taught is:

**Idea → Prompt → Read the answer → Test it → Notice it's wrong → Say it better**

The last two steps matter most. The app is deliberately built so the AI sometimes cannot do what was asked, and says so honestly — because *"the AI said no and explained why"* is a more useful lesson than *"the AI did everything"*.

## 1.2 Success criteria for a session

A session has worked if every child:
- used AI directly, in their own language, with no syntax to learn;
- made several real changes that visibly altered their game;
- hit at least one refusal or misunderstanding and recovered from it;
- ended with a working, playable product that differs visibly from their neighbour's;
- can open it again later from a link.

---

## 1.3 Screens, and every single control

### Screen 1 — `workshop.html` (was `index.html` until 18 Sep 2026; `/` is now the public landing page) — "Pick your name"

The entry point. No login, no password, no accounts.

| Element | Behaviour |
|---|---|
| Title `בונים משחק עם AI` | static |
| Subtitle | static |
| **Child cards** (3) | avatar portrait + name; click → `build.html?u=<id>` |
| **Instructor card** (1) | same, visually de-emphasised (smaller, 75% opacity) so the instructor can demo without occupying a child's slot |

Children are hard-coded in `public/js/users.js`. Adding a fourth is one line. Each has `{ id, name, avatar, color }`; the colour becomes that child's accent colour throughout their session.

---

### Screen 2 — `build.html` — The Workbench

The main surface. Two panes on desktop (game left, panel right); stacked on phone.

#### 2a. Top bar

| Button | ID | Action |
|---|---|---|
| Child's avatar + name | — | identity display only |
| **מה עושים כאן?** | `help` | replays the six-step Firekeeper intro |
| **בטל שינוי אחרון** | `undo` | pops the undo stack, restoring the previous config. Disabled when empty |
| **למחוק את כל השינויים** | `reset` | ⚠️ destructive. Red-tinted, confirms with a count of what will be lost, points at "משחק חדש" for anyone who wanted a round instead. **Undoable** |
| **שיתוף המשחק** | `share` | opens the share dialog (QR + link + copy) |

#### 2b. The game stage (left / top)

| Element | Behaviour |
|---|---|
| **Title** | `config.title` |
| **⏱ timer chip** | solo mode only; hidden in turn-based. Pulses red under 10s |
| **⭐ score chip** | solo only; shown when `showScore` |
| **🃏 pairs chip** | always — `found/total` |
| **Players bar** | turn-based modes only. Avatar/emoji, name, live score. Active player's chip scales up and takes an accent border |
| **Player name** | in friend mode, tappable → rename prompt (dashed underline signals it) |
| **Claude's speech bubble** | vs-Claude only; appears under his chip after each turn |
| **The board** | `cols × rows` grid. Click a card to flip |
| **משחק חדש** | deals a new round. Same config, new arrangement, fresh cast |
| **End overlay** | emoji, headline, score line, per-player score chips, **עוד פעם** |

#### 2c. The side panel — three tabs

**Tab 1 — לדבר עם ה-AI (the Firekeeper)**

| Element | Behaviour |
|---|---|
| Firekeeper portrait | one of four expressions; flares briefly when it changes |
| His current line | greeting → password request → thinking → the AI's reply |
| Chat log | child messages (accent, left), AI replies (grey, right), system notes (amber), errors (red) |
| **Change list** | under each AI reply: `field: old ← new` per change, in Hebrew field names |
| **לא אהבתי — תחזיר** | per-reply undo button |
| Suggestion chips | six starter prompts; tap to fill the input |
| Input + **שליחה** | textarea; Enter sends, Shift+Enter newlines; grows to 140px |
| Password field | swaps in while locked (real `type="password"`) |

**Tab 2 — לוח בקרה (the control panel)**

Every one of the 24 fields, rendered from the schema, grouped into six sections. Integers are sliders with a live value bubble; enums are selects; booleans are checkboxes; strings and lists are text inputs. **Changing anything here goes through exactly the same code path as an AI change** — the panel is not a separate system, and that is the point: children see that "talking to the AI" and "moving a slider" do the same thing.

**Tab 3 — מה ה-AI כתב (the code view)**

The live config as formatted JSON, with the keys changed by the last action highlighted in green. This is the "we do not hide the code" surface — a child can see that their entire game is a list of 24 values.

---

### Screen 3 — `play.html` — The shared game

Opened from a share link. **Requires no server whatsoever** — the complete configuration is base64-encoded in the URL fragment. Shows "המשחק של \<name\>" and the game. Works forever, on any phone, even if the backend is switched off.

---

## 1.4 The Firekeeper (שומר המדורה)

The character who hosts the session. Four expressions, drawn in the same style as the card art:

| Face | When |
|---|---|
| `warm` | success, praise, greeting |
| `winking` | teasing, pride after beating the child to a pair |
| `concerned` | cannot do it, something failed, or the request had to be adjusted |
| `ambient` | neutral, answering a question, thinking |

**The model picks the face on every answer**, returned as `face` alongside the reply. Two guards: the name is validated against the four known values before it reaches an `<img>` (a wrong picture is a worse failure than a wrong mood), and it is **forced to `concerned` whenever the child did not actually get what they asked for**, regardless of what the model claimed.

### Why a character at all

A ten-year-old will argue with a character and will not argue with a text box. Arguing — *"no, I meant BIGGER"* — is precisely the skill the workshop teaches.

### Onboarding — six steps, scripted not generated

1. `warm` — "I'm the Firekeeper. I'll help you build a game today."
2. `ambient` — "See the game? It works — but it isn't finished. It's grey and boring."
3. `winking` — "Here's the fun part: you don't need to know how to code."
4. `ambient` — "Try things like 'make a 6 by 6 board', 'I want 30 seconds'."
5. `concerned` — "But watch out — sometimes I'm wrong, or I misunderstand."
6. `warm` — "So after every change: play it and check. Let's go!"

**Deliberately scripted.** It runs before a child has a password, it must survive bad venue wifi, it must be identical for every child so an instructor can talk over it, and no child should watch a spinner to learn what the app is. Skippable, and replayable from the top bar. Shown once per child per browser.

---

## 1.5 Game modes

| Mode | Value | Description |
|---|---|---|
| לבד | `solo` | One player against the clock |
| נגד קלוד | `claude` | Turn-based against the AI |
| נגד חבר/ה | `friend` | Two players alternating on one screen |

Classic memory rules in turn-based modes: **a match earns another turn**. The timer is hidden in turn-based modes (the contest is the opponent, not the clock); the winner is whoever holds more pairs, with ties reported as ties.

### Claude as an opponent — the key design decision

**Claude does not decide its moves.** Remembering where a card sat is a memory problem, not a language problem, and a child should never wait on a network round trip to watch a card turn over. Moves are computed in the browser, instantly, offline, in `public/js/opponent.js`.

Difficulty is honest — it is **how much of what it saw it forgets**:

| `claudeSkill` | Forget rate | Resulting 🧠 score |
|---|---|---|
| קל | 55% | ~45% |
| רגיל | 20% | ~80% |
| קשה | 0% | **100%** |

The opponent's algorithm:
- **observe** — every card either player reveals is remembered, with probability `1 − forgetRate`
- **first pick** — if two remembered cards form a pair, take one; otherwise turn over something *unseen*, to learn the most
- **second pick** — if the partner is remembered, take it; otherwise another unseen card
- **forget** — matched cards are dropped from memory

What Claude *does* supply is the part a lookup table cannot fake: a Hebrew reaction between turns, with a face. If the network is down, a local line bank takes over, so a dead connection costs personality rather than playability.

---

## 1.6 Scoring — luck vs memory

Two numbers at the end of every game, per player. **The difference between them is the lesson:** a child with a great memory and terrible luck played better than one who guessed well, and until you measure both, the scoreboard cannot say so.

### 🧠 Memory

At the instant you turn the **first** card, is its twin already face-up in the game's history?

- **Yes** → the correct second card is fully determined. No luck is involved. Taking it is skill; missing it is forgetting.
- **No** → the turn is **not counted at all**. You cannot fail to remember what you never saw.

```
memory% = knownTwinFound / knownTwinAvailable
```

### 🍀 Luck

Only counted when the twin was **not** known *and* the player picked a card nobody had seen. Then the chance of hitting was exactly `1 / unseen`.

```
expected  = Σ (1 / unseen)      over all such flips
luckRatio = (actualHits + 1) / (expected + 1)
```

The `+1` smoothing stops a single fluke in a small game reading as "10× blessed". Below **five** luck-eligible flips the score is withheld entirely and reads *"עוד מוקדם לדעת"* — telling a child they are lucky on the strength of two coin flips is worse than saying nothing.

Rough reading: `<0.7` unlucky · `~1.0` normal · `1.5–2` lucky · `>2.5` suspiciously blessed.

### "Seen" is global, on purpose

A card Claude revealed is a card **you watched**. Judging your memory only on cards you turned yourself would excuse you for forgetting everything your opponent showed you — which is most of the game.

### The tooltip

Tapping either chip reveals the arithmetic in a sentence a child can check against the game they just played:

> 🍀 **מזל — מיכל**
> מצאת 3 זוגות בניחוש. לפי הסיכויים היית אמור/ה למצוא 1.2.

> 🧠 **זיכרון — מיכל**
> 8 פעמים הפכת קלף שכבר ראית את התאום שלו. מצאת אותו 6 פעמים.

### The emergent property worth teaching

Against Claude, **its memory score is a direct readout of the difficulty the child set**. Set it to קשה and it scores 100%; set it to קל and it drops to ~45%. The knob a child turned becomes a number they can see. It is also a free correctness check on the opponent code: if `hard` ever scores below 100%, the memory model has a bug.

---

# PART 2 — EVERY CONFIGURABLE FIELD

All 24 fields live in `public/js/schema.js`. This single array feeds **four** consumers: the game engine, the control panel, the AI prompt, and the validators on both sides.

## מצב משחק — Mode

| Key | Type | Range | Default | Hebrew label |
|---|---|---|---|---|
| `mode` | enum | `solo` · `claude` · `friend` | `solo` | איך משחקים |
| `claudeSkill` | enum | `easy` · `normal` · `hard` | `normal` | כמה קלוד טוב |
| `player1Name` | string | ≤12 chars | `שחקן 1` | שם שחקן 1 |
| `player2Name` | string | ≤12 chars | `שחקן 2` | שם שחקן 2 |
| `claudeTalks` | bool | — | `true` | קלוד מדבר תוך כדי משחק |

## הלוח — Board

| Key | Type | Range | Default | Hebrew label |
|---|---|---|---|---|
| `cols` | int | 2–8 | `4` | עמודות בלוח |
| `rows` | int | 2–8 | `4` | שורות בלוח |
| `cardSet` | enum | 9 values (below) | `avatars` | ערכת קלפים |
| `customSymbols` | list | ≤32 items, ≤4 chars each | `[]` | סמלים משלי |

## זמן וקושי — Time & difficulty

| Key | Type | Range | Default | Hebrew label |
|---|---|---|---|---|
| `timerSeconds` | int | 10–600 | `60` | זמן למשחק |
| `peekSeconds` | int | 0–10 | `0` | הצצה בהתחלה |
| `flipBackMs` | int | 200–3000 | `1000` | כמה זמן קלפים נשארים פתוחים |
| `difficultyRamp` | enum | `none` · `fasterFlip` · `drainTimer` | `none` | נעשה קשה יותר תוך כדי |

`fasterFlip` multiplies the flip-back window by 0.85 per match (floor 200ms). `drainTimer` multiplies the clock tick by 0.88 per match (floor 300ms) — the seconds literally run faster.

## ניקוד — Score

| Key | Type | Range | Default | Hebrew label |
|---|---|---|---|---|
| `pointsPerMatch` | int | 0–100 | `10` | נקודות על זוג |
| `penaltyPerMiss` | int | 0–50 | `0` | קנס על טעות |
| `speedBonus` | bool | — | `false` | בונוס מהירות |
| `showStats` | bool | — | `true` | להראות מזל וזיכרון בסוף |

## מראה — Look

| Key | Type | Range | Default | Hebrew label |
|---|---|---|---|---|
| `theme` | enum | 7 themes (below) | `plain` | ערכת צבעים |
| `showTimer` | bool | — | `true` | להציג את הטיימר |
| `showScore` | bool | — | `false` | להציג ניקוד |
| `sound` | bool | — | `false` | צלילים |

## מילים — Words

| Key | Type | Range | Default | Hebrew label |
|---|---|---|---|---|
| `title` | string | ≤40 chars | `משחק זיכרון` | שם המשחק |
| `winMessage` | string | ≤80 chars | `ניצחת` | הודעת ניצחון |
| `loseMessage` | string | ≤80 chars | `נגמר הזמן` | הודעת הפסד |

---

## 2.1 Card sets

| Key | Hebrew | Kind | Symbols |
|---|---|---|---|
| `avatars` | דמויות (ציורים) | image | **31** hand-drawn characters |
| `fruit` | פירות | emoji | 48 |
| `animals` | חיות | emoji | 48 |
| `space` | חלל | emoji | 48 |
| `sport` | ספורט | emoji | 48 |
| `food` | אוכל | emoji | 48 |
| `sweets` | ממתקים | emoji | 48 |
| `ocean` | ים | emoji | 48 |
| `custom` | משלי | emoji | whatever the child lists |

**Bank size is variety.** The cast for each deal is drawn at random from the bank, so the same ocean board keeps producing different creatures. At 32 symbols a full 8×8 board (32 pairs) used every symbol and looked identical every round; at 48 even the largest board varies.

**The avatar ceiling is real and taught.** With only 31 drawings, the largest avatar board is 62 cards — so 8×8 is impossible and the AI explains exactly this, in Hebrew, offering emoji as the alternative. This is one of the best teaching moments in the app and it arrives for free.

### Two hard-won rules about emoji

Both discovered by rendering every symbol to a canvas and comparing pixels:

1. **No characters that default to text presentation** (`🛰 ☄ ⚙ ❄ ⛸`). They render as flat grey line glyphs rather than colour emoji, so they all look alike at 39px — the size a card actually is on a phone.
2. **No repeated silhouettes.** `⚾/🏐` are two white spheres; `🥇/🥉` differ only in metal tone; the space set once had **nine** near-identical round moons. A memory game built from cards you cannot distinguish is not hard, it is broken.

The verified minimum visual distance across all seven banks is **72** on the comparison scale, against a flagging threshold of 40. It was 28 before the fix.

## 2.2 Themes

`plain` (deliberately grey and boring) · `space` · `candy` · `jungle` · `ocean` · `neon` · `sunset`

Each is a set of CSS custom properties applied via `[data-theme]` on the game element: background (often a gradient), ink, panel, card back, card front, accent, corner radius, and for `neon` a glow.

### THEME_CARD_SET — naming a *world*

```js
{ plain: null, space: "space", candy: "sweets",
  jungle: "animals", ocean: "ocean", neon: null, sunset: null }
```

When a child asks for "a candy theme" they mean the colours **and** the pictures. Candy cards on a grey background reads as "you didn't understand me". This table is data, not prompt prose, so adding a theme cannot silently forget to add its cards — and there is a test that fails if a theme maps to a card set that doesn't exist.

---

# PART 3 — TECHNICAL ARCHITECTURE

## 3.1 The two-repo split

```
┌────────────────────────────────┐          ┌─────────────────────────────────┐
│  memory-game  (PUBLIC)         │          │  LIVE  (PRIVATE, Heroku)        │
│  static · ZERO dependencies    │          │  already holds ANTHROPIC_API_KEY │
│                                │  HTTPS   │                                 │
│  workshop.html pick a name     │ ───────► │  POST /api/workshop/unlock      │
│  build.html   the workbench    │  + grant │  POST /api/workshop/mint        │
│  play.html    shareable game   │          │  POST /api/workshop/ask         │
│                                │ ◄─────── │  POST /api/workshop/edit        │
│  NO KEY. EVER.                 │  config  │  POST /api/workshop/banter      │
│                                │          │  GET  /api/workshop/health      │
│  GitHub Pages                  │          │  GET  /api/workshop/decide      │
│                                │          │  GET  /api/workshop/waiting     │
└────────────────────────────────┘          └─────────────────────────────────┘
```

**The single most important property:** the public repo holds no credential and no code that would know what to do with one. It has **zero runtime dependencies**. Node is used only to serve the folder during local development; the deployed site is plain HTML, CSS and ES modules with no build step.

## 3.2 The single source of truth

`public/js/schema.js` defines every knob exactly once and feeds four consumers:

| Consumer | Uses |
|---|---|
| the game engine | the values, at runtime |
| the control panel | one rendered control per field, from `type` |
| the AI prompt in LIVE | keys, types, limits, Hebrew labels and help |
| the validators | clamp rules — enforced independently on **both** sides |

**This is the safety rail.** The AI can only ever move these knobs, within these limits. A bad prompt produces an ugly game; it cannot break the app. Adding something new for children to change means editing one array.

Every change — from the AI, from the control panel, from undo, from reset — funnels through a single `applyConfig()` in `build.js`, so everything is saved, undoable, and visible in the code tab.

## 3.3 The contract generator — how two repos stay honest

LIVE needs the same field list to build its prompt. Two hand-maintained copies would drift, and the symptom would be ugly: the AI confidently setting a field the game no longer has.

```bash
npm run export:contract -- ../Live/src/workshop/contract.ts
```

One author (`schema.js`), one generator, two outputs:
- `Live/src/workshop/contract.ts` — marked **GENERATED, do not hand-edit**
- `public/js/contract.js` — a 12-hex-character hash of the field list

The browser sends that hash on **every** request. LIVE compares it with its own and reports a mismatch — **reported, never enforced**, because refusing the request would turn a deploy-ordering detail into a child staring at a broken app mid-lesson. Drift becomes a message instead of a mystery.

Current contract: `f79665a639d7` (24 fields).

## 3.4 Persistence — there is no database

| Concern | Mechanism |
|---|---|
| Identity | 3 children + 1 instructor hard-coded in `users.js` |
| Their game | `localStorage`, keyed `workshop:config:<childId>` |
| Undo | `localStorage` stack, `workshop:history:<childId>`, max 30 entries |
| Access | `localStorage`, `workshop:grant` — token + expiry |
| Intro seen | `localStorage`, `workshop:intro:<childId>` |
| **Sharing** | the entire config base64url-encoded into the URL fragment |

A finished game is a ~600-character link that works on any phone, forever, with no server. Every `localStorage` access is wrapped in try/catch — a browser with storage blocked still plays, it just re-asks for the password and re-shows the intro.

## 3.5 File-by-file — `memory-game`

```
public/js/schema.js       THE SOURCE OF TRUTH. 24 fields, 9 card sets, 7 themes,
                          the theme→cards table, the Firekeeper's 4 faces,
                          STARTER_CONFIG, sanitize(), diff(), displayValue()
public/js/game.js         The engine. Three modes, one code path. Deck building,
                          flip logic, turn rotation, timer + ramps, the scoring
                          model, the end overlay, WebAudio beeps (no audio files)
public/js/opponent.js     Claude's moves. Local, instant, offline. Difficulty is
                          a forget rate. ~70 lines
public/js/firekeeper.js   The character: portrait, face-swapping with a flare
                          animation, speech, and the six-step scripted intro
public/js/build.js        The workbench. applyConfig() is the ONLY way anything
                          changes. Chat, control panel, code view, undo, reset,
                          share, and the password door
public/js/storage.js      localStorage wrappers + the share-link codec
public/js/api.js          The ONLY file that knows LIVE exists. Resolves the API
                          base for three environments, carries the grant and the
                          contract hash, translates every error into Hebrew
public/js/users.js        The children. Edit this to run a workshop
public/js/contract.js     GENERATED — the contract hash
public/css/app.css        ~1100 lines. Shell, workbench, chat, Firekeeper,
                          themes, board, overlay, scoreboard, mobile
public/index.html         The public landing page (parents)
public/workshop.html      Pick-your-name (classroom entry)
public/build.html         The workbench shell
public/play.html          The shareable game (no server needed)
server/index.js           A static file server for development. No API, no key
scripts/export-contract.mjs   Generates LIVE's contract + the client hash
scripts/make-avatars.mjs      One-off: 1024px PNG → 256px webp (needs sharp)
.github/workflows/pages.yml   Deploys public/ to GitHub Pages
```

## 3.6 File-by-file — `LIVE` (the added surface)

```
src/workshop/contract.ts      GENERATED. Fields, limits, labels, starter config,
                              theme→cards, faces, avatar count, version hash
src/workshop/service.ts       The prompt (built from the contract), the JSON
                              extraction, the clamp, the board rules, banter
src/workshop/access.ts        Three doors → one grant. Passwords, minted codes,
                              pending approvals, constant-time comparison
src/workshop/mailer.ts        Resend over plain fetch. No SDK, no dependency
src/web/workshopRoutes.ts     The gate: grant check, rate limits, CORS, the door
                              endpoints, the owner's approve/deny pages
tests/workshop.test.ts        22 offline tests via the repo's scriptedClient
```

**Nothing else in LIVE is touched.** No Mongo, no events, no pipeline, no existing route. The workshop borrows the credential and nothing else.

## 3.7 Why it is *not* in LIVE's routing table

`src/ai/routing.ts` is governed: every row is an operation of LIVE's own pipeline, keyed to a constitutional clause and argued with arithmetic. The workshop is a different product sharing a host. Adding a row would make the table mean "every model call in the process" and the clause field would have to be filled in with a lie. The model is named locally instead.

---

# PART 4 — THE AI INTEGRATION

## 4.1 Model and cost

**`claude-haiku-4-5`** — $1/$5 per million tokens. The task is "map one Hebrew sentence onto a handful of enum and integer fields", which is the easy end of its range, and a child waiting for their board to change notices latency far more than they would notice a better sentence.

| Route | max_tokens |
|---|---|
| `/edit` | 1000 |
| `/banter` | 100 |

A child making ~30 real changes costs **single-digit cents**. A full workshop with three children costs **well under a dollar**. `WORKSHOP_DAILY_LIMIT` (default 1500 calls) is the hard ceiling on what a bad day can cost.

Swappable with one env var: `WORKSHOP_MODEL=claude-sonnet-5` if the panel ever misreads requests.

## 4.2 The request shape

Sent through LIVE's existing thin provider seam (`ModelRequest`), which separates:
- **`systemPrefix`** — stable, cacheable, built once at module load, never interpolated with per-request data. Carries a cache breakpoint.
- **`facts`** — the child's current config, as engine-computed truth.
- **`untrusted`** — the child's own words. Marked untrusted not because a 10-year-old is a threat, but because it keeps the boundary *structural*: anything arriving over HTTP goes in that field, and the question of who typed it never has to be asked at the prompt. **There is a test asserting the child's words never appear in the system prompt.**

## 4.3 The prompt, in outline

Generated from the contract, so it can never describe a field that doesn't exist:

1. Who you are — the helper in an AI workshop for children aged 10–13
2. **The complete list of what you may change** — every field with its type, range, enum values and Hebrew label
3. Card set sizes, the avatar ceiling, and the even-card-count rule
4. The required JSON response shape
5. The theme→cards pairing table
6. The four faces and when to wear each
7. How to talk: simple warm Hebrew, one or two sentences, no jargon, no English, no field names — say *"now you have 45 seconds"*, not `timerSeconds`
8. How to refuse: say so honestly, offer the nearest possible thing, **never claim to have done something you did not**
9. Child-safety: refuse offensive or inappropriate text in titles and messages, suggest an alternative

## 4.4 The response contract

```json
{ "reply": "<1–2 sentences of Hebrew>",
  "changes": { "<field>": <value> },
  "face": "warm|winking|concerned|ambient" }
```

Parsing is tolerant of a code fence and leading prose (both are common and neither is a reason to discard a good answer) but **not** of anything else. A reply that contains no parseable object **leaves the child's game exactly as it was** and the Firekeeper says he didn't understand.

## 4.5 The clamp — the second guard

Whatever comes back is clamped server-side against the contract:

- integers clamped to range, with a Hebrew note naming what was asked and what was given
- enums rejected if not in the list, keeping the previous value
- strings whitespace-collapsed and truncated
- lists truncated by count and per-item length
- **unknown keys dropped entirely**
- `reply` hard-capped at **400 characters**

Then two cross-field rules run, and this is where a real bug was caught:

- **an even number of cards**, so every card has a partner
- **never more distinct pictures than the set owns**

These used to live only in the browser. The result: asked for a 20×20 board, the AI answered *"I made it 8 by 8"* while the browser quietly reduced it to 8×7 and told nobody. A child checking the AI's work — the one habit this workshop exists to teach — would have found the AI lying and the app agreeing with it. **The rules now run where the answer is written, so the correction travels with it and the child is told.**

---

# PART 5 — SECURITY

## 5.1 The key

`ANTHROPIC_API_KEY` exists **only** in Heroku's environment. It is never sent to a browser, never in either repo, never logged. SDK errors are never interpolated wholesale, because SDK errors can carry request headers and headers carry the key.

## 5.2 Three doors, one grant

A "third authority" alongside LIVE's existing two (a signed-in person, and the operator). The caller is a child on a static site: no session, because there are no accounts; not Basic auth, because that puts a password dialog in front of a child.

| Door | Mechanism | Grant life |
|---|---|---|
| **1. The owner's password** | `WORKSHOP_OWNER_PASSWORD`, permanent | 12 hours |
| **2. A minted code** | 8 digits, `POST /mint` with the owner password | **20 minutes** |
| **3. Ask the owner** | email with approve/deny links | 20 minutes |

All three converge on an opaque grant with an expiry, carried in `x-workshop-access`. Nothing below the door knows which was used.

**Door 3 is built but dormant** — `/health` reports it closed until `RESEND_API_KEY` and `WORKSHOP_OWNER_EMAIL` exist, because a child pressing "ask the owner" and waiting for an email that was never sent is the worst failure that screen can have.

### Implementation details worth keeping

- Password comparison is **constant-time and length-safe**. `timingSafeEqual` throws on a length mismatch, which would leak the length through an exception — so lengths are compared and the result folded in, never short-circuited.
- A grant from a minted code **dies with the code**, not 20 minutes after it was spent. Otherwise "a twenty-minute password" means nothing.
- An approval link carries the request id **and** its secret; the id travels back to the waiting browser and the secret never does.
- `randomInt`, not `Math.random` — short-lived is not the same as unimportant.
- An expired grant answers **403, not 401**, so the browser returns the child to the door instead of retrying a dead token.

## 5.3 Why a visible grant is acceptable

The grant sits in the browser and anyone holding the phone can read it. That is fine, and the reason is the **shape of the endpoint**, not the secrecy of the token:

1. **It is not a Claude proxy.** One request shape in, one answer shape out — a memory-game config plus one Hebrew sentence capped at 400 characters. No caller can name a model, supply a system prompt, or set a token budget. A stolen grant buys the ability to recolour a memory game.
2. **It is bounded** — 80 requests per grant per hour, 1500 across everything per day.
3. **It expires** — 20 minutes for everything except the owner's own.
4. **It fails closed** — with no owner password configured and no live code, the door reports itself shut rather than opening.

## 5.4 CORS

`LIVE_ALLOWED_ORIGINS` is an explicit allow-list, never `*`. The workshop route widens `access-control-allow-headers` to include `x-workshop-access` **locally**, rather than in LIVE's shared helper, so the shared plumbing keeps meaning "what the product and the Lab need".

---

# PART 6 — DEPLOYMENT

## 6.1 Environment variables (all on Heroku)

| Var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **required**; already present |
| `WORKSHOP_OWNER_PASSWORD` | — | door 1. Config only, never in git |
| `WORKSHOP_EXPIRES` | unset | e.g. `2026-10-15`; switches the whole surface off |
| `WORKSHOP_HOURLY_LIMIT` | 80 | per grant per hour |
| `WORKSHOP_DAILY_LIMIT` | 1500 | across everything, per day |
| `WORKSHOP_MODEL` | `claude-haiku-4-5` | model override |
| `LIVE_ALLOWED_ORIGINS` | — | **append**, never overwrite; Vercel + Pages |
| `RESEND_API_KEY` | unset | door 3 |
| `WORKSHOP_OWNER_EMAIL` | unset | door 3 |
| `WORKSHOP_PUBLIC_ORIGIN` | request host | where approve links point |

## 6.2 Deploying

**Static site** — push to `main`; a GitHub Actions workflow uploads `public/` to Pages. Used rather than the simpler branch option because Pages only serves a repo root or `/docs`, and the site lives in `public/` while `docs/` already means something else.

**Backend** — merge into `product/web-v0`, run `npm run predeploy` (typecheck + 1220 unit tests + integration + slug boot), then `git push heroku product/web-v0:main`.

⚠️ The integration lane **refuses to run while `ANTHROPIC_API_KEY` is set** — a deliberate guard so tests can never make a billable call. Run predeploy with the key blanked.

## 6.3 Workshop-day fallback

No hosting needed at all: `npm start` on the instructor's laptop and the room connects to the printed LAN address. `api.js` resolves three environments automatically — localhost, a LAN IP (LIVE on the same machine, other port), or the deployed Heroku app.

## 6.4 Browser caching — a real workshop-day gotcha

GitHub Pages sets a ~10-minute cache header. A fix pushed mid-lesson will not reach children who already have the page for up to ten minutes. If that becomes a problem, add a cache-busting version query to the script tags.

---

# PART 7 — DESIGN DECISIONS AND THEIR REASONS

*This section exists because the reasons are more portable than the code.*

| Decision | Why |
|---|---|
| **AI edits a bounded schema, not code** | A bad prompt makes an ugly game, not a broken app. The blast radius is 24 typed, range-checked values |
| **Validate on both sides independently** | The browser's copy protects the child from an odd answer; the server's keeps the endpoint's promise about what it can ever return. Neither may assume the other ran |
| **Generate the second copy, never write it** | Two hand-maintained field lists is a drift bug waiting to happen |
| **Opponent moves are local** | Memory is not a language problem. Instant, offline, and the difficulty knob becomes measurable |
| **Onboarding is scripted** | Must work before a password, on bad wifi, identically for every child. Paying a model to say a sentence we already chose adds nothing |
| **No database** | Three children, one day. localStorage plus a self-contained share link is the right amount of machinery |
| **In-memory grants and rate limits** | Nothing outlives 20 minutes; a Mongo collection plus a migration for one lesson's state is the wrong trade |
| **A character, not a chat box** | Children argue with characters. Arguing is the skill |
| **The face is forced to `concerned` on any clamp** | Honesty about failure is a product requirement, not a nicety |
| **Show the change list under every reply** | "Test what the AI did" needs something to test against |
| **The control panel uses the same code path as the AI** | Children see that talking and configuring are the same act |
| **Plain, grey starter** | The gap between "runs perfectly" and "looks unfinished" *is* the curriculum |

---

# PART 8 — BUGS FOUND AND FIXED

*Kept because each one is a teachable artefact, and several are non-obvious.*

| # | Bug | Root cause |
|---|---|---|
| 1 | AI said "8×8" while the board became 8×7 | Board rules lived only in the browser; the correction never travelled with the answer |
| 2 | "Candy theme" gave candy cards on a grey background | Themes and card sets were different lists overlapping only on `space` |
| 3 | Model set `cardSet: "candy"` — a value that doesn't exist | No explicit pairing table; the prompt was guessing |
| 4 | Board cut off top and bottom on a real phone | `align-items: center` on a scrolling box — content taller than the box overflows **both** ways and the top becomes unreachable |
| 5 | Whole app 474px wide inside a 375px screen | `.shell` declared `grid-template-rows` and no columns, so the implicit column was `auto` = max-content. `overflow: hidden` then clipped the left edge silently |
| 6 | Claude's speech bubble hidden behind the board | Cards use `perspective`, which opens stacking contexts that paint over earlier siblings |
| 7 | Winner's name printed through the scoreboard | Fixing #6 raised the players bar above the end overlay |
| 8 | Speech bubble never closed | The auto-close timer sat after an early `return` in the no-network path |
| 9 | Bubble offset in RTL | `inset-inline-start` (direction-aware) mixed with `translateX` (not) |
| 10 | Password typed in plain view | The input is a `<textarea>`, which has no `type` and silently ignored being told to mask |
| 11 | "Failed to fetch" shown to a child in Hebrew UI | A browser's English `TypeError` message reaching the Firekeeper's mouth |
| 12 | Intro ended by telling children to type wishes at a locked app | The closing line overwrote the password prompt |
| 13 | `⚾/🏐`, `🥇/🥉`, `🛰/❄` indistinguishable at card size | Repeated silhouettes and text-presentation glyphs; found by pixel comparison |
| 14 | One button quietly deleted an hour of work | `להתחיל מהתחלה` sat above `משחק חדש`; both read as "start again", and it cleared the undo history **first** |
| 15 | CORS preflight rejected the workshop header | The shared helper allowed only `content-type,authorization` |

---

# PART 9 — WHAT IS **NOT** BUILT

Be precise about this when planning.

- **Workshop teaching materials** — run sheet, prompt bank, deliberate debugging examples, instructor script. **None exist.** This is the largest remaining gap and it is pedagogical, not technical.
- **Door 3 (email approval)** — coded and wired, dormant until a mail key exists.
- **Real accounts** — three hard-coded children does not survive a fourth classroom.
- **A database** — localStorage means a child loses their work on a new device.
- **Durable rate limits** — in-memory, forgiven by a dyno restart.
- **Child-safety review** — an open text box in front of children needs moderation policy, logging and a parental-consent story before it is a product rather than a supervised workshop.
- **Untested:** the share QR code (loads a CDN library), sound on iOS, Enter-to-send on a phone keyboard.
- **Themes without card sets** — `neon` and `sunset` have no matching cards; `fruit`, `food`, `sport` have no matching theme.

---

# PART 10 — NOTES FOR A LONGER COURSE

The application was built for one day. For a multi-week course, these are the natural expansion axes, roughly in order of value per unit of work.

### The mechanism generalises

The memory game is the least valuable part of what exists. What was actually built is:

> **A bounded, schema-driven surface that a language model may edit, validated on both sides, with a generated contract that stops the two halves drifting.**

Swap the schema and the same machine lets a non-technical person configure anything by talking to it. That is the reusable asset, and it is a legitimate week of curriculum on its own.

### Week-scale extensions, cheapest first

1. **Add fields** — one array entry each, then re-run the contract export. Children could gain: card flip animation style, background music choice, a second timer mode, a "lives" count, per-player colours.
2. **Add themes and card sets** — pure data. A child designing their own set (`custom`) is already supported.
3. **Let children write the prompt** — expose the system prompt in a fourth tab and let them edit how the Firekeeper behaves. This teaches prompt engineering directly and needs only a config field carrying extra instructions.
4. **A second game** — the engine is one file. A "catch the falling things" or quiz mode sharing the same schema/AI machinery would show that the pattern, not the game, is the product.
5. **Real accounts + database** — required for any course where children return on a different device.
6. **Let the AI write actual code** — the honest next step beyond configuration. A sandboxed function body (e.g. a scoring rule) that children ask the AI to write, run in a Worker with a timeout. This is where "configuring with AI" becomes "programming with AI".
7. **Multiplayer over the network** — the largest jump; needs real infrastructure.

### Concepts already teachable with what exists today

- prompting, and why specificity wins
- that AI can be confidently wrong — and how to check (the change list exists for this)
- iteration and correction
- configuration vs code (the control panel vs the chat, doing the same thing)
- validation and limits (why the app refuses an 8×8 avatar board)
- probability and evidence (the luck score, and why it hides below five samples)
- skill vs chance (luck vs memory, side by side)
- how an opponent "remembers" (the forget rate is visible and adjustable)
- client vs server, and why the key lives on one side
- deployment and sharing (every child ends with a live link)

---

# APPENDIX A — API REFERENCE

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/workshop/health` | none | contract hash, model, which doors are open |
| POST | `/api/workshop/unlock` | password in body | owner password or 8-digit code → grant |
| POST | `/api/workshop/mint` | owner password | new 8-digit code, 20-minute life |
| POST | `/api/workshop/ask` | none | create a pending request, email the owner |
| GET | `/api/workshop/waiting?id=` | none | poll a pending request |
| GET | `/api/workshop/decide?id=&s=&d=` | link secret | the owner's approve/deny page |
| POST | `/api/workshop/edit` | grant | **the main one** — Hebrew in, config + reply + face out |
| POST | `/api/workshop/banter` | grant | one line + face for an in-game moment |

## `/edit` request and response

```jsonc
// →
{ "message": "תעשה לי לוח 6 על 6 של חלל",
  "config":  { /* the child's current 24 fields */ },
  "contract": "f79665a639d7" }

// ←
{ "reply":  "יאללה! לוח 6 על 6 עם כוכבים וחלליות.",
  "config": { /* the full clamped config */ },
  "notes":  [ /* Hebrew explanations of any correction */ ],
  "face":   "warm",
  "contract": "f79665a639d7" }
```

---

# APPENDIX B — LOCAL DEVELOPMENT

```bash
# terminal 1 — the AI half
cd Live
WORKSHOP_OWNER_PASSWORD="…" LIVE_ALLOWED_ORIGINS="http://localhost:3000" npm run web

# terminal 2 — the static half
cd "AI workshop 10-13"
npm start          # → http://localhost:3000
```

After **any** change to `schema.js`:

```bash
npm run export:contract -- ../Live/src/workshop/contract.ts
```

---

# APPENDIX C — ASSETS

- **31 avatar drawings**, owner-created, sourced from the SoulCircle project, resized 1024px PNG → 256px webp by `scripts/make-avatars.mjs`. 11MB → 476KB, a 96% reduction.
- **4 Firekeeper expressions**, same origin and pipeline, 320px webp, 84KB total.
- **No fonts, no icons, no audio files.** Sounds are generated at runtime with WebAudio; icons are emoji.

---

# APPENDIX D — TEST COVERAGE

22 offline tests in `LIVE/tests/workshop.test.ts`, run against a scripted client so the suite never spends money and never needs a key. They cover: JSON extraction (bare, fenced, prose-prefixed, absent), clamping, enum rejection, unknown-key dropping, the reply cap, the untrusted-input boundary, face selection and fallback, the forced-`concerned` rule, the board rules (8×8 avatars → 8×7 with an explanation; 8×8 emoji allowed; odd boards corrected), contract stamping, and two structural tests asserting every theme maps to a card set that exists and every theme appears in the pairing table.

LIVE's full suite: **1220 tests**, all passing.

---

*End of specification.*
