# SimpleReaderExtension

A minimal Chrome extension that lets you manually save either the current page URL or the rendered HTML to Readwise Reader (API: `POST https://readwise.io/api/v3/save/`).

## Usage (Developer Mode)

1. Open Chrome → Extensions → enable "Developer mode"
2. Click "Load unpacked" → select this repository folder
3. Right-click the extension icon → "Options" → paste your Readwise Access Token (get it from `https://readwise.io/access_token`)
4. Open any webpage → click the extension → choose "Send current URL" or "Send rendered HTML"

## Notes

- "Send rendered HTML" prefers SimpleReader/SimpRead reading-mode content when detected, otherwise falls back to the full page HTML.
- When SimpleReader/SimpRead reading-mode is detected, MathML equations are converted into HTML using `<sub>/<sup>` (best effort). This is more readable in Readwise than raw MathML/LaTeX.
  - Limitation: copying from Readwise may flatten `<sub>/<sup>` into plain text.
- When SimpleReader/SimpRead reading-mode is detected, inline SVG content that relies on `foreignObject` is converted to plain text (best effort) to avoid broken/black SVG blocks in Readwise Reader.
- `should_clean_html` is exposed as a toggle and the last choice is remembered.
- When sending HTML with `should_clean_html` disabled, the extension ensures `title` and `author` are present to satisfy Readwise API validation.
- The extracted HTML tries to reduce size by collapsing excessive whitespace (best effort) to lower the chance of truncated saves.

## Troubleshooting

- If you see `Save failed (HTTP 400)` with `"author"` / `"title"` required:
  - Confirm `should_clean_html` is enabled, or use "Send rendered HTML" (the background worker will provide fallbacks when `should_clean_html` is not enabled).
- For API failures, the error message may include a `Debug: {...}` block (payload lengths, flags) to help diagnosis.

## Local Verification (offline)

This repo includes a large captured HTML sample for validating the SimpleReader extraction logic:

- Run: `node tests/verify_simplereader_extract.mjs`
- Input: defaults to `tests/SimpleReader.html`

## Packaging (GitHub Actions)

This repo includes a workflow at `.github/workflows/package.yml` that produces a Chrome Web Store upload zip (it does not build a `.crx`).

Triggers:

- Manual: GitHub → Actions → `Package extension` → `Run workflow`
- Automatic: push a tag matching `v*`, e.g. `git tag v0.1.0 && git push origin v0.1.0`

Artifact:

- Download `SimpleReaderExtension-<version>.zip` from the run's Artifacts section.
