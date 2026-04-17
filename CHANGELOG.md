# Changelog — Glassy Companion

All notable changes to the Glassy browser extension are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.0] — 2026-04-16

### Added
- **Full Page Save** — new `SAVE_PAGE` message handler calls `saveDocument()`, which POSTs to `/api/ext/documents`. The server runs Mozilla Readability on the submitted HTML and stores the parsed article content (up to 200 KB).
- **Content extraction pipeline** — `extractor.js` content script now exports `getSelectionHtml()` (TreeWalker-based, preserves heading/list/code/blockquote structure) and `getPageText()` (full visible text). New message types `GET_SELECTION_HTML` and `GET_PAGE_HTML` allow the service worker to request these from any tab.
- **HTML selection save** — `CTX_SAVE_SELECTION` context-menu handler now requests full HTML from the content script before saving, falling back to plain text.
- **`ErrorBoundary` component** — wraps the entire popup UI; catches React render errors and shows a "Try again" screen instead of a blank panel.
- **`saveDocument()` API function** — new export in `api.js` that POSTs `{ url, title, html, text }` to `/api/ext/documents`.
- **`/api/ext/documents` server route** — new POST endpoint in `extensionRoutes.js`: accepts HTML body, runs Readability, stores result; enforces 200 KB limit and requires auth.
- **103-test suite** — three new test files added:
  - `src/lib/__tests__/auth.test.js` — 23 tests covering JWT expiry, HTTPS enforcement, email validation, network errors
  - `src/content/__tests__/extractor.test.js` — 11 tests covering message handlers, HTML extraction, meta extraction (jsdom environment)
  - `src/background/__tests__/service-worker.test.js` — 17 tests covering all message handler types and offline queue flush logic

### Changed
- **React 19.0.0** — popup upgraded from React 18 to React 19; `react`, `react-dom`, `@types/react`, `@types/react-dom` all updated.
- **Zustand 5** — state management library added (`^5.0.0`); popup index wraps `<Popup />` in `<ErrorBoundary>`.
- **`api.js` hardened** — `AbortController` timeout (30 s) on every fetch; HTTPS-only enforcement (`setBaseUrl` rejects non-HTTPS); 1-retry on 5xx/network errors; `ApiError` class exported.
- **`auth.js` hardened** — `getToken()` checks JWT `exp` claim and clears expired tokens automatically; `setBaseUrl()` rejects non-HTTPS URLs; `login()` validates email format before sending.
- **Offline queue flush lock** — `service-worker.js` uses a module-level `flushLock` flag to prevent concurrent queue flushes when alarms fire close together.
- **Note limit raised** — `/api/ext/notes` now accepts up to 50,000 characters (previously 10,000) and `html` as a valid `content_format`.
- **`QuickActions.jsx` redesigned** — "Save page" button added; broken "Save Selection" and "Open Tab" buttons removed.

### Removed
- **`SettingsPanel.jsx`** — legacy monolithic settings component removed; settings UI lives in `SettingsView.jsx`.

---

## [1.2.1] — 2026-04-04

### Fixed
- **Multi-account auth** — `verifyToken()` now sends `X-Account-Id` header and persists the active account ID so subsequent API calls are correctly scoped
- **Note content format** — notes saved from the Quick Note Composer now include `content_format: 'markdown'` to align with the dashboard's rendering
- **Price display** — service-worker notification updated to reflect the correct $15 Glassy Keep price

### Changed
- Note composer placeholder updated: "Capture a note... Markdown and pasted links are preserved."
- Character count footer now shows "Markdown supported • ⌘+Enter to save"

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
