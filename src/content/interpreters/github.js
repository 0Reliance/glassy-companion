/**
 * GitHub interpreter — extracts repo metadata.
 */
export async function interpretGitHub(document, url) {
  // Detect repo page vs other GitHub pages.
  let pathParts = []
  try { pathParts = new URL(url).pathname.split('/').filter(Boolean) } catch {}

  const isRepo = pathParts.length >= 2 && !['explore', 'topics', 'marketplace', 'pulls', 'issues', 'settings', 'notifications', 'account', 'organizations', 'sponsors'].includes(pathParts[0])
  const owner = pathParts[0] || ''
  const repo = pathParts[1] || ''

  if (!isRepo) {
    return {
      enriched: true,
      site: 'github',
      contentType: 'repo',
      metadata: {},
    }
  }

  // Try Schema.org
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent)
      if (data['@type'] === 'SoftwareSourceCode') {
        const stars = (data.interactionStatistic || []).find(s => s.interactionType === 'https://schema.org/WatchAction')?.userInteractionCount || ''
        return {
          enriched: true,
          site: 'github',
          contentType: 'repo',
          metadata: {
            title: data.name || `${owner}/${repo}`,
            description: data.description?.slice(0, 500) || '',
            author: data.author?.name || owner,
            language: data.programmingLanguage || '',
            stars: stars ? String(stars) : '',
            license: data.license || '',
            publishedAt: data.dateCreated || '',
            // Structured data fields
            owner,
            repo,
            topics: [],
          },
        }
      }
    } catch {}
  }

  // Fallback: scrape page elements
  const aboutEl = document.querySelector('[itemprop="about"], .f4.my-3')
  const description = aboutEl?.textContent?.trim() || ''

  const langEl = document.querySelector('[itemprop="programmingLanguage"], .d-inline-flex.flex-items-center [aria-label*="language"]')
  const language = langEl?.textContent?.trim() || ''

  const starEl = document.querySelector('[href$="/stargazers"] .Counter, #repo-stars-counter-star')
  const stars = starEl?.textContent?.trim() || ''

  const licenseEl = document.querySelector('[href*="/license"] .octicon-law + *, [aria-label*="license"]')
  const license = licenseEl?.textContent?.trim() || ''

  // Topic pills live in the sidebar under .topic-tag elements
  const topicEls = document.querySelectorAll('a.topic-tag, [data-octo-click="topic_click"]')
  const topics = Array.from(topicEls).map(el => el.textContent?.trim()).filter(Boolean)

  return {
    enriched: true,
    site: 'github',
    contentType: 'repo',
    metadata: {
      title: `${owner}/${repo}`,
      description,
      author: owner,
      language,
      stars,
      license,
      // Structured data fields
      owner,
      repo,
      topics,
    },
  }
}
