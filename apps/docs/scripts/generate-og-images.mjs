import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPathCards } from '@santi020k/og'
import { definePresetConfig } from '@santi020k/og/presets'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '..')

const pages = [
  {
    data: {
      badge: 'Home',
      description: 'A focused, package-manager-neutral Conventional Commits prompt.',
      title: 'Write the commit. Not the syntax.',
      variant: 'product'
    },
    pathname: '/'
  },
  {
    data: {
      badge: 'Docs',
      description: 'Install, configure, and use Commitprompt in any Git repository.',
      title: 'Commit with your repository’s rules.',
      variant: 'docs'
    },
    pathname: '/docs'
  },
  {
    data: {
      badge: 'Not found',
      description: 'Return to the documentation and keep the commit focused.',
      title: 'This page was not staged.'
    },
    pathname: '/404'
  }
]

const home = pages[0].data

export default definePresetConfig({
  cards: [
    ...createPathCards(pages, { directory: 'og/pages' }),
    { data: home, output: 'og.png' },
    { data: home, output: 'og.svg' }
  ],
  clean: true,
  outputDirectory: 'public',
  preset: {
    brand: { domain: 'commitprompt.santi020k.com', name: 'Commitprompt' },
    theme: { accent: '#945df4', background: '#100b18', panel: '#20162d' }
  },
  root
})
