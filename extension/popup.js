const $ = id => document.getElementById(id);
const BADGE = { meta: ['原标题', 'builtin'], builtin: ['内置 AI', 'builtin'], api: ['AI', ''], AI: ['AI', ''], basic: ['基础', 'basic'], '备用': ['基础', 'basic'] };
const fmt = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function setState(on) { $('stateText').textContent = on ? '已开启 · 下载自动命名' : '已暂停 · 保持原文件名'; }
chrome.storage.local.get({ enabled: true, history: [] }).then(s => {
  $('enabled').checked = s.enabled; setState(s.enabled);
  const list = $('list');
  if (!s.history.length) { list.innerHTML = '<li class="empty"><div class="ic">📥</div>还没有重命名记录<br><span style="font-size:12px">下载一个文件试试吧</span></li>'; return; }
  for (const h of s.history) {
    const li = document.createElement('li'); const [bt, bc] = BADGE[h.source] || BADGE.basic;
    li.innerHTML = '<div class="nn"></div><div class="on"><span class="o"></span><span style="flex:none"><span class="badge"></span> <span class="tm"></span></span></div>';
    li.querySelector('.nn').textContent = h.to; li.querySelector('.o').textContent = h.from;
    const b = li.querySelector('.badge'); b.textContent = bt; if (bc) b.classList.add(bc);
    li.querySelector('.tm').textContent = h.time ? fmt(h.time) : '';
    list.appendChild(li);
  }
});
chrome.runtime.sendMessage({ type: 'engineStatus' }, r => {
  const st = $('status'), tx = $('statusText');
  if (!r) return;
  if (r.active === 'builtin') { st.className = 'status ok'; tx.textContent = 'Chrome 内置 AI 已就绪 · 本地运行，免费'; }
  else if (r.active === 'api') { st.className = 'status ok'; tx.textContent = '已连接自己的 AI 服务 · ' + (r.baseUrl || '').replace(/^https?:\/\//, ''); }
  else if (r.builtin === 'downloadable' || r.builtin === 'downloading') { st.className = 'status warn'; tx.textContent = '内置 AI 模型待下载 · 暂用基础命名（去设置下载）'; }
  else { st.className = 'status warn'; tx.textContent = '基础命名模式 · 使用页面标题'; }
});
$('enabled').onchange = e => { chrome.storage.local.set({ enabled: e.target.checked }); setState(e.target.checked); };
$('opt').onclick = e => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

// 增强识别 prompt card
async function enhCard() {
  const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  const { enhanced } = await chrome.storage.local.get({ enhanced: false });
  $('enh').hidden = granted && enhanced;
}
$('enhBtn').onclick = async () => {
  const ok = await chrome.permissions.request({ origins: ['<all_urls>'] });
  if (ok) { await chrome.storage.local.set({ enhanced: true }); $('enh').hidden = true; }
};
enhCard();
