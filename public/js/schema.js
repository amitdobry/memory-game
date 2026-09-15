// ---------------------------------------------------------------------------
// THE SINGLE SOURCE OF TRUTH
//
// Every knob a child can turn lives here, exactly once. This one file feeds:
//   * the game engine          (reads the values)
//   * the admin panel          (renders one control per field)
//   * the AI tool definition   (server/ai.js turns FIELDS into a JSON schema)
//   * the server-side guard    (sanitize() clamps whatever the AI proposes)
//
// That is the safety rail: the AI can only ever move these knobs, within these
// limits. A bad prompt can produce an ugly game. It cannot break the app.
// ---------------------------------------------------------------------------

export const THEMES = [
  { value: "plain", label: "רגיל (אפור ומשעמם)" },
  { value: "space", label: "חלל" },
  { value: "candy", label: "ממתקים" },
  { value: "jungle", label: "ג׳ונגל" },
  { value: "ocean", label: "ים" },
  { value: "neon", label: "ניאון" },
  { value: "sunset", label: "שקיעה" },
];

// Every emoji set carries at least 32 symbols so that a full 8x8 board
// (32 pairs) is possible. The avatar set has 31 pictures — that ceiling is
// enforced in sanitize(), and the AI explains it to the child in Hebrew
// instead of the board silently failing.
export const CARD_SETS = {
  avatars: { label: "דמויות (ציורים)", kind: "image" },
  fruit: {
    label: "פירות",
    kind: "emoji",
    symbols: [..."🍎🍌🍇🍓🍉🍊🍋🍒🥝🍍🥥🥭🍑🍐🍈🥑🍅🥕🌽🥦🥬🥒🧄🧅🥔🍠🥜🌰🍄🫒🌶🫐"],
  },
  animals: {
    label: "חיות",
    kind: "emoji",
    symbols: [..."🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🦉🦄🐴🐝🦋🐢🐬🐳🦈🐙🦀🦩🦜🐧🦖🦕🐞"],
  },
  space: {
    label: "חלל",
    kind: "emoji",
    symbols: [..."🚀🛸👽🌍🌙⭐🪐🔭🌌🌠🛰🌞🌛💫🌟🌑🌓🌕🌗🌚🌝🌤⚡🔥❄🌈🪨🤖👾🧊🌋🗿"],
  },
  sport: {
    label: "ספורט",
    kind: "emoji",
    symbols: [..."⚽🏀🏈⚾🎾🏐🏉🥏🎱🏓🏸🥊🥋⛳🏹🛹🛼🎿🏂🏆🥇🥈🥉🎯🎳🪀🎣🤿🚲🛷🏅🎽"],
  },
  food: {
    label: "אוכל",
    kind: "emoji",
    symbols: [..."🍕🍔🍟🌭🥪🌮🌯🥙🧆🥗🍝🍜🍲🍛🍣🍱🥟🍤🍙🍚🍘🥠🍢🍡🍧🍨🍦🥧🧁🍰🎂🍩"],
  },
  sweets: {
    label: "ממתקים",
    kind: "emoji",
    symbols: ["🍬","🍭","🍫","🍩","🧁","🍰","🎂","🍦","🍨","🍧","🥧","🍪","🍮","🍯","🥞","🧇","🍓","🍒","🥐","🥨","🍡","🍢","🍿","🥤","🧃","🍹","🍎","🍇","🍑","🍉","🥜","🌰"],
  },
  ocean: {
    label: "ים",
    kind: "emoji",
    symbols: ["🐠","🐟","🐡","🦈","🐬","🐳","🐙","🦑","🦐","🦀","🐚","🌊","⛵","🚤","🏄","🐢","🦭","🐋","🦞","🐊","⚓","🦩","🐧","🍤","🥥","🩴","🤿","🚢","🌴","🪸","🪼","🧊"],
  },
  custom: { label: "משלי (אני בוחר/ת)", kind: "emoji" },
};

