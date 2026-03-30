# Changelog — Glassy Companion

All notable changes to the Glassy browser extension are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.2.0] — 2026-03-30

### Added
- **Quick Note Composer** — new "Note" tab in the popup for capturing thoughts, with title, rich textarea (10k char limit), Cmd/Ctrl+Enter shortcut, character count, and draft auto-save (500ms debounce to `chrome.storage.local`)
- **Link to Current Page** — toggle in Note view attaches the active tab's URL, title, and favicon to saved notes
- **Tag Autocomplete** — `TagEditor` now fetches all tags from the server and shows a filtered dropdown as you type, with arrow-key navigation
- **Inline Collection Create** — "+ New collection" button inside `CollectionPicker` dropdown with inline name input
- **Saved Page Badge** — green "✓" badge on the extension icon when the active tab URL is already saved to Keep, with in-memory cache (500 entries)
- **AI Summary Display** — `SummaryCard` component renders AI-generated summaries with Copy and Save-as-Note actions
- **Quick Note Keyboard Shortcut** — `Ctrl+Shift+N` / `⌘+Shift+N` opens popup directly to Note view
- **Quick Note Context Menu** — right-click "New Glassy Note" opens popup in note mode
- **GET_QUEUE_LENGTH message** — service worker responds with offline queue count for logout confirmation
- **New API functions** — `updateBookmark`, `deleteBookmark`, `fetchHighlights`, `createHighlight`, `deleteHighlight`, `fetchTags`, `createCollection`
- **Tags cache** — `getTags()` / `invalidateTags()` with 10-minute TTL in `cache.js`
- **Test suite** — 3 new test files: `api.test.js` (9 tests), `cache.test.js` (13 tests), `useExtensionBridge.test.js` (9 tests); total suite now 44 tests

### Changed
- **Popup architecture** — decomposed ~500-line `Popup.jsx` monolith into `AppShell` + `useAppState` hook + 4 view components (`SaveView`, `NoteView`, `SearchView`, `SettingsView`); Popup.jsx reduced to ~80 lines
- **Tab navigation** — popup now has Save / Note / Search tabs in the header, with active tab indicator
- **Logout confirmation** — `SettingsView` checks offline queue length before logout and warns if items would be lost
- **Error handling hardened** — `apiFetch` now wraps `fetch()` in try/catch for network errors and handles non-JSON responses; `SearchView` shows error state instead of silent empty results; `SummaryCard` shows clipboard failure feedback; `NoteView` handles `chrome.storage` errors on draft restore; `SettingsView` catches mount-time failures
- **Tag normalization** — `TagEditor` now uses a shared `normalizeTag()` function for consistent input and autocomplete comparison

### Fixed
- **AI Summary display** — `QuickActions` now stores and renders AI summary results via `SummaryCard` (previously called API but never displayed result)
- **429 rate limiting** — `savePolicy.js` now classifies HTTP 429 as "retryable" instead of "fatal"

### Permissions
- Added `sidePanel` and `scripting` permissions to `manifest.json`
- Added `quick-note` command (`Ctrl+Shift+N` / `⌘+Shift+N`)

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
