import { describe, expect, it } from 'vitest'
import {
  classifySaveError,
  planBackgroundSaveFailure,
  planQueueFailure,
} from '../savePolicy.js'

describe('savePolicy', () => {
  it('classifies duplicate conflicts as duplicate', () => {
    expect(classifySaveError({ status: 409 })).toBe('duplicate')
  })

  it('classifies 429 rate limit as retryable', () => {
    expect(classifySaveError({ status: 429 })).toBe('retryable')
  })

  it('queues 429 failures for retry in background saves', () => {
    expect(planBackgroundSaveFailure({ status: 429 })).toEqual({
      kind: 'retryable',
      queue: true,
    })
  })

  it('queues auth failures for later user recovery in background saves', () => {
    expect(planBackgroundSaveFailure({ status: 401 })).toEqual({
      kind: 'auth',
      queue: true,
    })
  })

  it('does not queue entitlement failures', () => {
    expect(planBackgroundSaveFailure({ status: 403 })).toEqual({
      kind: 'entitlement',
      queue: false,
    })
  })

  it('retries transient failures', () => {
    expect(planBackgroundSaveFailure({ status: 503 })).toEqual({
      kind: 'retryable',
      queue: true,
    })
    expect(planQueueFailure(new Error('network down'))).toEqual({
      kind: 'retryable',
      action: 'retry',
    })
  })

  it('drops queued duplicates instead of retrying them', () => {
    expect(planQueueFailure({ status: 409 })).toEqual({
      kind: 'duplicate',
      action: 'drop',
    })
  })

  it('pauses queued processing on auth failure', () => {
    expect(planQueueFailure({ status: 401 })).toEqual({
      kind: 'auth',
      action: 'pause',
    })
  })

  it('drops unrecoverable client errors from the queue', () => {
    expect(planQueueFailure({ status: 422 })).toEqual({
      kind: 'fatal',
      action: 'drop',
    })
  })
})