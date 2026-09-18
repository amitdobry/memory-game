# Release checklist — visitor and lead intake (slices 2–3)

Prepared 18 September 2026, revised the same day after review. **Executed on 19 September 2026 — see the execution record below.** Every step is a manual action by Amit, in this order, and each has a check that

## Execution record — 19 September 2026

Every step below was executed on 19 September 2026 (00:50–01:45 Israel time), by Claude with
Amit's explicit authorisation, in the order written. Ownership of the six leaflet batches is
**undecided**: all six exist as `unassigned`, none is credited to Amit or to any distributor.

| Step | Result |
| --- | --- |
| Gate | LIVE `bfb8675` (adds the explicit `unassigned` batch state, the first-run batch config, the test-run inspect/cleanup scripts). CI #170 on `product/workshop-acquisition-slice-5` and CI #171 on `product/web-v0`: Engine 1378 tests, Product build, Mongo lane 669 tests — all green. (CI #169 at `fd2132e` failed two of the new Mongo-lane tests; fixed in `bfb8675`, nothing deployed from it.) |
| 0 | `npm run verify:db` on Heroku: MongoDB 8.0.32, replica set, transaction probe committed. |
| 1 | Heroku release **v82** = `bfb8675` with `ACQUISITION_ENABLED` unset. Release phase applied `20260918210000` and `20260918230000`; `migrate:status` shows 0 pending. `/health` 200, `/api/workshop/health` 200 (classroom), `POST /api/acquisition/visit` and `/lead` 503, `/engine` and `/engine/acquisition` 401 with `Basic realm="LIVE Engine Room"`, CORS preflight from `https://amitdobry.github.io` 204. |
| 2 | Dry run found no batches and no distributors in production. `--apply` created `LEAF1..LEAF6` with legacy aliases 1..6, labels "עלון N — מחזור ראשון", all `unassigned`. `acq-verify-referrals` resolved all 12 forms (`ref=LEAFn`, `b=n`) through the endpoint resolver and confirmed `NOSUCHCODE` gets no credit. |
| 3 | memory-game `main` pushed (`b2f6c3e`), Pages run #9 green. Live page carries the approved lesson 6 copy, links to `/workshop-game/` and the memory-game demo, loads `js/acquisition.js`; its visit beacon got 503 while intake was off. The submit-time "ההרשמה באתר עדיין לא פתוחה" state was confirmed from the deployed code, not by submitting the form. |
| 4 | Heroku **v83** set `ACQUISITION_ENABLED=1`. Smoke test with synthetic contact data (all `@example.invalid`, phones `050000000N`), fresh visitor ids and unique idempotency keys, run label `smoke-20260919-v82`: 6 referral visits (odd batches via `ref`, even via `b`) → 202 recognised; 6 leads → 201; 6 exact retries → 200 replay with the same id, no duplicate; later direct visit → 202 not recognised and the visit kept `first=latest=LEAF1`; A-then-B (LEAF2 then b=5, lead from B's page) → `first=credited=LEAF2`, `latest=LEAF5`; unknown code → 202 not recognised, no credit; anonymous and wrong-credential `/engine/acquisition` → 401; GET on the visit endpoint → 405; malformed lead → 400 with field names only. The lead limiter (8 per 10 minutes per address) returned 429 mid-run, so the second half ran after the window; that is the limiter working. Every lead resolved `creditedDistributor=none` under an `unassigned` batch. The owner view was **not** opened in a browser: it needs Amit's Engine Room credential. |
| 5 | Cleanup by exact ids (manifest of 7 lead `_id`s and 9 visitor ids, including the one enable-probe visit): dry run listed exactly those; `--apply` removed **7 leads, 9 visits**, added **7** `test-run.cleanup` audit rows; a second dry run found 0 present. Totals after: batches 6 (6 unassigned), distributors 0, leads 0, visits 0, audit 14 (7 `lead.submitted` + 7 `test-run.cleanup`). No collection was dropped; no audit row was touched. |

Not tested: a physical QR scan (no leaflet is printed). Not done: distributor dashboards,
payment or commission controls, AI-demo access, any distributor assignment, any leaflet
distribution.

Kill switch if anything below misbehaves: `heroku config:unset ACQUISITION_ENABLED --app live-intelligence`.

---
must pass before the next.

**Accepted gates:** CI #166 on `product/web-v0` at `dbaf3af` (intake), and CI #167 at `810d97d`
on a feature branch (batch scripts + owner view) — Engine 1370 offline tests and slug boot,
Product build clean, Mongo-backed integration lane 666 tests including every acquisition file.
`810d97d` is the commit to deploy; the batch scripts and the owner view are in its slug.

State at preparation: Heroku at `6143d27`; memory-game `main` ahead of GitHub and not published;
no batch records anywhere; `ACQUISITION_ENABLED` unset.

Two rules that hold throughout: **secrets are never printed or passed on a command line** —
every check uses the application's own configured connection; and **nothing below creates,
updates or deletes production records except where a step says exactly which record and how.**

---

## 0. Does production MongoDB support the transaction?

Lead intake writes the lead, the visit link and the audit row in one multi-document
transaction, which needs a replica set on MongoDB ≥ 4.2. Production has not been checked.

1. `heroku run npm run verify:db --app live-intelligence`. The script (`scripts/verify-database.ts`)
   connects with the app's own `MONGODB_URI`, prints only `protocol://host`, the server version,
   whether the deployment is a replica set, and the result of opening and committing a real
   transaction on a throwaway collection it removes afterwards. No URI, no password.
2. `heroku run npm run migrate:status --app live-intelligence` lists every migration with its
   state. Expect the two acquisition migrations (`20260918210000`, `20260918230000`) as
   **PENDING** and everything older as APPLIED. This shows *pending versus applied state*; it
   says nothing about whether a migration is idempotent — that property is proven by the
   offline migration tests and the `down/up/up` integration test, already run in CI.

**Stop if** `verify:db` reports a standalone deployment, a version below 4.2, or a failed
transaction probe. The release phase would still succeed and the first lead would fail.

## 1. Deploy LIVE with acquisition disabled

1. Confirm the switch is absent: `heroku config:get ACQUISITION_ENABLED --app live-intelligence`
   prints an empty line.
2. Confirm what is being deployed: `git log --oneline -1 origin/product/web-v0` is the commit CI
   last passed, and it contains the two batch scripts.
3. Deploy: `git push heroku product/web-v0:main`. The release phase applies the two migrations.
4. Check:
   - `heroku releases --app live-intelligence` shows the new release; `heroku logs --tail`
     shows both migrations applied and the web dyno listening;
   - `heroku run npm run migrate:status` now shows both as APPLIED;
   - `curl -s https://live-intelligence-f6ec7b9df867.herokuapp.com/health` → `{"status":"ok",…}`;
   - `curl -s -X POST …/api/acquisition/visit -H 'content-type: application/json' -d '{"visitorId":"release-gate-1-disabled"}'`
     → **503** `{"error":"acquisition_unavailable"}`. Nothing is read or written while disabled
     (asserted by `tests/acquisitionIntake.test.ts`);
   - `curl -s …/api/workshop/health` answers as before: the classroom door is untouched.
   - Rollback: `heroku releases:rollback`. The migrations are additive and stay.

## 2. Create and verify the batch records

The endpoints never create batches. The owner dashboard does not exist yet. The tool is
`scripts/acq-batches.ts`, which plans first and writes only on `--apply`, and refuses to change
anything that already exists.

1. **Decide on paper**, then write a local config file that is **not committed**
   (`scripts/acq-batches.local.json`, copied from `scripts/acq-batches.example.json`): for each
   leaflet stack a `code` (3–12 upper-case alphanumerics), a `label`, its printed design as
   `legacyNumber` 1–6 or none, and `owner`: a distributor key or `null` for Amit's own.
   Distributors are listed by key, display name and the **name of an environment variable**
   that holds their email. No email address is ever in a file that reaches git.
   Ownership is a decision Amit makes; nothing in the tooling assumes one.
2. **Dry run against production**, with the email variables passed to the one-off dyno only:
   ```
   heroku run --env ACQ_DIST_A_EMAIL=<address> --app live-intelligence \
     "node scripts/acq-batches.ts scripts/acq-batches.local.json"
   ```
   (The local file must be on the dyno: either commit a *placeholder-free* copy under a
   git-ignored path is impossible on Heroku, so paste its contents with `heroku run bash` and a
   heredoc, or run the script from a developer machine with the production URI in the shell
   environment — never on the command line.) The output lists `+` (to create) and `=` (already
   present and matching) rows. Any **conflict** (an alias or owner that differs from the
   database, a duplicate code or alias in the file, a missing email variable) is printed and the
   run exits 1 having written nothing. Fix the file, never the database.
3. **Apply** with the same command plus `--apply`. Distributors are created as `invited`;
   batches as `active`. Running it again is a no-op (`=` everywhere).
4. **Verify with the real resolver**, read-only, while acquisition is still disabled:
   ```
   heroku run --env ACQ_DIST_A_EMAIL=<address> --app live-intelligence \
     "node scripts/acq-verify-referrals.ts scripts/acq-batches.local.json"
   ```
   It runs `parseReferral → resolveReferral` — the same functions the endpoints call — for every
   code and every alias, checks each lands on the intended batch and the intended owner, and
   probes an unknown code to show it resolves to nothing. Exit 0 with "All intended referrals
   resolve" is the gate. The disabled HTTP endpoints cannot perform this check; the script does.
5. Print and hand out nothing yet.

## 3. Publish memory-game

1. In `AI workshop 10-13`: `npm test` (43 static checks).
2. `git push origin main`. Pages publishes `public/` within about a minute.
3. Check `https://amitdobry.github.io/memory-game/?b=3`:
   - the page loads; the WhatsApp card's message ends with `(מעלון 3)`;
   - the registration form submits and shows **"ההרשמה באתר עדיין לא פתוחה"** with the WhatsApp
     alternative — correct while the switch is off;
   - `/memory-game/workshop.html`, `/memory-game/build.html?u=kid1` and the example game card
     all work as before.
4. Rollback: `git revert`, push; Pages republishes.

## 4. Enable registration and prove the flow end to end

1. `heroku config:set ACQUISITION_ENABLED=1 --app live-intelligence` (the dyno restarts).
2. **Referral check over HTTP** — one request per real code and alias, with an exact test id
   each time, e.g. `visitorId: "smoke-2026-09-25-ref-Y7K2"`:
   ```
   curl -s -X POST …/api/acquisition/visit -H 'content-type: application/json' \
     -H 'origin: https://amitdobry.github.io' -d '{"visitorId":"smoke-2026-09-25-ref-Y7K2","ref":"Y7K2"}'
   ```
   Expect `{"ok":true,"recognised":true}` for every intended code and alias, and
   `recognised:false` for `"ref":"NOSUCH"`.
3. **Controlled idempotency check**, from a terminal, with an exact key, e.g.
   `smoke-2026-09-25-lead-1`, and Amit's own contact details with an obviously synthetic
   participant name:
   ```
   BODY='{"parentName":"…","parentPhone":"…","participantFirstName":"SMOKE-TEST","grade":"8","consent":true,"idempotencyKey":"smoke-2026-09-25-lead-1","visitorId":"smoke-2026-09-25-ref-Y7K2","ref":"Y7K2"}'
   curl … -d "$BODY"                       → 201 {"ok":true,"leadRef":"<id>","replay":false}
   curl … -d "$BODY"                       → 200 {"ok":true,"leadRef":"<same id>","replay":true}
   curl … -d "${BODY/SMOKE-TEST/CHANGED}"  → 409 {"error":"idempotency_conflict"}
   ```
   This — not clicking the form twice — is the replay proof. The form locks after success by
   design, so a second click on the page proves nothing about the server.
4. **The page itself**, once, on a phone: open `…/memory-game/?b=3`, submit the same synthetic
   family with a different participant nickname (`SMOKE-PAGE`). Expect **"ההרשמה נקלטה"**.
5. **Inspect by exact ids**, read-only, in `mongosh` on the production database (opened with the
   URI in the shell environment, not on the command line):
   ```
   db.acq_visits.findOne({ visitorId: "smoke-2026-09-25-ref-Y7K2" })
     // firstBatchId = Y7K2's batch, hits ≥ 1, leadId = the lead below, leadCount ≥ 1, expiresAt null
   db.acq_leads.findOne({ idempotencyKey: "smoke-2026-09-25-lead-1" })
     // status submitted, attribution.creditedBatchId = Y7K2, creditedDistributorId = its owner or null,
     // consent.privacyVersion "2026-09-18", parentPhone in E.164, grade "8"
   db.acq_leads.countDocuments({ idempotencyKey: "smoke-2026-09-25-lead-1" })   // 1, despite three POSTs
   db.acq_audit.find({ "subject.recordId": ObjectId("<leadRef>") })
     // one lead.submitted row; its `after` holds status and attribution ids — search it for the
     // phone and the name: nothing
   db.cost_events.countDocuments({ clause: "workshop", startedAt: { $gt: ISODate("<enable time>") } })  // 0
   ```
   The page-submitted lead is found the same way by its own `idempotencyKey` (the page generates
   it; read it from the lead whose `participantFirstName` is `SMOKE-PAGE` and note the `_id`).
6. **Clean up by exact `_id`**, and only these:
   ```
   db.acq_leads.deleteOne({ _id: ObjectId("<lead 1>") })
   db.acq_leads.deleteOne({ _id: ObjectId("<lead 2>") })
   db.acq_visits.deleteOne({ visitorId: "smoke-2026-09-25-ref-Y7K2" })
   db.acq_visits.deleteOne({ visitorId: "<the page's visitor id, from lead 2>" })
   ```
   plus the `smoke-…` visit rows from step 2, each by its exact `visitorId`. **The audit rows
   stay.** `acq_audit` is append-only by policy and by schema; the two `lead.submitted` rows for
   the smoke leads remain, identifiable by `subject.recordId` equal to the deleted lead ids and
   by their timestamps. They record that a test lead was created and then removed, which is
   true.
7. Only now hand leaflets to distributors. Rollback at any point:
   `heroku config:unset ACQUISITION_ENABLED` — the endpoints answer 503 again, the page returns
   to the WhatsApp alternative, stored leads are untouched.

## 5. Reading leads: the owner view

Once the new LIVE version is deployed (step 1 with `810d97d` or later), the leads are read at
**`/engine/acquisition`** on the Heroku origin — the same Basic credential as the Engine Room
(`ENGINE_ROOM_USER` / `ENGINE_ROOM_PASSWORD`), which fails closed with 503 if unset and 401
without it. The list shows 25 leads at a time, newest first, with parent name and phone,
participant, grade, credited batch and distributor, status and a same-phone mark; each lead
opens to its full record with attribution, visit summary and audit trail. Anonymised leads show
dashes.

It is **read-only**. Status changes, payment recording, commissions, distributor dashboards and
demo grants are not built; those are later slices with their own authorization. `mongosh` is
therefore needed only for the smoke-test inspection and cleanup in step 4, not for routine lead
viewing.

## What this release does not include

Distributor login, owner writes (status, payment, commission), demo grants, retention purges,
and any notification when a lead arrives. New leads are seen by opening `/engine/acquisition`
or when the parent writes on WhatsApp.
