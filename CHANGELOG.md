# Changelog — Glassy Companion

All notable changes to the Glassy browser extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.8.0] — 2026-06-07 — Capture Quality & Screenshot UX

Eliminates junk captures on app/SPA pages and makes screenshots a first-class
one-click workflow instead of a two-popup dance.

### Fixed
- **Save Page quality gate** — `getStructuredContent()` now scores candidate
  containers by text density (rejecting navigation-heavy / link-dense sections)
  and returns an empty string when the page yields fewer than 200 meaningful
  characters. On SPA dashboards and app pages this means the capture falls through
  to a clean bookmark instead of creating a note containing a lone decorative image
  or code block. Previously, saving the Glassy dashboard itself produced a note
  whose body was `![Custom Background](…)`.
- **Decorative image filtering** — `nodeToMarkdown` now skips images that carry
  `role="presentation"`, `role="none"`, `aria-hidden="true"`, or explicit
  sub-pixel dimensions (tracking pixels ≤ 2 px). Content images are unaffected.
- **Improved content container scoring** — `findMainContent()` now evaluates
  ARIA landmarks (`[role="main"]`, `[role="article"]`), link density, and an
  extended set of semantic class/id selectors (`post-content`, `entry-content`,
  `article-body`, etc.) before falling back to `document.body`.
- **Thin-content guard in service worker** — `SAVE_CAPTURE` now only uses
  extracted content when the markdown is > 50 chars, preventing a subsequent
  `assemblePremiumMarkdown` call from embedding the empty quality-gate result.

### Changed
- **Screenshot → immediate SmartSavePanel** — clicking the Screenshot (📸) button
  now switches the popup straight to Smart Save with the captured image
  pre-loaded, instead of storing it silently and requiring the user to re-open
  the popup. The old storage-based flow is retained as a fallback if the callback
  is absent (e.g. headless tests).
- **NoteCard lone-image guard** — notes whose content resolves to only an `<img>`
  tag with no surrounding text now show an empty preview on the card rather than
  a dangling picture with no context. The full image is still visible on note open.
- **Clearer tooltips** — Save Page tooltip notes it extracts readable text
  (best on articles); Screenshot tooltip notes it opens Smart Save for review.

### Added (Tests)
- `GET_STRUCTURED_CONTENT` tests: semantic article extraction, SPA quality-gate
  (empty return), high-link-density rejection, `[role="main"]` preference.
- `decorative image filtering` tests in formatter: `role="presentation/none"`,
  `aria-hidden`, 1×1 tracking pixel, 2 px boundary, content-image passthrough.

---

## [2.7.0] — 2026-06-07 — Multi-Account Capture & Frictionless Server Setup

Fixes the "where did my save go?" problem for users who work across multiple
account profiles, and removes the login/logout dance previously required to
point the extension at a different Glassy server.

### Added
- **Account picker** — new `src/popup/components/AccountPicker.jsx`. Multi-account
  users can now choose which account a capture is written to. The selection is
  sent to the server as the `X-Account-Id` header. Previously the extension was
  pinned to the primary account, so captures made while working in another
  profile "vanished" into the wrong account.
  - **Full variant** in Settings (`SettingsView`) with the caption "New saves
    from the extension go here."
  - **Compact variant** at the top of the Save view, visible while a save is
    pending so the destination is confirmed before committing.
- **Active-account persistence** — `SET_ACTIVE_ACCOUNT` service-worker message
  (wired through `setActiveAccount()` in `useExtensionBridge`) stores the chosen
  account and clears account-scoped caches so the next read reflects the switch.
- **Destination in confirmations** — background/context-menu save toasts now read
  "Saved to {account} ✓" when more than one account exists.
- **Pre-login server selection** — `LoginCard` now exposes a "Server" control
  *before* authentication. Users point the extension at their server (e.g. a
  self-hosted instance) up front instead of logging into the default server,
  changing the URL, and logging in again.
