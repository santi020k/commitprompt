import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createOgCardSvg,
  renderOgCard,
  renderOgCardPng
} from './render-og-card.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '..')
const outputDirectory = path.join(root, 'public', 'og', 'pages')

const cards = [
  {
    description: 'A focused, package-manager-neutral Conventional Commits prompt.',
    pathname: '/',
    titleLines: ['Write the', 'commit.', 'Not the', 'syntax.'],
    type: 'Home'
  },
  {
    description: 'Install, configure, and use Commitprompt in any Git repository.',
    pathname: '/docs',
    titleLines: ['Commit with', 'your repository’s', 'rules.'],
    type: 'Docs'
  },
  {
    description: 'Return to the documentation and keep the commit focused.',
    pathname: '/404',
    titleLines: ['This page was', 'not staged.'],
    type: 'Not found'
  }
]

const getSlug = pathname => pathname.replaceAll(/^\/+|\/+$/g, '').replaceAll('/', '--') || 'index'

await mkdir(outputDirectory, { recursive: true })

await Promise.all(cards.map(async card => {
  const outputPath = path.join(outputDirectory, `${getSlug(card.pathname)}.webp`)
  const image = await renderOgCard(card)

  await writeFile(outputPath, image)

  process.stdout.write(`  write ${path.relative(root, outputPath)}\n`)
}))

const homeCard = cards[0]

const [homePng] = await Promise.all([
  renderOgCardPng(homeCard),
  writeFile(path.join(root, 'public', 'og.svg'), `${createOgCardSvg(homeCard)}\n`)
])

await writeFile(path.join(root, 'public', 'og.png'), homePng)

process.stdout.write(`Generated ${cards.length} Commitprompt Open Graph images (1200×630).\n`)