// ---------------------------------------------------------------------------
// FIELDS — the order here is the order shown in the admin panel.
// Set `ai: false` on a field to hide it from the AI (nothing is hidden today,
// but the hook is there so you can lock a knob down mid-workshop).
// ---------------------------------------------------------------------------
export const FIELDS = [
  {
    key: "mode",
    type: "enum",
    group: "mode",
    options: [
      { value: "solo", label: "לבד — נגד השעון" },
      { value: "claude", label: "נגד קלוד (ה-AI)" },
      { value: "friend", label: "נגד חבר/ה על אותו מסך" },
    ],
    label: "איך משחקים",
    help: "לבד עם טיימר, נגד קלוד, או שני שחקנים בתורות על אותו מסך.",
  },
  {
    key: "claudeSkill",
    type: "enum",
    group: "mode",
    options: [
      { value: "easy", label: "קל — לקלוד יש זיכרון גרוע" },
      { value: "normal", label: "רגיל — קלוד זוכר לא רע" },
      { value: "hard", label: "קשה — קלוד זוכר הכל" },
    ],
    label: "כמה קלוד טוב",
    help: "כמה מהקלפים שקלוד ראה הוא באמת זוכר. פועל רק במשחק נגד קלוד.",
  },
  {
    key: "claudeTalks",
    type: "bool",
    group: "mode",
    label: "קלוד מדבר תוך כדי משחק",
    help: "קלוד מגיב בעברית לתורות שלו ושלך. פועל רק במשחק נגד קלוד.",
  },
  {
    key: "title",
    type: "string",
    group: "text",
    maxLength: 40,
    label: "שם המשחק",
    help: "הכותרת שמופיעה למעלה.",
  },
  {
    key: "cols",
    type: "int",
    group: "board",
    min: 2,
    max: 8,
    label: "עמודות בלוח",
    help: "כמה קלפים יש בכל שורה.",
  },
  {
    key: "rows",
    type: "int",
    group: "board",
    min: 2,
    max: 8,
    label: "שורות בלוח",
    help: "כמה שורות של קלפים יש.",
  },
  {
    key: "cardSet",
    type: "enum",
    group: "board",
    options: Object.entries(CARD_SETS).map(([value, v]) => ({ value, label: v.label })),
    label: "ערכת קלפים",
    help: "אילו תמונות מופיעות על הקלפים.",
  },
  {
    key: "customSymbols",
    type: "list",
    group: "board",
    maxItems: 32,
    maxLength: 4,
    label: "סמלים משלי",
    help: "רשימת אמוג׳ים משלך. פועל רק כשערכת הקלפים היא ״משלי״.",
  },
  {
    key: "timerSeconds",
    type: "int",
    group: "time",
    min: 10,
    max: 600,
    label: "זמן למשחק (שניות)",
    help: "כמה זמן יש לשחקן למצוא את כל הזוגות.",
  },
  {
    key: "peekSeconds",
    type: "int",
    group: "time",
    min: 0,
    max: 10,
    label: "הצצה בהתחלה (שניות)",
    help: "כמה שניות כל הקלפים גלויים לפני שהמשחק מתחיל. 0 = בלי הצצה.",
  },
  {
    key: "flipBackMs",
    type: "int",
    group: "time",
    min: 200,
    max: 3000,
    label: "כמה זמן קלפים לא-תואמים נשארים פתוחים (מילישניות)",
    help: "1000 = שנייה אחת. מספר קטן יותר = קשה יותר.",
  },
  {
    key: "difficultyRamp",
    type: "enum",
    group: "time",
    options: [
      { value: "none", label: "בלי — נשאר אותו דבר" },
      { value: "fasterFlip", label: "הקלפים נסגרים מהר יותר ככל שמתקדמים" },
      { value: "drainTimer", label: "הזמן רץ מהר יותר ככל שמתקדמים" },
    ],
    label: "נעשה קשה יותר תוך כדי משחק?",
    help: "איך המשחק מקשה על השחקן ככל שהוא מוצא יותר זוגות.",
  },
  {
    key: "pointsPerMatch",
    type: "int",
    group: "score",
    min: 0,
    max: 100,
    label: "נקודות על זוג",
    help: "כמה נקודות מקבלים על כל זוג שנמצא.",
  },
  {
    key: "penaltyPerMiss",
    type: "int",
    group: "score",
    min: 0,
    max: 50,
    label: "קנס על טעות",
    help: "כמה נקודות יורדות כשהקלפים לא מתאימים.",
  },
  {
    key: "speedBonus",
    type: "bool",
    group: "score",
    label: "בונוס מהירות",
    help: "נקודה נוספת על כל שנייה שנשארה בסוף.",
  },
  {
    key: "theme",
    type: "enum",
    group: "look",
    options: THEMES,
    label: "ערכת צבעים",
    help: "איך המשחק נראה — צבעים ורקע.",
  },
  {
    key: "showTimer",
    type: "bool",
    group: "look",
    label: "להציג את הטיימר",
    help: "האם השחקן רואה כמה זמן נשאר.",
  },
  {
    key: "showScore",
    type: "bool",
    group: "look",
    label: "להציג ניקוד",
    help: "האם השחקן רואה את הניקוד שלו.",
  },
  {
    key: "sound",
    type: "bool",
    group: "look",
    label: "צלילים",
    help: "צליל קצר על כל זוג ועל כל טעות.",
  },
  {
    key: "winMessage",
    type: "string",
    group: "text",
    maxLength: 80,
    label: "הודעת ניצחון",
    help: "מה כתוב כשמנצחים.",
  },
  {
    key: "loseMessage",
    type: "string",
    group: "text",
    maxLength: 80,
    label: "הודעת הפסד",
    help: "מה כתוב כשנגמר הזמן.",
  },
];


