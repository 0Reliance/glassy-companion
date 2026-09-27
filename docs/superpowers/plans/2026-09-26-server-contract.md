# Server Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/capabilities` the single source of truth for what a Glassy instance can do, delete the extension's nine per-feature availability probes, and ship the result as companion v2.20.0.

**Architecture:** A new `serverContract` module fetches the manifest once, caches it per `baseUrl` with a 30s TTL, returns stale-on-error, and dedupes concurrent callers. Every surface gates on it. **Capability** (static, from the manifest) gates *visibility*; **liveness** (e.g. is the bridge connected) gates *state* and stays separate. Requires two additive server fields, which must deploy before the extension ships its gates.

**Tech Stack:** glassy-dash — Node 20 / Express 5, async `sqlite3` wrapper, vitest (`vitest.server.config.js`). glassy-companion — React 19, Manifest V3, Vite 5, vitest 2, `chrome.storage.local`.

**Spec:** `glassy-companion/docs/superpowers/specs/2026-09-26-server-contract-design.md`

## Global Constraints

- **No backwards compatibility.** Owner decision 2026-09-26: "we are only moving forward." Target the current server; do not add legacy fallback paths or a minimum-version gate.
- **Every glassy-dash DB query MUST be awaited.** `server/db.js` wraps async `sqlite3`, not `better-sqlite3`. A missing `await` yields a Promise and crashes at runtime.
- **Never mutate schema directly.** Migrations live in `server/migrations/`. (This plan needs none — `obsidian_enabled` already exists via migration 0068.)
- **No new dependencies** in either repo.
- **Test fixtures are captured from live servers, never hand-written.** The defect this plan fixes shipped because a fixture was invented. Provenance must be recorded in the fixture file.
- **Release as v2.20.0. Never re-tag v2.19.0** — the published 2.19.0 zip/xpi predate the code they claim to be, and both version gates pass on string comparison alone.
- **Never run a deploy as a foreground command.** `dev.sh deploy` takes 10–25 min and the runner kills commands at ~30s. Detach with `setsid`, poll the log, and space out polls. A killed deploy strands `/tmp/glassy-dash-deploy.lock`.
- **Companion icons/animations:** Lucide React for icons, framer-motion for animation, react-hot-toast for toasts — but this plan touches no animation or toast code.
- Test commands: glassy-dash `npx vitest run --config vitest.server.config.js <path>`; glassy-companion `npx vitest run <path>`.

## File Structure

**glassy-dash** (Phase 1, ships first):
- Modify `server/routes/capabilities.js` — add the `vault` capability entry.
- Modify `server/routes/extensionRoutes.js:190-214` — return `obsidian_enabled` from `/api/ext/me`.
- Modify `server/tests/routes/capabilities.test.js` — pin `vault` against the enforcing module.
- Modify `server/tests/guards/capabilitySplitGuard.test.js` — assert the manifest *reports* vault.

**glassy-companion** (Phase 2):
- Create `src/lib/__tests__/fixtures/manifest-cloud-v2.40.0.json` — captured live.
- Create `src/lib/__tests__/fixtures/manifest-selfhost-v2.40.4.json` — captured live.
- Create `src/lib/serverContract.js` — cache, projection, dedupe, invalidation.
- Create `src/lib/__tests__/serverContract.test.js`
- Modify `src/lib/api.js` — `fetchCapabilities()` → raw `fetchManifest()` transport; drop `DEFAULT_CAPABILITIES`.
- Rename `src/popup/hooks/useCapabilities.js` → `src/popup/hooks/useServerContract.js`
- Modify `src/popup/Popup.jsx` — consume contract; gate vault; pass to AppShell.
- Modify `src/popup/components/AppShell.jsx` — `TABS` becomes a function of the contract.
- Modify `src/popup/views/McpConnectionSection.jsx` — delete probe + `interpretStatus`; gate on contract; fix named-key snippet; reframe copy.
- Delete `src/popup/views/__tests__/McpConnectionSection.test.js`
- Rewrite `src/lib/__tests__/capabilities.test.js` → `src/lib/__tests__/manifestTransport.test.js`
- Modify `src/popup/views/SettingsView.jsx` — gate both sections.
- Modify `src/lib/auth.js` — `setBaseUrl()` invalidates the contract.
- Create `src/lib/obsidianStatus.js` + test — shared liveness cache.
- Create `src/lib/__tests__/surfaceGateGuard.test.js` — the repo-boundary guard.

**glassy-companion** (Phase 3, separate commit):
- Modify `src/lib/api.js` — `authPolicy` option on `apiFetch`.
- Modify `src/lib/notificationPoller.js` / `src/lib/api.js` — background lane passes `'background'`.
- Modify `src/popup/hooks/useAppState.js` — subscribe to token removal, route to login.

---

## Phase 1 — glassy-dash server (must deploy before Phase 2 ships)

### Task 1: Report the vault as a capability

**Files:**
- Modify: `glassy-dash/server/routes/capabilities.js` (insert after the `notifications` block, currently line 209)
- Test: `glassy-dash/server/tests/routes/capabilities.test.js`
- Test: `glassy-dash/server/tests/guards/capabilitySplitGuard.test.js`

**Interfaces:**
- Consumes: `selfHost` — already computed in `buildCapabilities()` at line 50 via `isSelfHostedInstance()`.
- Produces: `capabilities.vault = { available: boolean }` in the `GET /api/capabilities` response. Task 5 reads it as `caps.vault?.available === true`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('GET /api/capabilities', …)` block in `server/tests/routes/capabilities.test.js`:

```js
  it('reports the vault as an appliance capability, matching the module that enforces it', () => {
    // The dashboard already hides the vault on cloud (src/components/Sidebar.jsx:136
    // gates on isSelfHostedInstance()), but the manifest published no vault entry, so
    // the browser extension had nothing to gate its Vault tab on and rendered it
    // everywhere - on cloud every vault call must fail. Asserting BOTH identities is
    // what makes this non-vacuous: a hardcoded `available: true` passes one arm only.
    const { buildCapabilities } = require('../../routes/capabilities.js')
    const { isSelfHostedInstance } = require('../../utils/instanceAccess.js')
    const prev = process.env.INSTANCE_ID
    try {
      process.env.INSTANCE_ID = 'self_hosted'
      expect(buildCapabilities().vault).toEqual({ available: true })
      expect(isSelfHostedInstance()).toBe(true)

      process.env.INSTANCE_ID = 'public'
      expect(buildCapabilities().vault).toEqual({ available: false })
      expect(isSelfHostedInstance()).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.INSTANCE_ID
      else process.env.INSTANCE_ID = prev
    }
  })
```

And extend the first test inside `describe('capability split - self-host power, cloud restriction', …)` in `server/tests/guards/capabilitySplitGuard.test.js`, immediately after the existing `agentIdentity` assertions:

```js
    // The reporting half of the vault split. obsidian.js is already in KNOWN_GATED,
    // so the enforcing half is covered; without this the gate exists unreported,
    // which is what the guard's own doc comment calls "as wrong as" the reverse.
    expect(caps.vault).toBeTruthy()
    expect(typeof caps.vault.available).toBe('boolean')
```

- [ ] **Step 2: Run both tests, verify they FAIL**

Run: `cd /home/pozi/glassy-dash && npx vitest run --config vitest.server.config.js server/tests/routes/capabilities.test.js server/tests/guards/capabilitySplitGuard.test.js`
Expected: FAIL — `buildCapabilities().vault` is `undefined`, so `toEqual({ available: true })` reports `undefined` vs object.

- [ ] **Step 3: Implement**

In `server/routes/capabilities.js`, insert between the `notifications` block (ends line 209) and the `// #75, the owner's answer:` renderers comment:

```js
    // Companion surface truth — the vault needs the Obsidian bridge/plugin running on
    // the owner's own hardware, which a multi-tenant instance can never reach. Same
    // rule the dashboard already applies (src/components/Sidebar.jsx:136) and the same
    // shape as `notifications` above. Reported here so the browser extension gates its
    // Vault tab on the manifest instead of guessing from an endpoint's HTTP status.
    vault: {
      available: selfHost,
    },
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `cd /home/pozi/glassy-dash && npx vitest run --config vitest.server.config.js server/tests/routes/capabilities.test.js server/tests/guards/capabilitySplitGuard.test.js`
Expected: PASS, with no other test in either file regressed.

- [ ] **Step 5: Record the pre-change live baseline**

The `sh-rig` container (`ghcr.io/0reliance/glassy-dash:v2.40.4`) runs on `127.0.0.1:3010`. It serves the *published image*, so it will NOT show the new key yet — this records the baseline Task 3 must move.

Run: `curl -s http://localhost:3010/api/capabilities | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s).capabilities;console.log('vault:',JSON.stringify(c.vault??'ABSENT'))})"`
Expected: `vault: "ABSENT"`

- [ ] **Step 6: Commit**

```bash
cd /home/pozi/glassy-dash
git add server/routes/capabilities.js server/tests/routes/capabilities.test.js server/tests/guards/capabilitySplitGuard.test.js
git commit -m "feat(capabilities): report the vault as an appliance capability

The manifest published agentIdentity and notifications but no vault entry, so the
browser extension had nothing to gate its Vault tab on and rendered it on cloud,
where every vault call must fail. The dashboard already hides the vault on the same
rule (Sidebar.jsx:136); this is the reporting half the split guard demands.

Asserted against BOTH instance identities - a hardcoded available:true passes one
arm and fails the other."
```

---

### Task 2: Return `obsidian_enabled` from `/api/ext/me`

**Files:**
- Modify: `glassy-dash/server/routes/extensionRoutes.js:190-214`
- Test: `glassy-dash/server/tests/routes/extensionRoutes.test.js` (no `/api/ext/me` test exists today — this adds the first)

**Interfaces:**
- Consumes: the `users.obsidian_enabled` column (migration 0068, `INTEGER NOT NULL DEFAULT 0`).
- Produces: `obsidian_enabled: boolean` on the `/api/ext/me` JSON body. Task 6 reads it as `user.obsidian_enabled`.

- [ ] **Step 1: Write the failing test**

Append inside `describe('extensionRoutes', …)` in `server/tests/routes/extensionRoutes.test.js`, reusing that suite's existing `prepare` / `app` harness (see its `beforeEach`):

```js
  it('GET /api/ext/me reports obsidian_enabled as a boolean, both states', async () => {
    // The companion gates its Vault tab on (manifest vault.available && this), the
    // same conjunction the dashboard uses. Without the column in this response the
    // extension could only gate on the instance, and would show the vault to a
    // self-host user who never turned it on.
    const meRow = (obsidian_enabled) => ({
      id: 11, email: 'ext@test.com', name: 'Ext', avatar_url: null,
      entitlements_json: JSON.stringify({ glassy_keep: true }),
      obsidian_enabled,
    })
    const stub = (enabled) => prepare.mockImplementation(sql => {
      if (sql.includes('entitlements_json, obsidian_enabled FROM users')) {
        return { get: vi.fn().mockResolvedValue(meRow(enabled)) }
      }
      if (sql.includes('FROM accounts WHERE user_id')) {
        return { all: vi.fn().mockResolvedValue([{ id: 22, label: 'Main', color: '#fff', is_primary: 1 }]) }
      }
      throw new Error(`unexpected query in /me test: ${sql}`)
    })

    stub(1)
    const res = await request(app).get('/api/ext/me')
    expect(res.status).toBe(200)
    expect(res.body.obsidian_enabled).toBe(true)

    // Falsy arm: SQLite stores 0; the response must be `false`, never 0 or undefined.
    stub(0)
    const off = await request(app).get('/api/ext/me')
    expect(off.body.obsidian_enabled).toBe(false)
  })
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `cd /home/pozi/glassy-dash && npx vitest run --config vitest.server.config.js server/tests/routes/extensionRoutes.test.js -t 'obsidian_enabled'`
Expected: FAIL — `unexpected query in /me test: SELECT id, email, name, avatar_url, entitlements_json FROM users …`, because the route does not yet select the column.

- [ ] **Step 3: Implement**

In `server/routes/extensionRoutes.js`, change the `/me` handler's SELECT (line 193):

```js
  const user = await db.prepare(
    `SELECT id, email, name, avatar_url, entitlements_json, obsidian_enabled FROM users WHERE id = ?`
  ).get(req.user.id)
