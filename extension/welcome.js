const $ = id => document.getElementById(id);
async function refresh() {
  const ok = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  const { enhanced } = await chrome.storage.local.get({ enhanced: false });
  if (ok && enhanced) { $('st').hidden = false; $('enable').textContent = '✓ 已开启增强识别'; $('enable').disabled = true; }
}
$('enable').onclick = async () => {
  const ok = await chrome.permissions.request({ origins: ['<all_urls>'] });
  if (ok) await chrome.storage.local.set({ enhanced: true });
  refresh();
};
$('skip').onclick = e => { e.preventDefault(); window.close(); };
refresh();
