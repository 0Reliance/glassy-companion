# Glassy Companion — Extension Internals

**Version:** 2.5.0
**Platform:** Manifest V3 browser extension (Chromium and Firefox release builds)
**Last Updated:** June 1, 2026

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
│  │  Quick Save     │    ┌─────────┐        │                  │  │
│  │  Smart Save     │    │ STORAGE │        │  Context Menus   │  │
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
│   ├── extractor.js            # Structured extraction (Schema.org, main content) + error telemetry
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
    │   ├── SmartSavePanel.jsx  # Structured capture UI; screenshot upload deferred to save time
    │   ├── QuickActions.jsx    # Save Page + AI summary actions
    │   ├── BookmarkCard.jsx    # Quick save UI
    │   └── AppShell.jsx        # Premium layout with obsidian layering
    └── views/
        ├── SaveView.jsx        # Quick/Smart mode switcher
        └── ...
```

---

## 2. Canonical Capture Schema

Defined in `src/lib/types.js`.

- `sourceUrl` (string): Original capture URL.
- `title` (string): Extracted or edited title.
- `contentType` (enum): Preset (article, video, repo, product, research, bookmark).
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

## 6. Capture Reliability Notes (v2.5.0)

- **No silent capture loss:** `offscreen.js` previously called `planBackgroundSaveFailure` without importing it, causing a `ReferenceError` on every online-save failure. The missing import is now in place, so flaky-network failures are reliably queued for retry.
- **Content-script error telemetry:** `extractor.js` reports handler failures via `reportContentError()` and a `respondSync()` wrapper. A `CONTENT_SCRIPT_ERROR` message reaches a sink in the service worker. `GET_PAGE_META` has a `.catch()` — the popup no longer hangs on extraction failure.
- **O(n) offline-queue flush:** `applyFlushOutcomes({remove, increment})` applies all outcomes in a single read-modify-write. Items enqueued *during* a flush are preserved because the helper re-reads at apply time. The offscreen flusher is pure; the service worker is the single queue-mutation owner.
- **Instance-aware screenshot URLs:** `uploadCaptureImage()` resolves the server's host-relative path against the *configured* base URL, so screenshots embed the user's actual instance (glassy.fyi, self-hosted, or dev) rather than a hardcoded host.
- **Deferred screenshot upload:** `SmartSavePanel` no longer uploads the screenshot on mount. Upload is deferred to save time with a 3-attempt bounded backoff and inline error surfacing. Cancelling a capture never leaves an orphaned server-side image.
- **Idempotent premium markdown:** `assemblePremiumMarkdown()` skips re-prepending an already-assembled header and strips duplicate leading H1 from page-extracted content. Canonical and Published metadata lines are added.
- **Same-document guard:** link saves only request page metadata/content when the target URL matches the active tab, preventing cross-page contamination.
- **Offline replay coverage:** queued `page` and `document` items replay through `saveDocument()` rather than falling back to note creation.
- **Rule safety:** invalid URLs fail closed, and domain/path rule matching now requires the intended combination instead of broad substring matches.

---

## 7. Testing

**Framework:** Vitest 3
**Verification:** Playwright (Mock Chrome environment)

Total Tests: **143** (12 test files)
Coverage: API, Auth, Cache, Offline Queue (`applyFlushOutcomes` batch flush), Save Policy, Extractor + error telemetry, Formatter, Bridge, Screenshot upload pipeline, Offscreen document lifecycle.
