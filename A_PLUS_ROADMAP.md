# Glassy Companion — A+ Extension Roadmap (Updated June 13, 2026 — Final)
## Evaluated by: Expert browser extension architect

### Current Grade: A- | Target Grade: A+

> **June 13 final update:** v2.11.0 completes store readiness hardening. Server-side MCP SDK upgrade (glassy-dash v2.33.0) ships real `@modelcontextprotocol/sdk` with 6 tools, 3 prompts, 3 resources, completable(), DNS rebinding, tier-based rate limiting, and Obsidian proxy unification. S3 substantially complete: side panel responsive, store assets, E2E test foundation, MCP bridge config snippets. Grade: A-.

## Original Critical Issues (Hotfix Tier) — v2.5.0–v2.11.0 Status

| # | Issue | Status |
|---|-------|--------|
| 1 | MV3 service worker keep-alive | ✅ FIXED (v2.5.0) |
| 2 | Screenshot never reaches server | ✅ FIXED (v2.4.0+) |
| 3 | Element picker discovery cliff | ✅ IMPROVED (v2.9.0) |
| 4 | Missing CSP in manifest | ✅ FIXED (v2.11.0) |
| 5 | Side panel responsive layout | ✅ FIXED (v2.11.0 — CSS var --popup-width) |

## Foundation Tier — Current Status

| # | Item | Status |
|---|------|--------|
| 6 | Auth mutex | ✅ Verified |
| 7 | Storage quota monitoring | ✅ FIXED (v2.11.0) — alarm listener updated; `checkStorageQuota()` runs every 6h via `STORAGE_QUOTA_ALARM`; 80% warn / 95% critical with auto-trim |
| 8 | SPA schema polling | ✅ IMPROVED (v2.9.0) |
| 9 | Chrome Web Store + AMO submission | ⏳ Store assets ready; submission next |
| 10 | E2E test suite | ✅ **Foundation (14/14 passing for real, zero no-op)** — see CJS→ESM tool-module conversion in [`GLASSY_PRE_BUILD_VERIFICATION_2026-06-13.md`](https://github.com/0Reliance/glassy/blob/main/GLASSY_PRE_BUILD_VERIFICATION_2026-06-13.md) Phase C. Companion 168/168 + MCP 14/14 = 836/836 server tests pass. |

## A+ Differentiators — Final State

| # | Item | Status |
|---|------|--------|
| 11 | MCP bridge (config-based) | ✅ Dynamic URL snippets in MCPKeySettings.jsx |
| 12 | Obsidian direct vault push | ⏳ Deferred (full feature) |
| 13 | Keyboard-first modal commands | 🔲 S4 |
| 14 | Automated CI store publishing | 🔲 S4 |
| 15 | Real-time sync state | 🔲 S4 |

---

## The Six Critical Gaps — June 2026 Reassessment

### 1. MV3 Service Worker == Volatile Memory ✅ CLOSED
~~Chrome kills service workers after 30s of inactivity.~~ **Fixed:** Offscreen document pipeline (v2.5.0) handles heavy work; the service worker is now a message broker only. `ensureOffscreen` handles the SW-restart "only one document" race and the Firefox `chrome.offscreen === undefined` fallback to in-SW.

### 2. Screenshot != Saved ✅ CLOSED
~~Screenshot stores dataUrl locally but never uploads it.~~ **Fixed:** v2.4.0+ routes screenshots through the capture pipeline to the server. v2.9.0 further improves reliability: screenshot now routes directly through the service worker via `captureVisibleTab`, bypassing the content-script relay — works on restricted URLs, PDFs, and any tab where the content script is absent.

### 3. Element Picker Discovery Cliff ✅ IMPROVED
v2.9.0 simplified the main bar to two actions (Save Page + Screenshot). Element Picker and Region Picker removed from the popup bar; they remain in code for future in-reader affordances. Full floating action bar deferred to roadmap.

### 4. CSP and Store Blockers ✅ CLOSED (with caveat)
~~No `content_security_policy` in manifest.json.~~ **Fixed:** v2.11.0 — Chrome manifest already had CSP; Firefox manifest CSP added. Bundle audit complete with `manualChunks` splitting (vendor-react, vendor-state, ui-components, kb-view). `chunkSizeWarningLimit` set to 200KB. **Caveat:** the `ErrorBoundary` chunk lands at 203.84 KB (gzip 63.51 KB) — over the 200 KB warning threshold. Largest single chunk is the ErrorBoundary boundary + popup shell code that shares the chunk because it co-imports React + zustand + state stores. Real-world download size is much smaller due to gzip, but the raw threshold is being exceeded; full measurement committed to `docs/bundle-sizes.md`. Side panel responsive layout (S3.5) is implemented via the `--popup-width` CSS variable in `popup.css`, `AppShell.jsx`, and `sidepanel/index.jsx` — visual responsive testing is **pending** and was not completed as part of v2.11.0.

### 5. Site Interpreters vs. Dynamic SPAs ✅ MITIGATED
v2.9.0 structured capture pipeline re-runs the page interpreter on content-type change so the latest metadata is always captured. YouTube and GitHub interpreters hardened (videoId extraction, owner/repo + topics). Full MutationObserver polling deferred.

### 6. No Observability ✅ CLOSED
v2.5.0 shipped `reportContentError` + `respondSync` in `extractor.js` and a `CONTENT_SCRIPT_ERROR` telemetry sink. Multi-account capture (v2.7.0) adds per-account capture routing. Privacy-safe telemetry layer is live.

---

## Three A+ Pillars

### Pillar I: MCP Integration (Phase 6 of KB/MCP roadmap)
Embed a Model Context Protocol bridge in the extension's offscreen document. Glassy becomes the memory layer for browser AI. Claude.ai, Cursor, WindSurf can all reach `localhost:3000/mcp/sse` via the companion bridge. The server MCP (Phase 3) must ship first.

### Pillar II: Obsidian == First-Class Pathway (roadmap)
Extension pushes captures directly to Obsidian vault via Local REST API. Bi-directional sync. Route captures to specific vault folders based on domain rules.

### Pillar III: Zero-Friction Install → Capture
OAuth via chrome.identity, onboarding carousel, default to Quick Save for power users. **Blocked on**: CSP fix → Chrome Web Store submission.

---

## Revised 30-Day Sprint (June 2026)

| Week | Focus | Deliverables | Status |
|------|-------|-------------|--------|
| Week 1 | Store Readiness | CSP manifest fix, bundle size audit, privacy policy | ✅ **DONE** (v2.11.0) |
| Week 2 | Store Submission | Chrome Web Store + AMO submission, automated CI release | ⏳ Next |
| Week 3 | Quality Polish | SPA schema polling, element picker improvements, side panel layout fix | ⏳ |
| Week 4 | Knowledge Layer | MCP server prototype (server-side Phase 3), E2E test suite foundation | ✅ **DONE** (glassy-dash v2.33.0: real SDK, 6 tools, 3 prompts, 3 resources) |

## Key Insight
The reliability foundation is now sound. v2.5.0–v2.11.0 closed all critical MV3 gaps, delivered structured capture end-to-end, and completed store readiness hardening. The server-side MCP knowledge layer is now a world-class SDK implementation. The remaining path to A+ is: (1) store submission, (2) Companion MCP bridge (Phase 6), (3) Obsidian direct push. The architecture is correct — what remains is distribution and platform depth.