- **Unsavable-URL guard** — new `isUnsavableUrl()` in `src/lib/urlUtils.js`
  mirrors the server's SSRF rules (loopback, private IP ranges, metadata hosts,
  non-http(s) schemes). The Save view now shows a friendly warning for pages
  that can't be saved (e.g. `chrome://`, `localhost`) instead of letting the
  user hit an opaque server error.

### Changed
- **Account-aware cache invalidation** — `invalidateAccountScopedCaches()` drops
  both the collections and tags caches; switching accounts also clears the
  saved-URL checkmark cache so badges reflect the new account.
- **Duplicate messaging** — the 409 "already saved" toast now hints that the page
  exists *in the selected account* and that switching accounts allows saving it
  elsewhere.

---

## [2.6.0] — 2026-06-06 — Capture-to-Application Premium Experience

A major uplift for how captured artifacts reach the application. Screenshots,
element captures, and articles now render as rich, first-class objects with
native image galleries, offline-durable reader content, and content-type
visual identity.

### Added
- **Region screenshot capture** — new drag-to-select overlay in
  `src/content/regionPicker.js`. User drags a rectangle on the page; the
  service worker captures the visible viewport and delegates cropping to the
  offscreen document via `OFFSCREEN_CROP_IMAGE`. Returns a cropped PNG stored
  as a pending screenshot for the popup.
- **Structured image manifest (`images[]`) on captures** — `CaptureItem` type
  extended with `ScreenshotMeta` and `CaptureImage` typedefs. Screenshot and
  element captures now send `images[]` alongside Markdown so the app can render
  a native hero + lightbox instead of thumbnailing them to 80px.
- **Element picker image harvesting** — `elementPicker.js` now collects all
  `<img>` URLs from the selected element into `images[]` and adds a
  "Clipped from {site}" attribution header to the Markdown.

### Changed
- **SmartSavePanel** populates `payload.images` for both `screenshot` and
  `highlight` (element) content types so the server can store them in
  `images_json`.
- **QuickActions** gained a "Region" button between Screenshot and Element.

---

## [2.5.0] — 2026-06-01 — Reliability & Capture Hardening

A reliability-focused release: no captured data is silently lost, content-script
failures are now observable, the offline queue scales cleanly, and screenshot
upload is deferred and instance-aware.

### Added
- **Content-script error telemetry** — `extractor.js` now reports handler
  failures via `reportContentError()` and a `respondSync()` wrapper, relaying a
  `CONTENT_SCRIPT_ERROR` message to a new sink in the service worker instead of
  silently swallowing the error. `GET_PAGE_META` gained a missing `.catch()` so
  the popup no longer hangs on extraction failure.

### Fixed
- **Invalid `offscreen` key in manifest.json** (2026-06-02 post-release fix).
  Chrome MV3 rejects unknown `manifest.json` keys. The block
  `"offscreen": { "reason": ["WORKERS"], ... }` was declared in the manifest
  even though offscreen documents must be created programmatically via
  `chrome.offscreen.createDocument()`. Removed from `manifest.json`; the service
  worker already handled runtime creation correctly. Fixed, rebuilt, and
  re-uploaded to the v2.5.0 release. CRXJS 2.4.0 has no code path that
  re-injects this key.
- **Failed online saves were never queued (silent data loss).** `offscreen.js`
  called `planBackgroundSaveFailure` without importing it, throwing a
  `ReferenceError` on every online-save failure — so a capture that failed on a
  flaky network was dropped instead of queued for retry. Added the missing
  import.
- **Screenshot uploads orphaned images on cancel.** `SmartSavePanel` uploaded
  the screenshot on panel mount, so opening then cancelling left an unreferenced
  image on the server. Upload is now deferred to save time with a bounded
  3-attempt backoff and inline error surfacing.
- **Embedded screenshots pointed at a hardcoded host.** `uploadCaptureImage()`
  now resolves the server's host-relative path against the *configured* base
  URL, so screenshots embed the user's actual instance (glassy.fyi, self-hosted,
  or dev) rather than `https://glassy.fyi`.
