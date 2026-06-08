# Glassy Companion — A+ Extension Roadmap (Updated June 8, 2026)
## Evaluated by: Expert browser extension architect

### Current Grade: B+ | Target Grade: A+

> **June 2026 update:** v2.5.0–v2.8.0 closed the most critical reliability gaps. The original "Critical Issues" below have been reassessed — see the Status column.

## Original Critical Issues (Hotfix Tier) — v2.5.0–v2.8.0 Status

| # | Issue | Status |
|---|-------|--------|
| 1 | MV3 service worker keep-alive during saves (30s kill window) | ✅ **FIXED** — offscreen document pipeline ships in v2.5.0; SW is now a message broker only |
| 2 | Screenshot never reaches server (no attachment pipeline) | ✅ **FIXED** — v2.4.0+; v2.8.0 adds immediate Smart Save with pre-loaded image |
| 3 | Element picker three-step discovery problem (UX crash) | ✅ **IMPROVED** — v2.5.0 telemetry + v2.8.0 Smart Save flow dramatically reduces confusion |
| 4 | Missing CSP in manifest (blocks store submission) | ⏳ **PENDING** — manifest hardening required before Chrome Web Store + AMO submission |
| 5 | Side panel responsive layout breaks at non-380px widths | ⏳ **PENDING** |

## Foundation Tier — Current Status

| # | Item | Status |
|---|------|--------|
| 6 | Auth mutex for concurrent 401s | ✅ Verified sound (see FUTURE_WORK.md audit) |
| 7 | Storage quota monitoring (10MB Chrome limit) | ⏳ Pending |
| 8 | SPA schema polling (YouTube/GitHub dynamic metadata) | ✅ **IMPROVED** — quality gate v2.8.0 rejects bad captures; full polling still deferred |
| 9 | Chrome Web Store + AMO submission | ⏳ **Next priority** after CSP fix |
| 10 | E2E test suite with Playwright | ⏳ Pending |

## A+ Differentiators — June 2026 State

| # | Item | Status |
|---|------|--------|
| 11 | MCP server inside browser extension (Companion offscreen MCP bridge) | 🔲 Phase 6 of KB/MCP roadmap — after server MCP (Phase 3) ships |
| 12 | Obsidian direct vault push (bypass Glassy if desired) | 🔲 Roadmap |
| 13 | Keyboard-first modal commands (Vim-style) | 🔲 Roadmap |
| 14 | Automated CI store publishing | 🔲 Blocked on store submission (item 9) |
| 15 | Real-time sync state across popup/sidepanel | 🔲 Roadmap |

---

## The Six Critical Gaps — June 2026 Reassessment

### 1. MV3 Service Worker == Volatile Memory ✅ CLOSED
~~Chrome kills service workers after 30s of inactivity.~~ **Fixed:** Offscreen document pipeline (v2.5.0) handles heavy work; the service worker is now a message broker only. `ensureOffscreen` handles the SW-restart "only one document" race and the Firefox `chrome.offscreen === undefined` fallback to in-SW.

### 2. Screenshot != Saved ✅ CLOSED
~~Screenshot stores dataUrl locally but never uploads it.~~ **Fixed:** v2.4.0+ routes screenshots through the capture pipeline to the server. v2.8.0 improves the UX: clicking the screenshot button now opens Smart Save with the image pre-loaded, eliminating the "silent save then reopen" confusion.

### 3. Element Picker Discovery Cliff ✅ IMPROVED
Significantly improved by v2.8.0's immediate Smart Save flow. Full floating action bar or side-panel-exclusive mode deferred to roadmap.

### 4. CSP and Store Blockers ⏳ ACTIVE
No `content_security_policy` in manifest.json. This blocks Chrome Web Store and AMO submission. **Next priority:** Add strict CSP, bundle size audit (target <200KB chunks per file).

### 5. Site Interpreters vs. Dynamic SPAs ✅ MITIGATED
v2.8.0 quality gate rejects SPA pages that yield <200 meaningful characters and falls back to a clean bookmark. Full MutationObserver polling deferred.

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

| Week | Focus | Deliverables |
|---|---|---|
| Week 1 | Store Readiness | CSP manifest fix, bundle size audit, privacy policy |
| Week 2 | Store Submission | Chrome Web Store + AMO submission, automated CI release |
| Week 3 | Quality Polish | SPA schema polling, element picker improvements, side panel layout fix |
| Week 4 | Knowledge Layer | MCP server prototype (server-side Phase 3), E2E test suite foundation |

## Key Insight
The reliability foundation is now sound. v2.5.0–v2.8.0 closed the most critical MV3 gaps. The remaining path to A+ is: (1) CSP + store submission, (2) server-side MCP knowledge layer (Phase 1–3), (3) Companion MCP bridge (Phase 6). The architecture is correct — what remains is depth of platform integration and distribution.
