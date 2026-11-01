# 权限说明 / Permission justifications

## Required
| Permission | Justification |
|---|---|
| `downloads` | Core feature: suggest a new filename via `downloads.onDeterminingFilename` before a file is saved. |
| `storage` | Save user settings (engine, date format, optional API key) and the last 5 renames locally. |
| `offscreen` | Chrome's built-in AI (Prompt API / Gemini Nano) is not available in service workers; an offscreen document runs it locally to generate the name. |
| `scripting` | Registers the optional "Enhanced recognition" content script only after the user grants `<all_urls>`; no script is injected otherwise. No install warning. |

## Optional (requested at runtime, on a user click)
| Host permission | When / why |
|---|---|
| `https://api.deepseek.com/*`, `https://api.openai.com/*`, `https://api.x.ai/*` | Only if the user chooses "Own API" and saves a key for that provider; requested on the Save / Test button. Custom endpoints request their own origin. |
| `<all_urls>` | Only if the user turns on "增强识别 / Enhanced recognition": lets the extension (a) read the source tab's title, (b) fetch the referring page locally to read scholarly metadata (citation_title / DC.Title / og:title), (c) re-request the first 1 MB / last 256 KB of a downloaded PDF to read its embedded title (XMP / Info), and (d) read the clicked element's alt/link text. Page/PDF processing happens in the browser. For scholarly papers it may also query NCBI E-utilities (PMC/PubMed ID) or Crossref (DOI) for the official title — only the public ID is sent, without cookies. A local debug log of the last 20 naming decisions is kept in chrome.storage.local. Offered on a welcome page after install and via a one-click card in the popup. Also needed for custom API origins. |

## Not requested
- `tabs` — dropped. Without host permission, `tabs.query` returns no title/URL, so by default names are built from the download URL, referrer, original filename and MIME type. Page title/element context become available only after the user opts in to Enhanced recognition (host permission grants tab title/url for those sites). This keeps the default install warning-free ("no special permissions" except downloads management).
- No static content scripts, no remote code, no analytics.

## Install-time warning users will see
"Manage your downloads" only.
