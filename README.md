# Glassy Companion

**Glassy Companion** is a Manifest V3 browser extension that lets you save bookmarks, highlights, and AI-generated summaries from any webpage directly to [Glassy](https://github.com/0Reliance/glassy) — your self-hosted digital workspace.

[![Version](https://img.shields.io/badge/version-1.1.1-6366f1?style=flat-square)](manifest.json)
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
| **Highlight Capture** | Select text on any page and save it as a highlighted bookmark with context |
| **Keyboard Shortcut** | `Ctrl+Shift+G` (Windows/Linux) / `⌘+Shift+G` (macOS) — quick save from any tab |
| **Popup Shortcut** | `Ctrl+Shift+B` / `⌘+Shift+B` — open the Glassy Companion popup |
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

## What's New in v1.1.0 (March 9, 2026)

- **Save All Tabs** — Save every open HTTP/HTTPS tab in one click. Already-saved duplicates (matched by URL) are detected and skipped automatically.
- **Quick Search** — Search your Glassy Keep bookmarks inline directly in the popup. Results appear as you type without needing to open the dashboard.

---

## Configuration

After installing, click the Glassy Companion icon and enter:

| Setting | Description |
|---|---|
| **Glassy URL** | The full URL of your Glassy instance (e.g. `https://dash.example.com`) |
| **Username / Password** | Your Glassy account credentials |

The extension stores your session token securely in `chrome.storage.local` — credentials are never sent anywhere except your own Glassy server.

**Host permissions** are scoped to your Glassy instance URL only. No data is sent to third-party servers.

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
