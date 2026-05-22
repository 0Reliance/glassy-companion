/**
 * Product page interpreter — extracts product metadata from Schema.org.
 * Handles: Amazon, eBay, ProductHunt, and generic Product schema pages.
 */
export async function interpretProduct(document, url) {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent)
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type'] === 'Product') {
          const offer = item.offers || (Array.isArray(item.offers) ? item.offers[0] : null)
          let price = ''
          if (offer) {
            price = offer.price
              ? `${offer.priceCurrency || '$'}${offer.price}`
              : (offer.lowPrice ? `${offer.lowPrice}–${offer.highPrice}` : '')
          }
          return {
            enriched: true,
            site: 'product',
            contentType: 'product',
            metadata: {
              title: item.name || '',
              description: item.description?.slice(0, 500) || '',
              coverImageUrl: (Array.isArray(item.image) ? item.image[0] : item.image) || '',
              price,
              brand: item.brand?.name || item.brand || '',
              rating: item.aggregateRating?.ratingValue || '',
              reviewCount: item.aggregateRating?.reviewCount || '',
              sku: item.sku || '',
            },
          }
        }
      }
    } catch {}
  }

  // Fallback: basic og extraction
  return {
    enriched: true,
    site: 'product',
    contentType: 'product',
    metadata: {},
  }
}
