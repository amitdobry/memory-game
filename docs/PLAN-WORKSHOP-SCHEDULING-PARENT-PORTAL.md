# Plan — workshop groups with explicit meetings, the group picker, and the parent portal

Written 20 September 2026. **Planning only: nothing here is implemented.** Reviewed against the
real code of both repositories on that date. Naming follows the repo's convention
(`docs/PLAN-<topic>.md`, like the three earlier plans).

---

## 1. Current-state findings

### 1.1 The registration flow, end to end

1. A parent opens `https://amitdobry.github.io/workshop/?ref=LEAFn` (or `?b=n`). The page is
   `landing/index.html` in memory-game, published by the `amitdobry/workshop` repo's workflow
   (checkout memory-game → copy `landing/index.html` + `public/js/` → Pages). The old address
   `/memory-game/` is the classroom picker and forwards leaflet visits to `/workshop/`.
2. The inline module in `landing/index.html` imports `public/js/attribution.js`
   (`resolveAttribution` — `?ref`/`?b` parsed, remembered in `localStorage.leaflet_attribution`),
   `public/js/api.js` (`API_BASE` = LIVE's origin on github.io, `localhost:4300` locally) and
   `public/js/acquisition.js` (visitor id in `localStorage.acq_visitor`, the visit beacon, the
   payload, idempotency-key state, outcome classification).
3. On load: `POST {API_BASE}/api/acquisition/visit {visitorId, ref|b}` (fire and forget).
4. On submit: the form's six fields (parentName, parentPhone, participantFirstName, grade 7/8/9,
   parentEmail?, note?) plus `consent: true`, `idempotencyKey`, `visitorId`, and the referral →
   `POST /api/acquisition/lead`. Outcomes 201 created / 200 replay / 400 / 409 / 413 / 429 / 503
   are mapped to Hebrew messages; the static test pins the exact payload key set
   (`tests/static-site.test.mjs` line ~398).
5. LIVE (`src/web/acquisitionRoutes.ts` → `src/acquisition/leads.ts`): strict zod body, phone
   normalised to E.164, first-touch attribution decided from the visit row and the referral, one
   transaction writes the lead, links the visit, and appends an audit row with ids only.
6. A WhatsApp fallback link (`wa.me/972546111602?text=…`) carries the attribution marker.

### 1.2 What a lead is today (`src/models/acqLead.model.ts`)

Contact fields (nullable after PII purge), `grade`, `note`, `consent {privacyVersion,
capturedAt}`, `idempotencyKey` (unique), `submissionHash` (PII-class), `attribution {source,
firstBatchId, lastBatchId, creditedBatchId, creditedDistributorId}`, `status` (submitted,
contacted, trial_booked, enrolled, not_interested, invalid_contact, duplicate), `duplicateOf`,
`visitorId`, `piiPurgeAt/piiPurgedAt`. **A lead already is "the registration that exists before
payment"** — it has a lifecycle, an owner-editable status (since 19 Sep) and an audit trail.

### 1.3 Enrolment, payment, commission (already built, 19 Sep)

`acq_enrolments` — one per lead (`leadId` unique), `cohort` (a string, today always
`first-run-2026`), `status enrolled|cancelled|refunded`, `payment {fullyPaidAt, amountAgorot,
recordedAt}`. Created when Amit sets a lead to `enrolled`; "mark fully paid" sets the payment
fact and earns the distributor's commission (`acq_commissions`). Colour groups: active / closed /
paid (`leadGroupOf`).

### 1.4 Attribution (`LEAF1`–`LEAF6`)

`acq_batches` (code, legacyNumber 1–6, assignment unassigned|owner|distributor). `?ref=CODE`
beats `?b=N`. `attribution.creditedBatchId` = first referral the browser was seen with (visit
row) else the submission's own; `creditedDistributorId` = the batch's distributor **at
submission time** — no backfill on later assignment. Distributor claims, the personal link and
the grand view are live (`src/acquisition/claims.ts`, `distributors.ts`).

### 1.5 The Engine Room surface

`src/web/server.ts` dispatches: public POST routers above the read-only guard (workshop
classroom, acquisition intake, distributor claim, distributor portal); owner **writes** as POSTs
under `/engine/acquisition/...` behind `configuredCredentials()/isAuthorised()` (Basic auth,
fails closed 503, 401 with realm) via `ownerAction()`; owner **pages** inside the `/engine` GET
block after the same check: `/engine/acquisition` (leads list + pending claims),
`/engine/acquisition/leads/<id>` (detail, status form, payment), `/engine/acquisition/distributors`
(+ `/<id>`). Pages are server-rendered strings (`acquisitionOwnerView.ts`, `escape()`,
`ownerShell`), `no-store`/`nosniff`/`no-referrer`, `data-l` responsive tables. Form bodies via
`src/web/formBody.ts` (first value per key). Every write is audited (`acq_audit`, append-only,
redaction hook refuses names/phones/emails/hashes/tokens).

