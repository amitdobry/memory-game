// ---------------------------------------------------------------------------
// The one place that talks to Claude.
//
// The API key never leaves this process. The browser posts a Hebrew sentence
// and the child's current config; it gets back a reply plus a proposed config
// that has already been validated twice — once by strict tool-use on the API
// side, and once by our own sanitize() here.
// ---------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";
import { FIELDS, CARD_SETS, sanitize, diff, displayValue } from "../public/js/schema.js";

const MODEL = process.env.WORKSHOP_MODEL ?? "claude-haiku-4-5";
const EFFORT = process.env.WORKSHOP_EFFORT ?? "medium";

const client = new Anthropic();

// Haiku 4.5 rejects `output_config.effort`, and the server-side refusal
// fallback is an Opus-5/Fable feature. Newer models take both. One helper so
// swapping WORKSHOP_MODEL never produces a 400.
const isHaiku = MODEL.startsWith("claude-haiku");

function modelOptions() {
  if (isHaiku) return {};
  return {
    output_config: { effort: EFFORT },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
}

const create = (params) =>
  isHaiku ? client.messages.create(params) : client.beta.messages.create(params);

// ===========================================================================
// 1. The builder: "change my game"
// ===========================================================================

// Every field is nullable and required: that is the strict-mode way of saying
// "optional". Claude fills in only what should change and leaves the rest null.

function jsonTypeFor(field) {
  switch (field.type) {
    case "int":
      return { type: ["integer", "null"], minimum: field.min, maximum: field.max };
    case "bool":
      return { type: ["boolean", "null"] };
    case "enum":
      return { type: ["string", "null"], enum: [...field.options.map((o) => o.value), null] };
    case "string":
      return { type: ["string", "null"], maxLength: field.maxLength };
    case "list":
      return {
        type: ["array", "null"],
        items: { type: "string", maxLength: field.maxLength },
        maxItems: field.maxItems,
      };
    default:
      return { type: ["string", "null"] };
  }
}

const editableFields = FIELDS.filter((f) => f.ai !== false);

const UPDATE_TOOL = {
  name: "update_game",
  description:
    "Change the child's memory game. Set ONLY the fields the child actually asked to change; " +
    "leave every other field null so it keeps its current value.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        maxLength: 400,
        description:
          "A short, warm message in Hebrew telling the child what you changed and inviting them " +
          "to try it. 1-2 sentences. Talk to a 10-13 year old, not to a developer.",
      },
      ...Object.fromEntries(
        editableFields.map((f) => [
          f.key,
          { ...jsonTypeFor(f), description: `${f.label} — ${f.help}` },
        ]),
      ),
    },
    required: ["reply", ...editableFields.map((f) => f.key)],
    additionalProperties: false,
  },
};

// Kept byte-stable so the prompt cache actually hits.
const SYSTEM_PROMPT = `אתה העוזר של סדנת AI לילדים בגילאי 10-13.

כל ילד בונה משחק זיכרון משלו. אתה הכלי שדרכו הילד משנה את המשחק: הילד כותב בעברית מה הוא רוצה, ואתה משנה את ההגדרות של המשחק שלו.

מה אתה יכול לעשות:
- לשנות אך ורק את ההגדרות שמופיעות בכלי update_game. זו הרשימה המלאה של מה שאפשר לשנות במשחק הזה.
- לענות על שאלות על המשחק ועל מה שאפשר לשנות בו.

איך לעבוד:
1. אם הילד ביקש שינוי — תקרא ל-update_game, ותמלא רק את השדות שהוא באמת ביקש לשנות. כל שאר השדות נשארים null.
2. אם הילד שאל שאלה, או ביקש משהו שאי אפשר לעשות — תענה בטקסט רגיל, בלי לקרוא לכלי.
3. אם הבקשה לא ברורה לגמרי — תבחר את הפירוש הכי הגיוני, תבצע, ותגיד בקצרה מה בחרת. עדיף לעשות משהו ולהסביר, מאשר לשאול שאלה חוזרת.
4. לעולם אל תשנה שדה שהילד לא ביקש לשנות.

איך לדבר:
- עברית פשוטה, חמה וקצרה. משפט או שניים. בלי מונחים טכניים ובלי אנגלית.
- תגיד מה שינית במילים של המשחק ("עכשיו יש לך 45 שניות"), לא בשמות של שדות.
- תמיד תזמין את הילד לנסות: "תנסה/י עכשיו".

כשאי אפשר:
- אם הילד מבקש משהו שההגדרות לא מאפשרות (רמות, חידות, מוזיקה משלו, לשנות את חוקי המשחק) — תגיד בכנות שזה לא משהו שאתה יכול לשנות במשחק הזה, ותציע את הדבר הכי קרוב שכן אפשר. אל תמציא שעשית משהו שלא עשית.
- אם הילד מבקש טקסט פוגעני, גס או לא מתאים לילדים בהודעת הניצחון/הפסד או בשם המשחק — אל תכתוב אותו. תגיד שזה לא מתאים למשחק, ותציע נוסח אחר.

זכור: הילד הולך לבדוק את התוצאה במשחק אמיתי מיד אחרי שתענה. תהיה מדויק.`;

