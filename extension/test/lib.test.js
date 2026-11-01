const assert = require('assert'); const L = require('../lib.js');
assert.strictEqual(L.sanitizeTitle('a/b\\c:d*e?f"g<h>i|j'), 'a b c d e f g h i j');
assert.strictEqual(L.sanitizeTitle('  "猫咪\n晒太阳"  '), '猫咪 晒太阳');
assert.strictEqual(Array.from(L.sanitizeTitle('字'.repeat(60))).length, 60);
const longEn = 'microRNA exploration of the regulatory network controlling proliferation and differentiation in human mesenchymal stem cells';
assert.strictEqual(L.buildFilename(longEn, '.pdf', new Date(2026,10,1)), longEn + '_2026-11-01.pdf');
const huge = Array(60).fill('proliferation').join(' ');
const hf = L.buildFilename(huge, '.pdf', new Date(2026,10,1));
assert.ok(L.bytes(hf) <= 240 && hf.endsWith('proliferation_2026-11-01.pdf'), hf);
const cn = L.buildFilename('细胞'.repeat(100), '.pdf', new Date(2026,10,1));
assert.ok(L.bytes(cn) <= 240 && cn.endsWith('_2026-11-01.pdf') && !cn.includes('\ufffd'));
assert.strictEqual(L.bytes(cn.replace('_2026-11-01.pdf','')) % 3, 0);
assert.strictEqual(L.sanitizeTitle('...'), '');
const d = new Date(2026, 10, 1);
assert.strictEqual(L.formatDate(d), '2026-11-01'); assert.strictEqual(L.formatDate(d, 'YYYYMMDD'), '20261101');
assert.deepStrictEqual(L.splitExt('dir/IMG_123.JPG'), { stem: 'IMG_123', ext: '.JPG' });
assert.deepStrictEqual(L.splitExt('noext'), { stem: 'noext', ext: '' });
assert.strictEqual(L.buildFilename('猫咪在窗台晒太阳', '.jpg', d), '猫咪在窗台晒太阳_2026-11-01.jpg');
assert.strictEqual(L.buildFilename('', '.pdf', d, 'YYYYMMDD'), '下载文件_20261101.pdf');
assert.strictEqual(L.looksReadable('a8f3c9d2e1b4'), false); assert.strictEqual(L.looksReadable('IMG_20261101_123456'), false);
assert.strictEqual(L.looksReadable('年度财务报告'), true); assert.strictEqual(L.looksReadable('annual-report-final'), true);
console.log('all tests passed');

