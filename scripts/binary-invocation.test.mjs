import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getBinaryInvocation,
  getPnpmInvocation
} from './binary-invocation.mjs'

describe('getBinaryInvocation', () => {
  it('runs binaries directly outside Windows', () => {
    assert.deepEqual(
      getBinaryInvocation('pnpm', ['pack'], { platform: 'linux' }),
      {
        arguments_: ['pack'],
        command: 'pnpm',
        windowsVerbatimArguments: false
      }
    )
  })

  it('builds a verbatim cmd invocation on Windows', () => {
    assert.deepEqual(
      getBinaryInvocation(
        'pnpm',
        ['pack', '--json'],
        {
          commandInterpreter: 'C:\\Windows\\System32\\cmd.exe',
          platform: 'win32'
        }
      ),
      {
        arguments_: ['/d', '/s', '/c', '""pnpm" "pack" "--json""'],
        command: 'C:\\Windows\\System32\\cmd.exe',
        windowsVerbatimArguments: true
      }
    )
  })

  it('preserves executable paths with spaces for cmd', () => {
    const invocation = getBinaryInvocation(
      'C:\\Program Files\\commitprompt.cmd',
      ['format'],
      { platform: 'win32' }
    )

    assert.equal(
      invocation.arguments_.at(-1),
      '""C:\\Program Files\\commitprompt.cmd" "format""'
    )
  })
})

describe('getPnpmInvocation', () => {
  it('uses the pnpm command when no active CLI path is available', () => {
    assert.deepEqual(
      getPnpmInvocation(
        ['pack'],
        {
          packageManagerUserAgent: 'npm/11.0.0 node/v22.0.0',
          pnpmCliPath: 'C:\\npm\\bin\\npm-cli.js'
        }
      ),
      {
        arguments_: ['pack'],
        command: 'pnpm'
      }
    )
  })

  it('runs the active pnpm CLI through Node', () => {
    assert.deepEqual(
      getPnpmInvocation(
        ['pack'],
        {
          executablePath: 'C:\\Program Files\\node.exe',
          packageManagerUserAgent: 'pnpm/10.32.1 node/v22.23.1',
          pnpmCliPath: 'C:\\pnpm\\bin\\pnpm.cjs'
        }
      ),
      {
        arguments_: ['C:\\pnpm\\bin\\pnpm.cjs', 'pack'],
        command: 'C:\\Program Files\\node.exe'
      }
    )
  })
})
