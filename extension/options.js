const DEFAULTS = { enabled: true, engine: 'auto', dateFormat: 'YYYY-MM-DD', skipReadable: false, enhanced: false, baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: '' };
const PRESETS = { deepseek: ['https://api.deepseek.com', 'deepseek-chat'], openai: ['https://api.openai.com/v1', 'gpt-4o-mini'], xai: ['https://api.x.ai/v1', 'grok-3-mini'] };
const $ = id => document.getElementById(id);
let state = { ...DEFAULTS };
const toast = (t) => { const e = $('toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 1800); };
const setStatus = (el, txt, kind, msg) => { el.hidden = false; el.className = 'status ' + kind; txt.textContent = msg; };
function originOf(u) { try { const x = new URL(u); return `${x.protocol}//${x.host}/*`; } catch { return null; } }
function markChips(box, attr, val) { box.querySelectorAll('.chip,button').forEach(b => b.classList.toggle('on', b.dataset[attr] === val)); }
function preview() { $('preview').textContent = ADR.buildFilename('microRNA exploration of proliferation pathways in stem cells', '.pdf', new Date(), state.dateFormat); }
function presetOf(u) { for (const k in PRESETS) if (PRESETS[k][0] === u) return k; return 'custom'; }
function render() {
  $('enabled').checked = state.enabled; $('skipReadable').checked = state.skipReadable; $('enhanced').checked = state.enhanced;
  $('baseUrl').value = state.baseUrl; $('model').value = state.model; $('apiKey').value = state.apiKey;
  markChips($('engineSeg'), 'v', state.engine); markChips($('dateChips'), 'v', state.dateFormat); markChips($('presets'), 'p', presetOf(state.baseUrl));
  preview();
}
const read = () => ({ ...state, enabled: $('enabled').checked, skipReadable: $('skipReadable').checked, enhanced: $('enhanced').checked,
  baseUrl: $('baseUrl').value.trim(), model: $('model').value.trim(), apiKey: $('apiKey').value.trim() });

chrome.storage.local.get(DEFAULTS).then(s => { state = s; render(); });
$('engineSeg').onclick = e => { const v = e.target.dataset.v; if (v) { state.engine = v; markChips($('engineSeg'), 'v', v); } };
$('dateChips').onclick = e => { const v = e.target.dataset.v; if (v) { state.dateFormat = v; markChips($('dateChips'), 'v', v); preview(); } };
$('presets').onclick = e => { const p = e.target.dataset.p; if (!p) return; markChips($('presets'), 'p', p); if (PRESETS[p]) { $('baseUrl').value = PRESETS[p][0]; $('model').value = PRESETS[p][1]; } else $('baseUrl').focus(); };
$('eye').onclick = () => { const i = $('apiKey'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; $('eye').textContent = show ? '隐藏' : '显示'; };
$('enabled').onchange = () => chrome.storage.local.set({ enabled: $('enabled').checked });
$('enhanced').onchange = async (e) => {
  if (e.target.checked) {
    const ok = await chrome.permissions.request({ origins: ['<all_urls>'] });
    if (!ok) { e.target.checked = false; toast('未授权，增强识别保持关闭'); return; }
  }
  await chrome.storage.local.set({ enhanced: e.target.checked }); toast(e.target.checked ? '已开启增强识别' : '已关闭增强识别');
};

$('save').onclick = async () => {
  const s = read();
  const origin = s.apiKey && s.engine !== 'builtin' ? originOf(s.baseUrl) : null;
  if (origin) { // must be called directly in the user gesture
    const ok = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
    if (!ok) toast('未授权访问 ' + origin.replace('/*', '') + '，自己的 API 将无法使用');
  }
  await chrome.storage.local.set(s); state = s; toast('✅ 设置已保存');
};
$('test').onclick = async () => {
  const s = read(), el = $('testStatus'), tx = $('testText'), origin = originOf(s.baseUrl);
  if (origin) await chrome.permissions.request({ origins: [origin] }).catch(() => false);
  setStatus(el, tx, 'idle', '正在连接…'); $('test').disabled = true;
  chrome.runtime.sendMessage({ type: 'testConnection', settings: s }, r => {
    $('test').disabled = false;
    r?.ok ? setStatus(el, tx, 'ok', '连接成功 · 示例命名：' + r.result) : setStatus(el, tx, 'err', '连接失败：' + (r?.error || chrome.runtime.lastError?.message || '未知错误'));
  });
};

// ---- Chrome built-in AI status (options page is a document, so LanguageModel is accessible here) ----
async function checkBuiltin() {
  const el = $('builtinStatus'), tx = $('builtinText');
  if (typeof LanguageModel === 'undefined') return setStatus(el, tx, 'warn', '当前 Chrome 不支持内置 AI（需 Chrome 138+ 桌面版，且满足硬件要求），将使用自己的 API 或基础命名');
  const a = await LanguageModel.availability().catch(() => 'unavailable');
  $('dlModel').hidden = !(a === 'downloadable' || a === 'downloading');
  if (a === 'available') setStatus(el, tx, 'ok', 'Chrome 内置 AI 已就绪 · 本地运行、免费、无需 Key');
  else if (a === 'downloadable') setStatus(el, tx, 'warn', '内置模型尚未下载（首次约需数 GB，建议连接 Wi‑Fi）');
  else if (a === 'downloading') setStatus(el, tx, 'warn', '内置模型下载中…');
  else setStatus(el, tx, 'err', '此设备暂不支持内置 AI，将使用自己的 API 或基础命名');
}
$('dlModel').onclick = async () => {
  const el = $('builtinStatus'), tx = $('builtinText'); $('dlModel').disabled = true;
  try {
    const s = await LanguageModel.create({ monitor(m) { m.addEventListener('downloadprogress', e => setStatus(el, tx, 'warn', `内置模型下载中… ${Math.round(e.loaded * 100)}%`)); } });
    s.destroy(); await checkBuiltin();
  } catch (e) { setStatus(el, tx, 'err', '下载失败：' + e.message); } finally { $('dlModel').disabled = false; }
};
$('testBuiltin').onclick = () => {
  const el = $('builtinStatus'), tx = $('builtinText'); setStatus(el, tx, 'idle', '内置 AI 测试中…');
  chrome.runtime.sendMessage({ type: 'testBuiltin' }, r => r?.ok ? setStatus(el, tx, 'ok', '内置 AI 正常 · 示例命名：' + r.result) : setStatus(el, tx, 'err', '内置 AI 不可用：' + (r?.error || '未知错误')));
};
checkBuiltin();

// ---- 调试日志 ----
async function renderDebug() {
  const { debugLog = [] } = await chrome.storage.local.get('debugLog'); const box = $('dbgList');
  if (!debugLog.length) { box.textContent = '暂无记录'; return; }
  box.textContent = '';
  for (const d of debugLog) {
    const div = document.createElement('div'); div.className = 'dbgItem';
    const head = document.createElement('div'); head.style.color = 'var(--text)';
    head.textContent = `${new Date(d.time).toLocaleString()} · [${d.source}] ${d.from} → ${d.to}`;
    const pre = document.createElement('pre'); pre.textContent = (d.steps || []).map(([k, v]) => `${k}: ${v}`).join('\n');
    div.append(head, pre); box.appendChild(div);
  }
}
$('dbg').addEventListener('toggle', renderDebug);
$('dbgClear').onclick = async (e) => { e.preventDefault(); await chrome.storage.local.set({ debugLog: [] }); renderDebug(); };
