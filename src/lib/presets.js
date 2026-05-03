/**
 * Initial set of content presets.
 */
export const PRESETS = {
  bookmark: {
    id: 'bookmark',
    label: 'Bookmark',
    icon: '🔖',
    saveMode: 'bookmark',
  },
  article: {
    id: 'article',
    label: 'Article',
    icon: '📄',
    saveMode: 'article',
  },
  video: {
    id: 'video',
    label: 'Video',
    icon: '🎬',
    saveMode: 'bookmark',
  },
  repo: {
    id: 'repo',
    label: 'Repo',
    icon: '💻',
    saveMode: 'bookmark',
  },
  product: {
    id: 'product',
    label: 'Product',
    icon: '🛍️',
    saveMode: 'bookmark',
  },
  research: {
    id: 'research',
    label: 'Research',
    icon: '🔬',
    saveMode: 'article',
  },
  highlight: {
    id: 'highlight',
    label: 'Highlight',
    icon: '🖍️',
    saveMode: 'highlight',
  },
  quote: {
    id: 'quote',
    label: 'Quote',
    icon: '💬',
    saveMode: 'highlight',
  },
}

export function getPreset(id) {
  return PRESETS[id] || PRESETS.bookmark
}