```

and add one key to the `res.json({...})` object (line 205), immediately after `entitlements,`:

```js
    // The companion gates its Vault tab on (capabilities.vault.available && this).
    // Coerced to a real boolean: SQLite stores 0/1, and a client reading
    // `user.obsidian_enabled === true` must not have to know which was sent.
    obsidian_enabled: !!user.obsidian_enabled,
```

- [ ] **Step 4: Run the whole file, verify PASS**

Run: `cd /home/pozi/glassy-dash && npx vitest run --config vitest.server.config.js server/tests/routes/extensionRoutes.test.js`
Expected: PASS, including the pre-existing note/bookmark tests — the SELECT change is additive.

- [ ] **Step 5: Commit**

```bash
cd /home/pozi/glassy-dash
git add server/routes/extensionRoutes.js server/tests/routes/extensionRoutes.test.js
git commit -m "feat(ext): /api/ext/me reports obsidian_enabled

The companion needs the per-user half of the vault gate. The dashboard computes
showVault = obsidian_enabled && isSelfHostedInstance(); the extension could only
reach the instance half, so it would show the vault to a self-host user who never
enabled it. Coerced to boolean so the client need not know SQLite stores 0/1."
```


### Task 3: Deploy the server change — OWNER GREENLIGHT REQUIRED

**Do not start this task without explicit owner approval.** This machine *is* production (`glassy.fyi`).

- [ ] **Step 1: Confirm clean tree and green tests**

Run: `cd /home/pozi/glassy-dash && git status --short && npx vitest run --config vitest.server.config.js server/tests/routes/capabilities.test.js server/tests/routes/extensionRoutes.test.js server/tests/guards/capabilitySplitGuard.test.js`
Expected: no uncommitted changes; all three files PASS.

- [ ] **Step 2: Check for a stranded deploy lock**

Run: `ls -la /tmp/glassy-dash-deploy.lock 2>/dev/null || echo 'no lock'`
Expected: `no lock`. If a lock exists, read the PID it records, confirm that PID is dead (`ps -p <pid>`), then `rm /tmp/glassy-dash-deploy.lock`. **Never remove a lock whose PID is alive.**

- [ ] **Step 3: Launch the deploy DETACHED**

A foreground deploy is killed at ~30s and strands the lock.

Run: `cd /home/pozi/glassy-dash && setsid bash -c './dev.sh deploy > /tmp/gd-deploy.log 2>&1; echo EXIT=$? >> /tmp/gd-deploy.log' < /dev/null > /dev/null 2>&1 & echo launched`
Expected: `launched`

- [ ] **Step 4: Poll — spaced out, never tight**

The build runs 10–25 min. Do other work between polls; do not loop on this.

Run: `tail -5 /tmp/gd-deploy.log`
Expected eventually: a trailing line `EXIT=0`.

- [ ] **Step 5: Verify by revision label, not by log progress**

Run: `curl -s https://glassy.fyi/api/instance; echo; curl -s https://glassy.fyi/api/capabilities | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('version',j.version,'vault',JSON.stringify(j.capabilities.vault))})"`
Expected: `instanceId:"public"` and `vault {"available":false}` — cloud carries the restriction.

Run: `docker inspect glassy-dash-prod --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'`
Expected: the commit SHA produced by Task 1/2.

- [ ] **Step 6: Record the appliance-side state**

Run: `curl -s http://localhost:3010/api/capabilities | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('version',j.version,'vault',JSON.stringify(j.capabilities.vault??'ABSENT'))})"`
Expected: the rig serves the *published* image, so `vault` appears only once a new image is published and the rig re-pulled. **Write down which state you actually observed** — do not assume it moved.

---


## Phase 2 — glassy-companion contract refactor

### Task 4: Capture live fixtures; reduce `api.js` to raw transport

**Files:**
- Create: `src/lib/__tests__/fixtures/manifest-cloud.json`, `manifest-selfhost.json`, `README.md`
- Modify: `src/lib/api.js:355-397` — replace `DEFAULT_CAPABILITIES` + `fetchCapabilities`
- Modify: `src/lib/constants.js` — add the `capabilities` path
- Test: create `src/lib/__tests__/manifestTransport.test.js`
- Test: rename `src/lib/__tests__/capabilities.test.js` → `agentSurfaces.test.js`, dropping its `fetchCapabilities` describe

**Interfaces:**
- Consumes: `getBaseUrl()` from `auth.js`; `ApiError` from `api.js`.
- Produces: `fetchManifest(): Promise<{version, instanceId, deploymentLocality, capabilities}>` — **throws** on any failure. Task 5 is its only caller and owns all error handling.

- [ ] **Step 1: Capture the fixtures from live servers — never hand-write them**

The defect this plan fixes shipped because a fixture was invented. These are verbatim captures.

```bash
cd /home/pozi/glassy-companion && mkdir -p src/lib/__tests__/fixtures
curl -s https://glassy.fyi/api/capabilities -o src/lib/__tests__/fixtures/manifest-cloud.json
curl -s http://localhost:3010/api/capabilities -o src/lib/__tests__/fixtures/manifest-selfhost.json
node -e "for (const f of ['manifest-cloud','manifest-selfhost']) { const j=require('./src/lib/__tests__/fixtures/'+f+'.json'); console.log(f,'version',j.version,'instanceId',j.instanceId,'mcp.mounted',j.capabilities.mcp.mounted ?? 'ABSENT','vault',JSON.stringify(j.capabilities.vault ?? 'ABSENT')) }"
```
Expected:
```
manifest-cloud version 2.40.0 instanceId public mcp.mounted ABSENT vault "ABSENT"
manifest-selfhost version 2.40.4 instanceId self_hosted mcp.mounted true vault "ABSENT"
```
If `sh-rig` is not running, start it or capture from another appliance — **do not substitute a hand-written file.** If none is reachable, stop and say so; the fixtures are the point of this task.

`vault` reads `ABSENT` in both until Task 3 deploys. That is the honest baseline: Task 5 asserts `vault.available === false` for these fixtures, and Task 6 re-captures after the deploy so the gate is proven against a manifest that actually carries the key.

- [ ] **Step 2: Record provenance**

Create `src/lib/__tests__/fixtures/README.md`:

```markdown
# Manifest fixtures

Verbatim captures of `GET /api/capabilities`. **Never hand-edit these files.**
The `interpretStatus` defect this suite exists to prevent was caused by a fixture
written from imagination (`{mounted:true}` on `/mcp/status`, a body no server has
ever emitted) which then certified the bug.

Re-capture with:

    curl -s https://glassy.fyi/api/capabilities     -o manifest-cloud.json
    curl -s http://localhost:3010/api/capabilities  -o manifest-selfhost.json

| File | Captured | Source | `mcp.mounted` | `vault` |
|---|---|---|---|---|
| `manifest-cloud.json` | 2026-09-26 | `https://glassy.fyi` v2.40.0, `instanceId: public` | absent | absent |
| `manifest-selfhost.json` | 2026-09-26 | `sh-rig` `ghcr.io/0reliance/glassy-dash:v2.40.4` @ `127.0.0.1:3010`, `instanceId: self_hosted` | `true` | absent |

Re-capture both after any server release that changes the manifest, and update this
table. A fixture whose provenance is unknown is worse than no fixture.
```


- [ ] **Step 3: Write the failing transport test**

Create `src/lib/__tests__/manifestTransport.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'

// House mock pattern: auth is mocked before importing api.
vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => Promise.resolve('test-token')),
  getBaseUrl: vi.fn(() => Promise.resolve('https://glassy.test')),
  getActiveAccountId: vi.fn(() => Promise.resolve('acc-1')),
  getApiContext: vi.fn(() => Promise.resolve({ baseUrl: 'https://glassy.test', activeAccountId: 'acc-1' })),
  clearAuth: vi.fn(),
}))

const { fetchManifest, ApiError } = await import('../api.js')
const cloud = (await import('./fixtures/manifest-cloud.json')).default
const selfHost = (await import('./fixtures/manifest-selfhost.json')).default

const jsonRes = (body, ok = true, status = 200) => ({
  ok, status, headers: { get: () => 'application/json' }, json: async () => body,
})

describe('fetchManifest — raw transport for the server contract', () => {
  beforeEach(() => { vi.clearAllMocks(); globalThis.fetch = vi.fn() })

  it('returns the WHOLE manifest, not a projection — the version is the point', async () => {
    // The old fetchCapabilities kept 2 of ~9 keys and discarded `version`, which the
    // server publishes explicitly "so an agent can tell two instances apart".
    globalThis.fetch.mockResolvedValueOnce(jsonRes(selfHost))
    const m = await fetchManifest()
    expect(m.version).toBe(selfHost.version)
    expect(m.instanceId).toBe('self_hosted')
    expect(m.capabilities.mcp.mounted).toBe(true)
    expect(m.capabilities.agentIdentity.mode).toBe('named-keys')
  })

  it('does not use apiFetch: no Authorization header, no clearAuth side effect', async () => {
    // Public, and it must gate the LOGIN screen, so no JWT — and a stale token must
    // not log the user out as a side effect of reading it.
    const { clearAuth } = await import('../auth.js')
    globalThis.fetch.mockResolvedValueOnce(jsonRes(cloud))
    await fetchManifest()
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://glassy.test/api/capabilities')
    expect(opts?.headers?.Authorization).toBeUndefined()
    expect(clearAuth).not.toHaveBeenCalled()
  })

  it('THROWS on non-ok, malformed, and missing baseUrl — meaning is the contract job', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonRes({}, false, 404))
    await expect(fetchManifest()).rejects.toBeInstanceOf(ApiError)

    globalThis.fetch.mockResolvedValueOnce(jsonRes({ version: '1' })) // no capabilities
    await expect(fetchManifest()).rejects.toThrow(/malformed/i)

    const { getBaseUrl } = await import('../auth.js')
    getBaseUrl.mockResolvedValueOnce('')
    await expect(fetchManifest()).rejects.toBeInstanceOf(ApiError)
  })

  it('bounds the request — no unbounded fetch enters this codebase again', async () => {
    // The /mcp/status probe this replaces had no AbortController at all.
    globalThis.fetch.mockImplementationOnce((_u, opts) => {
      expect(opts.signal).toBeInstanceOf(AbortSignal)
      return Promise.resolve(jsonRes(cloud))
    })
    await fetchManifest()
  })
})
```

- [ ] **Step 4: Run it, verify FAIL**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/manifestTransport.test.js`
Expected: FAIL — `fetchManifest` is not exported from `api.js`.


- [ ] **Step 5: Implement the transport**

In `src/lib/constants.js`, add to `API_PATHS` after the `notifications` entry:

```js
  // Public capability manifest — the single source of truth for what this instance
  // can do. Unauthenticated by design, so it can gate the login screen.
  capabilities: '/api/capabilities',
```

In `src/lib/api.js`, **delete** `DEFAULT_CAPABILITIES` and the whole `fetchCapabilities` function (lines ~355-397), replacing both with:

