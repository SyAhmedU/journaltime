/* ════════════════════════════════════════════════════════════════════════
   JOURNAL FORMATTER — upload/paste a manuscript → journal-formatted output.
   Deterministic by design (NO AI, NO fabrication):
   - the body text is NEVER rewritten — structure + typography only;
   - references are restyled ONLY when resolved to a real Crossref record
     behind a strict verification gate (title-token containment + year +
     first-author match); anything unresolved passes through VERBATIM
     and is flagged ⚠ for the author to restyle by hand;
   - in-text citations are left exactly as written;
   - publisher-family layouts are house DEFAULTS, labelled as such — the
     UI always tells the user to verify against the journal's guide.
   Loaded after data.js (needs window.__JOURNAL_DATA__).
   ════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ── Publisher families (house-style defaults) ──────────────────────────── */
const FAMILIES = {
  apa:       { key: 'apa',       label: 'APA 7 manuscript',     refStyle: 'apa',
               note: 'APA 7th-edition professional manuscript defaults (double-spaced, title page, 250-word abstract guideline, hanging-indent references).' },
  elsevier:  { key: 'elsevier',  label: 'Elsevier',             refStyle: 'apa',
               note: 'Most Elsevier journals accept format-free first submissions ("Your Paper Your Way"); APA author–date shown is the common social-science default.' },
  springer:  { key: 'springer',  label: 'Springer Nature',      refStyle: 'apa',
               note: 'Springer social-science house default (author–date). Nature-portfolio titles use numbered references — pick "Numbered (Vancouver)" for those.' },
  tandf:     { key: 'tandf',     label: 'Taylor & Francis',     refStyle: 'apa',
               note: 'Taylor & Francis Standard APA (the default for most T&F social-science journals).' },
  sage:      { key: 'sage',      label: 'Sage',                 refStyle: 'apa',
               note: 'Sage APA house default (some Sage titles use Sage Harvard — check the journal page).' },
  wiley:     { key: 'wiley',     label: 'Wiley',                refStyle: 'apa',
               note: 'Wiley social-science house default (APA author–date).' },
  emerald:   { key: 'emerald',   label: 'Emerald',              refStyle: 'emerald',
               note: 'Emerald Harvard author–date ("Surname, F. (Year), “Title”, Journal, Vol. X No. Y, pp. A–B").' },
  vancouver: { key: 'vancouver', label: 'Numbered (Vancouver)', refStyle: 'vancouver',
               note: 'Numbered reference list in manuscript order. In-text markers are NOT renumbered — verify them yourself.' },
};

function familyForPublisher(pub) {
  const p = String(pub || '').toLowerCase();
  if (/elsevier|cell press/.test(p)) return FAMILIES.elsevier;
  if (/springer|nature|biomed central|palgrave/.test(p)) return FAMILIES.springer;
  if (/taylor|francis|routledge|f1000/.test(p)) return FAMILIES.tandf;
  if (/\bsage\b/.test(p)) return FAMILIES.sage;
  if (/emerald/.test(p)) return FAMILIES.emerald;
  if (/wiley|blackwell/.test(p)) return FAMILIES.wiley;
  if (/american psychological/.test(p)) return FAMILIES.apa;
  if (/american medical|massachusetts medical|bmj|lippincott/.test(p)) return FAMILIES.vancouver;
  return FAMILIES.apa;
}

/* ── Lazy CDN loaders ───────────────────────────────────────────────────── */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('load failed: ' + src));
    document.head.appendChild(s);
  });
}
let _mammoth = null;
async function getMammoth() {
  if (_mammoth) return _mammoth;
  if (!window.mammoth) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js');
  _mammoth = window.mammoth; return _mammoth;
}
let _docx = null;
async function getDocx() {
  if (_docx) return _docx;
  if (!window.docx) {
    try { await loadScript('https://unpkg.com/docx@8.5.0/build/index.umd.js'); }
    catch { await loadScript('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js'); }
  }
  _docx = window.docx; return _docx;
}

/* ── Manuscript parsing ─────────────────────────────────────────────────── */
const KNOWN_HEADINGS = /^(abstract|key\s*words?|introduction|background|literature(\s+review)?|theor(y|etical)\s*(framework|background)?|hypothes[ie]s(\s+development)?|conceptual\s+(framework|model)|methods?|methodology|research\s+(methods?|design)|materials\s+and\s+methods|measures?|instruments?|participants?|sample|procedure|data\s+(collection|analysis)|analysis|results?|findings?|discussion|general\s+discussion|implications?|theoretical\s+implications|practical\s+implications|limitations?(\s+and\s+future\s+(research|directions))?|future\s+(research|directions)|conclusions?|acknowledg(e)?ments?|funding|references?|bibliography|works\s+cited|appendix(\s+[a-z])?)\b/i;
const REFS_HEADING = /^(references?|bibliography|works\s+cited)\s*$/i;