### 1.6 Models and data-layer rules

Eleven `acq_` collections (+ this plan adds two). `baseSchemaOptions`: `strict: 'throw'`,
`autoIndex/autoCreate: false` — **indexes exist only through migrate-mongo migrations**, run in
the Heroku release phase, mirrored by the Mongo-lane globalSetup. Partial indexes use only
equality / `$type`. Tokens are 32 random bytes base64url, stored as SHA-256 (sessions,
distributor links, invite tokens). Transactions are available (Atlas replica set, verified).

### 1.7 Deployment

LIVE: push `product/**` branch → CI (Engine offline, Product build, Mongo lane with a `mongo:8`
replica set) → fast-forward `product/web-v0` → CI → `git push heroku product/web-v0:main`
(release phase runs migrations) → switches via config vars (`ACQUISITION_ENABLED`,
`DISTRIBUTOR_CLAIMS_ENABLED`, `DISTRIBUTOR_PORTAL_ENABLED`). memory-game: push `main` → its
Pages (`/memory-game/`) and, within 15 minutes or on a manual run, the workshop repo's Pages
(`/workshop/`). CORS on LIVE allows `https://amitdobry.github.io` exactly.

### 1.8 What already exists that this prompt calls "new"

| Prompt concept | Already exists as |
|---|---|
| "Registration / order, exists before payment" | the **lead** (+ its audit, status, attribution) |
| "confirmed" | lead `enrolled` + `acq_enrolments` row |
| "payment status" | `enrolment.payment.fullyPaidAt`, the `paid` colour group |
| "secure opaque token page" | the distributor link pattern (`/distributor/d/<key>`, hash at rest, shown once, rotate/disable) |
| "admin surface" | `/engine/acquisition/*` pages and `ownerAction()` |
| "schedule text on the page" | hard-coded copy: hero chips "ימי שישי", fact card "10:00–12:00, עשרה מפגשים שבועיים ביוקנעם" |

---

## 2. Requirements, distilled

1. **Groups with explicit meetings**, fully manual: each meeting has its own date, start, end.
   No recurrence, no holidays, no generation. Ten is a default, not a rule. Capacity 3 by default.
2. **Admin management** of groups and meetings inside `/engine/acquisition`, server-authoritative,
   no frontend deploy to change a date.
3. **Public picker** on the landing page: cards (name, hours, availability, selected state), then a
   compact three-month calendar plus a numbered list of the meetings, fed by the server. The
   parent picks a **group**; days are not selectable. Registration carries the chosen group.
   Attribution and the current flow are preserved.
4. **Durable parent link** issued at registration, independent of payment.
5. **Parent portal**: next meeting with countdown (derived from the configured meetings), the
   full schedule with past / next / future, a registration summary with status and payment, and a
   small persisted parent ↔ Amit message thread. Extensible later (files, links, payments).
6. **Security proportional** to a small product handling children's and parents' data; no
   enumeration; no other parent's data.
7. **Capacity** with a clear, server-enforced definition.
8. **Backward compatibility**: old leads stay valid without a group.

---

## 3. Proposed architecture (one paragraph)

Two new collections (`acq_groups`, `acq_messages`), three optional fields on existing records
(`lead.groupId`, `lead.portalTokenHash/IssuedAt`, `enrolment.groupId`), one public GET
(`/api/acquisition/groups`), one optional field on the lead POST (`groupId`), server-rendered
owner pages for groups under `/engine/acquisition/groups`, and a server-rendered parent portal on
LIVE at `/workshop/order/<token>` following the distributor-link pattern. The landing page gains
a picker module that reads the public GET and falls back gracefully. No second workshop system;
the lead stays the registration; the enrolment stays the seat.

```
  GitHub Pages (/workshop/)                 LIVE (Heroku)
  ┌──────────────────────────┐   GET /api/acquisition/groups   ┌───────────────────────────┐
  │ landing/index.html       │ ─────────────────────────────▶ │ acq_groups (open only)    │
  │  picker: cards+calendar  │ ◀───────────────────────────── │ + seats available         │
  │  form  (+groupId)        │   POST /api/acquisition/lead   │ lead {groupId?, token}    │
  │  success → portal link   │ ◀── 201 {leadRef, portalUrl}   │                           │
  └──────────────────────────┘                                │ /workshop/order/<token>   │
                                                              │  next meeting, schedule,  │
  parent's phone ──────────── opens the link ───────────────▶ │  summary, messages        │
                                                              │ /engine/acquisition/...   │
  Amit ─────────────── Basic auth ─────────────────────────▶ │  groups CRUD, reply, enrol│
                                                              └───────────────────────────┘
```

