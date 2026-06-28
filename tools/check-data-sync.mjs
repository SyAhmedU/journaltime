// Drift guard for the duplicated journal catalogue.
//
// `data.js` here is a VERBATIM copy of `scholarscope/journals.js` (1,959 Scopus
// journals + __JOURNAL_META__). The two live in separate repos with separate
// deploys, so neither one's CI can check the other — this script compares them
// when both repos are checked out side by side (the normal local dev layout
// under the home directory). Run it before committing a change to either file.
//
//   node tools/check-data-sync.mjs
//
// Exits 0 if identical (or if the sibling repo isn't present — can't check),
// 1 on drift. NO-FABRICATION: never edits either file, only compares.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HERE = path.resolve(__dirname, '..', 'data.js');
const SIBLING = path.resolve(__dirname, '..', '..', 'scholarscope', 'journals.js');

if (!fs.existsSync(SIBLING)) {
  console.log(`[data-sync] scholarscope not found at ${SIBLING} — skipping (needs both repos side by side).`);
  process.exit(0);
}

const a = fs.readFileSync(HERE);
const b = fs.readFileSync(SIBLING);

if (a.equals(b)) {
  console.log(`[data-sync] in sync — data.js ≡ scholarscope/journals.js (${a.length} bytes).`);
  process.exit(0);
}

console.error('[data-sync] DRIFT — journaltime/data.js and scholarscope/journals.js differ.');
console.error(`  journaltime/data.js        ${a.length} bytes`);
console.error(`  scholarscope/journals.js   ${b.length} bytes`);
console.error('  These must stay verbatim-identical. Copy the updated file over the stale one.');
process.exit(1);
