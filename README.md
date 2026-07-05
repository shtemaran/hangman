# Կախաղան — Hangman (Armenian)

An Armenian word-guessing game ("Hangman") built as an installable, offline-capable
Progressive Web App. Play it in the browser or install it to your device.

**Live:** https://shtemaran.github.io/hangman/

## How it works

- Each round shows a clue and a hidden Armenian word to guess letter by letter.
- The word list lives in [`assets/words.json`](assets/words.json) as an array of
  `{ "q": "<clue/definition>", "a": "<answer word>" }` entries.
- A service worker ([`sw.js`](sw.js)) precaches the app shell so it runs offline.
- **Chromecast:** live gameplay can be cast to a TV; [`receiver.html`](receiver.html)
  is the Cast receiver app (App ID `498C37EF`).

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | App entry point |
| `app.js` | Game logic |
| `picker.js` | Word/category picker |
| `styles.css` | Styles |
| `sw.js` | Service worker (offline cache) |
| `manifest.webmanifest` | PWA manifest |
| `receiver.html` | Chromecast receiver |
| `assets/` | `words.json`, font, images |
| `icons/` | PWA icons |

## Deploying

The site is served by GitHub Pages directly from the **`master`** branch root —
push to `master` and it deploys. When changing any cached app-shell file, bump the
`CACHE` version constant in `sw.js` (e.g. `hangman-pwa-vN`) so installed PWAs pick
up the new files instead of serving a stale cache.

## History

This repo previously hosted a native Android (Eclipse-ADT) version. That code is
retired and preserved under the `android-legacy` tag (with an abandoned Gradle
rewrite under `android-gradle-wip`). The web app is now the primary implementation.