---

## 4. Data model

### 4.1 `acq_groups` — one document per group, meetings embedded

Why one document per group and not one config document for everything: groups are edited and
counted independently (seats), and the public endpoint filters by status. Why embedded meetings
and not a `sessions` collection: a group's meetings are always read and written together (the
admin form saves the whole list; the picker and the portal render the whole list), there are at
most a few dozen, and nothing ever queries a meeting without its group. The portal's "next
meeting" is a derivation over the array, not a stored fact.

```ts
interface IAcqGroup {
  _id: ObjectId;
  code: string;            // short stable handle for URLs/forms, e.g. "FRI-AM"; unique; never shown to parents
  label: string;           // "ימי שישי"
  timeOfDay: 'morning' | 'afternoon' | 'evening';   // drives the card's icon (sun / moon), nothing else
  capacity: number;        // default 3, integer ≥ 1
  seatsTaken: number;      // confirmed places (enrolments 'enrolled'); maintained transactionally, §10
  status: 'draft' | 'open' | 'closed' | 'archived'; // only 'open' is public; 'closed' still shows on portals
  priceAgorot?: number | null;
  locationLabel?: string | null;   // "ביתנו, יוקנעם"
  order: number;           // card order on the page
  sessions: Array<{
    n: number;             // 1-based, the number printed on the calendar
    date: string;          // 'YYYY-MM-DD', Asia/Jerusalem calendar day
    start: string;         // 'HH:MM'
    end: string;           // 'HH:MM'
    note?: string | null;  // "מפגש חלופי בגלל חג" — for Amit and the portal, optional
    startsAt: Date;        // derived on save: the instant of date+start in Asia/Jerusalem
    endsAt: Date;          // derived on save
  }>;
  createdAt; updatedAt;
}
```

Rules in the schema's pre-validate: `start < end`; sessions sorted by `startsAt`, `n` renumbered
1..k on save (so removing one renumbers the rest — the portal shows the number, so this matters);
no two sessions on the same date in one group; `seatsTaken ≤ capacity`; `startsAt/endsAt`
recomputed from `date/start/end` with an explicit **Asia/Jerusalem** conversion (Intl-based
offset lookup; no library), so DST changes cannot shift a 10:00 meeting.

Indexes (migration): `{code: 1}` unique; `{status: 1, order: 1}`.

### 4.2 The lead gains three optional fields (no data migration)

```ts
groupId?: ObjectId | null;          // the group the parent chose; null for leads before groups existed or when the picker was unavailable
portalTokenHash?: string | null;    // SHA-256 of the parent's link key; null for old leads until Amit issues one
portalTokenIssuedAt?: Date | null;
```

Index (migration): `{portalTokenHash: 1}` unique partial `$type: 'string'`.

### 4.3 The enrolment gains `groupId?: ObjectId | null`

The **seat** is the enrolment. `cohort` stays as the legacy label (old rows keep
`first-run-2026`; new rows get the group's `code` as cohort text so nothing that reads `cohort`
breaks).

### 4.4 `acq_messages`

```ts
interface IAcqMessage {
  _id: ObjectId;
  leadId: ObjectId;
  from: 'parent' | 'owner';
  body: string;             // ≤ 1000 chars, trimmed; parent text is untrusted data, escaped on render
  at: Date;
  seenByOwnerAt?: Date | null;   // set when Amit opens the lead page
  seenByParentAt?: Date | null;  // set when the portal renders after the message
}
```

Index: `{leadId: 1, at: 1}`; `{from: 1, seenByOwnerAt: 1}` for "unread from parents" on the
leads list.

### 4.5 Audit