function looksLikeHeading(text) {
  const t = text.trim();
  if (!t || t.length > 90) return false;
  if (/^#{1,4}\s+/.test(t)) return true;
  if (/^\d+(\.\d+)*\.?\s+\S/.test(t) && t.length < 80 && !/[.!?]$/.test(t)) return true;
  if (KNOWN_HEADINGS.test(t) && t.split(/\s+/).length <= 8 && !/[.!?:]$/.test(t)) return true;
  if (t === t.toUpperCase() && /[A-Z]{3}/.test(t) && t.split(/\s+/).length <= 8) return true;
  return false;
}
const cleanHeading = t => t.trim().replace(/^#{1,4}\s+/, '').replace(/\s+$/, '');

function looksLikeAuthorLine(text) {
  const t = text.trim();
  if (!t || t.length > 180) return false;
  if (KNOWN_HEADINGS.test(t)) return false;
  if (!/^[A-Z]/.test(t)) return false;
  if (/[.!?]$/.test(t) && !/\b[A-Z]\.$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 16) return false;
  return /,|\band\b|&/.test(t) || (words.length <= 6 && words.every(w => /^[A-Z][\w.\-']*,?$/.test(w)));
}

// Plain text / markdown → blocks
function blocksFromText(text) {
  const paras = text.replace(/\r/g, '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const blocks = [];
  for (const p of paras) {
    const lines = p.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every(l => looksLikeHeading(l) || l.length < 90)) {
      // a run of short lines: treat each separately (title/author/heading territory)
      for (const l of lines) blocks.push({ kind: looksLikeHeading(l) ? 'h' : 'p', text: cleanHeading(l), raw: l });
    } else if (lines.length === 1 && looksLikeHeading(lines[0])) {
      blocks.push({ kind: 'h', text: cleanHeading(lines[0]), raw: lines[0] });
    } else {
      blocks.push({ kind: 'p', text: lines.join(' '), raw: p, lines });
    }
  }
  return blocks;
}

// mammoth HTML → blocks
function blocksFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = [];
  let tables = 0;
  doc.body.querySelectorAll(':scope > *').forEach(el => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (/^h[1-6]$/.test(tag)) { blocks.push({ kind: 'h', text, raw: text }); return; }
    if (tag === 'table') { tables++; return; }
    if (tag === 'ol' || tag === 'ul') {
      el.querySelectorAll('li').forEach(li => {
        const t = (li.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) blocks.push({ kind: 'p', text: t, raw: t });
      });
      return;
    }
    // mammoth renders unstyled bold headings as <p><strong>…</strong></p>
    const strong = el.querySelector(':scope > strong, :scope > b');
    if (strong && strong.textContent.trim() === text && text.length < 90) {
      blocks.push({ kind: 'h', text, raw: text }); return;
    }
    blocks.push({ kind: looksLikeHeading(text) ? 'h' : 'p', text: looksLikeHeading(text) ? cleanHeading(text) : text, raw: text });
  });
  return { blocks, tables };
}

// One ref entry per line/paragraph; merge wrapped continuation lines.
function splitRefEntries(parts) {
  const NEW_ENTRY = /^(\[?\d{1,3}[\].)]\s+|[A-Z][\w'’\-]+,\s|[A-Z][\w'’\-]+,?\s+[A-Z]\.|Anonymous|[A-Z][\w'’\-]+\s+[A-Z][\w'’\-]+,)/;
  const out = [];
  for (const part of parts) {
    const lines = String(part).split('\n').map(l => l.trim()).filter(Boolean);
    for (const l of lines) {
      if (out.length && !NEW_ENTRY.test(l)) out[out.length - 1] += ' ' + l;
      else out.push(l.replace(/^\[?\d{1,3}[\].)]\s+/, ''));
    }
  }
  return out.filter(r => r.length > 20);
}

function parseManuscript(blocks) {
  const ms = { title: '', authors: '', affiliations: '', abstract: '', keywords: '', sections: [], refs: [], warnings: [] };
  let i = 0;
  // Title = first block (heading or first short paragraph)
  if (blocks.length) { ms.title = blocks[0].text; i = 1; }
  // Author line + affiliation lines until Abstract / first real heading
  if (i < blocks.length && blocks[i].kind === 'p' && looksLikeAuthorLine(blocks[i].text)) {
    ms.authors = blocks[i].text; i++;
    const aff = [];
    while (i < blocks.length && blocks[i].kind === 'p' && blocks[i].text.length < 160 && !/^abstract/i.test(blocks[i].text)) {
      aff.push(blocks[i].text); i++;
      if (aff.length >= 4) break;
    }
    ms.affiliations = aff.join('\n');
  }
  let cur = null; let inAbstract = false; let inRefs = false;
  const refParts = [];
  for (; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'h') {
      const h = b.text;
      if (/^abstract\s*$/i.test(h)) { inAbstract = true; inRefs = false; cur = null; continue; }
      if (/^key\s*words?\b/i.test(h)) {
        const m = h.match(/^key\s*words?\s*[:—–-]?\s*(.*)/i);
        if (m && m[1]) ms.keywords = m[1].trim();
        inAbstract = false; continue;
      }
      if (REFS_HEADING.test(h)) { inRefs = true; inAbstract = false; cur = null; continue; }
      inAbstract = false; inRefs = false;
      cur = { heading: h, paras: [] };
      ms.sections.push(cur);
      continue;
    }
    const t = b.text;
    if (inRefs) { refParts.push(b.raw || t); continue; }
    const kw = t.match(/^key\s*words?\s*[:—–-]\s*(.+)/i);
    if (kw) { ms.keywords = kw[1].trim(); continue; }
    const ab = t.match(/^abstract\s*[:—–-]\s*(.+)/i);
    if (ab) { ms.abstract = (ms.abstract ? ms.abstract + ' ' : '') + ab[1].trim(); continue; }
    if (inAbstract) { ms.abstract = (ms.abstract ? ms.abstract + ' ' : '') + t; continue; }
    if (!cur) { cur = { heading: '', paras: [] }; ms.sections.push(cur); }
    cur.paras.push(t);
  }
  ms.refs = splitRefEntries(refParts).map(raw => ({ raw, resolved: null, status: 'verbatim' }));
  if (!ms.abstract) ms.warnings.push('No abstract detected — add one below if the manuscript has it.');
  if (!ms.refs.length) ms.warnings.push('No reference list detected (looked for a "References" heading).');
  return ms;
}

