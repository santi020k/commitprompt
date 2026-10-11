const DEFAULT_ATTEMPTS = 6
const DEFAULT_INITIAL_DELAY_MS = 2_000
const MAX_TIMER_DELAY_MS = 2_147_483_647

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

export const resolveVerificationInitialDelayMs = (
  rawValue,
  attempts = DEFAULT_ATTEMPTS
) => {
  const initialDelay = rawValue === undefined
    ? DEFAULT_INITIAL_DELAY_MS
    : Number(rawValue)

  if (!Number.isFinite(initialDelay) || initialDelay < 0) {
    throw new Error(
      'NPM_VERIFY_DELAY_MS must be a nonnegative finite number, received ' +
      `${JSON.stringify(rawValue)}.`
    )
  }

  const maximumDelay = initialDelay * Math.max(1, attempts - 1)

  if (maximumDelay > MAX_TIMER_DELAY_MS) {
    throw new Error(
      'NPM_VERIFY_DELAY_MS and NPM_VERIFY_ATTEMPTS must keep every retry ' +
      `delay at or below ${MAX_TIMER_DELAY_MS}ms.`
    )
  }

  return initialDelay
}
