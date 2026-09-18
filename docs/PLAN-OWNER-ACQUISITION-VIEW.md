# Plan — owner-only acquisition view (read-only)

Prepared 18 September 2026. A plan, not an implementation. Scope: Amit can see the leads that
the intake stored, and one lead in full, from his phone, behind the credential he already has.
Nothing else: no distributor access, no status changes, no commissions, no demo grants.

## Where it lives and who may see it

Inside LIVE, on the Engine Room's origin and behind its authority. `src/web/server.ts` already
routes `/engine` and `/engine/*` through `configuredCredentials()` and `isAuthorised()`
(`src/web/basicAuth.ts`): Basic auth, constant-time comparison, **fails closed with 503 when
`ENGINE_ROOM_USER`/`ENGINE_ROOM_PASSWORD` are unset**. The acquisition view adds two paths under
that same prefix and therefore inherits the check on every request, server-side, before any
query runs:

| Path | What |
|---|---|
| `GET /engine/acquisition` | the lead list, newest first, paginated |
| `GET /engine/acquisition/leads/<id>` | one lead in full |

Nothing is added under `/api/acquisition/*` (public) or `/api/home` (ownership-blind reader
surface). No new credential, cookie or session. No JSON API in this slice: server-rendered HTML,
like the rest of `/engine`, which works from a phone with no app.

## What the list shows

Twenty-five leads per page, newest first, cursor pagination on `_id` (`?before=<id>`), which is
stable under inserts and needs no new index (`_id` is indexed; `acq_leads_status_time` covers a
later status filter). Columns:

- submitted at (Israel local time, via the existing `localTime.ts`)
- parent name, parent phone (E.164 as stored, shown in local form), grade
- participant first name or nickname
- referral: the credited batch's code and legacy alias, and the distributor's display name or
  "Amit" — resolved with one `$in` lookup per page over `acq_batches` and `acq_distributors`
- current status (`submitted` … `duplicate`, read-only)
- a "duplicate phone?" mark when another lead shares the `phoneKey` (one `$group` per page)

Anonymised leads (`piiPurgedAt` set) render with a dash in every personal column and keep their
date, referral and status. A `status` filter (`?status=`) and a plain count of leads per status
at the top are cheap and included; nothing else.

## What the detail shows

Everything the lead holds that the owner may act on: the list's fields, plus parent email, note,
consent version and time, the three attribution facts (first, latest, credited) each resolved to
a batch code, the linked visit's summary (first seen, last seen, hits, leadCount), and the audit
trail for the record (`acq_audit` by `subject.recordId`, oldest first). No idempotency key, no
submission hash, no visitor id beyond "linked / not linked", no raw ObjectIds except the lead's
own in the URL.

## Authorization and safety, server-side

- Every handler starts with the same Basic check the Engine Room uses; an unauthenticated
  request gets 401 with the `WWW-Authenticate` realm, an unconfigured server 503, and neither
  runs a query.
- Read-only by construction: the route file imports models for `find`/`findById`/`aggregate`
  only. A source-level ratchet (like `tests/apiSurface.test.ts`) asserts the file contains no
  `create`, `updateOne`, `save`, `deleteOne` or `findOneAndUpdate`.
- `cache-control: no-store`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`,
  as the Engine Room already sets. Every value is passed through the Engine Room's `escape()`.
- Logs name a page or an id, never a lead's contents.
- The public intake stays untouched; the ratchet that `/api/acquisition/*` has no GET endpoint
  remains.

## Files

| File | Purpose |
|---|---|
| `src/web/acquisitionOwnerData.ts` | the reads: page of leads with resolved referral and duplicate marks; one lead with visit and audit |
| `src/web/acquisitionOwnerView.ts` | rendering: list, detail, empty state, pagination links |
| `src/web/server.ts` | two `if (path…)` branches inside the existing `/engine` block, after the credential check |
| `tests/acquisitionOwnerView.test.ts` | offline: rendering with fixtures — escaping, anonymised rows, duplicate marks, pagination link shape, no hash/key in output |
| `tests/integration/acquisitionOwnerView.test.ts` | spawned server: 503 unconfigured, 401 anonymous, 200 authorised; a seeded lead appears with its referral; `?before=` pages; unknown id → 404; anonymised lead renders without PII; the response never contains `submissionHash` or `idempotencyKey` |
| `tests/apiSurface.test.ts` (extend) | the owner route file is read-only and `/api/acquisition/*` still has no GET |

No migration and no model change. No new environment variable.

## Definition of done

Amit opens `/engine/acquisition` on his phone with the Engine Room credential and sees the
smoke-test lead from the release checklist with its batch and distributor; opens it; sees the
audit row; cannot change anything. An anonymous request is refused before any query. CI green
including the integration file.

## Explicitly deferred

Distributor login and their masked view, owner writes (status, reassignment, enrolment,
payment, commission), demo grants, retention purge, lead notifications, a JSON API for the
view, and any per-distributor filtering. Each of these is a slice of its own with its own
authorization story.
