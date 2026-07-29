const defaultSiteUrl = 'https://commitprompt.santi020k.com/'

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const getSocialImageSlug = (pathname: string) => pathname
  .replaceAll(/^\/+|\/+$/g, '')
  .split('/')
  .filter(Boolean)
  .map(segment => encodeURIComponent(safeDecodeURIComponent(segment)).replaceAll('%', '~'))
  .join('--')

export const getSocialImagePath = (pathname: string) => {
  const slug = getSocialImageSlug(pathname)

  return `/og/pages/${slug || 'index'}.webp`
}

export const getSocialImageUrl = (
  pathname: string,
  baseUrl: string | URL | undefined,
  overridePath?: string
) => new URL(overridePath ?? getSocialImagePath(pathname), baseUrl ?? defaultSiteUrl).href