// ---- v1.2 title extraction ----
const enc = s => Buffer.from(s, 'latin1');
const t1 = 'Oral Nirmatrelvir for High-Risk, Nonhospitalized Adults with Covid-19';
// Info literal (with escaped parens)
assert.strictEqual(L.extractPdfTitle(enc(`%PDF-1.7\n5 0 obj\n<< /Producer (x) /Title (${t1}) >>\nendobj`)), t1);
assert.strictEqual(L.extractPdfTitle(enc('1 0 obj<</Title (A study \\(phase 3\\) of drug X)>>')), 'A study (phase 3) of drug X');
// Hex UTF-16BE with BOM (Chinese)
const zh = '口服奈玛特韦治疗高风险新冠成人';
const hex = 'FEFF' + Buffer.from(zh, 'utf16le').swap16().toString('hex').toUpperCase();
assert.strictEqual(L.extractPdfTitle(enc(`<< /Title <${hex}> /Author (y) >>`)), zh);
// Literal UTF-16BE with BOM
const lit = '\xfe\xff' + Buffer.from('Hi Covid', 'utf16le').swap16().toString('latin1');
assert.strictEqual(L.extractPdfTitle(enc(`<</Title (${lit})>>`)), 'Hi Covid');
// XMP dc:title (UTF-8) preferred
const xmp = `<x:xmpmeta><rdf:RDF><rdf:Description><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${t1} &amp; more</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>`;
assert.strictEqual(L.extractPdfTitle(Buffer.concat([enc('%PDF-1.6\n'), Buffer.from(xmp, 'utf8'), enc('<</Title (Microsoft Word - draft.docx)>>')])), t1 + ' & more');
// Junk titles ignored
assert.strictEqual(L.extractPdfTitle(enc('<</Title (Microsoft Word - NEJM.docx)>> <</Title (untitled)>> <</Title (NEJMoa2118542)>>')), '');
// IDs
for (const x of ['NEJMoa2118542', 'a8f3e2c1', '20261101', 'IMG_1234', 'download (3)']) assert.ok(L.looksLikeId(x), x);
for (const x of [t1, '猫咪在窗台晒太阳', 'Annual report 2026']) assert.ok(!L.looksLikeId(x), x);
// HTML citation_title + suffix stripping
const html = `<html><head><title>Oral Nirmatrelvir for High-Risk, Nonhospitalized Adults with Covid-19 | NEJM</title>
<meta name="citation_title" content="Oral Nirmatrelvir for High-Risk, Nonhospitalized Adults with Covid-19"><meta property="og:title" content="x"></head></html>`;
assert.deepStrictEqual(L.parseHtmlTitles(html), { citation: t1, page: 'x', doi: '' });
assert.strictEqual(L.parseHtmlTitles(`<title>${t1} | NEJM</title>`).page, t1);
assert.strictEqual(L.parseHtmlTitles('<meta content="Gene &amp; Cell" name="DC.Title"><title>A - PubMed</title>').citation, 'Gene & Cell');
assert.strictEqual(L.stripSiteSuffix('Some trial - PubMed'), 'Some trial');
assert.strictEqual(L.stripSiteSuffix('Advances - Science of Sleep'), 'Advances - Science of Sleep');
assert.strictEqual(L.stripSiteSuffix('Effect of X | The New England Journal of Medicine'), 'Effect of X');
console.log('v1.2 title tests passed');

// ---- v1.2.1 ----
assert.ok(L.isJunkTitle('pmc.ncbi.nlm.nih.gov articles PMC8908851 pdf NEJMoa2118542.pdf'));
assert.ok(L.isJunkTitle('pmc.ncbi.nlm.nih.gov/articles/PMC8908851/pdf/NEJMoa2118542.pdf'));
assert.ok(L.isJunkTitle('https://example.org/x'));
assert.ok(!L.isJunkTitle(t1));
assert.strictEqual(L.stripDupExt('Some paper.pdf.pdf', '.pdf'), 'Some paper');
assert.deepStrictEqual(L.articleUrlCandidates('https://pmc.ncbi.nlm.nih.gov/articles/PMC8908851/pdf/NEJMoa2118542.pdf'), ['https://pmc.ncbi.nlm.nih.gov/articles/PMC8908851/']);
assert.deepStrictEqual(L.articleUrlCandidates('https://www.nejm.org/doi/pdf/10.1056/NEJMoa2118542'), ['https://www.nejm.org/doi/full/10.1056/NEJMoa2118542', 'https://www.nejm.org/doi/abs/10.1056/NEJMoa2118542']);
assert.ok(L.articleUrlCandidates('https://arxiv.org/pdf/2401.01234').includes('https://arxiv.org/abs/2401.01234'));
assert.strictEqual(L.extractDoi('https://www.nejm.org/doi/pdf/10.1056/NEJMoa2118542?download=true'), '10.1056/NEJMoa2118542');
assert.strictEqual(L.extractPmcId('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8908851/pdf/x.pdf'), '8908851');
assert.strictEqual(L.parseHtmlTitles('<meta name="citation_doi" content="10.1056/NEJMoa2118542">').doi, '10.1056/NEJMoa2118542');
// Compressed object stream containing /Title
const zlib = require('zlib');
const objstm = zlib.deflateSync(Buffer.from(`<< /Title (${t1}) /Producer (x) >>`, 'latin1'));
const pdfz = Buffer.concat([enc('%PDF-1.7\n7 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ' + objstm.length + ' >>\nstream\n'), objstm, enc('\nendstream\nendobj\n')]);
L.extractPdfTitleDeep(new Uint8Array(pdfz)).then(t => { assert.strictEqual(t, t1); console.log('v1.2.1 tests passed'); });
