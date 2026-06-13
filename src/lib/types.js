/**
 * @typedef {Object} HighlightBlock
 * @property {string} id
 * @property {string} text
 * @property {string} [note]
 * @property {string} [color]
 * @property {number} [order]
 * @property {string} [selector]
 * @property {string} [pageTitle]
 * @property {string} [sourceUrl]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} ObsidianSync
 * @property {string} [path] — target vault path (e.g. 'Clips/web-clips/')
 * @property {string} [template] — OFM template name for the push
 * @property {string} [emittedAt] — ISO timestamp of last successful push
 * @property {string} [noteId] — Glassy note ID that was pushed
 * NOTE: This type is a stub — push-to-Obsidian from the browser extension
 * is not yet implemented. Captures can be pushed to Obsidian via the
 * glassy-dash web app's Vault integration.
 */

/**
 * @typedef {Object} ScreenshotMeta
 * @property {string} [url] — server URL of the captured image
 * @property {string} [dataUrl] — raw base64 data URL (client-side only, cleared before save)
 * @property {number} [width]
 * @property {number} [height]
 * @property {boolean} [fullPage] — whether this is a stitched full-page capture
 */

/**
 * @typedef {Object} CaptureImage
 * @property {string} url — public URL
 * @property {string} [src] — alias for url
 * @property {string} [id]
 * @property {string} [name]
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * @typedef {Object} CaptureItem
 * @property {string} [id]
 * @property {string} [workspaceId]
 * @property {string} sourceUrl
 * @property {string} [canonicalUrl]
 * @property {string} title
 * @property {string} contentType - Preset / detected type
 * @property {'quick'|'smart'|'selection'|'highlight'|'screenshot'|'element'} captureMode
 * @property {string} [excerpt]
 * @property {string} [contentMarkdown]
 * @property {string} [contentHtml]
 * @property {string} [coverImageUrl]
 * @property {string} [siteName]
 * @property {string} [author]
 * @property {string} [publishedAt]
 * @property {string} [capturedAt]
 * @property {number} [readingTimeMinutes]
 * @property {string} [language]
 * @property {string[]} [visibleTags]
 * @property {string[]} [systemTags]
 * @property {string} [note]
 * @property {HighlightBlock[]} [highlights]
 * @property {Object[]} [attachments]
 * @property {ScreenshotMeta} [screenshot] — structured screenshot metadata
 * @property {CaptureImage[]} [images] — native image manifest for hero/gallery
 * @property {'inbox'|'active'|'archived'|'surfaced'|'public_candidate'|'published'} status
 * @property {string[]} [projectIds]
 * @property {ObsidianSync} [obsidian]
 * @property {Object} [structuredData] — type-specific enriched fields from the site interpreter
 *   (video: { videoId, provider, channelName, duration, description };
 *    repo:  { owner, repo, stars, language, license, topics, description };
 *    article: { abstract, doi, language })
 * @property {Object} [ai]
 */

export {}
