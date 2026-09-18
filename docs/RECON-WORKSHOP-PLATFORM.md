# Reconnaissance — workshop acquisition and demo platform

Written 18 September 2026. Read-only. Nothing in any repository, database, Heroku config or
GitHub setting was changed while producing this.

Scope: the safest, smallest path from today's landing page + Memory Game into one connected
public experience with distributor attribution, lead management, commissions and a bounded AI
demonstration. The brief is `CLAUDE-RECON-PROMPT-WORKSHOP-PLATFORM.md`; the previous session
is `SESSION-REPORT.md`.

**How to read this.** Every claim is tagged. **[verified]** means I read the code, ran a
read-only request, or saw the output myself, and the file and symbol are named. **[reported]**
means a document says so and I did not independently confirm it. **[recommendation]** is my
proposal. Where the brief's premise and the repositories disagree, section 3 says so.

> **Historical document.** Sections 1–11 are the reconnaissance as written on 18 September 2026, before any code existed. Where later work superseded a recommendation, the passage is marked *Historical* inline and the accepted replacement is named; §12a and §12b hold the corrections and the rollout order, and `RELEASE-CHECKLIST-INTAKE.md` and `PLAN-OWNER-ACQUISITION-VIEW.md` are the current operational documents. Verified facts in §1 remain facts about that date.

Decisions Amit has already made for this work (18 September 2026):

- this session is reconnaissance only; no code until approved;
- the six QR codes are **not printed**, so the public URL is still open;
- the report lives here, in `memory-game/docs/`;
- I draft the improved Hebrew lesson copy as a proposal (`LANDING-COPY-PROPOSAL.md`), not as
  an edit to the page.

---

## 1. Current topology

### 1.1 Repositories and where they run

| System | Repo / path | Branch | Deployed at | Verified |
|---|---|---|---|---|
| Memory Game (public client) | `amitdobry/memory-game` (this repo) | `main` | `https://amitdobry.github.io/memory-game/` → HTTP 200 | [verified] `curl`, 18 Sep |
| LIVE (private backend) | `amitdobry/live`, checked out beside this repo as `../Live` | `product/web-v0`; `heroku/main` is at the same commit `6143d27` | `https://live-intelligence-f6ec7b9df867.herokuapp.com` → `/health` 200 `{"status":"ok","database":"connected"}` | [verified] `git branch -r`, `git log heroku/main`, `curl` |
| Landing page | a single `index.html` in a local `landing-page` folder next to the `workshop-game` checkout (not in any repo at the time of the recon; now `public/index.html` here) | not a repo | **nowhere**. `https://amitdobry.github.io/` → HTTP 404 "Site not found" | [verified] `curl` |
| workshop-game (Days 2–5 skeleton) | `amitdobry/workshop-game`, local `...\App 2 - day 2-5\workshop-game` | `master` | `https://amitdobry.github.io/workshop-game/` → 200 | [verified]; out of scope by instruction |
| LIVE product SPA | `Live/web/` | same | Vercel (URL not needed here) | [verified] `web/vercel.json` |

### 1.2 Memory Game — the public half

- Plain static files, zero runtime dependencies, no build. `package.json` has no `dependencies`.
  Pages deploys `public/` via `.github/workflows/pages.yml` (`upload-pages-artifact` with
  `path: public`) on push to `main`. [verified]
- Three pages: `public/index.html` (pick a child), `public/build.html` (workbench),
  `public/play.html` (shared game, whole config in the URL fragment). [verified]
- The only file that knows LIVE exists is `public/js/api.js`. `resolveBase()` returns
  `PRODUCTION_API = https://live-intelligence-f6ec7b9df867.herokuapp.com` for any host that is
  not localhost or a LAN IP. Every AI request is `POST ${API_BASE}/api/workshop/<route>` with
  header `x-workshop-access: <grant token>` and body `{...payload, contract: CONTRACT_VERSION}`.
  [verified] `api.js: post()`
- The grant lives in `localStorage["workshop:grant"]` as `{token, expiresAt, owner}`; an
  expired grant is dropped client-side (`api.js: getGrant()`). [verified]
- The door: `build.js: askForPassword()/handleLocked()` swaps a password input into the chat
  box and calls `api.unlock(password)` → `POST /api/workshop/unlock`. A 401/403 on `/edit`
  clears the grant and re-asks. [verified]
- Identity is three hard-coded children plus an instructor in `public/js/users.js`;
  `build.html?u=<id>` must match or `build.js` redirects to `index.html`. [verified]
- Paid call sites from the browser: `requestChange` → `/edit` (one per chat message), and
  `requestBanter` → `/banter` (one per turn, when `mode === "claude"` and `claudeTalks`,
  serialised by a `speaking` flag; `game.js: say()`). `play.html` also wires `requestBanter`,
  so a shared game with no grant sends a request per turn that fails 401 and falls back to a
  canned line. [verified]
- Schema contract: `public/js/schema.js` is the single source; `scripts/export-contract.mjs`
  writes `Live/src/workshop/contract.ts` and a 12-hex hash into `public/js/contract.js`.
  Current hash `f79665a639d7`, matching what LIVE's health endpoint reports. [verified]

### 1.3 LIVE — the trusted half

- Node ≥ 24 running TypeScript natively, `mongoose ^9`, `zod`, `@anthropic-ai/sdk`,
  `migrate-mongo` (release phase: `Procfile: release: npm run migrate:up`). No auth or hashing
  library beyond `node:crypto`. [verified] `package.json`
- One HTTP server, `src/web/server.ts: route()`. Order matters and is documented in the code:
  1. `auth/routes.ts` (Google sign-in, `/api/me`, `/auth/logout`)
  2. `advisorRoutes.ts`, `assignmentRoutes.ts` (session-scoped personal surfaces)
  3. **`workshopRoutes.ts`** — `/api/workshop/*`
  4. `/api/bakeme/*` — session cookie authority
  5. `/api/lab/*` — operator Basic-auth authority
  6. **read-only guard**: any other non-GET → `405 read-only`
  7. HTML pages: `/`, `/today`, `/engine` (Basic auth, fails closed 503 when unconfigured), `/health`. [verified]
- Three authorities already exist, deliberately distinct: a signed-in person (cookie
  `live_session`, `auth/sessions.ts`), the operator (`basicAuth.ts`, env `ENGINE_ROOM_USER/PASSWORD`),
  and the workshop grant (`workshop/access.ts`). [verified]
- CORS: `apiHelpers.ts: corsHeaders()` echoes the request origin only if it is in the list set
  by `configureCors()` from `LIVE_ALLOWED_ORIGINS` (`server.ts: main()`); never `*`, asserted
  by `tests/apiSurface.test.ts "CORS is never a wildcard"`. The workshop router widens
  `access-control-allow-headers` to include `x-workshop-access` locally
  (`workshopRoutes.ts: applyCorsAndPreflight`). [verified]
- **The GitHub Pages origin is already allow-listed in production.** An `OPTIONS
  /api/workshop/edit` with `Origin: https://amitdobry.github.io` returned
  `Access-Control-Allow-Origin: https://amitdobry.github.io`. Any page under that origin
  (landing included) can call LIVE today with no config change. [verified] `curl`, 18 Sep
