# Glassy Companion

**Glassy Companion** is a Manifest V3 browser extension that lets you save bookmarks, highlights, and AI-generated summaries from any webpage directly to [Glassy](https://github.com/0Reliance/glassy) — your self-hosted digital workspace.

[![Version](https://img.shields.io/badge/version-1.2.0-6366f1?style=flat-square)](manifest.json)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)](#)
[![Browsers](https://img.shields.io/badge/Chrome%20%7C%20Edge%20%7C%20Opera%20%7C%20Firefox-supported?style=flat-square)](#supported-browsers)

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
  - [Chrome / Edge / Opera](#chrome--edge--opera)
  - [Firefox](#firefox)
- [Features](#features)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Building from Source](#building-from-source)
- [Configuration](#configuration)
- [Supported Browsers](#supported-browsers)
- [Contributing](#contributing)
- [License](#license)

---

## Requirements

- A running [Glassy](https://github.com/0Reliance/glassy) instance (self-hosted)
- Chrome 88+, Edge 88+, Opera 74+, or Firefox 109+
- A Glassy account with **Glassy Keep** entitlement

---

## Installation

### Download the Latest Release

1. Go to the [**Releases**](https://github.com/0Reliance/glassy-companion/releases) page.
2. Download the latest `glassy-companion-vX.X.X.zip`.
3. Unzip the file to a folder on your computer (e.g. `~/glassy-companion`).

---

### Chrome / Edge / Opera

1. Open your browser's extensions page:
   - **Chrome** → `chrome://extensions`
   - **Edge** → `edge://extensions`
   - **Opera** → `opera://extensions`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the unzipped `glassy-companion` folder.
5. The Glassy icon will appear in your browser toolbar.
6. Click the icon and **sign in** with your Glassy account.

---

### Firefox

1. Open `about:debugging` in a new tab.
2. Click **This Firefox** in the left sidebar.
3. Click **Load Temporary Add-on…**
4. Navigate to the unzipped folder and select `manifest.json`.
5. The Glassy icon appears in the toolbar — click it and sign in.

> **Note:** Firefox temporary add-ons are removed when the browser restarts. For permanent installation, a signed `.xpi` release will be available in a future update.

---

## Features

| Feature | Description |
|---|---|
| **Quick Save** | One-click save of the current page URL, title, and favicon to Glassy Keep |
| **Save All Tabs** | Save every open HTTP/HTTPS tab in one click — already-saved duplicates are skipped automatically |
| **Quick Search** | Search your Glassy Keep bookmarks inline in the popup without opening the dashboard |
| **AI Tagging** | Automatically suggests relevant tags using the AI provider configured in your Glassy instance |
| **Quick Note Composer** | Capture thoughts directly from the popup — title, textarea, auto-save drafts, Cmd+Enter shortcut, link to current page |
| **Highlight Capture** | Select text on any page and save it as a highlighted bookmark with context |
| **Tag Autocomplete** | Tags are fetched from your Keep and suggested as you type in the tag editor |
| **Inline Collection Create** | Create new collections on the fly from the collection picker dropdown |
| **Saved Page Badge** | Green ✓ badge on the extension icon when the current page is already in your Keep |
| **AI Summary** | Generate an AI summary of the current page with one click — copy or save as a note |
| **Keyboard Shortcuts** | Quick-save (`Ctrl+Shift+G`), open popup (`Ctrl+Shift+B`), quick note (`Ctrl+Shift+N`) |
| **Offline Queue** | Saves are queued locally if your Glassy instance is temporarily unreachable |
| **Smart Retry Policy** | Background saves classify auth, duplicate, entitlement, retryable, and fatal failures so the queue can retry or stop intentionally |
| **Collections** | Choose which Glassy Keep collection to save into right from the popup |
| **Notifications** | Optional browser notifications on successful save or error |

---

## Keyboard Shortcuts

| Action | Windows / Linux | macOS |
|---|---|---|
| Quick-save current page | `Ctrl+Shift+G` | `⌘+Shift+G` |
| Open Glassy Companion popup | `Ctrl+Shift+B` | `⌘+Shift+B` |
| Open Quick Note | `Ctrl+Shift+N` | `⌘+Shift+N` |

Shortcuts can be customised in your browser's extension keyboard shortcuts settings:
- Chrome: `chrome://extensions/shortcuts`
- Edge: `edge://extensions/shortcuts`

---

## Building from Source

**Prerequisites:** Node.js 20+, npm 9+

```bash
git clone https://github.com/0Reliance/glassy-companion.git
cd glassy-companion
npm install

# Development (watch mode)
npm run dev

# Run the extension test suite
npm test

# Production build (Chrome/Edge/Opera)
npm run build

# Firefox build
npm run build:firefox

# Create distributable zip
npm run zip
```

The built extension will be in `dist/`. Load it as an unpacked extension (see [Installation](#installation) above).

---

## What's New in v1.2.0 (March 30, 2026)

- **Quick Note Composer** — New "Note" tab for capturing thoughts directly from the popup. Supports titles, auto-save drafts, page linking, collection & tag assignment, and Cmd/Ctrl+Enter to save.
- **Tag Autocomplete** — Start typing a tag and see suggestions from your existing tags, navigable with arrow keys.
- **Inline Collection Create** — Create new collections without leaving the popup.
- **Saved Page Badge** — A green ✓ appears on the extension icon when the current page is already saved.
- **AI Summary Card** — AI summaries now display in the popup with Copy and Save-as-Note buttons.
- **Keyboard Shortcut** — `Ctrl+Shift+N` / `⌘+Shift+N` opens the popup straight to Note view.
- **Popup Redesign** — Tabbed interface (Save / Note / Search) with a cleaner component architecture.
- **Logout Safety** — Warns before signing out if offline queue has unsaved items.
- **Error Handling** — Network failures, rate limits (429), and edge cases handled across all API calls.

### Previous: v1.1.0 (March 9, 2026)

- **Save All Tabs** — Save every open HTTP/HTTPS tab in one click. Already-saved duplicates (matched by URL) are detected and skipped automatically.
- **Quick Search** — Search your Glassy Keep bookmarks inline directly in the popup. Results appear as you type without needing to open the dashboard.

---

## Configuration

After installing, click the Glassy Companion icon and enter:

| Setting | Description |
|---|---|
| **Glassy URL** | The full URL of your Glassy instance (e.g. `https://dash.example.com`) |
| **Username / Password** | Your Glassy account credentials |

The extension stores your session token in `chrome.storage.session` (cleared when the browser closes) and your profile cache in `chrome.storage.local`. Credentials are never sent anywhere except your own Glassy server.

**Host permissions** are scoped to your Glassy instance URL only. No data is sent to third-party servers.

---

## Multi-Account Support

If your Glassy instance runs v2.1.0+, the extension automatically supports multi-account workspaces:

- When you switch accounts in the Glassy dashboard, the extension picks up the active account.
- All saves, searches, and tag lookups are scoped to the active account via the `X-Account-Id` header.
- Account limits depend on your subscription tier: Free (1), Paid (3), Lifetime (5).

## AI Provider

AI features (auto-tagging, page summaries) use whichever AI provider is configured in your Glassy instance — Google Gemini, OpenAI, Anthropic, or local Ollama. No additional configuration is needed in the extension.

---

## Extension API Routes *(v1.2.0+)*

The companion communicates with your Glassy instance exclusively through `/api/ext/*` endpoints. All requests include a `Bearer` token and, when multi-account is active, an `X-Account-Id` header so data is always scoped to the correct account.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ext/ping` | GET | Health check (no auth required) |
| `/api/ext/me` | GET | Current user profile, entitlements, Keep stats |
| `/api/ext/collections` | GET | List bookmark collections |
| `/api/ext/collections` | POST | Create a new collection |
| `/api/ext/bookmarks` | POST | Save a bookmark (supports AI auto-tag) |
| `/api/ext/bookmarks/:id` | PATCH | Update bookmark fields |
| `/api/ext/bookmarks/:id` | DELETE | Delete a bookmark |
| `/api/ext/bookmarks/:id/highlights` | GET | List highlights for a bookmark |
| `/api/ext/bookmarks/:id/highlights` | POST | Create a highlight with optional note |
| `/api/ext/highlights/:id` | DELETE | Delete a highlight |
| `/api/ext/notes` | POST | Create a Glassy note from selected text |
| `/api/ext/tags` | GET | List all tags (for autocomplete) |
| `/api/ext/check-url` | GET | Check if a URL is already saved |
| `/api/ext/ai/summarize` | POST | AI-summarize page text |
| `/api/keep/bookmarks` | GET | Quick-search bookmarks from popup |

---

## Supported Browsers

| Browser | Support |
|---|---|
| Google Chrome 88+ | ✅ Full support |
| Microsoft Edge 88+ | ✅ Full support |
| Opera 74+ | ✅ Full support |
| Firefox 109+ | ✅ Temporary load (permanent `.xpi` coming) |
| Safari | ⚠️ Not supported (requires Xcode signing) |

---

## Contributing

Contributions and bug reports are welcome. Please open an issue before submitting a pull request so we can discuss the change.

---

## License

MIT — see [LICENSE](LICENSE) for details.