/* ── Crossref resolution (strict gate — never guess) ────────────────────── */
const _norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function crossrefGate(raw, item) {
  const title = (item.title && item.title[0]) || '';
  if (!title) return false;
  const nraw = ' ' + _norm(raw) + ' ';
  const toks = _norm(title).split(' ').filter(w => w.length > 3);
  if (toks.length < 2) return false;
  const hit = toks.filter(t => nraw.indexOf(' ' + t + ' ') >= 0 || nraw.indexOf(t) >= 0).length / toks.length;
  if (hit < 0.78) return false;
  const yr = (raw.match(/\b(19|20)\d{2}\b/) || [])[0];
  const dp = item.issued && item.issued['date-parts'] && item.issued['date-parts'][0];
  const iy = dp && dp[0];
  if (yr && iy && Math.abs(+yr - iy) > 1) return false;
  const fam = item.author && item.author[0] && item.author[0].family;
  if (fam && nraw.indexOf(_norm(fam)) < 0) return false;
  if (!fam && !(item.author && item.author.length)) return false;
  return true;
}

function cslFromItem(it) {
  const dp = it.issued && it.issued['date-parts'] && it.issued['date-parts'][0];
  return {
    authors: (it.author || []).map(a => ({ family: a.family || '', given: a.given || '' })).filter(a => a.family),
    year: dp && dp[0] ? String(dp[0]) : '',
    title: (it.title && it.title[0]) || '',
    container: (it['container-title'] && it['container-title'][0]) || '',
    volume: it.volume || '', issue: it.issue || '', pages: it.page || '',
    doi: it.DOI || '', type: it.type || '', publisher: it.publisher || '',
  };
}

async function resolveOneRef(ref) {
  const url = 'https://api.crossref.org/works?rows=2&select=title,author,issued,container-title,volume,issue,page,DOI,type,publisher&query.bibliographic='
    + encodeURIComponent(ref.raw.slice(0, 400)) + '&mailto=asrarsaa%40gmail.com';
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    const j = await r.json();
    const items = (j.message && j.message.items) || [];
    for (const it of items) {
      if (crossrefGate(ref.raw, it)) { ref.resolved = cslFromItem(it); ref.status = 'resolved'; return; }
    }
  } catch { /* network failure → stays verbatim */ }
}

