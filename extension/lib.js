// Shared pure helpers (used by service worker and node tests)
(function (root) {
  function sanitizeTitle(s, max = Infinity) {
    if (!s) return '';
    let t = String(s).replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/^["'“”‘’`\s]+|["'“”‘’`\s]+$/g, '')
      .replace(/\s+/g, ' ').trim()
      .replace(/^[.\s]+|[.\s]+$/g, '');
    if (max !== Infinity) t = Array.from(t).slice(0, max).join('').trim();
    return t;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function formatDate(d, fmt) {
    const y = d.getFullYear(), m = pad(d.getMonth() + 1), dd = pad(d.getDate());
    return fmt === 'YYYYMMDD' ? `${y}${m}${dd}` : `${y}-${m}-${dd}`;
  }
  function splitExt(name) {
    const base = String(name || '').split(/[\\/]/).pop();
    const i = base.lastIndexOf('.');
    if (i > 0 && i < base.length - 1 && base.length - i <= 10) return { stem: base.slice(0, i), ext: base.slice(i) };
    return { stem: base, ext: '' };
  }
  const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'application/pdf': '.pdf', 'application/zip': '.zip', 'text/plain': '.txt' };
  const bytes = (s) => new TextEncoder().encode(s).length;
  // Truncate to maxBytes UTF-8 at a char boundary, preferring a word boundary
  function truncateBytes(t, maxBytes) {
    if (bytes(t) <= maxBytes) return t;
    let out = '', n = 0;
    for (const ch of t) { const b = bytes(ch); if (n + b > maxBytes) break; out += ch; n += b; }
    const sp = out.lastIndexOf(' ');
    if (sp > out.length * 0.6) out = out.slice(0, sp);
    return out.replace(/[\s.,;:\-–—]+$/, '').trim();
  }
  const MAX_BYTES = 240;
  function buildFilename(title, ext, date, fmt) {
    const suffix = `_${formatDate(date, fmt)}${ext || ''}`;
    const t = truncateBytes(sanitizeTitle(title) || '下载文件', MAX_BYTES - bytes(suffix)) || '下载文件';
    return t + suffix;
  }
  function cleanOriginalStem(stem) {
    return String(stem || '').replace(/[_\-+.]+/g, ' ').replace(/\b[0-9a-f]{8,}\b/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  // Heuristic: looks human-readable if contains CJK, or >=2 real words and few digits/hex
  function looksReadable(stem) {
    const s = String(stem || '');
    if (!s || s.length < 4) return false;
    if (/^[0-9a-f\-_]{8,}$/i.test(s)) return false;
    const digits = (s.match(/\d/g) || []).length;
    if (digits / s.length > 0.3) return false;
    if (/[\u4e00-\u9fff]{2,}/.test(s)) return true;
    const words = s.split(/[\s_\-.]+/).filter(w => /^[a-z]{3,}$/i.test(w));
    return words.length >= 2;
  }
  // ---------- Title extraction helpers ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decodeEntities(t) {
    return String(t || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
      return ENT[e.toLowerCase()] ?? m;
    });
  }
  function utf8FromLatin1(str) {
    try { const b = Uint8Array.from(str, c => c.charCodeAt(0) & 255); return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return str; }
  }
  const SITE_SUFFIX = /\s*(?:[|\-–—:·]\s*)(?:NEJM|The New England Journal of Medicine|PubMed|PMC|NCBI|ScienceDirect|Springer(?:Link)?|Wiley Online Library|Nature|Science|The Lancet|JAMA(?: Network)?|BMJ|Cell(?: Press)?|Oxford Academic|Taylor & Francis Online|MDPI|Frontiers|PLOS(?: ONE)?|medRxiv|bioRxiv|arXiv|Google Scholar|ResearchGate|YouTube|bilibili|知乎|哔哩哔哩|百度文库|CNKI|中国知网)(?:\s*[|\-–—:·].*)?$/i;
  function stripSiteSuffix(t, url) {
    let x = String(t || '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 2; i++) x = x.replace(SITE_SUFFIX, '').trim();
    // generic: drop a trailing " - Site Name" whose words all appear in the page host (e.g. "Wikimedia Commons" @ commons.wikimedia.org)
    let host = ''; try { host = new URL(url).hostname.toLowerCase().replace(/[^a-z0-9]/g, ''); } catch {}
    for (let i = 0; i < 2 && host; i++) {
      const m = x.match(/^(.{4,}?)\s+[|\-–—·]\s+([^|\-–—·]{2,40})$/); if (!m) break;
      const words = m[2].toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (words.length && words.length <= 4 && words.every(w => host.includes(w))) x = m[1].trim(); else break;
    }
    // leading brand word that is the site itself: "PeerJ The state of OA…" @ peerj.com
    const lead = x.match(/^([A-Za-z][\w+]{2,20})\s+(\S.*)$/);
    if (host && lead && host.replace(/^www/, '').startsWith(lead[1].toLowerCase().replace(/[^a-z0-9]/g, '') + (host.match(/(com|org|net|io|cn)$/) || [''])[0]) && lead[2].split(/\s+/).length >= 3) x = lead[2];
    x = x.replace(/^(File|Image|Media|文件|Datei|Fichier|Archivo):\s*/i, '').trim(); // MediaWiki namespaces
    return x;
  }
  // ID-like: NEJMoa2118542, hashes, pure digits, IMG_1234, download (3)
  // generic page titles ("Download") → prefix with the site's name: "7-zip Download"
  function siteQualify(t, url) {
    const s = String(t || '').trim();
    if (!/^(downloads?|download page|下载|下载页|home|index|files?|releases?)$/i.test(s)) return s;
    try { const h = new URL(url).hostname.replace(/^www\./, '').split('.'); return `${h.length > 1 ? h[h.length - 2] : h[0]} ${s}`; } catch { return s; }
  }
  function looksLikeId(t) {
    const s = String(t || '').trim();
    if (!s) return true;
    if (/^(download|file|document|untitled|image|img|video|doc|pdf)[\s_\-()0-9]*$/i.test(s)) return true;
    if (/^[0-9a-f\-_]{6,}$/i.test(s) || /^[\d\s_\-.]+$/.test(s)) return true;
    if (!/\s/.test(s) && /\d{4,}/.test(s) && !/[\u4e00-\u9fff]/.test(s)) return true; // single token with long digit run
    return false;
  }
  // URL-ish / path-ish strings are never titles
  function isUrlish(t) {
    const s = String(t || '');
    return /https?:|www\.|:\/\/|\\|^\/|\S\/\S*\/|\/\S*\.\w/i.test(s) || /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|gov|net|edu|io|cn|uk|de|jp|info|int)\b/i.test(s)
      || /\.(pdf|html?|php|aspx?|docx?|pptx?|xlsx?|zip|jpe?g|png|gif|webp|mp4)\b/i.test(s);
  }
  function stripDupExt(t, ext) {
    let x = String(t || '').trim();
    if (ext) { const e = ext.replace('.', '\\.'); x = x.replace(new RegExp(`(${e})+$`, 'i'), '').trim(); }
    return x;
  }
  function extractDoi(str) { const m = String(str || '').match(/\b(10\.\d{4,9}\/[^\s"'<>?#&]+)/); return m ? decodeURIComponent(m[1]).replace(/(\.pdf|\/(full|abstract|pdf|epdf))$/i, '').replace(/[.,;)]+$/, '') : ''; }
  function extractPmcId(url) { const m = String(url || '').match(/\/(?:pmc\/)?articles\/PMC(\d+)/i); return m ? m[1] : ''; }
  function extractPubmedId(url) { const m = String(url || '').match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i); return m ? m[1] : ''; }
  // Derive likely article (landing) pages from a PDF URL
  function articleUrlCandidates(url) {
    const out = []; let u; try { u = new URL(url); } catch { return out; }
    const add = (x) => { if (x && x !== url && !out.includes(x)) out.push(x); };
    const pmc = extractPmcId(url); if (pmc) add(`https://pmc.ncbi.nlm.nih.gov/articles/PMC${pmc}/`);
    const p = u.pathname;
    if (/\/doi\/(pdf|epdf|pdfdirect|reader)\//i.test(p)) { add(u.origin + p.replace(/\/doi\/(pdf|epdf|pdfdirect|reader)\//i, '/doi/full/')); add(u.origin + p.replace(/\/doi\/(pdf|epdf|pdfdirect|reader)\//i, '/doi/abs/')); }
    if (/sciencedirect\.com$/i.test(u.hostname)) { const m = p.match(/\/pii\/([A-Z0-9]+)/i); if (m) add(`https://www.sciencedirect.com/science/article/pii/${m[1]}`); }
    if (/springer\.com$/i.test(u.hostname) && /\/content\/pdf\//i.test(p)) add(u.origin + p.replace(/\/content\/pdf\//i, '/article/').replace(/\.pdf$/i, ''));
    if (/arxiv\.org$/i.test(u.hostname) && /^\/pdf\//i.test(p)) add(u.origin + p.replace(/^\/pdf\//i, '/abs/').replace(/\.pdf$/i, ''));
    if (/(bio|med)rxiv\.org$/i.test(u.hostname)) add(u.origin + p.replace(/\.full\.pdf$/i, '').replace(/\.pdf$/i, ''));
    const i = p.search(/\/(pdf|pdfs|pdfft|download)(\/|$)/i); if (i > 0 && p.slice(0, i).split('/').filter(Boolean).length >= 2) add(u.origin + p.slice(0, i + 1));
    return out;
  }
  function isJunkTitle(t, stem) {
    const s = String(t || '').trim();
    if (isUrlish(s)) return true;
    if (s.length < 4) return true;
    if (/\b\d+\.\.\d+\s*$/.test(s)) return true; // typesetter page ranges: "pone.0000217 1..8"
    if (!/\s/.test(s) && /[_]/.test(s) && !/[\u4e00-\u9fff]/.test(s)) return true; // snake_case token (embedded figure / tool names)
    if (/^(untitled|无标题|title|document|pdf|microsoft word|slide ?\d*)$/i.test(s)) return true;
    if (/^microsoft (word|powerpoint|excel) - /i.test(s)) return true;
    if (/\.(pdf|docx?|pptx?|xlsx?|tex|dvi|indd|qxd)$/i.test(s)) return true;
    if (stem && s.toLowerCase() === String(stem).toLowerCase()) return true;
    if (looksLikeId(s)) return true;
    return false;
  }
  function metaContent(html, names) {
    for (const n of names) {
      const re1 = new RegExp(`<meta\\b[^>]*(?:name|property)\\s*=\\s*["']${n.replace('.', '\\.')}["'][^>]*>`, 'i');
      const tag = html.match(re1)?.[0];
      if (tag) { const c = tag.match(/content\s*=\s*("([^"]*)"|'([^']*)')/i); const v = c && (c[2] ?? c[3]); if (v && v.trim()) return decodeEntities(v).trim(); }
    }
    return '';
  }
  // Returns { citation, page } from page HTML
  function parseHtmlTitles(html, baseUrl) {
    html = String(html || '');
    const citation = metaContent(html, ['citation_title', 'dc.title', 'DC.Title', 'DC.title', 'prism.title', 'eprints.title']);
    const og = metaContent(html, ['og:title', 'twitter:title']);
    const tt = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const doi = metaContent(html, ['citation_doi', 'dc.identifier', 'DC.Identifier', 'prism.doi']).replace(/^(doi:|https?:\/\/(dx\.)?doi\.org\/)/i, '');
    return { citation: citation.replace(/\s+/g, ' ').trim(), page: stripSiteSuffix(og || tt, baseUrl), doi: /^10\./.test(doi) ? doi : '' };
  }
  function bytesToLatin1(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; }
  function decodePdfString(raw) { // raw: latin1 string of bytes
    if (raw.charCodeAt(0) === 0xfe && raw.charCodeAt(1) === 0xff) { let o = ''; for (let i = 2; i + 1 < raw.length; i += 2) o += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1)); return o; }
    if (raw.charCodeAt(0) === 0xef && raw.charCodeAt(1) === 0xbb && raw.charCodeAt(2) === 0xbf) return utf8FromLatin1(raw.slice(3));
    return utf8FromLatin1(raw);
  }
  function readLiteral(s, i) { // s[i] === '('
    let depth = 1, out = ''; i++;
    while (i < s.length && depth > 0) {
      const c = s[i];
      if (c === '\\') { const n = s[i + 1];
        const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
        if (n in map) { out += map[n]; i += 2; }
        else if (/[0-7]/.test(n)) { const m = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)[0]; out += String.fromCharCode(parseInt(m, 8) & 255); i += 1 + m.length; }
        else if (n === '\r' || n === '\n') { i += 2; if (n === '\r' && s[i] === '\n') i++; }
        else { out += n || ''; i += 2; }
        continue; }
      if (c === '(') depth++; else if (c === ')') { depth--; if (!depth) break; }
      out += c; i++;
    }
    return out;
  }
  // Extract title from (partial) PDF bytes: XMP dc:title first, then Info /Title
  function extractPdfTitle(input) {
    const s = typeof input === 'string' ? input : bytesToLatin1(input);
    const cands = [];
    const xmp = s.match(/<dc:title>([\s\S]{0,4000}?)<\/dc:title>/i);
    if (xmp) { const li = xmp[1].match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i); const v = li ? li[1] : xmp[1].replace(/<[^>]+>/g, '');
      cands.push(decodeEntities(utf8FromLatin1(v)).replace(/\s+/g, ' ').trim()); }
    const re = /\/Title\s*([(<])/g; let m;
    while ((m = re.exec(s))) {
      let v;
      if (m[1] === '(') v = readLiteral(s, m.index + m[0].length - 1);
      else { if (s[m.index + m[0].length] === '<') continue; const end = s.indexOf('>', m.index + m[0].length); if (end < 0) continue;
        const hex = s.slice(m.index + m[0].length, end).replace(/[^0-9a-f]/gi, ''); v = '';
        for (let i = 0; i < hex.length; i += 2) v += String.fromCharCode(parseInt((hex.slice(i, i + 2) + '0').slice(0, 2), 16)); }
      cands.push(decodePdfString(v).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim());
    }
    return cands.find(t => !isJunkTitle(t)) || '';
  }

  async function inflate(u8) {
    for (const fmt of ['deflate', 'deflate-raw']) {
      try { const ds = new DecompressionStream(fmt); const w = ds.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {});
        const r = ds.readable.getReader(); const parts = []; let n = 0;
        while (true) { const { value, done } = await r.read(); if (done) break; parts.push(value); n += value.length; if (n > 4e6) break; }
        const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
      } catch {}
    }
    return null;
  }
  // Also inflates FlateDecode streams (object streams / XMP) present in the chunk
  async function extractPdfTitleDeep(u8) {
    const direct = extractPdfTitle(u8); if (direct) return direct;
    const s = bytesToLatin1(u8); const re = /\/FlateDecode[\s\S]{0,300}?stream\r?\n/g; let m, count = 0;
    while ((m = re.exec(s)) && count++ < 60) {
      const start = m.index + m[0].length, end = s.indexOf('endstream', start); if (end < 0) break;
      const dictStart = Math.max(0, s.lastIndexOf('<<', m.index));
      const dictEnd = s.indexOf('>>', m.index);
      const dict = s.slice(dictStart, dictEnd > dictStart ? dictEnd : m.index);
      if (/\/Subtype\s*\/Image|\/FontFile|\/Length1/.test(dict)) continue;
      // /Length is the compressed byte count. The EOL before endstream is a
      // delimiter, not payload; DecompressionStream rejects it as trailing junk.
      let dataEnd = end;
      if (!/\/Length\s+\d+\s+\d+\s+R/.test(dict)) {
        const lenM = dict.match(/\/Length\s+(\d+)/);
        if (lenM) { const n = +lenM[1]; if (n > 0 && n <= end - start) dataEnd = start + n; }
      }
      let out = await inflate(u8.subarray(start, dataEnd));
      if (!out && dataEnd > start && (s[dataEnd - 1] === '\n' || s[dataEnd - 1] === '\r')) {
        let cut = dataEnd - 1; if (s[cut] === '\n' && cut > start && s[cut - 1] === '\r') cut--;
        out = await inflate(u8.subarray(start, cut));
      }
      if (!out) continue;
      const t = extractPdfTitle(out); if (t) return t;
    }
    return '';
  }

  const api = { siteQualify, isUrlish, stripDupExt, extractDoi, extractPmcId, extractPubmedId, articleUrlCandidates, extractPdfTitleDeep, decodeEntities, stripSiteSuffix, looksLikeId, isJunkTitle, parseHtmlTitles, extractPdfTitle, truncateBytes, bytes, MAX_BYTES, sanitizeTitle, formatDate, splitExt, buildFilename, cleanOriginalStem, looksReadable, MIME_EXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ADR = api;
})(typeof self !== 'undefined' ? self : this);