```js
// ── Capability manifest transport (the server contract's only data source) ─────

/**
 * GET /api/capabilities — raw transport. Returns the WHOLE manifest or throws.
 *
 * Deliberately NOT apiFetch: the manifest is public and unauthenticated (the server
 * mounts it exactly like /api/instance), it must be readable pre-login so it can gate
 * the login screen, and a stale JWT must not clearAuth() as a side effect of reading
 * it. 10s hard timeout.
 *
 * No projection and no defaults here. Every decision about what a failed or partial
 * fetch MEANS lives in lib/serverContract.js, so exactly one place interprets the
 * manifest. The previous fetchCapabilities kept 2 of ~9 keys and threw the rest away
 * — including `version`, which the server publishes specifically "so an agent can
 * tell two instances apart".
 *
 * @returns {Promise<{version:string, instanceId:string, deploymentLocality:string, capabilities:object}>}
 * @throws {ApiError} on no-baseUrl, non-ok, or malformed body
 */
export async function fetchManifest() {
  const baseUrl = await getBaseUrl()
  if (!baseUrl) throw new ApiError(0, 'No server URL configured.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${baseUrl}${API_PATHS.capabilities}`, { signal: controller.signal })
    if (!res.ok) throw new ApiError(res.status, `Capability manifest unavailable (${res.status}).`)
    const body = await res.json()
    if (!body || typeof body !== 'object' || !body.capabilities || typeof body.capabilities !== 'object') {
      throw new ApiError(0, 'Capability manifest malformed.')
    }
    return body
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 6: Rename the old test file, keeping its still-valid tests**

Run: `cd /home/pozi/glassy-companion && git mv src/lib/__tests__/capabilities.test.js src/lib/__tests__/agentSurfaces.test.js`

In `agentSurfaces.test.js`: **delete** the entire `describe('fetchCapabilities — the client-side capability gate', …)` block, and drop `fetchCapabilities` / `DEFAULT_CAPABILITIES` from the `await import('../api.js')` destructure. The `createNamedMcpKey` and `fetchUnreadNotifications` describes stay exactly as they are — both remain valid.

- [ ] **Step 7: Run the two suites, verify PASS**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/manifestTransport.test.js src/lib/__tests__/agentSurfaces.test.js`
Expected: PASS.

Do **not** run the whole suite yet: `useCapabilities.js` and `Popup.jsx` still import the now-deleted `fetchCapabilities`, so the full run stays RED until Task 5 and Task 6 land. That is expected mid-refactor, not a failure.

- [ ] **Step 8: Commit**

```bash
cd /home/pozi/glassy-companion
git add src/lib/api.js src/lib/constants.js src/lib/__tests__/fixtures \
        src/lib/__tests__/manifestTransport.test.js src/lib/__tests__/agentSurfaces.test.js
git commit -m "refactor(api): fetchManifest returns the whole manifest or throws

fetchCapabilities kept 2 of ~9 keys and discarded version, which the server
publishes specifically so a client can tell two instances apart. Projection and
every error decision move to lib/serverContract.js (next commit) so exactly one
place interprets the manifest.

Fixtures are verbatim live captures with recorded provenance, never hand-written:
the interpretStatus defect this replaces was certified by a fixture someone invented."
```

---


### Task 5: The `serverContract` module

**Files:**
- Create: `src/lib/serverContract.js`
- Test: create `src/lib/__tests__/serverContract.test.js`

**Interfaces:**
- Consumes: `fetchManifest()` from `api.js` (Task 4); `getBaseUrl()` from `auth.js`.
- Produces, for Tasks 6–8:
  - `getServerContract({ forceRefresh }?): Promise<Contract>`
  - `invalidateServerContract(): Promise<void>`
  - `projectContract(manifest): Contract` (exported for tests)
  - `FAIL_CLOSED: Contract`
  - `Contract = { version, instanceId, deploymentLocality, mcp:{available,enabled,tools}, vault:{available}, notifications:{available}, agentIdentity:{available,mode}, stale:boolean, resolved:boolean }`

**Design note the implementer must not "simplify" away:** the cache is ONE key
(`glassy_server_contract`) holding `{ baseUrl, data, fetchedAt }`. A `baseUrl`
mismatch is a cache miss. This is deliberate — it makes switching a server URL
cloud→self-host invalidate automatically, with no key enumeration and no
`chrome.storage.local.get(null)` (which the house storage mock does not implement).

- [ ] **Step 1a: Write the failing test — harness and projection cases**

Create `src/lib/__tests__/serverContract.test.js`. The `createStorageArea()` helper is copied verbatim from `cache.test.js` — reuse the house mock, do not invent a second one:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({ fetchManifest: vi.fn() }))
vi.mock('../auth.js', () => ({ getBaseUrl: vi.fn(() => Promise.resolve('https://glassy.test')) }))

function createStorageArea() {
  const store = new Map()
  return {
    async get(key) {
      if (Array.isArray(key)) return Object.fromEntries(key.map(e => [e, store.get(e)]))
      return { [key]: store.get(key) }
    },
    async set(values) { for (const [k, v] of Object.entries(values)) store.set(k, v) },
    async remove(key) { for (const k of (Array.isArray(key) ? key : [key])) store.delete(k) },
    _store: store,
  }
}

const cloud = (await import('./fixtures/manifest-cloud.json')).default
const selfHost = (await import('./fixtures/manifest-selfhost.json')).default

let local, getServerContract, invalidateServerContract, projectContract, FAIL_CLOSED, fetchManifest, getBaseUrl

beforeEach(async () => {
  local = createStorageArea()
  vi.stubGlobal('chrome', { storage: { local } })
  vi.resetModules()                       // clear the module-level in-flight promise
  vi.clearAllMocks()
  ;({ fetchManifest } = await import('../api.js'))
  ;({ getBaseUrl } = await import('../auth.js'))
  getBaseUrl.mockResolvedValue('https://glassy.test')
  ;({ getServerContract, invalidateServerContract, projectContract, FAIL_CLOSED } =
      await import('../serverContract.js'))
})

describe('projectContract — capability predicates against LIVE-CAPTURED fixtures', () => {
  it('appliance: mcp available because mounted is true, agentIdentity named-keys', () => {
    const c = projectContract(selfHost)
    expect(c.mcp.available).toBe(true)
    expect(c.mcp.tools).toBe(40)
    expect(c.agentIdentity).toEqual({ available: true, mode: 'named-keys' })
    expect(c.notifications.available).toBe(true)
    expect(c.instanceId).toBe('self_hosted')
    expect(c.version).toBe(selfHost.version)   // retained, not discarded
    expect(c.resolved).toBe(true)
  })

  it('cloud v2.40.0: mcp UNavailable because `mounted` is ABSENT, not because it is false', () => {
    // The whole point of `=== true`: an older manifest with no mounted key must not
    // read as available. This is the predicate interpretStatus got right while
    // reading it from an endpoint that has never emitted it.
    expect(selfHost.capabilities.mcp.mounted).toBe(true)
    expect(cloud.capabilities.mcp.mounted).toBeUndefined()
    const c = projectContract(cloud)
    expect(c.mcp.available).toBe(false)
    expect(c.mcp.enabled).toBe(false)
    expect(c.agentIdentity).toEqual({ available: false, mode: 'single-key' })
    expect(c.notifications.available).toBe(false)
  })

  it('vault is unavailable while the manifest omits the key — fails closed, never guesses', () => {
    // Both fixtures predate the server change; vault is ABSENT in each. Once Task 3
    // deploys, re-capture and add the positive arm.
    expect(projectContract(selfHost).vault.available).toBe(false)
    expect(projectContract(cloud).vault.available).toBe(false)
    expect(projectContract({ capabilities: { vault: { available: true } } }).vault.available).toBe(true)
  })

  it('a malformed or empty manifest projects to fail-closed, never throws', () => {
    for (const bad of [undefined, null, {}, { capabilities: null }, { capabilities: 'nope' }]) {
      const c = projectContract(bad)
      expect(c.mcp.available).toBe(false)
      expect(c.vault.available).toBe(false)
      expect(c.notifications.available).toBe(false)
    }
  })
})
```


- [ ] **Step 1b: Append the cache / dedupe / staleness cases to the same file**

```js
describe('getServerContract — cache, dedupe, staleness', () => {
  it('fetches once, then serves from cache inside the TTL', async () => {
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    await getServerContract()
    expect(fetchManifest).toHaveBeenCalledTimes(1)
  })

  it('dedupes CONCURRENT callers into one fetch', async () => {
    // Popup.jsx and McpConnectionSection.jsx each call the hook today: two fetches
    // per popup open. The module-level in-flight promise must collapse them.
    fetchManifest.mockResolvedValue(selfHost)
    const [a, b] = await Promise.all([getServerContract(), getServerContract()])
    expect(fetchManifest).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('refetches after the TTL expires', async () => {
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 31_000)
    await getServerContract()
    expect(fetchManifest).toHaveBeenCalledTimes(2)
  })

  it('forceRefresh bypasses a fresh cache', async () => {
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    await getServerContract({ forceRefresh: true })
    expect(fetchManifest).toHaveBeenCalledTimes(2)
  })

  it('a baseUrl change is a cache MISS — no stale cloud manifest on a self-host switch', async () => {
    fetchManifest.mockResolvedValue(cloud)
    await getServerContract()
    getBaseUrl.mockResolvedValue('http://192.168.1.20:8080')
    fetchManifest.mockResolvedValue(selfHost)
    const c = await getServerContract()
    expect(fetchManifest).toHaveBeenCalledTimes(2)
    expect(c.mcp.available).toBe(true)
  })

  it('STALE-ON-ERROR: a failed refetch returns the cached contract marked stale', async () => {
    // Matches cache.js getCollections(). A transient blip must not silently disable
    // every self-host feature. Still safe: a stale CLOUD contract says available:false.
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 31_000)
    fetchManifest.mockRejectedValue(new Error('network down'))
    const c = await getServerContract()
    expect(c.stale).toBe(true)
    expect(c.mcp.available).toBe(true)
  })

  it('FAILS CLOSED when there is nothing cached and the fetch fails', async () => {
    fetchManifest.mockRejectedValue(new Error('network down'))
    const c = await getServerContract()
    expect(c).toEqual(FAIL_CLOSED)
    expect(c.resolved).toBe(false)
    expect(c.mcp.available).toBe(false)
  })

  it('invalidateServerContract forces a refetch', async () => {
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    await invalidateServerContract()
    await getServerContract()
    expect(fetchManifest).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/serverContract.test.js`
Expected: FAIL — cannot resolve `../serverContract.js`.


- [ ] **Step 3: Implement `src/lib/serverContract.js`**

Write the file in the two halves shown below (they are one continuous file).

