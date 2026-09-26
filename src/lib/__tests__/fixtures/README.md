# Manifest fixtures

Verbatim captures of `GET /api/capabilities`. **Never hand-edit these files.**

The `interpretStatus` defect this suite exists to prevent was caused by a test
fixture written from imagination — `{mounted:true, toolCount:40}` as the body of
`/mcp/status`, a response no glassy-dash commit has ever produced — which then
certified the bug instead of catching it. A fixture is evidence or it is nothing.

Re-capture with:

    curl -s https://glassy.fyi/api/capabilities     -o manifest-cloud.json
    curl -s http://localhost:3010/api/capabilities  -o manifest-selfhost.json

| File | Captured | Source | `mcp.mounted` | `vault` |
|---|---|---|---|---|
| `manifest-cloud.json` | 2026-09-26 | `https://glassy.fyi` v2.40.0, `instanceId: public`, `deploymentLocality: cloud` | absent | absent |
| `manifest-selfhost.json` | 2026-09-26 | `sh-rig` `ghcr.io/0reliance/glassy-dash:v2.40.4` @ `127.0.0.1:3010`, `instanceId: self_hosted`, `deploymentLocality: local` | `true` | absent |

`vault` is **absent in both** because these were captured before the server change
that publishes it (`glassy-dash` commit `4752dcc2`). That is the honest baseline:
`serverContract.test.js` asserts `vault.available === false` against them, and the
positive arm is added in Task 11 Step 1 once the change is deployed and these are
re-captured.

Re-capture both after any server release that changes the manifest, and update this
table. A fixture whose provenance is unknown is worse than no fixture.