- **Premium markdown could double its header.** `assemblePremiumMarkdown()` is
  now idempotent (skips re-prepending an already-assembled header) and strips a
  duplicate leading H1 from page-extracted content; adds Canonical/Published
  metadata lines.
- **`BookmarkCard` could throw inside a storage callback** when the extension
  context was invalidated — now guards `chrome.runtime.lastError`.

### Performance
- **Offline-queue flush is now O(n) instead of O(n²).** The alarm flush called
  `dequeue`/`incrementAttempts` per item (a full storage read+write each), and
  the offscreen flusher double-mutated the queue. A new
  `applyFlushOutcomes({remove, increment})` applies all outcomes in a single
  read-modify-write (re-reading at apply time so items enqueued *during* the
  flush survive); the offscreen flusher is now pure and the service worker is
  the single queue-mutation owner.

### Verification
- `npx vitest run` → **143 passed** (12 test files; +8 over 2.4.0)
- `npm run build` → ✓ Chrome artifact (`dist/`)

---

## [2.4.0] — 2026-05-30 — Screenshot Upload Pipeline, Popup Crash Fix

### Added
- **Screenshot upload pipeline** — Screenshots captured via QuickActions now automatically upload to the server (base64 → WebP) and are embedded as `![Screenshot](url)` in the save markdown. The SmartSavePanel shows upload progress and auto-populates title/content.
- **`uploadCaptureImage()`** — New API client function for `POST /api/ext/capture-image`.
- **`captureImage` constant** — API path for the new screenshot endpoint.

### Fixed
- **Popup crash on save completion** — `SaveView.jsx` referenced undefined variable `toastType` (ReferenceError). Changed to `saveStatus` prop, which is the actual value the SaveToast component expects.
- **AI summarize endpoint always returning 503** — `aiService.js` called `router_ai.generateContent()` which does not exist on the `ProviderRouter` class. Changed to `executeTask('text-generation', ...)`.

### Verification
- `npm test` → **129 passed** (11 test files, same as 2.3.2)
- `npm run build` → ✓ Chrome artifact (`dist/`)
- `npm run build:firefox` → ✓ Firefox artifact (`dist-firefox/`)
- `npm run zip` → `glassy-companion-v2.4.0.zip` (540 KB, 23 files)
- `npm run zip:firefox` → `glassy-companion-v2.4.0-firefox.xpi` (540 KB, 23 files)

---

## [2.3.2] — 2026-05-29

### Added
- **Content Security Policy** — Added `content_security_policy` to `manifest.json` for stricter execution isolation.

### Changed
- **MV3 Offscreen Document (refined)** — The offscreen document architecture (introduced in v2.3.1-dev) is now the exclusive save path for Chrome. The service worker delegates all capture processing to a persistent offscreen page, avoiding the Chrome MV3 30-second service worker kill window. Firefox falls back to in-service-worker processing automatically.
- **Shared Module Refactoring** — `src/lib/capturePipeline.js` and `src/lib/urlUtils.js` extracted as shared modules between service worker and offscreen document paths.
- **Code cleanup** — Inline `getHostname()`, `sameDocumentUrl()`, and `assemblePremiumMarkdown()` removed from service worker; use shared modules instead.

### Fixed
- **Offscreen doc test mocks** — Service worker tests now mock `chrome.offscreen`, `premiumMarkdown`, and `urlUtils` for proper CI coverage.
- **Extension download flow** — Firefox users now download the correct v2.3.2 XPI via the pinned version link inside the app.

### Verification
- `npm test` → **129 passed** (11 test files)
- `npm run build` → ✓ Chrome artifact (`dist/`)
- `npm run build:firefox` → ✓ Firefox artifact (`dist-firefox/`)
- `web-ext lint --source-dir=dist-firefox --self-hosted` → **0 errors**, 8 warnings (same pre-existing set as v2.3.0)

---

## [2.3.1] — 2026-05-27

