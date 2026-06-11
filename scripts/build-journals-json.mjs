// Build a compact CORS JSON snapshot of the journal catalogue for other suite
// tools to ground on (same pattern as theoryscope/data/theories.json and
// scalescope/data/scales.json). Source of truth stays data.js (≡ scholarscope/
// journals.js — keep in sync); re-run this after editing data.js:
//   node scripts/build-journals-json.mjs
// Output: data/journals.json — every record verbatim from the hand-maintained
// catalogue, nothing invented; `source` provenance carried through.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'data.js'), 'utf8')

// data.js assigns onto window — evaluate it with a stub window
const window = {}
new Function('window', src)(window)
const data = window.__JOURNAL_DATA__
const meta = window.__JOURNAL_META__ || {}
if (!Array.isArray(data) || !data.length) throw new Error('No __JOURNAL_DATA__ found in data.js')

const journals = data.map((j) => {
  const m = meta[j.id]
  return {
    id: j.id,
    name: j.name,
    publisher: j.publisher,
    field: j.field,
    quartile: j.quartile,
    impactFactor: j.impact_factor,
    openAccess: !!j.open_access,
    firstDecisionDays: j.first_decision,
    timeToAcceptanceDays: j.time_to_acceptance,
    acceptanceRate: j.acceptance_rate,
    source: j.source, // 'publisher' = stated by publisher · 'estimated' = never measured
    ...(m?.keywords?.length ? { keywords: m.keywords } : {}),
    ...(m?.themes?.length ? { themes: m.themes } : {}),
  }
})

mkdirSync(join(root, 'data'), { recursive: true })
writeFileSync(join(root, 'data', 'journals.json'), JSON.stringify({ count: journals.length, journals }))
console.log(`data/journals.json — ${journals.length} journals (${journals.filter((j) => j.keywords).length} with keywords/themes)`)