```js
/**
 * serverContract — the ONE answer to "what can this server do?"
 *
 * The extension used to re-derive this per feature, nine different ways, and each
 * guess needed a bespoke fallback when it was wrong. That produced interpretStatus(),
 * which required a `mounted` claim from /mcp/status — a field that endpoint has never
 * emitted in any commit of glassy-dash. The predicate was right; the source was wrong.
 *
 * This module reads the authoritative source instead: GET /api/capabilities, fetched
 * once, cached, deduped, and projected into the booleans surfaces actually gate on.
 *
 * TWO CONCEPTS, KEPT APART:
 *   capability — static per instance. Does this server support vault/MCP/notifications?
 *                Gates surface VISIBILITY. That is this module.
 *   liveness   — dynamic per feature. Is the Obsidian bridge connected right now?
 *                Gates surface STATE. That is lib/obsidianStatus.js, never this.
 * Conflating them is why the Vault tab rendered on cloud while the dashboard hid it.
 */
import { getBaseUrl } from './auth.js'
import { fetchManifest } from './api.js'

const CACHE_KEY = 'glassy_server_contract'
// Mirrors the server's own `Cache-Control: public, max-age=30, must-revalidate`.
const TTL_MS = 30_000

/**
 * What every surface resolves to when there is nothing to trust: no cache AND a
 * failed fetch. The split rule applies to clients too — a self-host capability is
 * invisible until the manifest says it exists. Frozen so a consumer cannot mutate
 * the shared fail-closed object and leak state between popups.
 */
export const FAIL_CLOSED = Object.freeze({
  version: null,
  instanceId: null,
  deploymentLocality: null,
  mcp: Object.freeze({ available: false, enabled: false, tools: 0 }),
  vault: Object.freeze({ available: false }),
  notifications: Object.freeze({ available: false }),
  agentIdentity: Object.freeze({ available: false, mode: 'single-key' }),
  stale: false,
  resolved: false,
})

/**
 * Project a raw manifest into the contract. Pure, total, never throws: every field
 * is read with `=== true` so an ABSENT key fails closed exactly like a false one.
 * That is not defensive padding — cloud v2.40.0 has no `mcp.mounted` key at all,
 * and treating absence as availability is the bug this module replaces.
 *
 * @param {object|null|undefined} manifest
 * @returns {object} a frozen Contract with resolved:true
 */
export function projectContract(manifest) {
  const raw = (manifest && typeof manifest === 'object') ? manifest : {}
  const caps = (raw.capabilities && typeof raw.capabilities === 'object') ? raw.capabilities : {}
  const mcp = (caps.mcp && typeof caps.mcp === 'object') ? caps.mcp : {}
  const vault = (caps.vault && typeof caps.vault === 'object') ? caps.vault : {}
  const notif = (caps.notifications && typeof caps.notifications === 'object') ? caps.notifications : {}
  const ident = (caps.agentIdentity && typeof caps.agentIdentity === 'object') ? caps.agentIdentity : {}

  return Object.freeze({
    version: typeof raw.version === 'string' ? raw.version : null,
    instanceId: typeof raw.instanceId === 'string' ? raw.instanceId : null,
    deploymentLocality: typeof raw.deploymentLocality === 'string' ? raw.deploymentLocality : null,
    mcp: Object.freeze({
      // `mounted`, NOT `enabled`. `enabled` is what the config INTENDS; `mounted` is
      // what the process ACHIEVED (#125). A box whose MCP failed to attach would
      // otherwise advertise tools it cannot serve.
      available: mcp.mounted === true,
      enabled: mcp.enabled === true,
      tools: Number(mcp.tools) || 0,
    }),
    vault: Object.freeze({ available: vault.available === true }),
    notifications: Object.freeze({ available: notif.available === true }),
    agentIdentity: Object.freeze({
      available: ident.available === true,
      mode: ident.mode === 'named-keys' ? 'named-keys' : 'single-key',
    }),
    stale: false,
    resolved: true,
  })
}
```


Continuing the same file:

```js
// Collapses concurrent callers. Popup.jsx and McpConnectionSection.jsx each mount a
// hook; without this the popup fires two manifest fetches per open.
let inflight = null

/**
 * Read the contract for the currently configured server.
 *
 * Order matters: cache first (so a warm popup does no network), then in-flight dedupe,
 * then fetch. On failure return the STALE cached contract if one exists — a transient
 * blip must not silently disable every self-host feature — and only fail closed when
 * there is genuinely nothing to trust.
 *
 * @param {{forceRefresh?: boolean}} [opts]
 * @returns {Promise<object>} a frozen Contract; never throws
 */
export async function getServerContract({ forceRefresh = false } = {}) {
  let baseUrl = null
  try { baseUrl = await getBaseUrl() } catch { baseUrl = null }

  if (!forceRefresh && baseUrl) {
    try {
      const stored = await chrome.storage.local.get(CACHE_KEY)
      const cached = stored?.[CACHE_KEY]
      // baseUrl is INSIDE the entry, so pointing the extension at a different server
      // is a miss by construction — no stale cloud manifest can survive a switch to a
      // self-host appliance, and no key enumeration is needed to guarantee it.
      if (cached?.baseUrl === baseUrl && cached?.data && Date.now() - cached.fetchedAt < TTL_MS) {
        return projectContract(cached.data)
      }
    } catch { /* storage unavailable (tests, early boot) — fall through to fetch */ }
  }

  if (inflight) return inflight

  inflight = (async () => {
    try {
      const manifest = await fetchManifest()
      const contract = projectContract(manifest)
      try {
        await chrome.storage.local.set({
          [CACHE_KEY]: { baseUrl, data: manifest, fetchedAt: Date.now() },
        })
      } catch { /* caching is an optimisation; a write failure must not fail the read */ }
      return contract
    } catch {
      try {
        const stored = await chrome.storage.local.get(CACHE_KEY)
        const cached = stored?.[CACHE_KEY]
        // Stale beats blind: the cached manifest still describes this deployment, and
        // a stale CLOUD contract says available:false, so this can never produce the
        // false positive the split rule exists to prevent.
        if (cached?.baseUrl === baseUrl && cached?.data) {
          return Object.freeze({ ...projectContract(cached.data), stale: true })
        }
      } catch { /* fall through to FAIL_CLOSED */ }
      return FAIL_CLOSED
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/**
 * Drop the cached contract and cancel any dedupe state. Call on server-URL change
 * (auth.js setBaseUrl) and on logout, so the next read cannot inherit another
 * instance's capabilities.
 */
export async function invalidateServerContract() {
  inflight = null
  try { await chrome.storage.local.remove(CACHE_KEY) } catch { /* storage unavailable */ }
}
```

- [ ] **Step 4: Run the suite, verify PASS**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/serverContract.test.js src/lib/__tests__/manifestTransport.test.js`
Expected: PASS, every case in both files.

- [ ] **Step 5: Commit**

```bash
cd /home/pozi/glassy-companion
git add src/lib/serverContract.js src/lib/__tests__/serverContract.test.js
git commit -m "feat(contract): one cached manifest answers 'what can this server do'

Replaces nine per-feature availability probes with a single projection of
/api/capabilities: fetched once, cached 30s under a key that carries the baseUrl
(so switching servers is a miss by construction), deduped across concurrent
callers, stale-on-error, fail-closed only when there is nothing to trust.

Capability (static, gates visibility) is separated from liveness (dynamic, gates
state). That conflation is why the Vault tab rendered on cloud while the dashboard
correctly hid it.

Every predicate reads === true, so an ABSENT key fails closed like a false one.
Cloud v2.40.0 publishes no mcp.mounted at all; treating absence as availability is
precisely the interpretStatus bug, inverted."
```

---


### Task 6: The hook, and gating the Vault tab

**Files:**
- Rename: `src/popup/hooks/useCapabilities.js` → `src/popup/hooks/useServerContract.js`
- Modify: `src/popup/Popup.jsx:6,37-38,118-122`
- Modify: `src/popup/components/AppShell.jsx:3-13`
- Modify: `src/lib/auth.js` — `setBaseUrl()` invalidates the contract
- Test: create `src/lib/__tests__/useServerContract.test.js` (house precedent: `useExtensionBridge.test.js` tests a popup hook from `lib/__tests__/`)
- Test: create `src/popup/components/__tests__/AppShell.test.jsx`

**Interfaces:**
- Consumes: `getServerContract()` from `serverContract.js` (Task 5).
- Produces:
  - `useServerContract(): { contract: Contract, resolved: boolean }`
  - `tabsFor({ vaultAvailable }): Array<{id,label,icon}>` — exported from `AppShell.jsx` for the guard in Task 9.
  - `AppShell` gains a `vaultAvailable` prop (default `false`).

- [ ] **Step 1: Write the failing tests**

**Constraint discovered while writing this plan, do not re-litigate it:** `@testing-library/react` is **NOT installed** and must not be added. `SaveCard.test.jsx` documents this in its own header ("Since @testing-library/react is not available, we test the … contract directly"). There is also **no vitest config file**; the default environment is `node`, and tests opt into a DOM with a first-line `// @vitest-environment jsdom` pragma (see `src/content/__tests__/extractor.test.js`). `react-dom` and `jsdom` ARE available, so a real render is possible via `react-dom/client` + `act` from `react` (React 19 exports `act`).

Create `src/lib/__tests__/useServerContract.test.js`:

```js
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../lib/serverContract.js', () => ({
  getServerContract: vi.fn(),
  invalidateServerContract: vi.fn(),
  FAIL_CLOSED: {
    version: null, instanceId: null, deploymentLocality: null,
    mcp: { available: false, enabled: false, tools: 0 },
    vault: { available: false }, notifications: { available: false },
    agentIdentity: { available: false, mode: 'single-key' },
    stale: false, resolved: false,
  },
}))

const { getServerContract } = await import('../../lib/serverContract.js')
const { default: useServerContract } = await import('../../popup/hooks/useServerContract.js')

const APPLIANCE = {
  version: '2.40.4', instanceId: 'self_hosted', deploymentLocality: 'local',
  mcp: { available: true, enabled: true, tools: 40 },
  vault: { available: true }, notifications: { available: true },
  agentIdentity: { available: true, mode: 'named-keys' },
  stale: false, resolved: true,
}

// No @testing-library, so render a probe component and record what the hook returned.
function renderHook(Comp) {
  const seen = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const Probe = () => { seen.push(Comp()); return null }
  return {
    seen,
    get current() { return seen[seen.length - 1] },
    async mount() { await act(async () => { root.render(createElement(Probe)) }) },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

describe('useServerContract', () => {
  beforeEach(() => { vi.clearAllMocks(); globalThis.IS_REACT_ACT_ENVIRONMENT = true })

  it('starts fail-closed and unresolved, so no surface flashes on before the manifest lands', async () => {
    // A render that began from "available" would show the Vault tab on cloud for one
    // frame. resolved:false is what lets Popup tell "still loading" from "no".
    getServerContract.mockReturnValue(new Promise(() => {}))          // never settles
    const h = renderHook(useServerContract)
    await h.mount()
    expect(h.current.resolved).toBe(false)
    expect(h.current.contract.vault.available).toBe(false)
    expect(h.current.contract.mcp.available).toBe(false)
  })

  it('resolves to the contract the module returned', async () => {
    getServerContract.mockResolvedValue(APPLIANCE)
    const h = renderHook(useServerContract)
    await h.mount()
    expect(h.current.resolved).toBe(true)
    expect(h.current.contract.mcp.available).toBe(true)
    expect(h.current.contract.vault.available).toBe(true)
    expect(h.current.contract.version).toBe('2.40.4')
  })

  it('does not set state after unmount — the popup closes mid-fetch constantly', async () => {
    // The `alive` flag. Without it React warns and, worse, a late manifest can
    // resurrect a surface the user already navigated away from.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let settle
    getServerContract.mockReturnValue(new Promise(r => { settle = r }))
    const h = renderHook(useServerContract)
    await h.mount()
    await h.unmount()
    await act(async () => { settle(APPLIANCE); await Promise.resolve() })
    expect(errSpy).not.toHaveBeenCalledWith(expect.stringMatching(/not wrapped in act|unmounted component/i))
    expect(h.current.resolved).toBe(false)                            // never updated
    errSpy.mockRestore()
  })

  it('calls getServerContract exactly once per mount, not once per render', async () => {
    getServerContract.mockResolvedValue(APPLIANCE)
    const h = renderHook(useServerContract)
    await h.mount()
    await act(async () => { h.seen.length })                          // extra render pass
    expect(getServerContract).toHaveBeenCalledTimes(1)
  })
})
```


Create `src/popup/components/__tests__/AppShell.test.jsx`:

