importScripts('lib.js');
const { sanitizeTitle, splitExt, buildFilename, cleanOriginalStem, looksReadable, MIME_EXT, parseHtmlTitles, extractPdfTitle, extractPdfTitleDeep, isJunkTitle, looksLikeId, stripSiteSuffix, siteQualify, isUrlish, stripDupExt, extractDoi, extractPmcId, extractPubmedId, articleUrlCandidates } = self.ADR;

const DEFAULTS = { enabled: true, dateFormat: 'YYYY-MM-DD', skipReadable: false, enhanced: false, engine: 'auto',
  baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: '' };
const getSettings = () => chrome.storage.local.get(DEFAULTS);

// Last element context per tab (from content script)
const ctxByTab = new Map();
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'elementContext' && sender.tab) {
    ctxByTab.set(sender.tab.id, { ...msg.data, t: Date.now() });
    chrome.storage.session?.set({ ['ctx_' + sender.tab.id]: { ...msg.data, t: Date.now() } }).catch(() => {});
  } else if (msg && msg.type === 'engineStatus') {
    engineStatus().then(sendResponse); return true;
  } else if (msg && msg.type === 'testBuiltin') {
    callBuiltin({ pageTitle: 'microRNA exploration of proliferation pathways (example)', url: 'https://example.org/a8f3e2c1.pdf', filename: 'a8f3e2c1.pdf' })
      .then(r => sendResponse({ ok: true, result: r })).catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  } else if (msg && msg.type === 'testConnection') {
    callAI(msg.settings, { pageTitle: '测试', url: 'https://example.com/cat.jpg', filename: 'IMG_8812.jpg' }, true)
      .then(r => sendResponse({ ok: true, result: r })).catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
});
chrome.tabs.onRemoved.addListener(id => ctxByTab.delete(id));

// 增强识别: content script registered only when user granted optional <all_urls>
async function syncContentScript() {
  const { enhanced } = await chrome.storage.local.get({ enhanced: false });
  const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: ['ctx'] }).catch(() => []);
  if (enhanced && granted && !existing.length) {
    await chrome.scripting.registerContentScripts([{ id: 'ctx', matches: ['<all_urls>'], js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: true }]).catch(console.warn);
  } else if ((!enhanced || !granted) && existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: ['ctx'] }).catch(() => {});
  }
}
chrome.runtime.onStartup.addListener(syncContentScript);
chrome.runtime.onInstalled.addListener((d) => { syncContentScript(); if (d.reason === 'install') chrome.tabs.create({ url: 'welcome.html' }); });
chrome.permissions.onAdded.addListener(syncContentScript);
chrome.permissions.onRemoved.addListener(syncContentScript);
chrome.storage.onChanged.addListener((c) => { if (c.enhanced) syncContentScript(); });

async function getElementCtx(tabId) {
  let c = ctxByTab.get(tabId);
  if (!c && chrome.storage.session) {
    const r = await chrome.storage.session.get('ctx_' + tabId).catch(() => ({}));
    c = r['ctx_' + tabId];
  }
  return c && Date.now() - c.t < 60000 ? c : null;
}