async function resolveRefs(refs, onProgress) {
  let done = 0; const queue = refs.slice();
  async function worker() {
    while (queue.length) {
      const ref = queue.shift();
      await resolveOneRef(ref);
      done++; if (onProgress) onProgress(done, refs.length);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
}

/* ── Citation engines (deterministic formatters over real records) ──────── */
function initials(given) {
  return String(given || '').split(/[\s.]+/).filter(Boolean)
    .map(w => w.split('-').filter(Boolean).map(p => p[0].toUpperCase() + '.').join('-')).join(' ');
}
function apaAuthors(authors) {
  const a = authors.map(x => x.family + (x.given ? ', ' + initials(x.given) : ''));
  if (a.length === 1) return a[0];
  if (a.length <= 20) return a.slice(0, -1).join(', ') + ', & ' + a[a.length - 1];
  return a.slice(0, 19).join(', ') + ', . . . ' + a[a.length - 1];
}
function fmtAPA(r) {
  let s = apaAuthors(r.authors) + ' (' + (r.year || 'n.d.') + '). ' + r.title.replace(/\.$/, '') + '.';
  if (r.container) {
    s += ' <i>' + r.container + '</i>';
    if (r.volume) s += ', <i>' + r.volume + '</i>' + (r.issue ? '(' + r.issue + ')' : '');
    if (r.pages) s += ', ' + r.pages.replace(/-/g, '–');
    s += '.';
  } else if (r.publisher) s += ' ' + r.publisher + '.';
  if (r.doi) s += ' https://doi.org/' + r.doi;
  return s;
}
function fmtEmerald(r) {
  const a = r.authors.map(x => x.family + (x.given ? ', ' + initials(x.given) : ''));
  const names = a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || '';
  let s = names + ' (' + (r.year || 'n.d.') + '), “' + r.title.replace(/\.$/, '') + '”';
  if (r.container) {
    s += ', <i>' + r.container + '</i>';
    if (r.volume) s += ', Vol. ' + r.volume + (r.issue ? ' No. ' + r.issue : '');
    if (r.pages) s += ', pp. ' + r.pages.replace(/-/g, '–');
  } else if (r.publisher) s += ', ' + r.publisher;
  s += '.';
  if (r.doi) s += ' doi: ' + r.doi + '.';
  return s;
}
function fmtVancouver(r) {
  const a = r.authors.slice(0, 6).map(x => x.family + ' ' + initials(x.given).replace(/[.\s-]/g, ''));
  let names = a.join(', ');
  if (r.authors.length > 6) names += ', et al';
  let s = names + '. ' + r.title.replace(/\.$/, '') + '.';
  if (r.container) {
    s += ' ' + r.container + '. ' + (r.year || '');
    if (r.volume) s += ';' + r.volume + (r.issue ? '(' + r.issue + ')' : '');
    if (r.pages) s += ':' + r.pages;
    s += '.';
  } else { s += (r.publisher ? ' ' + r.publisher + ';' : '') + ' ' + (r.year || '') + '.'; }
  if (r.doi) s += ' doi:' + r.doi;
  return s;
}
const ENGINES = { apa: fmtAPA, emerald: fmtEmerald, vancouver: fmtVancouver };

// → [{html, text, flagged, raw, refIdx, doi, wasResolved}] in style order
// (author–date sorts; numbered keeps manuscript order). A ref whose status was
// manually reverted to 'verbatim' renders verbatim even though a Crossref
// match exists — the user's call always wins.
function styledRefs(refs, style) {
  const fmt = ENGINES[style] || fmtAPA;
  const list = refs.map((ref, refIdx) => {
    if (ref.resolved && ref.status === 'resolved') {
      const html = fmt(ref.resolved);
      return { html, text: html.replace(/<\/?i>/g, ''), flagged: false, raw: ref.raw, refIdx, doi: ref.resolved.doi || '', wasResolved: true, sortKey: html.toLowerCase() };
    }
    return { html: escHtml(ref.raw), text: ref.raw, flagged: true, raw: ref.raw, refIdx, doi: '', wasResolved: !!ref.resolved, sortKey: ref.raw.toLowerCase() };
  });
  if (style !== 'vancouver') list.sort((a, b) => a.sortKey < b.sortKey ? -1 : 1);
  return list;
}
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ── Submission .docx builder ───────────────────────────────────────────── */
function refTextToRuns(d, text) {
  // split on <i>…</i> markers from the engines
  const runs = []; const parts = String(text).split(/(<i>|<\/i>)/); let ital = false;
  for (const p of parts) {
    if (p === '<i>') { ital = true; continue; }
    if (p === '</i>') { ital = false; continue; }
    if (p) runs.push(new d.TextRun({ text: p, italics: ital, font: 'Times New Roman', size: 24 }));
  }
  return runs;
}

async function buildDocx(ms, opts) {
  const d = await getDocx();
  if (!d || !d.Document) throw new Error('docx unavailable');
  const F = { font: 'Times New Roman', size: 24 };           // 12pt
  const DBL = { line: 480, lineRule: 'auto' };               // double spacing
  const P = [];
  const run = (text, extra) => new d.TextRun(Object.assign({ text }, F, extra || {}));
  const para = (children, extra) => new d.Paragraph(Object.assign({ spacing: DBL }, extra, { children: Array.isArray(children) ? children : [children] }));

  // ── Title page
  P.push(para(run(ms.title, { bold: true }), { alignment: d.AlignmentType.CENTER, spacing: Object.assign({}, DBL, { before: 2400 }) }));
  if (!opts.blind) {
    if (ms.authors) P.push(para(run(ms.authors), { alignment: d.AlignmentType.CENTER }));
    if (ms.affiliations) ms.affiliations.split('\n').forEach(a => P.push(para(run(a), { alignment: d.AlignmentType.CENTER })));
  } else {
    P.push(para(run('[Author details removed for blind review]', { italics: true }), { alignment: d.AlignmentType.CENTER }));
  }
  P.push(new d.Paragraph({ children: [], pageBreakBefore: false }));

  // ── Abstract page
  if (ms.abstract) {
    P.push(para(run('Abstract', { bold: true }), { alignment: d.AlignmentType.CENTER, pageBreakBefore: true }));
    P.push(para(run(ms.abstract)));
    if (ms.keywords) P.push(para([run('Keywords: ', { italics: true }), run(ms.keywords)]));
  }

  // ── Body
  let first = true;
  for (const sec of ms.sections) {
    if (sec.heading) P.push(para(run(sec.heading, { bold: true }), { alignment: d.AlignmentType.CENTER, pageBreakBefore: first }));
    first = false;
    for (const p of sec.paras) P.push(para(run(p), { indent: { firstLine: 720 } }));
  }

  // ── References (hanging indent), flagged ones kept verbatim with marker
  const list = styledRefs(ms.refs, opts.refStyle);
  if (list.length) {
    P.push(para(run('References', { bold: true }), { alignment: d.AlignmentType.CENTER, pageBreakBefore: true }));
    list.forEach((r, idx) => {
      const runs = [];
      if (opts.refStyle === 'vancouver') runs.push(run((idx + 1) + '. '));
      runs.push.apply(runs, refTextToRuns(d, r.html));
      if (r.flagged) runs.push(run('  [⚠ kept verbatim — not matched to a Crossref record]', { italics: true, color: '999999' }));
      P.push(para(runs, { indent: { left: 720, hanging: 720 } }));
    });
  }

  let headers;
  try {
    headers = { default: new d.Header({ children: [ new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [ new d.TextRun({ children: [d.PageNumber.CURRENT], font: 'Times New Roman', size: 24 }) ] }) ] }) };
  } catch { headers = undefined; }

  const doc = new d.Document({ sections: [{ headers, properties: {}, children: P }] });
  return d.Packer.toBlob(doc);
}

