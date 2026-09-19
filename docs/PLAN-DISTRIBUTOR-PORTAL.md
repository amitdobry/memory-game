# Plan — the distributor's link, the WhatsApp invite, and Amit's grand view

Written 19 September 2026, after the claim flow went live (see PLAN-DISTRIBUTOR-ONBOARDING.md).
What Amit asked for: right after he presses **Approve**, a paste-ready WhatsApp message that says
"approved, here is your link"; a personal link the distributor keeps and opens whenever they want
to see how their leaflet is doing; and a grand view of all distributors for Amit. All on LIVE.
**Nothing here is implemented yet.**

## 1. The link: a personal key, not a password

A hairdresser will not remember a password for a leaflet. The proposal is a **personal link**:

`https://live-intelligence-f6ec7b9df867.herokuapp.com/distributor/d/<key>`

- `key` is 32 random bytes, base64url (43 characters). LIVE stores only its SHA-256, like every
  other token in the project. The clear key exists once: in the WhatsApp message Amit pastes.
- The link works for as long as the distributor is `active`. Amit can **rotate** it (old link dies,
  new message to paste) or **disable** the distributor (link dies, batches stay assigned, history
  kept). Both are one click in the grand view and are audited.
- Opening the link the first time moves the distributor from `invited` to `active` and stamps
  `lastSeenAt`; every later open updates `lastSeenAt`. That is how Amit sees who actually looks.
- Why this is proportionate: the page shows **counts, dates, grades and statuses — never a parent's
  name, phone, email or note.** Someone who finds the link learns how many people registered from
  leaflet 6, nothing about who. Rate-limited (20 opens per minute per address), `no-store`,
  `noindex`, no cookie, nothing to log out of.
- The recon's email+password login stays as a later option if a distributor ever needs to see
  more than counts. The data model already has the fields; nothing here blocks it.

## 2. The WhatsApp invite, paste-ready

Approve currently redirects to the list with a notice. It will instead redirect to the
distributor's row in the grand view, which shows a ready message and two buttons:
**Open in WhatsApp** (a `wa.me/<their phone>?text=…` link, so the chat opens with the text filled
in and Amit presses send himself — LIVE never sends anything) and **Copy**.