```js
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import AppShell, { tabsFor } from '../AppShell.jsx'

describe('tabsFor — the Vault tab is a capability, not a constant', () => {
  it('omits vault when the instance cannot serve it', () => {
    expect(tabsFor({ vaultAvailable: false }).map(t => t.id))
      .toEqual(['save', 'note', 'search', 'kb'])
  })

  it('includes vault, in its original position, when the instance can', () => {
    // Position matters: the tab order users know is save, note, search, vault, kb.
    expect(tabsFor({ vaultAvailable: true }).map(t => t.id))
      .toEqual(['save', 'note', 'search', 'vault', 'kb'])
  })

  it('defaults to hidden — a caller that forgets the prop fails closed', () => {
    expect(tabsFor().map(t => t.id)).not.toContain('vault')
    expect(tabsFor({}).map(t => t.id)).not.toContain('vault')
  })
})

describe('AppShell renders the gate', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const props = {
    activeView: 'save', onNavigate: vi.fn(), user: { email: 'a@b.c' },
    showSettings: false, onToggleSettings: vi.fn(),
  }
  const labels = () => [...container.querySelectorAll('nav button')].map(b => b.textContent)

  it('shows no Vault tab on cloud', async () => {
    await act(async () => {
      root.render(createElement(AppShell, { ...props, vaultAvailable: false }, createElement('div')))
    })
    expect(labels()).not.toContain('Vault')
    expect(labels()).toContain('Save')
  })

  it('shows the Vault tab on an appliance', async () => {
    await act(async () => {
      root.render(createElement(AppShell, { ...props, vaultAvailable: true }, createElement('div')))
    })
    expect(labels()).toContain('Vault')
  })

  it('the notifications badge still renders only when there are unread items', async () => {
    // Regression guard: this task rewrites AppShell's props, and the badge is the
    // other conditional in the header. Do not lose it while gating the tabs.
    await act(async () => {
      root.render(createElement(AppShell,
        { ...props, unreadNotifications: 3, onOpenNotifications: vi.fn() }, createElement('div')))
    })
    expect(container.querySelector('[data-testid="notifications-badge"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run them, verify FAIL**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/useServerContract.test.js src/popup/components/__tests__/AppShell.test.jsx`
Expected: FAIL — `../../popup/hooks/useServerContract.js` does not resolve, and `AppShell.jsx` exports no `tabsFor`.



- [ ] **Step 3: Implement**

**3a.** Rename the hook and rewrite it:

Run: `cd /home/pozi/glassy-companion && git mv src/popup/hooks/useCapabilities.js src/popup/hooks/useServerContract.js`

Replace the whole file with:

```js
import { useEffect, useState } from 'react'
import { getServerContract, FAIL_CLOSED } from '../../lib/serverContract.js'

/**
 * The client-side capability gate. The split rule applies to clients: a self-host
 * capability is invisible until the manifest says it exists, and every failure path
 * resolves to FAIL_CLOSED — never a throw, never a false positive.
 *
 * TWO DIFFERENT `resolved` FLAGS, and conflating them is a bug:
 *   resolved (returned here) — the promise SETTLED. Safe to act on: a gated surface
 *                              can now be redirected away from without flicker.
 *   contract.resolved        — we hold a TRUSTWORTHY manifest. False on FAIL_CLOSED,
 *                              i.e. nothing cached and the fetch failed.
 * A settled-but-untrustworthy contract is a real state (server unreachable) and the
 * UI must fail closed rather than guess.
 */
export default function useServerContract() {
  const [contract, setContract] = useState(FAIL_CLOSED)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let alive = true
    getServerContract().then(c => {
      // The popup closes mid-fetch constantly; setting state on an unmounted tree
      // warns in dev and can resurrect a surface the user already left.
      if (!alive) return
      setContract(c)
      setResolved(true)
    })
    return () => { alive = false }
  }, [])

  return { contract, resolved }
}
```

**3b.** `src/popup/components/AppShell.jsx` — replace the `TABS` constant (lines 3-9) with:

```jsx
const BASE_TABS = [
  { id: 'save', label: 'Save', icon: '🔖' },
  { id: 'note', label: 'Note', icon: '📝' },
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'kb', label: 'KB', icon: '🧠' },
]

/**
 * The tab list as a function of what the instance can actually serve.
 *
 * The vault is an APPLIANCE capability: it needs the Obsidian bridge/plugin running
 * on the owner's own hardware, which a multi-tenant instance can never reach. This
 * was a hardcoded constant, so the tab rendered on cloud where every vault call must
 * fail — while the dashboard hid it correctly (glassy-dash src/components/Sidebar.jsx:136).
 * Exported so the surface-gate guard can assert on it without rendering.
 *
 * Defaults to hidden: a caller that forgets the prop fails closed.
 */
export function tabsFor({ vaultAvailable = false } = {}) {
  const tabs = [...BASE_TABS]
  // Index 3 preserves the order users know: save, note, search, vault, kb.
  if (vaultAvailable) tabs.splice(3, 0, { id: 'vault', label: 'Vault', icon: '📁' })
  return tabs
}
```

Then in the component signature add the prop, and build the list inside:

```jsx
export default function AppShell({ activeView, onNavigate, user, showSettings, onToggleSettings,
  unreadNotifications = 0, onOpenNotifications, vaultAvailable = false, children }) {
  const TABS = tabsFor({ vaultAvailable })
  // Layout concern, not availability: 'vault' stays listed so the tab bar renders
  // correctly for the one frame between a redirect and its effect committing.
  const isContentView = ['save', 'note', 'search', 'vault', 'kb'].includes(activeView)
```

**3c.** `src/popup/Popup.jsx` — swap the hook, gate the vault, redirect a gated view:

Replace the import (line 6) and the hook call (line 37-38):

```jsx
import useServerContract from './hooks/useServerContract.js'
```

```jsx
  // The client-side capability gate + the awareness-lane badge (self-host only: the
  // poller never fetches while the manifest says unavailable).
  const { contract, resolved: contractSettled } = useServerContract()
  const isAuthed = !['loading', 'login'].includes(view)

  // The same conjunction the dashboard uses: the instance must support the vault AND
  // the user must have turned it on. Gating on either alone is the defect class the
  // capability-split guard exists to prevent.
  const vaultAvailable = contract.vault.available && !!user?.obsidian_enabled

  const { unreadCount } = useNotifications({
    available: !!(isAuthed && contract.notifications.available),
  })

  // resolveInitialView() can land on 'vault' from a #vault hash or a session hint set
  // before the manifest arrived. Without this the popup renders a vault view with no
  // tab to leave it by. Wait for BOTH the contract and the user before deciding, or a
  // slow manifest redirects an appliance user away from a vault they do have.
  useEffect(() => {
    if (view !== 'vault') return
    if (!contractSettled || !user) return
    if (!vaultAvailable) navigate('save')
  }, [view, contractSettled, user, vaultAvailable, navigate])
```

Add `useEffect` to the React import on line 1, and pass the prop to `AppShell`:

```jsx
      unreadNotifications={unreadCount}
      onOpenNotifications={handleOpenNotifications}
      vaultAvailable={vaultAvailable}
```

**3d.** `src/lib/auth.js` — invalidate on server-URL change. At the end of `setBaseUrl()`, after the `chrome.storage.local.set`:

```js
  // The contract cache carries the baseUrl inside its entry, so a stale manifest
  // cannot be READ after a switch — but drop it anyway so storage does not keep the
  // previous instance's capabilities around. Dynamic import because serverContract.js
  // imports getBaseUrl from THIS module; a static import here would be circular.
  const { invalidateServerContract } = await import('./serverContract.js')
  await invalidateServerContract()
```


- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/useServerContract.test.js src/popup/components/__tests__/AppShell.test.jsx`
Expected: PASS.

Run: `cd /home/pozi/glassy-companion && npx vitest run`
Expected: **still RED** in `McpConnectionSection.test.js` (it imports `interpretStatus`, which Task 7 deletes). Confirm the failures are only that file — any other failure is a real regression from 3a–3d, fix it before continuing.

- [ ] **Step 5: Commit**

```bash
cd /home/pozi/glassy-companion
git add src/popup/hooks/useServerContract.js src/popup/hooks/useCapabilities.js \
        src/popup/Popup.jsx src/popup/components/AppShell.jsx src/lib/auth.js \
        src/lib/__tests__/useServerContract.test.js src/popup/components/__tests__/AppShell.test.jsx
git commit -m "feat(surface): gate the Vault tab on the contract, not a hardcoded tab list

AppShell's TABS was a module constant, so the Vault tab rendered on cloud where the
instance can never reach an Obsidian bridge - while the dashboard hid it correctly on
the same rule (Sidebar.jsx:136). tabsFor() is exported so the surface-gate guard can
assert on it without rendering.

The gate is a conjunction: instance capability AND the per-user column, matching the
dashboard exactly. Gating on either alone is the defect class the capability-split
guard exists to prevent.

Popup also redirects away from a #vault deep link once the contract settles, waiting
for BOTH contract and user so a slow manifest cannot bounce an appliance user away
from a vault they do have."
```

---


### Task 7: MCP section — delete the probe, gate on the contract

**Files:**
- Modify: `src/popup/views/McpConnectionSection.jsx` — delete lines 17-37 (`interpretStatus`) and 45-68 (`mcpEnabled` state + probe effect); rewrite the gate, the named-key copy and `configSnippet`
- Delete: `src/popup/views/__tests__/McpConnectionSection.test.js`

**Interfaces:**
- Consumes: `useServerContract()` (Task 6) → `contract.mcp.available`, `contract.agentIdentity`.
- Produces: nothing new. This task **removes** the exported `interpretStatus`.

- [ ] **Step 1: Delete the test that certified a contract no server has ever emitted**

Run: `cd /home/pozi/glassy-companion && git rm src/popup/views/__tests__/McpConnectionSection.test.js`

Every case in it mocks `{ mounted: true, toolCount: 40 }` as the `/mcp/status` body. No glassy-dash commit has ever returned that (`git log -S'mounted' -- server/mcp/index.js` is empty). Deleting it is the point, not a loss of coverage: the predicate it was reaching for now lives in `serverContract.js`, tested against **live-captured** fixtures in `serverContract.test.js`.

- [ ] **Step 2: Delete `interpretStatus` and the probe**

In `McpConnectionSection.jsx`:

- Delete the `interpretStatus` doc comment and function (lines 17-37).
- Delete the `mcpEnabled` state (line 45) and the whole `useEffect` that fetched `/mcp/status` (lines 55-68).
- Replace the `useCapabilities` import and call (lines 15, 51-52) with:

```jsx
import useServerContract from '../hooks/useServerContract.js'
```

```jsx
  // MCP availability comes from the capability manifest, which the server computes
  // from the mount state it actually ACHIEVED (#125) — not from probing /mcp/status,
  // whose 200-vs-503-vs-SPA-HTML ambiguity is what interpretStatus was invented to
  // guess at. `mounted === true`, so an older manifest with no such key fails closed.
  const { contract } = useServerContract()
  const mcpAvailable = contract.mcp.available
  const namedKeysMode = !!(mcpAvailable && contract.agentIdentity?.mode === 'named-keys')
```

- [ ] **Step 3: Replace every `mcpEnabled` branch**

The tri-state (`null` = checking) existed only because the probe was separate and async. The contract resolves through the same hook the rest of the popup uses, so:

- Delete the `mcpEnabled === false && !result` block (lines ~235-245) — the one telling users to set `ENABLE_MCP_SERVER=true` / `ENABLE_MCP_BRIDGE=true`. Wrong on cloud (not their env var), and about to become wrong on self-host too. It is now unreachable: Task 8 gates the whole section.
- Delete the `mcpEnabled === null && !result` "Checking server MCP status…" block (lines ~247-251).
- Change the fetch-button condition from `mcpEnabled !== false && !result` to `!result`.

- [ ] **Step 4: Verify no probe references survive**

Run: `cd /home/pozi/glassy-companion && grep -rn 'interpretStatus\|mcpEnabled\|/mcp/status' src/ || echo 'clean: no probe references remain'`
Expected: `clean: no probe references remain`


- [ ] **Step 5: Fix the named-key wiring and reframe the copy**

The snippet was built only from `result.mcpToken`, so minting a named key and then copying the config still yielded the anonymous key. Replace the `configSnippet` definition (lines ~93-101):

```jsx
  // Prefer a just-minted NAMED key so "copy config" gives the user the identity they
  // asked for. Before this the snippet was built only from result.mcpToken, so the
  // named-key flow was a dead end: mint a key, copy the config, get the anonymous one.
  const effectiveToken = namedKey?.key || result?.mcpToken
  const configSnippet = result
    ? JSON.stringify({
        mcpServers: {
          glassy: {
            url: result.mcpUrl,
            headers: { Authorization: `Bearer ${effectiveToken}` },
          },
        },
      }, null, 2)
    : ''
