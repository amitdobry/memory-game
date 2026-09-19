# Plan — distributor self-onboarding from the leaflet

Written 19 September 2026 after Amit described the flow he wants: a distributor receives a
stack of leaflets, scans the QR code, taps the small "פרטים חשובים" label on the landing page five times (Amit’s choice, 19 Sep), fills in a
short form (name, phone, email) on LIVE, and that batch becomes theirs. **Nothing here is
implemented.** Six batches (LEAF1–LEAF6) exist, all `unassigned`; six QR codes exist in `qr/`.

## 1. The one thing the gesture cannot be

The QR URL is public the moment a leaflet is on a noticeboard. A five-tap is a convenience,
not a secret: a curious parent or child will find it, and whoever submits the form first
would own the batch and every commission credited to it. So the design rule is:

> The hidden gesture opens the door. **Something Amit controls decides who gets the batch.**

Two options for that control, either alone or together:

| Option | How | Cost to Amit | Risk |
|---|---|---|---|
| **A. Approval gate (recommended)** | The form creates a *pending claim*. Amit sees it in `/engine/acquisition` and presses Approve. Only then is the batch assigned. | One click per distributor, in the view he already uses. | None beyond a stranger's claim sitting as "pending" until rejected. |
| **B. Verbal claim code** | Amit tells each distributor a short code for their batch; the form requires it; a correct code assigns immediately. | Six codes to remember and tell; a wrong batch/code mix-up is a support call. | A code repeated aloud can be overheard; no human check. |

Recommendation: **A, with B optional later.** Amit is already talking to every distributor;
the approval is a ten-second confirmation of a conversation that has already happened.

## 2. The flow, step by step

1. **Handover.** Amit gives the distributor their stack (say LEAF3) and says: scan the code,
   tap "פרטים חשובים" five times, fill in your details. He can also send them the direct link
   (§3) on WhatsApp, so the gesture is never the only way in.
2. **Landing page** (`/workshop/?ref=LEAF3`). Five taps within about two seconds on the small "פרטים חשובים" label — the eyebrow above
   "קבוצה קטנה. עבודה אמיתית." in the facts section, chosen by Amit from a phone screenshot —
   navigate to LIVE:
   `https://live-intelligence-f6ec7b9df867.herokuapp.com/distributor/claim?ref=LEAF3`.
   The code comes from the page's remembered attribution, so a distributor who scanned on
   Sunday and taps on Monday still claims the right batch. Anything else about the page is
   unchanged; the label is plain text, so single taps do nothing, as today.
3. **Claim form on LIVE**, server-rendered Hebrew, no framework, same style as the owner view.
   It shows which leaflet is being claimed ("עלון 3"), and asks for: full name, mobile phone,
   email. Below the fields, a short privacy line: what is stored (name, phone, email, which
   leaflet), why (to credit registrations and pay commission), who sees it (Amit only), how to
   ask for deletion. A required checkbox. Submit.
4. **Server.** Validates strictly; refuses if the batch is not `active` and `unassigned`, or
   already has a pending claim; rate-limits per caller and per batch; finds or creates the
   distributor by email as `invited` (no password), stores the phone; writes one **claim**
   record (`pending`) and one audit row with ids only. Replies with a plain page: "תודה. עמית
   יאשר את הבקשה ויחזור אליך ב-WhatsApp." No email or message is sent — none of that exists.
5. **Approval.** In `/engine/acquisition` (Basic auth, fails closed) a new "Claims" block lists
   pending claims: leaflet, name, phone, email, time. **Approve** runs one transaction: batch
   → `assignment: distributor`, `distributorId`; claim → `approved`; and nothing else: leads
   that batch already produced stay as they are (Amit’s decision, §6). **Reject** marks
   the claim rejected and leaves everything else as it was. Both write audit rows.
6. **Afterwards.** The distributor sees nothing yet — there is no distributor login or dashboard
   (that is the later slice the recon planned). Amit tells them by WhatsApp that they are set.
   From then on, their leads show under their name in the owner view.

## 3. Addresses and switches

- `GET  /distributor/claim?ref=CODE` — the form. Without a valid, claimable code: a page that
  says to scan the leaflet's QR code, no form.