- Public workshop health, live: `{"ok":true,"contract":"f79665a639d7","model":"claude-haiku-4-5",
  "expires":"2026-10-15","doors":{"password":true,"approval":false},"tempCodeMinutes":20}`.
  So `WORKSHOP_OWNER_PASSWORD` is set, `WORKSHOP_EXPIRES=2026-10-15`, mail is not configured. [verified]
- Mongo conventions: every model uses `db/schemaOptions.ts: baseSchemaOptions` —
  `strict: 'throw'`, `strictQuery: 'throw'`, `autoCreate: false`, `autoIndex: false`.
  **Collections and indexes exist only if a migration created them.** Migrations are TS files
  in `migrations/`, raw-driver only, run by `migrate-mongo` at release. 29 migrations exist; the
  most relevant pattern is `20260828160000-identity-and-sessions.ts` (create collection, unique
  index, TTL index, partial unique index, with the `sparse` vs `partialFilterExpression` lesson
  written down). [verified]
- Cost ledger: `telemetry/costRecorder.ts: trackModelCall(spec, fn)` writes one `cost_events`
  row per model call, success or failure, priced from the provider's usage payload.
  `CostAttribution` accepts `runId`, `userId`, `channel` and a few pipeline ids. The workshop
  files under `clause: 'workshop'`, `channel: 'kids-workshop'`, operations `workshop.edit` /
  `workshop.banter` (`workshop/service.ts: metered()`), and the Engine Room reads them back
  (`web/workshopView.ts`, `engineRoom.ts: renderWorkshop`). [verified]
- Tests: `vitest` offline lane (1220 tests per the spec, [reported]) plus a DB-backed
  integration lane whose `tests/integration/setup.ts` **refuses to run if `ANTHROPIC_API_KEY`
  is set**. `npm run predeploy` = typecheck + tests + integration + slug boot check
  (`verify:slug:boot`, added after the 22 Aug outage described in `DEPLOY.md`). [verified]
- Heroku: app `live-intelligence`, two dynos (`web`, `worker`), EU per `DEPLOY.md` [reported].
  `.slugignore` excludes `/web` (the Vercel SPA) with a comment explaining why the leading slash
  is load-bearing. [verified]

### 1.4 The Memory Game access flow, end to end [verified]

```
browser  build.html?u=kid1
  │  no grant in localStorage → Firekeeper asks for a password (build.js: askForPassword)
  ├─► POST /api/workshop/unlock {password}
  │     workshopRoutes.ts: unlockWithPassword(password, callerKey(req))
  │       access.ts: throttle 10 attempts / 10 min per caller key
  │       owner password (env, constant-time compare) → grant 12h, door 'owner'
  │       8-digit minted code (in-memory Map) → grant dies with the code (≤20 min), door 'code'
  │       otherwise 401 'הסיסמה לא נכונה'
  │     ◄─ {token: 48 hex chars from randomBytes(24), expiresAt, owner}
  │     stored in localStorage["workshop:grant"]
  │
  ├─► POST /api/workshop/edit   header x-workshop-access, body {message, config, contract}
  │     workshopRoutes.ts: admit(req)
  │       WORKSHOP_EXPIRES passed → 403 | daily total ≥ 1500 → 429 | no header → 401
  │       checkGrant(token) null → 403 (browser returns child to the door)
  │       > 80 calls/hour for this token → 429
  │       dayCount += 1  (in memory; reset at local-date rollover; forgotten on dyno restart)
  │     service.ts: editGame() → metered('workshop.edit') → trackModelCall → Haiku, 1000 tokens
  │       clamp() + fitBoard() server-side; reply ≤ 400 chars; face validated
  │     ◄─ {reply, config, notes, face, contract, contractWarning?}
  │
  └─► POST /api/workshop/banter  same gate; service.ts: banter() → 100 tokens
```

Grants, minted codes, pending approvals and the per-caller attempt counters are all
`Map`s in `access.ts`; the hourly/daily counters are `Map`/globals in `workshopRoutes.ts`.
The code says this is deliberate for a one-day surface and names "the moment to move it" as
"if this ever outlives a single day". A public demo outlives a single day. [verified]

### 1.5 The landing page batch flow, end to end [verified] (`landing-page/index.html`, `<script>` at the bottom)

1. `?b=` read from the URL, accepted only if `/^[1-6]$/`.
2. If present, written to `localStorage["leaflet_batch"]` (**overwrites** any earlier batch);
   if absent, read back from it. So the page implements **last touch**, not first touch, and
   keeps no history.
3. Hidden form field `batch` = `עלון N` or `ישירות לאתר`.
4. WhatsApp deep link text gets ` (מעלון N)` appended (`waLink()`).
5. GA4 events tagged `leaflet_batch` — only if `GA4_ID` is set; it is empty.
6. Submit: with `FORM_ENDPOINT` empty (it is), the form validates four required fields and
   opens WhatsApp with every field in the message. With an endpoint, it POSTs `FormData` to
   Formspree and includes a Formspree-specific `_subject` hidden field.
7. The QR codes encode `https://amitdobry.github.io/?b=1..6` per `SETUP.md §4` and
   `SESSION-REPORT.md C.6`. [reported] I did not decode the SVG/PNG files myself.

### 1.6 Trust boundaries today

```
 PUBLIC, no secrets                       │  TRUSTED (Heroku, EU)
 amitdobry.github.io/memory-game/ ────────┼──► LIVE /api/workshop/*   grant header, CORS allow-list
 (landing page: not deployed)             │    ANTHROPIC_API_KEY, MONGODB_URI live here only
 localStorage: grant, config, batch       │    Engine Room /engine   Basic auth (operator)
                                          │    Vercel SPA → /api/bakeme  cookie session (person)
```

---

## 2. What can be reused

| Need | Existing component | Where | Fit |
|---|---|---|---|
| Bounded AI surface | `editGame`, `banter`, prompt built from the contract, server-side clamp | `Live/src/workshop/service.ts` | Reuse as is. Nothing about the request shape changes. |
| Per-call metering and the bill | `trackModelCall`, `cost_events`, Engine Room "Kids Workshop" panel | `telemetry/costRecorder.ts`, `web/workshopView.ts` | Reuse. `CostAttribution.runId` (string) or `channel` can carry a demo-grant id with **no schema change**. |
| Grant lifecycle shape | `issue / checkGrant / sweep`, `x-workshop-access` header, 401-vs-403 semantics | `workshop/access.ts`, `workshopRoutes.ts: admit` | Reuse the *shape*; add a fourth door whose grant is durable and quota-bearing (§4). |
| Brute-force throttle | `tooManyAttempts(from)` 10/10 min | `access.ts` | Reuse for lead submission and distributor login, **after fixing the caller key** (§9.7). |
| Constant-time secret compare | `sameSecret()`, `basicAuth.ts: matches()` | both | Reuse. |
| Opaque, hashed, revocable server sessions | `createSession / resolveSession / revokeSession`, SHA-256 of a 256-bit token, TTL index, sliding window, HttpOnly SameSite=Lax cookie | `web/auth/sessions.ts`, `models/session.model.ts`, migration `20260828160000` | Reuse the pattern for distributor sessions (own collection; see §5). |
| Ownership as the filter, not a check | `{ ownerUserId: session.user._id }` queries; unknown id → 404 indistinguishable from not-yours | `web/assignmentRoutes.ts` | Copy this exact discipline for distributor reads. |
| Operator authority for the owner | Basic auth, fails closed, already used cross-origin by the Lab SPA | `basicAuth.ts`, `server.ts` (`/api/lab`, `/engine`) | The owner dashboard needs **no new authentication** (§4). |
| Migration discipline | raw-driver TS migrations, named indexes, `up/down`, release-phase run | `migrations/*.ts`, `migrate-mongo-config.js` | Every new collection and index goes here first. |
| Offline model tests | `scriptedClient`, `useClient(injected)`, `CostEvent.create` spy | `tests/workshop.test.ts`, `tests/workshopLedger.test.ts` | Pattern for quota/attribution/commission tests that never spend. |
| Owner-scoped integration tests | `tests/integration/ownershipBoundary.test.ts`, `webAuthBoundary.test.ts` | LIVE | Pattern for "distributor A cannot see distributor B". |
| Landing page | design tokens, sections, form, batch reading, WhatsApp fallback | `landing-page/index.html` | Reuse whole; swap Formspree for a LIVE endpoint; keep WhatsApp as the failure path. |
| Batch attribution UX | `?b=N`, localStorage memory, WhatsApp stamp | same | Keep as the **alias** layer over durable batch records (§5). |
| Share links | `play.html#<base64url config>` | `public/js/storage.js: shareUrl` | Untouched by anything proposed here. |

