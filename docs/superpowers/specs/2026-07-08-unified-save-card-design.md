# Unified Save Card — Glassy Companion UX Consolidation

**Date:** 2026-07-08
**Status:** Approved (Approach A — Progressive Disclosure)
**Owner:** Founder
**Scope:** `glassy-companion/src/popup/` — SaveView, BookmarkCard, SmartSavePanel

## Problem

The Save tab in the Companion popup currently has **two separate screens**:

1. **Quick Save** (`BookmarkCard`) — OG image header, title, collection, tags,
   collapsible note, QuickActions (Save Page / Screenshot), "Save Bookmark" button.
2. **Smart Save** (`SmartSavePanel`) — preset chips, title (again), collection
   (again), tags (again), note textarea (again), toggle chips, "Preview Content",
   "✨ Save to Glassy" button.

To switch from Quick → Smart, the user must **scroll to the bottom** of the
Quick screen and tap "✨ Switch to Smart Save". That button is buried below the
Save button, QuickActions, and the collapsed note affordance — the most
important affordance on the screen is the least visible.

Both screens also **duplicate fields** (title, collection, tags, note all
appear in both), forcing the user to re-enter data if they switch modes, and
the Smart screen alone has ~7 stacked sections in a popup capped at 580px
height → excessive scrolling.

## Goal

Consolidate Quick + Smart into **one unified `SaveCard` component** with
progressive disclosure:

- **Default (collapsed):** the fast path — title, collection, tags, Save button.
  The same essentials the 80% use case needs today.
- **Expanded:** smart controls appear inline *below* the essentials — preset
  type chips, public/pin/AI-tag toggles, content preview. One tap reveals them;
  one tap hides them.
- **No screen swap.** No duplicated fields. The same form state carries through
  both states. The primary button label shifts to reflect mode:
  `🔖 Save` (collapsed) → `✨ Smart Save` (expanded).

## Design (on-brand Glassy delivery)

### Voice & tone
- Friend, not teacher. Concrete before conceptual. Calm confidence, zero hype.
- No "Revolutionary / game-changer / seamless / AI-powered" wording.
- American spelling. Limits use amber, never red.

### Visual layout (380px popup, glassmorphic)

```
┌────────────────────────────────────────────┐
│  [OG image header · 110px · domain badge]  │
├────────────────────────────────────────────┤
│  Title input (glass-input, bold)            │
│  Collection picker                         │
│  Tag editor (with AI auto-tag toggle)       │
│  + Add personal note  (collapsed)           │
│  QuickActions: Save Page | Screenshot      │
├────────────────────────────────────────────┤
│  ⚙ Smart capture ▾  (expand toggle pill)    │
│    └─ preset chips: 🔖 📄 🎬 💻           │
│    └─ toggle chips: Public · Pin · AI-tag  │
│    └─ [📖 Preview Content] (collapsible)   │
├────────────────────────────────────────────┤
│  [ 🔖 Save ]   ← sticky bottom accent btn   │
│  [ 📋 Save all tabs in window ] (ghost)     │
└────────────────────────────────────────────┘
```

Key layout decisions:
- **Smart toggle is high up** — a single pill (`⚙ Smart capture ▾`) placed
  right after QuickActions, *before* the Save button. Always tappable, always
  visible, never requires scrolling to find. This directly fixes the user's
  complaint that "Switch to Smart Save" was buried at the bottom.
- **Save button stays at the bottom** — the primary action is always at the
  end of the form. When collapsed, the distance from the smart toggle to
  Save is just the toggle pill itself (~40px). When expanded, the smart
  controls (~120px: preset chips + toggles + preview button) push Save down
  by a small, scrollable amount. Preview is collapsible to reclaim space.
- **QuickActions remain inline** — Save Page and Screenshot keep their current
  positions and behavior (screenshot still auto-expands Smart + pre-loads
  the capture).
- **Note stays collapsed by default** behind the dashed "+ Add personal note"
  affordance — same as today's `BookmarkCard`.

### Behavior

| Trigger | State change |
|---|---|
| Popup opens (no pending capture) | Collapsed. Essentials + Save button + Smart toggle. |
| Popup opens with pending element | **Auto-expand** Smart, pre-fill structured data, show preview. |
| Popup opens with pending screenshot | **Auto-expand** Smart, stash data URL, show preview. |
| Live screenshot captured via QuickActions | **Auto-expand** Smart, pre-load screenshot. |
| User taps "⚙ Smart capture ▾" | Toggle expand/collapse. State persists for the popup session. |
| User taps Save (collapsed) | `captureMode: 'quick'`, status `inbox`, contentType from pageMeta. |
| User taps Save (expanded) | `captureMode: 'smart'`, preserves preset/toggles/preview/note. |
| User taps "Save all tabs" | Unchanged — calls `saveAllTabs()` background flow. |

