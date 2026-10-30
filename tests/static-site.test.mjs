// ---------------------------------------------------------------------------
// Static checks for the public site. Zero dependencies: node:test, node:fs.
//
//   npm test
//
// These are not a substitute for opening the page. They pin the things that are
// easy to break silently while editing HTML: a picker fallback that still points at
// the old file, a form that quietly grew a third-party action, a secret that landed
// in public/, an anchor with no target, a contract hash that drifted from schema.js.
// ---------------------------------------------------------------------------
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  parseAttribution,
  markerFor,
  describeAttribution,
  rememberAttribution,
  recallAttribution,
  resolveAttribution,
  whatsappLink,
} from "../public/js/attribution.js";
import { USERS } from "../public/js/users.js";
import {
  VISITOR_KEY,
  VISITOR_ID,
  getVisitorId,
  referralFields,
  normalizeForm,
  fingerprint,
  missingFields,
  buildLeadPayload,
  classifyOutcome,
  describeFields,
  postJson,
  sendVisit,
  GRADES,
  createKeyState,
  keyForSubmission,
  markUncertain,
  resetKeyState,
  changedOffer,
} from "../public/js/acquisition.js";
import {
  parseDate,
  timeOfDay,
  glyphFor,
  formatSession,
  commonHours,
  layoutMonths,
  describeAvailability,
  describeGroupSize,
  describePrice,
  fetchGroups,
} from "../public/js/schedule.js";
import { CONTRACT_VERSION } from "../public/js/contract.js";
import {
  SECTIONS,
  TARGETS,
  TARGET_NAMES,
  MAX_CLICKS,
  scrollDepth,
  targetOf,
  createTracker,
  sendActivity,
  startEngagement,
} from "../public/js/engagement.js";
import { FIELDS, STARTER_CONFIG, THEME_CARD_SET, FIREKEEPER_FACES } from "../public/js/schema.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), "utf8");

// The parents’ landing page has its own source, outside public/: amitdobry/workshop publishes
// it at https://amitdobry.github.io/workshop/ as index.html with public/js beside it.
const LANDING = path.join(ROOT, "landing", "index.html");
const landing = fs.readFileSync(LANDING, "utf8");
const picker = read("index.html");
const forwarder = read("workshop.html");
/** Markup only: no <script>, no <style>, no HTML/CSS/JS comments. */
const withoutCode = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const withoutComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "");

// ---------------------------------------------------------------------------
// index.html — the landing page
// ---------------------------------------------------------------------------

test("the landing page offers Rhythm Runner as the third demo and passes the leaflet marker on", () => {
  assert.match(landing, /id="game-rhythm"[^>]*href="https:\/\/rhythm-runner-eight\.vercel\.app\/"/);
  assert.match(landing, /דוגמה 03/);
  assert.match(landing, /rhythmCard\.href = `https:\/\/rhythm-runner-eight\.vercel\.app\/\$\{marker\}`/);
});

test("index.html is the landing page, in Hebrew, RTL", () => {
  assert.match(landing, /<html lang="he" dir="rtl">/);
  assert.match(landing, /<title>בונים עם AI/);
});

test("index.html leads to WhatsApp and shows the number", () => {
  assert.match(landing, /wa\.me\/972546111602/);
  assert.match(landing, /054-611-1602/);
});

test("index.html has no third-party form destination and no analytics", () => {
  assert.doesNotMatch(landing, /formspree/i);
  assert.doesNotMatch(landing, /_subject/);
  assert.doesNotMatch(landing, /FORM_ENDPOINT/);
  assert.doesNotMatch(landing, /<form[^>]*\saction=/i);
  assert.doesNotMatch(landing, /googletagmanager|gtag\(/);
});

test("index.html's markup never claims details were saved; only the confirmed-success branch in the script says registered", () => {
  const markup = withoutCode(landing);
  assert.doesNotMatch(markup, /הפרטים נשלחו|הפרטים נשמרו|ההרשמה נקלטה/);
  // The success sentence exists exactly once, inside the script, after a confirmed acknowledgement.
  assert.equal((landing.match(/ההרשמה נקלטה/g) ?? []).length, 1);
  assert.match(landing, /case "created":\s*case "replay":/);
  // A timeout is reported as unconfirmed, never as "nothing was saved".
  assert.match(landing, /ייתכן שהפרטים כן נשמרו/);
});

test("index.html registration form: explicit phone, unchecked consent, privacy text, WhatsApp alternative", () => {
  const markup = withoutCode(landing);
  assert.match(markup, /<input id="f-phone" name="parentPhone" type="tel"[^>]*required/);
  assert.match(markup, /<input id="f-consent" name="consent" type="checkbox">/);
  assert.doesNotMatch(markup, /name="consent"[^>]*checked/);
  assert.match(markup, /<div class="privacy" id="privacy">\s*<p>הפרטים שתמלאו יישמרו כדי שעמית יוכל לחזור אליכם בנוגע לסדנה\.<\/p>\s*<details>\s*<summary>פרטים נוספים על פרטיות<\/summary>/);
  assert.match(markup, /<span>אני מאשר\/ת שמירת הפרטים ויצירת קשר בנוגע לסדנה\.<\/span>/);
  for (const line of ["מה נשמר", "מאיזה עלון או קוד הפניה", "מפיצי העלונים", "מחיקה"]) {
    assert.ok(markup.includes(line), `privacy text is missing: ${line}`);
  }
  // No invented retention period and no compliance claim inside the privacy text itself.
  const privacy = markup.slice(markup.indexOf('<div class="privacy"'), markup.indexOf('<label class="consent"'));
  assert.ok(privacy.length > 200, "privacy block present");
  assert.doesNotMatch(privacy, /\d+\s*(ימים|שבועות|חודשים|שנים)|GDPR|תקנות|חוק הגנת|בהתאם לחוק|תואם/);
  assert.match(markup, /wa\.me\/972546111602/);
  // Grades are the server's vocabulary: the workshop's own three, and an enquiry route for the rest.
  for (const value of ['value="7"', 'value="8"', 'value="9"']) assert.ok(markup.includes(value), value);
  assert.doesNotMatch(markup, /value="other"|value="אחר"/);
  assert.match(markup, /כיתה אחרת\? כתבו לי ב-WhatsApp/);
});

test("index.html keeps the honesty boundary around the AI demo", () => {
  // The public 50-edit grant does not exist yet; the page must not offer it.
  assert.doesNotMatch(landing, /50 (בקשות|שינויים|עריכות)/);
  assert.match(landing, /את השינויים בעזרת ה-AI עושים המשתתפים בסדנה עצמה/);
});

test("index.html carries the original hero wording, the approved lesson 6 and the plain student-name label", () => {
  assert.match(landing, /עשרה מפגשים שבהם לומדים לחשוב כמו מפתחים, לעבוד נכון עם AI ולבנות משחקים שאפשר לפתוח ולשחק\./);
  assert.match(landing, /איזה משחק אני רוצה ליצור, ואיך הופכים את הרעיון לתוכנית\?/);
  assert.match(landing, /לכל משתתף יש רעיון למשחק משלו ותוכנית ברורה: איך משחקים, איך מנצחים ומה בונים קודם\./);
  assert.match(landing, /<label for="f-student">שם התלמיד<\/label>/);
  assert.doesNotMatch(landing, /או כינוי|לא צריך שם מלא|אין שמירה של פרטים/);
});

test("the space memory-game example keeps its exact configuration URL, absolute so it works from /workshop/ too", () => {
  const m = /id="preview-link" href="([^"]+)"/.exec(landing);
  assert.ok(m, "preview link present");
  assert.ok(m[1].startsWith("https://amitdobry.github.io/memory-game/play.html?by=%D7%94%D7%A1%D7%93%D7%A0%D7%94#eyJtb2RlIjoic29sbyIs"), m[1]);
  assert.ok(m[1].endsWith("Iteg15LXnteoINeU15bXntefLiDXoteV15Mg16HXmdeR15XXkT8ifQ"), "fragment end");
});

