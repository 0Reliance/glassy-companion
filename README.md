# Glassy Companion

**Glassy Companion** is a premium Manifest V3 browser extension that captures bookmarks, structured Smart Save items, full-page saves, highlights, quick notes, and AI-generated summaries from any webpage directly to [Glassy](https://github.com/0Reliance/glassy).

[![Version](https://img.shields.io/badge/version-2.3.0-6366f1?style=flat-square)](manifest.json)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
![Manifest](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)

---

## Admin and Planning

- Workspace-wide admin view: `/home/pozi/WORKSPACE_ADMIN.md`
- Shared product/platform backlog: `/home/pozi/glassy-dash/docs/NEXT_STEPS.md`
- Repo-local release/distribution state: this README
- Current repo-level open item: Firefox Add-ons submission/signing remains outstanding.

---

## Features

| Feature | Description |
| --- | --- |
| **Quick Save** | Instant, one-click save of the current page with premium Markdown formatting. |
| **Smart Save** | Structured capture with 8 presets (Bookmark, Article, Video, Repo, Product, Research, Highlight, Screenshot), destination routing, and lifecycle flags. |
| **Element Picker** | Click any element on the page to capture it as rich Markdown. Hover-to-highlight with purple glow. |
| **Screenshot Capture** | Capture the visible viewport as a PNG image attached to your save. |
| **Site Interpreters** | Automatic enriched metadata for YouTube, GitHub, product pages, and scholarly articles via Schema.org. |
| **Content Preview** | Preview extracted page content as rendered HTML or raw Markdown before saving. See word count and reading time. |
| **Side Panel** | Persistent side panel (Chrome, `Ctrl+Shift+P`) that stays open while you browse. Firefox falls back to popup. |
| **AI Summary** | One-click AI-generated summary of the current page, saveable as a note. |
| **Tag Intelligence** | Local tag frequency tracking ranks suggestions by usage. Keyword extraction fallback when AI is unavailable. |
| **Duplicate Check** | Instantly see if a page is already saved with a green "Already saved" banner. |
| **Undo Save** | Delete a capture within 8 seconds of saving — no need to open Glassy. |
| **Premium Presentation** | Every save is formatted with a high-fidelity Markdown layout including site metadata, author info, and clean headers. |
| **Highlights** | Select text to capture it as a first-class highlight with CSS selector persistence. |
| **Glassy Design** | A beautiful, layered Obsidian theme with luminous indicators and glass-morphic UI. |
| **Rule Engine** | Automatic preset assignment based on domain and URL patterns from your Glassy dashboard. |
| **Offline Queue** | Saves are queued locally if your Glassy instance is unreachable and sync automatically. |
| **Cross-Browser** | Full Chrome and Firefox support. Accessibility: focus indicators, reduced motion, high contrast. |

---

## Integration Surface

- **Canonical capture API:** `POST /api/captures`, `GET /api/capture-rules`, `PATCH /api/items/:id`, `POST /api/items/:id/promote`
- **Supporting extension API:** `/api/ext/*` remains in use for auth, bookmarks, notes, tags, collections, search, documents, and AI summary flows.
- **Account-aware requests:** extension calls include `X-Account-Id` when an active account is selected.
- **Offline replay:** queued bookmark, note, capture, and page/document saves retry automatically when connectivity returns.

---

## Installation

1. Go to [**Releases**](https://github.com/0Reliance/glassy-companion/releases).
2. Download and unzip the latest release.
3. Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**.
4. Select the unzipped folder.

### Browser Support

- **Chromium** (Chrome, Edge, Brave, Arc, Opera): install from `glassy-companion-v*.zip`.
- **Firefox 121+**: install from `glassy-companion-v*-firefox.xpi` for local/user testing via `about:debugging`. Mozilla Add-ons submission/signing remains the next distribution step.

> Both builds are produced from the same source. The Firefox build uses a separate manifest (`manifest.firefox.json`) with the required Gecko extension ID and `strict_min_version: 121.0`.

---

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Quick Save | `Ctrl+Shift+G` |
| Open Popup | `Ctrl+Shift+B` |
| Quick Note | `Ctrl+Shift+N` |
| Toggle Side Panel | `Ctrl+Shift+P` (Chrome only) |

---

## Development

**Prerequisites:** Node.js 20+, npm 9+

```bash
npm install
npm run dev              # Watch mode (Chrome)
npm run build            # Production build → dist/
npm run build:firefox    # Firefox build → dist-firefox/
npm run zip              # Package Chrome → glassy-companion-v*.zip
npm run zip:firefox      # Package Firefox → glassy-companion-v*-firefox.xpi
npm test                 # Run unit tests (128 tests)
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
