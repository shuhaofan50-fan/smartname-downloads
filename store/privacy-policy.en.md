# Privacy Policy — SmartName Downloads (智能下载命名)
_Last updated: 2026-11-01_

SmartName Downloads renames files you download to a readable title plus the download date.

**What it processes.** For each download: the file's URL, referrer, original filename and type. If you turn on *Enhanced recognition*, also the source page's title/description and the text of the image or link you clicked. To find a paper's exact title, the extension may also re-load the source page and the beginning/end of the PDF directly in your browser (using your normal login cookies, as the page itself would) and read the title metadata. This happens locally; the fetched content is not stored or sent anywhere.

**Where it is processed.**
- **Chrome built-in AI (default):** processed on your device by Gemini Nano. Nothing is sent to us, Google, or any third party.
- **Basic naming:** processed locally, nothing is sent anywhere.
- **Your own API (optional):** only if you enter your own key, the information above is sent to the AI provider you selected (e.g. DeepSeek, OpenAI, xAI) solely to generate the name, under that provider's privacy policy.

**Paper lookups (Enhanced recognition only).** When a downloaded file looks like a scholarly article, the extension may send only its public identifier — a PubMed/PMC ID to NCBI E-utilities (eutils.ncbi.nlm.nih.gov) or a DOI to Crossref (api.crossref.org) — to look up the official title. No cookies, personal data or file contents are sent.

**What is stored.** Settings, your optional API key, and the last 5 renames, in `chrome.storage.local` on your device only. Uninstalling removes them.

**What we don't do.** No accounts, no servers of our own, no analytics, no tracking, no ads, no sale or sharing of data. File contents are never read or uploaded.

**Contact:** shuhaofan50@gmail.com
