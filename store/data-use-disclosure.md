# Chrome Web Store — Privacy practices tab answers

**Data collected (check boxes):**
- Website content — YES, only: download URL, referrer, original filename, MIME type, and (if Enhanced recognition is on) the page title, scholarly title meta tags of the referring page, the embedded title of a downloaded PDF, and clicked element text (all read locally). Used solely to generate the filename.
- Web history — NO (not stored or transmitted; only the single download's URL is processed in the moment).
- Personally identifiable info, health, financial, authentication, personal communications, location, user activity — NO.
  (The optional API key the user enters is stored locally only and sent only to the provider the user configured.)

**Certifications (all true):**
- I do not sell or transfer user data to third parties, outside of the approved use cases. *(When the user configures their own AI provider, download metadata is sent to that provider at the user's request — this is the user-facing feature.)*
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Remote code:** No, I am not using remote code.

**Justification text for "Website content":**
The extension reads the URL, page title and filename of a file the user is downloading to generate a readable filename. By default this is processed on-device with Chrome's built-in AI; nothing leaves the device. Only if the user adds their own API key is this metadata sent to the AI provider they chose.

**Third-party lookups:** With Enhanced recognition on, only a paper's public PMC/PubMed ID or DOI may be sent to NCBI E-utilities or Crossref to fetch its official title. No user data, cookies or file contents.