Actions: `group.created`, `group.updated` (before/after of the non-PII fields incl. sessions),
`group.status.changed`, `lead.group.set` (owner changes a lead's group), `enrolment.seat.taken`,
`enrolment.seat.released`, `lead.portal.issued|rotated|revoked`, `message.owner.sent`. Parent
messages are not audited (they are the record); the redaction hook already refuses PII.

---

## 5. API changes (LIVE)

| Method path | Auth | Purpose |
|---|---|---|
| `GET /api/acquisition/groups` | public, CORS (github.io), `cache-control: public, max-age=60` | `{ groups: [{ id, label, timeOfDay, capacity, available, sessions: [{n, date, start, end}], locationLabel, priceAgorot? }] }` for `status: 'open'` only; `available = capacity − seatsTaken` (never below 0). No PII, no codes. 503 while `ACQUISITION_ENABLED` is off (same switch as the intake: the picker is part of registration). |
| `POST /api/acquisition/lead` | public (existing) | body gains optional `groupId` (24-hex). Validation: exists and `status: 'open'`; a full open group is **still accepted** (the lead is interest, not a seat — §10); a closed/unknown id → 400 `fields: ['groupId']`. Response 201/200 gains `portalUrl` (§8). Replay returns the same portal URL only if the token is still the original (a rotated token is not re-sent). |
| `GET /workshop/order/<key>` | key in URL | the parent portal page (server-rendered). |
| `POST /workshop/order/<key>/messages` | key in URL | parent message; form-urlencoded; 303 back. |
| `GET /engine/acquisition/groups` | Basic | list + "new group" form. |
| `POST /engine/acquisition/groups` | Basic | create. |
| `GET /engine/acquisition/groups/<id>` | Basic | edit page: fields + sessions table + enrolled/pending leads. |
| `POST /engine/acquisition/groups/<id>` | Basic | save fields **and** the whole sessions list in one submit (repeated form keys `date[]`, `start[]`, `end[]`, `note[]`; `formBody.ts` gains `readFormAll`). |
| `POST /engine/acquisition/groups/<id>/status` | Basic | draft/open/closed/archived. |
| `POST /engine/acquisition/leads/<id>/group` | Basic | set/clear a lead's group (for old leads and phone registrations). |
| `POST /engine/acquisition/leads/<id>/portal/(issue\|rotate\|revoke)` | Basic | the parent link; issue/rotate renders the lead page once with the clear link and a WhatsApp button (same pattern as distributors). |
| `POST /engine/acquisition/leads/<id>/messages` | Basic | Amit's reply. |

Unchanged: `/api/acquisition/visit`, claims, distributor portal, everything else.

---

## 6. Admin UI (Engine Room)

- **Leads list** (`/engine/acquisition`): a "Group" column (label or `—`), an unread-messages
  badge per lead, and a nav link **Groups**.
- **Groups list** (`/engine/acquisition/groups`): label, time of day, status, seats
  `taken/capacity`, pending leads, first and last meeting dates, an inline "new group" form
  (label, time of day, capacity, price, location).
- **Group page** (`/engine/acquisition/groups/<id>`): the fields; a sessions table with one row per
  meeting — number (read-only, renumbered on save), date `<input type=date>`, start and end
  `<input type=time>`, note, a remove checkbox — plus "add a row" (three empty rows are always
  present at the bottom; empty rows are ignored); one **Save** for the whole group; status buttons
  Open / Close / Archive; a table of leads that chose this group with status colour and links; the
  confirmed enrolments count. Saving re-derives `startsAt/endsAt`, sorts, renumbers, and writes one
  `group.updated` audit row with the before/after session lists.
- **Lead page**: group (with a select to change it), the seat state (taken / not), the parent
  link block (issue/rotate/revoke, WhatsApp button, shown once), and the **message thread** with a
  reply box. Setting status `enrolled` **takes a seat** (§10) and refuses with a clear notice when
  the group is full; leaving `enrolled` releases it.

No JavaScript is needed for any of this beyond what the owner pages already have (copy button).

---

## 7. Registration UI (memory-game `landing/index.html` + a new module)

**Design rule (Amit, 20 Sep 2026): the mockup is an example of structure, not of looks. The picker
is built from the landing page’s own design language and nothing else** — its dark palette and
tokens (`--ink`, `--muted`, `--grad`, `--line`), the Heebo type, the existing `.card`, `.eyebrow`,
`.lead`, `.keyline`, `.facts .fact` / `.ic` boxes and `.num-ltr` for times and dates, the same radii
and spacing, right-to-left throughout. No white theme, no new illustration style, no new icon set:
the time-of-day marker is a small glyph in the `.ic` box the fact cards already use. What is taken
from the mockup is only the order of things — cards, then an info line, then the month grids, then
the numbered list, then hours and location. A reviewer should not be able to tell where the old
page ends and the picker begins.

- New module `public/js/schedule.js` (pure, testable): `fetchGroups(apiBase)`, `layoutMonths(
  sessions)` (which months to draw, which days are meetings, RTL week starting Sunday א..ש),
  `formatSession`, `describeAvailability(capacity, available)`. No dates in the page source.
- New section **"בחרו מועד לסדנה"** above the form: one card per open group — icon by
  `timeOfDay` (sun / moon as inline SVG), label, `start–end`, three person icons filled by
  `available` ("2 מתוך 3 מקומות פנויים"; full → "הקבוצה מלאה – אפשר להירשם לרשימת המתנה"),
  radio semantics (keyboard accessible, `aria-pressed`). Selecting a card reveals: the info line
  ("בחרתם את קבוצת ימי שישי. להלן כל תאריכי המפגשים:"), three mini month grids with the meeting
  days circled and numbered, the numbered list "רשימת המפגשים", and the footer (hours, location)
  — exactly the mockup's structure, with the site's dark palette rather than the mockup's white.
- Form: a hidden `groupId` set by the card; the `note` label unchanged; submit refuses with the
  existing field-naming message when a group exists but none is chosen ("מועד"). If the GET fails
  or returns no open groups, the section is hidden and the form works as today (groupId omitted;
  the portal later says the date will be agreed with Amit).
- Success message gains the portal link: "הקישור האישי שלכם לפרטי ההרשמה ולמועדים: … שמרו אותו."
  plus a "שלחו לעצמכם ב-WhatsApp" link (`wa.me/?text=`). The link is also kept in
  `localStorage.acq_portal_<leadRef>` so a reload of the page can show it again.
- The hard-coded schedule copy ("ימי שישי", "10:00–12:00", hero chip "ימי שישי") is replaced by
  text rendered from the same GET, with the current wording as the no-JS/offline fallback.
- Static tests: payload key set gains `groupId`; `schedule.js` unit tests (month layout, RTL
  weekday order, irregular dates, a 31-day boundary, empty sessions); no date literal in the page.

---

## 8. Parent portal (`/workshop/order/<key>` on LIVE)

Why LIVE and not GitHub Pages: the page carries a child's first name and the parent's own data;
it must be `no-store`, never cached by a CDN, and read straight from the database on every open.
Pages can only serve static files. The URL keeps the prompt's shape.

- **Key**: 32 random bytes base64url (43 chars); SHA-256 stored on the lead; issued in the lead
  transaction; returned once in the 201 body as `portalUrl`; re-issuable by Amit (rotate) from the
  lead page with a WhatsApp button (message: "הקישור האישי שלכם לפרטי ההרשמה: …").
- **Page** (Hebrew, RTL, phone-first; same style as the claim/distributor pages):
  1. **מפגש הבא** — date, weekday, hours, and "עוד N ימים" (or "היום", "מחר", "עוד 3 שעות"),
     computed server-side from the group's sessions (`first endsAt > now` in Asia/Jerusalem), with
     a 12-line inline script that keeps the countdown fresh from a `data-starts-at` attribute
     while the tab is open. No polling: a reload re-derives everything.
  2. **המועדים** — the same month grids and numbered list as the picker (a shared render on the
     server this time), with past meetings dimmed, the next one highlighted, future ones plain.
  3. **ההרשמה** — participant first name, grade, parent name and phone (their own), the group,
     status in plain Hebrew by colour group (בתהליך / נסגר / שולם, with "ממתין לאישור" for
     `submitted`/`contacted`, "מקום שמור" once enrolled), price if the group has one, paid
     amount/date if recorded, otherwise "טרם שולם". No payment actions.
  4. **הודעות** — the thread (parent right, Amit left), a textarea + send; after send a 303 back
     to the page. Amit's replies appear on the next open. Parent messages are rate-limited (10 per
     10 minutes per key, 30 per hour per address) and limited to 1000 characters.
  5. A footer with Amit's WhatsApp and "הקישור אישי – לא להעביר".
