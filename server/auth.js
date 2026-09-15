// ---------------------------------------------------------------------------
// Workshop codes + spending limits.
//
// The threat model, stated plainly:
//
//   * The Anthropic key lives ONLY in this process's environment. It is never
//     sent to a browser and never committed. That is the thing being protected.
//   * The workshop code IS visible to anyone who opens the browser devtools.
//     It is not a secret. It is a cheap, expiring, revocable, rate-limited
//     ticket, and it is worth nothing to steal because of the next point.
//   * This endpoint is not a general Claude proxy. It accepts one shape of
//     request ("change this memory game") and returns one shape of answer
//     (a game config). Somebody who copies a code cannot use it to generate
//     arbitrary text — only to recolour a memory game.
//
// So the realistic worst case is a stranger burning a few cents of Haiku quota,
// which the caps below then stop.
// ---------------------------------------------------------------------------

// WORKSHOP_TOKENS="ABC123:דניאל,DEF456:נועה,GHI789:איתי"
// Leave it unset to run wide open — the right setting for a laptop on a LAN.
const REQUIRE_TOKEN = Boolean(process.env.WORKSHOP_TOKENS);

const TOKENS = new Map(
  (process.env.WORKSHOP_TOKENS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [code, name] = entry.split(":");
      return [code.trim().toUpperCase(), (name ?? code).trim()];
    }),
);

// Per code, per hour. A child making real changes uses maybe 30 in a session.
const PER_TOKEN_HOURLY = Number(process.env.WORKSHOP_HOURLY_LIMIT ?? 80);
// Everybody together, per day. The hard ceiling on what a bad day can cost.
const DAILY_TOTAL = Number(process.env.WORKSHOP_DAILY_LIMIT ?? 1500);
// Optional last day the codes work: WORKSHOP_EXPIRES=2026-10-01
const EXPIRES = process.env.WORKSHOP_EXPIRES ? new Date(process.env.WORKSHOP_EXPIRES) : null;

const hits = new Map(); // code -> timestamps within the last hour
let dayStamp = new Date().toDateString();
let dayCount = 0;

function rollDay() {
  const today = new Date().toDateString();
  if (today !== dayStamp) {
    dayStamp = today;
    dayCount = 0;
  }
}

/**
 * @returns {{ok: true, name: string} | {ok: false, status: number, error: string}}
 */
export function checkAccess(req) {
  rollDay();

  if (dayCount >= DAILY_TOTAL) {
    return { ok: false, status: 429, error: "ה-AI סיים את המכסה להיום. צריך לדבר עם המדריך." };
  }

  if (!REQUIRE_TOKEN) {
    dayCount += 1;
    return { ok: true, name: "local" };
  }

  if (EXPIRES && new Date() > EXPIRES) {
    return { ok: false, status: 403, error: "הקוד של הסדנה כבר לא בתוקף." };
  }

  const code = String(
    req.headers["x-workshop-code"] ?? "",
  )
    .trim()
    .toUpperCase();

  if (!code) return { ok: false, status: 401, error: "צריך קוד סדנה כדי להשתמש ב-AI." };
  if (!TOKENS.has(code)) return { ok: false, status: 403, error: "הקוד הזה לא מוכר." };

  const now = Date.now();
  const recent = (hits.get(code) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_TOKEN_HOURLY) {
    hits.set(code, recent);
    return {
      ok: false,
      status: 429,
      error: "השתמשת בהרבה בקשות בשעה האחרונה. חכה/י כמה דקות ותנסה/י שוב.",
    };
  }

  recent.push(now);
  hits.set(code, recent);
  dayCount += 1;
  return { ok: true, name: TOKENS.get(code) };
}

export const authInfo = {
  get requiresCode() {
    return REQUIRE_TOKEN;
  },
  get codes() {
    return TOKENS.size;
  },
  get usedToday() {
    rollDay();
    return dayCount;
  },
  dailyLimit: DAILY_TOTAL,
  hourlyLimit: PER_TOKEN_HOURLY,
};
