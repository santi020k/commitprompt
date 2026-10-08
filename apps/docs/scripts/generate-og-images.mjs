import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createCards } from '@santi020k/og'
import { definePageMetadata } from '@santi020k/og/metadata'
import { definePresetConfig } from '@santi020k/og/presets'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '..')

const pages = [
  definePageMetadata({
    badge: 'Home',
    description: 'A focused, package-manager-neutral Conventional Commits prompt.',
    image: { alt: 'Commitprompt home', output: 'og/pages/index.webp' },
    pathname: '/',
    title: 'Write the commit. Not the syntax.',
    variant: 'product'
  }),
  definePageMetadata({
    badge: 'Docs',
    description: 'Install, configure, and use Commitprompt in any Git repository.',
    image: { alt: 'Commitprompt documentation', output: 'og/pages/docs.webp' },
    pathname: '/docs',
    title: 'Commit with your repository’s rules.',
    variant: 'docs'
  }),
  definePageMetadata({
    badge: 'Not found',
    description: 'Return to the documentation and keep the commit focused.',
    image: { alt: 'Commitprompt page not found', output: 'og/pages/404.webp' },
    pathname: '/404',
    robots: { index: false },
    title: 'This page was not staged.'
  })
]

const cards = createCards(pages, page => ({
  badge: page.badge,
  description: page.description,
  title: page.title,
  variant: page.variant
}), {
  output: page => page.image.output,
  route: page => page.robots?.index === false ?
    undefined :
    {
      alt: page.image.alt,
      description: page.description,
      pathname: page.pathname,
      title: page.title
    }
}).map((card, index) => index === 0 ?
  {
    ...card,
    formatAliases: { png: ['og.png'], svg: ['og.svg'] },
    formats: ['png', 'svg']
  } :
  card)

export default definePresetConfig({
  cards,
  clean: true,
  outputDirectory: 'public',
  routeManifest: { cacheBust: true, file: 'public/og/manifest.json', publicPath: '/' },
  preset: {
    brand: {
      domain: 'commitprompt.santi020k.com',
      logo: 'public/icon.svg',
      name: 'Commitprompt'
    },
    theme: {
      accent: '#f4cf23',
      background: '#09090b',
      foreground: '#f6f4eb',
      muted: '#c7c4bd',
      panel: '#101013'
    }
  },
  root
})