### Preserved smartness (the contract)

Every piece of smart behavior built into `BookmarkCard` + `SmartSavePanel` is
preserved in the unified `SaveCard`:

1. **Draft persistence** — `glassy_bookmark_draft` storage shape (`title`,
   `notes`, `tags`, `collectionId`, `url`, `savedAt`) is written exactly as
   today; stale drafts (mismatched `url`) are discarded on restore.
2. **Capture rules pre-population** — `ruleDefaults` from `useAppState`
   (`contentType`, `projectId`, `tags`, `isPublic`) seed the form on mount when
   rules match the current URL. Seeds `contentType` preset chip, collection,
   tags, and `isPublic` toggle.
3. **Pending element capture** — `pendingElement` (markdown, textPreview,
   images) pre-fills `contentMarkdown`, sets title, collects images for the
   native gallery, auto-expands Smart, auto-shows preview.
4. **Pending / live screenshot** — `pendingScreenshot` / `liveScreenshot`
   stashes the data URL, sets `contentType: 'bookmark'`, shows inline preview,
   auto-expands Smart. Upload is **deferred to save time** (never on mount) —
   same `uploadScreenshotWithRetry` 3-attempt backoff (0.5s, 1s) used today.
5. **Content type re-fetch** — changing a preset chip calls `GET_PAGE_META`
   to refresh `structuredData` for type-aware rendering (video embed, repo
   card, article abstract).
6. **Structured data passthrough** — `pageMeta.structuredData` is preserved
   through the pipeline and sent in the payload for type-aware reader
   rendering.
7. **Tag autocomplete** — existing `TagEditor` (10-min cache, arrow-key nav,
   Enter/comma/space separators, max 10 tags) reused as-is.
8. **Collection picker** — existing `CollectionPicker` (5-min cache, inline
   create) reused as-is.
9. **AI auto-tag toggle** — preserved in `TagEditor` (compact mode) and as
   a chip in the expanded Smart section. Both control the same `aiAutoTag`
   field — keeping them in sync.
10. **Multi-account routing** — `AccountPicker` above the card stays as-is.
11. **Already-saved badge + unsavable URL guard** — unchanged.
12. **SaveToast** — unchanged (success/duplicate/error states).
13. **Content preview** — existing `ContentPreview` (Rendered/Raw modes,
    word count, reading time) reused as-is.
14. **Save all tabs** — unchanged.
15. **QuickActions** (Save Page / Screenshot) — same behavior, same component,
    same offline-queue fallback.

### Payload contract (unchanged)

The unified card produces the same payload shapes the service worker expects:

- **Quick (collapsed):**
  ```js
  { sourceUrl, canonicalUrl, title, description, coverImageUrl, favicon_url,
    siteName, author, publishedAt, contentType, captureMode: 'quick',
    status: 'inbox', note, projectIds, visibleTags, systemTags, aiAutoTag }
  ```
- **Smart (expanded):**
  ```js
  { sourceUrl, canonicalUrl, title, contentType, captureMode: 'smart',
    status: isPublic ? 'public_candidate' : 'inbox', visibleTags, note,
    projectIds, systemTags: isPinned ? ['pinned'] : [], siteName, author,
    publishedAt, coverImageUrl, favicon_url, aiAutoTag, contentMarkdown,
    structuredData, images }
  ```

## Files touched

| File | Change |
|---|---|
| `src/popup/components/SaveCard.jsx` | **NEW** — unified card merging BookmarkCard + SmartSavePanel. |
| `src/popup/views/SaveView.jsx` | Remove `mode` state, render `SaveCard` directly. Remove "Switch to Smart Save" button. |
| `src/popup/components/BookmarkCard.jsx` | **Delete** (logic moves to SaveCard). |
| `src/popup/components/SmartSavePanel.jsx` | **Delete** (logic moves to SaveCard). |
| `src/popup/styles/popup.css` | Add `.smart-toggle` pill + expand/collapse animation utilities. |
| `src/popup/components/__tests__/BookmarkCard.test.jsx` | Rename → `SaveCard.test.jsx`, keep the draft contract tests. |

## Out of scope

- NoteView, SearchView, KbSearchView, SettingsView — unchanged.
- Service worker, content script, API layer — unchanged.
- Bundle size targets — new component should stay well under the 200KB chunk
  limit (it's smaller than the two components it replaces combined).

## Success criteria

1. Single screen, no mode switch, no duplicated fields.
2. Save button visible above the fold in both collapsed and expanded states.
3. Smart controls one tap away via a always-visible toggle pill.
4. All 15 pieces of preserved smartness behave identically to v2.11.2.
5. Existing draft-persistence tests pass (contract unchanged).
6. `npm test` green. `npm run build` succeeds.
7. Popup stays under 580px max-height in collapsed state; expanded state
   scrolls naturally without forcing a screen swap.