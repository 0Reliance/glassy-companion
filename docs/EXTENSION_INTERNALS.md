# Glassy Companion — Extension Internals

**Version:** 1.2.0
**Platform:** Chrome Extension (Manifest V3), Firefox (planned)
**Last Updated:** April 1, 2026

Technical specification of every subsystem in the Glassy Companion browser extension. Intended as a development guide and troubleshooting reference.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Manifest & Permissions](#2-manifest--permissions)
3. [Service Worker (Background)](#3-service-worker-background)
4. [Content Script — Extractor](#4-content-script--extractor)
5. [API Client Layer](#5-api-client-layer)
6. [Authentication System](#6-authentication-system)
7. [Cache System](#7-cache-system)
8. [Offline Queue](#8-offline-queue)
9. [Save Policy — Error Classification](#9-save-policy--error-classification)
10. [Popup UI Architecture](#10-popup-ui-architecture)
11. [Message Passing Protocol](#11-message-passing-protocol)
12. [Build System](#12-build-system)
13. [Testing](#13-testing)
14. [Troubleshooting Guide](#14-troubleshooting-guide)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     BROWSER CONTEXT                              │
│                                                                  │
│  ┌─────────────────┐    chrome.runtime     ┌──────────────────┐  │
│  │   POPUP (React) │ ◄──── messages ─────► │  SERVICE WORKER  │  │
│  │                 │                       │  (Background)    │  │
│  │  useAppState    │    ┌─────────┐        │                  │  │
│  │  useExtBridge   │    │ STORAGE │        │  Context Menus   │  │
│  │  BookmarkCard   │    │ local   │        │  Alarm Handler   │  │
│  │  NoteView       │    │ session │        │  Badge Manager   │  │
│  │  SearchView     │    └─────────┘        │  Queue Flusher   │  │
│  └─────────────────┘         ▲             └────────┬─────────┘  │
│                              │                      │            │
│  ┌─────────────────┐         │              ┌───────▼────────┐   │
│  │  CONTENT SCRIPT │         │              │   API CLIENT   │   │
│  │  (extractor.js) │         │              │   (api.js)     │   │
│  │                 │         │              │                │   │
│  │  Meta extract   │         │              │  apiFetch()    │   │
│  │  Text select    │─────────┘              │  + auth header │   │
│  │  Body text      │                        │  + account hdr │   │
│  └─────────────────┘                        └───────┬────────┘   │
│                                                     │            │
└─────────────────────────────────────────────────────┼────────────┘
                                                      │ HTTPS
                                              ┌───────▼────────┐
                                              │  GLASSY SERVER │
                                              │  /api/ext/*    │
                                              │  glassy.fyi    │
                                              └────────────────┘
```

### File Tree

```
src/
├── background/
│   ├── service-worker.js       # Service worker: menus, alarms, message handler, saves
│   └── savePolicy.js           # Error classification for retry/drop decisions
├── content/
│   └── extractor.js            # Content script: DOM metadata + text extraction
├── lib/
│   ├── api.js                  # Fetch wrapper with auth + account headers
│   ├── auth.js                 # JWT token, user cache, account ID management
│   ├── cache.js                # Collections & tags cache with TTL
│   ├── constants.js            # Storage keys, API paths, defaults
│   └── offlineQueue.js         # Persistent save queue for offline/retry
└── popup/
    ├── index.html / index.jsx  # React entry point
    ├── Popup.jsx               # Root component, view router, settings overlay
    ├── hooks/
    │   ├── useAppState.js      # Central state: auth, routing, save status
    │   └── useExtensionBridge.js  # Message protocol to service worker
    ├── components/
    │   ├── AppShell.jsx        # Header + tab navbar + layout
    │   ├── BookmarkCard.jsx    # Bookmark form (title, notes, tags, collection)
    │   ├── LoginCard.jsx       # Email/password login form
    │   ├── CollectionPicker.jsx # Dropdown to select/create collection
    │   ├── TagEditor.jsx       # Tag input with autocomplete + AI toggle
    │   ├── QuickActions.jsx    # Quick action buttons
    │   ├── SaveToast.jsx       # Success/error/duplicate toast
    │   ├── UpsellCard.jsx      # Glassy Keep upsell
    │   └── SettingsPanel.jsx   # User settings panel
    ├── views/
    │   ├── SaveView.jsx        # Main bookmark save view
    │   ├── NoteView.jsx        # Text note composer with draft persistence
    │   ├── SearchView.jsx      # Search bookmarks view
    │   └── SettingsView.jsx    # Settings view
    └── styles/
        └── popup.css           # Tailwind + custom styles
```

---

## 2. Manifest & Permissions

**Manifest Version:** 3

### Permissions

| Permission     | Purpose                                                |
|----------------|--------------------------------------------------------|
| `activeTab`    | Access current tab URL/title for metadata extraction   |
| `contextMenus` | Register right-click "Save to Glassy Keep" entries    |
| `storage`      | `chrome.storage.local` (persistent) + `.session` (volatile) |
| `notifications`| OS toast notifications for save results                |
| `alarms`       | 1-minute periodic alarm for offline queue flush        |
| `offscreen`    | Manifest V3 offscreen document support                 |
| `tabs`         | Query/get tab info for badge checks and metadata       |
| `sidePanel`    | Future side panel UI                                   |
| `scripting`    | Send messages to content scripts                       |

### Host Permissions

```
https://dash.0rel.com/*
https://glassy.fyi/*
https://glassy.stanz.info/*
```

These are the allowed server origins. The extension only makes API calls to these domains.

### Content Scripts

```json
{
  "matches": ["<all_urls>"],
  "js": ["src/content/extractor.js"],
  "run_at": "document_idle"
}
```

Injected on every page. Extracts metadata on demand via message — does NOT inject visible UI.

### Keyboard Shortcuts

| Command        | Shortcut (Win/Linux)    | Shortcut (Mac)         | Action                    |
|----------------|-------------------------|------------------------|---------------------------|
| `quick-save`   | `Ctrl+Shift+G`          | `Cmd+Shift+G`          | Save current page silently|
| `_execute_action` | `Ctrl+Shift+B`       | `Cmd+Shift+B`          | Open popup                |
| `quick-note`   | `Ctrl+Shift+N`          | `Cmd+Shift+N`          | Open popup to note view   |

---

## 3. Service Worker (Background)

**File:** `src/background/service-worker.js`

The service worker is the coordination hub. It handles all saves (popup-initiated and context-menu), manages the offline queue, and controls badge state.

### Lifecycle

```
chrome.runtime.onInstalled → registerContextMenus() + ensureOfflineSyncAlarm()
chrome.runtime.onStartup  → registerContextMenus() + ensureOfflineSyncAlarm()
```

The 1-minute alarm (`ALARM_OFFLINE_SYNC`) is created if it doesn't already exist. It persists across service worker restarts.

### Context Menus (4 entries)

| ID                  | Contexts           | Action                                                    |
|---------------------|--------------------|-----------------------------------------------------------|
| `CTX_SAVE_PAGE`     | `page`, `frame`    | `backgroundSave('bookmark', { url: tab.url }, tab)`       |
| `CTX_SAVE_LINK`     | `link`             | `backgroundSave('bookmark', { url: info.linkUrl }, tab)`  |
| `CTX_SAVE_SELECTION`| `selection`         | `backgroundSave('note', { content, title, tags }, tab)`  |
| `CTX_QUICK_NOTE`    | `page`, `frame`    | Opens popup + sets `glassy_open_view: 'note'` in session  |

### Background Save Flow

This is the path for context menu saves and keyboard shortcut saves (no popup interaction):

```
backgroundSave(type, payload, tab)
  │
  ├─ No token? → Notification: "Not logged in" → return
  │
  ├─ Read settings → merge aiAutoTag preference
  │
  ├─ If bookmark + no title → sendMessage to content script → GET_PAGE_META
  │
  ├─ If offline → enqueue(type, payload) → Notification: "Queued" → return
  │
  ├─ Try save
  │   ├─ Success + duplicate → Notification: "Already Saved"
  │   ├─ Success → Notification: "Saved ✓" + updateBadge(1) + cache URL
  │   └─ Error → planBackgroundSaveFailure(err)
  │       ├─ duplicate → Notification: "Already Saved"
  │       ├─ auth → enqueue + Notification: "Session Expired"
  │       ├─ entitlement → Notification: "Glassy Keep Required"
  │       └─ retryable → enqueue + Notification: "Queued"
```

### Popup-Initiated Save Flow

When the user saves from the popup UI:

```
Popup: BookmarkCard → useExtensionBridge.saveBookmark(payload)
  │
  └─ chrome.runtime.sendMessage({ type: 'SAVE_BOOKMARK', payload })
      │
      └─ Service Worker: handleMessage → saveBookmarkFromPopup(payload)
          │
          ├─ Calls api.saveBookmark(payload) directly
          ├─ On success → returns { ok: true, data }
          ├─ On duplicate (409) → returns { ok: false, status: 409, error }
          └─ On error → returns { ok: false, error, status }
              │
              └─ Popup: SaveToast shows result
```

### Offline Queue Flush (Alarm Handler)

Every 60 seconds, the alarm fires and attempts to flush queued saves:

```
chrome.alarms.onAlarm (ALARM_OFFLINE_SYNC)
  │
  ├─ !navigator.onLine → skip
  ├─ queue.length === 0 → skip
  ├─ No token → skip
  │
  └─ For each item in queue:
      ├─ item.attempts >= 5 → dequeue (give up)
      ├─ Try save
      │   ├─ Success → dequeue + synced++
      │   └─ Error → planQueueFailure(err)
      │       ├─ 'pause' (auth) → notify "Session Expired" + break loop
      │       ├─ 'retry' → incrementAttempts + continue
      │       └─ 'drop' (duplicate/entitlement/fatal) → dequeue
      │
      └─ Notify results (synced count, duplicates, etc.)
```

### Badge Management

Two badge modes coexist:

1. **Save count badge** — Purple `#6366f1`, incremented on each save. Stored in `chrome.storage.session['glassy_badge_count']`. Controlled by `settings.badgeCount`.

2. **Saved-page badge** — Green `#22c55e` checkmark `"✓"`, shown per-tab when the current page URL is already saved. Uses an in-memory LRU cache (`savedUrlCache`, max 500 entries) backed by `GET /api/ext/check-url`.

```
chrome.tabs.onActivated → checkSavedPageBadge(tabId, url)
chrome.tabs.onUpdated (URL change) → checkSavedPageBadge(tabId, url)
```

---

## 4. Content Script — Extractor

**File:** `src/content/extractor.js`
**Injection:** Every page at `document_idle`
**Visible UI:** None

### Functions

| Function            | Output                                              |
|---------------------|-----------------------------------------------------|
| `extractPageMeta()` | `{ url, title, description, og_image, favicon_url, domain }` |
| `getSelectedText()` | Selected text (max 10,000 chars)                    |
| `getPageText()`     | Cleaned body text (max 5,000 chars) for AI summary  |

### Metadata Priority

- **Title:** `og:title` → `twitter:title` → `document.title` (truncated to 500 chars)
- **Description:** `og:description` → `twitter:description` → `meta[name=description]` (truncated to 1000 chars)
- **Image:** `og:image` → `twitter:image`
- **Favicon:** `link[rel=icon]` → `link[rel=shortcut icon]` → `link[rel=apple-touch-icon]` → `{origin}/favicon.ico`

### Page Text Extraction

For AI summarization, `getPageText()` clones `document.body`, removes `<script>`, `<style>`, `<noscript>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, collapses whitespace, and truncates to 5,000 characters.

### Message Handler

| Message Type       | Response                                          |
|--------------------|---------------------------------------------------|
| `GET_PAGE_META`    | `{ meta: {...}, selectedText: string }`           |
| `GET_PAGE_TEXT`    | `{ text: string }`                                |
| `GET_SELECTED_TEXT`| `{ text: string }`                                |

---

## 5. API Client Layer

**File:** `src/lib/api.js`

### Core: `apiFetch(path, options)`

Every API call flows through this wrapper:

```
apiFetch(path, options)
  │
  ├─ getToken() → Authorization: Bearer {token}
  ├─ getBaseUrl() → resolve server URL
  ├─ getActiveAccountId() → X-Account-Id: {accountId}
  │
  ├─ fetch(url, { headers, body: JSON.stringify(...) })
  │
  ├─ Network error → throw ApiError(0, message)
  ├─ 401 → clearAuth() + throw ApiError(401, "Session expired")
  ├─ Non-2xx → extract error JSON → throw ApiError(status, message)
  ├─ 204 → return null
  └─ 2xx → return parsed JSON
```

### ApiError Class

```js
class ApiError extends Error {
  constructor(status, message) // .status: number, .message: string
}
```

### Exported Functions

| Function                        | Method | Endpoint                             | Returns                                  |
|---------------------------------|--------|--------------------------------------|------------------------------------------|
| `fetchMe()`                     | GET    | `/api/ext/me`                        | `{ email, accounts[], entitlements{}, keep: {count, limit} }` |
| `pingServer()`                  | GET    | `/api/ext/ping`                      | `boolean`                                |
| `fetchCollections()`            | GET    | `/api/ext/collections`               | `[{ id, name, emoji, description }]`    |
| `checkUrl(url)`                 | GET    | `/api/ext/check-url?url=...`         | `{ exists: boolean }`                    |
| `saveBookmark(payload)`         | POST   | `/api/ext/bookmarks`                 | `{ id, duplicate?: true }`              |
| `updateBookmark(id, updates)`   | PATCH  | `/api/ext/bookmarks/:id`             | Updated bookmark                         |
| `deleteBookmark(id)`            | DELETE | `/api/ext/bookmarks/:id`             | `null`                                   |
| `searchBookmarks(q, limit=10)`  | GET    | `/api/keep/bookmarks?q=...&limit=...`| `{ bookmarks: [...] }`                  |
| `fetchHighlights(id)`           | GET    | `/api/ext/bookmarks/:id/highlights`  | `[{ id, text, note, color }]`           |
| `createHighlight(id, payload)`  | POST   | `/api/ext/bookmarks/:id/highlights`  | New highlight                            |
| `deleteHighlight(id)`           | DELETE | `/api/ext/highlights/:id`            | `null`                                   |
| `saveNote(payload)`             | POST   | `/api/ext/notes`                     | `{ id }`                                |
| `summarizePage(payload)`        | POST   | `/api/ext/ai/summarize`              | AI summary response                      |
| `fetchTags()`                   | GET    | `/api/ext/tags`                      | Tag list                                 |
| `createCollection(name)`        | POST   | `/api/ext/collections`               | `{ id, name, emoji, description }`      |

### Payload Shapes

**Bookmark Save:**
```json
{
  "url": "https://...",
  "title": "Page Title",
  "description": "Meta description",
  "og_image": "https://...",
  "favicon_url": "https://...",
  "domain": "example.com",
  "notes": "User notes",
  "tags": ["tag1", "tag2"],
  "collection_id": 5,
  "ai_tag": true
}
```

**Note Save:**
```json
{
  "content": "Note body text",
  "title": "Optional title",
  "tags": ["tag1"],
  "collection_id": null,
  "source_url": "https://...",
  "source_title": "Page it came from"
}
```

---

## 6. Authentication System

**File:** `src/lib/auth.js`

### Storage Layout

| Key                           | Storage Tier       | Purpose                            |
|-------------------------------|--------------------|------------------------------------|
| `glassy_token`                | `session`          | JWT token (cleared on browser close)|
| `glassy_user`                 | `local`            | Cached user profile object          |
| `glassy_active_account_id`    | `local`            | Active multi-account ID             |
| `glassy_base_url`             | `local`            | Server URL (self-hosted override)   |
| `glassy_settings`             | `local`            | User preferences object             |

### Login Flow

```
login(email, password)
  │
  ├─ POST {baseUrl}/api/login  { email, password }
  │
  ├─ !res.ok → return { ok: false, error }
  │
  ├─ setToken(data.token)        → session storage
  ├─ setCachedUser(data.user)    → local storage
  └─ return { ok: true, user, token }
```

### Token Verification (Popup Mount)

```
verifyToken()
  │
  ├─ getToken() → null? → return { ok: false }
  │
  ├─ GET {baseUrl}/api/ext/me
  │   Headers: Authorization: Bearer {token}
  │            X-Account-Id: {activeAccountId}  (if available)
  │
  ├─ !res.ok → clearAuth() → return { ok: false }
  │
  ├─ setCachedUser(user)
  ├─ if user.activeAccountId && !activeAccountId → setActiveAccountId(...)
  └─ return { ok: true, user }
```

### Logout

```
clearAuth()
  ├─ chrome.storage.session.remove('glassy_token')
  ├─ chrome.storage.local.remove('glassy_user')
  └─ chrome.storage.local.remove('glassy_active_account_id')
```

### Multi-Account Header Propagation

The `apiFetch()` wrapper reads `getActiveAccountId()` and attaches `X-Account-Id` to every API request. On the server side, this header has the highest priority in account resolution (see Multi-Account Workspace Spec).

---

## 7. Cache System

**File:** `src/lib/cache.js`

### Collections Cache

| Property   | Value                  |
|------------|------------------------|
| Key        | `glassy_collections_cache` |
| TTL        | 5 minutes              |
| Shape      | `[{ id, name, emoji, description }]` |
| Fallback   | Returns stale cache on fetch error |
| Invalidate | `invalidateCollections()` — removes from storage |

### Tags Cache

| Property   | Value                  |
|------------|------------------------|
| Key        | `glassy_tags_cache`    |
| TTL        | 10 minutes             |
| Shape      | `[{ name, count, ... }]` |
| Fallback   | Returns stale cache on fetch error |
| Invalidate | `invalidateTags()` — removes from storage |

### Settings Cache

```json
{
  "aiAutoTag": true,
  "showQuickActions": true,
  "defaultCollection": null,
  "badgeCount": true,
  "showNotifications": true
}
```

Stored at `glassy_settings` in `chrome.storage.local`. `getSettings()` merges stored values with defaults. `saveSettings(partial)` does a shallow merge.

---

## 8. Offline Queue

**File:** `src/lib/offlineQueue.js`

### Queue Item Shape

```json
{
  "id": "1709289600000-a1b2c3",
  "type": "bookmark",
  "payload": { "url": "...", "title": "...", ... },
  "queuedAt": 1709289600000,
  "attempts": 0
}
```

### Storage

Persisted as a JSON array in `chrome.storage.local[STORAGE_KEYS.offlineQueue]`.

### Operations

| Function               | Purpose                                   |
|------------------------|-------------------------------------------|
| `enqueue(type, payload)` | Add item with `attempts: 0`            |
| `getQueue()`           | Return all pending items                  |
| `dequeue(id)`          | Remove item by ID (after sync or drop)    |
| `incrementAttempts(id)`| Bump attempts counter for retry tracking  |
| `clearQueue()`         | Clear entire queue (called on logout)     |
| `getQueueLength()`     | Count of pending items                    |

### Retry Policy

- **Max attempts:** 5
- **Interval:** 1 minute (alarm-based)
- Items exceeding 5 attempts are silently dequeued
- Auth failures pause the entire queue until re-login
- Duplicates and entitlement errors are dropped immediately

---

## 9. Save Policy — Error Classification

**File:** `src/background/savePolicy.js`

### Error Classification

| HTTP Status | Classification | Background Save | Queue Flush |
|-------------|---------------|-----------------|-------------|
| 409         | `duplicate`   | Don't queue     | Drop        |
| 401         | `auth`        | Queue + notify  | Pause queue |
| 403         | `entitlement` | Don't queue     | Drop        |
| 429         | `retryable`   | Queue + notify  | Retry       |
| 5xx / 0     | `retryable`   | Queue + notify  | Retry       |
| Other       | `fatal`       | Don't queue     | Drop        |

### Decision Functions

- **`classifySaveError(error)`** → Returns classification string
- **`planBackgroundSaveFailure(error)`** → Returns `{ kind, queue: boolean }`
- **`planQueueFailure(error)`** → Returns `{ kind, action: 'drop'|'retry'|'pause' }`

---

## 10. Popup UI Architecture

### Lifecycle on Open

```
Popup opens → index.jsx → createRoot() → <Popup />
  │
  └─ useAppState() initializes:
      1. view = 'loading'
      2. checkAuth() via bridge → service worker
         ├─ Not authenticated → view = 'login'
         ├─ No glassy_keep entitlement → view = 'no_entitlement'
         └─ Authenticated → determine initial view:
             ├─ Session flag 'glassy_open_view' = 'note' → view = 'note'
             ├─ URL hash #note → view = 'note'
             ├─ URL hash #search → view = 'search'
             └─ Default → view = 'save'
      3. getActiveTabMeta() → populate pageMeta
```

### View State Machine

```
loading → login → save
                → no_entitlement
       → save ← → note ← → search ← → settings
```

### Save Status State

```
idle → saving → saved
              → duplicate
              → error
    ← (resetSaveStatus)
```

### Component Hierarchy

```
<Popup>
  <AppShell>                    // Header + tab navbar
    {view === 'loading'  && <Spinner />}
    {view === 'login'    && <LoginCard />}
    {view === 'no_entitlement' && <UpsellCard />}
    {view === 'save'     && <SaveView />}
    {view === 'note'     && <NoteView />}
    {view === 'search'   && <SearchView />}
    {view === 'settings' && <SettingsView />}
  </AppShell>
  {showSettings && <SettingsPanel />}   // Overlay
```

### Key Components

**BookmarkCard** — Main save form:
- OG image preview (from page meta)
- Favicon + domain display
- Title input (pre-populated)
- CollectionPicker dropdown (select/create inline)
- TagEditor with autocomplete (max 10 tags, AI toggle)
- Optional notes textarea (toggle to reveal)
- Save button → bridge.saveBookmark(payload)

**NoteView** — Text note composer:
- Draft auto-save to `glassy_note_draft` every 500ms
- Draft restore on mount with indicator
- Title input + textarea (6 rows, max 10k chars)
- Character count + keyboard shortcut hint
- "Link to page" toggle with domain badge
- CollectionPicker + TagEditor
- `Cmd/Ctrl+Enter` to save
- Draft cleared on successful save

**SearchView** — Bookmark search:
- Debounced input (300ms)
- Results via bridge.searchBookmarks(query)
- Max 12 results, each a clickable external link
- Shows favicon + title + domain

---

## 11. Message Passing Protocol

All popup-to-background communication goes through `chrome.runtime.sendMessage`. The bridge wraps this in a Promise.

### Message Types

| Popup Function          | Message `type`       | Payload                  | Response Shape                         |
|-------------------------|----------------------|--------------------------|----------------------------------------|
| `checkAuth()`           | `CHECK_AUTH`         | —                        | `{ authenticated, user? }`             |
| `getActiveTabMeta()`    | `GET_ACTIVE_TAB_META`| —                        | `{ ok, meta?, error? }`               |
| `saveBookmark(payload)` | `SAVE_BOOKMARK`      | Bookmark object          | `{ ok, data?, error?, status? }`      |
| `saveNote(payload)`     | `SAVE_NOTE`          | Note object              | `{ ok, data?, error?, status? }`      |
| `saveAllTabs()`         | `SAVE_ALL_TABS`      | —                        | `{ ok, saved?, skipped?, total? }`    |
| `searchBookmarks(q)`    | `SEARCH_BOOKMARKS`   | `{ query: string }`      | `{ ok, bookmarks?, error? }`          |
| `logout()`              | `LOGOUT`             | —                        | `{ ok }`                               |
| `getQueueLength()`      | `GET_QUEUE_LENGTH`   | —                        | `{ ok, count? }`                       |

### Content Script Messages (service worker → content script)

| Message `type`       | Response                                |
|----------------------|-----------------------------------------|
| `GET_PAGE_META`      | `{ meta: {...}, selectedText: string }` |
| `GET_PAGE_TEXT`       | `{ text: string }`                     |
| `GET_SELECTED_TEXT`   | `{ text: string }`                     |

---

## 12. Build System

**Bundler:** Vite + `@crxjs/vite-plugin`
**Framework:** React 18
**Styling:** Tailwind CSS 3.4

### Build Commands

| Script            | Command                           | Purpose                          |
|-------------------|-----------------------------------|----------------------------------|
| `npm run dev`     | `vite build --watch --mode dev`   | Watch mode, sourcemaps, no minify|
| `npm run build`   | `vite build`                      | Production Chrome build          |
| `npm run build:firefox` | `vite build --mode firefox` | Firefox build variant            |
| `npm run zip`     | `node scripts/zip.js`             | Package for store submission     |
| `npm test`        | `vitest run`                      | Run test suite                   |

### Vite Config Highlights

- `@crxjs/vite-plugin` reads `manifest.json` and auto-bundles the service worker and content script
- Only the popup HTML is explicitly listed as a build input
- Path alias: `@` → `src/`
- Output: `dist/`
- Sourcemaps only in development mode

---

## 13. Testing

**Framework:** Vitest 2.1

### Test Files

| File                                           | Tests | Coverage                      |
|------------------------------------------------|-------|-------------------------------|
| `src/lib/__tests__/api.test.js`                | 9     | API client, error handling    |
| `src/lib/__tests__/cache.test.js`              | 13    | Cache TTL, invalidation       |
| `src/lib/__tests__/offlineQueue.test.js`       | 4     | Enqueue, dequeue, attempts    |
| `src/popup/hooks/__tests__/useExtensionBridge.test.js` | 9 | Message protocol        |
| `src/background/__tests__/savePolicy.test.js`  | 9     | Error classification          |

**Total: 44 tests** — all passing as of v1.2.0.

### Running Tests

```bash
cd glassy-companion
npm test           # vitest run (all 44 tests)
npm test -- api    # run specific test file matching "api"
```

---

## 14. Troubleshooting Guide

### Bookmarks not appearing in dashboard

**Symptom:** Save succeeds in extension, bookmarks don't show in Glassy Keep workspace.

**Root Cause Pattern:** Query shape mismatch. The server returns `{ bookmarks: [...], total }`. If the dashboard's `useBookmarksQuery` hook unwraps `.bookmarks` in its queryFn, then consumers that access `data?.bookmarks` get `undefined`.

**Check:** In `glassy-dash/src/hooks/queries/useBookmarks.js`, the queryFn should return the **full response object**, not just the array:
```js
// ✅ Correct — preserve full shape
return d && d.bookmarks ? d : { bookmarks: [], total: 0 }

// ❌ Wrong — consumers access data?.bookmarks on a raw array
return d?.bookmarks ?? (Array.isArray(d) ? d : [])
```

### Extension shows "Not logged in" after browser restart

**Cause:** JWT token is stored in `chrome.storage.session` which clears on browser close.

**Fix:** User must re-open popup and log in. The cached user profile in `chrome.storage.local` speeds up re-login UX but the token must be re-acquired.

### Offline queue not syncing

**Check list:**
1. `navigator.onLine` must be true
2. Token must exist (logged in)
3. Queue must have items (`getQueueLength()`)
4. Items under 5 attempts
5. No auth failure pausing the queue

**Debug:** In DevTools → chrome://extensions → Service Worker → Console, look for alarm handler logs.

### "Glassy Keep Required" error

**Cause:** User's `entitlements.glassy_keep` is `false`. The `requireKeep` middleware on the server returns 403 with code `NO_KEEP_ENTITLEMENT`.

**Check:** Verify `users.entitlements_json` in the database contains `"glassy_keep": true`.

### Context menus missing

**Cause:** Service worker went idle and menus weren't re-registered.

**Fix:** Menus are registered on `onInstalled` and `onStartup`. If missing, disable/re-enable the extension or reload it from `chrome://extensions`.

### X-Account-Id not sent

**Symptom:** Bookmarks save to wrong account or primary account.

**Check:**
1. `chrome.storage.local['glassy_active_account_id']` should have a value
2. `verifyToken()` should persist `user.activeAccountId` on first login
3. `apiFetch()` reads `getActiveAccountId()` and sets the header

### Badge not updating

**Check:**
1. `settings.badgeCount` is `true`
2. `chrome.storage.session['glassy_badge_count']` has a value
3. For per-tab saved-page badge, the URL must be `https://` (non-http URLs are skipped)
4. `savedUrlCache` is in-memory — lost on service worker restart
