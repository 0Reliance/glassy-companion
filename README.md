# Glassy Companion

**Glassy Companion** is a premium Manifest V3 browser extension that captures bookmarks, structured Smart Save items, full-page saves, highlights, quick notes, and AI-generated summaries from any webpage directly to [Glassy](https://github.com/0Reliance/glassy).

[![Version](https://img.shields.io/badge/version-2.18.0-6366f1?style=flat-square)](manifest.json)
[![License](https://img.shields.io/badge/license-AGPL--3.0-22c55e?style=flat-square)](LICENSE)
![Manifest](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)

---

## Admin and Planning

- Workspace-wide admin view: `/home/pozi/WORKSPACE_ADMIN.md`
- Shared product/platform backlog: `/home/pozi/glassy-dash/docs/NEXT_STEPS.md`
- Repo-local release/distribution state: this README
- **Current state (August 27, 2026):** v2.18.0 — **bridge transport v2** — completes the Obsidian glass-pane follow-up with glassy-dash: the SSE bridge now carries raw bodies + request headers and relays upstream response headers (ETag) back, so vault WRITES (tap-to-toggle checkboxes, add-under-heading, daily-note append, push-to-vault) work when the extension is the only path to Obsidian on containerized self-host (previously reads worked but writes fell back to the unreachable direct path and 502'd). Also fixes `obsidianFetch` corrupting raw markdown bodies (`JSON.stringify`-quoted + forced `application/json`), which affected the extension's direct capture-to-vault push. The server gates transport v2 on the advertised version (`&extv=` on the subscribe URL); companions ≤ 2.17.1 keep the proven v1 behavior. v2.17.1 (previous) was the **save & sync reliability release**: capture-rule pre-population actually works (the `/api/capture-rules` `{ rules: [...] }` envelope was never unwrapped, so Smart Save auto-fill had been silently inert since v2.2.0); transient 5xx no longer logs users out (`verifyToken()` clears only on a real 401); offline-queue flush drop/pause semantics fixed; popup saves queue offline. v2.16.0 added the **MCP Settings UI**. v2.15.0 shipped the **Obsidian Vault Companion**. v2.14.0 shipped the **Obsidian Bridge Deep-Fix** + critical install fix. **Self-hosted beta is live** — `ghcr.io/0reliance/glassy-dash:v2.36.0-beta.14` is public. Remaining: manual upload to CWS + AMO (gated on user browser auth).

---

## Features

| Feature | Description |
| --- | --- |
| **Unified Save Card (v2.12.0)** | A single progressive-disclosure capture card merging Quick Save and Smart Save. Type chips (Article, Video, Repo, Bookmark) re-run the page interpreter on change so metadata is always fresh before save. One card, one flow, less friction. |
| **Quick Save** | Instant, one-click save of the current page with premium Markdown formatting. |
| **Smart Save** | Structured capture with 4 content types (Article, Video, Repo, Bookmark). Type chips re-run the page interpreter on change so metadata is always fresh before save. |
| **Element Picker** | Click any element on the page to capture it as rich Markdown. Hover-to-highlight with purple glow. (Deferred from main bar in v2.9.0 — available as a future in-reader affordance.) |
| **Screenshot Capture** | Capture the visible viewport via direct service worker routing (`captureVisibleTab`). Works on restricted URLs, PDFs, and stale tabs where the content script is absent. |
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
| **Knowledge Base Search (v2.10.0)** | Search your Glassy knowledge base (bookmarks, notes, vault files) from the popup. Source filter tabs, debounced hybrid search, corpus indexing status, and relevance scores. |
| **MCP Bridge config (v2.11.0)** | Settings → Integrations shows copy-pasteable Claude Desktop / Cursor config snippets with the live server URL — pair with the Glassy MCP server (glassy-dash v2.35.0-beta.7+). |
| **Cross-Browser** | Full Chrome and Firefox support. Accessibility: focus indicators, reduced motion, high contrast. |
| **Storage quota monitoring (v2.11.0)** | Periodic alarm checks `chrome.storage.local` usage; warns at 80%, auto-trims the offline queue at 95% critical. |
| **Obsidian Bridge (v2.12.0, reliability fix v2.13.0)** | Proxy Obsidian Local REST API requests on behalf of the Glassy server. Solves WSL2/Docker networking — the extension runs on the host and can reach `127.0.0.1:27124` directly. Also pushes captures to the vault as markdown files. v2.13.0 moved the SSE connection to a persistent offscreen document so Chrome MV3 service worker eviction no longer silently kills the bridge. |
| **Push-to-Obsidian (v2.12.0)** | Captures saved via the extension are automatically pushed to the Obsidian vault as markdown files with YAML frontmatter — no server round-trip needed. |

---

## Integration Surface

- **Canonical capture API:** `POST /api/captures`, `GET /api/capture-rules`, `PATCH /api/items/:id`, `POST /api/items/:id/promote`
- **Supporting extension API:** `/api/ext/*` remains in use for auth, bookmarks, notes, tags, collections, search, documents, and AI summary flows.
- **Account-aware requests:** extension calls include `X-Account-Id` when an active account is selected.
- **Offline replay:** queued bookmark, note, capture, and page/document saves retry automatically when connectivity returns.

---

## Installation

1. Go to [**Releases**](https://github.com/0Reliance/glassy-companion/releases).
2. Download the latest `v2.18.0` assets:
   - **`glassy-companion-v2.18.0.zip`** for Chromium browsers (Chrome, Edge, Brave, Arc, Opera). Unzip and load the folder as an unpacked extension.
   - **`glassy-companion-v2.18.0-firefox.xpi`** for Firefox 121+. Install via `about:addons` → gear icon → Install Add-on From File.
3. For Chromium: open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**. Select the unzipped folder.

### Browser Support

- **Chromium** (Chrome, Edge, Brave, Arc, Opera): install from `glassy-companion-v2.18.0.zip`.
- **Firefox 121+**: install from `glassy-companion-v2.18.0-firefox.xpi` for local/user testing via `about:addons`. Chrome Web Store and Mozilla Add-ons submission are the next distribution steps (see Admin and Planning above).

> Both builds are produced from the same source. The Firefox build uses a separate manifest (`manifest.firefox.json`) with the required Gecko extension ID, `strict_min_version: 121.0`, and the AMO-required `content_security_policy`.

---

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Quick Save | `Ctrl+Shift+G` |
| Open Popup | `Ctrl+Shift+B` |
| Quick Note | `Ctrl+Shift+N` |
| Toggle Side Panel | `Ctrl+Shift+P` (Chrome only) |

---

## Self-hosting over Tailscale

[Tailscale](https://tailscale.com/) is a WireGuard mesh that lets the extension
reach a self-hosted Glassy instance from any device on your tailnet — phone,
laptop, tablet — without port forwarding or public exposure. The extension
connects to whatever **Server URL** you enter in Settings; `https://glassy.tailnet.ts.net`
works identically to `http://localhost:3000`. No extension code changes are needed —
`*.ts.net` has been in the extension's URL allowlist (alongside localhost and
RFC1918 private ranges) since v2.12.0.

### The Obsidian bridge becomes optional

The bridge exists because the Glassy container cannot reach `127.0.0.1` on your
host. **Tailscale changes the architecture:** when Glassy and Obsidian are both
on the tailnet, the server reaches Obsidian directly via the tailnet IP — no SSE
connection, no MV3 service worker, no browser dependency. The entire class of
bridge reliability issues (SSE cycling, offscreen eviction, WSL2 networking,
auth ticket races) does not apply.

The bridge remains the canonical path for WSL2 (where the container cannot reach
the Windows host) and for setups where Obsidian is not on a tailnet.

### Cross-machine use case

Extension on laptop, Glassy on homelab/NAS — Tailscale makes this seamless.
Run Glassy on the homelab, install the extension on your laptop, point it at
`https://glassy.tailnet.ts.net`, and capture from anywhere on your tailnet.

See the [self-host README § Multi-device access](https://github.com/0Reliance/glassy-selfhost#multi-device-access)
for `tailscale serve` setup and the sidecar overlay for headless servers.

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
npm test                 # Run unit tests (168 tests)
```

---

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.

Commercial use requires a separate license from 0Reliance.
