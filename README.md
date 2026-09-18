# משחק זיכרון — סדנת AI לילדים (10–13)

Kids finish a memory game **with AI**. We build ~75% before the workshop; each
child builds the last 25% by telling Claude, in Hebrew, what they want changed —
then playing it, checking it, and fixing it when the AI got it wrong.

---

## This repo holds no credential

There is no API key here, no `.env`, and no code that would know what to do with
one. Every AI request goes to **LIVE**, which already holds an Anthropic key, over
two endpoints it exposes for this:

```
POST /api/workshop/edit     "make my board 6x6"  ->  a game config + one Hebrew sentence
POST /api/workshop/banter   "Claude just matched a pair"  ->  one Hebrew line
GET  /api/workshop/health   is the workshop switched on?
```

The server code is `src/workshop/` and `src/web/workshopRoutes.ts` in the LIVE repo.
That is why this repo can be public on a static host and still leak nothing.

**Every AI call is written down.** LIVE meters each `edit` and `banter` call through
its cost ledger — tokens from the provider's usage payload, priced per call the moment
it returns — and the owner's private Engine Room (`/engine` on LIVE, Basic Auth,
refreshes every 10 seconds) has a **Kids Workshop** panel showing spend today, spend
total, cost per call, failures, the door state and quota, and the newest twenty calls.
That is the bill, not an estimate.

**Runtime dependencies: zero.** No build step, no bundler, no framework, no
database. Node is used only to serve the folder during development.

---

## הפעלה מהירה / Quick start

Two servers, because the AI lives in the other one:

```bash
cd ../Live && WORKSHOP_OWNER_PASSWORD="pick-something" LIVE_ALLOWED_ORIGINS="http://localhost:3000" npm run web
```

```bash
npm start
```

Then open http://localhost:3000/workshop.html, pick a child, and when the Firekeeper
asks for the password type the owner password (or an eight-digit code minted with it
— see *The door* below). `npm start` also prints a LAN address that phones and tablets
on the same wifi can use. http://localhost:3000/ is the public landing page.

---

## מה יש כאן / What this is

| Page | What it does | Needs a server? |
|---|---|---|
| `/` | The public landing page for parents: what the workshop is, the ten meetings, a WhatsApp contact | no |
| `/workshop.html` | Pick your name (3 children + an instructor, hard-coded) — the classroom entry | no |
| `/build.html?u=kid1` | The workbench: game + AI chat + control panel + code view | only for the AI panel |
| `/play.html#<code>` | Somebody's finished game, whole config packed into the URL | **no** |

`play.html` carries the entire game in its own link, so finished games are shared by
link or QR and played on any phone with nothing hosted at all.

### שלושה מצבי משחק / Three play modes

- **לבד** — one player against the clock.
- **נגד קלוד** — turn-based against the AI. Its *moves* are decided locally and
  instantly (`public/js/opponent.js`), because remembering where a card sat is a
  memory problem, not a language problem, and a child should not wait on a network
  round trip to watch a card turn over. Difficulty is honest: how much of what it
  saw it forgets (easy 55% / normal 20% / hard 0%). What Claude *says* between turns
  does come from the model, and falls back to a local line bank when the network is
  down — so a dead connection costs personality, not playability.
- **נגד חבר** — two players taking turns on the same screen.

---

## הארכיטקטורה בשורה אחת / The architecture in one line

`public/js/schema.js` is the single source of truth. Every knob a child can turn is
defined there exactly once, and that one file feeds **all four** of:

1. the game engine (reads the values),
2. the control panel (renders a control per field),
3. the AI prompt in LIVE (built from the field list),
4. the validator (clamps whatever comes back — on both sides).

That is the safety rail. The AI can only ever move those knobs, within those limits.
**A bad prompt can produce an ugly game; it cannot break the app.** Adding something
new for children to change means editing one array.

Every change — from the AI, from the control panel, from undo — goes through a single
`applyConfig()` in `public/js/build.js`, so everything is saved, undoable, and visible
in the "what the AI wrote" tab.

### Keeping the two repos honest

LIVE needs the same field list to build its prompt, and two hand-maintained copies is
a drift bug waiting to happen — the symptom being the AI confidently setting a field
the game no longer has. So there is one author and a generator:

```bash
npm run export:contract -- ../Live/src/workshop/contract.ts
```

It writes LIVE's copy **and** a hash into `public/js/contract.js`. The browser sends
that hash on every request; LIVE compares it to its own and reports a mismatch rather
than misbehaving quietly. **Run it after every change to `schema.js`.**

---

## אבטחה / The door

Three doors, one grant (`LIVE/src/workshop/access.ts`): the owner's permanent password
(`WORKSHOP_OWNER_PASSWORD`, a 12-hour grant), an eight-digit code the owner mints with
`POST /api/workshop/mint` that dies after 20 minutes, and — dormant until a mail key
exists — asking the owner by email. Whatever the door, the browser ends up holding an
opaque grant in `localStorage` and sends it as `x-workshop-access`.

Be clear-eyed about what that grant is: it sits in the browser and anyone who opens
devtools can read it, so it is **not a secret**. Three things make that fine, and none
of them is the grant:

1. **The endpoint is not a Claude proxy.** It takes one request shape and returns one
   answer shape — a memory-game config plus one Hebrew sentence capped at 400
   characters, on Haiku, with a 1000-token ceiling. The caller cannot name a model or
   supply a prompt. A stolen grant buys the ability to recolour a memory game.
2. **It is rate-limited** per grant per hour, and capped across everything per day.
3. **It expires**, which is the real answer to a grant that has leaked.

Configured in LIVE's environment (`WORKSHOP_OWNER_PASSWORD`, `WORKSHOP_EXPIRES`,
`WORKSHOP_HOURLY_LIMIT`, `WORKSHOP_DAILY_LIMIT`). It **fails closed**: with no owner
password set and no live code, `/unlock` answers 401 "הסדנה עדיין לא נפתחה" and
`/health` reports the password door shut.

---

## אירוח / Hosting

- **This repo** → GitHub Pages, or any static host. Nothing to configure but
  `API_BASE` in `public/js/api.js`, pointed at LIVE's origin.
- **LIVE** → already on Heroku. Add the workshop origin to `LIVE_ALLOWED_ORIGINS`
  or the browser will block the call.

On workshop day the simplest reliable setup is `npm start` on the instructor's laptop
with the room on the same wifi — only the AI panel needs the internet.

---

## להתאים לסדנה שלכם / Setting up a workshop

- **The children** — `public/js/users.js`. Change the names, pick avatars from
  `public/avatars/`. A fourth child is one more line.
- **The starting game** — `STARTER_CONFIG` in `public/js/schema.js`. It is
  deliberately grey, silent and generic. It must run perfectly and look unfinished:
  that gap is the workshop.
- **What children can change** — the `FIELDS` array in the same file. Re-run the
  contract export afterwards.
- **Recovery** — every child has *undo* and *start over* in the top bar, and their
  game is kept in their own browser. Nothing a child does can affect another child.

## קרדיטים / Assets

Avatar artwork comes from the SoulCircle project, resized to 256px webp by
`scripts/make-avatars.mjs` (needs `npm i -D sharp`, build-time only).