// Word-HTML .doc fallback (same trick the Article Developer download uses)
function buildDocFallback(ms, opts) {
  const esc = escHtml;
  const parts = ['<div style="text-align:center;margin-top:200pt"><b>' + esc(ms.title) + '</b></div>'];
  if (!opts.blind) {
    if (ms.authors) parts.push('<div style="text-align:center">' + esc(ms.authors) + '</div>');
    if (ms.affiliations) ms.affiliations.split('\n').forEach(a => parts.push('<div style="text-align:center">' + esc(a) + '</div>'));
  } else parts.push('<div style="text-align:center"><i>[Author details removed for blind review]</i></div>');
  parts.push('<br clear=all style="page-break-before:always">');
  if (ms.abstract) {
    parts.push('<div style="text-align:center"><b>Abstract</b></div><p>' + esc(ms.abstract) + '</p>');
    if (ms.keywords) parts.push('<p><i>Keywords:</i> ' + esc(ms.keywords) + '</p>');
  }
  for (const sec of ms.sections) {
    if (sec.heading) parts.push('<div style="text-align:center"><b>' + esc(sec.heading) + '</b></div>');
    sec.paras.forEach(p => parts.push('<p style="text-indent:.5in">' + esc(p) + '</p>'));
  }
  const list = styledRefs(ms.refs, opts.refStyle);
  if (list.length) {
    parts.push('<br clear=all style="page-break-before:always"><div style="text-align:center"><b>References</b></div>');
    list.forEach((r, i) => parts.push('<p style="margin-left:.5in;text-indent:-.5in">' + (opts.refStyle === 'vancouver' ? (i + 1) + '. ' : '') + r.html + (r.flagged ? ' <i>[⚠ kept verbatim]</i>' : '') + '</p>'));
  }
  const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:"Times New Roman";font-size:12pt;line-height:2}</style></head><body>' + parts.join('\n') + '</body></html>';
  return new Blob(['﻿' + html], { type: 'application/msword' });
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

/* ── Published-look preview ─────────────────────────────────────────────── */
function publishedHtml(ms, opts, journal) {
  const esc = escHtml;
  const jname = journal ? journal.name : (FAMILIES[opts.familyKey] || FAMILIES.apa).label;
  const list = styledRefs(ms.refs, opts.refStyle);
  const secs = ms.sections.map(sec =>
    (sec.heading ? '<h3 class="fmtp-h">' + esc(sec.heading) + '</h3>' : '') +
    sec.paras.map(p => '<p>' + esc(p) + '</p>').join('')).join('');
  const refs = list.length
    ? '<h3 class="fmtp-h">References</h3><div class="fmtp-refs">' +
      list.map((r, i) => '<p class="fmtp-ref' + (r.flagged ? ' fmtp-flag' : '') + '">' + (opts.refStyle === 'vancouver' ? (i + 1) + '.&nbsp;' : '') + r.html + (r.flagged ? ' <span class="fmtp-flagtag">⚠ verbatim</span>' : '') + '</p>').join('') + '</div>'
    : '';
  return (
    '<div class="fmtp-mast"><span class="fmtp-jname">' + esc(jname) + '</span>' +
    (journal ? '<span class="fmtp-jmeta">' + esc(journal.publisher || '') + (journal.quartile ? ' · ' + esc(journal.quartile) : '') + '</span>' : '') +
    '<span class="fmtp-visual">Visual preview only — not the journal’s actual typesetting</span></div>' +
    '<h1 class="fmtp-title">' + esc(ms.title) + '</h1>' +
    (!opts.blind && ms.authors ? '<div class="fmtp-authors">' + esc(ms.authors) + '</div>' : '') +
    (!opts.blind && ms.affiliations ? '<div class="fmtp-affil">' + esc(ms.affiliations).replace(/\n/g, '<br>') + '</div>' : '') +
    (ms.abstract ? '<div class="fmtp-abs"><b>Abstract</b> ' + esc(ms.abstract) + (ms.keywords ? '<div class="fmtp-kw"><b>Keywords:</b> ' + esc(ms.keywords) + '</div>' : '') + '</div>' : '') +
    '<div class="fmtp-cols">' + secs + refs + '</div>'
  );
}

function printPreview() {
  const host = document.getElementById('fmt-preview');
  if (!host || !host.innerHTML.trim()) return;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write('<html><head><title>Published preview</title><style>' + PREVIEW_CSS +
    '.fmt-preview{box-shadow:none;border:none;max-width:none}@page{margin:18mm}</style></head><body><div class="fmt-preview">' +
    host.innerHTML + '</div><script>window.onload=function(){window.print()}<\/script></body></html>');
  w.document.close();
}