- States: no group yet → "המועד ייקבע יחד עם עמית" instead of sections 1–2; group `closed` →
  still shown; lead `not_interested`/`invalid_contact`/`duplicate` or PII-purged → a calm "ההרשמה
  נסגרה" page, no details; unknown/revoked key → 404 page like the distributor portal.
- Switch `PARENT_PORTAL_ENABLED` (503 while off) so the surface can be paused alone.

---

## 9. Messaging design

Boring by design: a collection, two POST endpoints, refresh-on-load. The lead page shows the
thread and marks parent messages seen; the portal shows it and marks Amit's seen. The leads list
shows an unread badge so Amit notices. No realtime, no polling, no email — the audit row for an
owner message and the parent's own reload are the notifications. WhatsApp remains the channel
for urgency, and the portal footer links to it. Later additions (attachments, announcements) hang
off the same `leadId` without changing this.

---

## 10. Capacity semantics

**A seat is consumed by a confirmed enrolment (`acq_enrolments.status = 'enrolled'` with a
`groupId`), never by a registration.** Reasons: the lead lifecycle already treats `enrolled` as
the confirmation Amit gives after a call; three simultaneous parents pressing "register" must all
get through (they are interest, and Amit chooses); and a lead that goes `not_interested` must not
have blocked a place for days. So:

