// ---------------------------------------------------------------------------
// Talking to LIVE's acquisition intake: the visit beacon and the registration form.
//
// Two endpoints, both POST, both JSON, both answered with a small status object:
//
//   /api/acquisition/visit   {visitorId, ref?|b?}          → 202 {ok, recognised}
//   /api/acquisition/lead    {contact fields, consent,      → 201 {ok, leadRef, replay:false}
//                             idempotencyKey, visitorId?,     200 {ok, leadRef, replay:true}
//                             ref?|b?}                        400 {error:'invalid_request', fields}
//                                                             409 {error:'idempotency_conflict'}
//                                                             429 {error:'rate_limited'}
//                                                             503 {error:'acquisition_unavailable'}
//
// What this file never does: store a name, phone, email or note anywhere in the browser (only
// the random visitor id and the leaflet attribution are remembered), put contact details in a
// URL, or claim success without a confirmed acknowledgement from the server.
//
// Pure helpers are exported for `tests/static-site.test.mjs`; the network calls take `fetch`
// as a parameter so they can be tested without one.
// ---------------------------------------------------------------------------

export const VISITOR_KEY = "acq_visitor";
export const VISITOR_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const REQUEST_TIMEOUT_MS = 10_000;
export const BEACON_TIMEOUT_MS = 4_000;

/** The grade values the server accepts, with the labels the form shows. Only the workshop's own. */
export const GRADES = [
  { value: "7", label: "ז׳" },
  { value: "8", label: "ח׳" },
  { value: "9", label: "ט׳" },
];

// --- the idempotency key ------------------------------------------------------

/**
 * One key per *submission*, where a submission is the contact fields as the parent typed them.
 *
 *   - Retrying after a timeout or an error with the fields unchanged reuses the key, so the
 *     server can answer "already have it" instead of registering twice.
 *   - Editing any contact field after that is a new submission and gets a new key. When the
 *     previous attempt's outcome was uncertain (a timeout), that is a fact worth telling the
 *     parent: the old attempt may have registered too. `rotatedAfterUncertain` says so.
 *   - `reset` forgets everything: the "register another participant" path.
 */
export function createKeyState(random) {
  return { key: null, fingerprint: null, uncertain: false, random };
}

export function keyForSubmission(state, values) {
  const fp = fingerprint(values);
  if (state.key !== null && state.fingerprint === fp) {
    return { key: state.key, fresh: false, rotatedAfterUncertain: false };
  }
  const rotatedAfterUncertain = state.key !== null && state.uncertain;
  state.key = newVisitorId(state.random);
  state.fingerprint = fp;
  state.uncertain = false;
  return { key: state.key, fresh: true, rotatedAfterUncertain };
}

/** The last attempt ended without a confirmed answer (timeout): remember that for the next key decision. */
export function markUncertain(state) {
  state.uncertain = true;
}

export function resetKeyState(state) {
  state.key = null;
  state.fingerprint = null;
  state.uncertain = false;
}

/** Hebrew labels for server-reported field names, for the validation message. */
export const FIELD_LABELS = {
  parentName: "שם ההורה",
  parentPhone: "טלפון",
  parentEmail: "אימייל",
  participantFirstName: "שם המשתתף",
  grade: "כיתה",
  note: "ההערה",
  consent: "אישור יצירת הקשר",
};

// --- the visitor id ---------------------------------------------------------