---

## 3. Conflicts and corrections

1. **"Migrate the landing page into the Memory Game app" collides at `/`.** `public/index.html`
   in memory-game is the children's name picker and `build.js` hard-codes
   `location.replace("index.html")` as its fallback. The landing page also wants to be `/`.
   One of them moves. [verified] Resolution in §8.
2. **The QR codes point at the root user site; the Memory Game is on a sub-path.** The codes
   encode `https://amitdobry.github.io/?b=N` [reported]; the only live deployment is
   `https://amitdobry.github.io/memory-game/`; the root returns 404 [verified]. Since the codes
   are not printed, this is a URL decision, not a migration problem. §8 and §12.1.
3. **Every limit and every grant is in memory.** `access.ts` and `workshopRoutes.ts` say so and
   say why. A dyno restart (daily on Heroku, plus every deploy) forgets all grants and all
   counters. Acceptable for a classroom; not for "50 calls per visitor" over weeks. The brief's
   request for a durable, revocable, idempotent quota is therefore a **new** capability, not a
   tuning of the existing one. [verified]
4. **The whole surface switches off on 15 October 2026.** `WORKSHOP_EXPIRES=2026-10-15` is
   live and applies to every route via `admit()`. A public demonstration for the *next* cohort
   would die with the first cohort's switch. The demo needs its own switch (§4, §12). [verified]
5. **Grant tokens are not "stored" today, so there is nothing to hash — yet.** They exist only
   in a `Map`. The moment demo grants become durable they must be stored as SHA-256 hashes,
   exactly as `sessions.tokenHash` is, and never as bearer values. [verified pattern]
6. **Formspree conflicts with "the server owns durable attribution" and with data about
   minors.** Leads would sit in a third-party inbox, 50/month on the free tier
   (`SETUP.md §2` [reported]), with no link to a visit, a batch record or a quota. Replace it
   with a LIVE endpoint; keep the WhatsApp fallback. [recommendation]
7. **The page currently promises "אין שמירה של פרטים באתר" and the form has no consent
   checkbox.** Both become false the moment LIVE stores a lead. The copy and a short privacy
   notice must change in the same increment as the endpoint (§9.10). [verified]
8. **The page's batch memory is last-touch only.** A parent who scans leaflet 2, then leaflet 5,
   is credited to 5 and the 2 is gone. The brief wants first, latest and credited touch kept
   apart. The server must record all three; the page can send what it knows (§10). [verified]
9. **Distributors do not need lead PII.** The form's required contact is the parent's *phone*;
   email is optional. Showing a distributor "name, email, status" as the brief expects would
   hand out the least useful field and still leak identity. §9.9 proposes what they see.
10. **"50 calls" is ambiguous in a way that matters for cost.** `banter` fires once per turn in
    a Claude game; a single 4×4 match can spend 10–16 banter calls, a 6×6 game 30+. If banter
    counts toward 50, a parent's quota is gone in two games without ever asking the AI to
    change anything. §6.3 and §12.3.
11. **Two existing conventions must not be bent.** `src/ai/routing.ts` is governed and the
    workshop deliberately stays out of it (`service.ts` header) — the acquisition work must
    also stay out. And `tests/apiSurface.test.ts` asserts the product/Lab split and no-wildcard
    CORS; new route files are free to exist but must keep those invariants. [verified]
12. **Stale documentation that will mislead the next engineer.** `memory-game/README.md`
    says `?t=TEST01` puts the code in the browser and names `WORKSHOP_CODES`; neither exists in
    `api.js`, `build.js` or `access.ts` (the door is `WORKSHOP_OWNER_PASSWORD` plus minted
    codes). `Live/src/web/server.ts`'s comment above `workshopRoute` still says "With no
    WORKSHOP_CODES configured it answers 503". [verified] Listed with the other small bugs in §13.

---

## 4. Recommended target architecture

**One recommendation:** keep the public site static on GitHub Pages inside `memory-game`,
keep every trusted operation in LIVE, and **put the two authenticated dashboards on LIVE's own
origin rather than on the static site.**

```
 amitdobry.github.io/memory-game/            (public, static, no secrets, no auth)
   /                 landing page  (?b=N and ?ref=CODE)
   /try.html         the parent demo entry: lead form → demo grant → workbench
   /workshop.html    the classroom picker (today's index.html, moved)
   /build.html       workbench (unchanged; accepts a demo user)
   /play.html        shared games (unchanged; every existing link keeps working)

 live-intelligence…herokuapp.com              (trusted)
   POST /api/acquisition/visit                 optional visit beacon with ref + visitor id
   POST /api/acquisition/lead                  the lead; rate-limited; idempotent
   POST /api/acquisition/demo/claim            door 4: a durable 50-call grant for a lead
   /api/workshop/*                             unchanged shape; admit() learns 'demo' grants
   GET/POST /distributor/*                     server-rendered pages, cookie session (HttpOnly)
   GET  /engine  (+ new acquisition panel)      owner reads, Basic auth (exists)
   POST /api/owner/*                            owner writes, Basic auth (same credential as /engine)

 optional: repo amitdobry.github.io with one index.html that redirects / → /memory-game/ keeping the query
```

Why the dashboards live on LIVE and not on the static site:

