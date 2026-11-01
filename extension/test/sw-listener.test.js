// Runs background.js under a service-worker-like sandbox (no window/document/DOMParser/require/module)
// and drives chrome.downloads.onDeterminingFilename end-to-end. Network is served from fixtures
// captured from the real PMC/NCBI/Crossref responses (set LIVE=1 to use the real network).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..'), fx = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));
const PDF = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8908851/pdf/NEJMoa2118542.pdf';
const T = 'Oral Nirmatrelvir for High-Risk, Nonhospitalized Adults with Covid-19';
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

function fakeFetch(url) {
  const res = (body, ct, status = 200) => Promise.resolve(new Response(body, { status, headers: { 'content-type': ct } }));
  if (url.startsWith(PDF)) return res(fx('pmc-interstitial.html'), 'text/html; charset=utf-8', 206);
  if (url.startsWith('https://pmc.ncbi.nlm.nih.gov/articles/PMC8908851/')) return res(fx('pmc-article.html'), 'text/html; charset=utf-8');
  if (url.includes('eutils.ncbi.nlm.nih.gov')) return res(fx('esummary.json'), 'application/json');
  if (url.includes('api.crossref.org')) return res(fx('crossref.json'), 'application/json');
  return res('not found', 'text/plain', 404);
}

function makeSW({ granted, offscreenMode = 'error', tabs }) {
  const store = {}; let listener; const ev = () => ({ addListener() {} });
  const chrome = {
    storage: { local: { get: async d => { const o = typeof d === 'string' ? { [d]: undefined } : { ...d }; for (const k in o) if (k in store) o[k] = store[k]; return o; }, set: async o => Object.assign(store, o) }, onChanged: ev() },
    runtime: { onMessage: ev(), onStartup: ev(), onInstalled: ev(),
      sendMessage: () => offscreenMode === 'hang' ? new Promise(() => {}) : Promise.resolve({ ok: false, error: 'LanguageModel unsupported' }) },
    tabs: { onRemoved: ev(), onUpdated: ev(), create() {}, query: async () => tabs || [{ id: 1, url: granted ? PDF : undefined, title: granted ? 'pmc.ncbi.nlm.nih.gov/articles/PMC8908851/pdf/NEJMoa2118542.pdf' : undefined }] },
    permissions: { contains: async () => granted, onAdded: ev(), onRemoved: ev() },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    offscreen: { hasDocument: async () => offscreenMode !== 'error', createDocument: async () => {} },
    downloads: { onDeterminingFilename: { addListener(f) { listener = f; } } }
  };
  const g = { chrome, fetch: process.env.LIVE ? fetch : fakeFetch, Response, AbortController, TextEncoder, TextDecoder, DecompressionStream, URL,
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise, Date };
  g.self = g;
  g.importScripts = (...files) => files.forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), g, { filename: f }));
  vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), g, { filename: 'background.js' });
  assert.ok(listener, 'onDeterminingFilename listener registered at top level');
  assert.strictEqual(typeof g.DOMParser, 'undefined'); assert.strictEqual(typeof g.document, 'undefined');
  return { store, run: item => new Promise(resolve => { const ret = listener(item, s => resolve(s)); assert.strictEqual(ret, true); }) };
}

const BLOB = 'blob:null/3f2a9c1e-7b4d-4e0a-9d2f-1c8b5e6a7d90';
const item = (referrer, url = PDF) => ({ id: 1, filename: 'NEJMoa2118542.pdf', mime: 'application/pdf', url, finalUrl: url, referrer });

(async () => {
  const cases = [
    ['enhanced granted, referrer empty', { granted: true }, '', `${T}_${today}.pdf`],
    ['enhanced granted, referrer = pdf url', { granted: true }, PDF, `${T}_${today}.pdf`],
    ['not granted', { granted: false }, '', `NEJMoa2118542_${today}.pdf`],
    ['granted, built-in AI hangs', { granted: true, offscreenMode: 'hang' }, '', `${T}_${today}.pdf`],
    ['not granted, built-in AI hangs (guard)', { granted: false, offscreenMode: 'hang' }, '', `NEJMoa2118542_${today}.pdf`],
  ];
  const viewerTab = { id: 7, active: true, url: PDF, title: 'pmc.ncbi.nlm.nih.gov/articles/PMC8908851/pdf/NEJMoa2118542.pdf' };
  cases.push(
    ['PDF viewer save: blob:null url, empty referrer, tab found', { granted: true, tabs: [{ id: 2, url: 'https://example.org/', title: 'Other' }, viewerTab] }, '', `${T}_${today}.pdf`, BLOB],
    ['blob url, tab has only URL-like title', { granted: true, tabs: [{ id: 7, active: true, title: viewerTab.title }] }, '', `${T}_${today}.pdf`, BLOB],
    ['blob url, not granted', { granted: false, tabs: [{ id: 7, active: true }] }, '', `NEJMoa2118542_${today}.pdf`, BLOB]);
  for (const [name, opts, ref, expect, url] of cases) {
    const sw = makeSW(opts); const t0 = Date.now();
    const r = await sw.run(item(ref, url));
    console.log(`${name}: ${r && r.filename} (${Date.now() - t0}ms)`);
    assert.ok(r && r.filename, 'must always suggest a filename');
    if (!process.env.LIVE || opts.granted) assert.strictEqual(r.filename, expect);
    assert.strictEqual(r.conflictAction, 'uniquify');
    assert.ok(sw.store.debugLog && sw.store.debugLog.length === 1, 'debug log written before suggest');
  }
  console.log('sw listener tests passed');
})().catch(e => { console.error(e); process.exit(1); });
