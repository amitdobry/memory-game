// ---------------------------------------------------------------------------
// Talking to the AI, which lives somewhere else.
//
// This app holds no credential and never will. Every AI request goes to LIVE's
// /api/workshop/* endpoints, which hold the Anthropic key server-side. That is why
// this site can be a public repo on a static host and still not leak anything.
//
// Two things travel with each request:
//
//   the grant    — proof that someone opened a door: the owner's password, an
//                  eight-digit code, or the owner approving by email. It lives in
//                  this browser and is visible to whoever holds the phone, which is
//                  fine — it expires, it is rate-limited, and the endpoint behind it
//                  only ever returns a game config and one short sentence. The full
//                  argument is in LIVE's src/workshop/access.ts.
//   the contract — a stamp of the field list this app was built against, so the
//                  server can say when one of the two is stale instead of quietly
//                  setting a field the game no longer has.
// ---------------------------------------------------------------------------
import { CONTRACT_VERSION } from "./contract.js";

/** LIVE on Heroku — the only place the Anthropic key exists. */
const PRODUCTION_API = "https://live-intelligence-f6ec7b9df867.herokuapp.com";

export const API_BASE = resolveBase();

function resolveBase() {
  const host = location.hostname;

  // Local development: the static site on :3000, LIVE on :4300.
  if (host === "localhost" || host === "127.0.0.1") {
    return location.port === "4300" ? "" : "http://localhost:4300";
  }

  // Workshop day on a laptop: the room connects over the LAN by IP and LIVE is on
  // the same machine. Same host, the other port.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return `http://${host}:4300`;

  // Anywhere else — GitHub Pages — LIVE is the deployed app. Its origin must also
  // appear in LIVE_ALLOWED_ORIGINS, or the browser blocks the call before it is
  // ever sent and the failure looks like a bug in this file.
  return PRODUCTION_API;
}

const GRANT_KEY = "workshop:grant";

/** The grant this browser is holding, or null when there is none worth sending. */
export function getGrant() {
  try {
    const raw = localStorage.getItem(GRANT_KEY);
    if (!raw) return null;
    const grant = JSON.parse(raw);
    // An expired grant is worse than none: it produces a confusing 403 instead of
    // simply asking the child for the password again.
    if (!grant?.token || (grant.expiresAt && grant.expiresAt < Date.now())) {
      localStorage.removeItem(GRANT_KEY);
      return null;
    }
    return grant;
  } catch {
    return null;
  }
}

export function setGrant(grant) {
  try {
    localStorage.setItem(GRANT_KEY, JSON.stringify(grant));
  } catch {
    /* a browser with storage blocked just asks for the password again */
  }
}

export function clearGrant() {
  try {
    localStorage.removeItem(GRANT_KEY);
  } catch {
    /* ignore */
  }
}

async function post(route, payload) {
  /*
    A network failure throws a TypeError whose message is the browser's own
    "Failed to fetch" — in English, to a ten-year-old, in the Firekeeper's voice.
    Every throw out of this function carries Hebrew a child can act on.
  */
  let response;
  try {
    response = await fetch(`${API_BASE}/api/workshop/${route}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-workshop-access": getGrant()?.token ?? "",
      },
      body: JSON.stringify({ ...payload, contract: CONTRACT_VERSION }),
    });
  } catch {
    const offline = new Error("אין לי חיבור לאינטרנט כרגע. תבדקו את החיבור ותנסו שוב.");
    offline.status = 0;
    throw offline;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error ?? "משהו השתבש. תנסו שוב.");
    error.status = response.status;
    throw error;
  }
  if (data.contractWarning) {
    console.warn("[workshop] contract mismatch —", data.contractWarning);
  }
  return data;
}

/**
 * Try a password. Accepts either the owner's permanent one or a minted eight-digit
 * code — the server knows the difference, and a child does not need to.
 */
export async function unlock(password) {
  const data = await post("unlock", { password });
  setGrant({ token: data.token, expiresAt: data.expiresAt, owner: Boolean(data.owner) });
  return data;
}

/** Ask the AI to change the game. */
export const requestChange = (payload) => post("edit", payload);

/**
 * One line of trash talk plus the face to say it with.
 *
 * Never allowed to break a game: a failure here returns an empty line and the
 * caller keeps whatever canned line it already showed.
 */
export async function requestBanter(payload) {
  try {
    const { line, face } = await post("banter", payload);
    return { line, face };
  } catch {
    return { line: "", face: null };
  }
}

/** Is the workshop switched on at all? Used to fail early and in Hebrew. */
export async function health() {
  try {
    const response = await fetch(`${API_BASE}/api/workshop/health`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