### Architecture
- **MV3 Offscreen Document** — Chrome MV3 kills service workers after ~30s of inactivity. A hidden persistent offscreen document (`src/offscreen/`) now handles all heavy capture processing: content-script metadata extraction, Markdown assembly, and API calls. The service worker acts as a pure message broker, staying safely within the kill window.
- **Firefox Fallback Path** — Browsers without the `chrome.offscreen` API (Firefox MV2, Safari) fall back to in-service-worker processing via `processCaptureInServiceWorker()`. One codebase, two execution paths.
- **Shared Module Refactoring** — `src/lib/capturePipeline.js` (`buildCaptureItem`) and `src/lib/urlUtils.js` (`getHostname`, `sameDocumentUrl`) extracted to eliminate duplicate logic between the service worker and offscreen document. Both paths now produce identical capture items.
- **Content Security Policy** — Added `content_security_policy` to `manifest.json` for stricter execution isolation.

### Fixed
- **P0: Screenshot Double-Wrapping** — `GET_SCREENSHOT` response no longer double-wraps `dataUrl`; screenshots flow directly to the popup.
- **P0: Element Picker State Lost** — Selected element/screenshot state now persisted in Zustand with `persist` middleware; survives tab switch and popup close.
- **P0: Side Panel Bricked** — Removed `chrome.sidePanel.setOptions({ enabled: false })` call that globally disabled the side panel after every save.
- **P0: QuickActions Legacy Path** — "Save Page" in QuickActions now routes through the unified `SAVE_CAPTURE` pipeline instead of the legacy `SAVE_PAGE` flow.
- **Cross-Tab Metadata Leakage** — Context-menu link saves now guard against extracting metadata from the wrong tab via `sameDocumentUrl()`. Only fetches metadata when `sourceUrl` matches the active tab.

### Changed
- **Alarm Handler Deduplication** — Offline queue flush response branches collapsed from four to two.
- **`saveHighlightFromContext` Unified** — Now delegates capture to the offscreen document via `delegateCapture()`, consistent with all other save paths.
- **`flushQueueItem` Planner Fix** — Corrected to call `planQueueFailure` (which returns `{ action }`) instead of `planBackgroundSaveFailure` (which has no `.action`).

### Verification
- `npm test` → **129 passed** (11 test files)
- `npm run build` → ✓ Chrome artifact (`dist/`)
- `npm run build:firefox` → ✓ Firefox artifact (`dist-firefox/`)
- `web-ext lint --source-dir=dist-firefox --self-hosted` → **0 errors**, 8 warnings (same pre-existing set as v2.3.0)

---

## [2.3.0] — 2026-05-22

### Added
- **Visual Element Picker** — Click the 🎯 "Element" button in QuickActions to enter element-selection mode on the page. Hovering highlights page elements with a purple glow; clicking captures the element as rich Markdown. Press Escape to cancel.
- **Screenshot Capture** — 📸 "Screenshot" button in QuickActions captures the visible viewport as a PNG image and attaches it to the capture.
- **Site-Specific Interpreters** — YouTube (video metadata from Schema.org), GitHub (repo stars, language, license, description), product pages (price, brand, rating), and scholarly articles (abstract, DOI) are now automatically detected and enriched with structured metadata.
- **Side Panel Mode** (Chrome only) — Press `Ctrl+Shift+P` or use the right-click context menu to open Glassy as a persistent side panel that stays open while browsing. Falls back to the popup on Firefox.
- **Content Preview** — "Preview Content" button in Smart Save renders the extracted page Markdown as rich formatted HTML with word count and reading time estimates. Toggle between Rendered and Raw (editable) modes before saving.
- **Duplicate Pre-Flight Check** — Pages already saved to Glassy show a green "Already saved" banner on popup open, with the option to save again (update).
- **Undo Save** — After saving, an "Undo" button appears in the success toast for 8 seconds, allowing instant deletion of the last capture.
- **Tag Intelligence** — Local tag frequency tracking ranks autocomplete suggestions by usage count. Keyword extraction fallback for AI auto-tag when server-side inference is unavailable.
- **Skeleton Loading UI** — Shimmer placeholders replace the spinner during data loading.
- **Accessibility Styles** — Focus indicators, skip-link, `prefers-reduced-motion`, `prefers-contrast`, and screen-reader-only utilities.
- **Screenshot Preset** — 📸 content type available in Smart Save preset grid.

