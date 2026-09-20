// ---------------------------------------------------------------------------
// The workshop's groups and their meetings, as the landing page shows them.
//
// LIVE owns the schedule; this file owns none of it. Nothing here contains a date, an hour or a
// group name: it fetches them from
//
//   GET {API_BASE}/api/acquisition/groups
//     → { groups: [ { id, label, capacity, available, full, locationLabel,
//                     sessions: [ { n, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM', note } ] } ] }
//
// and turns them into the shapes the page draws: a month grid with the meeting days marked by
// Amit's own numbers, and one readable line per meeting. When the call fails or no group is open
// the page hides the picker and the form behaves exactly as it did before groups existed — a
// family then agrees a date with Amit by phone, as they always have.
//
// Every function here is pure except `fetchGroups`, which takes its `fetch` as a parameter, so
// `tests/static-site.test.mjs` can exercise all of it with no network and no browser.
// ---------------------------------------------------------------------------

/** Sunday first, the way an Israeli calendar is read. The page's `dir="rtl"` puts א on the right. */
export const WEEKDAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
export const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * A calendar day, read at noon UTC.
 *
 * Noon, and not midnight, because the browser is the one machine here whose timezone is unknown:
 * at midnight a negative offset moves the day backwards and the calendar silently draws the
 * meeting on the wrong square. The wall-clock date from the server is the truth; this only asks
 * which weekday it falls on.
 */
export function parseDate(iso) {
  const m = ISO_DATE.exec(String(iso ?? ""));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const at = new Date(Date.UTC(year, month - 1, day, 12));
  if (Number.isNaN(at.getTime()) || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return null;
  return { year, month, day, weekday: at.getUTCDay() };
}

/** Morning before 12:00, afternoon until 17:00, evening after. Derived from the hour, never stored. */
export function timeOfDay(start) {
  const m = HH_MM.exec(String(start ?? ""));
  if (!m) return "morning";
  const hour = Number(m[1]);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** The little mark in the fact-card icon box: a sun for daylight hours, a moon for the evening. */
export function glyphFor(start) {
  return timeOfDay(start) === "evening" ? "☾" : "☀";
}

/** "שישי", "23.10", "10:00–12:00" — the three pieces the numbered list and the cards print. */
export function formatSession(session) {
  const date = parseDate(session?.date);
  const start = HH_MM.test(String(session?.start ?? "")) ? session.start : "";
  const end = HH_MM.test(String(session?.end ?? "")) ? session.end : "";
  return {
    n: Number(session?.n) || 0,
    weekday: date ? WEEKDAY_NAMES[date.weekday] : "",
    dayMonth: date ? `${date.day}.${String(date.month).padStart(2, "0")}` : "",
    time: start && end ? `${start}–${end}` : "",
    note: typeof session?.note === "string" && session.note.trim() !== "" ? session.note.trim() : null,
  };
}

/** The group's hours, when every meeting keeps the same ones; otherwise null, and the list says it. */
export function commonHours(sessions) {
  const times = [...new Set((sessions ?? []).map((s) => `${s.start}–${s.end}`))];
  return times.length === 1 && HH_MM.test(String(sessions[0]?.start ?? "")) ? times[0] : null;
}

/**
 * One grid per month that has a meeting in it, in order.
 *
 * `cells` is a flat list of weeks-worth of squares: `null` for a day outside the month, otherwise
 * `{day, date, n}` where `n` is Amit's meeting number when that day is a meeting and null
 * otherwise. The grid is seven wide and always starts on a Sunday, so the page can draw it with
 * one CSS grid and no arithmetic of its own.
 */
export function layoutMonths(sessions) {
  const dated = (sessions ?? []).map((s) => ({ session: s, date: parseDate(s?.date) })).filter((x) => x.date !== null);
  const months = [];
  for (const { session, date } of dated) {
    const key = `${date.year}-${date.month}`;
    let month = months.find((m) => m.key === key);
    if (!month) {
      month = { key, year: date.year, month: date.month, label: `${MONTH_NAMES[date.month - 1]} ${date.year}`, meetings: new Map() };
      months.push(month);
    }
    month.meetings.set(date.day, Number(session.n) || null);
  }
  months.sort((a, b) => a.year - b.year || a.month - b.month);

  return months.map((month) => {
    const first = new Date(Date.UTC(month.year, month.month - 1, 1, 12));
    const daysInMonth = new Date(Date.UTC(month.year, month.month, 0, 12)).getUTCDate();
    const cells = Array.from({ length: first.getUTCDay() }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const n = month.meetings.has(day) ? month.meetings.get(day) : null;
      cells.push({ day, date: `${month.year}-${String(month.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, n });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return { year: month.year, month: month.month, label: month.label, cells };
  });
}

/** "2 מתוך 3 מקומות פנויים" · "מקום אחד אחרון" · "הקבוצה מלאה". */
export function describeAvailability(capacity, available) {
  const total = Number(capacity) || 0;
  const left = Math.max(0, Math.min(total, Number(available) || 0));
  if (left === 0) return "הקבוצה מלאה";
  if (left === 1) return "נותר מקום אחד";
  return `${left} מתוך ${total} מקומות פנויים`;
}

/**
 * The open groups, or an empty list.
 *
 * Never throws and never blocks the page: registration worked before this endpoint existed and
 * must keep working when it is unreachable. A malformed group (no meetings, no label) is dropped
 * rather than half-drawn.
 */
export async function fetchGroups(apiBase, { fetchImpl = globalThis.fetch, timeoutMs = 6000, cache } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // The answer may be cached for a minute, which is right on load and wrong when the page is
    // asking again *because* it has just been told the group filled.
    const response = await fetchImpl(`${apiBase}/api/acquisition/groups`, { signal: controller.signal, ...(cache ? { cache } : {}) });
    if (!response.ok) return [];
    const body = await response.json();
    const groups = Array.isArray(body?.groups) ? body.groups : [];
    return groups.filter(isUsable).map(normalizeGroup);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function isUsable(group) {
  return (
    group !== null &&
    typeof group === "object" &&
    typeof group.id === "string" &&
    typeof group.label === "string" &&
    group.label.trim() !== "" &&
    Array.isArray(group.sessions) &&
    group.sessions.some((s) => parseDate(s?.date) !== null)
  );
}

function normalizeGroup(group) {
  const sessions = group.sessions
    .filter((s) => parseDate(s?.date) !== null && HH_MM.test(String(s?.start ?? "")) && HH_MM.test(String(s?.end ?? "")))
    .map((s) => ({ n: Number(s.n) || 0, date: s.date, start: s.start, end: s.end, note: typeof s.note === "string" ? s.note : null }))
    .sort((a, b) => a.n - b.n);
  const capacity = Number(group.capacity) || 0;
  const available = Math.max(0, Math.min(capacity, Number(group.available) || 0));
  return {
    id: group.id,
    label: group.label.trim(),
    capacity,
    available,
    full: group.full === true || available === 0,
    locationLabel: typeof group.locationLabel === "string" && group.locationLabel.trim() !== "" ? group.locationLabel.trim() : null,
    sessions,
  };
}