const isOpaqueUrl = (u) => !u || /^(blob|data|filesystem|about|chrome|chrome-extension):/i.test(u);
const fname = (u) => { try { return decodeURIComponent(new URL(u).pathname.split('/').pop() || '').toLowerCase(); } catch { return ''; } };
// Recently seen PDF tabs (url visible only with host permission)
const recentPdf = [];
function notePdfTab(tab) {
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return;
  if (!/\.pdf(\?|#|$)/i.test(tab.url) && !/\.pdf$/i.test(tab.title || '')) return;
  const i = recentPdf.findIndex(x => x.url === tab.url); if (i >= 0) recentPdf.splice(i, 1);
  recentPdf.unshift({ url: tab.url, title: tab.title || '', tabId: tab.id, t: Date.now() }); recentPdf.length = Math.min(recentPdf.length, 10);
  chrome.storage.session?.set({ recentPdf }).catch?.(() => {});
}
chrome.tabs.onUpdated?.addListener((id, info, tab) => { if (info.url || info.status === 'complete' || info.title) notePdfTab(tab); });
async function getRecentPdf() {
  if (!recentPdf.length && chrome.storage.session) { const r = await chrome.storage.session.get('recentPdf').catch(() => ({})); if (r.recentPdf) recentPdf.push(...r.recentPdf); }
  return recentPdf;
}

async function findTab(item) {
  try {
    const tabs = await chrome.tabs.query({});   // title/url visible only for hosts we have permission for
    const cands = [item.referrer, item.finalUrl, item.url].filter(u => u && !isOpaqueUrl(u)).map(u => u.split('#')[0]);
    let tab = cands.length && (tabs.find(t => t.url && cands.includes(t.url.split('#')[0]))
      || tabs.find(t => t.url && cands.some(c => c.startsWith(t.url.split('#')[0]) || t.url.startsWith(c))));
    const fn = String(item.filename || '').split(/[\\/]/).pop().toLowerCase();
    if (!tab && fn) tab = tabs.find(t => t.active && t.url && fname(t.url) === fn) || tabs.find(t => t.url && fname(t.url) === fn);
    if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab || null;
  } catch { return null; }
}
// Effective source URL: real download URL, else the matched tab URL, else a URL-like tab title, else recent PDF tab
async function effectiveSource(item, tab) {
  const dl = item.finalUrl || item.url || '';
  if (!isOpaqueUrl(dl)) return { url: dl, via: 'download' };
  if (tab?.url && /^https?:/i.test(tab.url)) return { url: tab.url, via: 'tab.url' };
  const tt = (tab?.title || '').trim();
  if (/^[a-z0-9.-]+\.[a-z]{2,}\/\S+$/i.test(tt)) return { url: 'https://' + tt, via: 'tab.title' };
  const fn = String(item.filename || '').split(/[\\/]/).pop().toLowerCase();
  const rec = (await getRecentPdf()).find(r => fname(r.url) === fn && Date.now() - r.t < 3600e3) || (await getRecentPdf()).find(r => Date.now() - r.t < 600e3);
  if (rec) return { url: rec.url, via: 'recentPdf' };
  return { url: '', via: 'none' };
}

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { credentials: 'include', redirect: 'follow', ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
}
async function fetchPageTitles(url) {
  if (!/^https?:/i.test(url || '')) return {};
  try {
    const r = await fetchWithTimeout(url, { headers: { Accept: 'text/html,*/*;q=0.5' } }, 3000);
    if (!r.ok || !/html|xml/i.test(r.headers.get('content-type') || '')) return {};
    const text = (await r.text()).slice(0, 600000);
    return parseHtmlTitles(text, r.url || url);
  } catch { return {}; }
}
async function rangeBytes(url, range, ms) {
  const r = await fetchWithTimeout(url, { headers: { Range: range } }, ms);
  if (!r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  const buf = new Uint8Array(await r.arrayBuffer());
  const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
  if (range.startsWith('bytes=0') && !isPdf) throw new Error('not a PDF (' + ct + ', ' + buf.length + 'B) — likely interstitial');
  if (/text\/html/i.test(ct)) throw new Error('got HTML (' + buf.length + 'B)');
  return buf.length > 4 * 1048576 ? buf.subarray(0, 4 * 1048576) : buf;
}
async function fetchPdfTitle(url, log) {
  if (!/^https?:/i.test(url || '')) return '';
  try {
    const head = await rangeBytes(url, 'bytes=0-1048575', 4000);
    let t = head ? await extractPdfTitleDeep(head) : '';
    if (!t) { const tail = await rangeBytes(url, 'bytes=-262144', 3000).catch(() => null); if (tail) t = await extractPdfTitleDeep(tail); }
    log.push(['pdf', t || '(无标题元数据)']); return t;
  } catch (e) { log.push(['pdf', '失败: ' + e.message]); return ''; }
}
async function fetchJson(url, ms) { const r = await fetchWithTimeout(url, { credentials: 'omit', headers: { Accept: 'application/json' } }, ms); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
async function ncbiTitle(url, log) {
  const pmc = extractPmcId(url), pm = extractPubmedId(url); if (!pmc && !pm) return '';
  const db = pmc ? 'pmc' : 'pubmed', id = pmc || pm;
  try { const j = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=${db}&id=${id}&retmode=json`, 3000);
    const t = String(j?.result?.[id]?.title || '').replace(/<[^>]+>/g, '').replace(/\.$/, '').trim(); log.push(['ncbi', t || '(空)']); return t;
  } catch (e) { log.push(['ncbi', '失败: ' + e.message]); return ''; }
}
async function crossrefTitle(doi, log) {
  if (!doi) return '';
  try { const j = await fetchJson('https://api.crossref.org/works/' + encodeURIComponent(doi).replace(/%2F/gi, '/'), 3500);
    const t = String(j?.message?.title?.[0] || '').replace(/<[^>]+>/g, '').trim(); log.push(['crossref', t || '(空)']); return t;
  } catch (e) { log.push(['crossref', '失败: ' + e.message]); return ''; }
}
const hasHostAccess = () => chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false);

// Collect title candidates. Pages/PDF are read locally; NCBI/Crossref receive only the paper ID / DOI.
async function gatherTitles(item, stem, log) {
  const out = { tab: null, pdf: '', citation: '', page: '' };
  if (!(await hasHostAccess())) { log.push(['enhanced', '未开启（无站点权限）']); return out; }
  const tab0 = await withTimeout(findTab(item), 1500, 'findTab').catch(() => null);
  notePdfTab(tab0);
  const src = await effectiveSource(item, tab0);
  const dlUrl = src.url;
  log.push(['source', `${src.via}: ${dlUrl || '(无)'} (原始 url=${(item.finalUrl || item.url || '').slice(0, 80)})`]);
  const isPdf = /pdf/i.test(item.mime || '') || /\.pdf$/i.test(item.filename || '') || /\.pdf(\?|$)/i.test(dlUrl);
  let ref = isOpaqueUrl(item.referrer) ? '' : item.referrer;
  // strict-origin-when-cross-origin leaves only "https://site/" — use the matching tab's full URL instead
  const isRoot = (u) => { try { const x = new URL(u); return x.pathname === '/' && !x.search; } catch { return false; } };
  if (ref && isRoot(ref) && tab0?.url && !isOpaqueUrl(tab0.url) && tab0.url !== dlUrl) { try { if (new URL(tab0.url).origin === new URL(ref).origin) ref = tab0.url; } catch {} }
  if (ref && isRoot(ref)) ref = '';
  const pages = [];
  if (ref && ref !== dlUrl && !/\.pdf(\?|$)/i.test(ref)) pages.push(ref);
  for (const u of [...articleUrlCandidates(dlUrl), ...articleUrlCandidates(ref)]) if (!pages.includes(u)) pages.push(u);
  log.push(['urls', `dl=${dlUrl} ref=${ref || '(空)'} pages=${pages.slice(0, 3).join(', ') || '(无)'}`]);
  const pageP = (async () => {
    for (const u of pages.slice(0, 3)) { const r = await fetchPageTitles(u); log.push(['page', `${u} → citation="${r.citation || ''}" title="${r.page || ''}" doi=${r.doi || ''}`]); if (r.citation || r.doi) return r; if (r.page) out._firstPage ||= r.page; }
    return {};
  })();
  const [tab, pdf, pr, ncbi] = await Promise.all([tab0, isPdf ? fetchPdfTitle(dlUrl, log) : '', pageP, ncbiTitle(dlUrl || ref, log)]);
  out.tab = tab; log.push(['tab', tab ? `"${tab.title || ''}" ${tab.url || ''}` : '(无)']);
  if (pdf && !isJunkTitle(pdf, stem)) out.pdf = pdf;
  let cit = [pr.citation, ncbi].find(t => t && !isJunkTitle(t, stem)) || '';
  if (!cit && !out.pdf) { const doi = pr.doi || extractDoi(dlUrl) || extractDoi(ref); const c = await crossrefTitle(doi, log); if (c && !isJunkTitle(c, stem)) cit = c; }
  out.citation = cit;
  const tabTitle = stripSiteSuffix(tab?.title || '', tab?.url);
  for (let p of [pr.page, out._firstPage, tabTitle]) { p = siteQualify(p, tab?.url || ref || dlUrl); if (p && !isJunkTitle(p, stem)) { out.page = p; break; } }
  return out;
}

async function pushDebug(entry) {
  const { debugLog = [] } = await chrome.storage.local.get('debugLog');
  debugLog.unshift(entry); await chrome.storage.local.set({ debugLog: debugLog.slice(0, 20) });
}

function buildPrompt(info) {
  return `根据以下下载信息为文件命名。规则：1) 如果页面或文件有明确的标题（论文、文章、商品、视频等标题），原样完整输出该标题，不要缩短、概括或翻译；2) 只有在没有真实标题时，才用页面内容的语言生成简洁的描述性名称。只输出文件名本身，不要扩展名、日期、引号或任何解释。\n\n${JSON.stringify(info, null, 1)}`;
}
const cleanAI = (out) => sanitizeTitle(String(out || '').trim().split('\n')[0].replace(/\.[a-z0-9]{2,5}$/i, ''));

// ---- Chrome built-in AI via offscreen document ----
let creating = null;
async function ensureOffscreen() {
  if (!chrome.offscreen) throw new Error('offscreen API unavailable');
  if (await chrome.offscreen.hasDocument?.()) return;
  creating ||= chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'],
    justification: 'Run Chrome built-in AI (Prompt API), which is only available in documents, to generate file names locally.' })
    .finally(() => { creating = null; });
  await creating;
}
async function offscreen(type, extra = {}) {
  await ensureOffscreen();
  const r = await withTimeout(chrome.runtime.sendMessage({ target: 'offscreen', type, ...extra }), type === 'prompt' ? 8500 : 1500, 'offscreen ' + type);
  if (!r?.ok) throw new Error(r?.error || 'offscreen error');
  return r.result;
}
async function builtinAvailability() { try { return await offscreen('availability'); } catch { return 'unavailable'; } }
async function callBuiltin(info) {
  const t = cleanAI(await offscreen('prompt', { prompt: buildPrompt(info), timeout: 8000 }));
  if (!t) throw new Error('内置 AI 返回为空');
  return t;
}
// Engine order: builtin (if available) -> own API (if key) -> basic
async function nameWithEngines(s, info) {
  const order = s.engine === 'builtin' ? ['builtin'] : s.engine === 'api' ? ['api'] : ['builtin', 'api'];
  for (const e of order) {
    try {
      if (e === 'builtin' && (await builtinAvailability()) === 'available') return { title: await callBuiltin(info), source: 'builtin' };
      if (e === 'api' && s.apiKey) return { title: await callAI(s, info), source: 'api' };
    } catch (err) { console.warn('engine', e, 'failed:', err); }
  }
  return null;
}
async function engineStatus() {
  const s = await getSettings(); const avail = await builtinAvailability();
  let active = 'basic';
  if (s.engine !== 'api' && avail === 'available') active = 'builtin';
  else if (s.engine !== 'builtin' && s.apiKey) active = 'api';
  return { active, builtin: avail, hasKey: !!s.apiKey, engine: s.engine, baseUrl: s.baseUrl };
}

async function callAI(s, info, isTest = false) {
  if (!s.apiKey) throw new Error('未设置 API Key');
  const base = s.baseUrl.replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : base + (/\/v\d+$/.test(base) ? '' : '/v1') + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const prompt = buildPrompt(info);
  try {
    const res = await fetch(url, { method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.apiKey },
      body: JSON.stringify({ model: s.model, temperature: 0.2, max_tokens: 200,
        messages: [{ role: 'system', content: 'You output ONLY a filename, nothing else. If a real title exists, output it COMPLETE and verbatim.' }, { role: 'user', content: prompt }] }) });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const j = await res.json();
    const t = cleanAI(j.choices?.[0]?.message?.content);
    if (!t) throw new Error('AI 返回为空');
    return t;
  } finally { clearTimeout(timer); }
}

function fallbackTitle(info, stem) {
  const c = info.element || {};
  const cand = [c.alt, c.title, c.linkText, c.ariaLabel, c.caption, info.pageTitle, c.ogTitle, cleanOriginalStem(stem)];
  for (const x of cand) { if (!x || isUrlish(x) || looksLikeId(x)) continue; const t = sanitizeTitle(x); if (t && t.length >= 2 && !looksLikeId(t)) return t; }
  const t = sanitizeTitle(cleanOriginalStem(stem)); if (t) return t;
  return '下载文件';
}

async function pushHistory(entry) {
  const { history = [] } = await chrome.storage.local.get('history');
  history.unshift(entry);
  await chrome.storage.local.set({ history: history.slice(0, 5) });
}

const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' 超时 ' + ms + 'ms')), ms))]);
let cachedFmt = 'YYYY-MM-DD';
chrome.storage.local.get({ dateFormat: 'YYYY-MM-DD' }).then(r => { cachedFmt = r.dateFormat; }).catch(() => {});

// Basic name, computed synchronously: never returns the bare original
function basicName(item, fmt) {
  const { stem, ext: e } = splitExt(item.filename || '');
  const ext = e || MIME_EXT[item.mime] || '';
  return buildFilename(sanitizeTitle(cleanOriginalStem(stem)) || sanitizeTitle(stem) || '下载文件', ext, new Date(), fmt || cachedFmt);
}

async function decide(item, ctx) {
  const log = ctx.log;
  const s = await getSettings();
  cachedFmt = s.dateFormat;
  if (!s.enabled) { ctx.skip = true; log.push(['skip', '已关闭']); return null; }
  let { stem, ext } = splitExt(item.filename);
  if (!ext && MIME_EXT[item.mime]) ext = MIME_EXT[item.mime];
  ctx.best = basicName(item, s.dateFormat);
  if (s.skipReadable && looksReadable(stem) && !looksLikeId(stem)) { ctx.skip = true; log.push(['skip', '原名已可读']); return null; }
  const g = await withTimeout(gatherTitles(item, stem, log), 9000, 'gatherTitles').catch(e => { log.push(['gather', '错误: ' + e.message]); return {}; });
  const setBest = (t, src) => { const n = buildFilename(stripDupExt(t, ext), ext, new Date(), s.dateFormat); ctx.best = n; ctx.source = src; return n; };
  if (g.page) {
    // listing pages (one title, many files): keep the file's own readable name too
    const cs = cleanOriginalStem(stem);
    const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
    if (!/pdf/i.test(ext) && cs && /[a-z\u4e00-\u9fff]{3,}/i.test(cs) && !looksLikeId(cs) && !norm(g.page).includes(norm(cs))) g.page = `${g.page} - ${cs}`;
    setBest(g.page, 'meta');
  }
  if (g.pdf || g.citation) return setBest(g.citation || g.pdf, 'meta');
  const tab = g.tab || await withTimeout(findTab(item), 1000, 'findTab').catch(() => null);
  const element = tab ? await getElementCtx(tab.id).catch(() => null) : null;
  const pt = g.page || stripSiteSuffix(tab?.title || '', tab?.url);
  const info = { url: (item.finalUrl || item.url || '').slice(0, 500), referrer: item.referrer || '', filename: item.filename,
    mime: item.mime, pageTitle: isJunkTitle(pt, stem) ? '' : pt, element: element ? { ...element, t: undefined } : undefined };
  const r = await withTimeout(nameWithEngines(s, info), 9000, 'AI').catch(e => { log.push(['engine', '错误: ' + e.message]); return null; });
  if (r) log.push(['engine', `${r.source}: ${r.title}`]); else log.push(['engine', '无可用 AI / 失败']);
  if (r && !isJunkTitle(r.title, stem)) return setBest(r.title, r.source);
  if (g.page) return ctx.best;
  return setBest(fallbackTitle(info, stem), 'basic');
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const ctx = { log: [], best: null, source: 'basic', skip: false, t0: Date.now() };
  try { ctx.best = basicName(item); } catch (e) { ctx.log.push(['basicName', '错误: ' + e.message]); }
  let done = false;
  const finish = async (why, err) => {
    if (done) return; done = true; clearTimeout(guard);
    if (err) ctx.log.push(['error', String(err && err.message || err) + (err && err.stack ? '\n' + String(err.stack).split('\n').slice(0, 4).join('\n') : '')]);
    const name = ctx.skip ? null : ctx.best;
    ctx.log.push(['finish', `${why} · ${Date.now() - ctx.t0}ms`]);
    try {
      await withTimeout(Promise.all([
        pushDebug({ time: Date.now(), from: item.filename, to: name || '(保持原名)', source: ctx.source, steps: ctx.log }),
        name ? pushHistory({ from: String(item.filename).split(/[\\/]/).pop(), to: name, source: ctx.source, time: Date.now() }) : null
      ]), 500, 'log');
    } catch {}
    try { name ? suggest({ filename: name, conflictAction: 'uniquify' }) : suggest(); } catch (e) { console.error('suggest failed', e); }
  };
  const guard = setTimeout(() => finish('guard 12s（使用当前最佳名称）'), 12000);
  decide(item, ctx).then(() => finish('ok'), (e) => finish('exception', e));
  return true;
});