test("landing: five taps on the facts label open the distributor claim form on LIVE with the remembered code", () => {
  assert.match(landing, /<span class="eyebrow" id="facts-label"[^>]*>פרטים חשובים<\/span>/);
  const code = withoutComments(landing);
  assert.match(code, /getElementById\("facts-label"\)/);
  assert.match(code, /now - t < 2000/);
  assert.match(code, /labelTaps\.length < 5\) return;/);
  assert.match(code, /\$\{API_BASE\}\/distributor\/claim\$\{query\}/);
  assert.match(code, /\?ref=\$\{encodeURIComponent\(attribution\.code\)\}/);
  assert.match(code, /\?b=\$\{encodeURIComponent\(attribution\.number\)\}/);
});

test("index.html avoids slash-heavy gendered forms in visible copy", () => {
  const visible = withoutCode(landing);
  for (const form of ["הילד/ה", "שלו/ה", "משיק/ה", "התלמיד/ה", "מציג/ה"]) {
    assert.equal(visible.includes(form), false, `visible copy still contains ${form}`);
  }
});

test("index.html fixed the select focus selector and dropped the dead nav handler", () => {
  const code = withoutComments(landing);
  assert.doesNotMatch(code, /input:focus,select,textarea:focus/);
  assert.match(code, /input:focus,select:focus,textarea:focus/);
  assert.doesNotMatch(code, /querySelectorAll\('\.nav-cta'\)/);
});

