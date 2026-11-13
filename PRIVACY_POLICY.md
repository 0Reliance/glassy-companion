# Privacy policy: Glassy Capture

**Last Updated:** November 12, 2026

Glassy Capture is a browser extension that saves pages, links, highlights and notes to your Glassy, and searches your Glassy library. This page says what the extension reads, where it sends it, and what it keeps in your browser.

## In short

- What you save goes to the Glassy you sign in to, and nowhere else. That is Glassy's cloud app (`https://app.glassy.fyi`, the default) or your own Glassy Self-Host server, at the address you type.
- The extension has no analytics, no ads and no tracking, and sends nothing to anyone else.
- It reads a page only when you save, highlight or capture it.
- Your data is not sold, and is not used for anything except the features described here.

## What the extension sends, and when

| When you | It sends to your Glassy |
|---|---|
| Sign in | Your email and password, once, to get a sign-in token. The password is not kept. |
| Save a page or a link | The page's title, address, description, preview image and icon addresses, the text you selected, and, for a full capture, the readable text of the page. Your tags, collection and note go with it. |
| Highlight a selection | The selected text and the address of the page it is on. |
| Capture the screen | A picture of the visible part of the tab, or of the region you draw. |
| Write a note | The title and text of the note. |
| Search your library | The words you search for. |
| Tap "Remind me to read it" | The page's title and address, and the day you chose. |
| Open the popup or side panel | A check that you are signed in, and requests for your collections, tags and notifications. |

While you are offline, saves wait on this device and are sent when you are back online.

### Obsidian (only if you turn it on)

If you connect an Obsidian vault, the extension talks to the Obsidian Local REST API on your own computer (`127.0.0.1`). The browser asks for your permission to reach that address when you connect. The key to your vault stays in this browser and is never sent to Glassy. When you, or an assistant working in your Glassy, read from or write to the vault, that file content passes between Obsidian and your Glassy through the extension.

## What the extension does not do

- It does not record your browsing history. A script is loaded on the pages you open so that a save works at once; it stays idle until you save, highlight or capture, and sends nothing by itself.
- It does not record what you type on pages, or read forms.
- It contains no analytics, tracking pixels, advertising or telemetry.
- It does not load or run code from the internet. All of its code ships inside the extension.

## What is kept in your browser

In the browser's extension storage, on this device:

- your sign-in token, your Glassy profile (name, email, plan), and which account is active;
- your server address and your settings;
- saves waiting to be sent while you are offline;
- unsent drafts of a save or a note;
- a short-lived copy of your collections and tags, and a count of the tags you use, so they can be suggested;
- your Obsidian connection settings and key, if you connected a vault.

Signing out removes your sign-in token, profile and active account. Removing the extension removes everything it stored.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the title and address of the tab you are on when you save it. |
| `tabs` | Find the active tab when you save from a shortcut or the right-click menu, and open your Glassy in a new tab. |
| `scripting` | Start a save or a region capture on a page that was already open before the extension was installed. |
| `contextMenus` | Add "Save page", "Save link", "Save selection", "Highlight" and "New note" to the right-click menu. |
| `storage` | Keep your sign-in, settings, drafts and waiting saves in this browser. |
| `notifications` | Tell you that a save from a shortcut or the right-click menu worked, or did not. |
| `alarms` | Send waiting saves when you are back online, check that storage is not filling up, and keep an Obsidian connection alive if you made one. |
| `sidePanel` | Show Glassy Capture in the browser's side panel (Chrome and Edge). |
| Access to `glassy.fyi` | Talk to Glassy's cloud app. |
| Reading pages you open | Read the page's details when you save, highlight or capture it. |
| Access to `localhost` and `127.0.0.1` (asked for only when you connect Obsidian) | Reach Obsidian on your own computer. |

## Where your saved content lives

The extension keeps nothing on servers of its own. What you save is stored by the Glassy you signed in to. On Glassy's cloud app that is covered by the [Glassy Terms](https://glassy.fyi/terms) and the [Glassy Privacy Policy](https://glassy.fyi/privacy). On a Glassy Self-Host server it stays on that server, under the control of whoever runs it.

## Limited use

Glassy Capture's use of information received from browser APIs follows the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide the features described here. It is not sold, and it is not used for advertising or to decide creditworthiness.

## Children

Glassy Capture is not directed at children under 13, and we do not knowingly collect personal information from them.

## Contact

privacy@glassy.fyi

## Changes

When this policy changes, the date at the top changes with it. The history of this file is public at https://github.com/0Reliance/glassy-companion/commits/main/PRIVACY_POLICY.md