- **Cookies.** LIVE's session cookie is `SameSite=Lax; HttpOnly` and the product SPA only works
  because Vercel rewrites `/api/*` to Heroku so the cookie is same-origin
  (`web/vercel.json`, `sessions.ts` comment "the application proxy makes the API same-origin").
  GitHub Pages has no proxy. A cookie usable from `amitdobry.github.io` would need
  `SameSite=None; Secure` — a third-party cookie Safari drops — or a bearer token in
  `localStorage`, which `sessions.ts` explicitly rejects ("readable by any injected script by
  definition"). Serving `/distributor` from LIVE makes the *existing* mechanism correct with no
  new cookie policy. [verified reasoning from those files]
- **CSRF.** Same-origin forms + `SameSite=Lax` + the `originPermitted()` check already in
  `auth/routes.ts` cover state changes. On a cross-origin static site you would be inventing a
  token scheme.
- **Owner authority already exists.** `/engine` is Basic-auth, fails closed, and already has a
  Kids Workshop panel. Owner *reads* extend that page; owner *writes* mount as `POST /api/owner/*`
  behind the same `isAuthorised()` check the `/api/lab` prefix uses. No new login, no new
  credential type, and the Lab SPA already proves Basic works from a browser cross-origin if a
  static `/admin` page is ever wanted later.
- **LIVE already renders HTML** (`/`, `/today`, `/engine`), so a small server-rendered
  distributor surface is in character, and it avoids a third frontend build.

Alternative kept open (only if Amit wants one public origin for everything): static
`/distributor` and `/admin` pages in `memory-game` calling LIVE with `Authorization: Bearer`
tokens stored in `sessionStorage`. Same hashed-token session table; `resolveSession` gains a
header path. Costs: XSS exposure of the token, a CSRF story of its own, a second copy of every
screen's logic in vanilla JS. I do not recommend it for V1.

What does **not** change: `/api/workshop/edit|banter|unlock|mint|health` shapes,
`schema.js`/contract, the classroom doors, `play.html` links, `workshop-game`.

---

## 5. Domain model

All new collections are prefixed `acq_` (acquisition) so they read as one product inside LIVE's
database, the way `bakeme_*` does. Every collection and index is created by a migration; models
use `baseSchemaOptions`. Money is integer agorot, matching `cost_events`' integer-micros rule.
[recommendation throughout]

### 5.1 `acq_distributors`
| field | notes |
|---|---|
| `email` (unique, lowercased) | login identifier |
| `displayName` | shown to the owner and on their own page |
| `passwordHash`, `passwordSalt`, `kdf: {name:'scrypt', N, r, p, keylen}` | Node `crypto.scrypt`, per-user 16-byte salt. No dependency, well-maintained, already in the runtime. Params stored so they can be raised later without a flag day. |
| `status: 'invited' \| 'active' \| 'disabled'` | invite-only; the owner creates the record |
| `inviteTokenHash`, `inviteExpiresAt` | one-time set-password link; hashed like a session token; TTL ~72h; cleared on use. Doubles as the reset flow. |
| `createdAt/updatedAt` | timestamps |

Indexes: `email` unique; `inviteTokenHash` unique partial `{$type:'string'}`.
Why not `users`: `users` is LIVE's product identity — Google-only (`AUTH_PROVIDERS = ['google']`),
carries `notificationPolicy`/`consent`, and `USER_ROLES` are `builder|reader|admin`. A distributor is
an actor of a different product; folding them in would widen LIVE's identity core for a leaflet
programme. Separate collection, same disciplines.

### 5.2 `acq_distributor_sessions`
A copy of `sessions` (`tokenHash` unique, `distributorId`, `expiresAt` TTL, `lastSeenAt`,
`userAgent` ≤200 chars, no IP). Cookie name `acq_session`, `Path=/distributor`, HttpOnly,
SameSite=Lax, Secure in production. TTL 24h (shorter than LIVE's 72h: the audience is occasional).

### 5.3 `acq_batches`
| field | notes |
|---|---|
| `code` (unique) | stable public referral code, e.g. `Y7K2` — letters/digits, no ambiguous glyphs, 4–6 chars; used as `?ref=CODE` |
| `legacyNumber` (unique partial, 1–6) | alias for today's `?b=N` so the printed leaflets, when printed, keep working |
| `label` | "בית ספר X, ספטמבר" |
| `distributorId` (nullable) | null = owner's own batch |
| `status: 'active' \| 'retired'` | retired codes still resolve for attribution, but a new scan is flagged |
| `createdAt`, `retiredAt` | |

### 5.4 `acq_visits`
One row per **visitor**, not per hit. The page generates `visitorId` (random UUID in
`localStorage`; absent in private browsing → each visit is its own visitor).
| field | notes |
|---|---|
| `visitorId` (unique) | |
| `firstBatchId`, `firstSeenAt` | first touch, immutable |
| `lastBatchId`, `lastSeenAt` | latest touch |
| `hits` | counter; scans of the same phone do not create visitors |
| `userAgent` (truncated) | no IP stored, matching `sessions` |
| `leadId` (nullable) | *Historical.* Implemented as the **latest** lead from this browser, with `leadCount` counting them (slice 3); the many-to-one direction is the lead's `visitorId`, indexed |

Indexes: `visitorId` unique; `firstBatchId`, `lastBatchId`. TTL on `lastSeenAt` of ~180 days
for visitors that never became leads (retention, §9.11).

### 5.5 `acq_leads`
| field | notes |
|---|---|
| `parentName`, `phone` (E.164), `email?`, `studentName`, `grade`, `note?` | what the form collects today; `studentName` may be a first name only (§9.9) |
| `phoneKey` | normalised digits, indexed (not unique) for duplicate **detection** |
| `attribution.firstBatchId`, `attribution.lastBatchId` | copied from the visit at submit time (or from what the page sends) |
| `attribution.creditedBatchId`, `attribution.creditedDistributorId` | the one that counts; default = first touch (§10); changed only by the owner, audited |
| `attribution.source: 'qr' \| 'ref' \| 'direct' \| 'manual'` | |
| `status` | `submitted → contacted → trial_booked → enrolled`, or terminal `not_interested \| invalid_contact \| duplicate`; §6.1 |
| `duplicateOf` (nullable leadId) | set by the owner when marking `duplicate`; never auto-merged |
| `consent: {privacyVersion, capturedAt}` | required; the form's checkbox |
| `idempotencyKey` (unique) | client UUID per submission attempt; a retry returns the same lead |
| `visitorId?` | join to `acq_visits` |
| `createdAt/updatedAt` | |

Indexes: `idempotencyKey` unique; `phoneKey`; `attribution.creditedDistributorId, createdAt`;
`status`.

### 5.6 `acq_enrolments`
Commercial facts, separate from funnel facts.
| field | notes |
|---|---|
| `leadId` (unique) | one enrolment per lead in V1 |
| `cohort` | free text: "מחזור 1 — אוקטובר 2026" |
| `status: 'enrolled' \| 'cancelled' \| 'refunded'` | |
| `payment.fullyPaidAt` (nullable), `payment.amountAgorot?`, `payment.recordedAt` | the owner records full payment manually; the *fact* is the date; the amount is optional |
| `refundedAt?` | |

### 5.7 `acq_commissions` — a ledger, not a computed view
| field | notes |
|---|---|
| `enrolmentId` | *Historical.* Implemented as an explicit `activeAward` boolean with a partial unique index `{enrolmentId}` where `activeAward: true` (§12a correction 1): one earned/paid award per enrolment, reversed rows kept |
| `distributorId`, `batchId`, `leadId` | evidence, copied at award time so a later reassignment does not rewrite history |
| `amountAgorot: 15000` | ₪150 |
| `status: 'earned' \| 'paid' \| 'reversed'` | §6.4 |
| `earnedAt`, `paidAt?`, `reversedAt?`, `reversalReason?` | |

### 5.8 `acq_demo_grants` and `acq_demo_uses`
| `acq_demo_grants` | notes |
|---|---|
| `leadId` | *Historical.* Implemented as an explicit `revoked` boolean with a partial unique index `{leadId}` where `revoked: false` (§12a); revoked grants stay as history and a new grant may follow |
| `tokenHash` (unique) | SHA-256 of the 24-byte token the browser holds; never the token |
| `total: 50`, `remaining` | |
| `expiresAt` (TTL) | e.g. 14 days |
| `revokedAt?`, `revokedBy?` | owner action |

| `acq_demo_uses` | notes |
|---|---|
| `grantId`, `requestId` (compound unique) | the browser sends a fresh `requestId` per attempt; a retry of the same request consumes nothing |
| `operation: 'edit' \| 'banter'` | |
| `at`, `costEventId?` | link to the bill |

Consumption is two writes: insert the use (unique index rejects a replay), then
`findOneAndUpdate({_id, remaining: {$gt: 0}, revokedAt: null}, {$inc: {remaining: -1}})`; if the
second returns null, delete the use and answer 429 "המכסה נגמרה". Single-document atomicity
is enough; no transaction needed.

### 5.9 `acq_audit` — append-only
`{at, actor: {kind: 'owner'|'distributor'|'system', id?}, action, subject: {collection, id},
before, after, note}`. Written by every owner write in §7.3 and by status transitions. Read
in the Engine Room. Indexed on `subject.id` and `at`.

---

## 6. State machines

### 6.1 Lead (funnel)
```
submitted ──► contacted ──► trial_booked ──► enrolled
   │              │              │
   └──────────────┴──────────────┴──► not_interested | invalid_contact | duplicate   (terminal)
```
- Owner-only transitions, each audited. `enrolled` on the lead is set by *creating an
  enrolment*, not by hand, so the two cannot disagree.
- `visited` from the brief's list is **not a lead state**: it belongs to `acq_visits`. A lead
  exists only after details were submitted.
- Backward moves (e.g. `trial_booked → contacted`) are allowed for the owner, audited; the
  system does not need a formal reason code in V1.

### 6.2 Enrolment / payment
```
enrolled ──(owner records full payment)──► enrolled + payment.fullyPaidAt set
enrolled ──► cancelled
enrolled(paid) ──► refunded
```
Recording full payment is the **only** event that can create a commission (§6.4). Recording it
again is a no-op (unique `enrolmentId` on the ledger). Unrecording is not offered; a mistake is
corrected with `refunded` + a note, which is honest history.

### 6.3 Demo grant
```
(no grant) ──lead submitted──► issued {remaining: 50}
issued ──each metered call──► remaining−1  ──remaining = 0──► exhausted
issued ──expiresAt──► expired        issued ──owner──► revoked
```
- Issued at most once per lead; a second claim returns the existing live grant.
- What a "call" is: **one paid model call**, i.e. one `cost_events` row. Recommendation: count
  `workshop.edit` against the 50 and give `workshop.banter` its own small per-grant cap
  (e.g. 60 per grant, also metered) — or turn `claudeTalks` off by default for demo grants, since
  the canned lines already exist. A `banter` request that fails before the provider is called
  consumes nothing; one that fails after (billed) does, matching the ledger's own rule.
  Decision for Amit in §12.3.
- Existing global protections stay: `WORKSHOP_DAILY_LIMIT` and the hourly per-token limit in
  `admit()` still apply to demo grants **in addition to** the durable quota. A demo-specific
  expiry env var (`WORKSHOP_DEMO_EXPIRES`, or none) decouples it from `WORKSHOP_EXPIRES`.

### 6.4 Commission
```
(none) ──enrolment fully paid──► earned ──owner records payout──► paid
earned ──refund or attribution correction──► reversed
paid   ──refund──► reversed (with a note; money recovery is outside the system)
```
> *Historical.* Superseded by §12a correction 1: reverse the wrong award and issue the corrected one; uniqueness is `{enrolmentId}` where `activeAward: true`. No refund workaround.

Attribution correction on a lead **after** a commission exists does not edit the commission;
it reverses it and, if the new distributor qualifies, creates a new `earned` row referencing the
same enrolment — which the unique index would forbid. So: the unique key is `(enrolmentId,
status != 'reversed')` as a partial unique index, and the audit row records both. Simpler
alternative: forbid reassignment after payment; require refund + re-enrol. §12.5.

### 6.5 Distributor account
```
invited ──sets password via invite link──► active ──owner──► disabled
active ──forgot password──► (owner issues a new invite token; same path)
```
No self-registration. No email system: the owner copies the invite link and sends it by
WhatsApp, which is how he already talks to these people. The session collection's `distributorId`
index makes "disable = revoke all sessions" one `deleteMany`.

---

## 7. API surface

### 7.1 Public (CORS allow-list, no credential)
| method path | body → response | limits |
|---|---|---|
| `POST /api/acquisition/visit` | `{visitorId, ref?, b?}` → `{batch: {code,label}\|null}` | per-IP 60/min; optional — the lead endpoint records attribution even if this never fired |
| `POST /api/acquisition/lead` | `{idempotencyKey, visitorId?, ref?, b?, parentName, phone, studentName, grade, email?, note?, consent: true}` → `{leadId, demo: {token, expiresAt, remaining}}` | per-IP 5/10 min (reuse `tooManyAttempts` shape); body ≤ 8 KB; phone validated server-side; same `idempotencyKey` → same response |
| `POST /api/acquisition/demo/claim` | `{leadId}` or `{token}` → grant summary | returns the *existing* grant; never mints a second |
| `GET /api/workshop/health` | unchanged, plus `doors.demo: boolean` | |
| `POST /api/workshop/edit`, `/banter` | unchanged shape; `x-workshop-access` may be a demo token | `admit()`: if the token is not an in-memory grant, look up `acq_demo_grants` by hash; consume per §5.8 |

The lead endpoint returns the demo grant directly so the parent goes from "submit" to "type a
wish at the Firekeeper" in one step, with no email round trip (§12.4).

### 7.2 Distributor (cookie `acq_session`, same origin, server-rendered)
| method path | purpose |
|---|---|
| `GET /distributor/login`, `POST /distributor/login` | email + password; 10 attempts / 10 min per caller and per email; constant-time compare; generic failure message |
| `GET /distributor/set-password?t=…`, `POST` | invite / reset |
| `GET /distributor` | my batches; per batch: visitors, leads, trial_booked, enrolled, paid; my commissions (earned / paid) |
| `GET /distributor/leads` | my leads only, minimal fields (§9.9) |
| `POST /distributor/logout` | |

Every query is `{ creditedDistributorId: session.distributorId }` or `{ distributorId: … }`.
No id from the URL is ever trusted on its own; a foreign id → 404.

### 7.3 Owner (Basic auth = `ENGINE_ROOM_USER/PASSWORD`, fails closed)
| method path | purpose |
|---|---|
| `GET /engine` | new **Acquisition** panel: funnel counts per batch/distributor, recent leads, commissions owed, audit tail; demo quota usage |
| `POST /api/owner/distributors` | create (email, name) → invite link |
| `POST /api/owner/distributors/:id/disable` | also revokes sessions |
| `POST /api/owner/distributors/:id/invite` | new invite/reset link |
| `POST /api/owner/batches` | create `{label, distributorId?, legacyNumber?}` → code |
| `POST /api/owner/leads/:id/status` | `{status, note?}` |
| `POST /api/owner/leads/:id/reassign` | `{creditedBatchId, reason}` — audited; §6.4 rule |
| `POST /api/owner/leads/:id/enrol` | creates the enrolment |
| `POST /api/owner/enrolments/:id/paid` | records full payment → awards commission (idempotent) |
| `POST /api/owner/enrolments/:id/refund` | reverses commission if any |
| `POST /api/owner/commissions/:id/paid` | records payout |
| `POST /api/owner/demo-grants/:id/revoke` | |
| `GET /api/owner/export/leads.csv` | for the owner's own records |

Mounted in `server.ts` above the read-only guard as a named exception, exactly as
`workshopRoute` is, and self-contained in its own file.

---

## 8. Public routing and migration

Because nothing is printed and nothing is deployed, this is a **design choice**, not a
migration with compatibility debt. The only URLs that exist and must keep working are
`/memory-game/`, `/memory-game/build.html?u=…`, `/memory-game/play.html#…` and
`/workshop-game/` — all verified live.

**Recommended layout inside `memory-game/public/`:**

| path | becomes | change |
|---|---|---|
| `index.html` | the landing page | move today's picker to `workshop.html`; update the fallback in `build.js` (`location.replace("index.html")` → `"workshop.html"`) and the README |
| `try.html` (new) | parent demo entry: lead form (or "I already registered" → paste phone) → grant → `build.html?u=demo` | new `demo` entry in `users.js` with a neutral avatar and the parent-supplied first name shown via a query param or the grant response |
| `build.html`, `play.html`, `js/*`, `css/*` | unchanged | `api.js` needs no change — same origin, same header |
| `qr/` | not deployed | keep QR assets out of `public/` |

**URL for the QR codes:** `https://amitdobry.github.io/memory-game/?ref=Y7K2` (durable code)
— and, for the six already-generated designs, `?b=1..6` continue to work as aliases via
`acq_batches.legacyNumber`. Regenerate the six SVG/PNG files for the chosen URL before printing;
`SESSION-REPORT.md C.6` documents the generation settings (v4, EC level H, dark-on-white panel).

**Optional root redirect:** a one-file repo `amitdobry.github.io` with
`<meta http-equiv="refresh">` + a script that forwards `/?b=3` → `/memory-game/?b=3` preserving
the query string. Zero risk, and it means a hand-typed `amitdobry.github.io` still lands. It
does not make the root URL suitable for QR codes (an extra hop on a phone camera is fine, but the
canonical printed URL should be the one that serves the page).

**Repo rename?** Renaming `memory-game` → e.g. `ai-workshop` would move Pages to
`/ai-workshop/` and **break** `/memory-game/*` (GitHub redirects the repo, not the Pages path).
Not recommended unless done before any share link or QR is in the wild — which is now. §12.1.

Deploy order: LIVE migration + endpoints first (dark, behind `doors.demo=false`), then the
static site, then flip the door. Rollback of the static site is a revert + push (Pages redeploys
in about a minute); rollback of LIVE is `heroku releases:rollback` (`DEPLOY.md`).

---

## 9. Security, privacy and abuse controls

1. **Password hashing (distributors).** `crypto.scrypt` with per-user salt and stored
   parameters; compare with `timingSafeEqual`; identical error for unknown email and wrong
   password; throttle per caller *and* per email. No custom cryptography, no new dependency.
2. **Invite / reset.** Owner-issued one-time tokens, hashed at rest, ≤72h TTL, invalidated on
   use; delivered by the owner over WhatsApp. No mail system is introduced (Resend is wired only
   for the dormant door 3 and only to the owner's own address — `mailer.ts`).
3. **Invite-only.** No public registration route exists at all.
4. **Sessions across origins.** Solved by placing `/distributor` on LIVE's origin (§4). Cookie
   HttpOnly, SameSite=Lax, Secure in production, `Path=/distributor`, hashed at rest, TTL index
   plus per-request expiry check — the `sessions.ts` pattern verbatim.
5. **XSS/CSRF.** Server-rendered pages escape everything (LIVE's `engineRoom.ts` already has an
   `escape()` discipline); forms are same-origin POSTs; `originPermitted()` from `auth/routes.ts`
   is reused. The public static site never holds a session credential; the demo grant it holds
   buys only bounded Memory Game operations, exactly as `access.ts` argues today.
6. **Authorization on every server query.** Distributor reads filter by
   `session.distributorId`; owner routes require Basic auth per request; nothing reads a role or
   id from a body or query string. Ratchet test: a source-level test in the style of
   `apiSurface.test.ts` asserting the distributor route file contains no query without
   `distributorId`.
7. **Rate limiting and the caller key.** `workshopRoutes.ts: callerKey()` takes the **first**
   `x-forwarded-for` entry. Heroku's router *appends* the observed client IP, so a client can
   prepend anything and defeat the throttle by rotating a fake first hop. Use the **last** entry
   (or `req.socket.remoteAddress` when there is one hop). Fix this before the same helper guards
   lead submission and login. [verified code; Heroku header behaviour is documented, not
   re-tested here]
8. **CORS.** No change is needed for `amitdobry.github.io` (already allowed, §1.3). Adding a
   root redirect repo needs nothing (it makes no API calls). Every new public route uses
   `corsHeaders()`; the no-wildcard test keeps holding.
9. **Data minimisation, especially about minors.** Collect what the form already collects and
   nothing else; the participant as a first name or nickname only (*implemented as `participantFirstName`, 40 characters, no word-count rule — §12a correction 4*); no IP addresses
   stored anywhere (the `sessions` convention); user agent truncated. **Distributors see:** per
   batch counts, and per lead only `createdAt`, `grade`, `status`, and a masked handle
   (parent first name + last two phone digits) so they can recognise "the family I spoke to".
   No phone, no email, no student name, no note. §12.2 asks Amit to confirm.
10. **Consent and copy.** A required checkbox: "אני מאשר/ת שהפרטים יישמרו לצורך יצירת קשר על
    הסדנה" linking to a short privacy note (what is stored, why, for how long, how to delete:
    WhatsApp Amit). Replace "אין שמירה של פרטים באתר". Note that the student is a minor and the
    parent is the one submitting.
11. **Retention / deletion.** Leads that end `not_interested | invalid_contact | duplicate`:
    delete PII after 90 days (keep the funnel count). Non-lead visitors: TTL 180 days.
    Enrolments/commissions: keep (financial record), but the lead's PII can be reduced to a
    first name once the commission is `paid`. Owner "delete this lead" button, audited.
12. **Forged codes, self-referral, fake leads.** Unknown `ref` → recorded as `direct` and
    flagged, never as a new batch. A distributor cannot create batches. Commission is earned only
    on *full payment recorded by the owner*, which is the real defence: fake leads earn nothing.
    Duplicate detection by `phoneKey` shows a badge in the owner view; the owner decides.
    Lead submission is rate-limited per caller and idempotent per key, so a stuck "submit" button
    creates one lead.
13. **The demo grant cannot become a Claude proxy.** Nothing in this plan touches
    `service.ts`; the request shape, model, prompt and token ceilings stay server-owned. The
    hourly and daily global caps in `admit()` remain as the outer wall.
14. **Secrets.** New env vars on Heroku only: none strictly required (owner auth reuses
    `ENGINE_ROOM_*`); optional `WORKSHOP_DEMO_EXPIRES`, `WORKSHOP_DEMO_CALLS` (default 50).
    Nothing new in either public repo.

---

## 10. Analytics and attribution semantics

| count | definition | source | duplicates |
|---|---|---|---|
| **scan / hit** | one page load with a `ref`/`b` or direct | `acq_visits.hits` (sum) | inflates by design; never shown as "customers" |
| **unique visitor** | one `visitorId` | `acq_visits` rows | private browsing → new visitor each time; stated on the dashboard |
| **lead** | one accepted `POST /lead` | `acq_leads` excluding `status: duplicate` | idempotency key + phone-key badge |
| **first touch** | batch on the visitor's first hit | `acq_visits.firstBatchId` → copied to lead | immutable |
| **latest touch** | batch on the hit that led to the submit | `lastBatchId` | overwritten per scan |
| **credited** | what the distributor is paid for | `attribution.creditedBatchId` | default = first touch; owner may reassign, audited |
| **enrolled** | an `acq_enrolments` row exists | | one per lead |
| **paid customer** | `payment.fullyPaidAt` set and not refunded | | the only count that earns ₪150 |
| **commission owed** | ledger rows `earned` | `acq_commissions` | unique per enrolment |

Why **first touch** by default: leaflets are the only channel, a family typically sees one, and
first touch is the one the page cannot later be talked out of. Latest touch is kept for the
owner to judge disputes. The page today sends only latest; the server will keep both once the
visit beacon exists, and until then treats what the page sends as both.

Direct traffic is `source: 'direct'`, never a batch. A retired batch scanned later still
attributes (the leaflet is still on a fridge) but is flagged.

---

## 11. Increment plan

Each increment is deployable alone, has its own tests, and can be rolled back without touching
the previous one. LIVE increments deploy via `npm run predeploy` then `git push heroku
product/web-v0:main`; static increments via push to `main`.

| # | Increment | Definition of Done | Tests | Rollback boundary |
|---|---|---|---|---|
| 0 | **Hygiene** — fix `callerKey()` to the last forwarded hop; fix stale README/server comment; move QR assets out of the future `public/` | code + docs match; no behaviour change except the throttle key | unit test for `callerKey` with spoofed and real headers | one commit each |
| 1 | **Landing page into `memory-game`** — landing at `/`, picker at `/workshop.html`, `build.js` fallback updated, Formspree removed, WhatsApp fallback kept, consent checkbox + privacy note added, "no storage" copy replaced | `https://amitdobry.github.io/memory-game/?b=3` shows the page; WhatsApp text ends `(מעלון 3)`; `/workshop.html` → picker; `/build.html?u=kid1` unchanged; `/play.html#…` unchanged | manual matrix from `SESSION-REPORT.md C.7` re-run; a Node script decoding the regenerated QR PNGs | revert one commit; Pages redeploys |
| 2 | **Migration `acq_*`** — collections + indexes from §5, models with `baseSchemaOptions`, no routes yet | `npm run migrate:status` clean; `down` drops exactly what `up` made | integration test: migration up/down idempotent | `migrate:down` |
| 3 | **Lead intake** — `POST /api/acquisition/lead`, `/visit`; static form posts to it; Engine Room lists leads read-only | a submitted form appears in `/engine` with first/latest/credited batch; a retry with the same key makes no second lead; throttle answers 429 | offline: validation, idempotency, attribution defaults, throttle; integration: two leads two batches; CORS preflight | disable route (feature flag env) → form falls back to WhatsApp as today |
| 4 | **Demo grant (door 4)** — `acq_demo_grants/uses`; `admit()` accepts demo tokens; `try.html` + `demo` user; `health.doors.demo` | a parent submits, gets a grant, makes an edit; 51st edit → 429 in Hebrew; owner can revoke; the Engine Room shows remaining per grant | offline: consume/replay/exhaust/revoke/expiry; the `admit()` order (global caps still bind); ledger row carries the grant id | `doors.demo=false` hides the entry; classroom doors untouched |
| 5 | **Owner writes** — `/api/owner/*` behind Basic; status changes, enrol, paid → commission, refund → reversal, reassign; audit rows; Engine Room panel gets forms | recording payment twice yields one commission; refund reverses; every write leaves an audit row | offline: commission state machine, uniqueness, reversal; integration: owner endpoints refuse without Basic | routes return 405 when flagged off; ledger is append-only so nothing to undo |
| 6 | **Distributors** — collection, scrypt, invite flow, sessions, `/distributor/*` pages | distributor A sees only A's batches/leads/commissions; B's ids → 404; disabled = sessions gone | offline: hashing/compare/throttle; integration: A-vs-B visibility (the `ownershipBoundary` pattern) | pages return 503 when flagged off |
| 7 | **Print** — regenerate QR codes for the final URL, decode-test, scan a printed proof | six codes decode to the exact URLs; a phone scan lands with the right `(מעלון N)` | decode script | reprint |

Rules preserved from the brief for the later phase: migrations before code; idempotent writes for
lead, quota, commission; server-side filtering only; no browser–database path; no secrets in
public repos; `workshop-game` untouched; no model calls in tests (the integration lane already
refuses a key); offline tests for transitions/attribution/auth/quota/commission; integration tests
for owner-vs-distributor; LIVE deploys gated separately from Pages deploys; old `?b=N` remains
valid through the alias.

---

## 12. Open decisions for Amit

Only the ones that change the design.

1. **Public URL.** Recommended: `https://amitdobry.github.io/memory-game/` as canonical, six QR
   codes regenerated for it, optional root-redirect repo for typed visits. Alternative: a
   dedicated `amitdobry.github.io` repo holding the landing page (two repos, two deploys, the
   demo on another path). Renaming `memory-game` is a third option and only makes sense if you
   accept breaking `/memory-game/*` now, before anything is printed.
2. **What a distributor sees per lead.** Recommended: counts + status + a masked handle.
   Alternative: parent first name and status. Not recommended: phone/email/student name.
3. **What counts toward the 50.** Recommended: `edit` only, banter capped separately (or off
   for demo grants). Alternative: every paid call counts, quota shown in the UI so a parent can
   see it drain.
4. **Email verification before a demo grant.** Recommended: **no** for V1. The contact channel
   is the phone; the grant is issued on submit; abuse is bounded by 50 calls × per-caller
   throttle × global daily cap × one grant per phone key. Verification would require a mail
   system that does not exist (Resend is sandbox-only to the owner's address). Revisit if the
   ledger shows abuse.
5. **Reassigning attribution after a commission exists.** *Resolved (§12a correction 1):* reverse the old award and issue a new one, `activeAward` partial unique index. The refund workaround was rejected.
6. **Demo lifetime.** Grant expiry (14 days?) and whether the public demo has its own
   switch-off date separate from `WORKSHOP_EXPIRES=2026-10-15`. Recommended: separate env var,
   unset by default.
7. **Retention numbers** in §9.11 (90 / 180 days) — confirm or change.
8. **Cohort / price.** The system records the *fact* of full payment; it does not need the price.
   Confirm that ₪150 is flat per paid customer regardless of price or discounts.

---

## 12a. Corrections accepted after review (18 September 2026)

Amit reviewed the report and corrected four points. These override the sections above:

1. **Attribution correction after a commission exists (§6.4, §12.5).** No refund-and-re-enrol
   workaround. The ledger stays immutable and audited: reverse the incorrect award, issue the
   corrected award. The uniqueness rule is "one *active* award per enrolment": an explicit
   `activeAward` boolean and a partial unique index on `enrolmentId` where `activeAward: true`
   (`$ne` is not a partial-filter operator), so reversed history is kept.
2. **No source-text test for distributor queries (§9.6).** Grepping route code for
   `distributorId` is brittle and proves nothing about authorization. Use behavioural
   integration tests: distributor A cannot read B's batches, leads, commissions or aggregates,
   including by guessed ids.
3. **Vocabulary.** `visit`, `lead`, `enrolment`, `full payment` and `commission` stay separate
   concepts (as §5 has them). `active` is never a lead status.
4. **Minors' names (§5.5, §9.9).** The acquisition flow never stores a child's full name. Forms
   ask for a first name or nickname only, and distributors never see it.
5. **The parent's phone number is collected and validated explicitly by the lead endpoint.**
   The slice-1 WhatsApp composer omits a phone field because WhatsApp itself carries the
   sender's number — but that number never reaches our database. The future `POST
   /api/acquisition/lead` form (§7.1) requires `phone`, normalises it to E.164 and validates it
   server-side, exactly as §5.5 already specifies. The composer's omission is a V1 convenience,
   not a design decision to carry forward.

Decisions confirmed alongside: canonical URL `https://amitdobry.github.io/memory-game/`;
picker moves to `/workshop.html`; distributor view masked to date, grade, status, parent first
name and last two phone digits; demo grant = 50 `edit` requests, banter disabled for demo grants
(canned lines only), 14-day life, first-touch default; no email verification in V1;
invite-only distributors; ₪150 only after manually recorded full payment.

Slice 1 (hygiene + static landing page) was implemented the same day; see the commits that
follow this one.

## 12b. Rollout order for the intake (slices 2–3), as accepted

The order matters because the page calls the backend and the backend answers 503 until
switched on. Nothing in it is automatic.

1. **Deploy LIVE with acquisition disabled.** The release phase applies the two additive
   migrations; `ACQUISITION_ENABLED` stays unset, so `/api/acquisition/*` answers
   `503 acquisition_unavailable` and writes nothing.
2. **Create and verify the batch records.** One `acq_batches` row per leaflet batch, with its
   `code` and, for the six printed designs, its `legacyNumber`, and the distributor it belongs to
   (or none for Amit's own). Verify with a `POST /api/acquisition/visit` for each `?ref=` and
   `?b=` and confirm `recognised: true` — while still disabled this cannot be done through the
   endpoint, so verification happens right after step 4 or against a staging database. No batch
   is created by code; unknown codes never earn credit.
3. **Publish the frontend** (memory-game `main` → GitHub Pages). The page handles the 503 as
   "registration not yet open" and offers WhatsApp.
4. **Enable acquisition** (`ACQUISITION_ENABLED=1`) only after the batch records resolve
   correctly. From this point leads are stored.

Registration accepts grades 7, 8 and 9 only; other grades are directed to WhatsApp.

## 13. Small bugs and stale spots found on the way (not fixed; for the "later" list)

Landing page (`landing-page/index.html`):
- CSS `input:focus,select,textarea:focus{outline:…}` — the middle selector is `select`, not
  `select:focus`, so every `<select>` permanently shows the focus ring.
- `document.querySelectorAll('.nav-cta').forEach(function (el) { /* empty */ })` — dead code.
- `?b=` memory is last-touch and overwrites (§3.8).
- Formspree-specific `_subject` hidden field ships even when Formspree is not configured.
- WhatsApp fallback reports success ("נפתחה שיחת WhatsApp") before knowing whether the popup
  was blocked.
- Phone field has no format validation beyond "not empty".

Memory Game:
- `README.md` "Quick start" names `WORKSHOP_CODES` and `?t=TEST01`; neither exists in the code.
- `build.js`: after `location.replace("index.html")` execution continues and throws on
  `user.avatar` (harmless but noisy in the console).
- `play.html` sends a `/banter` request per turn with no grant → predictable 401s.

LIVE:
- `workshopRoutes.ts: callerKey()` trusts the first `x-forwarded-for` hop (§9.7).
- `server.ts` comment above `workshopRoute` still describes the retired `WORKSHOP_CODES` door.
- `access.ts: attempts` map is never swept of callers who stopped trying (slow growth until
  restart; not a correctness issue).

---

## Appendix — evidence log (read-only commands run on 18 September 2026)

```
curl -s -o /dev/null -w "%{http_code}" https://amitdobry.github.io/                         → 404
curl … https://amitdobry.github.io/memory-game/                                              → 200
curl … https://amitdobry.github.io/memory-game/build.html                                    → 200
curl … https://amitdobry.github.io/workshop-game/                                            → 200
curl … https://live-intelligence-f6ec7b9df867.herokuapp.com/health                          → 200 {"status":"ok","database":"connected"}
curl … https://live-intelligence-f6ec7b9df867.herokuapp.com/api/workshop/health             → 200 (see §1.3)
curl -X OPTIONS …/api/workshop/edit -H "Origin: https://amitdobry.github.io" …               → 204, Access-Control-Allow-Origin: https://amitdobry.github.io
git -C ../Live branch --show-current                                                          → product/web-v0
git -C ../Live log --oneline -1 heroku/main                                                   → 6143d27 (same as product/web-v0)
```

Files read in full: memory-game `README.md`, `.github/workflows/pages.yml`, `public/*.html`,
`public/js/{api,build,storage,users,contract,firekeeper}.js`, `server/index.js`,
`scripts/export-contract.mjs` (head), `docs/FULL-SPECIFICATION.md` (parts 3–6, 8–9, appendices),
`docs/BREAKDOWN.md §9`; LIVE `package.json`, `Procfile`, `.slugignore`, `DEPLOY.md` (head),
`src/web/{server,apiHelpers,basicAuth,workshopRoutes,workshopView,assignmentRoutes}.ts`,
`src/web/auth/{sessions,routes,ownership,resolution}.ts`, `src/workshop/{access,service,mailer}.ts`,
`src/models/{user,session,costEvent,index,enums}.ts`, `src/db/schemaOptions.ts`, `src/config/env.ts`,
`src/telemetry/costRecorder.ts` (head), `migrations/20260828160000-identity-and-sessions.ts`,
`migrate-mongo-config.js`, `vitest.integration.config.ts`, `tests/workshop*.test.ts`,
`tests/apiSurface.test.ts` (head), `web/vercel.json`, `web/package.json`; landing
`index.html`, `SETUP.md`, `SESSION-REPORT.md`; workshop-game `client/vite.config.ts`, `README.md`
(head), `.github/workflows`; `WORKSHOP-INSTRUCTIONS.md` (Days 1–10 sections).
