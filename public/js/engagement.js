// ---------------------------------------------------------------------------
// What a visitor did on the landing page, sent to LIVE for the Engine Room's Leads tab.
//
//   POST /api/acquisition/activity  {viewId, visitorId, scrollDepthPct, scrollCount,
//                                    sectionsSeen, clicks, activeMs, visibleMs}   → 202 {ok}
//
// One page load is one *view*, named by `viewId` (minted with the same generator as the visitor
// id and sent on the visit beacon too). This module watches the page and, three times at most,
// sends its whole current state for that view: 15 s after load (insurance against browsers that
// drop the last beacon), when the tab is hidden, and on pagehide. LIVE keeps the largest numbers
// and the longest lists, so the order the sends arrive in does not matter.
//
// The whitelist is the privacy boundary (LIVE AN-20). What is recorded: how far the page was
// scrolled (to 5 %), how many times (at most once per 250 ms), which of ten sections came into
// view, which of thirteen known links and buttons were clicked and when, and how long the tab was
// visible and actively used. What is not: IP, screen size, language, the referrer, anything typed,
// any element text or name outside the list, mouse positions. Nothing is stored in the browser.
//
// Collect, never block: every listener is passive, nothing waits for the network, and the page
// imports this inside try/catch, so a throw here leaves the page exactly as it was.
//
// Pure helpers are exported for `tests/static-site.test.mjs`; `startEngagement` takes the window,
// the document and a clock so it can be tested without a browser.
// ---------------------------------------------------------------------------

/** The page sections, in page order. Mirrors LIVE `ENGAGEMENT_SECTIONS`. */
export const SECTIONS = ["top", "what", "path", "curriculum", "inside", "projects", "details", "fit", "about", "contact"];

/** Recorded click targets → the selector that identifies each. Mirrors LIVE `ENGAGEMENT_CLICK_TARGETS`. */
export const TARGETS = [
  ["game-memory", "#preview-link"],
  ["game-workshop", "#game-workshop"],
  ["game-rhythm", "#game-rhythm"],
  ["cta-hero", "#top .btn-primary"],
  ["cta-nav", ".nav-cta"],
  ["nav-curriculum", '.nav-links a[href="#curriculum"]'],
  ["nav-inside", '.nav-links a[href="#inside"]'],
  ["nav-projects", '.nav-links a[href="#projects"]'],
  ["nav-contact", '.nav-links a[href="#contact"]'],
  ["whatsapp", "#wa-link"],
  ["form-submit", "#submit-btn"],
];
/** Targets reported by the page itself rather than by a click on an element. */
export const SIGNAL_TARGETS = ["form-focus", "claim"];
export const TARGET_NAMES = [...TARGETS.map(([name]) => name), ...SIGNAL_TARGETS];

export const MAX_CLICKS = 50;
export const SCROLL_DEBOUNCE_MS = 250;
export const ACTIVE_WINDOW_MS = 30_000;
export const INSURANCE_SEND_MS = 15_000;
export const MAX_MS = 24 * 60 * 60 * 1000;

/** (scrollY + innerHeight) / scrollHeight as a percentage, rounded to 5, within 0–100. */
export function scrollDepth(scrollY, innerHeight, scrollHeight) {
  if (!(scrollHeight > 0)) return 0;
  const raw = ((scrollY + innerHeight) / scrollHeight) * 100;
  return Math.max(0, Math.min(100, Math.round(raw / 5) * 5));
}

/** The whitelisted name of the element clicked (or one of its ancestors), or null. */
export function targetOf(element) {
  if (!element || typeof element.closest !== "function") return null;
  for (const [name, selector] of TARGETS) if (element.closest(selector)) return name;
  return null;
}

/**
 * The state of one view. `t` is milliseconds since load, from the caller's clock; time is
 * accounted on every event, so an idle tab stops adding active time 30 s after the last input.
 */
