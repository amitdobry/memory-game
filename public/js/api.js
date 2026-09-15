// ---------------------------------------------------------------------------
// Talking to the AI, which lives somewhere else.
//
// This app holds no credential and never will. Every AI request goes to LIVE's
// /api/workshop/* endpoints, which hold the Anthropic key server-side. That is why
// this site can be a public repo on a static host and still not leak anything.
//
// Two things travel with each request:
//
//   the code     — a workshop ticket, remembered per browser. It is visible in
//                  devtools and is NOT a secret; what makes that safe is that the
//                  endpoint only ever returns a game config and one short sentence.
//                  See src/web/workshopRoutes.ts in LIVE for the full argument.
//   the contract — a stamp of the field list this app was built against, so the
//                  server can say when one of the two is stale instead of quietly
//                  setting a field the game no longer has.
// ---------------------------------------------------------------------------
import { CONTRACT_VERSION } from "./contract.js";

/**
 * Where the AI lives.
 *
 * Empty means "the same origin as this page", which is what you want when the
 * workshop site is served by LIVE itself. Point it at LIVE's origin when the site
 * is hosted separately (GitHub Pages), and add that Pages origin to LIVE's
 * LIVE_ALLOWED_ORIGINS or the browser will block the call.
 */
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

const CODE_KEY = "workshop:code";

export function getCode() {
  // A link like  ...?t=ABC123  saves the code, so a child never types it.
  const fromUrl = new URLSearchParams(location.search).get("t");
  if (fromUrl) {
    setCode(fromUrl);
    return fromUrl.trim().toUpperCase();
  }
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setCode(code) {
  try {
    localStorage.setItem(CODE_KEY, String(code).trim().toUpperCase());
  } catch {
    /* a browser with storage blocked still plays; it just re-asks for the code */
  }
}

async function post(route, payload) {
  const response = await fetch(`${API_BASE}/api/workshop/${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-workshop-code": getCode(),
    },
    body: JSON.stringify({ ...payload, contract: CONTRACT_VERSION }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error ?? "שגיאה");
    error.status = response.status;
    throw error;
  }
  if (data.contractWarning) {
    console.warn("[workshop] contract mismatch —", data.contractWarning);
  }
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
