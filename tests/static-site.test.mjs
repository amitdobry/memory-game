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
import { CONTRACT_VERSION } from "../public/js/contract.js";
import { FIELDS, STARTER_CONFIG, THEME_CARD_SET, FIREKEEPER_FACES } from "../public/js/schema.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), "utf8");

const landing = read("index.html");
const picker = read("workshop.html");
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
  assert.match(landing, /0546 111 602/);
});

test("index.html has no third-party form destination and no analytics", () => {
  assert.doesNotMatch(landing, /formspree/i);
  assert.doesNotMatch(landing, /_subject/);
  assert.doesNotMatch(landing, /FORM_ENDPOINT/);
  assert.doesNotMatch(landing, /<form[^>]*\saction=/i);
  assert.doesNotMatch(landing, /googletagmanager|gtag\(/);
});

test("index.html never claims details were saved or sent by the page", () => {
  assert.doesNotMatch(landing, /הפרטים נשלחו/);
  assert.doesNotMatch(landing, /נשמרו/);
  assert.match(landing, /שליחת ההודעה מתבצעת ב-WhatsApp/);
});

test("index.html keeps the honesty boundary around the AI demo", () => {
  // The public 50-edit grant does not exist yet; the page must not offer it.
  assert.doesNotMatch(landing, /50 (בקשות|שינויים|עריכות)/);
  assert.match(landing, /את השינויים בעזרת ה-AI עושים המשתתפים בסדנה עצמה/);
});

test("index.html carries the two required hero lines", () => {
  assert.match(landing, /10 מפגשים<\/span><span>3 תלמידים בלבד<\/span><span>ימי שישי/);
  assert.match(landing, /ה-AI כותב הרבה מהקוד\. המשתתפים מחליטים, בודקים ומסבירים — וזה החלק החשוב\./);
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

test("workshop.html is the picker and still offers the three children", () => {
  assert.match(picker, /import \{ USERS \} from ".\/js\/users.js"/);
  assert.match(picker, /build\.html\?u=/);
  const children = USERS.filter((u) => !u.isInstructor);
  assert.equal(children.length, 3);
  assert.ok(USERS.some((u) => u.isInstructor), "the instructor entry is still there");
});

test("no page or script in public/ still sends anyone to index.html as the picker", () => {
  const files = fs.readdirSync(path.join(PUBLIC, "js")).map((f) => path.join("js", f))
    .concat(["workshop.html", "build.html", "play.html"]);
  for (const rel of files) {
    assert.equal(withoutComments(read(rel)).includes("index.html"), false, `${rel} still references index.html`);
  }
  assert.match(read("js/build.js"), /location\.replace\("workshop\.html"\)/);
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
