// Merge duplicate journal records in data.js (one record per journal name). No value is invented:
//  · keep the copy with the strongest source label (publisher > community > estimated); ties → lowest id (original entry)
//  · if the copies disagree on first_decision or time_to_acceptance, the kept turnaround is no longer "publisher-stated"
//    (two different publisher figures cannot both be right) → source becomes 'estimated'
//  · every other disagreement is recorded verbatim in `conflicts: { field: [values…] }`
//  · other fields the journal was listed under go to `also: [...]`; __JOURNAL_META__ of dropped ids moves to the kept id
// Run: node scripts/dedupe-journals.mjs [--dry]   → rewrites data.js (and prints a report)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'data.js');
const src = readFileSync(file, 'utf8');
const ctx = { window: {} }; vm.runInNewContext(src, ctx);
const J = ctx.window.__JOURNAL_DATA__, META = ctx.window.__JOURNAL_META__ || {};
const RANK = { publisher: 0, community: 1, estimated: 2 };
const norm = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const groups = new Map();
for (const j of J) { const k = norm(j.name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(j); }

const keep = new Map(), drop = new Set(), metaMoves = [];
let downgraded = 0, withConflicts = 0, merged = 0;
for (const g of groups.values()) {
  if (g.length < 2) continue;
  merged++;
  const best = [...g].sort((a, b) => (RANK[a.source] ?? 3) - (RANK[b.source] ?? 3) || a.id - b.id)[0];
  const rec = { ...best };
  const conflicts = {};
  for (const k of ['publisher', 'quartile', 'impact_factor', 'open_access', 'first_decision', 'time_to_acceptance', 'acceptance_rate']) {
    const vals = [...new Set(g.map((x) => JSON.stringify(x[k])))].map((v) => JSON.parse(v));
    if (vals.length > 1) conflicts[k] = vals;
  }
  if ((conflicts.first_decision || conflicts.time_to_acceptance) && rec.source !== 'estimated') { rec.source = 'estimated'; downgraded++; }
  if (Object.keys(conflicts).length) { rec.conflicts = conflicts; withConflicts++; }
  const also = [...new Set(g.map((x) => x.field))].filter((f) => f !== rec.field);
  if (also.length) rec.also = also;
  keep.set(best.id, rec);
  for (const x of g) if (x.id !== best.id) {
    drop.add(x.id);
    if (META[x.id] && !META[best.id]) metaMoves.push([x.id, best.id]);
  }
}

const lit = (v) => (typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(lit).join(', ') + ']' : v && typeof v === 'object' ? '{ ' + Object.entries(v).map(([k, x]) => `${k}:${lit(x)}`).join(', ') + ' }' : String(v));
const line = (r) => `  { ${Object.entries(r).map(([k, v]) => `${k}:${lit(v)}`).join(', ')} },`;

let out = src.split('\n').filter((l) => {
  const m = l.match(/^\s*\{\s*id:(\d+),/); return !(m && drop.has(+m[1]));
}).map((l) => {
  const m = l.match(/^\s*\{\s*id:(\d+),/); return m && keep.has(+m[1]) ? line(keep.get(+m[1])) : l;
}).join('\n');
for (const [from, to] of metaMoves) out = out.replace(new RegExp(`^(\\s*)${from}:\\{`, 'm'), `$1${to}:{`);

console.log({ groups: merged, rowsRemoved: drop.size, sourceDowngraded: downgraded, withConflicts, metaMoved: metaMoves.length, before: J.length, after: J.length - drop.size });
if (!process.argv.includes('--dry')) writeFileSync(file, out);
