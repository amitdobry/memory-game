// ---------------------------------------------------------------------------
// Persistence without a database.
//
//   * each child's current config lives in localStorage on their own machine
//   * a share link carries the whole config inside the URL itself
//
// That is the entire "backend" for ownership. Nothing to host, nothing to
// migrate, nothing to lose on workshop morning.
// ---------------------------------------------------------------------------
import { STARTER_CONFIG, sanitize } from "./schema.js";

const key = (userId) => `workshop:config:${userId}`;
const historyKey = (userId) => `workshop:history:${userId}`;
const MAX_HISTORY = 30;

// localStorage can throw (private windows, blocked site data). It is a
// convenience here, never the thing the app depends on to render.
function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore — the game still runs, it just won't be remembered */
  }
}

export function loadConfig(userId) {
  const raw = safeGet(key(userId));
  if (!raw) return { ...STARTER_CONFIG };
  try {
    return sanitize(JSON.parse(raw)).config;
  } catch {
    return { ...STARTER_CONFIG };
  }
}

export function saveConfig(userId, config) {
  safeSet(key(userId), JSON.stringify(config));
}

/** Undo stack. Push BEFORE applying a change. */
export function pushHistory(userId, config) {
  const stack = loadHistory(userId);
  stack.push(config);
  safeSet(historyKey(userId), JSON.stringify(stack.slice(-MAX_HISTORY)));
}

export function popHistory(userId) {
  const stack = loadHistory(userId);
  const previous = stack.pop();
  safeSet(historyKey(userId), JSON.stringify(stack));
  return previous ?? null;
}

export function loadHistory(userId) {
  try {
    const parsed = JSON.parse(safeGet(historyKey(userId)) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearHistory(userId) {
  safeSet(historyKey(userId), "[]");
}

// --- share links -----------------------------------------------------------
// The config is base64url-encoded into the URL fragment, so playing someone
// else's game needs no server call and no stored record.

export function encodeConfig(config) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeConfig(encoded) {
  try {
    const padded = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return sanitize(JSON.parse(new TextDecoder().decode(bytes))).config;
  } catch {
    return null;
  }
}

export function shareUrl(config, playerName) {
  const url = new URL("play.html", window.location.href);
  if (playerName) url.searchParams.set("by", playerName);
  url.hash = encodeConfig(config);
  return url.toString();
}
