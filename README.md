# Glassy Companion

**Glassy Companion** is a premium Manifest V3 browser extension that captures bookmarks, articles, highlights, and AI-generated summaries from any webpage directly to [Glassy](https://github.com/0Reliance/glassy).

[![Version](https://img.shields.io/badge/version-2.1.0-6366f1?style=flat-square)](manifest.json)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)](#)

---

## Features

| Feature | Description |
|---|---|
| **Quick Save** | Instant, one-click save of the current page with premium Markdown formatting. |
| **Smart Save** | Structured capture with presets (Video, Product, Repo, Article), destination routing, and lifecycle flags. |
| **Premium Presentation** | Every save is formatted with a high-fidelity Markdown layout including site metadata, author info, and clean headers. |
| **Smart Extraction** | Intelligent article detection using Schema.org (JSON-LD) and Microdata signals. |
| **Highlights** | Select text to capture it as a first-class highlight with CSS selector persistence. |
| **Glassy Design** | A beautiful, layered Obsidian theme with luminous indicators and glass-morphic UI. |
| **Rule Engine** | Automatic preset assignment based on domain and URL patterns. |
| **Offline Queue** | Saves are queued locally if your Glassy instance is unreachable and sync automatically. |

---

## Installation

1. Go to [**Releases**](https://github.com/0Reliance/glassy-companion/releases).
2. Download and unzip the latest release.
3. Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**.
4. Select the unzipped folder.

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Quick Save | `Ctrl+Shift+G` |
| Open Popup | `Ctrl+Shift+B` |
| Quick Note | `Ctrl+Shift+N` |

---

## Development

**Prerequisites:** Node.js 20+, npm 9+

```bash
npm install
npm run dev     # Watch mode
npm run build   # Production build
npm test        # Run unit tests
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
