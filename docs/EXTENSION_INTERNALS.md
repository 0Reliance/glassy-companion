# Glassy Companion — Extension Internals

**Version:** 2.14.0
**Platform:** Manifest V3 browser extension (Chromium and Firefox release builds)
**Last Updated:** July 25, 2026

> **v2.14.0 install fix (2026-07-25):** The v2.14.0 release shipped with a critical install failure — `Service worker registration failed. Status code: 15` + `Uncaught TypeError: M.call is not a function`. THREE root causes, all fixed: (1) `service-worker.js` used `chrome.runtime.onSuspend?.(callback)` — this invokes the `ChromeEvent` OBJECT as a function via optional-call. esbuild compiles `?.()` to `M.call(...)`, and Event objects have no `.call` method → the SW throws on every startup. Fixed by using `onSuspend.addListener(callback)` (the standard pattern). (2) `vite.config.js` `manualChunks.ui-components` pinned popup source files → rollup hoisted React core into the SW's import graph → SW tried to evaluate React/DOM in WorkerGlobalScope. Fixed by function-form `manualChunks(id)` that only splits `node_modules`. (3) `obsidianBridge.js` had 3 `await import()` dynamic imports → Vite injected a side-effect `import"./preload-helper-*.js"` (DOM-touching) into the SW bundle. Fixed by converting to static imports. See **Build System Safety Rules** at the end of this doc.
> **v2.14.0 fixes:** Obsidian Bridge deep-fix for self-host WSL2. 8 bugs fixed: (1) `optional_host_permissions` broadened from Obsidian-only ports to any localhost port — was the prime WSL blocker; (2) offscreen doc existence now verified via `chrome.runtime.getContexts()` instead of trusting a stale cached flag; (3) `onSuspend` no longer false-flips status to disconnected (offscreen doc owns the SSE, isn't evicted on SW suspend); (4) offscreen doc uses `peekToken()` (non-destructive) instead of `getToken()` which silently cleared auth on JWT expiry; (5) permission denial now surfaces a warning banner in the popup; (6) SSE auth migrated from `?token=JWT` to one-time ticket via `POST /api/ext/obsidian-bridge/ticket`. Server-side: bridge-first routing on self-host (20 route guards + aiContext + MCP proxy fixed — they bailed before checking the bridge, making it dead code when `obsidian_token` is NULL). See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.13.0 fixes:** Obsidian Bridge MV3 reliability — SSE EventSource moved from the service worker to a persistent offscreen document (Chrome MV3 evicts SWs after ~30s, silently killing the bridge). `connectSSEInServiceWorker()` retained as legacy fallback for Firefox <120. Test Connection now delegates to the offscreen document, reporting both SSE bridge status AND direct Obsidian fetch result. `POST /api/ext/obsidian-bridge/settings` syncs the extension's Obsidian URL to the server's `users.obsidian_url` on connect. `saveBridgeSettings()` triggers reconnect on URL/token change. See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.12.0 adds:** Unified Save Card — `BookmarkCard.jsx` and `SmartSavePanel.jsx` are merged into a single `SaveCard.jsx` with progressive disclosure. The "⚙ Smart capture" toggle pill replaces the buried "Switch to Smart Save" button. Draft persistence extended with `contentType`, `isPublic`, `isPinned`, `aiAutoTag`, `smartExpanded` fields. Obsidian Bridge + push-to-vault, self-host CSP/LAN/Tailscale support. See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.11.1 fixes:** Draft stale-data race in the save card and `NoteView`. Drafts now store `url` and are discarded when the saved URL differs from the current active tab, preventing the preview card from showing the previous page's title/image. See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.11.0 adds:** Firefox Content Security Policy (matches Chrome without `wasm-unsafe-eval`), `STORAGE_QUOTA_ALARM` 6-hourly quota check with 80% warn / 95% critical auto-trim. See [CHANGELOG.md](../CHANGELOG.md) for details. NOTE: the `manualChunks` bundle splitting added in v2.11.0 was the source of install-failure root cause #2 above and has been replaced with function-form `manualChunks(id)`.
> **v2.10.0 adds:** KB 🧠 tab in the popup — `KbSearchView.jsx` with debounced hybrid search, source filter tabs (All / Bookmarks / Notes / Vault), corpus status banner, and relevance scores. See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.9.0 adds:** Two-button main bar (Save Page + Screenshot), structured capture pipeline with 4 content types, direct service-worker screenshot routing, `ensureContentScript` fallback, and interpreter re-run on type change. See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.8.0 adds:** Screenshot opens Smart Save immediately, SPA/app-page quality gate (200-char threshold), decorative image filtering. See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.7.0 adds:** Multi-account capture with account picker, pre-login server selection, unsavable-URL guard. See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.6.0 adds:** Region screenshot capture (drag-to-select overlay + DPR-accurate offscreen crop), structured image manifest (`images[]`) on captures so screenshots and element clips populate the app's native image gallery (hero + lightbox), and element-picker image harvesting with source attribution. See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.5.0 adds:** Content-script error telemetry, reliable offline-queue flush (O(n) via `applyFlushOutcomes`), deferred screenshot upload with bounded backoff, instance-aware screenshot URLs, idempotent premium markdown with Canonical/Published metadata. See [CHANGELOG.md](../CHANGELOG.md) for details.
> **v2.4.0 adds:** Screenshot upload pipeline (base64 → server WebP → embedded markdown), popup crash fix (`saveStatus`), AI summarize fix (`executeTask`).
> **v2.3.x adds:** MV3 offscreen document architecture, shared capture modules, Visual element picker, site-specific interpreters, side panel (Chrome only).

Technical specification of every subsystem in the Glassy Companion browser extension.

---

## 1. Architecture Overview

Glassy Companion has evolved into a multi-mode capture system that handles structured and instant knowledge intake across Chromium and Firefox builds.

```text
┌──────────────────────────────────────────────────────────────────┐
│                     BROWSER CONTEXT                              │
│                                                                  │
│  ┌─────────────────┐    chrome.runtime     ┌──────────────────┐  │
│  │   POPUP (React) │ ◄──── messages ─────► │  SERVICE WORKER  │  │
│  │                 │                       │  (Background)    │  │
│  │  Unified Save   │    ┌─────────┐        │                  │  │
│  │  Card (toggle)  │    │ STORAGE │        │  Context Menus   │  │
│  │  Note / Search  │    │ local   │        │  Alarm Handler   │  │
│  │                 │    │ session │        │  Badge Manager   │  │
│  └────────┬────────┘    └─────────┘        │  Queue Flusher   │  │
│           │                                └────────┬─────────┘  │
│           │                                         │            │
│  ┌────────▼────────┐         │              ┌───────▼────────┐   │
│  │  CONTENT SCRIPT │         │              │   API CLIENT   │   │
│  │  (extractor.js) │         │              │   (api.js)     │   │
│  │        +        │         │              │                │   │
│  │  FORMATTER      │─────────┘              │  apiFetch()    │   │
│  │  (formatter.js) │                        │                │   │
│  └─────────────────┘                        └───────┬────────┘   │
│                                                     │            │
└─────────────────────────────────────────────────────┼────────────┘
                                                      │ HTTPS
                                              ┌───────▼────────┐
                                              │  GLASSY SERVER │
                                              │  /api/captures │
                                              └────────────────┘
```

### File Tree

```text
src/
├── background/
│   ├── service-worker.js       # Pure broker: menus, keyboard relay, queue flusher (SW is never the capture processor on Chrome)
│   └── savePolicy.js           # Error classification
├── offscreen/
│   └── offscreen.js            # Chrome MV3 heavy-work executor: metadata extraction, markdown assembly, API calls
├── content/
│   ├── extractor.js            # Structured extraction (Schema.org, main content) + error telemetry + region/element picker relays
│   ├── elementPicker.js        # Visual element picker; harvests images[] + adds "Clipped from {site}" attribution
│   ├── regionPicker.js         # Drag-to-select region screenshot overlay (tears down before capture, sends DPR)
│   └── formatter.js            # HTML-to-Markdown (Premium quality)
├── lib/
│   ├── api.js                  # Authenticated client for captures & items
│   ├── auth.js                 # JWT & session management
│   ├── cache.js                # TTL-based collections/tags cache
│   ├── capturePipeline.js      # Shared: buildCaptureItem — used by both offscreen and SW paths
│   ├── constants.js            # Endpoints & storage keys
│   ├── offlineQueue.js         # O(n) batch-flush via applyFlushOutcomes; SW is sole mutation owner
│   ├── presets.js              # Typed content definitions (Article, Video, etc.)
│   ├── rules.js                # Client-side rule engine (Domain/URL patterns)
│   ├── types.js                # JSDoc canonical schemas
│   └── urlUtils.js             # Shared: getHostname, sameDocumentUrl
└── popup/
    ├── Popup.jsx               # App entry
    ├── components/
    │   ├── SaveCard.jsx         # Unified capture card (progressive disclosure: essentials + smart toggle)
    │   ├── QuickActions.jsx      # Save Page + Screenshot actions
    │   └── AppShell.jsx          # Premium layout with obsidian layering
    └── views/
        ├── SaveView.jsx         # Renders SaveCard directly (no mode switch)
        └── ...
```

---

## 2. Canonical Capture Schema

Defined in `src/lib/types.js`.

- `sourceUrl` (string): Original capture URL.
- `title` (string): Extracted or edited title.
- `contentType` (enum): Preset (article, video, repo, bookmark).
- `captureMode` (enum): quick, smart, selection, highlight.
- `contentMarkdown` (string): Premium formatted Markdown output.
- `status` (enum): inbox, public_candidate, published.
- `visibleTags` (string[]): User tags.
- `systemTags` (string[]): Routing metadata (e.g., 'pinned').
- `note` (string): User-provided personal note.

---

## 3. Extraction & Formatting

**File:** `src/content/extractor.js` & `src/content/formatter.js`

1. **Heuristic Detection:** Finds the main content container (`<article>`, `main`, or high-density containers).
2. **Schema.org:** Parses JSON-LD and Microdata to extract precise author, publish date, and content types.
3. **Refined Converter:** `formatter.js` recursively walks the DOM to produce clean Markdown, preserving lists, code blocks, and headings while stripping noise (ads, nav, footers).
4. **Highlights:** Captures selection text along with CSS locators for future persistent rendering.

---

## 4. Design System (Premium Glassy)

**Palette:** Deep Obsidian (#08080c)
**Depth:** Multi-layered translucency using `backdrop-filter: blur(24px)`.
**Luminous Indicators:** Active tabs and primary actions feature violet/indigo glows and spring-based transitions.
**Layout:** Fixed 380px width, responsive preset grid with multi-line wrapping.

---

## 5. API Enhancements

- `POST /api/captures`: Ingests canonical `CaptureItem`.
- `GET /api/capture-rules`: Synchronizes site-specific routing rules.
- `PATCH /api/items/:id`: Manages lifecycle transitions (Archive, Pin, Promote).
- `/api/ext/*`: Continues to serve auth, collections, tags, notes, documents, bookmark search, and AI summary helpers alongside the canonical capture flow.

---

## 6. Image & Screenshot Pipeline (v2.6.0)

Captures now carry a structured image manifest so visual content becomes a first-class object in the app rather than a tiny inline thumbnail.

- **`images[]` manifest:** `CaptureItem` (`src/lib/types.js`) carries `images[]` (`{ url, src, name, width, height }`) and optional `screenshot` metadata. `SaveCard` populates `payload.images` for screenshot and element captures (only when Smart capture is expanded). The server stores these in `images_json`, and the app renders a hero image + lightbox.
- **Full-page / visible screenshot:** captured by the service worker via `chrome.tabs.captureVisibleTab`, deferred-uploaded by `SaveCard` at save time with a 3-attempt bounded backoff.
- **Region screenshot (drag-to-select):** `content/regionPicker.js` paints a dark overlay with a selection rectangle. On mouse-up it computes the rect, **tears the overlay down first** (waiting two animation frames so the overlay is never in the capture), then sends `CAPTURE_REGION` with the rect and `window.devicePixelRatio`.
  - The service worker captures the visible tab, then delegates cropping to the offscreen document via `chrome.runtime.sendMessage({ type: 'OFFSCREEN_CROP_IMAGE', dataUrl, rect, dpr })` (same `ensureOffscreen()` delegation pattern as capture processing — there is no custom port).
  - `offscreen/offscreen.js` scales the CSS-pixel rect by `dpr` and clamps to the captured image bounds before drawing to a canvas, so crops are pixel-accurate on HiDPI / retina / zoomed displays. Falls back to the uncropped viewport image if the offscreen doc is unavailable.
- **Element picker:** `content/elementPicker.js` collects every `<img>` URL inside the selected element into `images[]` and prepends a `> Clipped from {site}` attribution header to the Markdown.

---

## 7. Capture Reliability Notes (v2.5.0)

- **No silent capture loss:** `offscreen.js` previously called `planBackgroundSaveFailure` without importing it, causing a `ReferenceError` on every online-save failure. The missing import is now in place, so flaky-network failures are reliably queued for retry.
- **Content-script error telemetry:** `extractor.js` reports handler failures via `reportContentError()` and a `respondSync()` wrapper. A `CONTENT_SCRIPT_ERROR` message reaches a sink in the service worker. `GET_PAGE_META` has a `.catch()` — the popup no longer hangs on extraction failure.
- **O(n) offline-queue flush:** `applyFlushOutcomes({remove, increment})` applies all outcomes in a single read-modify-write. Items enqueued *during* a flush are preserved because the helper re-reads at apply time. The offscreen flusher is pure; the service worker is the single queue-mutation owner.
- **Instance-aware screenshot URLs:** `uploadCaptureImage()` resolves the server's host-relative path against the *configured* base URL, so screenshots embed the user's actual instance (glassy.fyi, self-hosted, or dev) rather than a hardcoded host.
- **Deferred screenshot upload:** `SaveCard` no longer uploads the screenshot on mount. Upload is deferred to save time with a 3-attempt bounded backoff and inline error surfacing. Cancelling a capture never leaves an orphaned server-side image.
- **Idempotent premium markdown:** `assemblePremiumMarkdown()` skips re-prepending an already-assembled header and strips duplicate leading H1 from page-extracted content. Canonical and Published metadata lines are added.
- **Same-document guard:** link saves only request page metadata/content when the target URL matches the active tab, preventing cross-page contamination.
- **Offline replay coverage:** queued `page` and `document` items replay through `saveDocument()` rather than falling back to note creation.
- **Rule safety:** invalid URLs fail closed, and domain/path rule matching now requires the intended combination instead of broad substring matches.

---

## 8. Testing

**Framework:** Vitest 2
**Verification:** Playwright (Mock Chrome environment)

Total Tests: **170** (13 test files)
Coverage: API, Auth, Cache, Offline Queue (`applyFlushOutcomes` batch flush), Save Policy, Extractor + error telemetry, Formatter, Bridge, Screenshot upload pipeline, Offscreen document lifecycle.

---

## 9. Build System Safety Rules (learned from v2.14.0 install failure)

The v2.14.0 release shipped with a critical install failure caused by THREE separate bugs. All three were real and all three had to be fixed. These rules prevent recurrence.

### Rule 1: NEVER use `?.()` on Chrome event objects — use `.addListener()`

`chrome.runtime.onSuspend`, `onInstalled`, `onStartup`, `onMessage`, `contextMenus.onClicked`, `alarms.onAlarm`, `tabs.onActivated`, etc. are all `ChromeEvent` OBJECTS, not functions. They have a `.addListener()` method, not a `.call()` method.

Writing `chrome.runtime.onSuspend?.(callback)` compiles (via esbuild) to:
```js
(M = chrome.runtime.onSuspend) == null || M.call(onSuspend, callback)
```
At runtime, `M` is the Event object (not null), so `?.` does not short-circuit. `M.call(...)` throws `TypeError: M.call is not a function` because Event objects have no `.call` method. The SW fails to register → `Status code: 15` → the extension will not install.

**Always use:** `chrome.runtime.onSuspend.addListener(callback)` with a truthiness guard if the API may be absent.

### Rule 2: NEVER pin `src/popup/components/*` into `manualChunks`

Object-form `manualChunks` that lists source files (e.g. `ui-components: [resolve(..., 'AppShell.jsx'), ...]`) causes rollup to hoist shared dependencies (React core, lib functions like auth/api/cache) INTO that chunk. The service worker then imports its own lib helpers THROUGH that UI chunk, forcing React and DOM-touching UI code to evaluate in `WorkerGlobalScope` — which throws.

**Safe pattern:** function-form `manualChunks(id)` that ONLY splits `node_modules`:
```js
manualChunks(id) {
  if (id.includes('node_modules')) {
    if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
    if (id.includes('zustand')) return 'vendor-state'
  }
  // Never pin src/ files — let rollup place them with their importer
}
```

### Rule 3: NEVER use dynamic `import()` in code that ends up in the service worker bundle

Vite's `build-import-analysis` plugin sees dynamic `import()` calls and injects a side-effect `import"./preload-helper-*.js"` into the chunk. The preload-helper's top-level code calls `document.getElementsByTagName("link")` and `document.head.appendChild(...)` — DOM APIs that throw `ReferenceError: document is not defined` in `WorkerGlobalScope` → SW fails to register → `Status code: 15`.

`build.modulePreload: false` does NOT prevent this — that only controls the HTML-side polyfill, not the chunk-level `__vitePreload` injection. Vite's `getInsertPreload` gates on `!config.isWorker`, but CRXJS registers the SW as a regular Vite entry (not a Vite Worker), so `isWorker` is false and the helper IS injected.

**Fix:** convert all `await import()` in SW-reachable code to static imports. Safe as long as no circular dependency exists (verify before converting).

### Rule 4: ALWAYS verify the SW bundle after every rebuild

```sh
# SW must have ZERO 'M.call' (the onSuspend error)
grep -c 'M\.call' dist/assets/service-worker.js-*.js              # → 0
# SW must have onSuspend.addListener (correct event registration)
grep -oE 'onSuspend.*addListener' dist/assets/service-worker.js-*.js  # → present
# SW must have ZERO preload-helper references
grep -c 'preload-helper' dist/assets/service-worker.js-*.js   # → 0
# SW must have ZERO document./window. references
grep -cE 'document\.|window\.' dist/assets/service-worker.js-*.js  # → 0
# SW must have ZERO side-effect (bare) imports — grep for import" NOT just from"
grep -oE 'import"[^"]*"' dist/assets/service-worker.js-*.js | sort -u  # → empty
# Popup/sidepanel/offscreen HTML MUST keep modulepreload links (regression check)
grep -c 'rel="modulepreload"' dist/src/popup/index.html       # → 6
```

### Rule 5: Verify against the PUBLISHED artifact, not just the local dist

After `gh release upload --clobber`, download the asset from GitHub and re-verify. The local `dist/` and the published zip can diverge if the upload failed silently.

```sh
curl -sL -o check.zip "https://github.com/0Reliance/glassy-companion/releases/download/v2.14.0/glassy-companion-v2.14.0.zip"
unzip -q check.zip -d check
grep -c 'M\.call' check/assets/service-worker.js-*.js  # → 0
sha256sum check.zip  # must match local
```