/**
 * What a child means when they name a *world* rather than a setting.
 *
 * "תעשה לי נושא של ממתקים" is one request about two fields — the colours and the
 * pictures on the cards. Candy cards on a grey background reads as "you didn't
 * understand me". This table is what makes the AI change both, and it is data rather
 * than prompt prose so that adding a theme cannot silently forget to add its cards.
 *
 * A theme with no natural card set maps to null and simply leaves the cards alone.
 */
export const THEME_CARD_SET = {
  plain: null,
  space: "space",
  candy: "sweets",
  jungle: "animals",
  ocean: "ocean",
  neon: null,
  sunset: null,
};

export const GROUPS = [
  { key: "mode", label: "מצב משחק" },
  { key: "board", label: "הלוח" },
  { key: "time", label: "זמן וקושי" },
  { key: "score", label: "ניקוד" },
  { key: "look", label: "מראה" },
  { key: "text", label: "מילים" },
];

// ---------------------------------------------------------------------------
// The starter config: deliberately plain, grey, silent and generic.
// It must run perfectly and look unfinished. That gap is the workshop.
// ---------------------------------------------------------------------------
export const STARTER_CONFIG = Object.freeze({
  mode: "solo",
  claudeSkill: "normal",
  claudeTalks: true,
  title: "משחק זיכרון",
  cols: 4,
  rows: 4,
  cardSet: "avatars",
  customSymbols: [],
  timerSeconds: 60,
  peekSeconds: 0,
  flipBackMs: 1000,
  difficultyRamp: "none",
  pointsPerMatch: 10,
  penaltyPerMiss: 0,
  speedBonus: false,
  theme: "plain",
  showTimer: true,
  showScore: false,
  sound: false,
  winMessage: "ניצחת",
  loseMessage: "נגמר הזמן",
});

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

const MIN_SIDE = 2;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** How many different pictures a card set can actually offer. */
export function symbolCount(config, avatarCount = 31) {
  if (config.cardSet === "avatars") return avatarCount;
  if (config.cardSet === "custom") return config.customSymbols?.length ?? 0;
  return CARD_SETS[config.cardSet]?.symbols.length ?? 0;
}

/** Shrink a board until it is even-sized and fits within `maxCells`. */
function fitBoard(cols, rows, maxCells) {
  while (cols * rows > maxCells || (cols * rows) % 2 !== 0) {
    if (rows >= cols && rows > MIN_SIDE) rows -= 1;
    else if (cols > MIN_SIDE) cols -= 1;
    else break;
  }
  return { cols, rows };
}

