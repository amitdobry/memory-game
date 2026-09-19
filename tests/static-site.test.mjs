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
} from "../public/js/acquisition.js";
import { CONTRACT_VERSION } from "../public/js/contract.js";
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
