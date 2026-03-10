# Changelog — Glassy Companion

All notable changes to the Glassy browser extension are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.1] — 2026-03-10

### Changed
- **UpsellCard price** (`src/popup/components/UpsellCard.jsx`): Updated displayed Glassy Keep price from `$9` to `$15`.

### Documentation
- **README version badge** updated to `v1.1.0`; Save All Tabs and Quick Search added to feature table and "What's New" section.

---

## [1.1.0] — 2026-03-09

### Added
- **Save All Tabs** — new button in popup header saves every HTTP/HTTPS tab in the current window to Glassy Keep; duplicate tabs are silently skipped, badge count incremented for each saved tab
- **Quick Search** — search bar in popup lets users find existing Keep bookmarks without opening the dashboard; results rendered inline with title + domain
- **Search API** — `searchBookmarks(query)` added to `src/lib/api.js`; background message handler `SEARCH_BOOKMARKS` wired in service worker

### Changed
- Background service worker now imports and dispatches `saveBookmark`, `saveNote`, and `searchBookmarks` from `api.js`
- Popup header layout updated to accommodate new action buttons

---

## [1.0.3] — 2026-03-09

### Fixed
- **Corrected production API URL** — extension was pointing at the wrong domain;
  updated to `https://glassy.fyi` (`03b2d25`)
- **Form accessibility** — improved label/input associations in `LoginCard` and
  `BookmarkCard` for screen-reader compatibility (`fa26ee1`)

### Changed
- Synchronized `package.json` version to match `manifest.json` (`9018f17`)

---

## [1.0.2] — 2026-03-06

### Fixed
- **Hardened background save handling** — rewrote `service-worker.js` to handle
  offline queuing and retry logic more robustly; added `savePolicy.js` module for
  configurable save behaviour
- **Offline queue** — added `src/lib/offlineQueue.js` with full test coverage
  (`src/lib/__tests__/offlineQueue.test.js`)

### Added
- `src/background/savePolicy.js` — dedicated save-policy module with tests
  (`src/background/__tests__/savePolicy.test.js`)

---

## [1.0.1] — 2026-02-15

### Fixed
- **Auth check shape mismatch** — popup was always redirecting to login on every
  open; fixed `authenticated` vs `ok` property check
- **Save Selection** — `GET_SELECTED_TEXT` handler was missing from content script;
  Save Selection button in QuickActions was silently doing nothing
- **CSS path** — corrected CSS link in `popup/index.html`
  (`./styles/popup.css` was incorrect)

### Added
- Extension icons (`assets/`) — 16/32/48/128 px indigo sparkle PNGs
- `scripts/zip.js` — native Node zip packager (no external dependencies)
- `showNotifications` added to `DEFAULT_SETTINGS` (was orphaned reference)
- `LICENSE` — MIT

### Changed
- `package.json` set to `"type": "module"` for clean ESM
- OG image height normalized to 100px (consistent with container)
- `BookmarkCard` title field now syncs when `pageMeta` hydrates
- Bumped version to `1.0.1` in `manifest.json` and `package.json`

---

## [1.0.0] — 2026-02-14

Initial release of Glassy Companion.

### Features
- Save current page to Glassy dashboard with one click
- Save selected text as a highlight
- QuickActions popup for fast note capture
- Offline queue with automatic retry when dashboard is unreachable
- JWT authentication synced with Glassy dashboard session
- Built with Vite + React; packaged as Manifest V3 Chrome extension
