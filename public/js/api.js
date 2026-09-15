// ---------------------------------------------------------------------------
// Talking to the server.
//
// Two things make this work both on a laptop on the LAN and on GitHub Pages:
//
//   API_BASE  — where the AI lives. Empty means "same server as this page"
//               (the workshop laptop). Set it to your own proxy for the
//               hosted, static version.
//   the code  — a workshop ticket, remembered per browser. It is NOT the
//               Anthropic key; see server/auth.js for why that is fine.
// ---------------------------------------------------------------------------

// For GitHub Pages, set this to the proxy you control, e.g.
//   "https://soulcircle.example.com"
export const API_BASE = "";

const CODE_KEY = "workshop:code";

export function getCode() {
  // A link like  ...?t=ABC123  saves the code so a child never types it.
  const fromUrl = new URLSearchParams(location.search).get("t");
  if (fromUrl) {
    setCode(fromUrl);
    return fromUrl.toUpperCase();
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
    /* ignore */
  }
}

async function post(route, payload) {
  const response = await fetch(`${API_BASE}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-workshop-code": getCode(),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error ?? "שגיאה");
    error.status = response.status;
    throw error;
  }
  return data;
}

/** Ask the AI to change the game. */
export const requestChange = (payload) => post("/api/ai", payload);

/** Ask Claude for one line of trash talk. Never let this break a game. */
export async function requestBanter(payload) {
  try {
    const { line } = await post("/api/banter", payload);
    return line;
  } catch {
    return "";
  }
}
