# Release checklist — visitor and lead intake (slices 2–3)

Prepared 18 September 2026. **Nothing here has been executed.** Every step is a manual action
by Amit, in this order, and each has a check that must pass before the next.

State at preparation: LIVE `origin/product/web-v0` at `dbaf3af` (CI #165 green, including the
Mongo-backed acquisition tests); Heroku at `6143d27`; memory-game `main` six commits ahead of
GitHub and not published; no batch records exist anywhere; `ACQUISITION_ENABLED` is unset.

---

## 0. Before anything: does production MongoDB support the transaction?

Lead intake writes the lead, the visit link and the audit row in one multi-document
transaction. That needs a replica set (Atlas always is one) and MongoDB ≥ 4.2. CI proved it
against `mongo:8`; production has not been checked from a developer machine.

1. Get the production URI from the Heroku config without printing the secret into a log:
   `heroku config:get MONGODB_URI --app live-intelligence` (copy it into the shell, do not
   paste it anywhere else).
2. Connect with `mongosh "<uri>"` and run:
   ```
   db.version()                    // expect 6.x, 7.x or 8.x
   db.hello().setName              // expect a replica-set name, e.g. "atlas-xxxx-shard-0"
   db.hello().isWritablePrimary    // expect true
   ```
3. Run the acquisition migrations' *idempotency*, not their content: `migrate-mongo status`
   from a machine with the URI shows the two new files as `PENDING`. Nothing else.

**Stop if** `setName` is missing (standalone) or the version is below 4.2. The release phase
would still succeed and the intake would fail on the first lead with a transaction error.

## 1. Deploy LIVE with acquisition disabled

1. Local gate with a Mongo available: `docker compose up -d` then
   `ANTHROPIC_API_KEY= npm run predeploy` in `Live/`. CI #165 already ran the equivalent; this
   is the belt to its braces.
2. Confirm the switch is absent: `heroku config:get ACQUISITION_ENABLED --app live-intelligence`
   prints nothing.
3. Deploy: `git push heroku product/web-v0:main`. The release phase runs
   `20260918210000-acquisition-data-layer` and `20260918230000-acquisition-lead-visitor-index`.
4. Check:
   - `heroku releases --app live-intelligence` shows the new release; `heroku logs --tail`
     shows the two migrations applied and the web dyno listening.
   - `curl -s https://live-intelligence-f6ec7b9df867.herokuapp.com/health` → `{"status":"ok"}`.
   - `curl -s -X POST …/api/acquisition/visit -H 'content-type: application/json' -d '{"visitorId":"release-check-0001"}'`
     → **503** `{"error":"acquisition_unavailable"}`. Nothing is written while disabled.
   - `curl -s …/api/workshop/health` still answers as before (the classroom is untouched).
   - Rollback if anything else: `heroku releases:rollback`. The migrations are additive and
     harmless to leave in place.

## 2. Create and verify the batch records

There is no owner dashboard yet, and the endpoints never create batches. Proposed method: a
small one-off script in LIVE, reviewed and run once.

1. Decide the batches on paper first: for each leaflet stack, a code (3–12 upper-case
   alphanumerics, e.g. `Y7K2`), a label, which printed design it is (`legacyNumber` 1–6, or
   none), and whose it is (a distributor, or Amit's own). Distributor records need only an
   email and a display name at this stage; they cannot sign in until a later slice.
2. Add `scripts/acq-batches.ts` (not yet written): reads a checked-in JSON list, upserts
   `acq_distributors` by email and `acq_batches` by code (never overwriting an existing
   `legacyNumber`), and prints one line per batch: code, legacy alias, distributor, created or
   already present. Idempotent, so it can be re-run. It uses the models, so `strict: 'throw'`
   catches a typo'd field.
3. Run it against production once: `heroku run node scripts/acq-batches.ts --app live-intelligence`.
4. Verify with `mongosh` (read-only):
   ```
   db.acq_batches.find({}, {code:1, legacyNumber:1, distributorId:1, status:1})
   db.acq_batches.countDocuments({ legacyNumber: { $type: 'number' } })   // = number of printed designs in use
   ```
   The unique indexes will have refused any duplicate code or alias; a refusal is a data
   mistake to fix in the JSON, not an index to drop.
5. Do **not** print, hand out or scan anything yet.

## 3. Publish memory-game

1. In `AI workshop 10-13`: `npm test` (43 static checks) once more.
2. `git push origin main`. The Pages workflow publishes `public/` within about a minute.
3. Check `https://amitdobry.github.io/memory-game/?b=3`:
   - the landing page loads; the WhatsApp card's message ends with `(מעלון 3)`;
   - the registration form submits and shows **"ההרשמה באתר עדיין לא פתוחה"** with the
     WhatsApp alternative — the expected answer while the switch is off;
   - `/memory-game/workshop.html` is the picker, `/memory-game/build.html?u=kid1` works,
     the example game opens from the card.
4. Rollback is `git revert` and push; Pages republishes.

## 4. Enable registration

1. `heroku config:set ACQUISITION_ENABLED=1 --app live-intelligence` (the dyno restarts).
2. Referral check, one request per batch, from a terminal:
   ```
   curl -s -X POST …/api/acquisition/visit -H 'content-type: application/json' -H 'origin: https://amitdobry.github.io' \
     -d '{"visitorId":"release-check-Y7K2","ref":"Y7K2"}'        → {"ok":true,"recognised":true}
   … -d '{"visitorId":"release-check-b3","b":"3"}'                 → {"ok":true,"recognised":true}
   … -d '{"visitorId":"release-check-none","ref":"NOSUCH"}'        → {"ok":true,"recognised":false}
   ```
   Every real code and alias must say `recognised: true`. Then delete the check rows:
   `db.acq_visits.deleteMany({ visitorId: /^release-check-/ })`.
3. The complete flow, on a real phone, with a **test family** (Amit's own details, a clearly
   fake participant name):
   - open `https://amitdobry.github.io/memory-game/?b=3` → in `mongosh`,
     `db.acq_visits.findOne({}, {sort:{createdAt:-1}})` shows a fresh row with
     `firstBatchId` = leaflet 3's batch and `hits: 1`;
   - reload once → `hits: 2`, `firstBatchId` unchanged;
   - submit the form → the page shows **"ההרשמה נקלטה"**; `db.acq_leads.findOne(…)` shows
     `status: "submitted"`, `attribution.creditedBatchId` = leaflet 3, `creditedDistributorId`
     = its distributor (or null for Amit's own), `consent.privacyVersion: "2026-09-18"`,
     `parentPhone` in E.164; the visit row now has `leadId` set, `leadCount: 1`,
     `expiresAt: null`;
   - press the button again with nothing changed → the page still says registered and
     `db.acq_leads.countDocuments()` did not grow (replay);
   - `db.acq_audit.find()` shows one `lead.submitted` row whose `after` holds status and
     attribution ids only — search it for the phone number and the name: nothing;
   - `db.cost_events.countDocuments({ clause: 'workshop', startedAt: { $gt: <deploy time> } })`
     is unchanged — no model call was made;
   - delete the test lead, its audit row and its visit by `_id` afterwards.
4. Only now hand leaflets to distributors. Rollback at any point is
   `heroku config:unset ACQUISITION_ENABLED`: the endpoints answer 503 again and the page
   returns to the WhatsApp alternative; stored leads are untouched.

## What this release does not include

Distributor login, the owner view of leads, demo grants, retention purges, and any
notification when a lead arrives. Until the owner view exists, new leads are read with
`mongosh` on `acq_leads`, newest first, or Amit is told by the parent over WhatsApp.
