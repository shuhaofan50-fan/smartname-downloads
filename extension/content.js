(() => {
  const txt = (s, n = 400) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const meta = (p) => document.querySelector(`meta[property="${p}"],meta[name="${p}"]`)?.content || '';
  function capture(target) {
    if (!target || !target.closest) return;
    const img = target.closest('img') || target.querySelector?.('img');
    const link = target.closest('a');
    const media = target.closest('video,audio');
    const fig = target.closest('figure');
    let heading = '';
    for (let el = target; el && el !== document.body && !heading; el = el.parentElement) {
      heading = txt(el.querySelector?.('h1,h2,h3')?.textContent, 400);
    }
    const data = {
      alt: txt(img?.alt), title: txt(img?.title || link?.title || media?.title),
      linkText: txt(link?.innerText), ariaLabel: txt(target.closest('[aria-label]')?.getAttribute('aria-label')),
      caption: txt(fig?.querySelector('figcaption')?.textContent), heading,
      ogTitle: txt(meta('og:title')), ogDescription: txt(meta('og:description') || meta('description'), 400)
    };
    for (const k in data) if (!data[k]) delete data[k];
    try { chrome.runtime.sendMessage({ type: 'elementContext', data }); } catch (e) {}
  }
  document.addEventListener('contextmenu', e => capture(e.target), true);
  document.addEventListener('mousedown', e => { if (e.button === 0) capture(e.target); }, true);
})();