### Changed
- `extractPageMeta()` is now async to support site-specific interpreters.
- BookmarkCard and SmartSavePanel are more keyboard-navigable with visible focus rings.
- QuickActions layout expanded from 2 columns to 4 (Save Page, Screenshot, Element, AI Summary).

### Verification
- `npm test` → **129 passed** (11 test files)
- `npm run build` → ✓ Chrome artifact (`dist/`)
- `npm run build:firefox` → ✓ Firefox artifact (`dist-firefox/`)
- `web-ext lint --source-dir=dist-firefox --self-hosted` → **0 errors**, 8 warnings (3 pre-existing React innerHTML, 4 sidePanel API not in Firefox — expected, 1 data_collection_permissions advisory)

---

## [2.2.2] — 2026-05-07

### Fixed
- **"Have to log in every time"** — the JWT token and active-account selection now live in `chrome.storage.local` instead of `chrome.storage.session`. Chrome's session storage is wiped on every browser restart, which forced users to re-authenticate on every cold start; with this change the session persists until the JWT's own `exp` claim elapses or the user explicitly signs out. A one-shot migration in `getToken()` promotes any legacy session-stored token to local storage so existing users aren't logged out by the upgrade. Both stores are still cleared on `clearAuth()` for belt-and-braces hygiene.

### Changed
- **Login screen polish** — removed the redundant in-card brand badge (the header chip already shows the Glassy lockup), tightened the heading copy, increased form spacing, and added a "You'll stay signed in on this device." subtext under the Sign in button so the persistence behaviour is visible to users.

### Verification
- `npm test` → **129 passed**, including new `auth.test.js` cases asserting local-storage persistence and the legacy-token migration.
- `npm run build` → ✓ Chrome artifact (`dist/`)
- `npm run build:firefox` → ✓ Firefox artifact (`dist-firefox/`)

---

## [2.2.1] — 2026-05-05

### Fixed
- **429 retry handling** — API calls now retry once after HTTP 429 responses, honoring `Retry-After` values expressed as seconds or HTTP dates and capping the wait at 10 seconds. This keeps background saves and popup actions aligned with the server's rate-limit backoff contract instead of failing immediately during short bursts.

### Release
- Chrome and Firefox package metadata now report v2.2.1, including `manifest.json`, `manifest.firefox.json`, `package.json`, and `package-lock.json`.

### Verification
- `npm test` → **128 passed**
- `npm run build` → ✓ Chrome artifact (`dist/`)
- `npm run build:firefox` → ✓ Firefox artifact (`dist-firefox/`)
- `npm run zip` → `glassy-companion-v2.2.1.zip` (271 KB)
- `npm run zip:firefox` → `glassy-companion-v2.2.1-firefox.xpi` (271 KB)
- `web-ext lint --source-dir=dist-firefox --self-hosted` → **0 errors**, 3 warnings

## [2.2.0] — 2026-05-05

