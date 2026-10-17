# JournalTime — notes

> Offloaded from the root `CLAUDE.md` (project #5) to keep that index lean. Canonical detailed reference — read before editing; when these notes and the code conflict, trust the code and update these notes.

## journaltime/ — Research Writing Workspace
Single-file `index.html` + Vercel AI fns. The suite's **write** step. Four surfaces: **Research Compass** (AI gap finder) · **Article Developer** (AI full-draft) · **Journal Studio** ("Write for this journal" 5-step flow via RF `/api/generate`) · **Journal Formatter** (`formatter.js`): .docx/paste → submission `.docx` or 2-col preview; **deterministic, NO AI** — body verbatim, refs restyled ONLY via strict-gated Crossref match (unresolved kept verbatim+⚠), publisher→family map labelled "house default — verify"; mammoth+docx lazy CDN; smokes `_jtfmt{,_live}.mjs`.
- **Reeds hero "Your field"** (2026-10-16): select mirrored with the Compass field picker; dims other fields + computed range/median/fastest publisher-stated Q1 readout.
- **Draft analytics strip (2026-07-19):** Article Developer papers carry a deterministic on-device panel (Flesch + sentence-length histogram + regex passive-voice % + section word-balance) — no AI, in `renderArticlePaper`.
- `data.js` (1,805 Scopus journals after the 2026-10-17 de-dup — `scripts/dedupe-journals.mjs`: one record per name, conflicting turnarounds → `estimated`, other disagreements verbatim in `conflicts{}`, extra fields in `also[]` (filters honour it) — + `__JOURNAL_META__`) feeds all four surfaces' journal pickers. `api/compass.js`/`api/draft.js` → Claude/Groq (60s max). **Sync: `data.js` duplicated in `scholarscope/journals.js` — update both.** Journal-finder moved to ScholarScope (merge #2); hero/nav → "Where to publish ↗".
- Inbound hashes: `#tools=` (ToolsScope→`applyToolsScopePayload`), `#pack=` (`applyResearchPack`), `#topic=` (hub); "↺ Needs revision" → `researchflow#revise=`.
- GitHub Pages (static) + Vercel (AI host `journaltime-khaki`, called cross-origin) → syahmedu.github.io/journaltime
