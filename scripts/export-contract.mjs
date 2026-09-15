// ---------------------------------------------------------------------------
// Ship the field contract to the server that holds the API key.
//
// The problem this solves: the browser owns `public/js/schema.js`, but the server
// that talks to Claude has to know the same field list — it builds the prompt from
// it and clamps the answer against it. Two hand-maintained copies of that list is a
// drift bug waiting to happen, and the symptom would be ugly: the AI confidently
// setting a field the game no longer has.
//
// So there is exactly one author (schema.js) and this script emits the other copy,
// stamped with a hash. The browser sends that hash on every request; the server
// compares it to its own and says so when they differ. Drift becomes a message
// rather than a mystery.
//
//   node scripts/export-contract.mjs ../Live/src/workshop/contract.ts
//
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FIELDS, STARTER_CONFIG, CARD_SETS, THEME_CARD_SET } from "../public/js/schema.js";

const target = process.argv[2] ?? "C:/Users/Admin/Live/src/workshop/contract.ts";

// Only the parts the server actually reasons about. UI-only metadata (groups,
// control hints) is deliberately excluded so that restyling the control panel
// does not invalidate the contract and force a redeploy of the other repo.
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
  .update(JSON.stringify({ fields, starter: STARTER_CONFIG, themes: THEME_CARD_SET }))
  .digest("hex")
  .slice(0, 12);

const cardSets = Object.fromEntries(
  Object.entries(CARD_SETS).map(([key, set]) => [
    key,
    { label: set.label, symbolCount: set.symbols?.length ?? null },
  ]),
);

const banner = `// GENERATED FILE — do not edit by hand.
//
// Emitted by the memory-game workshop repo:
//     node scripts/export-contract.mjs ${target}
//
// The authoritative field list lives in that repo's public/js/schema.js. Editing
// this file instead makes the two disagree, which is the exact failure the
// generation step exists to prevent.
//
// Contract ${version}
`;

const body = `${banner}
export const CONTRACT_VERSION = ${JSON.stringify(version)};

export interface FieldOption {
  readonly value: string;
  readonly label: string;
}

export interface Field {
  readonly key: string;
  readonly type: 'int' | 'bool' | 'enum' | 'string' | 'list';
  readonly label: string;
  readonly help: string;
  readonly min?: number;
  readonly max?: number;
  readonly maxLength?: number;
  readonly maxItems?: number;
  readonly options?: readonly FieldOption[];
}

export const FIELDS: readonly Field[] = ${JSON.stringify(fields, null, 2)} as const;

/** The game every child starts from. Also the fallback when a request is unusable. */
export const STARTER_CONFIG = ${JSON.stringify(STARTER_CONFIG, null, 2)} as const;

/**
 * How many distinct pictures each card set offers. The avatar set has fewer than a
 * full 8x8 board needs, and the prompt says so — otherwise the model promises a
 * board size the game then has to silently shrink.
 */
export const CARD_SETS: Readonly<Record<string, { label: string; symbolCount: number | null }>> =
  ${JSON.stringify(cardSets, null, 2)};

/**
 * What a child means by naming a world rather than a setting: the colours AND the
 * cards. Data, so that adding a theme cannot silently forget to add its cards.
 * null means the theme has no natural card set and the cards are left alone.
 */
export const THEME_CARD_SET: Readonly<Record<string, string | null>> = ${JSON.stringify(THEME_CARD_SET, null, 2)};

export const AVATAR_COUNT = ${
  (await fs.readFile(new URL("../public/avatars/manifest.json", import.meta.url), "utf8").then(
    (t) => JSON.parse(t).length,
  ))
};
`;

await fs.mkdir(path.dirname(target), { recursive: true });
await fs.writeFile(target, body);

// The browser needs the same stamp so it can tell the server which contract it was
// built against. Generated from the same run, so the two can never disagree about
// what they were generated from.
const clientStamp = new URL("../public/js/contract.js", import.meta.url);
await fs.writeFile(
  clientStamp,
  `// GENERATED — see scripts/export-contract.mjs. Do not edit.
//
// A stamp of the field list in schema.js, sent with every AI request so the server
// can say when one of the two sides is stale instead of quietly misbehaving.
export const CONTRACT_VERSION = ${JSON.stringify(version)};
`,
);

console.log(`contract ${version} -> ${target}`);
console.log(`contract ${version} -> public/js/contract.js`);
console.log(`${fields.length} fields, ${Object.keys(cardSets).length} card sets`);
