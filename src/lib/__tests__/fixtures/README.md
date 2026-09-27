# Manifest fixtures

Verbatim captures of `GET /api/capabilities`. **Never hand-edit these files.**

The `interpretStatus` defect this suite exists to prevent was caused by a test
fixture written from imagination — `{mounted:true, toolCount:40}` as the body of
`/mcp/status`, a response no glassy-dash commit has ever produced — which then
certified the bug instead of catching it. A fixture is evidence or it is nothing.

Re-capture with:

    curl -s http://localhost:3000/api/capabilities      -o manifest-cloud.json
    curl -s http://localhost:3011/api/capabilities      -o manifest-selfhost.json
    curl -s https://glassy.fyi/api/capabilities         -o manifest-cloud-v2.40.0.json

`manifest-selfhost.json` needs a container running with `INSTANCE_ID=self_hosted`
`DEPLOYMENT_LOCALITY=local` `ENABLE_MCP_SERVER=true`. The published `sh-rig` image lags
a fresh deploy, so capture from a throwaway container built from the current
`glassy-dash:prod` image instead of assuming the rig has moved.

| File | Captured | Source | `mcp.mounted` | `vault` |
|---|---|---|---|---|
| `manifest-cloud.json` | 2026-09-26 | `glassy-dash-prod` @ `127.0.0.1:3000`, v2.40.5, `instanceId: public`, revision `ef93e014` | `false` | `{"available":false}` |
| `manifest-selfhost.json` | 2026-09-26 | throwaway `sh-cap` container from the same v2.40.5 image @ `127.0.0.1:3011`, `INSTANCE_ID=self_hosted`, `deploymentLocality: local` | `true` (40 tools) | `{"available":true}` |
| `manifest-cloud-v2.40.0.json` | 2026-09-26 | `https://glassy.fyi` — the public origin as it actually serves today, v2.40.0 | absent | absent |

The third file is not redundant. It is the shape `app.glassy.fyi` — the extension's
`DEFAULT_BASE_URL` — really returns, and it predates both `mcp.mounted` (v2.40.2) and
`vault` (v2.40.5). "Key absent" and "key false" are different inputs that must produce
the same fail-closed answer, and only a genuine old manifest proves that rather than
asserting it against a hand-written `{}`.

Re-capture after any server release that changes the manifest, and update this table.
A fixture whose provenance is unknown is worse than no fixture.