function describeConfig(config) {
  const lines = editableFields.map(
    (f) => `- ${f.label} (${f.key}): ${displayValue(f.key, config[f.key])}`,
  );
  const sets = Object.entries(CARD_SETS)
    .map(([k, v]) => `${k} (${v.label})`)
    .join(", ");
  return `ההגדרות הנוכחיות של המשחק:\n${lines.join("\n")}\n\nערכות קלפים אפשריות: ${sets}.\nבערכת "דמויות" יש 31 ציורים שונים, ולכן הלוח המקסימלי איתה הוא 62 קלפים. בערכות האמוג׳ים יש 32 סמלים, ואיתן אפשר עד 8×8.`;
}

// Nothing longer than this ever leaves the endpoint. Combined with the tool
// schema it means a stolen workshop code buys you a memory-game config and one
// short Hebrew sentence — not a free text generator.
const MAX_REPLY = 400;
const trim = (s) => String(s ?? "").trim().slice(0, MAX_REPLY);

/**
 * @param {object} args
 * @param {string} args.message       what the child typed
 * @param {object} args.config        their current (already sanitized) config
 * @param {Array}  args.history       [{role, content}] of previous turns
 * @param {number} args.avatarCount
 */
export async function askAI({ message, config, history = [], avatarCount = 31 }) {
  const messages = [
    ...history.slice(-12).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 2000),
    })),
    {
      role: "user",
      content: `${describeConfig(config)}\n\nהילד כותב:\n${String(message).slice(0, 2000)}`,
    },
  ];

  const response = await create({
    model: MODEL,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    tools: [UPDATE_TOOL],
    cache_control: { type: "ephemeral" },
    messages,
    ...modelOptions(),
  });

  // Always check stop_reason before reading content.
  if (response.stop_reason === "refusal") {
    return {
      reply: "אני לא יכול לעזור עם הבקשה הזאת. אפשר לנסות לבקש משהו אחר במשחק?",
      config,
      changes: [],
      notes: [],
    };
  }

  const toolUse = response.content.find(
    (b) => b.type === "tool_use" && b.name === "update_game",
  );
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!toolUse) {
    return {
      reply: trim(text) || "לא הבנתי בדיוק. אפשר לנסות לכתוב את זה אחרת?",
      config,
      changes: [],
      notes: [],
    };
  }

  // Tool inputs are JSON — never string-match them.
  const input = typeof toolUse.input === "string" ? JSON.parse(toolUse.input) : toolUse.input;
  const { reply, ...proposed } = input;

  // Drop the nulls (= "leave unchanged"), then merge onto the current config.
  const requested = Object.fromEntries(
    Object.entries(proposed).filter(([, v]) => v !== null && v !== undefined),
  );

  // The second guard: whatever came back, clamp it to something playable.
  const { config: nextConfig, notes } = sanitize({ ...config, ...requested }, { avatarCount });

  return {
    reply: trim(reply) || trim(text) || "שיניתי. תנסה/י עכשיו!",
    config: nextConfig,
    changes: diff(config, nextConfig),
    notes,
  };
}

// ===========================================================================
// 2. The opponent's voice
//
// Claude does NOT decide the moves — the browser does that instantly and
// offline (see public/js/opponent.js). What Claude adds is the part a lookup
// table cannot fake: reacting, in Hebrew, to what just happened.
// ===========================================================================

const BANTER_SYSTEM = `אתה קלוד, יריב ידידותי במשחק זיכרון מול ילד/ה בגיל 10-13.

אתה מגיב בקול אחרי כל תור. הכללים:
- משפט אחד בלבד. קצר. עברית פשוטה.
- ספורטיבי, מצחיק וחביב. אתה יריב, לא מורה.
- כשהילד מצליח — תשבח באמת. כשאתה מצליח — תתגאה קצת, בחיוך, בלי להשפיל.
- כשאתה טועה — תודה בזה בהומור.
- בלי עצות איך לשחק, בלי הסברים, בלי אימוג׳י יותר מאחד.
- אף פעם אל תחזור על משפט שכבר אמרת בשיחה הזאת.`;

/**
 * @param {object} args
 * @param {string} args.event    what just happened, in plain Hebrew
 * @param {string[]} args.recent lines already said (so it does not repeat itself)
 */
export async function banter({ event, recent = [] }) {
  const avoid = recent.length
    ? `\n\nכבר אמרת את המשפטים האלה — אל תחזור עליהם:\n${recent.slice(-6).join("\n")}`
    : "";

  const response = await create({
    model: MODEL,
    max_tokens: 100,
    system: BANTER_SYSTEM,
    messages: [{ role: "user", content: `${event}${avoid}\n\nמה אתה אומר?` }],
    ...modelOptions(),
  });

  if (response.stop_reason === "refusal") return { line: "" };

  const line = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim()
    .split("\n")[0]
    .slice(0, 120);

  return { line };
}

export const aiInfo = { model: MODEL, effort: isHaiku ? "n/a" : EFFORT };