```

Replace the named-key section's description (lines ~186-192):

```jsx
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            This appliance supports <strong>named agent keys</strong>. Mint one for an
            external MCP client (Claude Desktop, Cursor, Windsurf) so that client is
            identified by name in your activity feed instead of sharing one anonymous
            key. Saves made <em>from this extension</em> are always attributed to you —
            it acts as you, not as an agent.
          </div>
```

Replace the post-mint note (lines ~211-215):

```jsx
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
            Shown once, never stored by the extension. Paste it into your MCP client —
            the config snippet below already uses it.
          </div>
```

The claim being removed — "everything it saves is attributed to it; authorship, memory and the activity feed will all know it was the browser extension" — was never true. `glassy-dash/server/routes/extensionRoutes.js` records `actor: { kind: 'human' }` at six sites (337, 416, 482, 574, 805), and that is *correct*: a human clicking Save in their browser is the human.

- [ ] **Step 6: Run the full suite and commit**

Run: `cd /home/pozi/glassy-companion && npx vitest run`
Expected: PASS — the whole suite green for the first time since Task 4.

```bash
cd /home/pozi/glassy-companion
git add -A src/popup/views/McpConnectionSection.jsx src/popup/views/__tests__/McpConnectionSection.test.js
git commit -m "fix(mcp)!: gate on the manifest's mounted claim, delete the /mcp/status probe

interpretStatus() required a mounted field from /mcp/status. That endpoint has never
emitted it in any glassy-dash commit - the field lives in /api/capabilities (added by
74004c4a / #125). Verified against live servers: the function returned false on an
appliance serving 40 tools, so MCP settings were dead everywhere and worst on the
self-host box they exist for.

The predicate was right; the source was wrong. It now reads capabilities.mcp.mounted
through the shared contract, and the probe, its tri-state, its unbounded fetch and the
env-var advice are all deleted. The test that certified the bug is deleted with it -
its fixture was invented, and the replacement is a live capture.

Also fixes the named-key dead end (configSnippet ignored namedKey.key) and stops
claiming extension saves are attributed to an agent."
```

---


### Task 8: Gate the Settings sections; share the liveness fetch

**Files:**
- Modify: `src/popup/views/SettingsView.jsx:6-7,166,170`
- Create: `src/lib/obsidianStatus.js`
- Modify: `src/popup/components/RelatedInVaultPanel.jsx:24`, `src/popup/components/TagEditor.jsx:22`, `src/popup/views/QuickNoteView.jsx:36`, `src/popup/views/VaultBrowserView.jsx:45`
- Test: create `src/lib/__tests__/obsidianStatus.test.js`

**Interfaces:**
- Consumes: `useServerContract()` (Task 6); `getObsidianStatus()` from `api.js` (unchanged).
- Produces: `getSharedObsidianStatus({ forceRefresh }?): Promise<object|null>`, `invalidateObsidianStatus(): Promise<void>`.

**Why this is a separate module and not part of the contract:** bridge connectivity is *liveness* — it changes while the popup is open and is per-user, not per-instance. Folding it into the capability contract would recreate exactly the conflation this refactor removes. It gets the same caching treatment because four components each fetch it independently today.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/obsidianStatus.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({ getObsidianStatus: vi.fn() }))

let getSharedObsidianStatus, invalidateObsidianStatus, getObsidianStatus

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks()
  ;({ getObsidianStatus } = await import('../api.js'))
  ;({ getSharedObsidianStatus, invalidateObsidianStatus } = await import('../obsidianStatus.js'))
})

describe('getSharedObsidianStatus — one liveness fetch, four consumers', () => {
  it('fetches once for concurrent callers', async () => {
    // RelatedInVaultPanel, TagEditor, QuickNoteView and VaultBrowserView each called
    // getObsidianStatus() on mount: one popup open meant four round trips.
    getObsidianStatus.mockResolvedValue({ connected: true, authenticated: true, status: 'ok' })
    const [a, b, c, d] = await Promise.all([
      getSharedObsidianStatus(), getSharedObsidianStatus(),
      getSharedObsidianStatus(), getSharedObsidianStatus(),
    ])
    expect(getObsidianStatus).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b); expect(c).toEqual(d)
  })

  it('serves from cache inside the TTL, refetches after it', async () => {
    getObsidianStatus.mockResolvedValue({ connected: true })
    await getSharedObsidianStatus()
    await getSharedObsidianStatus()
    expect(getObsidianStatus).toHaveBeenCalledTimes(1)
    vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 16_000)
    await getSharedObsidianStatus()
    expect(getObsidianStatus).toHaveBeenCalledTimes(2)
  })

  it('forceRefresh bypasses the cache — what "Test Connection" needs', async () => {
    getObsidianStatus.mockResolvedValue({ connected: true })
    await getSharedObsidianStatus()
    await getSharedObsidianStatus({ forceRefresh: true })
    expect(getObsidianStatus).toHaveBeenCalledTimes(2)
  })

  it('invalidateObsidianStatus forces the next call to refetch', async () => {
    getObsidianStatus.mockResolvedValue({ connected: true })
    await getSharedObsidianStatus()
    await invalidateObsidianStatus()
    await getSharedObsidianStatus()
    expect(getObsidianStatus).toHaveBeenCalledTimes(2)
  })

  it('resolves null on failure and does NOT poison the cache with the failure', async () => {
    // A bridge that blipped once must not pin four components to a cached error.
    getObsidianStatus.mockRejectedValue(new Error('bridge down'))
    expect(await getSharedObsidianStatus()).toBeNull()
    getObsidianStatus.mockResolvedValue({ connected: true })
    expect(await getSharedObsidianStatus()).toEqual({ connected: true })
  })
})
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/obsidianStatus.test.js`
Expected: FAIL — cannot resolve `../obsidianStatus.js`.


- [ ] **Step 3: Implement `src/lib/obsidianStatus.js`**

```js
/**
 * obsidianStatus — shared LIVENESS for the Obsidian bridge.
 *
 * Not part of the server contract, and deliberately so. The contract answers "does
 * this instance support the vault at all" (static, per-instance, gates VISIBILITY).
 * This answers "is the bridge connected right now" (dynamic, per-user, gates STATE).
 * Conflating the two is what left the Vault tab rendering on cloud while the
 * dashboard hid it.
 *
 * It exists because four components each fetched this independently on mount:
 * RelatedInVaultPanel, TagEditor, QuickNoteView, VaultBrowserView.
 */
import { getObsidianStatus } from './api.js'

// Short, because liveness genuinely changes while the popup is open; long enough to
// collapse the four simultaneous mounts into one request.
const TTL_MS = 15_000

let cached = null        // { data, fetchedAt }
let inflight = null

/**
 * @param {{forceRefresh?: boolean}} [opts] — pass forceRefresh after a user action
 *   that should change the answer (Test Connection, enabling the bridge).
 * @returns {Promise<object|null>} the status body, or null if unreachable
 */
export async function getSharedObsidianStatus({ forceRefresh = false } = {}) {
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.data
  if (inflight && !forceRefresh) return inflight

  inflight = (async () => {
    try {
      const data = await getObsidianStatus()
      // A failure is deliberately NOT cached: four components would otherwise stay
      // pinned to a stale error for the whole TTL after a bridge that blipped once.
      cached = { data, fetchedAt: Date.now() }
      return data
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** Drop cached liveness. Call after toggling the bridge or testing a connection. */
export async function invalidateObsidianStatus() {
  cached = null
  inflight = null
}
```

- [ ] **Step 4: Run it, verify PASS**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/obsidianStatus.test.js`
Expected: PASS.

- [ ] **Step 5: Point the four consumers at the shared accessor**

In `RelatedInVaultPanel.jsx:24`, `TagEditor.jsx:22`, `QuickNoteView.jsx:36`, `VaultBrowserView.jsx:45`: import `getSharedObsidianStatus` from `../../lib/obsidianStatus.js` (or `../lib/…` — match each file's existing depth) and change the call from `getObsidianStatus()` to `getSharedObsidianStatus()`. Remove `getObsidianStatus` from those files' `api.js` imports if nothing else in the file uses it.

Before assuming there are no force-refresh sites, check `ObsidianBridgeSection.jsx` for a "Test Connection" / reconnect button. Any call that follows a user action which should change the answer must pass `{ forceRefresh: true }`, and must `await invalidateObsidianStatus()` after an action that changes bridge state.

- [ ] **Step 6: Gate the Settings sections**

In `src/popup/views/SettingsView.jsx` add:

```jsx
import useServerContract from '../hooks/useServerContract.js'
```

Inside the component, before the return:

```jsx
  // Instance capability decides whether these sections EXIST. Bridge liveness — is the
  // plugin connected right now — is ObsidianBridgeSection's own business and must not
  // be confused with this.
  const { contract } = useServerContract()
```

Replace lines 166 and 170:

```jsx
      {/* MCP Connection — only on an instance whose MCP server actually mounted */}
      {contract.mcp.available && <McpConnectionSection />}

      {/* Obsidian Bridge — an appliance capability: it proxies to a plugin on the
          owner's own hardware, which a multi-tenant instance can never reach */}
      {contract.vault.available && <ObsidianBridgeSection />}
```

- [ ] **Step 7: Run the full suite and commit**

Run: `cd /home/pozi/glassy-companion && npx vitest run`
Expected: PASS.

```bash
cd /home/pozi/glassy-companion
git add src/lib/obsidianStatus.js src/lib/__tests__/obsidianStatus.test.js \
        src/popup/views/SettingsView.jsx src/popup/views/QuickNoteView.jsx \
        src/popup/views/VaultBrowserView.jsx src/popup/components/RelatedInVaultPanel.jsx \
        src/popup/components/TagEditor.jsx
git commit -m "feat(surface): gate the MCP and Bridge settings sections on the contract

Both rendered unconditionally, so a cloud user was offered an Obsidian bridge that can
never reach a plugin and an MCP section whose key exchange the server refuses.
Capability (does this instance support it) now decides existence; liveness (is the
bridge connected) stays inside the section.

Also collapses four independent getObsidianStatus() calls per popup open into one
shared cached accessor - failures deliberately NOT cached, so a bridge that blipped
once cannot pin four components to a stale error for the whole TTL."
```

---


### Task 9: The surface-gate guard — close the hole that let this ship

**Files:**
- Create: `src/lib/__tests__/surfaceGateGuard.test.js`

**Why:** the ungated Vault tab survived because `glassy-dash`'s `capabilitySplitGuard.test.js` scans `glassy-dash/src/` — its blast radius stops at the repo boundary. Cross-repo scanning from dash CI is awkward, so the guard belongs where the surface lives. This mirrors that guard's approach, including its comment-stripping, because a source-scan that matches prose gives a false red the moment someone documents the bug it prevents.

- [ ] **Step 1: Write the guard**

Create `src/lib/__tests__/surfaceGateGuard.test.js`:

```js
/**
 * Surface-gate guard — an instance-only surface in THIS repo must declare its gate.
 *
 * glassy-dash pins the same rule for its own frontend (capabilitySplitGuard.test.js,
 * Task 0.4), but that scanner walks glassy-dash/src/ only. Its blast radius stops at
 * the repo boundary, which is exactly how the companion's Vault tab shipped ungated
 * while the dashboard hid it correctly. The guard lives where the surface lives.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tabsFor } from '../../popup/components/AppShell.jsx'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Comments removed, so the guard asserts on CODE and not on prose that quotes it. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/gm, '$1')
}

describe('instance-only surfaces declare their gate', () => {
  it('the vault is NOT a constant tab — it is produced by the gate', () => {
    // The defect: TABS was a module-level array containing 'vault' unconditionally.
    expect(tabsFor({ vaultAvailable: false }).map(t => t.id)).not.toContain('vault')
    expect(tabsFor({ vaultAvailable: true }).map(t => t.id)).toContain('vault')
  })

  it('AppShell takes vaultAvailable and defaults it to hidden', () => {
    const src = codeOnly(read('src/popup/components/AppShell.jsx'))
    expect(src).toMatch(/vaultAvailable\s*=\s*false/)
    expect(src).toMatch(/tabsFor\(\{\s*vaultAvailable\s*\}\)/)
  })

  it('Popup gates the vault on BOTH the instance capability and the user column', () => {
    // Either alone is the defect class: capability-only shows the vault to a self-host
    // user who never enabled it; column-only shows it on cloud, where the column can
    // survive as 1 on an instance that can never serve the feature.
    const src = codeOnly(read('src/popup/Popup.jsx'))
    const decl = src.match(/const vaultAvailable\s*=\s*[^\n]*/)
    expect(decl, 'vaultAvailable declaration not found in Popup.jsx').toBeTruthy()
    expect(decl[0]).toMatch(/contract\.vault\.available/)
    expect(decl[0]).toMatch(/obsidian_enabled/)
  })

  it('every instance-only Settings section is behind a contract check', () => {
    const src = codeOnly(read('src/popup/views/SettingsView.jsx'))
    expect(src).toMatch(/contract\.mcp\.available\s*&&\s*<McpConnectionSection/)
    expect(src).toMatch(/contract\.vault\.available\s*&&\s*<ObsidianBridgeSection/)
    // Bare, ungated renders must not come back.
    expect(src).not.toMatch(/^\s*<McpConnectionSection\s*\/>/m)
    expect(src).not.toMatch(/^\s*<ObsidianBridgeSection\s*\/>/m)
  })

  it('nothing probes /mcp/status again — the manifest is the only source', () => {
    // A positive control on the rule this whole refactor exists to enforce. If someone
    // reintroduces a per-feature availability probe, this fails and names the reason.
    const offenders = []
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(rel); continue }
        if (!/\.jsx?$/.test(e.name)) continue
        if (/\/mcp\/status|interpretStatus/.test(codeOnly(read(rel)))) offenders.push(rel)
      }
    }
    walk('src')
    expect(offenders, `availability probe reintroduced in: ${offenders.join(', ')}`).toEqual([])
  })
})
```

- [ ] **Step 2: Prove the guard is not vacuous**

A guard that cannot fail is worse than no guard — `glassy-dash`'s equivalent was vacuous once already (commit `487cb77e`). Verify each arm can go red:

Run: `cd /home/pozi/glassy-companion && sed -i 's/contract.mcp.available && <McpConnectionSection/<McpConnectionSection/' src/popup/views/SettingsView.jsx && npx vitest run src/lib/__tests__/surfaceGateGuard.test.js; git checkout src/popup/views/SettingsView.jsx`
Expected: FAIL on the Settings-section arm, then the file is restored. Repeat the pattern for the `vaultAvailable` arm if any assertion looks suspiciously permanent.

- [ ] **Step 3: Run it green, then commit**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/surfaceGateGuard.test.js`
Expected: PASS.

