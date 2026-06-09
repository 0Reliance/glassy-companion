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

/**
 * Maximum offline queue size. Repeated 5xx with the browser offline could
 * grow this list unbounded and eventually trip chrome.storage.local quota.
 * Cap at 200 items; older items take precedence (we drop the new save and
 * surface an error so the user knows it didn't queue).
 */
export const MAX_QUEUE_SIZE = 200

export class QueueFullError extends Error {
  constructor() {
    super('Offline queue is full — please reconnect to sync pending saves.')
    this.name = 'QueueFullError'
    this.code = 'QUEUE_FULL'
  }
}

/** Load the queue from chrome.storage.local. */
async function loadQueue() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.offlineQueue)
  return result[STORAGE_KEYS.offlineQueue] || []
}

/**
 * Persist the queue to chrome.storage.local.
 *
 * A large capture payload can push the serialized queue past the
 * chrome.storage.local quota. Chrome surfaces this either by rejecting the
 * promise or by setting chrome.runtime.lastError. We normalize both into a
 * QueueFullError so callers get the same "reconnect to sync" signal they
 * already handle for a length-capped queue, instead of an opaque failure.
 */
async function saveQueue(queue) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.offlineQueue]: queue })
  } catch (err) {
    const msg = err?.message || ''
    if (/quota/i.test(msg)) {
      throw new QueueFullError()
    }
    throw err
  }
  // Some Chrome versions report quota errors via lastError rather than a
  // rejected promise — surface those too.
  const lastError = globalThis.chrome?.runtime?.lastError
  if (lastError && /quota/i.test(lastError.message || '')) {
    throw new QueueFullError()
  }
}

/** Add an item to the offline queue. Returns the new queue item. */
export async function enqueue(type, payload) {
  const queue = await loadQueue()
  if (queue.length >= MAX_QUEUE_SIZE) {
    throw new QueueFullError()
  }
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

/**
 * Apply a batch of flush outcomes in a SINGLE read-modify-write.
 *
 * A queue flush processes every item, and calling dequeue()/incrementAttempts()
 * per item meant one full storage read + write per item — O(n) writes of an
 * O(n) array, i.e. O(n^2) work across the queue. This applies all removals and
 * attempt-bumps in one pass.
 *
 * Concurrency-safe: it re-reads the queue at apply time, so any item enqueued
 * during the flush window (it won't be in `remove`/`increment`) passes through
 * untouched rather than being clobbered.
 *
 * @param {{ remove?: Iterable<string>, increment?: Iterable<string> }} outcomes
 */
export async function applyFlushOutcomes({ remove, increment } = {}) {
  const removeSet = new Set(remove || [])
  const incrementSet = new Set(increment || [])
  if (removeSet.size === 0 && incrementSet.size === 0) return
  const queue = await loadQueue()
  const next = []
  for (const item of queue) {
    if (removeSet.has(item.id)) continue // removal wins over increment
    if (incrementSet.has(item.id)) next.push({ ...item, attempts: item.attempts + 1 })
    else next.push(item)
  }
  await saveQueue(next)
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
