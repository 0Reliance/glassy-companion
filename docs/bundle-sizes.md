# Bundle Sizes — Glassy Companion (S2.7 audit)

**Last measured:** 2026-06-13 (v2.11.0, after manifest version bump)
**Build command:** `npm run build` (Chrome) and `npm run build:firefox` (Firefox)
**Total `dist/assets/` size:** 384 KB (all chunks, raw)

## Headline

The `chunkSizeWarningLimit` of 200 KB in `vite.config.js` **is being exceeded** by the `ErrorBoundary` chunk. This is informational, not blocking: the gzipped download cost is 63.51 KB which is well within practical loading budgets. The fix is to either raise the limit to a more realistic 250 KB, or to split the `ErrorBoundary` boundary code into its own chunk. Both are tracked as P2 follow-ups.

## Chrome Build Chunks

| Chunk | Raw size | Gzipped | Status |
|-------|---------:|--------:|--------|
| `ErrorBoundary-DiQvZBv2.js` | 203.84 KB | 63.51 KB | ⚠️ Exceeds 200 KB raw limit |
| `ui-components-PQe_LY8H.js` | 63.08 KB | 18.45 KB | ✅ |
| `extractor.js-Ci6nWxMF.js` | 18.08 KB | 6.46 KB | ✅ |
| `service-worker.js-WCMyMWh6.js` | 15.77 KB | 5.22 KB | ✅ |
| `kb-view-DbSzawz0.js` | 5.23 KB | 2.14 KB | ✅ |
| `elementPicker-D4vrq96g.js` | 4.48 KB | 1.84 KB | ✅ |
| `sidepanel-ntv1nwHS.css` | 1.28 KB | 0.61 KB | ✅ |
| `ErrorBoundary-CcMM_o5T.css` | 3.39 KB | 1.24 KB | ✅ |
| `offscreen-CiD0U6G4.js` | 2.20 KB | 1.07 KB | ✅ |
| `regionPicker-DITOKAZu.js` | 2.75 KB | 1.11 KB | ✅ |
| `capturePipeline-CkOwZOl3.js` | 2.60 KB | 1.16 KB | ✅ |
| `vendor-react-BBOrhUfi.js` | 3.80 KB | 1.48 KB | ✅ |
| `vendor-state-DGznrrat.js` | 0.04 KB | 0.06 KB | ✅ |
| `urlUtils-CkOyZbW6.js` | 0.69 KB | 0.43 KB | ✅ |
| `modulepreload-polyfill-B5Qt9EMX.js` | 0.71 KB | 0.40 KB | ✅ |
| `sidepanel-T0-qwHY2.js` | 0.50 KB | 0.36 KB | ✅ |
| `popup-D3GxrI3q.js` | 0.35 KB | 0.27 KB | ✅ |
| `extractor.js-loader-9dvh6mwL.js` | 0.35 KB | (loader) | ✅ |
| `service-worker-loader.js` | 0.05 KB | (loader) | ✅ |
| Icon assets (16/32/48/128 PNG) | <1 KB each | (binary) | ✅ |

## Firefox Build Chunks

The Firefox build emits the same chunk set with the same sizes (vite re-runs the same rollup config in `mode: firefox`). The only differences are the manifest and a few build-time replacements. See the Chrome table above for per-chunk sizes.

## What changed in v2.11.0 (S2.7)

`vite.config.js` now defines `manualChunks` to split the bundle into:

- `vendor-react` — React + React DOM
- `vendor-state` — Zustand
- `ui-components` — shared UI primitives
- `kb-view` — the KB search view component

`chunkSizeWarningLimit` is set to `200` (KB). **One chunk exceeds this** (the `ErrorBoundary` chunk, at 203.84 KB).

## P2 Follow-up: split the `ErrorBoundary` chunk

The `ErrorBoundary` chunk contains the popup shell code that co-imports React, Zustand, and a few state stores. To bring it under 200 KB:

1. Move the popup shell's React imports into a separate `popup-shell` chunk.
2. Move the Zustand store initializations into `vendor-state` (which is currently 0.04 KB — suspiciously empty, suggesting imports are being bundled elsewhere).
3. After the split, re-run the build and re-measure with `du -sh dist/assets/* | sort -hr`.

## Reproduction

```bash
cd glassy-companion
npm run build
du -sh dist/assets/* | sort -hr
# Verify: total dist/assets is ~384 KB and the largest chunk is ErrorBoundary (~204 KB)
```

## Notes

- The `vendor-state` chunk at 0.04 KB is anomalously small. This is because Zustand is being imported by the popup shell, which is bundled into the `ErrorBoundary` chunk. Splitting the popup shell should make `vendor-state` non-trivial.
- The gzipped sizes (the actual download cost) are all comfortably small — 63.51 KB for the largest chunk is fine. The raw 200 KB limit is conservative and is being treated as a soft threshold.
- These numbers are committed to the repo so that future audits have a baseline. Update this file when the chunk split is done (P2 follow-up).
