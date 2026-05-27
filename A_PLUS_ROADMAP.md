# Glassy Companion — A+ Extension Roadmap (May 27, 2026)
## Evaluated by: Expert browser extension architect

### Current Grade: B- | Target Grade: A+

## Critical Issues (Hotfix Tier — Week 1)
1. MV3 service worker keep-alive during saves (30s kill window)
2. Screenshot never reaches server (no attachment pipeline)
3. Element picker three-step discovery problem (UX crash)
4. Missing CSP in manifest (blocks store submission)
5. Side panel responsive layout breaks at non-380px widths

## Foundation Tier (Next 2 Weeks)
6. Auth mutex for concurrent 401s
7. Storage quota monitoring (10MB Chrome limit)
8. SPA schema polling (YouTube/GitHub dynamic metadata)
9. Chrome Web Store + AMO submission
10. E2E test suite with Playwright

## A+ Differentiators (Next Month)
11. MCP server inside browser extension (Model Context Protocol)
12. Obsidian direct vault push (bypass Glassy if desired)
13. Keyboard-first modal commands (Vim-style)
14. Automated CI store publishing
15. Real-time sync state across popup/sidepanel

## The Six Critical Gaps

### 1. MV3 Service Worker == Volatile Memory
Chrome kills service workers after 30s of inactivity. The save flow spans popup → service worker → content script → API → notification, easily 3-5s under load. Solution: Offscreen document for heavy work; service worker as message broker only.

### 2. Screenshot != Saved
Screenshot stores dataUrl locally but never uploads it. Server API only accepts JSON. Solution: Presigned S3/R2 URL for direct binary upload, then reference attachmentId in capture payload.

### 3. Element Picker Discovery Cliff
User clicks 🎯, popup closes, captures element, but must manually reopen popup to discover result. Solution: Floating action bar on host page or move picker to side panel exclusively.

### 4. CSP and Store Blockers
No content_security_policy in manifest. 491KB React bundle has no integrity hashes. Solution: Add strict CSP, split bundles to <200KB chunks, submit to Chrome Web Store + AMO.

### 5. Site Interpreters vs. Dynamic SPAs
YouTube/GitHub load Schema.org metadata after initial paint. Extractor runs at document_idle and misses it. Solution: MutationObserver with 3s timeout cap for reactive schema discovery.

### 6. No Observability
No crash reporting, telemetry, or error recovery data. Flying blind on real-world failures. Solution: Lightweight privacy-safe telemetry layer.

## Three A+ Pillars

### Pillar I: MCP Integration
Embed a Model Context Protocol server inside the browser extension. Glassy becomes the memory layer for AI. Claude Desktop, Cursor, WindSurf can all read/write captures via MCP.

### Pillar II: Obsidian == First-Class Pathway
Extension pushes captures directly to Obsidian vault via Local REST API. Bi-directional sync. Route captures to specific vault folders based on domain rules.

### Pillar III: Zero-Friction Install → Capture
OAuth via chrome.identity, onboarding carousel, default to Quick Save for power users, tutorial overlays on supported sites.

## 30-Day Sprint

| Week | Focus | Deliverables |
|---|---|---|
| Week 1 | MV3 Reliability | Offscreen document save pipeline, SW keep-alive, CSP manifest fix |
| Week 2 | Store Readiness | Chrome Web Store + AMO submission, privacy policy, automated CI release |
| Week 3 | A+ Features | Screenshot upload pipeline, element picker floating bar, Obsidian direct push |
| Week 4 | Category Definition | MCP server prototype, E2E test suite, telemetry layer |

## Key Insight
The architecture is sound. React + Zustand popup pattern is correct. API layer is clean. What's missing is depth of platform integration (MCP, Obsidian, store distribution) and reliability of the MV3 execution environment (transactional saves, service worker lifecycle, real-time state sync).