### Added
- **Firefox support** — `manifest.firefox.json` adds `browser_specific_settings.gecko` (`id: companion@glassy.fyi`, `strict_min_version: 121.0`) and switches to the `background.scripts` array form required by CRXJS's Firefox path. No source-code changes were needed: every `chrome.*` API used is available and promise-returning in Firefox MV3. `vite.config.js` selects the Firefox manifest when `--mode firefox`, emits to `dist-firefox/`. `web-ext lint` reports **0 errors** against the built artifact.
- **Capture rules pre-population** — `useAppState` now fetches `/api/capture-rules` on popup open and evaluates them against the active page URL. If any rule matches, its `contentType`, `projectId`, `tags`, and `publicCandidate` are passed as defaults to `SmartSavePanel`, automatically seeding the form before the user interacts with it.
- **AI auto-tag toggle in SmartSavePanel** — a new checkbox ("AI auto-tag") lets users enable or disable Glassy's server-side tag inference per-save. Defaults to `true` and is included in the capture payload as `aiAutoTag`.
- **Highlight context menu item** — a "Highlight selection in Glassy" entry now appears in the right-click context menu for any text selection. Triggering it ensures the page is saved (or finds the existing capture on 409), then calls `POST /api/ext/bookmarks/:id/highlights` with the selected text.
- **Richer Markdown formatter** — `src/content/formatter.js` handles tables (with header detection + column padding), fenced code blocks with language auto-detection, `<figure>`/`<figcaption>`/`<picture>`, GitHub-style task-list checkboxes, `<mark>` (`==…==`), `<kbd>`, `<del>`/`<s>`/`<strike>` (`~~`), `<sup>`, `<sub>`, `<h5>`/`<h6>`, and ordered lists that honour the `start` attribute.
- **Comprehensive error UX in QuickActions** — the AI summary action now surfaces three distinct error messages ("Can't read this page (try a regular http(s) page).", "No summary returned.", and the raw error message for unexpected failures) with a dismissible error toast.

### Changed
- **Route unification: quick and smart saves both use `SAVE_CAPTURE`** — `SaveView.handleSave` now always dispatches `SAVE_CAPTURE` when the payload has a `captureMode`, routing through the canonical `POST /api/captures` surface. The legacy `SAVE_BOOKMARK` dispatch is retained only for bare bookmark payloads without a captureMode.
- **`BookmarkCard` emits the full canonical `CaptureItem` shape** — quick saves now send `sourceUrl`, `canonicalUrl`, `coverImageUrl`, `favicon_url`, `siteName`, `author`, `publishedAt`, `contentType`, `captureMode: 'quick'`, `status: 'inbox'`, `aiAutoTag`, and `visibleTags`/`systemTags` instead of the legacy bookmark-only fields.
- **`backgroundSave` failure path is fully branched** — the service worker now handles `auth` (queue + "Sign in again" notification), `duplicate` (silent), `entitlement` ("Upgrade required"), `gone` ("Account unavailable"), and a generic fallback with the raw error message. Previously all failures produced a single generic notification.
- **`ApiError` carries the parsed response body** — `ApiError` now accepts a `body` parameter and stores it as `this.body`. `apiFetch` parses the error body once and passes it through, allowing callers (e.g. `saveHighlightFromContext`) to read the existing `id` out of a 409 response without a second fetch.
- **Badge skipped on duplicate saves** — `saveCaptureFromPopup` (and `saveBookmarkFromPopup`) now gate `updateBadge(1)` on `!result?.duplicate`, so seeing the "Already Saved" toast no longer increments the badge.
- **`savedUrlCache` cleared on LOGOUT** — prevents a re-login on a different account from showing the previous user's saved-state checkmarks on tab badges.

### Fixed
- **Duplicate `formatMarkdown` export removed** — the formatter rewrite accidentally left two identical `export function formatMarkdown` blocks; the duplicate was removed, resolving the `SyntaxError: Identifier 'formatMarkdown' has already been declared` test failure.
- **`SaveView` surfaces duplicate flag from server** — when `saveCaptureFromPopup` returns `{data: {duplicate: true}}` the popup now calls `setDuplicate()` so the "Already Saved" toast is shown correctly.

### Tests
- **10 new formatter unit tests** covering table rendering, code-fence language tags, figure/figcaption, task-list checkboxes, mark/kbd/del/sup/sub, and h5/h6.
- **`assemblePremiumMarkdown` shape test** — verifies author, source link, and personal-note sections are rendered in the SAVE_CAPTURE contentMarkdown.
- **SAVE_CAPTURE 409 → duplicate** — asserts that the result carries `{data: {duplicate: true}}` and that the badge update is skipped.
- **Rules engine additions** — tag-merging across multiple matching rules (dedup), `publicCandidate` propagation, and path-only rule matching.

