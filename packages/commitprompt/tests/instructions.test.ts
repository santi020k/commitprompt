import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

import {
  AGENT_SKILL_TEMPLATE,
  PROJECT_INSTRUCTION_SECTION
} from '../src/instructions.js'

describe('published instruction templates', () => {
  test('stay synchronized with the canonical generated content', async () => {
    const normalizeNewlines = (value: string) => value.replace(/\r\n/g, '\n')
    const agents = normalizeNewlines(await readFile(
      new URL('../templates/AGENTS.md', import.meta.url), 'utf8'
    ))
    const copilot = normalizeNewlines(await readFile(
      new URL('../templates/copilot-instructions.md', import.meta.url), 'utf8'
    ))
    const skill = normalizeNewlines(await readFile(
      new URL(
        '../templates/skills/commitprompt/SKILL.md', import.meta.url
      ), 'utf8'
    ))

    expect(agents).toBe(`${PROJECT_INSTRUCTION_SECTION}\n`)
    expect(copilot).toBe(`${PROJECT_INSTRUCTION_SECTION}\n`)
    expect(skill).toBe(AGENT_SKILL_TEMPLATE)
  })
})