| Public card shows | Meaning |
|---|---|
| `available = capacity − seatsTaken` | confirmed seats left |
| "הקבוצה מלאה" when 0 | registration still accepted; the portal says "רשימת המתנה" until Amit moves them or the group changes |

Amit's pages additionally show **pending** (leads with this group in `submitted/contacted/
trial_booked`).

**Enforcement**: taking a seat happens inside the existing status-change transaction
(`changeLeadStatus → enrolled`): `AcqGroup.findOneAndUpdate({_id, seatsTaken: {$lt: capacity}},
{$inc: {seatsTaken: 1}}, {session})`; a null result means full → outcome `group_full`, nothing
written, notice on the lead page. Leaving `enrolled` decrements in the same way. A counter instead
of a count-in-transaction because the conditional update is one atomic operation the database
guarantees, and it is what makes two simultaneous approvals of the last seat impossible even
without transactions. A Mongo-lane test reconciles `seatsTaken` with the enrolments count and
races two approvals for the last seat. Changing `capacity` below `seatsTaken` is refused.

---

## 11. Security model

- **Token**: same as distributor links — 32 random bytes, base64url, hash at rest, shown once,
  rotate/revoke by Amit, 404 for unknown, `no-store`/`noindex`/`no-referrer`, no cookie, GET and
  one POST. No sequential ids anywhere in public URLs (`leadRef` in the 201 is the lead `_id`
  today and stays server-facing; the portal never uses it).
- **Rate limits**: portal GET 30/min per address; parent messages as above; the groups GET 60/min
  per address (it is cacheable).
- **What the portal returns**: only that lead's data plus its group's public schedule. Every
  query is `{ _id: lead._id }` from the hash lookup; no id from the URL is trusted otherwise.
- **PII purge**: a purged lead's portal shows the closed page; a revoked token cannot be revived,
  only re-issued.
- **Input**: parent messages are untrusted text — length-capped, escaped on both pages, never
  interpreted; the audit redaction rule applies to Amit's replies (no phones/emails in audit).
- **Public GET**: schedule and counts only; group codes and ids are opaque ObjectIds (ids are
  needed for `groupId`; they are not enumerable in any harmful way — they return the same public
  data the list does).
- **Children**: first name or nickname only, as today; the portal shows it to the parent who
  registered it, on the link only they received.

---

## 12. Backward compatibility

- **No data migration.** `groupId`, `portalTokenHash`, `portalTokenIssuedAt` are optional and
  default to null; every reader treats null as "no group / no link yet". Old enrolments keep
  `cohort: 'first-run-2026'` and `groupId: null`, and count toward no group's seats.
- **Schema migration only** (one file): create `acq_groups` and `acq_messages` with their indexes,
  add the partial unique index on `acq_leads.portalTokenHash`. The three-collection-count tests
  are adjusted the way they were on 19 Sep (the data-layer migration owns ten; later ones own theirs).
- **Old landing pages** (`/memory-game/` cached copies, the previous `/workshop/` build) keep
  working: `groupId` is optional on the POST, the response's extra `portalUrl` is ignored by
  old JavaScript.
- **Attribution untouched**: `attribution` is not read or written by any new code path.
- **Existing owner pages**: additive columns and blocks only.

---

## 13. Files likely affected

**LIVE**
- `src/acquisition/constants.ts` (GROUP_STATUSES, TIME_OF_DAY, limits, switch name, rate limits, `ACQ_COLLECTIONS.groups/messages`)
- `src/models/acqGroup.model.ts`, `src/models/acqMessage.model.ts` (new), `src/models/index.ts`
- `src/models/acqLead.model.ts` (+3 fields), `src/models/acqEnrolment.model.ts` (+groupId)
- `src/acquisition/groups.ts` (new: schedule maths, tz conversion, next-meeting, public shape, seat take/release)
- `src/acquisition/leads.ts` (groupId validation, portal token issue in the transaction, `portalUrl` in the outcome)
- `src/acquisition/leadStatus.ts` (seat take/release inside the status transaction; `group_full`)
- `src/acquisition/portal.ts` (new: token issue/rotate/revoke, portal view loader, messages)
- `src/web/acquisitionRoutes.ts` (GET groups; lead POST field), `src/web/parentPortalRoutes.ts` (new)
- `src/web/groupsOwnerView.ts` (new), `src/web/acquisitionOwnerView.ts` / `acquisitionOwnerData.ts` (group column, thread, link block, unread badge), `src/web/server.ts` (routes, ownerAction cases), `src/web/formBody.ts` (`readFormAll`)
- `src/config/env.ts` (switch), `src/acquisition/config.ts`
- `migrations/2026MMDDhhmmss-acquisition-groups-portal-messages.ts`
- tests: `tests/acquisitionGroups.test.ts`, `tests/acquisitionPortal*.test.ts` additions, `tests/integration/acquisitionGroups.test.ts`, `tests/integration/acquisitionParentPortal.test.ts`, count-test adjustments

**memory-game**
- `landing/index.html` (picker section, hidden groupId, success link, copy from the GET)
- `public/js/schedule.js` (new), `public/js/acquisition.js` (payload `groupId`, outcome carries `portalUrl`)
- `tests/static-site.test.mjs` (payload keys, schedule module, no hard-coded dates)
- `docs/RELEASE-CHECKLIST-INTAKE.md` (a new execution record)

---

## 14. Testing strategy

- **Offline (LIVE)**: group schema rules (sort, renumber, start<end, same-day refusal, capacity ≥
  seats); tz conversion around the DST change (Israel leaves DST on 25 Oct 2026 — a Friday 10:00
  before and after must both be 10:00 local); next-meeting derivation (before first, between,
  during a meeting, after last); public shape has no PII; capacity maths; portal render (states,
  escaping, past/next/future classes); message render escaping; owner pages render; migration
  shape (partial filters equality/$type only).
- **Mongo lane (real HTTP)**: create/edit group through the owner forms and see the public GET
  change with no deploy; lead with `groupId` stored and shown; lead with unknown/closed group →
  400; portal opens with its key, 404 with another lead's key mutated, isolation between two
  leads; rotate/revoke; parent message → appears on the lead page → owner reply → appears on the
  portal; seat race: two concurrent `enrolled` on the last seat, exactly one succeeds and
  `seatsTaken` reconciles; leaving enrolled releases; capacity below seats refused; switch off →
  503; every owner write 401 without the credential; old lead without group renders the "date
  to be agreed" portal.
- **memory-game static**: payload keys; `schedule.js` layout (RTL Sunday-first, month spans, day
  31 edges, irregular dates); no date literal; picker hidden when the GET yields nothing.
- **Browser (before release)**: local preview with a fake groups response; phone and desktop; the
  live page after publish; one synthetic registration in production with the scoped cleanup
  (leads/visits) extended to remove the test lead's messages and token — the cleanup script gains
  `messages by leadId` (exact ids only).

---

## 15. Deployment strategy

1. LIVE first, behind switches: the migration creates the collections; `GET /api/acquisition/groups`
   returns an empty list until Amit creates and opens a group, so the picker stays hidden;
   `PARENT_PORTAL_ENABLED` off until the memory-game page can show the link.
2. Amit creates the two groups in `/engine/acquisition/groups` and enters the meetings (in draft).
3. memory-game: publish the picker (it shows nothing until a group is `open`); verify the page.
4. Amit opens the groups → the cards appear within the 60-second cache. Set
   `PARENT_PORTAL_ENABLED=1`.
5. Rollback: `heroku releases:rollback` for LIVE (the optional fields are ignored by the old
   code; the new collections are inert); the previous memory-game commit republishes through
   the workshop repo. Order matters only one way: the page must never be published before LIVE
   accepts `groupId`, or registrations from the new page would be refused as `invalid_request`.

---

## 16. Risks and open questions

- **Time zone**: the one place a subtle bug can hide. Mitigated by storing wall-clock strings as
  the truth, deriving instants with an explicit Asia/Jerusalem conversion, and testing across the
  October DST change.
- **Editing a meeting after registration** (recon Q20): the portal and picker derive from the
  group, so the change shows on the next open; nothing else needs updating. Recommendation: the
  group page shows how many enrolled/pending leads the change affects, and Amit tells them by
  WhatsApp or a portal message — no automatic notification in this increment.
- **Historical meetings** (Q21): stay in the array; the portal dims them; the picker shows the
  whole schedule as long as the group is `open` (a group already running should be `closed`,
  which hides it from the picker but not from portals).
- **A parent loses the link**: Amit re-issues from the lead page and sends it by WhatsApp; the
  landing page also keeps it in the browser that registered.
- **Waitlist**: a full open group still accepts registrations (interest). If Amit prefers to
  hide or refuse a full group, it is a one-line change in the public shape / validation.
- **Price**: optional on the group; the portal shows "טרם שולם" until the enrolment is marked
  paid. No payment provider.
- **Message abuse**: rate limits and a length cap; Amit can revoke the link.
- **Two repos, one feature**: the page must not go out before LIVE (§15).

Assumptions in the prompt that the code says are unnecessary or wrong (Q26): a new "order"
object (the lead already is it); `/workshop/order/<token>` on the Pages site (must be LIVE);
"confirmed/pending/released" as new states (they are `enrolled` / the active statuses / leaving
`enrolled`); polling for messages (refresh-on-load suffices); a migration for old records (none);
"registration consumes capacity" (it should not; confirmation does).

---

## 17. Sprint / PR recommendation

**Option B — two increments**, with this exact boundary:

- **Increment 1 — groups.** `acq_groups`, owner group pages, public GET, picker + calendar on
  the landing page, `lead.groupId`, `enrolment.groupId`, seat take/release in the status
  transaction. Independently valuable (Amit configures and shows dates; registrations name a
  group), touches the public intake and the Pages ordering, and is the increment with the time
  zone risk. ~1.5 days including release.
- **Increment 2 — the parent portal.** Portal key on the lead, `/workshop/order/<key>`, the 201
  response's `portalUrl`, the success-message link, `acq_messages`, owner reply and unread
  badge, `PARENT_PORTAL_ENABLED`. It introduces a **new public surface that shows a child's name
  and a parent's contact data by token** — it deserves its own review and its own switch, and it
  depends on increment 1 only for the schedule section. ~1.5 days including release.

Why the split reduces real risk rather than adding ceremony: the two halves fail differently
(schedule correctness and deploy ordering versus data exposure and token handling), each is
rollback-safe on its own, and one PR would span two repositories, two migrations, three new
collections/fields, four new pages and roughly 2,500 lines — beyond what one review can hold in
mind. If Amit still prefers one PR, it remains feasible: the plan is written so both increments
share one migration file and one release checklist; the only cost is review size.

---

## 18. Ordered implementation checklist

**Increment 1**
1. Constants, env switch names, limits; `acqGroup.model.ts` with the schedule rules and tz
   derivation; `groups.ts` (public shape, next-meeting, seat take/release); offline tests incl. DST.
2. Lead/enrolment optional `groupId`; `leads.ts` validation; `leadStatus.ts` seat logic and
   `group_full`; migration (groups collection + indexes); count-test adjustments.
3. `GET /api/acquisition/groups`; owner groups pages and actions; leads list/detail additions.
4. Mongo-lane tests (CRUD → public GET, seat race, reconciliation, 401s).
5. memory-game: `schedule.js` + tests; picker section; payload `groupId`; copy from the GET;
   local preview on phone/desktop with a fake response.
6. Release: CI, fast-forward, deploy, create groups as draft, publish the page, open groups,
   verify live, record in the checklist.

**Increment 2**
7. Lead `portalTokenHash/IssuedAt`; `portal.ts` (issue/rotate/revoke, view loader, messages);
   `acqMessage.model.ts`; migration; offline tests.
8. `parentPortalRoutes.ts` (page + message POST, limits, switch); owner lead page: link block,
   thread, reply; leads list unread badge; `portalUrl` in the 201.
9. Mongo-lane tests (isolation, rotate/revoke, thread both ways, closed states, 503, 401s).
10. memory-game: success message with the link and the WhatsApp-to-self button; static tests.
11. Release behind `PARENT_PORTAL_ENABLED`; one synthetic registration; scoped cleanup extended
    to messages/token; enable; record.

---

## 19. Acceptance criteria / Definition of Done

**Increment 1**
- Amit creates a group with any set of meetings (irregular dates, different hours, a gap), saves,
  and the public page shows the cards and the exact meetings within a minute, with no deploy.
- Every meeting is individually editable; renumbering follows date order; refusals are explained
  (end before start, two meetings on one day, capacity below seats).
- A parent picks a group; the registration stores it; Amit sees the group on the lead and on the
  group's page; attribution is unchanged (verified with a LEAF referral in the Mongo lane and one
  production smoke test cleaned up by id).
- Two simultaneous confirmations of the last seat: exactly one succeeds; the card shows 0 left;
  registration still possible and labelled as waitlist on Amit's side.
- Old leads and enrolments render unchanged; no data migration ran.
- All CI jobs green; static checks green; release recorded in the checklist.

**Increment 2**
- A registration returns a link; the link shows next meeting with countdown, the schedule with
  past/next/future, the summary and the thread; another lead's link never shows this lead.
- A meeting edited in admin is reflected on the parent's next open.
- Parent writes, Amit sees and replies on the lead page, parent sees the reply on reload;
  parent messages are escaped and length-capped.
- Rotate kills the old link; revoke closes the page; unknown key → 404; switch off → 503; PII-purged
  or closed lead → the closed page.
- No sequential id in any public URL; no other parent's data reachable; every owner write 401
  without the credential; all writes audited without PII.

---

*Stop condition honoured: this document is the deliverable. Nothing was implemented.*