```bash
cd /home/pozi/glassy-companion
git add src/lib/__tests__/surfaceGateGuard.test.js
git commit -m "test(guard): instance-only surfaces in THIS repo must declare their gate

glassy-dash pins this rule for its own frontend, but that scanner walks
glassy-dash/src/ only - its blast radius stops at the repo boundary, which is how the
companion's Vault tab shipped ungated while the dashboard hid it correctly.

Includes a positive control that fails if anyone reintroduces a per-feature
availability probe, and each arm was verified red before being trusted: a guard that
cannot fail is worse than no guard."
```

---


### Task 10: Auth destruction becomes a decision, not a transport side effect

**Separate commit from the contract refactor** — it touches the transport and session routing, not capability discovery. Keeping them apart means a regression in either can be reverted without undoing the other.

**Files:**
- Modify: `src/lib/api.js:16-42,65-68` (`apiFetch`) and `fetchUnreadNotifications`
- Create: `src/lib/sessionWatch.js`
- Modify: `src/popup/hooks/useAppState.js`
- Test: create `src/lib/__tests__/sessionWatch.test.js`; extend `src/lib/__tests__/api.test.js`

**Interfaces:**
- Produces: `apiFetch(path, options)` where `options.authPolicy` is `'interactive'` (default) or `'background'`; `watchSessionEnd(onEnd): () => void`.

- [ ] **Step 1a: Write the failing transport test**

Append to `src/lib/__tests__/api.test.js`, matching that file's existing mock setup and imports:

```js
describe('apiFetch authPolicy — who is allowed to end a session', () => {
  it('interactive (default) still clears auth on 401', async () => {
    const { clearAuth } = await import('../auth.js')
    vi.clearAllMocks()
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    await expect(fetchMe()).rejects.toMatchObject({ status: 401 })
    expect(clearAuth).toHaveBeenCalledTimes(1)
  })

  it('background does NOT clear auth on 401 — an advisory poll must not end a session', async () => {
    // THE DEFECT. The unread-notifications badge is documented as "advisory, never
    // load-bearing", yet it went through apiFetch, whose 401 handler called clearAuth()
    // before throwing; the poller then swallowed the throw and reported zero. A
    // background tick could silently log the user out and leave the popup rendering a
    // logged-in shell whose every action fails.
    const { clearAuth } = await import('../auth.js')
    vi.clearAllMocks()
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const res = await fetchUnreadNotifications()
    expect(clearAuth).not.toHaveBeenCalled()
    expect(res).toEqual({ notifications: [], unreadCount: 0 })
  })

  it('authPolicy is stripped before it reaches fetch()', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 204 })
    await fetchUnreadNotifications()
    const [, opts] = globalThis.fetch.mock.calls[0]
    expect(opts.authPolicy).toBeUndefined()
  })
})
```

`fetchUnreadNotifications` must be added to that file's `await import('../api.js')` destructure if it is not already there.

- [ ] **Step 1b: Write the failing session-watch test**

Create `src/lib/__tests__/sessionWatch.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'

let listeners = []
beforeEach(() => {
  listeners = []
  vi.resetModules()
  vi.stubGlobal('chrome', {
    storage: {
      onChanged: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => { listeners = listeners.filter(f => f !== fn) },
      },
    },
  })
})

const { watchSessionEnd } = await import('../sessionWatch.js')
const fire = (changes, area = 'local') => listeners.forEach(fn => fn(changes, area))

describe('watchSessionEnd — the UI must never disagree with storage', () => {
  it('fires when the stored token is removed', () => {
    const onEnd = vi.fn()
    watchSessionEnd(onEnd)
    fire({ glassy_token: { oldValue: 'jwt', newValue: undefined } })
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire when a token is written or replaced — only on removal', () => {
    const onEnd = vi.fn()
    watchSessionEnd(onEnd)
    fire({ glassy_token: { newValue: 'jwt' } })
    fire({ glassy_token: { oldValue: 'a', newValue: 'b' } })
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('ignores other storage keys and other areas', () => {
    const onEnd = vi.fn()
    watchSessionEnd(onEnd)
    fire({ glassy_settings: { newValue: undefined } })
    fire({ glassy_token: { newValue: undefined } }, 'session')
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('unsubscribes, so a closed popup leaves no listener behind', () => {
    const onEnd = vi.fn()
    const stop = watchSessionEnd(onEnd)
    expect(listeners).toHaveLength(1)
    stop()
    expect(listeners).toHaveLength(0)
  })

  it('never throws into the caller if chrome.storage is unavailable', () => {
    vi.stubGlobal('chrome', {})
    expect(() => watchSessionEnd(vi.fn())).not.toThrow()
  })
})
```

- [ ] **Step 2: Run them, verify FAIL**

Run: `cd /home/pozi/glassy-companion && npx vitest run src/lib/__tests__/sessionWatch.test.js src/lib/__tests__/api.test.js`
Expected: FAIL — `sessionWatch.js` unresolved; the `background` case still calls `clearAuth`.


- [ ] **Step 3: Implement**

In `src/lib/api.js`, change the top of `apiFetch` (line 16) so the policy never reaches `fetch()`:

```js
async function apiFetch(path, options = {}, _retryCount = 0) {
  // authPolicy is OUR option, not a fetch option — destructured out so it never lands
  // in the request. 'interactive' (default) may end the session; 'background' may not.
  const { authPolicy = 'interactive', ...fetchOptions } = options
```

and use `fetchOptions` in the request (lines 46-51):

```js
    res = await fetch(url, {
      ...fetchOptions,
      headers,
      body: fetchOptions.body ? JSON.stringify(fetchOptions.body) : undefined,
      signal: controller.signal,
    })
```

Replace the 401 handler (lines 65-68):

```js
  if (res.status === 401) {
    // Auth destruction is a DECISION, not a transport side effect. A headless lane
    // (the notification badge, the offscreen bridge) has no UI to re-authenticate
    // from, so it reports the expiry and leaves the session alone; an interactive
    // caller clears it and the popup routes to login via watchSessionEnd.
    //
    // This is the hazard peekToken() was added for in auth.js — previously patched for
    // one caller by introducing a second token reader. Fixing it at the transport
    // removes the reason for that pattern to keep spreading.
    if (authPolicy === 'interactive') await clearAuth()
    throw new ApiError(401, authPolicy === 'interactive'
      ? 'Session expired. Please log in again.'
      : 'SESSION_EXPIRED')
  }
```

The recursive retry calls already forward `options` unchanged, so `authPolicy` survives retries.

Change `fetchUnreadNotifications` to declare itself background:

```js
export async function fetchUnreadNotifications() {
  try {
    // Background lane: the badge is advisory and must never end a session. Before this
    // a 401 here called clearAuth() and the catch below hid it — a silent logout caused
    // by a feature documented as "never load-bearing".
    const res = await apiFetch(`${API_PATHS.notifications}?unread=1`, { authPolicy: 'background' })
    return {
      notifications: Array.isArray(res?.notifications) ? res.notifications : [],
      unreadCount: Number(res?.unreadCount) || 0,
    }
  } catch {
    return { notifications: [], unreadCount: 0 }
  }
}
```

Create `src/lib/sessionWatch.js`:

```js
/**
 * sessionWatch — keep the UI honest about the session.
 *
 * apiFetch clears the stored token on an interactive 401. Nothing used to tell the
 * popup, so it kept rendering a logged-in shell whose every action then failed — a UI
 * actively disagreeing with storage. This is the half that fixes the stranded state,
 * and it covers EVERY interactive 401 rather than one caller.
 */
import { STORAGE_KEYS } from './constants.js'

/**
 * @param {() => void} onEnd — called when the stored token disappears
 * @returns {() => void} unsubscribe
 */
export function watchSessionEnd(onEnd) {
  const onChanged = (changes, area) => {
    if (area !== 'local') return
    const change = changes?.[STORAGE_KEYS.token]
    if (!change) return
    // Only removal ends a session. A login or a refresh writes a newValue and must not
    // bounce the user to the login screen.
    if (change.newValue) return
    try { onEnd() } catch { /* a throwing listener must not break the storage event */ }
  }
  try {
    chrome.storage.onChanged.addListener(onChanged)
  } catch {
    return () => {}          // storage unavailable (tests, early boot)
  }
  return () => {
    try { chrome.storage.onChanged.removeListener(onChanged) } catch { /* already gone */ }
  }
}
```

In `src/popup/hooks/useAppState.js` add the import and a subscription effect alongside the existing init effect:

```js
import { watchSessionEnd } from '../../lib/sessionWatch.js'
```

```js
  // The UI must never disagree with storage. An interactive 401 clears the token in
  // apiFetch; without this the popup keeps showing a logged-in shell that cannot do
  // anything. Covers every interactive 401, not just the notification poller.
  useEffect(() => watchSessionEnd(() => {
    setUser(null)
    setPageMeta(null)
    setView('login')
  }), [setUser, setPageMeta])
```

- [ ] **Step 4: Run the full suite and commit**

Run: `cd /home/pozi/glassy-companion && npx vitest run`
Expected: PASS, all files.

