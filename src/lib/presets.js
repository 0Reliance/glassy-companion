/**
 * Content type presets — four first-class types that drive both
 * structured scraping in the extension and type-aware rendering in Keep.
 *
 *   article  — long-form text, essays, research papers (absorbs 'research')
 *   video    — YouTube / Vimeo / video pages (embedded player in reader)
 *   repo     — GitHub / GitLab repositories (owner/stars/language card)
 *   bookmark — honest fallback for everything else (rich link preview)
 */
export const PRESETS = {
  bookmark: {
    id: 'bookmark',
    label: 'Bookmark',
    icon: '🔖',
  },
  article: {
    id: 'article',
    label: 'Article',
    icon: '📄',
  },
  video: {
    id: 'video',
    label: 'Video',
    icon: '🎬',
  },
  repo: {
    id: 'repo',
    label: 'Repo',
    icon: '💻',
  },
}

export function getPreset(id) {
  return PRESETS[id] || PRESETS.bookmark
}
