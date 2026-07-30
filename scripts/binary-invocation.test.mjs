import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getBinaryInvocation } from './binary-invocation.mjs'

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
