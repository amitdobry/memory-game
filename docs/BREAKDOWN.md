# Memory Game / AI Workshop — full breakdown

A self-contained description of what was built, why it is shaped this way, and where
the product could go. Written to be handed to another model or another engineer with
no prior context.

**Status:** working demo, tested end to end against the live Claude API.
**Repos:** `amitdobry/memory-game` (public, static) + `LIVE` (private, holds the key).

---

## 1. What it is

A Hebrew, right-to-left memory-match game for children aged 10–13, built for an AI
workshop. The children do not learn *about* AI — they use AI to finish a real,
running app and walk out with a playable game that is visibly theirs.

The pedagogical rule the whole product is built around:

> **We build ~75% before the workshop. The children build the last 25% with AI.**

The prepared 75% is everything boring and fragile: the game engine, rendering, the
data model, persistence, responsive layout, error handling. It runs perfectly on
arrival — and looks deliberately unfinished. Grey, silent, generic, 4×4, called
"משחק זיכרון".

That gap is the curriculum. A child types *"תעשה לי לוח 6 על 6 עם נושא של ממתקים"*
and the board resizes, turns pink, and fills with sweets. The loop being taught is:

**Idea → Prompt → Read the answer → Test it → Notice it's wrong → Say it better**

---

## 2. Two repos, one key

```
┌─────────────────────────────┐          ┌──────────────────────────────┐
│  memory-game  (PUBLIC)      │          │  LIVE  (PRIVATE, Heroku)     │
│  static site, zero deps     │          │  already holds ANTHROPIC_API_KEY
│                             │  HTTPS   │                              │
│  index.html  pick a name    │ ───────► │  POST /api/workshop/edit     │
│  build.html  the workbench  │  + code  │  POST /api/workshop/banter   │
│  play.html   shareable game │          │  GET  /api/workshop/health   │
│                             │ ◄─────── │                              │
│  no key. ever.              │  config  │  src/workshop/  src/web/     │
└─────────────────────────────┘          └──────────────────────────────┘
```

**The single most important design decision:** the public repo holds no credential
and no code that would know what to do with one. It has **zero runtime
dependencies**. The AI lives in LIVE, which already had an Anthropic key, a dyno and
a deploy pipeline. The workshop borrows the credential and nothing else — it reads no
database, publishes no events, and touches none of LIVE's own pipeline.

### Why the endpoint is not a Claude proxy

Children get a short workshop code. It sits in the browser and anyone can read it in
devtools, so it is **not a secret**, and is not treated as one. What makes that
acceptable is the *shape* of the endpoint, not the secrecy of the code:

- it accepts one request shape and returns one answer shape — a memory-game config
  plus one Hebrew sentence hard-capped at 400 characters;
- the model is Haiku 4.5 with a 1000-token ceiling;
- the caller cannot name a model, supply a system prompt, or set a token budget.

A stolen code buys the ability to recolour a memory game. It cannot generate
arbitrary text. On top of that: per-code hourly limits, a global daily ceiling, an
expiry date, a CORS allow-list, and **fail-closed** behaviour (no codes configured →
503, never "open to everyone").

---

## 3. The architecture in one idea

`public/js/schema.js` is the **single source of truth**. Every knob a child can turn
is defined there exactly once, and that one file feeds all four consumers:

| Consumer | What it takes from the schema |
|---|---|
| the game engine | the values, at runtime |
| the control panel | one rendered control per field |
| the AI prompt (in LIVE) | the field list, types, limits, Hebrew labels |
| the validators | the clamp rules — on **both** sides |

This is the safety rail. **The AI can only ever move those knobs, within those
limits. A bad prompt makes an ugly game; it cannot break the app.** Adding something
new for children to change means editing one array.

Every change — from the AI, from the control panel, from undo — funnels through a
single `applyConfig()`, so everything is saved, undoable, and visible in the "what
the AI wrote" tab.

### Keeping two repos honest

LIVE needs the same field list to build its prompt. Two hand-maintained copies would
drift, and the symptom would be the AI confidently setting a field the game no longer
has. So there is one author and a generator:

```bash
npm run export:contract -- ../Live/src/workshop/contract.ts
```

It writes LIVE's copy **and** a hash into the client. The browser sends the hash on
every request; LIVE compares it and reports a mismatch rather than misbehaving
quietly. A drift becomes a message instead of a mystery.

### The 21 knobs

`mode` · `claudeSkill` · `claudeTalks` · `title` · `cols` · `rows` · `cardSet` ·
`customSymbols` · `timerSeconds` · `peekSeconds` · `flipBackMs` · `difficultyRamp` ·
`pointsPerMatch` · `penaltyPerMiss` · `speedBonus` · `theme` · `showTimer` ·
`showScore` · `sound` · `winMessage` · `loseMessage`

Nine card sets (31 hand-drawn avatars + eight 32-symbol emoji sets), seven colour
themes, and a `THEME_CARD_SET` table so that naming a *world* ("a candy theme")
changes the colours **and** the cards together — because a child who asks for candy
and gets candy cards on a grey background thinks you misunderstood them.

---

## 4. Three ways to play

- **לבד** — one player against the clock.
- **נגד קלוד** — turn-based against the AI, classic rules (a match earns another
  turn).
- **נגד חבר** — two children taking turns on one screen.

**Claude does not decide its moves.** Remembering where a card sat is a memory
problem, not a language problem, and a child should never wait on a network round
trip to watch a card turn over. Moves are computed in the browser, instantly and
offline. Difficulty is honest: *how much of what it saw it forgets* — easy 55%,
normal 20%, hard 0%.

What Claude *does* supply is the thing a lookup table cannot fake: a Hebrew reaction
between turns. If the network is down, a local line bank takes over, so a dead
connection costs personality, not playability.