### Verification
- `npm test -- --run` → **128 passed** (0 failed, 0 skipped)
- `npm run build` → ✓ Chrome artifact (`dist/`)
- `npm run build:firefox` → ✓ Firefox artifact (`dist-firefox/`)
- `npm run zip` → `glassy-companion-v2.2.0.zip` (271 KB)
- `npm run zip:firefox` → `glassy-companion-v2.2.0-firefox.xpi` (271 KB)
- `web-ext lint --source-dir=dist-firefox --self-hosted` → **0 errors**, 2 React-internal `innerHTML` warnings, 1 notice

---

## [2.1.0] — 2026-05-03

### Added
- **Canonical capture integration** — the extension now treats structured saves as first-class `CaptureItem` payloads against the dashboard's canonical capture surface: `POST /api/captures`, `GET /api/capture-rules`, `PATCH /api/items/:id`, and `POST /api/items/:id/promote`.
- **Routing regression coverage** — added tests for context-menu link saves and offline page replay to lock in the new capture/document behavior.
- **Formatter + rule engine coverage** — new tests cover absolute URL formatting in markdown output and stricter domain/path rule evaluation.

### Changed
- **Release metadata aligned to 2.1.0** — `manifest.json`, `package.json`, docs, and release-facing UI now report the same version.
- **Rule evaluation is stricter and safer** — domain rules now match exact domains/subdomains instead of lookalike suffixes, path rules combine correctly with domain rules, and invalid URLs return an empty routing result instead of throwing.
- **HTML formatting resolves live URLs** — markdown conversion now uses resolved `node.href` / `node.src` values so relative links and images are preserved as absolute URLs in captures.

### Fixed
- **Queued page/document saves now replay through `saveDocument()`** — offline page saves no longer fall through the queue flusher as notes.
- **Link context-menu saves no longer scrape the surrounding page** — background capture now checks whether the target URL matches the active tab before requesting page metadata/content, preventing link saves from inheriting the wrong title or body.

### Verification
- `npm test -- --run` → **114 passed**
- `npm run build` → success

## [2.0.5] — 2026-04-28

### Added
- **Offline queue size cap** (`MAX_QUEUE_SIZE = 200`) — `src/lib/offlineQueue.js` now refuses new enqueue requests once the queue holds 200 items, throwing a typed `QueueFullError` (code `QUEUE_FULL`). Background save handler in `src/background/service-worker.js` catches this and surfaces a "Glassy — Queue Full" notification instead of silently failing or eventually tripping `chrome.storage.local` quota. Older queued items are preserved; new saves are dropped with user feedback.
- **Response body size guard** (`MAX_RESPONSE_BYTES = 5 MiB`) — `apiFetch` in `src/lib/api.js` now reads response bodies via `text()` first, bounds them at 5 MiB, and throws `ApiError(413, 'Response too large.')` if exceeded. Protects the popup process from a rogue/oversized API response ballooning extension memory. Falls back to `res.json()` for callers/mocks that only implement `json()`.

### Fixed
- **`activeAccountId` race on JWT expiry** — `apiFetch` previously ran `getToken()` and `getApiContext()` in parallel via `Promise.all`. `getToken()` may call `clearAuth()` when it detects an expired JWT, which removes `activeAccountId` from session storage; the parallel read could therefore see a stale `activeAccountId` and send the next request with the wrong account header. Sequenced the calls so `getToken()` completes (and any `clearAuth()` runs) before `getApiContext()` reads the active account.

### Removed
- **`build:firefox` script** — removed in v2.0.5; fully re-added in v2.2.0 with Firefox manifest, CRXJS `browser: 'firefox'` config, and separate `dist-firefox/` output.

---

## [2.0.4] — 2026-04-26

