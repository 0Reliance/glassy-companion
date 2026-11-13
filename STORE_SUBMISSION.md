# Glassy Capture: store submission sheet (v2.21.2)

Everything to paste into each store, in the order the store asks for it. The words for
the public page are in [STORE_LISTING.md](STORE_LISTING.md); the policy is
[PRIVACY_POLICY.md](PRIVACY_POLICY.md). Run `npm run store:check` first: it confirms the
packages, the manifests and the screenshots are in order.

Field names follow each store's published documentation. They were not checked against the
live dashboards, which need the owner's sign-in, so a label may differ slightly.

## What to upload

| Store | File | Built with |
|---|---|---|
| Chrome Web Store | `glassy-companion-v2.21.2.zip` | `npm run build && npm run zip` |
| Microsoft Edge Add-ons | the same `glassy-companion-v2.21.2.zip` | |
| Firefox Add-ons | `glassy-companion-v2.21.2-firefox.xpi` | `npm run build:firefox && npm run zip:firefox` |
| Firefox Add-ons, source code | `glassy-capture-v2.21.2-source.zip` | `git archive --format=zip -o glassy-capture-v2.21.2-source.zip v2.21.2` |

Screenshots: the five files in `store/screenshots/` (1280×800 PNG). Icon: `assets/icon-128.png`,
already inside the package.

Not made yet: the small promotional image (440×280) that the Chrome Web Store and Edge show
in lists. Chrome's documentation lists it as optional. Without it the store shows the icon.

---

## 1. Chrome Web Store

Dashboard: https://chrome.google.com/webstore/devconsole

### Store listing tab

| Field | Paste |
|---|---|
| Description | The "Description" section of `STORE_LISTING.md` |
| Category | Productivity → Workflow & Planning |
| Language | English (United States) |
| Screenshots | The five files in `store/screenshots/`, in number order |
| Homepage URL | https://www.glassy.fyi |
| Support URL | https://github.com/0Reliance/glassy-companion/issues |

The name and the one-line summary are read from the package (`name` and `description` in
`manifest.json`).

### Privacy practices tab

**Single purpose**

> Glassy Capture saves web pages, links, highlights, screenshots and notes to the user's own Glassy workspace, and lets them search that workspace from the browser.

**Permission justifications**

| Permission | Paste |
|---|---|
| activeTab | When the user clicks the toolbar button, presses a shortcut or uses the right-click menu, gives access to that one tab: to read its title and address, to run the extension's own page script on it, and to take a picture of its visible part for a screenshot capture. |
| tabs | Finds the active tab when a save starts from a keyboard shortcut or the right-click menu and sends the "read this page" message to it; reads the titles and addresses of the tabs in the window for "Save all tabs in window"; opens the user's Glassy in a new tab when they click a search result. If the user turns on the optional setting "Mark pages I already saved" (off by default), it also reads the address of the page they open, to show a check on the toolbar button when that page is already saved. |
| scripting | Injects the extension's own bundled page script into the current tab when the user saves a page that was already open before the extension was installed or updated. Without it the first save on such a tab fails. No remote code is injected. |
| contextMenus | Adds "Save page to Glassy", "Save link to Glassy", "Save selection to Glassy", "Highlight selection in Glassy" and "New Glassy Note" to the right-click menu. |
| storage | Keeps the user's sign-in token, server address, settings, unsent drafts and saves waiting to be sent while offline, in the browser on their device. |
| notifications | Tells the user that a save started from a keyboard shortcut or the right-click menu succeeded or did not, since no popup is open at that moment; that they need to sign in; or that their Obsidian connection needs them to sign in again. |
| alarms | Once a minute, sends saves that are waiting because the user was offline. Every six hours, checks that local storage is not full. If the user connected Obsidian, every 30 seconds checks that the connection is still up. |
| sidePanel | Shows the same save, note and search screens in the browser's side panel so they stay open next to the page. While it is open it reads the page the user switches to, so the form shows the page they are looking at. |
| Host permission (`https://glassy.fyi/*`, `https://*.glassy.fyi/*`) | These are the addresses of Glassy's own cloud service. The extension sends the user's saves and searches to it and reads their collections and tags from it. |
| Host permission (content script on all sites) | The user can save any page they are reading, so the page script that reads a page's title, description and selected text has to be available on any site. It is idle until the user opens the extension, saves, highlights or captures; it reads nothing and sends nothing by itself. |
| Optional host permission (`localhost`, `127.0.0.1`) | Requested only when the user connects their Obsidian vault, to reach the Obsidian Local REST API running on their own computer, and their Glassy server if it runs on the same computer. |

**Remote code**

> No, I am not using remote code.

All JavaScript ships inside the package. The content security policy is `script-src 'self'`.

**Data usage: what the extension collects**

Tick these four, and no others:

