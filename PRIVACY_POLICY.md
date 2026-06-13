# Privacy Policy — Glassy Companion

**Last Updated:** June 13, 2026

## Overview

Glassy Companion is a browser extension that helps you save bookmarks, notes, and highlights to your Glassy dashboard. This privacy policy explains what data the extension accesses and how it is handled.

## Data Collection & Transmission

### What We Collect
- **Page metadata:** When you save a page, the extension extracts the page title, URL, description, and selected text content. This is sent to your Glassy dashboard server.
- **Screenshots:** If you use the screenshot feature, a visible-tab capture is taken and uploaded to your Glassy server.
- **Authentication token:** A JWT token is stored locally in `chrome.storage.local` to authenticate API requests to your Glassy server.

### What We Do NOT Collect
- **Browsing history:** The extension does not track or record your browsing history.
- **Personal identifiers:** No email, IP address, or device fingerprint is collected by the extension itself.
- **Keystrokes or form data:** The extension does not log or capture keyboard input outside of explicit save actions.
- **Third-party analytics:** No analytics, tracking pixels, or telemetry SDKs are included.

### Data Transmission
All data is transmitted **only** to the Glassy server you configure (default: `https://glassy.fyi`). Data is sent over HTTPS with Bearer token authentication. No data is sent to any third-party server.

## Local Storage

The extension uses `chrome.storage.local` for:
- JWT authentication token
- User preferences (active account, server URL)
- Offline queue (temporarily stores captures when offline; flushed when connectivity returns)

The extension uses `chrome.storage.session` for:
- Active view state (which tab is open)
- Badge count (queue size indicator)

Storage is cleared when you log out or uninstall the extension.

## Permissions Justification

| Permission | Purpose |
|-----------|---------|
| `activeTab` | Access the current page's title and URL when you click "Save Page" |
| `contextMenus` | Add "Save to Glassy" options to right-click menus |
| `storage` | Store authentication token and user preferences locally |
| `notifications` | Show save confirmation and error notifications |
| `alarms` | Schedule periodic offline queue flush and storage quota checks |
| `tabs` | Open the Glassy dashboard when needed |
| `scripting` | Inject the content script on pages where static injection failed |
| `sidePanel` | Provide a persistent side panel capture interface (Chrome only) |

## Data Retention

The extension itself retains no data on external servers. All saved content is stored on your Glassy dashboard server, governed by the [Glassy Terms of Service](https://glassy.fyi/terms) and [Glassy Privacy Policy](https://glassy.fyi/privacy).

## Third-Party Services

The extension makes API calls only to the Glassy server you configure. No third-party APIs, analytics services, or advertising networks are used.

## Children's Privacy

Glassy Companion is not directed at children under 13. We do not knowingly collect personal information from children.

## Contact

For privacy questions, contact: privacy@glassy.fyi

## Changes

This policy may be updated. The "Last Updated" date at the top indicates the most recent revision.