test("index.html: every in-page anchor has a target", () => {
  const ids = new Set([...landing.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [...landing.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(anchors.length > 5, "expected in-page navigation");
  for (const target of anchors) assert.ok(ids.has(target), `href="#${target}" has no element with that id`);
});

// ---------------------------------------------------------------------------
// Local link targets exist, on every page
// ---------------------------------------------------------------------------

for (const page of ["index.html", "workshop.html", "build.html", "play.html"]) {
  test(`${page}: every local href/src points at a file that exists`, () => {
    const html = withoutCode(read(page));
    const refs = [...html.matchAll(/\s(?:href|src)="([^"#][^"]*)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|data:|mailto:|tel:)/.test(ref)) continue;
      const clean = ref.split("#")[0].split("?")[0];
      if (clean === "") continue;
      assert.ok(fs.existsSync(path.join(PUBLIC, clean)), `${page} references missing ${ref}`);
    }
  });
}

// ---------------------------------------------------------------------------
// workshop.html — the classroom picker, moved from index.html
// ---------------------------------------------------------------------------

test("index.html is the classroom picker again and still offers the three children", () => {
  assert.match(picker, /<title>סדנת AI — מי אתם\?<\/title>/);
  assert.match(picker, /import \{ USERS \} from ".\/js\/users.js"/);
  assert.match(picker, /build\.html\?u=/);
  const children = USERS.filter((u) => !u.isInstructor);
  assert.equal(children.length, 3);
  assert.ok(USERS.some((u) => u.isInstructor), "the instructor entry is still there");
});

test("index.html forwards a leaflet visit (?ref= or ?b=) to the landing page with its query, and nothing else", () => {
  const code = withoutComments(picker);
  assert.match(code, /if \(!q\.has\("ref"\) && !q\.has\("b"\)\) return;/);
  assert.match(code, /"\/workshop\/"/);
  assert.match(code, /location\.replace\(target \+ location\.search \+ location\.hash\)/);
  // The forwarder runs in the head, before the picker is drawn.
  assert.ok(code.indexOf("location.replace(target") < code.indexOf("<body>"), "forwarder must run before the body");
  // The landing page itself never forwards: no loop between the two addresses.
  assert.doesNotMatch(withoutComments(landing), /location\.replace\(target|"\/landing\/"/);
});

test("workshop.html keeps working by forwarding to the picker at the root", () => {
  assert.match(forwarder, /http-equiv="refresh" content="0; url=\.\/"/);
  assert.match(forwarder, /location\.replace\(".\/" \+ location\.search \+ location\.hash\)/);
  assert.match(forwarder, /<a href="\.\/">/);
  assert.match(read("js/build.js"), /location\.replace\("workshop\.html"\)/);
});

test("landing/index.html: every module it imports exists in public/js, and it references nothing else locally", () => {
  const refs = [...landing.matchAll(/from "\.\/(js\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 3, "expected module imports");
  for (const ref of refs) assert.ok(fs.existsSync(path.join(PUBLIC, ref)), `landing imports missing ${ref}`);
  const other = [...withoutCode(landing).matchAll(/\s(?:href|src)="([^"#][^"]*)"/g)].map((m) => m[1]).filter((r) => !/^(https?:|data:|mailto:|tel:)/.test(r));
  assert.deepEqual(other, [], "the landing page must only reference absolute URLs besides its modules");
});

test("build.js stops executing after redirecting away", () => {
  const build = read("js/build.js");
  const after = build.slice(build.indexOf('location.replace("workshop.html")'));
  assert.match(after, /await new Promise\(\(\) => \{\}\)/);
});

// ---------------------------------------------------------------------------
// Attribution helper
// ---------------------------------------------------------------------------

test("legacy ?b= is accepted for 1–6 only", () => {
  assert.deepEqual(parseAttribution("?b=3"), { kind: "batch", number: "3" });
  assert.equal(parseAttribution("?b=9"), null);
  assert.equal(parseAttribution("?b=0"), null);
  assert.equal(parseAttribution("?b=3x"), null);
  assert.equal(parseAttribution(""), null);
});

test("?ref=CODE is accepted, normalised to upper case, and rejected when odd", () => {
  assert.deepEqual(parseAttribution("?ref=y7k2"), { kind: "ref", code: "Y7K2" });
  assert.equal(parseAttribution("?ref=ab"), null);
  assert.equal(parseAttribution("?ref=with-dash"), null);
  assert.equal(parseAttribution("?ref=" + "A".repeat(13)), null);
});

test("ref wins over a legacy batch when both are present", () => {
  assert.deepEqual(parseAttribution("?b=2&ref=Y7K2"), { kind: "ref", code: "Y7K2" });
});

test("the WhatsApp marker matches what the first run printed, and extends to codes", () => {
  assert.equal(markerFor({ kind: "batch", number: "3" }), " (מעלון 3)");
  assert.equal(markerFor({ kind: "ref", code: "Y7K2" }), " (קוד Y7K2)");
  assert.equal(markerFor(null), "");
  assert.equal(describeAttribution(null), "ישירות לאתר");
  assert.equal(describeAttribution({ kind: "batch", number: "4" }), "עלון 4");
});

test("attribution is remembered and recalled, and garbage is not", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };

  assert.deepEqual(resolveAttribution("?b=5", storage), { kind: "batch", number: "5" });
  assert.deepEqual(resolveAttribution("", storage), { kind: "batch", number: "5" });
  assert.deepEqual(resolveAttribution("?ref=Q1W2", storage), { kind: "ref", code: "Q1W2" });
  assert.deepEqual(recallAttribution(storage), { kind: "ref", code: "Q1W2" });

  store.set("leaflet_attribution", JSON.stringify({ kind: "batch", number: "42" }));
  assert.equal(recallAttribution(storage), null);
  store.set("leaflet_attribution", "not json");
  assert.equal(recallAttribution(storage), null);
});

test("a broken storage never breaks the page", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(resolveAttribution("?b=1", broken), { kind: "batch", number: "1" });
  assert.equal(resolveAttribution("", broken), null);
  rememberAttribution({ kind: "batch", number: "1" }, null);
  assert.equal(recallAttribution(null), null);
});

test("the WhatsApp link carries the marker and the composed lines", () => {
  const url = new URL(whatsappLink("972546111602", { kind: "batch", number: "3" }, "שם ההורה: דנה"));
  assert.equal(url.host, "wa.me");
  assert.equal(url.pathname, "/972546111602");
  const text = url.searchParams.get("text");
  assert.equal(text, "שלום עמית, אשמח לקבל פרטים על סדנת ה-AI (מעלון 3)\n\nשם ההורה: דנה");
  assert.equal(
    new URL(whatsappLink("972546111602", null)).searchParams.get("text"),
    "שלום עמית, אשמח לקבל פרטים על סדנת ה-AI",
  );
});

// ---------------------------------------------------------------------------
// Nothing secret in public/
// ---------------------------------------------------------------------------

test("public/ holds no credential", () => {
  const suspicious = /sk-ant-|ANTHROPIC_API_KEY|WORKSHOP_OWNER_PASSWORD|ENGINE_ROOM_(USER|PASSWORD)|mongodb(\+srv)?:\/\/|RESEND_API_KEY/;
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
  for (const file of walk(PUBLIC)) {
    if (!/\.(html|js|css|json|svg|txt|md)$/.test(file)) continue;
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), suspicious, `${path.relative(ROOT, file)} looks like it holds a secret`);
  }
});

// ---------------------------------------------------------------------------
// The contract stamp still matches schema.js
// ---------------------------------------------------------------------------

test("public/js/contract.js matches the hash export-contract.mjs would compute", () => {
  // Same projection and same hash as scripts/export-contract.mjs. Duplicated here on
  // purpose: importing the script would run it, and it writes files.
  const fields = FIELDS.map((f) => ({
    key: f.key,
    type: f.type,
    label: f.label,
    help: f.help ?? "",
    ...(f.min !== undefined ? { min: f.min } : {}),
    ...(f.max !== undefined ? { max: f.max } : {}),
    ...(f.maxLength !== undefined ? { maxLength: f.maxLength } : {}),
    ...(f.maxItems !== undefined ? { maxItems: f.maxItems } : {}),
    ...(f.options ? { options: f.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
  }));
  const version = createHash("sha256")
    .update(JSON.stringify({ fields, starter: STARTER_CONFIG, themes: THEME_CARD_SET, faces: FIREKEEPER_FACES }))
    .digest("hex")
    .slice(0, 12);
  assert.equal(CONTRACT_VERSION, version, "run: npm run export:contract -- ../Live/src/workshop/contract.ts");
});

test("LIVE's generated contract carries the same stamp (skipped when LIVE is not checked out beside this repo)", (t) => {
  const live = path.join(ROOT, "..", "Live", "src", "workshop", "contract.ts");
  if (!fs.existsSync(live)) return t.skip("LIVE not found at ../Live");
  const match = /export const CONTRACT_VERSION = "([0-9a-f]{12})"/.exec(fs.readFileSync(live, "utf8"));
  assert.ok(match, "LIVE contract.ts has no CONTRACT_VERSION");
  assert.equal(match[1], CONTRACT_VERSION);
});

// ---------------------------------------------------------------------------
// acquisition.js — the browser side of the intake
// ---------------------------------------------------------------------------

const formValues = (patch = {}) => ({
  parentName: " Test Parent ",
  parentPhone: "054-000-0000",
  parentEmail: "",
  participantFirstName: "Testy",
  grade: "8",
  note: "",
  consent: true,
  ...patch,
});

test("visitor id: remembered when storage works, temporary when it does not, always well-formed", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const first = getVisitorId(storage);
  assert.match(first, VISITOR_ID);
  assert.equal(getVisitorId(storage), first);
  assert.deepEqual([...store.keys()], [VISITOR_KEY]);

  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const temp = getVisitorId(broken);
  assert.match(temp, VISITOR_ID);
  assert.notEqual(temp, getVisitorId(broken), "no storage means a fresh id per call, and no crash");
  assert.match(getVisitorId(null), VISITOR_ID);

  store.set(VISITOR_KEY, "garbage with spaces");
  assert.notEqual(getVisitorId(storage), "garbage with spaces");
});

test("referral fields follow the server contract and the ref-over-b rule lives in attribution.js", () => {
  assert.deepEqual(referralFields({ kind: "ref", code: "Y7K2" }), { ref: "Y7K2" });
  assert.deepEqual(referralFields({ kind: "batch", number: "3" }), { b: "3" });
  assert.deepEqual(referralFields(null), {});
  assert.deepEqual(parseAttribution("?b=2&ref=Y7K2"), { kind: "ref", code: "Y7K2" });
});

test("the payload carries exactly what the server accepts and nothing it forbids", () => {
  const payload = buildLeadPayload(formValues({ parentEmail: " Parent@Example.TEST ", note: " a note " }), {
    idempotencyKey: "k-1234567890",
    visitorId: "v-1234567890",
    attribution: { kind: "batch", number: "3" },
  });
  assert.deepEqual(Object.keys(payload).sort(), ["b", "consent", "grade", "idempotencyKey", "note", "parentEmail", "parentName", "parentPhone", "participantFirstName", "visitorId"]);
  assert.equal(payload.parentName, "Test Parent");
  assert.equal(payload.consent, true);
  for (const forbidden of ["status", "creditedBatchId", "creditedDistributorId", "privacyVersion", "capturedAt", "attribution"]) {
    assert.equal(forbidden in payload, false, forbidden);
  }
  // Empty optionals are dropped, not sent as "".
  const bare = buildLeadPayload(formValues(), { idempotencyKey: "k-1234567890", visitorId: null, attribution: null });
  assert.equal("parentEmail" in bare, false);
  assert.equal("note" in bare, false);
  assert.equal("visitorId" in bare, false);
});

test("fingerprint: unchanged submission keeps its key, an edit is a new submission", () => {
  const a = fingerprint(formValues());
  // Whitespace and punctuation do not make a new submission; the server does the E.164 work.
  assert.equal(fingerprint(formValues({ parentName: "Test Parent", parentPhone: "054 000 0000" })), a);
  assert.notEqual(fingerprint(formValues({ participantFirstName: "Other" })), a);
  assert.notEqual(fingerprint(formValues({ note: "now with a note" })), a);
});

test("client-side completeness check names the fields, including the unticked consent", () => {
  assert.deepEqual(missingFields(formValues()), []);
  assert.deepEqual(missingFields(formValues({ consent: false, parentPhone: "123", grade: "12" })), ["parentPhone", "grade", "consent"]);
  assert.equal(describeFields(["parentPhone", "consent"]), "טלפון, אישור יצירת הקשר");
  assert.equal(describeFields([]), "הפרטים שמילאתם");
  assert.deepEqual(normalizeForm(formValues()).parentEmail, undefined);
});

test("outcomes: success only on an acknowledged 201/200, and every other case has a name", () => {
  assert.equal(classifyOutcome(201, { ok: true, leadRef: "x" }), "created");
  assert.equal(classifyOutcome(200, { ok: true, leadRef: "x", replay: true }), "replay");
  assert.equal(classifyOutcome(200, null), "error");
  assert.equal(classifyOutcome(201, { ok: false }), "error");
  assert.equal(classifyOutcome(400, { error: "invalid_request" }), "invalid");
  assert.equal(classifyOutcome(409, {}), "conflict");
  assert.equal(classifyOutcome(429, {}), "rate_limited");
  assert.equal(classifyOutcome(503, {}), "unavailable");
  assert.equal(classifyOutcome(404, {}), "unavailable");
  assert.equal(classifyOutcome(500, {}), "error");
});

test("postJson: a timeout is reported as a timeout, a network failure as network, and the beacon swallows both", async () => {
  const hang = () => new Promise((_, reject) => { /* never resolves; abort rejects it */ });
  const hangingFetch = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  await assert.rejects(postJson("http://x/api/acquisition/lead", {}, { fetchImpl: hangingFetch, timeoutMs: 20 }), (e) => e.kind === "timeout");
  await assert.rejects(postJson("http://x/api/acquisition/lead", {}, { fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")) }), (e) => e.kind === "network");
  void hang;

  let posted = null;
  const okFetch = async (url, init) => { posted = { url, body: JSON.parse(init.body) }; return { status: 202, json: async () => ({ ok: true, recognised: true }) }; };
  await sendVisit("http://x", "v-1234567890", { kind: "ref", code: "Y7K2" }, { fetchImpl: okFetch });
  assert.deepEqual(posted, { url: "http://x/api/acquisition/visit", body: { visitorId: "v-1234567890", ref: "Y7K2" } });
  await sendVisit("http://x", "v-1234567890", null, { fetchImpl: () => Promise.reject(new Error("down")) });
});

test("acquisition.js stores only the visitor id, never a contact detail", () => {
  const source = read("js/acquisition.js");
  const writes = [...source.matchAll(/setItem\(([^,]+),/g)].map((m) => m[1].trim());
  assert.deepEqual(writes, ["VISITOR_KEY"]);
  assert.doesNotMatch(source, /sessionStorage|document\.cookie|location\.search\s*=|history\.(push|replace)State/);
  // And the page's own script keeps the same promise.
  const script = landing.slice(landing.indexOf('<script type="module">'));
  assert.doesNotMatch(script, /setItem|sessionStorage|document\.cookie/);
});

test("index.html talks to LIVE through api.js's API_BASE, so the origin is decided in one place", () => {
  assert.match(landing, /import \{ API_BASE \} from ".\/js\/api.js"/);
  assert.match(landing, /\$\{API_BASE\}\/api\/acquisition\/lead/);
  assert.doesNotMatch(landing, /herokuapp\.com/);
});

test("grades offered are exactly the workshop's: 7, 8, 9", () => {
  assert.deepEqual(GRADES.map((g) => g.value), ["7", "8", "9"]);
  assert.deepEqual(missingFields(formValues({ grade: "other" })), ["grade"]);
});

test("idempotency key: a timeout retry of an unchanged form reuses the key", () => {
  const state = createKeyState();
  const first = keyForSubmission(state, formValues());
  assert.equal(first.fresh, true);
  markUncertain(state); // the attempt timed out
  const retry = keyForSubmission(state, formValues({ parentPhone: "054 000 0000" })); // same digits, different spacing
  assert.equal(retry.key, first.key);
  assert.equal(retry.fresh, false);
  assert.equal(retry.rotatedAfterUncertain, false);
});

test("idempotency key: editing the form after an uncertain result is a NEW submission, and says so", () => {
  const state = createKeyState();
  const first = keyForSubmission(state, formValues());
  markUncertain(state);
  const edited = keyForSubmission(state, formValues({ participantFirstName: "Someone Else" }));
  assert.notEqual(edited.key, first.key, "different data never travels under the previous key");
  assert.equal(edited.fresh, true);
  assert.equal(edited.rotatedAfterUncertain, true, "the page is told to warn that the earlier attempt may also have registered");
  // A plain edit with no uncertain attempt behind it rotates quietly.
  const quiet = keyForSubmission(state, formValues({ participantFirstName: "Third" }));
  assert.equal(quiet.rotatedAfterUncertain, false);
});

test("idempotency key: 'register another participant' forgets the key even for identical fields", () => {
  const state = createKeyState();
  const first = keyForSubmission(state, formValues());
  resetKeyState(state);
  const next = keyForSubmission(state, formValues());
  assert.notEqual(next.key, first.key);
});

test("registration works when browser storage is unavailable: a temporary visitor id, a valid payload, no throw", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const visitorId = getVisitorId(broken);
  const attribution = resolveAttribution("?b=3", broken);
  const payload = buildLeadPayload(formValues(), { idempotencyKey: keyForSubmission(createKeyState(), formValues()).key, visitorId, attribution });
  assert.match(payload.visitorId, VISITOR_ID);
  assert.equal(payload.b, "3", "the referral still travels with the lead even though nothing could be remembered");
  assert.match(payload.idempotencyKey, VISITOR_ID);
});

test("a lost visit beacon does not change what the lead sends: the referral rides on the lead itself", () => {
  const payload = buildLeadPayload(formValues(), { idempotencyKey: "k-1234567890", visitorId: "v-1234567890", attribution: { kind: "ref", code: "Y7K2" } });
  assert.equal(payload.ref, "Y7K2");
  assert.equal(payload.visitorId, "v-1234567890");
});

test("the page wires the key state, marks timeouts uncertain and explains a rotation", () => {
  const script = landing.slice(landing.indexOf('<script type="module">'));
  assert.match(script, /const keys = createKeyState\(\)/);
  assert.match(script, /keyForSubmission\(keys, v\)/);
  assert.match(script, /if \(failure\.kind === "timeout"\) \{\s*markUncertain\(keys\)/);
  assert.match(script, /decision\.rotatedAfterUncertain/);
  assert.match(script, /resetKeyState\(keys\)/);
  assert.doesNotMatch(script, /keyFor_|\bkey = null\b/);
});

// ---------------------------------------------------------------------------
// Groups and their meetings — schedule.js, and the picker on the page
// ---------------------------------------------------------------------------

const SESSIONS = [
  { n: 1, date: "2026-10-23", start: "10:00", end: "12:00", note: null },
  { n: 2, date: "2026-10-30", start: "10:00", end: "12:00", note: "מפגש חלופי בגלל חג" },
  { n: 3, date: "2026-11-06", start: "10:00", end: "12:00", note: null },
];

test("schedule.js reads a calendar day without a timezone moving it, and refuses what is not a date", () => {
  assert.deepEqual(parseDate("2026-10-23"), { year: 2026, month: 10, day: 23, weekday: 5 });
  assert.equal(parseDate("2026-10-25").weekday, 0, "Sunday");
  for (const bad of ["2026-02-30", "2026-13-01", "23/10/2026", "", null, undefined, "2026-1-1"]) {
    assert.equal(parseDate(bad), null, String(bad));
  }
});

test("schedule.js derives the time-of-day mark from the hour, and never stores one", () => {
  assert.equal(timeOfDay("10:00"), "morning");
  assert.equal(timeOfDay("13:30"), "afternoon");
  assert.equal(timeOfDay("17:00"), "evening");
  assert.equal(glyphFor("10:00"), "☀");
  assert.equal(glyphFor("19:00"), "☾");
  // The page derives the mark; nothing is ever sent to the server about it.
  assert.doesNotMatch(read("js/schedule.js"), /timeOfDay:/);
});

test("schedule.js lays out one grid per month, Sunday first, with Amit's own meeting numbers", () => {
  const months = layoutMonths(SESSIONS);
  assert.equal(months.length, 2);
  assert.deepEqual(months.map((m) => [m.year, m.month]), [[2026, 10], [2026, 11]]);
  assert.equal(months[0].label, "אוקטובר 2026");
  // October 2026 starts on a Thursday: four blank squares, then 31 days, padded to whole weeks.
  assert.equal(months[0].cells.slice(0, 4).every((c) => c === null), true);
  assert.equal(months[0].cells[4].day, 1);
  assert.equal(months[0].cells.length % 7, 0);
  assert.equal(months[0].cells.filter((c) => c !== null).length, 31);
  const marked = months[0].cells.filter((c) => c !== null && c.n !== null);
  assert.deepEqual(marked.map((c) => [c.date, c.n]), [["2026-10-23", 1], ["2026-10-30", 2]]);
  assert.equal(months[1].cells.filter((c) => c !== null && c.n !== null).length, 1);
  // Nothing to draw is nothing drawn, and a month with no meeting is never drawn.
  assert.deepEqual(layoutMonths([]), []);
  assert.deepEqual(layoutMonths([{ n: 1, date: "nonsense", start: "10:00", end: "12:00" }]), []);
});

test("schedule.js formats a meeting as a weekday, a day and its hours, and keeps a note", () => {
  const line = formatSession(SESSIONS[1]);
  assert.equal(line.n, 2);
  assert.equal(line.weekday, "שישי");
  assert.equal(line.dayMonth, "30.10");
  assert.equal(line.time, "10:00–12:00");
  assert.equal(line.note, "מפגש חלופי בגלל חג");
  assert.equal(formatSession({ n: 1, date: "bad", start: "x", end: "y" }).time, "");
  assert.equal(commonHours(SESSIONS), "10:00–12:00");
  assert.equal(commonHours([SESSIONS[0], { ...SESSIONS[1], start: "17:00", end: "19:00" }]), null);
});

test("schedule.js says how many places are left, and never a negative number", () => {
  assert.equal(describeAvailability(3, 2), "2 מתוך 3 מקומות פנויים");
  assert.equal(describeAvailability(3, 1), "נותר מקום אחד");
  assert.equal(describeAvailability(3, 0), "הקבוצה מלאה");
  assert.equal(describeAvailability(3, -5), "הקבוצה מלאה");
  assert.equal(describeAvailability(3, 99), "3 מתוך 3 מקומות פנויים");
});

test("fetchGroups never breaks the page: a failure, a refusal and a malformed group all yield an empty list", async () => {
  const ok = await fetchGroups("http://live.test", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ groups: [{ id: "a".repeat(24), label: " ימי שישי ", capacity: 3, available: 2, full: false, locationLabel: " יוקנעם ", sessions: SESSIONS }] }) }),
  });
  assert.equal(ok.length, 1);
  assert.equal(ok[0].label, "ימי שישי");
  assert.equal(ok[0].locationLabel, "יוקנעם");
  assert.equal(ok[0].available, 2);
  assert.equal(ok[0].full, false);
  assert.equal(ok[0].sessions.length, 3);

  const capped = await fetchGroups("http://live.test", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ groups: [{ id: "a".repeat(24), label: "x", capacity: 3, available: 9, full: false, sessions: SESSIONS }] }) }),
  });
  assert.equal(capped[0].available, 3);

  for (const fetchImpl of [
    async () => { throw new Error("offline"); },
    async () => ({ ok: false, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ groups: [{ id: "x", label: "", sessions: [] }] }) }),
  ]) {
    assert.deepEqual(await fetchGroups("http://live.test", { fetchImpl }), []);
  }
});

