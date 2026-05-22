/**
 * YouTube interpreter — extracts video metadata from Schema.org + page scraping.
 */
export async function interpretYouTube(document, url) {
  // Try Schema.org first (most reliable on YouTube)
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent)
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item['@type'] === 'VideoObject') {
            return {
              enriched: true,
              site: 'youtube',
              contentType: 'video',
              metadata: {
                author: item.author?.name || '',
                title: item.name || '',
                description: item.description?.slice(0, 500) || '',
                publishedAt: item.uploadDate || '',
                coverImageUrl: item.thumbnailUrl?.[0] || item.thumbnailUrl || '',
                duration: item.duration || '',
                // Custom YouTube fields
                channelName: item.author?.name || '',
                videoId: item.embedUrl?.split('/').pop() || '',
              },
            }
          }
        }
      } else if (data['@type'] === 'VideoObject') {
        return {
          enriched: true,
          site: 'youtube',
          contentType: 'video',
          metadata: {
            author: data.author?.name || '',
            title: data.name || '',
            description: data.description?.slice(0, 500) || '',
            publishedAt: data.uploadDate || '',
            coverImageUrl: data.thumbnailUrl?.[0] || data.thumbnailUrl || '',
            duration: data.duration || '',
            channelName: data.author?.name || '',
            videoId: data.embedUrl?.split('/').pop() || '',
          },
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
    },
  }
}
