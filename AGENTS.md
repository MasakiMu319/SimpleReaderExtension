# SimpleReaderExtension

A extension for simplifying enhance Readwise Reader's saving power. It can will automatically save the cleaned content from SimpleReader to Readwise Reader through Readwise public API, you don't need to manually copy and paste anymore!

## Developer Notes

- SimpleReader/SimpRead extraction lives in `popup.js` (`extractSimpleReader()`), and Readwise API saving lives in `service_worker.js` (`saveToReader()`).
- UI toggles are persisted in `chrome.storage.local`:
  - `readwise_should_clean_html`
  - `readwise_preserve_mathml` (formula rendering mode: MathML → HTML `<sub>/<sup>`, best effort)
- Known limitation: Readwise Reader does not reliably render MathML/LaTeX; formulas are rendered as normal HTML for readability, but copying out of Readwise may flatten the formatting.
- Debugging:
  - For HTTP failures, `service_worker.js` appends a `Debug: {...}` block to error messages (payload lengths, flags).
  - Offline sample: `tests/SimpleReader.html` + `node tests/verify_simplereader_extract.mjs` for extraction sanity checks.

## Skills Usage Recommendations

- Prefer invoking a skill explicitly by name when it matches the task (e.g., `$plan` for complex changes, `$AskQuestionsIfUnderspecified` when requirements are unclear).
- Follow each skill's communication guidance for outputs.

## Reference

- [Readwise Reader API Docs](https://readwise.io/reader_api)
