// Extension constants
// The base URL is the primary Glassy instance.
// Users can override via extension settings (stored in chrome.storage.local).
export const DEFAULT_BASE_URL = 'https://glassy.fyi'

export const API_PATHS = {
  login: '/api/login',
  me: '/api/ext/me',
  ping: '/api/ext/ping',
  collections: '/api/ext/collections',
  checkUrl: '/api/ext/check-url',
  bookmarks: '/api/ext/bookmarks',
  notes: '/api/ext/notes',
  aiSummarize: '/api/ext/ai/summarize',
}

export const STORAGE_KEYS = {
  token: 'glassy_token',
  user: 'glassy_user',
  baseUrl: 'glassy_base_url',
  settings: 'glassy_settings',
  offlineQueue: 'glassy_offline_queue',
}

export const DEFAULT_SETTINGS = {
  aiAutoTag: true,
  showQuickActions: true,
  defaultCollection: null,
  badgeCount: true,
  showNotifications: true,
}

// Context menu IDs
export const CTX_SAVE_PAGE = 'glassy_save_page'
export const CTX_SAVE_LINK = 'glassy_save_link'
export const CTX_SAVE_SELECTION = 'glassy_save_selection'
export const CTX_SAVE_HIGHLIGHT = 'glassy_save_highlight'

// Alarm names
export const ALARM_OFFLINE_SYNC = 'glassy_offline_sync'

// Max characters extracted from page body for AI summary
export const MAX_PAGE_TEXT_CHARS = 5000

// Cache TTLs
export const COLLECTIONS_CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes
