const DEFAULT_ATTEMPTS = 6
const DEFAULT_INITIAL_DELAY_MS = 2_000

export const resolveVerificationAttempts = rawValue => {
  if (rawValue === undefined) return DEFAULT_ATTEMPTS

  const attempts = Number(rawValue)

  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error(
      'NPM_VERIFY_ATTEMPTS must be a positive integer, received ' +
      `${JSON.stringify(rawValue)}.`
    )
  }

  return attempts
}

export const resolveVerificationInitialDelayMs = rawValue => {
  if (rawValue === undefined) return DEFAULT_INITIAL_DELAY_MS

  const initialDelay = Number(rawValue)

  if (!Number.isFinite(initialDelay) || initialDelay < 0) {
    throw new Error(
      'NPM_VERIFY_DELAY_MS must be a nonnegative finite number, received ' +
      `${JSON.stringify(rawValue)}.`
    )
  }

  return initialDelay
}