test("the payload carries the chosen group, and the waiting list only when it was chosen deliberately", () => {
  const base = { idempotencyKey: "k-1234567890", visitorId: "v-1234567890", attribution: null };
  const withGroup = buildLeadPayload(formValues(), { ...base, groupId: "b".repeat(24) });
  assert.equal(withGroup.groupId, "b".repeat(24));
  assert.equal("waitlist" in withGroup, false, "waitlist is never sent as false");
  const waiting = buildLeadPayload(formValues(), { ...base, groupId: "b".repeat(24), waitlist: true });
  assert.equal(waiting.waitlist, true);
  // A waiting list with no group is not something the browser may assert.
  assert.equal("waitlist" in buildLeadPayload(formValues(), { ...base, waitlist: true }), false);
  assert.deepEqual(Object.keys(waiting).sort(), ["consent", "grade", "groupId", "idempotencyKey", "parentName", "parentPhone", "participantFirstName", "visitorId", "waitlist"].sort());
});

test("the form asks for a group only while groups are on offer, and a full group is a 409 of its own", () => {
  assert.deepEqual(missingFields(formValues()), []);
  assert.deepEqual(missingFields(formValues(), { requireGroup: true }), ["groupId"]);
  assert.deepEqual(missingFields({ ...formValues(), groupId: "b".repeat(24) }, { requireGroup: true }), []);
  assert.equal(describeFields(["groupId"]), "מועד");
  assert.equal(classifyOutcome(409, { error: "group_full" }), "group_full");
  assert.equal(classifyOutcome(409, { error: "idempotency_conflict" }), "conflict");
});

