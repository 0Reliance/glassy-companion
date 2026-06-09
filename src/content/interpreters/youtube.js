/**
 * Extract a clean YouTube video ID from an embed URL or the watch page URL.
 * Handles: /embed/<id>, /embed/<id>?..., watch?v=<id>, youtu.be/<id>.
 */
function extractVideoId(embedUrl, pageUrl) {
  // Try embedUrl first (Schema.org field)
  if (embedUrl) {
    const m = embedUrl.match(/\/embed\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[1]
  }
  // Fall back to the watch/short-link page URL
  if (pageUrl) {
    const m = pageUrl.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/
    )
    if (m) return m[1]
  }
  return ''
}

/**
 * YouTube interpreter — extracts video metadata from Schema.org + page scraping.
 */
export async function interpretYouTube(document, url) {
  // Try Schema.org first (most reliable on YouTube)
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent)
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type'] === 'VideoObject') {
          const channelName = item.author?.name || ''
          return {
            enriched: true,
            site: 'youtube',
            contentType: 'video',
            metadata: {
              author: channelName,
              title: item.name || '',
              description: item.description?.slice(0, 500) || '',
              publishedAt: item.uploadDate || '',
              coverImageUrl: item.thumbnailUrl?.[0] || item.thumbnailUrl || '',
              duration: item.duration || '',
              // Structured data fields (preserved through pipeline)
              videoId: extractVideoId(item.embedUrl, url),
              provider: 'youtube',
              channelName,
            },
          }
        }
      }
    } catch {}
  }

  // Fallback: scrape from page elements
  const title = document.querySelector('meta[name="title"]')?.content
    || document.querySelector('meta[property="og:title"]')?.content
    || document.title?.replace(' - YouTube', '')

  const channelEl = document.querySelector('#owner ytd-channel-name a, ytd-video-owner-renderer a')
  const channelName = channelEl?.textContent?.trim() || ''

  return {
    enriched: true,
    site: 'youtube',
    contentType: 'video',
    metadata: {
      title: title || '',
      channelName,
      author: channelName,
      videoId: extractVideoId('', url),
      provider: 'youtube',
    },
  }
}
