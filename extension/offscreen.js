// Runs Chrome built-in AI (Gemini Nano, Prompt API) — not available in service workers.
let sessionP = null;
async function getSession() {
  if (!sessionP) sessionP = LanguageModel.create({
    initialPrompts: [{ role: 'system', content: 'You output ONLY a filename, nothing else. If a real title exists, output it COMPLETE and verbatim.' }]
  }).catch(e => { sessionP = null; throw e; });
  return sessionP;
}
chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.target !== 'offscreen') return;
  (async () => {
    if (typeof LanguageModel === 'undefined') throw new Error('LanguageModel unsupported');
    if (msg.type === 'availability') return LanguageModel.availability();
    if (msg.type === 'prompt') {
      if ((await LanguageModel.availability()) !== 'available') throw new Error('model not available');
      const base = await Promise.race([getSession(), new Promise((_, j) => setTimeout(() => j(new Error('create timeout')), 5000))]);
      const s = await base.clone();            // fresh context per download
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), msg.timeout || 8000);
      try { return await s.prompt(msg.prompt, { signal: ctrl.signal }); } finally { clearTimeout(t); s.destroy(); }
    }
  })().then(r => send({ ok: true, result: r }), e => send({ ok: false, error: String(e?.message || e) }));
  return true;
});
