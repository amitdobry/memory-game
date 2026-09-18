// ---------------------------------------------------------------------------
// Which leaflet brought this visitor?  (browser side only)
//
// Two spellings arrive in the URL:
//
//   ?b=3          the six printed leaflet batches from the first run, 1–6
//   ?ref=Y7K2     a referral code — the durable form every batch will have once the
//                 server owns batch records
//
// Both are accepted, validated strictly (a mangled scan becomes "no leaflet", never
// nonsense), remembered in localStorage so a parent who scans on Sunday and writes
// on Wednesday is still credited, and turned into one short Hebrew marker that rides
// along in the WhatsApp message. The server side of attribution does not exist yet;
// nothing here pretends it does.
//
// Pure functions, no DOM. `tests/static-site.test.mjs` runs them under Node.
// ---------------------------------------------------------------------------

export const LEGACY_BATCH = /^[1-6]$/;
export const REF_CODE = /^[A-Za-z0-9]{3,12}$/;
export const STORAGE_KEY = "leaflet_attribution";

/**
 * Read the attribution out of a query string.
 * @param {string} search  `location.search`, with or without the leading "?"
 * @returns {{kind:"ref", code:string} | {kind:"batch", number:string} | null}
 */
export function parseAttribution(search) {
  const params = new URLSearchParams(search ?? "");

  const ref = (params.get("ref") ?? "").trim();
  if (REF_CODE.test(ref)) return { kind: "ref", code: ref.toUpperCase() };

  const b = (params.get("b") ?? "").trim();
  if (LEGACY_BATCH.test(b)) return { kind: "batch", number: b };

  return null;
}

/** The parenthesised marker appended to the WhatsApp text. Empty when there is none. */
export function markerFor(attribution) {
  if (!attribution) return "";
  if (attribution.kind === "batch") return ` (מעלון ${attribution.number})`;
  if (attribution.kind === "ref") return ` (קוד ${attribution.code})`;
  return "";
}

/** A human label: "עלון 3", "קוד Y7K2", or "ישירות לאתר". */
export function describeAttribution(attribution) {
  if (!attribution) return "ישירות לאתר";
  if (attribution.kind === "batch") return `עלון ${attribution.number}`;
  if (attribution.kind === "ref") return `קוד ${attribution.code}`;
  return "ישירות לאתר";
}

/**
 * Remember an attribution. `storage` is anything with getItem/setItem — localStorage,
 * or a Map-backed stand-in in tests. Failures (private browsing, blocked storage) are
 * swallowed: attribution is a convenience, never something the page depends on.
 */
export function rememberAttribution(attribution, storage) {
  if (!attribution || !storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    /* per-visit only, then */
  }
}

/** Read a remembered attribution back, re-validating it. Anything odd → null. */
export function recallAttribution(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.kind === "batch" && LEGACY_BATCH.test(String(parsed.number))) {
      return { kind: "batch", number: String(parsed.number) };
    }
    if (parsed?.kind === "ref" && REF_CODE.test(String(parsed.code))) {
      return { kind: "ref", code: String(parsed.code).toUpperCase() };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The one call the page makes: what is in the URL wins and is remembered; otherwise
 * whatever was remembered earlier; otherwise nothing.
 *
 * This is deliberately last-touch: a new scan replaces the old memory. First-touch
 * bookkeeping belongs to the server once it exists, where both can be kept.
 */
export function resolveAttribution(search, storage) {
  const fromUrl = parseAttribution(search);
  if (fromUrl) {
    rememberAttribution(fromUrl, storage);
    return fromUrl;
  }
  return recallAttribution(storage);
}

/**
 * The WhatsApp deep link. `extra` is appended after a blank line — used by the
 * composer to carry what the parent typed.
 */
export function whatsappLink(number, attribution, extra) {
  let text = "שלום עמית, אשמח לקבל פרטים על סדנת ה-AI" + markerFor(attribution);
  if (extra) text += "\n\n" + extra;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