const PREVIEW_CSS = [
  '.fmt-preview{font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;background:#fff;padding:34px 40px;line-height:1.5;font-size:13.5px}',
  '.fmtp-mast{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;border-bottom:2.5px solid #1a1a1a;padding-bottom:8px;margin-bottom:18px}',
  '.fmtp-jname{font-weight:700;font-size:1.05rem;letter-spacing:.02em}',
  '.fmtp-jmeta{font-size:.78rem;color:#555}',
  '.fmtp-visual{margin-left:auto;font-size:.7rem;color:#888;font-style:italic}',
  '.fmtp-title{font-size:1.65rem;line-height:1.25;margin:0 0 10px;font-weight:700}',
  '.fmtp-authors{font-size:.98rem;margin-bottom:4px}',
  '.fmtp-affil{font-size:.8rem;color:#555;margin-bottom:14px}',
  '.fmtp-abs{background:#f5f4f0;border-left:3px solid #1a1a1a;padding:12px 16px;font-size:.86rem;margin-bottom:20px}',
  '.fmtp-kw{margin-top:8px}',
  '.fmtp-cols{column-count:2;column-gap:28px}',
  '@media(max-width:640px){.fmtp-cols{column-count:1}}',
  '.fmtp-cols p{margin:0 0 9px;text-align:justify;hyphens:auto}',
  '.fmtp-h{font-size:.95rem;margin:16px 0 8px;font-weight:700;column-span:none}',
  '.fmtp-refs p{font-size:.78rem;margin:0 0 7px;padding-left:14px;text-indent:-14px;text-align:left}',
  '.fmtp-flag{background:rgba(241,69,117,.07)}',
  '.fmtp-flagtag{font-size:.68rem;color:#c2335f;font-style:italic}',
].join('\n');