```bash
cd /home/pozi/glassy-companion
git add src/lib/api.js src/lib/sessionWatch.js src/lib/__tests__/sessionWatch.test.js \
        src/lib/__tests__/api.test.js src/popup/hooks/useAppState.js
git commit -m "fix(auth): ending a session is a decision, not a transport side effect

apiFetch called clearAuth() on ANY 401. The unread-notifications badge - documented as
advisory, never load-bearing - went through it and swallowed the throw, so a background
poll could silently log the user out while the popup kept rendering a logged-in shell
whose every action then failed.

apiFetch now takes an authPolicy; background lanes report SESSION_EXPIRED and leave the
session alone. And the popup subscribes to token removal, so an interactive 401 routes
to login instead of stranding the UI - covering every interactive 401, not just this one.

This is the hazard peekToken() was added for in the offscreen bridge; fixing it at the
transport removes the reason for that pattern to keep spreading."
```

---


### Task 11: Release v2.20.0 — a new version, never a re-tag of 2.19.0

**Prerequisite:** Task 3 deployed. Do not release before the `vault` manifest key is live, or the Vault tab fails closed and disappears for self-host users who have a working vault.

**Why not 2.19.0:** the published `glassy-companion-v2.19.0.zip` / `.xpi` and both `dist/` trees are dated Sep 23 and contain zero occurrences of `mounted`; the Sep 26 commit `074bddb` never reached an artifact. `pre-flight-release.js` compares version *strings* and the manifest inside the zip, and `verify-companion-version-sync.js` compares `2.19.0 == 2.19.0` — both pass while shipped code and source disagree. Shipping these changes under 2.19.0 would make that worse, not better.

- [ ] **Step 1: Re-capture the fixtures against the DEPLOYED server**

Task 4's fixtures predate the server change and have `vault: ABSENT`. Now that Task 3 is live, re-capture and prove the positive arm:

```bash
cd /home/pozi/glassy-companion
curl -s https://glassy.fyi/api/capabilities -o src/lib/__tests__/fixtures/manifest-cloud.json
curl -s http://localhost:3010/api/capabilities -o src/lib/__tests__/fixtures/manifest-selfhost.json
node -e "for (const f of ['manifest-cloud','manifest-selfhost']) { const j=require('./src/lib/__tests__/fixtures/'+f+'.json'); console.log(f,'version',j.version,'vault',JSON.stringify(j.capabilities.vault ?? 'ABSENT')) }"
```
Expected: `manifest-cloud … vault {"available":false}` and `manifest-selfhost … vault {"available":true}`.

If the rig still reports `ABSENT` it is serving the old published image — re-pull it or capture from an appliance running the new build. **Do not proceed with `vault: ABSENT` in the self-host fixture**; the gate's positive arm would be untested.

Update the provenance table in `src/lib/__tests__/fixtures/README.md` with the new capture date and versions.

- [ ] **Step 2: Add the positive vault arm to the contract test**

In `src/lib/__tests__/serverContract.test.js`, replace the Task 5 placeholder assertion:

```js
  it('vault follows the manifest — available on the appliance, absent on cloud', () => {
    // Proven against BOTH live captures, not an invented body. This is the assertion
    // that was impossible before the server published the key.
    expect(projectContract(selfHost).vault.available).toBe(true)
    expect(projectContract(cloud).vault.available).toBe(false)
  })
```

Run: `cd /home/pozi/glassy-companion && npx vitest run`
Expected: PASS, full suite.

- [ ] **Step 3: Bump the version in all three places**

```bash
cd /home/pozi/glassy-companion
npm version 2.20.0 --no-git-tag-version
node -e "for (const f of ['manifest.json','manifest.firefox.json']) { const fs=require('fs'); const m=JSON.parse(fs.readFileSync(f,'utf8')); m.version='2.20.0'; fs.writeFileSync(f, JSON.stringify(m,null,2)+'\n') }"
node -e "console.log(require('./package.json').version, require('./manifest.json').version, require('./manifest.firefox.json').version)"
```
Expected: `2.20.0 2.20.0 2.20.0`

- [ ] **Step 4: Build both targets**

```bash
cd /home/pozi/glassy-companion && npm run build && npm run build:firefox
grep -o '\"version\": \"[^\"]*\"' dist/manifest.json dist-firefox/manifest.json
```
Expected: both report `2.20.0`. If the runner kills the build at 30s, detach it — `setsid bash -c 'npm run build > /tmp/cx-build.log 2>&1' < /dev/null &` — and poll the log.

- [ ] **Step 5: Verify the built artifact actually contains the new code**

This is the check that was missing when 2.19.0 shipped stale:

```bash
cd /home/pozi/glassy-companion
echo "interpretStatus (must be GONE):"; grep -rl 'interpretStatus' dist/ dist-firefox/ || echo '  absent OK'
echo "contract marker (must be PRESENT):"; grep -rl 'glassy_server_contract' dist/ dist-firefox/ || echo '  MISSING'
echo "tabsFor (must be PRESENT):"; grep -rl 'tabsFor' dist/ || echo '  MISSING'
```
Expected: `interpretStatus` absent; both markers present. **If a marker is missing the build did not pick up the source — stop and investigate, do not zip.**

- [ ] **Step 6: Zip, then run the pre-flight gate**

```bash
cd /home/pozi/glassy-companion && npm run zip && npm run zip:firefox && node scripts/pre-flight-release.js 2.20.0
```
Expected: exit 0. It will fail on the README badge/filenames and the CHANGELOG entry until Step 7 is done — that is the gate working; complete Step 7 and re-run.


- [ ] **Step 7: Update the docs, including the drift this review found**

- `CHANGELOG.md` — add a `[2.20.0]` entry: the manifest becomes the single source of truth; `interpretStatus` and the `/mcp/status` probe deleted (with the reason — that endpoint has never emitted `mounted`); Vault tab and both Settings sections now gated; named-key snippet fixed and its overclaim corrected; background lanes can no longer end a session.
- `README.md` — version badge and both artifact filenames to `2.20.0`; refresh the "Current state" paragraph. **Also fix the stale appliance recommendation:** it currently names `ghcr.io/0reliance/glassy-dash:v2.36.0-beta.40`, which has no `/api/capabilities` at all, while the self-host compose file names `v2.40.4`. Point it at the current self-host pin.
- `STORE_LISTING.md:27` — claims "20 tools, 4 prompts, 7 resources" pinned to `v2.36.0-beta.13+`. Correct to the real counts (appliance 40; cloud 36 at HEAD) and the current server version.

Re-run: `cd /home/pozi/glassy-companion && node scripts/pre-flight-release.js 2.20.0`
Expected: exit 0.

- [ ] **Step 8: Commit and tag**

```bash
cd /home/pozi/glassy-companion
git add -A
git commit -m "release: v2.20.0 - the manifest is the single source of truth

Deletes the /mcp/status probe and interpretStatus(), which required a 'mounted' field
that endpoint has never emitted in any glassy-dash commit - so MCP settings were dead on
every server, worst on the appliance they exist for. Capability now comes from one
cached projection of /api/capabilities, and the Vault tab plus both Settings sections
gate on it.

Also: the named-key config snippet uses the minted key instead of the anonymous one;
the 'extension is a principal' claim is removed (extensionRoutes records actor:human at
six sites, correctly); background lanes can no longer end a session; four independent
bridge-status fetches collapse into one.

Fixtures are live captures with recorded provenance, never hand-written."
git tag v2.20.0
```

- [ ] **Step 9: Publish the GitHub release — OWNER ACTION**

Publishing needs credentials and is the owner's call. Prepare the artifacts and notes:

```bash
cd /home/pozi/glassy-companion
gh release create v2.20.0 glassy-companion-v2.20.0.zip glassy-companion-v2.20.0-firefox.xpi \
  --title "v2.20.0 - the manifest is the single source of truth" \
  --notes-file <(sed -n '/\[2.20.0\]/,/\[2.19.0\]/p' CHANGELOG.md)
```

- [ ] **Step 10: Bump the dash-side pin, then prove the gate passes**

```bash
cd /home/pozi/glassy-dash
sed -i "s/^const EXTENSION_VERSION = '2.19.0'/const EXTENSION_VERSION = '2.20.0'/" src/views/ExtensionView.jsx
grep -n "EXTENSION_VERSION = " src/views/ExtensionView.jsx
grep -n "Glassy Companion.*(v2\." src/data/helpContent.js
node scripts/verify-companion-version-sync.js
```
Expected: `EXTENSION_VERSION = '2.20.0'`; the sync script exits 0 against the release just published. If `helpContent.js` names a version, update it to `v2.20.0` too — the script fails on a mismatch between the two files.

Commit in `glassy-dash` **only after** the release exists; bumping the pin first would make the guard assert a version that does not exist.

- [ ] **Step 11: Store uploads — OWNER ACTION**

Chrome Web Store and AMO uploads need interactive browser auth and cannot be scripted here. Hand off both artifacts, noting that Step 5 proved `dist/` and `dist-firefox/` contain the new code.

---

## Self-review notes

Checks run against the spec while writing this plan:

- **Spec coverage.** Every spec section maps to a task: contract module → 5; deletions → 7; surface gating → 6 and 8; server dependency → 1–3; auth policy → 10; fixtures from live captures → 4 and 11.1; guard → 9; sequencing and release → 3 and 11; named-keys reframe → 7.5. Out-of-scope items are untouched by every task.
- **One correction made during planning, recorded so it is not re-litigated.** The spec assumed component tests could render freely. They cannot: `@testing-library/react` is **not installed**, and `SaveCard.test.jsx` says so in its own header. There is also no vitest config file, so the default environment is `node` and DOM tests need a `// @vitest-environment jsdom` pragma (see `extractor.test.js`). Task 6's tests were rewritten to use `react-dom/client` + `act` from React 19. Do not add a dependency to make a test prettier.
- **One design change made during planning.** The spec said the cache key would be "scoped to baseUrl". Implemented as a single key whose *entry* carries `baseUrl`, so a mismatch is a miss by construction — same guarantee, no key enumeration, and it works with the house storage mock, which does not implement `get(null)`.
- **Type consistency.** `fetchManifest`, `getServerContract`, `projectContract`, `invalidateServerContract`, `FAIL_CLOSED`, `useServerContract`, `tabsFor`, `getSharedObsidianStatus`, `invalidateObsidianStatus`, `watchSessionEnd`, `authPolicy` are each defined once and referenced by that exact name everywhere they appear.
- **Known mid-refactor red.** After Task 4, and again after Task 6, the full suite is intentionally RED because `McpConnectionSection.test.js` still imports a symbol Task 7 deletes. Both tasks say so explicitly. Do not "fix" it by reverting.


---

## Deferred to v2.20.1 (recorded so it is not silently lost)

**`McpConnectionSection.jsx` `handleFetch` classifies a 403 by string-matching the error
message** (`msg.includes('403') || msg.includes('not enabled') || msg.includes('forbidden')`)
when `ApiError.status` is available and reliable.

Verified currently CORRECT, not broken: the server answers
`403 {error: 'MCP bridge feature is not enabled'}`, `apiFetch` surfaces `errBody.error` as
the message, so the `'not enabled'` arm matches. This path stays reachable because
`ENABLE_MCP_BRIDGE` (which gates `/api/ext/mcp-token`) is a different flag from
`ENABLE_MCP_SERVER` (which drives `mcp.mounted`) — an appliance can have MCP mounted and
the bridge off.

Deliberately NOT fixed in v2.20.0: the release was already tagged, published, and its
artifacts verified downloadable. Editing source after tagging would recreate the exact
source/artifact drift this release existed to remove — v2.19.0 shipped a Sep 23 zip under a
version whose source had moved on Sep 26. A brittle-but-correct string match does not
justify a second divergence. Fix it in v2.20.1 as `err?.status === 403`, with a test that
asserts on the status rather than the wording.
