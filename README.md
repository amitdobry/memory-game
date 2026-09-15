# משחק זיכרון — סדנת AI לילדים (10–13)

Kids finish a memory game **with AI**. We build ~75% before the workshop; each
child builds the last 25% by telling Claude, in Hebrew, what they want changed —
then playing it, checking it, and fixing it when the AI got it wrong.

---

## הפעלה מהירה / Quick start

```bash
npm install
cp .env.example .env     # then paste your key into .env
npm start
```

Open http://localhost:3000 — the terminal also prints a LAN address
(`http://192.168.x.x:3000`) that phones and tablets on the same wifi can use.

**Runtime dependencies: one** (`@anthropic-ai/sdk`). No build step, no bundler,
no database. Node 20+ (tested on 24).

---

## מה יש כאן / What this is

| Page | What it does | Needs the server? |
|---|---|---|
| `/` | Pick your name (3 children + an instructor, hard-coded) | no |
| `/build.html?u=kid1` | The workbench: game + AI chat + control panel + code view | only for the AI panel |
| `/play.html#<code>` | Somebody's finished game, whole config packed into the URL | **no** |

Because `play.html` carries the entire game in its own link, finished games can
be shared by link or QR and played on any phone, with nothing hosted.

### שלושה מצבי משחק / Three play modes

- **לבד** — one player against the clock.
- **נגד קלוד** — turn-based against the AI. Its *moves* are decided locally and
  instantly (`public/js/opponent.js`), because remembering cards is a memory
  problem, not a language problem. Difficulty is honest: how much of what it saw
  it forgets (easy 55% / normal 20% / hard 0%). What Claude *says* between turns
  does come from the model — and falls back to a local line bank if the network
  is down, so the game never waits.
- **נגד חבר** — two players taking turns on the same screen.

---

## הארכיטקטורה בשורה אחת / The architecture in one line

`public/js/schema.js` is the single source of truth. Every knob a child can turn
is defined there exactly once, and that one file feeds **all four** of:

1. the game engine (reads the values),
2. the control panel (renders a control per field),
3. the AI tool definition (`server/ai.js` turns the fields into a JSON schema),
4. the validator (`sanitize()` clamps whatever comes back).

That is the safety rail. The AI can only ever move those knobs, within those
limits. **A bad prompt can produce an ugly game; it cannot break the app.**
Adding a new thing children can change means editing one array.

Every change — from the AI, from the control panel, from undo — goes through a
single `applyConfig()` in `public/js/build.js`, so everything is saved,
undoable, and visible in the "what the AI wrote" tab.

---

## אבטחה / Keeping the API key safe

**The Anthropic key lives only in the server process.** It is never sent to a
browser and `.env` is gitignored. The repo can be public.

For the hosted setup (static site + your own proxy), children get a **workshop
code**. Be clear-eyed about what that is: the code is visible in devtools, so it
is not a secret. It is a cheap, expiring, revocable, rate-limited ticket — and
it is worth nothing to steal, because **this endpoint is not a general Claude
proxy**. It accepts one shape of request ("change this memory game") and returns
one shape of answer (a game config plus one short Hebrew sentence, hard-capped at
400 characters). Someone who copies a code can recolour a memory game. They
cannot generate arbitrary text.

| Env var | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required for the AI panel |
| `WORKSHOP_MODEL` | `claude-haiku-4-5` | swap to `claude-sonnet-5` if the panel misreads requests |
| `WORKSHOP_TOKENS` | unset | `"ABC123:דניאל,DEF456:נועה"` — unset means no code required (right for a laptop on a LAN) |
| `WORKSHOP_HOURLY_LIMIT` | `80` | requests per code per hour |
| `WORKSHOP_DAILY_LIMIT` | `1500` | everyone together, per day — the ceiling on what a bad day can cost |
| `WORKSHOP_EXPIRES` | unset | e.g. `2026-10-01`, after which codes stop working |
| `WORKSHOP_ORIGINS` | unset | CORS allowlist, e.g. `https://amitdobry.github.io` |

Hand a child a link like `...?t=ABC123` and they never type the code at all.

---

## אירוח / Hosting

GitHub Pages serves static files only, so it cannot hold a secret. Two halves:

- **Static half** (`public/`) → GitHub Pages. Works for playing and sharing.
- **AI half** (`server/ai.js` + `server/auth.js`) → a server you control.
  Set `API_BASE` in `public/js/api.js` to that origin and `WORKSHOP_ORIGINS`
  to your Pages origin.

On workshop day, the simplest reliable setup is no hosting at all: run
`npm start` on the instructor's laptop and let the room connect over wifi.

---

## להתאים לסדנה שלכם / Setting up a workshop

- **The children** — `public/js/users.js`. Change the names, pick avatars from
  `public/avatars/`. A fourth child is one more line.
- **The starting game** — `STARTER_CONFIG` in `public/js/schema.js`. It is
  deliberately grey, silent and generic. It must run perfectly and look
  unfinished: that gap is the workshop.
- **What children can change** — the `FIELDS` array in the same file.
- **Recovery** — every child has *undo* and *start over* in the top bar, and
  `localStorage` per browser. Nothing a child does can affect another child.

## קרדיטים / Assets

Avatar artwork comes from the SoulCircle project, resized to 256px webp by
`scripts/make-avatars.mjs` (needs `npm i -D sharp`, build-time only).
