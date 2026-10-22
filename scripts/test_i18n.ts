// Node built-ins without @types/node (the app's tsconfig has no Node types)
declare const require: (id: string) => any;
declare const __dirname: string;
const { readdirSync, readFileSync, statSync } = require('fs');
const { join, relative } = require('path');

import { fr } from '../i18n/fr';
import { ht } from '../i18n/ht';
import { htPhrases } from '../i18n/ht.phrases';

console.log('==================================================');
console.log('TEST SUITE: I18N (FRANÇAIS / KREYÒL)');
console.log('==================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${name}`);
    failed++;
  }
}

const root = join(__dirname, '..');
const SKIP = ['app/design-system.tsx'];

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

const unescape = (s: string) => s.replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1');
const placeholders = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');

// 1. Every t('…') in the UI has a Kreyòl translation
const files = [...walk(join(root, 'app')), ...walk(join(root, 'components')), join(root, 'context', 'AuthContext.tsx')].filter(
  (f) => !SKIP.includes(relative(root, f).replace(/\\/g, '/'))
);
const used = new Map<string, string>();
const files_: string[] = files;
for (const file of files_) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    used.set(unescape(m[1] ?? m[2]), relative(root, file));
  }
}
const missing = [...used.keys()].filter((k) => !(k in fr) && !(k in htPhrases));
missing.forEach((k) => console.error(`   missing: "${k}" (${used.get(k)})`));
if (missing.length && process.env.I18N_DUMP) require('fs').writeFileSync(process.env.I18N_DUMP, JSON.stringify(missing, null, 1));
assert(used.size > 500, `UI texts go through t() (${used.size} distinct)`);
assert(missing.length === 0, `Every UI text has a Kreyòl translation (${missing.length} missing)`);

// 2. Structural ids exist in both languages
const missingIds = (Object.keys(fr) as (keyof typeof fr)[]).filter((k) => !ht[k]);
assert(missingIds.length === 0, `Every structural id has a Kreyòl label (${missingIds.length} missing)`);

// 3. Translations keep every placeholder they need
const broken = Object.entries(htPhrases).filter(([fr_, ht_]) => {
  const need = new Set(placeholders(ht_).split(',').filter(Boolean));
  const have = new Set(placeholders(fr_).split(',').filter(Boolean));
  return [...need].some((p) => !have.has(p));
});
broken.forEach(([k]) => console.error(`   bad placeholder: "${k}"`));
assert(broken.length === 0, 'No translation uses a placeholder the French text does not provide');

// 4. Kreyòl text actually differs for real sentences (not left in French by mistake)
const sentences = Object.entries(htPhrases).filter(([k]) => (k.match(/[a-zà-ÿ]{2,}/g) || []).length >= 4);
const untouched = sentences.filter(([k, v]) => k === v);
untouched.forEach(([k]) => console.error(`   untranslated: "${k}"`));
assert(untouched.length === 0, `Sentences are translated (${sentences.length} checked)`);

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');
process.exit(failed > 0 ? 1 : 0);
