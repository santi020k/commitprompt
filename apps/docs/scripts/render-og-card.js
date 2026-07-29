import sharp from 'sharp'

const escapeHtml = value => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll('\'', '&#39;')

const titleMarkup = lines => lines
  .map((line, index) => `
    <text
      x="70"
      y="${218 + index * 68}"
      fill="${index % 2 === 1 ? '#facc15' : '#f7f5ed'}"
      font-family="Arial, sans-serif"
      font-size="62"
      font-weight="800"
      letter-spacing="-2"
    >${escapeHtml(line)}</text>
  `)
  .join('')

const terminalLines = {
  Docs: [
    ['$', 'pnpm add -D @santi020k/commitprompt'],
    ['›', 'repository rules loaded'],
    ['✓', 'ready to commit']
  ],
  Home: [
    ['›_', 'commitprompt'],
    ['│', 'feat(cli): add repository-aware validation'],
    ['✓', 'commit created']
  ],
  'Not found': [
    ['$', 'git status --short'],
    ['?', 'page was not staged'],
    ['↩', 'return to commitprompt']
  ]
}

const terminalMarkup = type => (terminalLines[type] ?? terminalLines.Home)
  .map(([marker, line], index) => `
    <text
      x="640"
      y="${258 + index * 69}"
      fill="${index === 2 ? '#55d6ad' : '#e8e5dd'}"
      font-family="monospace"
      font-size="${index === 1 ? 16 : 22}"
      font-weight="${index === 0 ? 700 : 500}"
    >
      <tspan fill="${index === 2 ? '#55d6ad' : '#facc15'}">${escapeHtml(marker)}</tspan>
      <tspan dx="14">${escapeHtml(line)}</tspan>
    </text>
  `)
  .join('')

export const createOgCardSvg = ({ description, titleLines, type }) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <radialGradient id="glow" cx="78%" cy="48%" r="58%">
        <stop offset="0%" stop-color="#facc15" stop-opacity="0.3" />
        <stop offset="55%" stop-color="#facc15" stop-opacity="0.08" />
        <stop offset="100%" stop-color="#08080a" stop-opacity="0" />
      </radialGradient>
      <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
        <path d="M56 0H0V56" fill="none" stroke="#facc15" stroke-opacity="0.1" />
      </pattern>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.7" />
      </filter>
    </defs>

    <rect width="1200" height="630" fill="#08080a" />
    <rect width="1200" height="630" fill="url(#glow)" />
    <rect x="560" width="640" height="630" fill="url(#grid)" />

    <text x="70" y="114" fill="#f7f5ed" font-family="monospace" font-size="38" font-weight="700">
      commit<tspan fill="#facc15">prompt</tspan>
    </text>
    <rect x="70" y="143" width="96" height="4" rx="2" fill="#facc15" />
    ${titleMarkup(titleLines)}
    <text x="72" y="548" fill="#aaa69b" font-family="Arial, sans-serif" font-size="20">
      ${escapeHtml(description)}
    </text>
    <text x="72" y="584" fill="#6f6c65" font-family="monospace" font-size="16">
      commitprompt.santi020k.com
    </text>

    <g filter="url(#shadow)">
      <rect
        x="580" y="154" width="550" height="326" rx="22"
        fill="#0d0d10" stroke="#facc15" stroke-opacity="0.78" stroke-width="2"
      />
      <rect x="580" y="154" width="550" height="58" rx="22" fill="#121215" />
      <path d="M580 190V176a22 22 0 0 1 22-22h506a22 22 0 0 1 22 22v14z" fill="#121215" />
      <circle cx="615" cy="183" r="9" fill="#f15b5b" />
      <circle cx="646" cy="183" r="9" fill="#f4c64e" />
      <circle cx="677" cy="183" r="9" fill="#67c77a" />
      <text
        x="855" y="189" fill="#77736c" font-family="monospace"
        font-size="14" text-anchor="middle"
      >${escapeHtml(type)}</text>
      ${terminalMarkup(type)}
    </g>
  </svg>
`.trim()

export const renderOgCard = async props => {
  const svg = Buffer.from(createOgCardSvg(props))

  return sharp(svg).webp({ effort: 4, quality: 84 }).toBuffer()
}

export const renderOgCardPng = async props => {
  const svg = Buffer.from(createOgCardSvg(props))

  return sharp(svg).png({ compressionLevel: 9 }).toBuffer()
}
