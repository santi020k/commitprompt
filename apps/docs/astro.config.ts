import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [sitemap()],
  site: process.env.PUBLIC_SITE_URL ?? 'https://commitprompt.santi020k.com'
})
