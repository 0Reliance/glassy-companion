# Glassy Companion — Extension Internals

**Version:** 2.1.0
**Platform:** Chrome Extension (Manifest V3)
**Last Updated:** May 3, 2026

Technical specification of every subsystem in the Glassy Companion browser extension.

---

## 1. Architecture Overview

Glassy Companion has evolved into a multi-mode capture system that handles structured and instant knowledge intake.

```
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

```
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
    │   ├── BookmarkCard.jsx    # Quick save UI
    │   └── AppShell.jsx        # Premium layout with obsidian layering
    └── views/
        ├── SaveView.jsx        # Quick/Smart mode switcher
        └── ...
```

---

## 2. Canonical Capture Schema

Defined in `src/lib/types.js`.

| Field | Type | Purpose |
|---|---|---|
| `sourceUrl` | string | Original capture URL |
| `title` | string | Extracted or edited title |
| `contentType` | enum | Preset (article, video, repo, product, research, bookmark) |
| `captureMode` | enum | quick, smart, selection, highlight |
| `contentMarkdown` | string | Premium formatted Markdown output |
| `status` | enum | inbox, public_candidate, published |
| `visibleTags` | string[] | User tags |
| `systemTags` | string[] | Routing metadata (e.g., 'pinned') |
| `note` | string | User-provided personal note |

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

---

## 6. Testing

**Framework:** Vitest 2.1
**Verification:** Playwright (Mock Chrome environment)

Total Tests: **108**
Coverage: API, Auth, Cache, Offline Queue, Save Policy, Extractor, Formatter, Bridge.