test("landing: the picker is server-fed — no calendar date anywhere in the markup", () => {
  const markup = withoutCode(landing);
  assert.doesNotMatch(markup, /20\d\d-\d\d-\d\d/);
  assert.doesNotMatch(markup, /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/);
  // The picker's containers are empty and hidden until LIVE answers.
  assert.match(markup, /<div class="picker" id="picker" hidden>/);
  assert.match(markup, /<div class="groups" id="group-cards" role="group" aria-label="בחרו מועד לסדנה"><\/div>/);
  assert.match(markup, /<div class="sched" id="group-schedule" hidden><\/div>/);
  assert.match(markup, /<input type="hidden" name="groupId" id="f-group" value="">/);
  assert.match(markup, /<span class="eyebrow">בחרו מועד לסדנה<\/span>/);
  // The waiting-list sentence is honest about what it holds (Plan B: no payment condition).
  assert.match(markup, /ההרשמה היא לרשימת ההמתנה\. אם יתפנה מקום, עמית יחזור אליכם\./);
  assert.doesNotMatch(markup, /ולאחר תשלום/);
  // Amit's own hours line stays as the fallback, and is replaced from the same GET when it answers.
  assert.match(markup, /id="when-text"><span class="num-ltr">10:00–12:00<\/span>, עשרה מפגשים שבועיים ביוקנעם\./);
});