| Category | Why |
|---|---|
| Personally identifiable information | The user's email address, used to sign in to their Glassy. |
| Authentication information | The password at sign-in (sent once, not kept) and the sign-in token kept in the browser. |
| Web history | The address of the page the user is on when they open the extension (to say whether it is already saved) and of pages they save. If the user turns on the optional setting "Mark pages I already saved", off by default, also the address of each page they open. Nothing is sent while the setting is off and the extension is closed. |
| Website content | The title, description, selected text, readable text and screenshots of pages the user chooses to save. |

Then tick all three certifications. Each is true of this build:

- The data is not sold or transferred to third parties, outside of the approved use cases.
- The data is not used or transferred for purposes unrelated to the item's single purpose.
- The data is not used or transferred to determine creditworthiness or for lending purposes.

**Privacy policy URL**

> https://github.com/0Reliance/glassy-companion/blob/main/PRIVACY_POLICY.md

This address shows the v2.21.2 policy once this release is merged to `main`.

### Test instructions tab

The extension does nothing until the person signs in to a Glassy. A free account is enough
for every feature, and anyone can make one at https://app.glassy.fyi, but a review goes
faster when the reviewer is handed an account:

| Field | Paste |
|---|---|
| Username | `<reviewer account email>` |
| Password | `<reviewer account password>` |
| Additional instructions | Click the toolbar button and sign in with the account above (the server address is already set to Glassy's cloud app). Open any article and click Save. Note, Bookmarks and Library are the other tabs in the popup. |

The account is the owner's to create. Do not write its password in this file or anywhere
in the repo; type it into each store's form.

### Distribution tab

Visibility: Public. Regions: all. Price: free.

### What to expect in review

The extension reads pages on all sites, which the Chrome Web Store reviews by hand. Its
documentation says such a review can take longer than one for an extension with narrow
access. The justifications above are written for that review.

---

## 2. Firefox Add-ons

Dashboard: https://addons.mozilla.org/developers/addon/submit/distribution
Choose "On this site".

| Field | Paste |
|---|---|
| Upload | `glassy-companion-v2.21.2-firefox.xpi` |
| Compatible with | Firefox (desktop) |
| Do you use a code generator, minifier or bundler? | Yes. Then upload `glassy-capture-v2.21.2-source.zip` |
| Name | Glassy Capture |
| Summary | The "Summary" line of `STORE_LISTING.md` |
| Description | The "Description" section of `STORE_LISTING.md` |
| Categories | Bookmarks |
| Support website | https://github.com/0Reliance/glassy-companion/issues |
| License | The one in `LICENSE` |
| Privacy policy | Paste the text of `PRIVACY_POLICY.md` |
| Screenshots | The five files in `store/screenshots/` |

**Notes to reviewer**

> Build: Node.js 22 and npm 10 on Linux, macOS or Windows.
> `npm ci`
> `npm run build:firefox`
> `npm run zip:firefox`
> The result is `glassy-companion-v2.21.2-firefox.xpi`, built from `dist-firefox/`. The bundler is Vite with @crxjs/vite-plugin; no code is fetched at run time.
>
> To test: the extension signs in to a Glassy server. A free account, made at https://app.glassy.fyi, is enough for every feature. A test account is provided: email `<reviewer account email>`, password `<reviewer account password>`.
>
> Data: the manifest declares `data_collection_permissions` (authenticationInfo, personallyIdentifyingInfo, websiteContent, browsingActivity). All of it goes only to the Glassy server the user signs in to. `browsingActivity` covers the address of the page the user opens the extension on and of pages they save, and, only if they turn on the optional setting "Mark pages I already saved" (off by default), the address of each page they open.

What Firefox shows the person at install comes from the package: the permissions, and the
data declaration above. The Firefox build needs Firefox 140 or later, the first version
with that install prompt.

---

## 3. Microsoft Edge Add-ons

Dashboard: https://partner.microsoft.com/dashboard/microsoftedge/overview

Upload the same zip as Chrome. Edge asks for the same things under slightly different names:

| Field | Paste |
|---|---|
| Package | `glassy-companion-v2.21.2.zip` |
| Category | Productivity |
| Description | The "Description" section of `STORE_LISTING.md` |
| Screenshots | The five files in `store/screenshots/` |
| Privacy policy URL | https://github.com/0Reliance/glassy-companion/blob/main/PRIVACY_POLICY.md |
| Website URL | https://www.glassy.fyi |
| Support contact | https://github.com/0Reliance/glassy-companion/issues |
| Store logo | Edge asks for a logo, 300×300 recommended. Only `assets/icon-128.png` (128×128, Edge's stated minimum) exists today |
| Notes for certification | The "To test" paragraph from the Firefox reviewer notes above, with the reviewer account filled in |

---

## After a store accepts it

- Add the store links to `README.md` and to the app's extension download page.
- Each later release is uploaded to each store again; the stores do not read GitHub releases.
