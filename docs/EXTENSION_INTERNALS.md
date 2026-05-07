# Glassy Companion — Extension Internals

**Version:** 2.2.2
**Platform:** Manifest V3 browser extension (Chromium and Firefox release builds)
**Last Updated:** May 7, 2026

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
│   ├── service-worker.js       # Coordination: menus, keyboard, relay, premium assembly
│   └── savePolicy.js           # Error classification
├── content/
│   ├── extractor.js            # Structured extraction (Schema.org, main content)
│   └── formatter.js            # HTML-to-Markdown (Premium quality)
├── lib/
│   ├── api.js                  # Authenticated client for captures & items
│   ├── auth.js                 # JWT & session management
│   ├── cache.js                # TTL-based collections/tags cache
│   ├── constants.js            # Endpoints & storage keys
│   ├── offlineQueue.js         # Capture replay logic
│   ├── presets.js              # Typed content definitions (Article, Video, etc.)
│   ├── rules.js                # Client-side rule engine (Domain/URL patterns)
│   └── types.js                # JSDoc canonical schemas
└── popup/
    ├── Popup.jsx               # App entry
    ├── components/
    │   ├── SmartSavePanel.jsx  # Structured capture UI
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

## 6. Capture Reliability Notes

- **Same-document guard:** link saves only request page metadata/content when the target URL matches the active tab, preventing cross-page contamination.
- **Offline replay coverage:** queued `page` and `document` items replay through `saveDocument()` rather than falling back to note creation.
- **Rule safety:** invalid URLs fail closed, and domain/path rule matching now requires the intended combination instead of broad substring matches.

---

## 7. Testing

**Framework:** Vitest 2.1
**Verification:** Playwright (Mock Chrome environment)

Total Tests: **114**
Coverage: API, Auth, Cache, Offline Queue, Save Policy, Extractor, Formatter, Bridge.