Hebrew text (Amit's review):

> שלום {שם}, אישרתי אותך כמפיץ/ה של עלון {מספר} של הסדנה "בונים עם AI". תודה!
> זה הקישור האישי שלך למעקב אחרי ההרשמות שמגיעות מהעלון: {קישור}
> הקישור אישי – לא להעביר אותו. על כל תלמיד שנרשם דרך העלון שלך ומשלם – 150 ₪.
> עמית

The 150 ₪ line is included because Amit said the agreement is verbal; the message writes it down
once. He can strike it.

## 3. What the distributor sees (`/distributor/d/<key>`)

Hebrew, right-to-left, phone-first, same style as the claim form.

- **Header:** "שלום {שם}", their leaflet(s): "עלון 6 (LEAF6)".
- **Funnel per leaflet:** visits from the leaflet · registrations · in contact · trial booked ·
  enrolled · paid. Numbers only.
- **Recent registrations:** date, grade, status — one line each, newest first, last 20. No names,
  no phones, no notes. Exactly the masked view the recon recommended.
- **Commission line:** "עמלות: {n} × 150 ₪ = {sum} ₪ (שולם: {paid})" — driven by the commission
  ledger, which stays empty until Amit records payments (§5), so it reads 0 until then.
- **Footer:** "שאלות? עמית ב-WhatsApp" — a link to Amit's number, and "הקישור אישי, לא להעביר".

## 4. Amit's grand view (`/engine/acquisition/distributors`, Basic auth)

One table, one row per distributor: name · phone · email · status (invited / active / disabled)
· leaflets · visits · registrations by status · enrolled · paid · last seen · **actions**:
WhatsApp message (with copy), rotate link, disable / re-enable. Clicking a name opens the
distributor's page: the same numbers plus their claims and audit tail. The existing Leads list
stays; the claims block stays and links to the new page after an approval.

## 5. The workflow — every status, in one place

These already exist in the data model; this plan only adds the arrows Amit can press.

| Thing | Statuses | Who moves it, how |
|---|---|---|
| **Claim** | pending → approved / rejected | Amit, Approve/Reject (live) |
| **Distributor** | invited → active → disabled (→ active again) | invited by the claim; active on first link open; disabled/re-enabled by Amit (this plan) |
| **Batch (leaflet)** | unassigned → assigned (distributor or owner) → retired | approval assigns (live); retire by script |
| **Lead (registration)** | submitted → contacted → trial_booked → enrolled; side exits: not_interested, invalid_contact, duplicate | **Amit, in the lead's page (this plan)** — a status select + optional note, audited; the only lead write, and it never touches contact data |
| **Enrolment** | enrolled → (fully paid, a dated fact) → cancelled / refunded | created when a lead becomes enrolled; "mark paid" button (this plan, minimal) |
| **Commission** | earned → paid / reversed | earned automatically when an enrolment is marked fully paid and the lead's leaflet has a distributor (150 ₪); "mark paid" by Amit; reversed on refund. Amit's own leaflet earns nothing |

The distributor's page and the grand view are read-only projections of these. So "people rolling
in" shows up like this: a parent registers (submitted) → Amit calls and sets contacted → books a
trial → enrols → marks paid → the commission row appears as earned → Amit pays the distributor and
marks it paid. Each step is one click on the lead's page and one audit row.

## 6. Data and safety

- Distributor: `accessTokenHash`, `accessTokenIssuedAt`, `lastSeenAt` (new); `status` already exists.
- Enrolment and commission collections exist; a service function creates the enrolment on
  `enrolled`, the commission on "fully paid".
- Migration: one index on `accessTokenHash` (unique, partial on `$type: 'string'`).
- Audit: `distributor.link.issued`, `distributor.link.rotated`, `distributor.disabled`,
  `distributor.enabled`, `lead.status.changed`, `enrolment.created`, `enrolment.paid`,
  `commission.earned`, `commission.paid` — ids and statuses only.
- Every distributor query is `{ distributorId }` from the key's lookup, never from the URL's
  other parts; a foreign id is 404. Mongo-lane test: distributor A's key never shows B's numbers.
- Switch: `DISTRIBUTOR_PORTAL_ENABLED` (off by default, 503) so the link pages can be paused
  without touching claims or registrations.

## 7. Work and order

| Slice | Content | Size |
|---|---|---|
| A | key + `/distributor/d/<key>` page + grand view + WhatsApp message after Approve + rotate/disable | ~1 day |
| B | lead status change on the lead page + enrolment + "mark paid" + commission earned/paid | ~½ day |
| C | release: CI, deploy with the switch off, enable, Amit opens his own LEAF6 link, checks his grand view | ~2 hours |

A first: it is what Amit asked for word for word. B makes the funnel move. Nothing in memory-game
changes; the landing page is untouched.

## 8. Decisions (Amit, 19 Sep 2026)

1. **Personal link with a key.** Decided.
2. **WhatsApp wording without the money line.** The 150 ₪ sentence is dropped; the agreement stays verbal.
3. **Distributors see grade and status per registration**, not counts only.
4. **Status groups, shown as colours with the substatus on hover:**
   - **Active (green):** submitted, contacted, trial_booked, enrolled (unpaid).
   - **Closed (gray):** not_interested, invalid_contact, duplicate.
   - **Paid (blue):** enrolled and the enrolment is fully paid — the final state, the moment the distributor is owed. It does not mean the course is finished.
   The lead keeps its detailed status; the group is derived from it and from the enrolment's payment date. `callback` and `waitlist` are not added for now.

The WhatsApp text becomes:

> שלום {שם}, אישרתי אותך כמפיץ/ה של עלון {מספר} של הסדנה "בונים עם AI". תודה!
> זה הקישור האישי שלך למעקב אחרי ההרשמות שמגיעות מהעלון: {קישור}
> הקישור אישי – לא להעביר אותו.
> עמית