/**
 * Take anything — a saved file, a share link, whatever the AI proposed — and
 * return a config the game is guaranteed to be able to run, plus Hebrew notes
 * explaining anything that had to be corrected.
 *
 * Nothing else in the app is allowed to trust an unsanitized config.
 */
export function sanitize(input, { avatarCount = 31 } = {}) {
  const notes = [];
  const out = { ...STARTER_CONFIG };
  const src = input && typeof input === "object" ? input : {};

  for (const field of FIELDS) {
    const raw = src[field.key];
    if (raw === undefined || raw === null) continue;

    switch (field.type) {
      case "int": {
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n)) break;
        const v = clamp(n, field.min, field.max);
        if (v !== n) {
          notes.push(
            `${field.label}: ביקשת ${n}, אבל מותר רק בין ${field.min} ל-${field.max} — שיניתי ל-${v}.`,
          );
        }
        out[field.key] = v;
        break;
      }
      case "bool":
        out[field.key] = Boolean(raw);
        break;
      case "enum":
        if (field.options.some((o) => o.value === raw)) out[field.key] = raw;
        else notes.push(`${field.label}: ״${raw}״ הוא לא ערך שאני מכיר — השארתי את מה שהיה.`);
        break;
      case "string":
        out[field.key] = String(raw).replace(/\s+/g, " ").trim().slice(0, field.maxLength);
        break;
      case "list":
        if (!Array.isArray(raw)) break;
        out[field.key] = raw
          .map((s) => String(s).trim().slice(0, field.maxLength))
          .filter(Boolean)
          .slice(0, field.maxItems);
        break;
    }
  }

  // --- cross-field rules the game engine depends on ------------------------

  // A custom set with fewer than 2 symbols cannot fill a board.
  if (out.cardSet === "custom" && out.customSymbols.length < 2) {
    out.cardSet = STARTER_CONFIG.cardSet;
    notes.push("בחרת ערכת קלפים משלך אבל בלי מספיק סמלים, אז חזרתי לערכת הדמויות.");
  }

  // Never ask the board for more distinct pictures than the set actually has,
  // and always keep an even number of cards so every card has a partner.
  const available = symbolCount(out, avatarCount);
  const maxCells = available * 2;
  const wanted = { cols: out.cols, rows: out.rows };
  const fitted = fitBoard(out.cols, out.rows, maxCells);
  out.cols = fitted.cols;
  out.rows = fitted.rows;

  if (out.cols !== wanted.cols || out.rows !== wanted.rows) {
    if (wanted.cols * wanted.rows > maxCells) {
      notes.push(
        `בערכת הקלפים הזאת יש ${available} ציורים שונים, ולכן הלוח הכי גדול שאפשר הוא ${maxCells} קלפים. הקטנתי ל-${out.cols}×${out.rows}. רוצה לוח גדול יותר? אפשר לבחור ערכת אמוג׳ים.`,
      );
    } else {
      notes.push(
        `לוח של ${wanted.cols}×${wanted.rows} נותן מספר אי-זוגי של קלפים, ואז לקלף אחד אין בן זוג. הקטנתי ל-${out.cols}×${out.rows}.`,
      );
    }
  }

  return { config: out, notes };
}

/** Only the keys that differ — powers the "what did the AI actually change" view. */
export function diff(before, after) {
  const changes = [];
  for (const field of FIELDS) {
    const a = before[field.key];
    const b = after[field.key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    changes.push({ key: field.key, label: field.label, from: a, to: b });
  }
  return changes;
}

/** Pretty-print a value the way a 10-year-old reads it. */
export function displayValue(key, value) {
  const field = FIELD_BY_KEY[key];
  if (!field) return String(value);
  if (field.type === "bool") return value ? "כן" : "לא";
  if (field.type === "enum") {
    return field.options.find((o) => o.value === value)?.label ?? String(value);
  }
  if (field.type === "list") return value.length ? value.join(" ") : "(ריק)";
  return String(value);
}
