# One server contract, many consumers

**Date:** 2026-09-26
**Status:** Approved design, awaiting implementation plan
**Repos:** `glassy-companion` (primary), `glassy-dash` (additive server dependency)
**Backwards compatibility:** Not required. Owner decision, 2026-09-26 — "we are only moving forward."

## Problem

The extension has no single answer to "what can this server do?" Every feature
re-derives it independently, by probing, and each probe needs a bespoke fallback
when the guess is wrong. This is not a code-quality complaint; it produced a
user-facing defect and it will keep producing them.

Nine independent availability-detection mechanisms exist today:

| # | Mechanism | Location |
|---|---|---|
| 1 | `interpretStatus()` + raw `/mcp/status` probe | `McpConnectionSection.jsx:27,60` |
| 2 | `fetchCapabilities()` fail-closed defaults | `api.js:361-397` |
| 3 | `useCapabilities()` — own state, no cache | `hooks/useCapabilities.js` |
| 4 | `getObsidianStatus()` fetched 4× independently | `RelatedInVaultPanel:24`, `TagEditor:22`, `QuickNoteView:36`, `VaultBrowserView:45` |
| 5 | `getKbStatus()` | `KbSearchView:65` |
| 6 | `pingServer()` | `api.js:159` |
| 7 | `verifyToken()` | `service-worker.js:1030` |
| 8 | `?extv=` bridge negotiation, duplicated | `obsidianBridge.js:370` + `offscreen.js:180` |
| 9 | Vault tab | **no detection at all** |

Meanwhile `/api/capabilities` publishes the authoritative answer — including
`version`, with the server's own comment "*so an agent can tell two instances
apart*" — and `fetchCapabilities()` keeps 2 of ~9 keys and discards the version.

### The defect this produced

