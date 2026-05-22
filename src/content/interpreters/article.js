/**
 * Article/scholarly interpreter — extracts metadata from Schema.org.
 * Handles: Arxiv, Medium, Substack, Dev.to, and generic Article schema.
 */
export async function interpretArticle(document, url) {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent)
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const type = item['@type']
        if (type === 'ScholarlyArticle' || type === 'NewsArticle' || type === 'BlogPosting' || type === 'Article') {
          return {
            enriched: true,
            site: 'article',
            contentType: type === 'ScholarlyArticle' ? 'research' : 'article',
            metadata: {
              title: item.headline || item.name || '',
              description: item.description?.slice(0, 500) || '',
              author: (Array.isArray(item.author) ? item.author[0]?.name : item.author?.name) || item.author || '',
              publishedAt: item.datePublished || item.dateCreated || '',
              language: item.inLanguage || '',
              // Arxiv-specific fields
              abstract: item.description || '',
              doi: item.sameAs || '',
            },
          }
        }
      }
    } catch {}
  }

  return {
    enriched: true,
    site: 'article',
    contentType: 'article',
    metadata: {},
  }
}