/* ── UI wiring ──────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const state = { ms: null, journal: null, family: FAMILIES.apa, fileBlocks: null, fileName: '' };

function setStatus(msg, spin) {
  const el = $('fmt-status'); if (!el) return;
  el.innerHTML = msg ? (spin ? '<span class="fmt-spin"></span>' : '') + escHtml(msg) : '';
}

function findJournal(name) {
  const data = window.__JOURNAL_DATA__ || [];
  const q = String(name || '').trim().toLowerCase();
  if (!q) return null;
  return data.find(j => j.name.toLowerCase() === q) || data.find(j => j.name.toLowerCase().includes(q)) || null;
}

function currentFamily() {
  const styleSel = $('fmt-style');
  if (styleSel && styleSel.value !== 'auto') return FAMILIES[styleSel.value] || FAMILIES.apa;
  return state.journal ? familyForPublisher(state.journal.publisher) : FAMILIES.apa;
}

function refreshFamilyNote() {
  state.journal = findJournal($('fmt-journal').value);
  state.family = currentFamily();
  const note = $('fmt-family-note');
  if (note) {
    const jbit = state.journal ? '<b>' + escHtml(state.journal.name) + '</b> (' + escHtml(state.journal.publisher || '?') + ') → ' : '';
    note.innerHTML = jbit + '<b>' + state.family.label + '</b> · ' + escHtml(state.family.note) +
      ' <span class="fmt-verify">House default — always verify against the journal’s guide for authors.</span>';
  }
}

async function readInput() {
  const file = $('fmt-file').files[0];
  if (file) {
    if (!/\.docx$/i.test(file.name)) throw new Error('Please upload a .docx file (or use paste).');
    setStatus('Reading ' + file.name + '…', true);
    const mammoth = await getMammoth();
    const buf = await file.arrayBuffer();
    const res = await mammoth.convertToHtml({ arrayBuffer: buf });
    const { blocks, tables } = blocksFromHtml(res.value);
    state.fileName = file.name.replace(/\.docx$/i, '');
    if (tables) state.tablesSkipped = tables;
    return blocks;
  }
  const text = $('fmt-paste').value.trim();
  if (!text) throw new Error('Upload a .docx or paste your manuscript text first.');
  state.fileName = '';
  return blocksFromText(text);
}

async function runFormat() {
  const btn = $('fmt-run'); btn.disabled = true;
  $('fmt-results').style.display = 'none';
  $('fmt-preview-wrap').style.display = 'none';
  state.tablesSkipped = 0;
  try {
    const blocks = await readInput();
    setStatus('Parsing manuscript…', true);
    const ms = parseManuscript(blocks);
    state.ms = ms;
    refreshFamilyNote();
    if ($('fmt-resolve').checked && ms.refs.length) {
      setStatus('Matching references against Crossref (real records only)… 0/' + ms.refs.length, true);
      await resolveRefs(ms.refs, (d, t) => setStatus('Matching references against Crossref (real records only)… ' + d + '/' + t, true));
    }
    renderResults();
    setStatus('');
  } catch (e) {
    setStatus('⚠ ' + (e && e.message || 'Something went wrong.'));
  } finally { btn.disabled = false; }
}

function renderResults() {
  const ms = state.ms; if (!ms) return;
  $('fmt-title').value = ms.title || '';
  $('fmt-authors').value = ms.authors || '';
  $('fmt-affil').value = ms.affiliations || '';
  $('fmt-abstract').value = ms.abstract || '';
  $('fmt-keywords').value = ms.keywords || '';

  const words = ms.sections.reduce((n, s) => n + s.paras.join(' ').split(/\s+/).filter(Boolean).length, 0);
  const resolved = ms.refs.filter(r => r.status === 'resolved').length;
  const chips = [
    ms.sections.filter(s => s.heading).length + ' sections',
    words + ' body words',
    ms.refs.length + ' references',
    ms.refs.length ? resolved + ' matched · ' + (ms.refs.length - resolved) + ' kept verbatim ⚠' : null,
    state.tablesSkipped ? state.tablesSkipped + ' table(s) skipped — reattach in Word ⚠' : null,
  ].filter(Boolean);
  const absWords = ms.abstract ? ms.abstract.split(/\s+/).filter(Boolean).length : 0;
  if (absWords > 250) chips.push('abstract ' + absWords + ' words — many journals cap at 250');
  $('fmt-chips').innerHTML = chips.map(c => '<span class="fmt-chip' + (/⚠/.test(c) ? ' fmt-chip-warn' : '') + '">' + escHtml(c) + '</span>').join('');
  ms.warnings.forEach(w => { $('fmt-chips').innerHTML += '<span class="fmt-chip fmt-chip-warn">' + escHtml(w) + '</span>'; });
  renderTrustPanel(ms);

  const style = state.family.refStyle;
  const list = styledRefs(ms.refs, style);
  // Each restyled ref is inspectable (original text + matched DOI) and
  // reversible (one click back to verbatim). Trust in automation comes from
  // inspectable, reversible decisions.
  $('fmt-refs-list').innerHTML = list.map((r, i) =>
    '<div class="fmt-ref' + (r.flagged ? ' fmt-ref-flag' : '') + '">' +
    '<span class="fmt-ref-badge">' + (r.flagged ? '⚠ verbatim' : '✓ Crossref') + '</span>' +
    '<span class="fmt-ref-text">' + (style === 'vancouver' ? (i + 1) + '. ' : '') + r.html + '</span>' +
    '<span style="display:block;margin-top:3px;font-size:.72rem">' +
      (r.doi ? '<a href="https://doi.org/' + escHtml(r.doi) + '" target="_blank" rel="noopener" style="color:var(--muted,#6b7280);text-decoration:underline">' + escHtml(r.doi) + ' ↗</a> · ' : '') +
      (!r.flagged
        ? '<button type="button" class="fmt-ref-revert" data-ref="' + r.refIdx + '" data-act="revert" style="border:0;background:none;color:#c2335f;cursor:pointer;font-size:.72rem;text-decoration:underline;padding:0">↩ keep my original wording</button>'
        : (r.wasResolved ? '<button type="button" class="fmt-ref-revert" data-ref="' + r.refIdx + '" data-act="apply" style="border:0;background:none;color:#15803d;cursor:pointer;font-size:.72rem;text-decoration:underline;padding:0">✓ re-apply Crossref match</button>' : '')) +
    '</span>' +
    (!r.flagged
      ? '<details style="margin-top:2px"><summary style="font-size:.68rem;color:var(--faint,#9ca3af);cursor:pointer">original as you wrote it</summary><span style="font-size:.72rem;color:var(--muted,#6b7280)">' + escHtml(r.raw) + '</span></details>'
      : '') +
    '</div>').join('')
    || '<div class="fmt-ref">No references detected.</div>';

  // Delegate revert/re-apply clicks (innerHTML wipes listeners on re-render).
  $('fmt-refs-list').onclick = (ev) => {
    const btn = ev.target.closest('.fmt-ref-revert');
    if (!btn) return;
    const ref = ms.refs[+btn.dataset.ref];
    if (!ref) return;
    ref.status = btn.dataset.act === 'apply' ? 'resolved' : 'verbatim';
    renderResults();
  };

  $('fmt-results').style.display = 'block';
  $('fmt-results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Trust panel + citation-age histogram ────────────────────────────────────
// A visual summary of exactly how much of the reference list was restyled from
// real Crossref records vs kept verbatim, plus a deterministic age histogram
// of the years found in the reference strings themselves (regex, no lookup).
function renderTrustPanel(ms) {
  let panel = $('fmt-trust');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'fmt-trust';
    panel.style.cssText = 'margin:0 0 14px;padding:12px 14px;border:1px solid var(--border,#e5e7eb);border-radius:11px;background:var(--bg,#FBF7EF)';
    const chipsEl = $('fmt-chips');
    chipsEl.parentNode.insertBefore(panel, chipsEl.nextSibling);
  }
  const total = ms.refs.length;
  if (!total) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  const resolved = ms.refs.filter(r => r.status === 'resolved').length;
  const verbatim = total - resolved;
  const pct = Math.round(resolved / total * 100);

  // citation years: prefer the Crossref-resolved year, else the first plausible
  // year in the raw string (1900–2029). Refs with no detectable year are counted honestly.
  const nowY = new Date().getFullYear();
  const years = [];
  let noYear = 0;
  for (const r of ms.refs) {
    let y = r.resolved && r.resolved.year ? parseInt(r.resolved.year) : null;
    if (!y) { const m = String(r.raw).match(/\b(19\d\d|20[0-2]\d)\b/); y = m ? parseInt(m[1]) : null; }
    if (y && y <= nowY + 1) years.push(y); else noYear++;
  }
  const buckets = [['≤5y', y => nowY - y <= 5], ['6–10y', y => nowY - y > 5 && nowY - y <= 10], ['11–20y', y => nowY - y > 10 && nowY - y <= 20], ['>20y', y => nowY - y > 20]];
  const counts = buckets.map(([label, fn]) => [label, years.filter(fn).length]);
  const maxN = Math.max(1, ...counts.map(c => c[1]));
  const stalePct = years.length ? Math.round(years.filter(y => nowY - y > 10).length / years.length * 100) : 0;

  panel.innerHTML =
    '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint,#9ca3af);margin-bottom:6px">Reference trust panel</div>' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">' +
      '<div style="flex:1;height:10px;border-radius:6px;overflow:hidden;display:flex">' +
        '<span style="width:' + pct + '%;background:#22c55e"></span>' +
        '<span style="flex:1;background:rgba(241,69,117,.45)"></span>' +
      '</div>' +
      '<span style="font-size:.78rem;color:var(--muted,#6b7280);white-space:nowrap"><b style="color:#15803d">' + resolved + ' ✓ Crossref</b> · <b style="color:#c2335f">' + verbatim + ' ⚠ verbatim</b></span>' +
    '</div>' +
    '<div style="font-size:.74rem;color:var(--muted,#6b7280);margin-bottom:10px">Your body text is never touched — only the reference list is restyled. Restyled entries come from real Crossref records (DOI shown, one click reverts any of them); ⚠ entries pass through exactly as you wrote them — check those by hand.</div>' +
    '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint,#9ca3af);margin-bottom:6px">Citation age · years parsed from your own reference list</div>' +
    '<div style="display:flex;gap:10px;align-items:flex-end;height:56px;max-width:360px">' +
      counts.map(([label, n]) =>
        '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;justify-content:flex-end">' +
          '<span style="font-size:.68rem;color:var(--muted,#6b7280)">' + n + '</span>' +
          '<div style="width:100%;border-radius:4px 4px 0 0;background:linear-gradient(135deg,#FF9656,#F14575 52%,#9270F4);height:' + Math.max(3, n / maxN * 34) + 'px"></div>' +
          '<span style="font-size:.66rem;color:var(--faint,#9ca3af)">' + label + '</span>' +
        '</div>').join('') +
    '</div>' +
    '<div style="font-size:.72rem;color:var(--muted,#6b7280);margin-top:6px">' +
      (stalePct >= 50 ? '⚠ ' + stalePct + '% of dated references are older than 10 years — reviewers often flag a stale base.' : stalePct + '% of dated references are older than 10 years.') +
      (noYear ? ' · ' + noYear + ' reference' + (noYear === 1 ? '' : 's') + ' had no detectable year (not guessed).' : '') +
    '</div>';
}

function syncEdits() {
  const ms = state.ms; if (!ms) return;
  ms.title = $('fmt-title').value.trim();
  ms.authors = $('fmt-authors').value.trim();
  ms.affiliations = $('fmt-affil').value.trim();
  ms.abstract = $('fmt-abstract').value.trim();
  ms.keywords = $('fmt-keywords').value.trim();
}

async function downloadSubmission() {
  if (!state.ms) return;
  syncEdits();
  const opts = { blind: $('fmt-blind').checked, refStyle: state.family.refStyle, familyKey: state.family.key };
  const base = (state.fileName || state.ms.title.slice(0, 40).replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-') || 'manuscript');
  setStatus('Building .docx…', true);
  try {
    const blob = await buildDocx(state.ms, opts);
    downloadBlob(blob, base + '-' + state.family.key + '-submission.docx');
    setStatus('');
  } catch (e) {
    // CDN blocked / offline → Word-compatible HTML .doc
    downloadBlob(buildDocFallback(state.ms, opts), base + '-' + state.family.key + '-submission.doc');
    setStatus('docx library unavailable — delivered Word-compatible .doc instead.');
  }
}

function showPreview() {
  if (!state.ms) return;
  syncEdits();
  const opts = { blind: $('fmt-blind').checked, refStyle: state.family.refStyle, familyKey: state.family.key };
  $('fmt-preview').innerHTML = publishedHtml(state.ms, opts, state.journal);
  $('fmt-preview-wrap').style.display = 'block';
  $('fmt-preview-wrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function init() {
  if (!$('fmt-section')) return;
  // inject preview css
  const st = document.createElement('style'); st.textContent = PREVIEW_CSS; document.head.appendChild(st);
  // journal datalist
  const dl = $('fmt-journal-list');
  (window.__JOURNAL_DATA__ || []).forEach(j => { const o = document.createElement('option'); o.value = j.name; dl.appendChild(o); });
  // style select
  const sel = $('fmt-style');
  Object.values(FAMILIES).forEach(f => { const o = document.createElement('option'); o.value = f.key; o.textContent = f.label; sel.appendChild(o); });
  $('fmt-journal').addEventListener('input', refreshFamilyNote);
  sel.addEventListener('change', () => { refreshFamilyNote(); if (state.ms) renderResults(); });
  $('fmt-run').addEventListener('click', runFormat);
  $('fmt-download').addEventListener('click', downloadSubmission);
  $('fmt-preview-btn').addEventListener('click', showPreview);
  $('fmt-print').addEventListener('click', printPreview);
  $('fmt-file').addEventListener('change', () => {
    const f = $('fmt-file').files[0];
    $('fmt-file-name').textContent = f ? f.name : '';
    if (f) $('fmt-paste').value = '';
  });
  $('fmt-paste-toggle').addEventListener('click', () => {
    const w = $('fmt-paste-wrap');
    w.style.display = w.style.display === 'none' ? 'block' : 'none';
  });
  refreshFamilyNote();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// exposed for smoke tests
window.JTFormatter = { FAMILIES, familyForPublisher, blocksFromText, parseManuscript, splitRefEntries, crossrefGate, fmtAPA, fmtEmerald, fmtVancouver, styledRefs };
})();
