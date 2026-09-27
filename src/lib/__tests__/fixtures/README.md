# Manifest fixtures

Verbatim captures of `GET /api/capabilities`. **Never hand-edit these files.**

The `interpretStatus` defect this suite exists to prevent was caused by a test
fixture written from imagination — `{mounted:true, toolCount:40}` as the body of
`/mcp/status`, a response no glassy-dash commit has ever produced — which then
certified the bug instead of catching it. A fixture is evidence or it is nothing.

Re-capture with:

    curl -s https://app.glassy.fyi/api/capabilities   -o manifest-cloud.json
    curl -s http://localhost:3010/api/capabilities    -o manifest-selfhost.json

`manifest-selfhost.json` must come from a container running with `INSTANCE_ID=self_hosted`
`DEPLOYMENT_LOCALITY=local` `ENABLE_MCP_SERVER=true`. Prefer `sh-rig`, which
`deploy/selfhost-verify/run-rig-against-image.sh` boots from the **published** GHCR image
— that way the fixture and the Phase A rig result describe the same bytes, identified by
digest. A locally-built image can disagree with what was released.

| File | Captured | Source | `mcp.mounted` | `vault` |
|---|---|---|---|---|
| `manifest-cloud.json` | 2026-09-27 | `https://app.glassy.fyi` — the real public origin (served by `glassy-dash-prod` on **pozi200**), v2.40.5, `instanceId: public`, `deploymentLocality: cloud` | `false` (36 tools) | `{"available":false}` |
| `manifest-selfhost.json` | 2026-09-27 | `sh-rig` running the **published** `ghcr.io/0reliance/glassy-dash:v2.40.5` @ `127.0.0.1:3010`, digest `sha256:251c5f38dfe01faf6007ce2129fcec5f542fdb232d98621c743403966d9db29f`, `instanceId: self_hosted` | `true` (40 tools) | `{"available":true}` |
| `manifest-cloud-v2.40.0.json` | 2026-09-26 | `https://glassy.fyi` **as it served before the v2.40.5 pozi200 release**, v2.40.0 | absent | absent |

The third file is a **historical capture that can no longer be re-taken** — the public
origin has since moved to v2.40.5. Keep it. It is the only fixture where `mcp.mounted`
and `vault` are genuinely *absent* rather than `false`, and those are different inputs
that must produce the same fail-closed answer. Appliances in the field still serve this
shape (the keys arrived in v2.40.2 and v2.40.5 respectively), so "absent" is a live case,
not a historical curiosity. Asserting it against a hand-written `{}` would prove nothing
— that is precisely the mistake that produced `interpretStatus`.

Re-capture the first two after any server release that changes the manifest, and update
this table. A fixture whose provenance is unknown is worse than no fixture.