### Fixed
- **Saves no longer retry forever for deleted accounts** (P1-11) — `classifySaveError` in `src/background/savePolicy.js` now treats HTTP `410 Gone` (`ACCOUNT_INACTIVITY_DELETED`) as a terminal `gone` outcome. `planBackgroundSaveFailure` returns `{ queue: false }` and `planQueueFailure` returns `{ action: 'drop' }` for this kind, so a queued save against a server-side-deleted account is dropped instead of retried indefinitely.
- **`activeAccountId` is session-scoped** (P2-15) — `getActiveAccountId` / `setActiveAccountId` / `getApiContext` in `src/lib/auth.js` now read from and write to `chrome.storage.session` instead of `chrome.storage.local`. The active-account choice now tracks the JWT lifetime instead of persisting across browser restarts, removing a class of "wrong account selected after restart" bugs. `clearAuth` still removes the legacy `chrome.storage.local` key so users upgrading from 2.0.3 are migrated cleanly.

---

## [2.0.3] — 2026-04-22

### Fixed
- **SAVE_PAGE no longer fails on SPAs / auth-gated / Cloudflare-protected pages** — the popup's "Save page" action previously sent only `{url, title}` to the server, which then re-fetched the URL and ran Mozilla Readability. For single-page apps (Twitter/X, Reddit, Gmail) the server received an empty JS shell, for auth-gated pages it received a login redirect, and for Cloudflare-protected pages it received a challenge page — all of which caused Readability to return null and the request to fail with a 422 "Could not extract readable content" error. The popup now extracts the page's visible text via the existing `GET_PAGE_TEXT` content-script message and includes it in the SAVE_PAGE payload. The server route `/api/ext/documents` now has two paths: when client-extracted content is present it is saved directly (skipping the URL re-fetch), otherwise it falls back to the original Readability flow for traditional articles.

---

## [2.0.1] — 2026-04-17

### Fixed
- **Offline queue `'page'` type now flushes correctly** — the queue flush loop in `service-worker.js` previously sent queued page-save items to `saveNote()` (wrong API call). Added an explicit `'page'` branch that correctly routes to `saveDocument()`.
- **`handleSummarize` callback/promise mismatch** — `QuickActions.jsx` was using the old callback-based `chrome.tabs.sendMessage(id, msg, callback)` API inside an `async` function. Errors thrown inside the callback couldn't propagate to the outer `try/catch`. Replaced with the promise-based form and a `finally` block for reliable `setSummaryLoading(false)` cleanup.
- **`setSaved` unused parameter removed** — `useAppState.js` declared `setSaved((url) => ...)` but never used `url`. Parameter removed to eliminate dead code and misleading intent.
- **Tags sent as array** — `BookmarkCard.jsx` was sending `tags: tags.join(',')` (comma-separated string) to the API. Server `sanitizeTags()` accepted both formats but the canonical type is an array. Now sends `tags: tags` directly.

### Changed
- **Permissions cleanup** — removed unused `"offscreen"` and `"sidePanel"` permissions from `manifest.json`.
- **API call batching** — `api.js` now batch-reads `baseUrl` + `activeAccountId` in a single `chrome.storage.local.get()` via `getApiContext()`, replacing three sequential storage reads per request.
- **Badge debounce** — `tabs.onActivated` and `tabs.onUpdated` now use a 250 ms per-tab debounce before calling `checkSavedPageBadge()` to avoid flooding the API on rapid tab switching.
- **Badge batch update** — `saveAllTabsFromPopup()` accumulates a saved count and calls `updateBadge(saved)` once instead of once per tab.
- **Search debounce** — `SearchView.jsx` search input debounce increased from 300 ms to 500 ms.

### Added
- **`getApiContext()` helper** — new export in `auth.js` that reads `baseUrl` and `activeAccountId` in a single storage call.
- **`API_PATHS` completeness** — `highlights`, `highlightsDelete`, `tags`, `documents`, and `searchBookmarks` paths added to `constants.js`. All extension API endpoints are now centralized.
- **`searchBookmarks` path comment** — clarifies that the search function intentionally uses the `/api/keep/bookmarks` surface (which natively supports `?q=` full-text search) rather than the ext API.

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
