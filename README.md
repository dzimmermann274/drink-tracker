# Drink Tracker

A personal drink tracker that runs entirely on your iPhone as a home-screen web app.
No account, no server, no App Store — all data lives on the device (IndexedDB, with a
localStorage mirror), and the app works fully offline after the first load.

## Features

- **Log Drink** — search your saved drinks; tap a row to adjust quantity/time/details,
  or tap **+** for a one-tap log with undo. If no drink matches your search, create it
  as a new saved profile (name, type, description, standard drinks, ounces, calories,
  ABV — with a std-drinks calculator from oz × ABV).
- **History** — entries grouped by day with per-day totals. Editing an entry changes
  **only that entry**; the saved drink profile is untouched (edit profiles via the
  pencil on the Log screen).
- **Statistics** — week/month/year/all-time periods with back-navigation: totals,
  averages, drink-free days, per-day bar chart with tap-for-details, breakdown by
  drink type, top drinks, and weekly-pattern chart.
- **Backup** — Settings → Export shares a JSON backup (Save to Files/Drive);
  Import restores it.

## Run locally

Any static file server works, e.g.:

```bash
python3 -m http.server 8642
```

then open http://localhost:8642.

## Install on iPhone

Host these files anywhere static (GitHub Pages, Netlify, Cloudflare Pages), open the
URL in Safari on the iPhone, then **Share → Add to Home Screen**. The service worker
(`sw.js`) precaches everything; after that the app launches and works with no
connection. When files change, bump `VERSION` in `sw.js` so clients pick up the update.

## Files

- `index.html` — app shell (home, log/search, history, statistics views)
- `styles.css` — dark iOS-style theme
- `js/data.js` — state, IndexedDB persistence, model, period/statistics math
- `js/charts.js` — hand-rolled SVG bar chart + donut
- `js/app.js` — views, bottom sheets, events
- `sw.js`, `manifest.webmanifest`, `icons/` — PWA install + offline