export function newVisitorId(random = globalThis.crypto) {
  if (random && typeof random.randomUUID === "function") return random.randomUUID();
  // No crypto.randomUUID (very old browser): still random enough for a per-browser label.
  return Array.from({ length: 32 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
}

/**
 * The browser's visitor id: remembered in storage when storage works, otherwise a temporary one
 * for this page load. A broken storage never breaks the page.
 */
export function getVisitorId(storage, random) {
  try {
    const existing = storage?.getItem(VISITOR_KEY);
    if (existing && VISITOR_ID.test(existing)) return existing;
  } catch {
    /* fall through to a fresh id */
  }
  const fresh = newVisitorId(random);
  try {
    storage?.setItem(VISITOR_KEY, fresh);
  } catch {
    /* in-memory only, then */
  }
  return fresh;
}

// --- referral fields --------------------------------------------------------

/** The `ref` or `b` the server wants, from attribution.js's shape. Empty object when direct. */
export function referralFields(attribution) {
  if (!attribution) return {};
  if (attribution.kind === "ref") return { ref: attribution.code };
  if (attribution.kind === "batch") return { b: attribution.number };
  return {};
}

// --- the submission ----------------------------------------------------------

/** The contact fields, trimmed. Empty optionals are dropped so the server sees no `""`. */
export function normalizeForm(values) {
  const trim = (v) => (typeof v === "string" ? v.trim() : "");
  const out = {
    parentName: trim(values.parentName),
    parentPhone: trim(values.parentPhone),
    participantFirstName: trim(values.participantFirstName),
    grade: trim(values.grade),
  };
  const email = trim(values.parentEmail);
  const note = trim(values.note);
  if (email) out.parentEmail = email;
  if (note) out.note = note;
  return out;
}

/**
 * What "the same submission" means on this side: the normalised contact fields. When this
 * changes, the form is a new submission and gets a new idempotency key; while it stays the
 * same, retries reuse the key so the server can answer a replay instead of creating twice.
 */
export function fingerprint(values) {
  const n = normalizeForm(values);
  return JSON.stringify([n.parentName, n.parentPhone.replace(/\D/g, ""), (n.parentEmail ?? "").toLowerCase(), n.participantFirstName, n.grade, n.note ?? ""]);
}

/** Which fields the form itself can see are missing. Server validation is the real check. */
export function missingFields(values) {
  const n = normalizeForm(values);
  const missing = [];
  if (!n.parentName) missing.push("parentName");
  if (!n.parentPhone || n.parentPhone.replace(/\D/g, "").length < 9) missing.push("parentPhone");
  if (!n.participantFirstName) missing.push("participantFirstName");
  if (!GRADES.some((g) => g.value === n.grade)) missing.push("grade");
  if (values.consent !== true) missing.push("consent");
  return missing;
}

export function buildLeadPayload(values, { idempotencyKey, visitorId, attribution }) {
  return {
    ...normalizeForm(values),
    consent: true,
    idempotencyKey,
    ...(visitorId ? { visitorId } : {}),
    ...referralFields(attribution),
  };
}

// --- outcomes -----------------------------------------------------------------

/**
 * One word for what happened, from the HTTP status and body. `network` and `timeout` come from
 * `postJson`; everything else from the server's contract above.
 */
export function classifyOutcome(status, body) {
  if (status === 201 && body?.ok) return "created";
  if (status === 200 && body?.ok) return "replay";
  if (status === 400) return "invalid";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  if (status === 404 || status === 405) return "unavailable";
  return "error";
}

/** Labels for the server's field names, joined for a sentence. */
export function describeFields(fields) {
  const names = (fields ?? []).map((f) => FIELD_LABELS[f]).filter(Boolean);
  return names.length ? names.join(", ") : "הפרטים שמילאתם";
}

// --- network ------------------------------------------------------------------

/**
 * POST JSON with a timeout. Resolves `{status, body}`; rejects with `{kind: 'timeout'|'network'}`.
 * A timeout is *not* a failure: the server may have saved the lead. Callers say so.
 */
export async function postJson(url, payload, { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    throw { kind: error?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** The visit beacon. Fire and forget: no outcome, no error, no effect on the page. */
export async function sendVisit(apiBase, visitorId, attribution, options = {}) {
  try {
    await postJson(`${apiBase}/api/acquisition/visit`, { visitorId, ...referralFields(attribution) }, { ...options, timeoutMs: options.timeoutMs ?? BEACON_TIMEOUT_MS });
  } catch {
    /* tracking must never break the page */
  }
}