`interpretStatus()` requires `body?.mounted === true` from `/mcp/status`.
**That endpoint has never emitted `mounted` in any commit in git history**
(`git log -S'mounted' -- server/mcp/index.js` → empty). The field lives in a
different endpoint, `/api/capabilities` → `capabilities.mcp.mounted`, added by
`glassy-dash@74004c4a` (#125), first released v2.40.2.

Verified by running the extension's real extracted function against live servers:

| Target | Response | `interpretStatus()` |
|---|---|---|
| `sh-rig` appliance v2.40.4, MCP mounted, 40 tools | `200 application/json` `{status:"ok",…}` | **`false`** — wrong |
| cloud `glassy.fyi` v2.40.0, MCP disabled | `200 text/html` (SPA fallback) | `false` — correct |

So the MCP settings feature is dead on every server that has ever shipped, and
worst on the appliance it exists for.

**Why the test suite certified it:** `McpConnectionSection.test.js` mocks
`{ mounted: true, toolCount: 40 }` — a body no server has ever sent. The fixture
was written from imagination rather than observation. This is the failure mode
`glassy-dash@4c4e3223` names: "a test that agrees with a bug is worse than no
test." The root cause is upstream of the code: the plan that specified it
(`glassy-dash/docs/superpowers/plans/2026-09-25-agent-safety-net-and-surface-truth.md:453-462`)
contains the same invented contract.

Note the predicate itself was **correct**. Only the endpoint it consulted was
wrong.

## Decision

**Approach A — one cached capability manifest as the single source of truth.**
Delete the per-feature probes. Rejected alternatives: server-driven surfaces
(invents a UI contract across a network boundary for 5 tabs; YAGNI) and folding
capability into `/api/ext/me` (makes capability auth-gated so nothing can gate
the login screen, and duplicates the manifest — recreating the two-sources-of-truth
problem #75 exists to end). The caching insight from the latter is retained.

Two concepts, kept separate:

- **Capability** — static per instance. *Does this server support vault/MCP/notifications?*
  Source: the manifest. Gates surface **visibility**.
- **Liveness** — dynamic per feature. *Is the Obsidian bridge connected right now?*
  Source: `/api/obsidian/status`. Gates surface **state**, never visibility.

Conflating these is why the Vault tab renders on cloud while the dashboard
correctly hides it (`glassy-dash/src/components/Sidebar.jsx:136`).

## Design

### `src/lib/serverContract.js` (new)

Follows the existing `cache.js` house pattern (`{ data, fetchedAt }` in
`chrome.storage.local`) rather than inventing a second cache layer.

- **TTL 30s**, mirroring the server's `Cache-Control: public, max-age=30`.
- **Cache key scoped to baseUrl.** Switching a server URL cloud→self-host must
  not serve a stale cloud manifest that hides working features. Same bug class
  `invalidateAccountScopedCaches()` already handles for accounts.
- **Stale-on-error**, like `getCollections()`: a transient blip returns the last
  good manifest instead of silently disabling every self-host feature.
  Fail-closed applies **only** when no cached contract exists at all. This
  preserves the security property the original cared about — a stale cloud
  manifest still says `available:false`, so it can never yield a false positive.
- **Module-level in-flight promise** dedupes concurrent callers. Today
  `Popup.jsx:37` and `McpConnectionSection.jsx:51` each call `useCapabilities()`,
  firing two manifest fetches per popup open.
- Invalidated from `setBaseUrl()` (`auth.js`) and on logout.

`fetchCapabilities()` in `api.js` is reduced to raw transport: return the whole
manifest or throw. Projection, defaults, caching and **all** error handling live
in the contract module — `api.js` keeps no try/catch, so there is exactly one
place that decides what a failed fetch means.

`hooks/useCapabilities.js` is renamed to `hooks/useServerContract.js` (the old
name understates what it now returns) and keeps its `{ contract, resolved }`
shape so the two existing call sites — `Popup.jsx:37` and
`McpConnectionSection.jsx:51` — change only their import and destructure.

### Capability predicates

Derived from fixtures captured live on 2026-09-26 (both reproduced in §Tests):

```js
mcp.available       = caps.mcp?.mounted === true
vault.available     = caps.vault?.available === true
notifications       = caps.notifications?.available === true
agentIdentity       = caps.agentIdentity            // { available, mode }
version             = manifest.version              // retained, not discarded
```

`mounted === true` is deliberate. Cloud v2.40.0 has no `mounted` key and
resolves `false` — correct, since cloud MCP is off by design. An appliance whose
mount is still pending resolves `false` and self-corrects on the next 30s
refresh, which is honest rather than optimistic.

### Surface gating map

| Surface | Gate |
|---|---|
| Vault tab (`AppShell.jsx` TABS) | `vault.available && user.obsidian_enabled` |
| Obsidian Bridge section (`SettingsView.jsx:170`) | `vault.available` |
| MCP section (`SettingsView.jsx:166`) | `mcp.available` |
| Named-key sub-flow (`McpConnectionSection`) | `mcp.available && agentIdentity.mode === 'named-keys'` |
| Notifications badge (`Popup.jsx`) | `notifications.available` (unchanged) |
| KB tab | unchanged — available on both instance types |

`AppShell`'s `TABS` constant becomes a function of the contract.

### Deletions

| Delete | Reason |
|---|---|
| `interpretStatus()` | Probes an endpoint that has never emitted `mounted` |
| `/mcp/status` raw fetch + `mcpEnabled` tri-state | Superseded; also removes the only unbounded fetch in the extension |
| `McpConnectionSection.jsx:236-245` env-var copy | Unreachable once gating is manifest-driven |
| `McpConnectionSection.test.js` | Certifies a contract that has never existed |
| `DEFAULT_CAPABILITIES` 2-key projection in `api.js` | Contract module owns defaults |

Net negative lines of code.

Two existing test files are affected and must be updated in the same change, not
left to fail: `McpConnectionSection.test.js` is **deleted** (it only tests
`interpretStatus`), and `lib/__tests__/capabilities.test.js` is **rewritten**
against the contract module — it currently imports `DEFAULT_CAPABILITIES` from
`api.js` and asserts the 2-key projection this design removes.

`getObsidianStatus()` is **kept** — it is liveness, not capability — but gains a
shared cached accessor so four components stop fetching it independently.

## Server dependency (`glassy-dash`, additive, ships first)

1. `capabilities.vault = { available: selfHost }` in `server/routes/capabilities.js`
   — one line, mirroring the existing `notifications` entry. Verified **ABSENT**
   on both live servers today.
2. `/api/ext/me` (`extensionRoutes.js:190-214`) returns `obsidian_enabled`, so the
   extension can match the dashboard's exact gate rather than inventing a second rule.
3. Extend `capabilitySplitGuard.test.js` to assert the manifest *reports* vault.
   The guard already pins both sides of the split for other capabilities; vault is
   currently gated in `obsidian.js` but unreported.

## Auth/session policy (folded in per owner decision)

**Defect.** `apiFetch` (`api.js:65-68`) calls `clearAuth()` on any 401 before
throwing. `fetchUnreadNotifications()` swallows the throw and reports zero, so an
advisory badge — documented as "never load-bearing" — can silently end a session
while the popup keeps rendering logged-in UI. The user then sees a working
interface whose every action fails.

This class was already patched once, narrowly: `peekToken()` exists in `auth.js`
because "*the offscreen document … has no UI to re-authenticate*." That is a
second token reader created to route around a side effect, i.e. a fix on a fix.

**Principle:** auth destruction is a decision, not a transport side effect — and
the UI must never disagree with storage.

1. `apiFetch` gains an explicit `authPolicy` option: `'interactive'` (default —
   clears, as today) or `'background'` (throws a typed `SESSION_EXPIRED`, does
   not clear).
2. The notification poller and any other headless lane pass `'background'`.
3. The popup subscribes to token removal via `chrome.storage.onChanged` and routes
   to login. This is the half that actually fixes the stranded-UI defect, and it
   covers every interactive 401 rather than just the poller.

Folded into this effort at the owner's request, but it is a **separate workstream
and a separate commit** from the contract refactor: it touches the transport layer
and session routing, not capability discovery. Keeping the two commits distinct
means a regression in either can be reverted without undoing the other.

## Named-keys reframe (owner decision)

The v2.19.0 framing — "the companion is a principal" — is a category error. The
extension is a human clicking *Save* in their browser; it authenticates with a
JWT as that human, and `extensionRoutes.js` correctly records
`actor: { kind: 'human' }` at six sites (337, 416, 482, 574, 805). Attributing
those saves to an agent principal would be less true, not more.

- **Copy becomes what is true:** this mints a named key for the user's *external*
  MCP client (Claude Desktop / Cursor). The "everything it saves is attributed to
  it — authorship, memory, activity feed" claim is removed.
- **Real wiring bug fixed:** `configSnippet` (`McpConnectionSection.jsx:97`) is
  built only from `result.mcpToken` and ignores `namedKey.key`, so minting a named
  key then copying the snippet yields the anonymous key. The snippet prefers the
  named key when one was just minted.

## Tests

Root cause of the original defect was an invented fixture, so fixtures are
**captured from live servers**, committed with provenance, never hand-written:

- `cloud-v2.40.0.json` — `instanceId:"public"`, `deploymentLocality:"cloud"`,
  `mcp:{enabled:false,tools:39,cloudGatedTools:["glassy_notify"]}` (no `mounted`),
  `agentIdentity:{available:false,mode:"single-key"}`, `notifications:{available:false}`,
  no `vault` key.
- `selfhost-v2.40.4.json` — `instanceId:"self_hosted"`, `deploymentLocality:"local"`,
  `mcp:{enabled:true,mounted:true,mountState:"mounted",tools:40,cloudGatedTools:[]}`,
  `agentIdentity:{available:true,mode:"named-keys"}`, `notifications:{available:true}`,
  no `vault` key.

Both recorded 2026-09-26 from `https://glassy.fyi` and the `sh-rig` container
(`ghcr.io/0reliance/glassy-dash:v2.40.4`, `127.0.0.1:3010`). Both lack `vault` —
that is the pre-change baseline the server dependency must move.

Covered: predicate resolution per fixture; fail-closed with no cache; stale-on-error
with a cache; baseUrl-scoped invalidation; in-flight dedupe (two concurrent callers,
one fetch); `authPolicy:'background'` not clearing storage; storage-driven login routing.

## Guard: closing the hole that let this ship

The ungated Vault tab survived because `capabilitySplitGuard.test.js` scans
`glassy-dash/src/` — **its blast radius stops at the repo boundary.** Cross-repo
scanning from dash CI is awkward, so the guard belongs where the surface lives:
a companion-repo test asserting every `TABS` entry and every Settings section
declares a capability gate. Task 0.4's approach, applied in the correct repo.

## Sequencing

Server change → deploy → extension release. If the extension's vault gate ships
before the `vault` manifest key exists, it fails closed and the Vault tab
disappears for self-host users who have a working vault.

Release must be a **new version**, not a re-tag of 2.19.0. The published
`glassy-companion-v2.19.0.zip`/`.xpi` and both `dist/` trees are dated Sep 23 and
contain zero occurrences of `mounted`; the Sep 26 commit `074bddb` never reached
an artifact. `pre-flight-release.js` compares version *strings* and the manifest
inside the zip, and `verify-companion-version-sync.js` compares `2.19.0 == 2.19.0`,
so both gates pass while shipped code and source disagree.

## Out of scope

- **Server-driven surfaces** (Approach B) — YAGNI at five tabs.
- **Making extension saves attributable to an agent principal** — rejected as a
  category error; the human attribution is correct.
- **Consolidating `pingServer()` / `verifyToken()` / `getKbStatus()` / `?extv=`**
  into the contract. They answer different questions (reachability, session
  validity, index state, bridge transport); folding them in would recreate the
  capability/liveness conflation this design removes. Left alone deliberately.
- **A minimum-server-version gate.** Unnecessary given the no-backwards-compatibility
  decision; `version` is still retained so a future gate is a one-line addition
  rather than a new fetch.
- **`STORE_LISTING.md:27` drift** ("20 tools, 4 prompts, 7 resources", pinned to
  `v2.36.0-beta.13+`; actual is 40 appliance / 36 cloud at HEAD) and the companion
  **README's recommendation of `v2.36.0-beta.40`**, which contradicts the
  self-host compose file's `v2.40.4`. Both are documentation corrections, not
  design; they should ride along with whichever release carries this work.



