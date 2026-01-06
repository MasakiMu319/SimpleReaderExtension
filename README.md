# SimpleReaderExtension

A minimal Chrome extension that lets you manually save either the current page URL or the rendered HTML to Readwise Reader (API: `POST https://readwise.io/api/v3/save/`).

## Usage (Developer Mode)

1. Open Chrome → Extensions → enable "Developer mode"
2. Click "Load unpacked" → select this repository folder
3. Right-click the extension icon → "Options" → paste your Readwise Access Token (get it from `https://readwise.io/access_token`)
4. Open any webpage → click the extension → choose "Send current URL" or "Send rendered HTML"

## Notes

- "Send rendered HTML" prefers SimpleReader/SimpRead reading-mode content when detected, otherwise falls back to the full page HTML.
- `should_clean_html` is exposed as a toggle and the last choice is remembered.

## Packaging (GitHub Actions)

This repo includes a workflow at `.github/workflows/package.yml` that produces a Chrome Web Store upload zip (it does not build a `.crx`).

Triggers:

- Manual: GitHub → Actions → `Package extension` → `Run workflow`
- Automatic: push a tag matching `v*`, e.g. `git tag v0.1.0 && git push origin v0.1.0`

Artifact:

- Download `SimpleReaderExtension-<version>.zip` from the run's Artifacts section.
