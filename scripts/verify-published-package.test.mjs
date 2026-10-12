import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { afterEach, describe, it } from 'node:test'

import {
  resolveVerificationAttempts,
  resolveVerificationInitialDelayMs
} from './release-verification-settings.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')

const scriptPath = resolve(
  repositoryRoot, 'scripts/verify-published-package.mjs'
)

describe('resolveVerificationAttempts', () => {
  it('defaults to six attempts when unset', () => {
    assert.equal(resolveVerificationAttempts(undefined), 6)
  })

  it('accepts a positive integer override', () => {
    assert.equal(resolveVerificationAttempts('3'), 3)
  })

  for (const invalidValue of ['0', '-1', 'abc', '', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
    it(`rejects ${JSON.stringify(invalidValue)}`, () => {
      assert.throws(
        () => resolveVerificationAttempts(invalidValue),
        /NPM_VERIFY_ATTEMPTS must be a positive integer/u
      )
    })
  }
})

describe('resolveVerificationInitialDelayMs', () => {
  it('defaults to two thousand milliseconds when unset', () => {
    assert.equal(resolveVerificationInitialDelayMs(undefined), 2_000)
  })

  it('accepts a nonnegative override, including zero', () => {
    assert.equal(resolveVerificationInitialDelayMs('0'), 0)

    assert.equal(resolveVerificationInitialDelayMs('1500'), 1_500)

    assert.equal(resolveVerificationInitialDelayMs('0.5'), 0.5)
  })

  for (const invalidValue of ['-1', 'abc', 'NaN', 'Infinity']) {
    it(`rejects ${JSON.stringify(invalidValue)}`, () => {
      assert.throws(
        () => resolveVerificationInitialDelayMs(invalidValue),
        /NPM_VERIFY_DELAY_MS must be a nonnegative finite number/u
      )
    })
  }

  it('accepts the timer limit for the final scheduled retry', () => {
    assert.equal(resolveVerificationInitialDelayMs('2147483647', 2), 2_147_483_647)

    assert.equal(resolveVerificationInitialDelayMs('1073741823.5', 3), 1_073_741_823.5)
  })

  it('rejects a delay above the timer limit even without retries', () => {
    assert.throws(
      () => resolveVerificationInitialDelayMs('2147483648', 1),
      /keep every retry delay at or below 2147483647ms/u
    )
  })

  it('rejects overflow caused by retry multiplication', () => {
    assert.throws(
      () => resolveVerificationInitialDelayMs('1073741824', 3),
      /keep every retry delay at or below 2147483647ms/u
    )
  })

  it('validates the default delay against the configured attempts', () => {
    assert.throws(
      () => resolveVerificationInitialDelayMs(undefined, 1_073_743),
      /keep every retry delay at or below 2147483647ms/u
    )
  })

  it('accepts zero delay for every valid attempt count', () => {
    assert.equal(resolveVerificationInitialDelayMs('0', Number.MAX_SAFE_INTEGER), 0)
  })

  it('treats an empty string as zero, a valid nonnegative delay', () => {
    assert.equal(resolveVerificationInitialDelayMs(''), 0)
  })
})

describe('verify-published-package.mjs CLI behavior', () => {
  const emptyPathDirectories = []

  afterEach(() => {
    while (emptyPathDirectories.length > 0) {
      rmSync(emptyPathDirectories.pop(), { force: true, recursive: true })
    }
  })

  const runScript = environmentOverrides => {
    const emptyPathDirectory = mkdtempSync(
      join(tmpdir(), 'commitprompt-verify-path-')
    )

    emptyPathDirectories.push(emptyPathDirectory)

    return spawnSync(
      process.execPath,
      [scriptPath],
      {
        encoding: 'utf8',
        timeout: 5_000,
        env: {
          ...process.env,
          PACKAGE_NAME: 'commitprompt-verify-test',
          PACKAGE_VERSION: '1.2.3',
          NPM_VERIFY_ATTEMPTS: '1',
          NPM_VERIFY_DELAY_MS: '0',
          PATH: emptyPathDirectory,
          ...environmentOverrides
        }
      }
    )
  }

  for (const invalidAttempts of ['0', '-1', 'abc', '', '1.5']) {
    it(
      'fails immediately without invoking npm for ' +
      `NPM_VERIFY_ATTEMPTS=${JSON.stringify(invalidAttempts)}`,
      () => {
        const result = runScript({ NPM_VERIFY_ATTEMPTS: invalidAttempts })

        assert.notEqual(result.status, 0)

        assert.match(
          result.stderr,
          /NPM_VERIFY_ATTEMPTS must be a positive integer/u
        )

        assert.doesNotMatch(result.stderr, /ENOENT/u)

        assert.doesNotMatch(result.stderr, /retrying in/u)
      }
    )
  }

  for (const invalidDelay of ['-1', 'abc', 'NaN']) {
    it(
      'fails immediately without invoking npm for ' +
      `NPM_VERIFY_DELAY_MS=${JSON.stringify(invalidDelay)}`,
      () => {
        const result = runScript({ NPM_VERIFY_DELAY_MS: invalidDelay })

        assert.notEqual(result.status, 0)

        assert.match(
          result.stderr,
          /NPM_VERIFY_DELAY_MS must be a nonnegative finite number/u
        )

        assert.doesNotMatch(result.stderr, /ENOENT/u)

        assert.doesNotMatch(result.stderr, /retrying in/u)
      }
    )
  }

  for (const retrySettings of [
    { NPM_VERIFY_DELAY_MS: '2147483648' },
    { NPM_VERIFY_ATTEMPTS: '3', NPM_VERIFY_DELAY_MS: '1073741824' },
    { NPM_VERIFY_ATTEMPTS: '1073743', NPM_VERIFY_DELAY_MS: undefined }
  ]) {
    it(`rejects timer overflow before invoking npm: ${JSON.stringify(retrySettings)}`, () => {
      const result = runScript(retrySettings)

      assert.notEqual(result.status, 0)

      assert.match(result.stderr, /keep every retry delay at or below 2147483647ms/u)

      assert.doesNotMatch(result.stderr, /ENOENT|retrying in|TimeoutOverflowWarning/u)
    })
  }

  it('treats an empty NPM_VERIFY_DELAY_MS as a valid zero-millisecond delay', () => {
    const result = runScript({
      NPM_VERIFY_ATTEMPTS: '2',
      NPM_VERIFY_DELAY_MS: ''
    })

    assert.notEqual(result.status, 0)

    assert.doesNotMatch(
      result.stderr,
      /NPM_VERIFY_DELAY_MS must be a nonnegative finite number/u
    )

    assert.match(result.stderr, /retrying in 0ms/u)

    assert.match(result.stderr, /ENOENT/u)
  })

  it('requires a package name and version before validating retry settings', () => {
    const result = runScript({
      NPM_VERIFY_ATTEMPTS: '0',
      PACKAGE_NAME: ''
    })

    assert.notEqual(result.status, 0)

    assert.match(
      result.stderr,
      /A package name and version are required for verification\./u
    )
  })

  it('runs the full retry loop for a valid configuration', () => {
    const result = runScript({
      NPM_VERIFY_ATTEMPTS: '3',
      NPM_VERIFY_DELAY_MS: '0'
    })

    assert.notEqual(result.status, 0)

    assert.doesNotMatch(
      result.stderr,
      /NPM_VERIFY_ATTEMPTS must be a positive integer/u
    )

    assert.doesNotMatch(
      result.stderr,
      /NPM_VERIFY_DELAY_MS must be a nonnegative finite number/u
    )

    const retryMessages = result.stderr.match(/retrying in \d+ms/gu) ?? []

    assert.equal(retryMessages.length, 2)

    assert.match(result.stderr, /ENOENT/u)
  })
})
