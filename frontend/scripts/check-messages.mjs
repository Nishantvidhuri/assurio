/**
 * Fails if the message catalogs drift apart.
 *
 * next-intl renders a missing key as the key path itself — "common.continue"
 * appears verbatim on the page rather than falling back to English. That is
 * silent in review and obvious to a user, which is the wrong way round, so it
 * is checked mechanically instead.
 *
 * Run: npm run check:messages
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../messages/', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const load = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );

// Placeholders must match too: a translation that drops {client} renders a
// sentence with a hole in it, which no key check would catch.
const placeholders = (obj) => {
  const out = new Map();
  const walk = (o, prefix = '') => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object') walk(v, `${prefix}${k}.`);
      else
        out.set(
          `${prefix}${k}`,
          [...String(v).matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(','),
        );
    }
  };
  walk(obj);
  return out;
};

const base = load('en.json');
const baseKeys = new Set(flatten(base));
const basePh = placeholders(base);
let failed = 0;

for (const f of files) {
  if (f === 'en.json') continue;
  const data = load(f);
  const keys = new Set(flatten(data));
  const ph = placeholders(data);

  const missing = [...baseKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !baseKeys.has(k));
  const mismatched = [...baseKeys]
    .filter((k) => keys.has(k) && basePh.get(k) !== ph.get(k))
    .map((k) => `${k} (en: {${basePh.get(k)}} vs {${ph.get(k)}})`);

  for (const [label, list] of [
    ['missing', missing],
    ['unknown', extra],
    ['placeholder mismatch', mismatched],
  ]) {
    if (list.length) {
      failed++;
      console.error(`${f}: ${list.length} ${label}`);
      list.slice(0, 20).forEach((k) => console.error(`   ${k}`));
    }
  }
}

if (failed) {
  console.error('\nCatalogs are out of sync.');
  process.exit(1);
}
console.log(`✓ ${files.length} catalogs in sync · ${baseKeys.size} keys each`);
