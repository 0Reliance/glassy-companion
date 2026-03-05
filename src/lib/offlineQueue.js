/**
 * Offline queue — stores failed/deferred saves in IndexedDB so they
 * can be retried when the browser comes back online.
 *
 * Queue items are plain objects:
 * {
 *   id: string (uuid),
 *   type: 'bookmark' | 'note',
 *   payload: object,
 *   queuedAt: number (ms timestamp),
 *   attempts: number,
 * }
 */
import { STORAGE_KEYS } from './constants.js'

/** Load the queue from chrome.storage.local. */
async function loadQueue() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.offlineQueue)
  return result[STORAGE_KEYS.offlineQueue] || []
}

/** Persist the queue to chrome.storage.local. */
async function saveQueue(queue) {
  await chrome.storage.local.set({ [STORAGE_KEYS.offlineQueue]: queue })
}

/** Add an item to the offline queue. Returns the new queue item. */
export async function enqueue(type, payload) {
  const queue = await loadQueue()
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    payload,
    queuedAt: Date.now(),
    attempts: 0,
  }
  queue.push(item)
  await saveQueue(queue)
  return item
}

/** Get all queued items. */
export async function getQueue() {
  return loadQueue()
}

/** Remove a specific item by id (after successful sync). */
export async function dequeue(id) {
  const queue = await loadQueue()
  await saveQueue(queue.filter(item => item.id !== id))
}

/** Increment attempt count for an item (after failed retry). */
export async function incrementAttempts(id) {
  const queue = await loadQueue()
  const updated = queue.map(item =>
    item.id === id ? { ...item, attempts: item.attempts + 1 } : item
  )
  await saveQueue(updated)
}

/** Clear the entire queue (e.g., on logout). */
export async function clearQueue() {
  await chrome.storage.local.remove(STORAGE_KEYS.offlineQueue)
}

/** Returns the count of pending items. */
export async function getQueueLength() {
  const queue = await loadQueue()
  return queue.length
}