---

## 5. שומר המדורה — the Firekeeper

The children do not talk to "an AI". They talk to a small campfire character who
hosts the session, introduces the workshop, and reacts to what just happened. Four
expressions — `warm`, `winking`, `concerned`, `ambient` — and **the model picks one
on every answer**, returned as `face` alongside the reply.

This is not decoration. A 10-year-old will happily argue with a character and will
not argue with a text box — and arguing with it ("no, I meant BIGGER") is precisely
the skill the workshop exists to teach.

The face name is validated against the four known values before it reaches an
`<img>`, and is **overridden to `concerned` whenever the child did not actually get
what they asked for**, regardless of what the model claimed. Honesty about failure is
a product requirement here, not a nicety.

The six-step onboarding is **scripted, not generated** — deliberately. It runs before
a child has a code, it must work when the venue wifi does not, it must be identical
for every child so an instructor can talk over it, and no 10-year-old should watch a
spinner to find out what the app is. The model's judgement is worth paying for when a
child asks for something; it is worth nothing for a sentence we already know we want
to say.

---

## 6. Ownership without a database

There is no database anywhere in this product.

- **Identity** — three children hard-coded in `users.js`. No accounts, no passwords.
- **Persistence** — each child's config in their own browser's `localStorage`.
- **Sharing** — the *entire game* is base64-encoded into the URL fragment. A finished
  game is a ~600-character link that works on any phone with **no server at all**,
  forever, even if LIVE is switched off.
- **Recovery** — undo stack plus "start over" in the top bar. Nothing a child does
  can affect another child.

This is the right amount of machinery for a one-day workshop with three children, and
it is the first thing that would have to change to become a product (see §9).

---

## 7. Cost

Haiku 4.5 at $1/$5 per million tokens. A child making ~30 real changes in a session,
with a cached system prefix, costs **single-digit cents**. The daily ceiling
(`WORKSHOP_DAILY_LIMIT`, default 1500 calls) is the hard cap on what a bad day can
cost. Banter adds one ~100-token call per turn and is the only part that scales with
play rather than with editing — it is switchable per child (`claudeTalks`).

Realistically: **a full workshop with three children costs under a dollar.**

---

## 8. What is tested, and what is not

**Verified end to end against the real API:** board resize + theme + timer in one
sentence; the 8×8 refusal with an honest Hebrew explanation; refusal of impossible
requests ("add new levels"); mode switching with difficulty; the gate (no code,
wrong code); all three play modes; the opponent remembering and winning a pair;
share-link round trip; the Firekeeper's six onboarding steps and his reactions.

**22 unit tests in LIVE**, all offline via a scripted client — the clamp, the enum
guard, the board rules, the reply cap, the face fallback, the "untrusted input never
enters the system prompt" boundary, and two tests that pin real bugs found during
development. LIVE's full suite: **1198 + 22 passing**.

**Not yet verified:** phone/tablet layout, the QR code (loads a CDN library), and
Enter-to-send (works via the send button; the keyboard path needs 30 seconds of human
hands). **Not built:** the workshop teaching materials — run sheet, prompt bank,
deliberate debugging examples. That is the real remaining gap for teaching, not code.

---

## 9. The business view

### Why this is more interesting than a memory game

The memory game is the *least* valuable part. What was actually built is a pattern:

> **A bounded, schema-driven surface that a language model is allowed to edit, with
> validation on both sides and a generated contract that stops the two halves
> drifting.**

Swap the schema and the same machine lets a non-technical person configure anything
by talking to it: a quiz, a shop's product page, a dashboard, a lesson plan. The game
is a demo of the mechanism.

### Paths, honestly assessed

| Path | Reality |
|---|---|
| **Paid workshops** | The nearest revenue. The asset is the *curriculum plus a working app*, and the app is now the easy half. Sell the day, not the software. |
| **Ad-supported kids' app** | Weakest of the three. Children's advertising is heavily regulated (COPPA in the US, GDPR-K in the EU), ad rates for under-13s are poor, and an AI text surface aimed at children raises a safety review most ad networks will not wave through. The app-store idea is fun; the ad model is the part that does not survive contact. |
| **B2B / white-label** | The strongest. Schools, after-school programmes and edtech vendors need "AI literacy" content and have none that is hands-on. Same engine, their branding, their schema. |

### What would have to change to be a product

1. **Real identity** — three hard-coded children does not survive a fourth classroom.
2. **A database** — localStorage means a child loses everything on a new device.
3. **Per-user cost control** — today's limits are in-memory and forgiven by a restart.
4. **Child-safety review** — an open text box in front of children needs moderation
   policy, logging and a parental-consent story before it is a product rather than a
   supervised workshop.
5. **Content pipeline** — the card art is borrowed from another project; a shipped
   product needs licensed or original assets.

None of these block the workshop. All of them block the App Store.

---

## 10. File map

**memory-game**
```
public/js/schema.js      ← the single source of truth. Start here.
public/js/game.js        the engine: three modes, one code path
public/js/opponent.js    Claude's moves — local, instant, offline
public/js/firekeeper.js  the character + the scripted onboarding
public/js/build.js       the workbench; applyConfig() is the only way anything changes
public/js/storage.js     localStorage + the share-link codec
public/js/api.js         the only file that knows LIVE exists
scripts/export-contract.mjs   generates LIVE's copy of the contract
```

**LIVE**
```
src/workshop/contract.ts      GENERATED — do not hand-edit
src/workshop/service.ts       the prompt, the parse, the clamp, the board rules
src/web/workshopRoutes.ts     the gate: codes, rate limits, CORS, fail-closed
tests/workshop.test.ts        22 offline tests
```
