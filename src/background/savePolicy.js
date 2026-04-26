export function classifySaveError(error) {
  const status = Number(error?.status)

  if (status === 409) return 'duplicate'
  if (status === 401) return 'auth'
  if (status === 403) return 'entitlement'
  // 410 Gone: the target account was soft-deleted by the inactivity sweeper
  // (ACCOUNT_INACTIVITY_DELETED). Retrying will never succeed — drop the op.
  if (status === 410) return 'gone'
  if (status === 429) return 'retryable'
  if (!status || status >= 500) return 'retryable'

  return 'fatal'
}

export function planBackgroundSaveFailure(error) {
  const kind = classifySaveError(error)

  switch (kind) {
    case 'duplicate':
      return { kind, queue: false }
    case 'auth':
      return { kind, queue: true }
    case 'entitlement':
      return { kind, queue: false }
    case 'gone':
      return { kind, queue: false }
    case 'retryable':
      return { kind, queue: true }
    default:
      return { kind, queue: false }
  }
}

export function planQueueFailure(error) {
  const kind = classifySaveError(error)

  switch (kind) {
    case 'duplicate':
      return { kind, action: 'drop' }
    case 'auth':
      return { kind, action: 'pause' }
    case 'entitlement':
      return { kind, action: 'drop' }
    case 'gone':
      return { kind, action: 'drop' }
    case 'retryable':
      return { kind, action: 'retry' }
    default:
      return { kind, action: 'drop' }
  }
}