- `POST /distributor/claim` — the submission.
- Both behind a new switch `DISTRIBUTOR_CLAIMS_ENABLED` (default off, 503 before any read),
  independent of `ACQUISITION_ENABLED`, so claims can be paused without pausing registration.
- Owner actions: `POST /engine/acquisition/claims/:id/approve` and `/reject`, inside the
  `/engine` Basic-auth block, plain HTML forms (same origin, `SameSite` needs nothing extra).
  This is the owner view's **first write action**; it stays the only one.

## 4. Data

- **New collection `acq_batch_claims`**: `batchId`, `distributorId`, `status`
  (`pending | approved | rejected`), `decidedAt`, `decidedBy` (`owner`), `callerKeyHash`
  (for the rate limit and forensics, not the raw address), timestamps. Partial unique index on
  `batchId` where `status: 'pending'` — one open claim per batch, an equality filter as the
  data layer's rules require.
- **Distributor gains `phone`** (E.164, via the existing `normalizePhone`/`phoneKeyOf`) and a
  `phoneKey` for lookup. Email stays the unique login identifier for the later login slice.
- **Audit**: `distributor.claim.requested`, `distributor.claim.approved`,
  `distributor.claim.rejected`, `batch.assigned` — ids and statuses
  only; the redaction hook already refuses names, phones and emails.
- **Migration**: one file, indexes only (`autoIndex` is off), run in the Heroku release phase.
- The batch setup script is untouched: it still refuses to change an assignment, so a claim
  approval is the *only* code path that assigns a batch, and it is audited.

## 5. Safety checklist

- Rate limits: claims 5 per 10 minutes per caller, 3 per hour per batch (in-memory limiter
  already in `rateLimit.ts`).
- Strict body schema, size cap, `no-store`/`no-referrer`/`nosniff` on every page.
- Only `active` + `unassigned` batches are claimable; a second claim on a batch with a pending
  one gets a calm "already requested" page, not an error dump.
- Approval requires the Engine Room credential; anonymous or wrong-credential requests get 401
  before any query, exactly like the owner view today.
- Rejected claims keep the distributor record as `invited`; Amit can delete it by a scoped
  script if it was noise. No general delete button.
- Nothing here touches leads' contact data, the intake endpoints, or LIVE's other routes.

## 6. Decisions for Amit before building

1. **Gate:** approval only. **Decided** (Amit, 19 Sep 2026): the agreement is verbal — hand over a stack, the person registers, Amit approves; 150 ILS per enrolled student.
2. **Earlier leads:** **no backfill. Decided** (Amit): leads are his; a distributor is credited only for leads that arrive after the batch is allocated to them. Approval changes the batch, never an existing lead.
3. **Fields:** name, phone, email — all required. **Decided.**
4. **Gesture:** **five taps on the "פרטים חשובים" label** in the facts section (decided by Amit, 19 Sep 2026), plus a plain link Amit can send. Decided.
5. **Retention:** distributor contact details are business records kept for the engagement;
   is a written retention line in the form's privacy text enough?

## 7. Work and order

| Slice | Where | Content | Size |
|---|---|---|---|
| A | LIVE | migration + claim model + distributor phone; claim page GET/POST; switch; limits; offline tests + Mongo-lane tests | ~1 day |
| B | LIVE | owner Claims block with Approve/Reject; assignment transaction; audit; tests incl. A-cannot-approve-B style isolation | ~½ day |
| C | memory-game | five taps on the "פרטים חשובים" label → LIVE claim URL with the remembered code; static tests; published through the workshop repo | ~1 hour |
| D | release | CI on a `product/**` branch, fast-forward, deploy with the switch off, enable, production check with a **test batch** (created by the batch script, e.g. `TESTCLM`, claimed and rejected), scoped cleanup of that claim and distributor, then the real switch-on | ~½ day |

Order A → B → C → D. C is harmless to ship early only if LIVE already answers the claim URL;
otherwise the gesture would lead to a 404, so C waits for A.

## 8. What this deliberately does not include

Distributor login, dashboard, commission recording and payout, email or WhatsApp sending,
any change to the six existing batches' ownership before an approval, any change to the
landing-page copy beyond the invisible gesture.