test("landing: the picker wiring draws from the API, escapes what it prints, and mentions nothing that does not exist yet", () => {
  const code = withoutComments(landing.slice(landing.indexOf('<script type="module">')));
  assert.match(code, /from "\.\/js\/schedule\.js"/);
  assert.match(code, /groups = await fetchGroups\(API_BASE, options\)/);
  assert.match(code, /if \(groups\.length === 0\) return;/);
  assert.match(code, /picker\.hidden = false/);
  assert.match(code, /requireGroup: groups\.length > 0/);
  assert.match(code, /waitlist: waitlistMode/);
  assert.match(code, /case "group_full":/);
  // Server strings reach the page as text; the one that goes into HTML is escaped.
  assert.match(code, /escapeText\(selected\.label\)/);
  assert.doesNotMatch(code, /innerHTML\s*=\s*`?\$\{group/);
  // Increment 1 carries nothing of a parent portal.
  for (const absent of ["portalUrl", "acq_portal", "/workshop/order/", "קישור אישי", "ספירה לאחור"]) {
    assert.equal(landing.includes(absent), false, `the page must not mention ${absent}`);
  }
});

// ---------------------------------------------------------------------------
// Plan B (Oct 2026): group size, price, provisional dates, the price the parent saw
// ---------------------------------------------------------------------------

test("plan B: the group size reads as a range, one number, or nothing at all", () => {
  assert.equal(describeGroupSize(3, 4), "3–4");
  assert.equal(describeGroupSize(3, 3), "3");
  assert.equal(describeGroupSize(null, 4), null);
  assert.equal(describeGroupSize(undefined, undefined), null);
  assert.equal(describeGroupSize(5, 4), null);
});

test("plan B: the price is two equal cheques, written with a thousands comma, or nothing", () => {
  assert.deepEqual(describePrice(260000, 130000), { price: "2,600", cheque: "1,300" });
  assert.equal(describePrice(260000, 120000), null, "cheques that do not add up are not a price");
  assert.equal(describePrice(null, null), null);
});

test("plan B: availability reads the same for a four-seat group", () => {
  assert.equal(describeAvailability(4, 4), "4 מתוך 4 מקומות פנויים");
  assert.equal(describeAvailability(4, 2), "2 מתוך 4 מקומות פנויים");
  assert.equal(describeAvailability(4, 1), "נותר מקום אחד");
  assert.equal(describeAvailability(4, 0), "הקבוצה מלאה");
});

test("plan B: fetchGroups passes provisional, the thresholds, the price and the offer version through — and degrades when they are absent", async () => {
  const sessions = [{ n: 1, date: "2026-11-06", start: "10:00", end: "12:00", note: null }];
  const body = {
    groups: [
      { id: "a".repeat(24), label: "ימי שישי", capacity: 4, available: 2, full: false, locationLabel: null, minRegistrations: 3, reserved: 2, provisional: true, enrolmentOpen: true, priceAgorot: 260000, chequeCount: 2, chequeAmountAgorot: 130000, offerVersion: "0123456789abcdef", sessions },
      { id: "b".repeat(24), label: "ישנה", capacity: 3, available: 3, full: false, locationLabel: null, sessions },
    ],
  };
  const groups = await fetchGroups("https://example.test", { fetchImpl: async () => ({ ok: true, json: async () => body }) });
  assert.deepEqual(
    { provisional: groups[0].provisional, min: groups[0].minRegistrations, price: groups[0].priceAgorot, cheque: groups[0].chequeAmountAgorot, version: groups[0].offerVersion },
    { provisional: true, min: 3, price: 260000, cheque: 130000, version: "0123456789abcdef" },
  );
  assert.deepEqual(
    { provisional: groups[1].provisional, min: groups[1].minRegistrations, price: groups[1].priceAgorot, version: groups[1].offerVersion },
    { provisional: false, min: null, price: null, version: null },
  );
});

test("plan B: the payload carries the offer version only with a group", () => {
  const base = { idempotencyKey: "k-1234567890", visitorId: "v-1234567890", attribution: null };
  const chosen = buildLeadPayload(formValues(), { ...base, groupId: "b".repeat(24), offerVersion: "0123456789abcdef" });
  assert.deepEqual(Object.keys(chosen).sort(), ["consent", "grade", "groupId", "idempotencyKey", "offerVersion", "parentName", "parentPhone", "participantFirstName", "visitorId"].sort());
  assert.equal(chosen.offerVersion, "0123456789abcdef");
  assert.equal("offerVersion" in buildLeadPayload(formValues(), { ...base, offerVersion: "0123456789abcdef" }), false, "no group, no version");
  assert.equal("offerVersion" in buildLeadPayload(formValues(), { ...base, groupId: "b".repeat(24), offerVersion: null }), false, "a legacy group carries none");
});

test("plan B: two new 409s — enrolment closed, and a changed price carrying the current offer", () => {
  assert.equal(classifyOutcome(409, { error: "enrolment_closed" }), "enrolment_closed");
  assert.equal(classifyOutcome(409, { error: "offer_changed", offer: {} }), "offer_changed");
  assert.equal(classifyOutcome(409, { error: "group_full" }), "group_full");
  assert.equal(classifyOutcome(409, { error: "idempotency_conflict" }), "conflict");
  assert.deepEqual(changedOffer({ error: "offer_changed", offer: { priceAgorot: 280000, chequeAmountAgorot: 140000, chequeCount: 2, offerVersion: "fedcba9876543210" } }), {
    priceAgorot: 280000,
    chequeAmountAgorot: 140000,
    chequeCount: 2,
    offerVersion: "fedcba9876543210",
  });
  assert.equal(changedOffer({ error: "offer_changed", offer: { priceAgorot: 280000 } }), null);
  assert.equal(changedOffer(null), null);
});

test("landing plan B: the size wording is neutral until a group says its numbers, and never the old fixed three", () => {
  const markup = withoutCode(landing);
  assert.doesNotMatch(markup, /3 תלמידים בלבד|עד שלושה תלמידים|מוגבל לשלושה תלמידים|<b>3<\/b><span>תלמידים בקבוצה/);
  assert.match(markup, /<span id="size-chip">קבוצות קטנות<\/span>/);
  assert.match(markup, /<b id="size-stat">קטנות<\/b><span id="size-stat-label">קבוצות<\/span>/);
  assert.match(markup, /<p id="size-text">קבוצות קטנות, עם יחס אישי לכל תלמיד\.<\/p>/);
  assert.match(markup, /<span class="limit-pill" id="size-pill">קבוצות קטנות, עם יחס אישי לכל תלמיד<\/span>/);
  // The ten meetings stay as they were.
  assert.match(markup, /<span>10 מפגשים<\/span>/);
  const code = withoutComments(landing.slice(landing.indexOf('<script type="module">')));
  assert.match(code, /describeGroupSize\(lead\.minRegistrations, lead\.capacity\)/);
  assert.match(code, /const lead = groups\[0\] \?\? null;/, "the first open group in card order");
  assert.match(code, /set\("size-text", "קבוצות קטנות של ", " תלמידים, עם יחס אישי לכל תלמיד\."\)/);
  // The range is drawn left to right inside the right-to-left line.
  assert.match(code, /node\.append\(el\("span", "num-ltr", size\)\)/);
});

test("landing plan B: the price block names no number until LIVE answers, then the brief's paragraph", () => {
  const markup = withoutCode(landing);
  assert.match(markup, /<div class="card price" id="price-block">/);
  assert.match(markup, /<p id="price-text">המחיר ותנאי התשלום יוצגו כאן כשתיפתח קבוצה להרשמה\. אפשר גם לשאול את עמית ב-WhatsApp\.<\/p>/);
  assert.doesNotMatch(markup, /₪|2,600|1,300|צ׳קים של/);
  const code = withoutComments(landing.slice(landing.indexOf('<script type="module">')));
  assert.match(code, /10 מפגשים · 20 שעות · \$\{price\.price\} ₪\. התשלום בשני צ׳קים של \$\{price\.cheque\} ₪, למפגש הראשון ולמפגש השישי\./);
  assert.match(code, /ניתן לפרוש לפני המפגש השישי ולקבל את הצ׳ק השני בחזרה, ללא חיוב עבור יתרת המפגשים\./);
});

test("landing plan B: estimated dates are marked and explained; confirmed ones say so", () => {
  const code = withoutComments(landing.slice(landing.indexOf('<script type="module">')));
  assert.match(code, /group\.provisional \? "מועד משוער" : "מועד סופי"/);
  assert.match(code, /מועד הפתיחה משוער\.\$\{forms\} עד לאישור הפתיחה, המועד עשוי להידחות בשבוע\. אין צורך בתשלום בשלב ההרשמה\./);
  assert.match(code, /הקורס מתגבש עם הרשמה של \$\{group\.minRegistrations\} תלמידים לפחות;/);
});

test("landing plan B: the success message says the place is held and nothing is due; closed enrolment and a changed price have their own answers", () => {
  const code = withoutComments(landing.slice(landing.indexOf('<script type="module">')));
  assert.match(code, /המקום שמור לכם, ואין צורך בתשלום בשלב זה/);
  assert.match(code, /case "enrolment_closed":/);
  assert.match(code, /ההרשמה לקבוצה זו נסגרה/);
  assert.match(code, /case "offer_changed":/);
  // The form stays filled, the price is shown again, and only an explicit yes resubmits — under a
  // fresh key, carrying the new version.
  assert.match(code, /changedOffer\(result\.body\)/);
  assert.match(code, /renderPrice\(selected\)/);
  assert.match(code, /selected\.offerVersion = offer\.offerVersion;/);
  assert.match(code, /id="accept-offer"/);
  assert.match(code, /resetKeyState\(keys\);\s*form\.requestSubmit\(\);/);
  assert.match(code, /offerVersion: selected\?\.offerVersion \?\? null/);
  // The price the parent is asked to accept goes into HTML escaped.
  assert.match(code, /escapeText\(price\.price\)/);
});

// ---------------------------------------------------------------------------
// engagement.js — what a visitor did on the page (LIVE AN-20)
// ---------------------------------------------------------------------------

test("engagement: scroll depth is a percentage rounded to 5 and clamped", () => {
  assert.equal(scrollDepth(0, 800, 4000), 20);
  assert.equal(scrollDepth(1100, 800, 4000), 50); // 47.5 → 50
  assert.equal(scrollDepth(1080, 800, 4000), 45); // 47.0 → 45
  assert.equal(scrollDepth(5000, 800, 4000), 100);
  assert.equal(scrollDepth(0, 800, 0), 0);
});

test("engagement: only whitelisted targets are recorded; anything else is dropped", () => {
  const el = (matches) => ({ closest: (selector) => (matches.includes(selector) ? {} : null) });
  assert.equal(targetOf(el(["#preview-link"])), "game-memory");
  assert.equal(targetOf(el(["#game-workshop"])), "game-workshop");
  assert.equal(targetOf(el(["#wa-link"])), "whatsapp");
  assert.equal(targetOf(el([".some-other-link"])), null);
  assert.equal(targetOf(null), null);
  const tracker = createTracker();
  tracker.click(100, "game-rhythm");
  tracker.click(200, "buy-now");
  tracker.click(300, "form-focus");
  tracker.section("projects");
  tracker.section("pricing");
  tracker.section("projects");
  const snap = tracker.snapshot(400, { viewId: "view-12345678", visitorId: "browser-12345678" });
  assert.deepEqual(snap.clicks, [{ target: "game-rhythm", at: 100 }, { target: "form-focus", at: 300 }]);
  assert.deepEqual(snap.sectionsSeen, ["projects"]);
});

test("engagement: active time stops 30 s after the last input; visible time stops when hidden", () => {
  const tracker = createTracker({ visible: true });
  tracker.input(0);
  tracker.scroll(10_000, 40);
  tracker.scroll(10_100, 55); // within 250 ms: depth counts, the scroll count does not
  // Idle from 10.1 s: active until 40.1 s, visible until hidden at 60 s.
  tracker.visibility(60_000, false);
  // Hidden for a minute: neither clock runs.
  tracker.visibility(120_000, true);
  tracker.input(125_000);
  const snap = tracker.snapshot(130_000, { viewId: "view-12345678", visitorId: "browser-12345678" });
  assert.equal(snap.visibleMs, 60_000 + 10_000);
  assert.equal(snap.activeMs, 40_100 + 5_000);
  assert.equal(snap.scrollDepthPct, 55);
  assert.equal(snap.scrollCount, 1);
});

test("engagement: the payload is exactly the eight fields LIVE accepts, with caps", () => {
  const tracker = createTracker();
  for (let i = 0; i < MAX_CLICKS + 10; i += 1) tracker.click(i, "nav-inside");
  for (const id of [...SECTIONS, ...SECTIONS]) tracker.section(id);
  const snap = tracker.snapshot(1_000, { viewId: "view-12345678", visitorId: "browser-12345678" });
  assert.deepEqual(Object.keys(snap).sort(), ["activeMs", "clicks", "scrollCount", "scrollDepthPct", "sectionsSeen", "viewId", "visibleMs", "visitorId"]);
  assert.equal(snap.clicks.length, MAX_CLICKS);
  assert.deepEqual(snap.sectionsSeen, SECTIONS);
  assert.ok(snap.clicks.every((c) => Object.keys(c).join() === "target,at"));
});

test("engagement: sent with sendBeacon as a plain string, keepalive fetch as the fallback, never a throw", () => {
  const sent = [];
  const beacon = { sendBeacon: (url, body) => { sent.push({ url, body }); return true; } };
  assert.equal(sendActivity("http://x/api/acquisition/activity", { a: 1 }, { navigatorImpl: beacon }), "beacon");
  assert.deepEqual(sent, [{ url: "http://x/api/acquisition/activity", body: '{"a":1}' }]);
  let init = null;
  const fetchImpl = (_url, i) => { init = i; return Promise.resolve({}); };
  assert.equal(sendActivity("http://x/a", { a: 1 }, { navigatorImpl: { sendBeacon: () => false }, fetchImpl }), "fetch");
  assert.equal(init.keepalive, true);
  assert.equal(init.headers["content-type"], "text/plain;charset=UTF-8");
  const throwing = { sendBeacon: () => { throw new Error("x"); } };
  assert.equal(sendActivity("http://x/a", {}, { navigatorImpl: throwing, fetchImpl: () => { throw new Error("y"); } }), "none");
});

test("engagement: wired to a fake page, a hidden tab sends the view's state to LIVE", () => {
  const listeners = {};
  const on = (scope) => (type, fn) => {
    const key = scope + ":" + type;
    (listeners[key] ??= []).push(fn);
  };
  let clock = 0;
  const beacons = [];
  const doc = { visibilityState: "visible", documentElement: { scrollHeight: 2000 }, addEventListener: on("doc"), getElementById: () => null };
  const win = {
    scrollY: 0,
    innerHeight: 1000,
    navigator: { sendBeacon: (url, body) => { beacons.push({ url, body: JSON.parse(body) }); return true; } },
    addEventListener: on("win"),
    setTimeout: () => 0,
    performance: { now: () => clock },
  };
  startEngagement({ win, doc, apiBase: "https://live.example", viewId: "view-12345678", visitorId: "browser-12345678", now: () => clock });
  clock = 1_000;
  win.scrollY = 1000;
  listeners["win:scroll"].forEach((fn) => fn());
  clock = 2_000;
  listeners["doc:click"].forEach((fn) => fn({ target: { closest: (s) => (s === "#game-rhythm" ? {} : null) } }));
  clock = 3_000;
  doc.visibilityState = "hidden";
  listeners["doc:visibilitychange"].forEach((fn) => fn());
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].url, "https://live.example/api/acquisition/activity");
  assert.deepEqual(beacons[0].body, {
    viewId: "view-12345678",
    visitorId: "browser-12345678",
    scrollDepthPct: 100,
    scrollCount: 1,
    sectionsSeen: [],
    clicks: [{ target: "game-rhythm", at: 2000 }],
    activeMs: 2000, // no input before the scroll at 1 s: the first second was visible, not active
    visibleMs: 3000,
  });
});

test("engagement: every selector names an element on the landing page, and the second game is #game-workshop", () => {
  assert.match(landing, /<a class="game" id="game-workshop" href="https:\/\/amitdobry\.github\.io\/workshop-game\/"/);
  for (const id of SECTIONS) assert.match(landing, new RegExp('id="' + id + '"'), id);
  for (const [, selector] of TARGETS) {
    const id = /^#([a-z-]+)$/.exec(selector)?.[1];
    if (id) assert.match(landing, new RegExp('id="' + id + '"'), selector);
  }
  assert.match(landing, /class="nav-cta"/);
  assert.match(landing, /id="top"[\s\S]*?class="btn btn-primary"/);
  for (const anchor of ["curriculum", "inside", "projects", "contact"]) assert.match(landing, new RegExp('<a href="#' + anchor + '">'));
});

test("engagement: loaded by a guarded dynamic import, records no form text and stores nothing", () => {
  const script = landing.slice(landing.indexOf('<script type="module">'));
  assert.match(script, /import\("\.\/js\/engagement\.js"\)[\s\S]*?\.catch\(/);
  assert.ok(fs.existsSync(path.join(PUBLIC, "js", "engagement.js")));
  const source = withoutComments(read("js/engagement.js"));
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|\.value\b|textContent|innerText|innerHTML|clientX|clientY|pageX|pageY|screen\.|navigator\.language|document\.referrer/);
});

test("engagement: the visit beacon carries viewId — three fields — and drops a malformed one", async () => {
  let posted = null;
  const okFetch = async (_url, init) => { posted = JSON.parse(init.body); return { status: 202, json: async () => ({ ok: true }) }; };
  await sendVisit("http://x", "v-1234567890", { kind: "ref", code: "LEAF5" }, { fetchImpl: okFetch, viewId: "view-1234567890" });
  assert.deepEqual(posted, { visitorId: "v-1234567890", viewId: "view-1234567890", ref: "LEAF5" });
  await sendVisit("http://x", "v-1234567890", null, { fetchImpl: okFetch, viewId: "<bad>" });
  assert.deepEqual(posted, { visitorId: "v-1234567890" });
});

test("engagement: the whitelist mirrors LIVE's (skipped when LIVE is not checked out beside this repo)", (t) => {
  const live = path.join(ROOT, "..", "Live", "src", "acquisition", "constants.ts");
  if (!fs.existsSync(live)) return t.skip("LIVE not found at ../Live");
  const source = fs.readFileSync(live, "utf8");
  const list = (name) => {
    const block = new RegExp("export const " + name + " = \\[([\\s\\S]*?)\\] as const").exec(source)?.[1] ?? "";
    return [...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  };
  if (list("ENGAGEMENT_SECTIONS").length === 0) return t.skip("this LIVE checkout predates engagement");
  assert.deepEqual(SECTIONS, list("ENGAGEMENT_SECTIONS"));
  assert.deepEqual([...TARGET_NAMES].sort(), list("ENGAGEMENT_CLICK_TARGETS").sort());
});
