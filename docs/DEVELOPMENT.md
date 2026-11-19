# Developing Glassy Capture

What used to live in the README for people working on the extension itself. The README is now for people installing and using it.

## Integration Surface

- **Canonical capture API:** `POST /api/captures`, `GET /api/capture-rules`, `PATCH /api/items/:id`, `POST /api/items/:id/promote`
- **Supporting extension API:** `/api/ext/*` remains in use for auth, bookmarks, notes, tags, collections, search, documents, and reminders (`/api/ext/calendar/events`).
- **Account-aware requests:** extension calls include `X-Account-Id` when an active account is selected.
- **Offline replay:** queued bookmark, note, capture, and page/document saves retry automatically when connectivity returns.


## Development

**Prerequisites:** Node.js 20+, npm 9+

```bash
npm install
npm run dev              # Watch mode (Chrome)
npm run build            # Production build → dist/
npm run build:firefox    # Firefox build → dist-firefox/
npm run zip              # Package Chrome → glassy-companion-v*.zip
npm run zip:firefox      # Package Firefox → glassy-companion-v*-firefox.xpi
npm test                 # Unit tests, then the release pre-flight
```



## Project state (a dated record)

> These two sections are notes as of the dates in their titles. The current release and what changed are in [CHANGELOG.md](../CHANGELOG.md).


Repo-local release and distribution state lives here, with the full history in
[CHANGELOG.md](CHANGELOG.md).

**Current state (November 13, 2026):** v2.21.2 — the side panel follows the
page you are on, the Save button stays in view, tag suggestions and notifications
follow your settings, and the tabs and switches have plain names. v2.21.1 was v2.21.0 made ready for the
browser stores: it asks for less (two retired addresses are gone from its host
access), the Firefox build says what it sends and needs Firefox 140, and the
store listing, privacy policy, screenshots and a paste-from sheet
([STORE_SUBMISSION.md](STORE_SUBMISSION.md)) are in the repo. The saved-page check on the toolbar button is now a setting that starts off,
and a region capture is cropped to the region. v2.21.0 (November 10) — search speaks Glassy's one
search, and a save can remind you to read it. The Knowledge Base tab searches
notes, docs, bookmarks, voice and vault with the server's own source names (the
Vault filter used to return everything), a result opens the item itself on your
Glassy in a new tab, and the tab says plainly when it is matching by words only.
After a save, one tap adds "Read: <page>" to your Glassy calendar for tomorrow
or next week at 9:00; with calendar sync it shows on every Glassy you pair. The
AI summary, whose screen was removed in v2.9.0, is no longer advertised, and the
save, search, settings and agent-key messages are rewritten in plain words.
Requires glassy-dash ≥ v2.40.5; the search tabs match Glassy 2.63 or later, and
reminders need a Glassy from September 2026 or later. Remaining: the upload
to the Chrome Web Store, Firefox Add-ons and Edge Add-ons, which needs the
owner's developer accounts.

---

## Current compatibility and distribution (November 10, 2026)

- Companion is **v2.21.2**. The source manifest, Chrome/Firefox build
  manifests, and local v2.21.2 ZIP/XPI manifests agree. Older archives are
  historical outputs, not evidence that the current build is v2.11.0.
- Use Glassy's newest released versioned appliance image for the latest
  server-side fixes — **v2.65.16** as of November 10, 2026 (check the
  [appliance releases page](https://github.com/0Reliance/glassy-selfhost/releases) for the
  current tag). `:latest` / `:main` are hosted builds; `:selfhost-main`
  is a floating appliance build for testing. **v2.40.2 or newer is required for
  this companion release**: the server contract reads `capabilities.mcp.mounted`
  (added by glassy-dash #125 in v2.40.2) and `capabilities.vault` (added in
  v2.40.5). Against an older appliance both fail closed, so the AI Tools and
  Vault surfaces stay hidden rather than guess — and the much older
  `v2.36.0-beta.40` image this README previously recommended has no
  `/api/capabilities` endpoint at all. The v2.52.x–v2.65.16 server waves
  (sync cycle contract, embeddings namespace model, the pair token as a
  Settings value, one search everywhere, agents' own space, calendar sync) kept
  the extension's `/api/ext/*` + `/api/captures` request and response shapes, so
  no companion release was needed for them. One thing a person may notice: the server’s
  error messages there are rewritten in plain words (status codes and `code`
  values unchanged). The extension doesn't call AI summary (`/api/ext/ai/summarize`),
  which as of v2.65.16 draws on Glassy AI credits unless the person uses their own key.
  The Knowledge Base tab's Vault filter, which sent a source name v2.63's one search
  no longer knows, is fixed in v2.21.0.
  Capture content that used to be
  embedded server-side now converges through the owner's next visit when the
  first-party embedding shim is retired — the extension is an arrival lane, not
  the embedder, by design.
- Recent server improvements include canonical note types, KB search diagnostics,
  working BYOK configuration and live Ollama model selection, and LAN agent
  connections on appliances. These do not imply new extension permissions.
- Cloud Sync downloads supported missing media on appliance pull cycles; it
  is not the extension's offline capture queue or bidirectional file backup.
  See [Cloud Sync](https://docs.glassy.fyi/02-core-features/cloud-sync/).
- KB, MCP and Agent Gateway remain appliance-only. Use the advertised MCP
  schema rather than treating capture categories as canonical note types.
- Local archives are not proof of store publication. Chrome Web Store and
  AMO upload/approval remain a separate authenticated release step; this
  documentation pass does not claim they were completed.




## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.

Commercial use requires a separate license from 0Reliance.