export function createTracker({ visible = true } = {}) {
  const s = {
    depth: 0,
    scrollCount: 0,
    lastScrollCounted: -Infinity,
    sections: [],
    clicks: [],
    visible,
    lastInput: -Infinity,
    lastTick: 0,
    activeMs: 0,
    visibleMs: 0,
  };

  const advance = (t) => {
    if (t <= s.lastTick) return;
    if (s.visible) {
      s.visibleMs += t - s.lastTick;
      const activeUntil = Math.min(t, s.lastInput + ACTIVE_WINDOW_MS);
      if (activeUntil > s.lastTick) s.activeMs += activeUntil - s.lastTick;
    }
    s.lastTick = t;
  };

  return {
    input(t) {
      advance(t);
      s.lastInput = t;
    },
    scroll(t, depthPct) {
      this.input(t);
      if (depthPct > s.depth) s.depth = depthPct;
      if (t - s.lastScrollCounted >= SCROLL_DEBOUNCE_MS) {
        s.scrollCount += 1;
        s.lastScrollCounted = t;
      }
    },
    section(id) {
      if (SECTIONS.includes(id) && !s.sections.includes(id)) s.sections.push(id);
    },
    click(t, target) {
      this.input(t);
      if (TARGET_NAMES.includes(target) && s.clicks.length < MAX_CLICKS) s.clicks.push({ target, at: Math.round(t) });
    },
    visibility(t, isVisible) {
      advance(t);
      s.visible = isVisible;
    },
    /** The beacon body for this view, as of `t`. */
    snapshot(t, ids) {
      advance(t);
      const ms = (n) => Math.max(0, Math.min(MAX_MS, Math.round(n)));
      return {
        viewId: ids.viewId,
        visitorId: ids.visitorId,
        scrollDepthPct: s.depth,
        scrollCount: Math.min(10_000, s.scrollCount),
        sectionsSeen: [...s.sections],
        clicks: s.clicks.map((c) => ({ target: c.target, at: Math.min(MAX_MS, c.at) })),
        activeMs: ms(s.activeMs),
        visibleMs: ms(s.visibleMs),
      };
    },
  };
}

/**
 * Send one snapshot. `sendBeacon` with a string posts it as text/plain, which needs no CORS
 * preflight and survives the page closing; `fetch` with keepalive is the fallback. Never throws.
 */
export function sendActivity(url, payload, { navigatorImpl = globalThis.navigator, fetchImpl = globalThis.fetch } = {}) {
  const body = JSON.stringify(payload);
  try {
    if (navigatorImpl && typeof navigatorImpl.sendBeacon === "function" && navigatorImpl.sendBeacon(url, body)) return "beacon";
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetchImpl?.(url, { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8" }, body, keepalive: true }).catch(() => {});
    return "fetch";
  } catch {
    return "none";
  }
}

/**
 * Wire the tracker to the page. Returns `{ signal, flush }`: `signal("form-focus" | "claim")`
 * records a page-level event, `flush()` sends now (tests). Throws only if the page itself is
 * missing basics — the caller wraps it.
 */
export function startEngagement({ win, doc, apiBase, viewId, visitorId, now = () => win.performance.now(), navigatorImpl = win.navigator, fetchImpl = win.fetch?.bind(win) }) {
  const tracker = createTracker({ visible: doc.visibilityState !== "hidden" });
  const url = `${apiBase}/api/acquisition/activity`;
  const ids = { viewId, visitorId };
  const flush = () => sendActivity(url, tracker.snapshot(now(), ids), { navigatorImpl, fetchImpl });
  const passive = { passive: true, capture: true };

  win.addEventListener(
    "scroll",
    () => tracker.scroll(now(), scrollDepth(win.scrollY, win.innerHeight, doc.documentElement.scrollHeight)),
    passive,
  );
  for (const type of ["pointerdown", "keydown", "touchstart", "mousemove"]) win.addEventListener(type, () => tracker.input(now()), passive);
  doc.addEventListener(
    "click",
    (event) => {
      const target = targetOf(event.target);
      if (target !== null) tracker.click(now(), target);
    },
    passive,
  );
  doc.addEventListener("visibilitychange", () => {
    const visible = doc.visibilityState !== "hidden";
    tracker.visibility(now(), visible);
    if (!visible) flush();
  });
  win.addEventListener("pagehide", () => flush());
  // The first focus inside the registration form, once: "reached the form", without reading it.
  doc.getElementById("lead-form")?.addEventListener("focusin", () => tracker.click(now(), "form-focus"), { once: true });

  if (typeof win.IntersectionObserver === "function") {
    const observer = new win.IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) tracker.section(entry.target.id);
      },
      { threshold: 0.2 },
    );
    for (const id of SECTIONS) {
      const element = doc.getElementById(id);
      if (element) observer.observe(element);
    }
  }
  win.setTimeout(flush, INSURANCE_SEND_MS);

  return {
    signal(target) {
      if (SIGNAL_TARGETS.includes(target)) tracker.click(now(), target);
    },
    flush,
  };
}
