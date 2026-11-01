// End-to-end reproduction: runs background.js in node with mocked chrome APIs and REAL network fetches.
const fs = require('fs'), vm = require('vm'), path = require('path');
const store = {}; let listener;
const ev = () => ({ addListener() {} });
const chrome = {
  storage: { local: { get: async (d) => { const o = typeof d === 'string' ? { [d]: undefined } : { ...d }; for (const k in o) if (k in store) o[k] = store[k]; return o; }, set: async (o) => Object.assign(store, o) }, onChanged: ev(), session: null },
  runtime: { onMessage: ev(), onStartup: ev(), onInstalled: ev(), sendMessage: async () => ({ ok: false, error: 'no offscreen in node' }) },
  tabs: { onRemoved: ev(), query: async () => [{ id: 1, url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8908851/pdf/NEJMoa2118542.pdf', title: 'pmc.ncbi.nlm.nih.gov/articles/PMC8908851/pdf/NEJMoa2118542.pdf' }], create() {} },
  permissions: { contains: async () => process.env.ENH !== '0', onAdded: ev(), onRemoved: ev() },
  scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
  offscreen: { hasDocument: async () => false, createDocument: async () => { throw new Error('no offscreen'); } },
  downloads: { onDeterminingFilename: { addListener(f) { listener = f; } } }
};
const ctx = { chrome, fetch, AbortController, TextEncoder, TextDecoder, DecompressionStream, URL, console: { ...console, warn() {} }, setTimeout, clearTimeout, Date, Promise };
ctx.self = ctx;
ctx.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx);
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), ctx);
const item = { filename: 'NEJMoa2118542.pdf', mime: 'application/pdf', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8908851/pdf/NEJMoa2118542.pdf', finalUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8908851/pdf/NEJMoa2118542.pdf', referrer: process.env.REF || '' };
listener(item, async (r) => { await new Promise(r => setTimeout(r, 50)); console.log('RESULT:', r && r.filename); for (const [k, v] of (store.debugLog?.[0]?.steps || [])) console.log('  ', k, '→', v); });
