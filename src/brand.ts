/**
 * Which design system this deployment wears, fixed at build time.
 *
 * One codebase serves two companies: MIK Architecture (meet.mikarch.com) and
 * AGD Developers (meet.agd.homes). Each deployment's wrangler config sets
 * `[define] __BRAND_KIT__ = '"agd"'`; without it (the template, the tests,
 * the MIK deployment) the kit is MIK. A build-time constant rather than an
 * env var because the page CSS, fonts and OG faces are module-level strings
 * built once per isolate, and the bundler can drop the other kit's branches.
 *
 * Kept free of Cloudflare imports so test/core can read it.
 */

declare const __BRAND_KIT__: string | undefined

export type BrandKit = 'mik' | 'agd'

export const BRAND_KIT: BrandKit =
  typeof __BRAND_KIT__ !== 'undefined' && __BRAND_KIT__ === 'agd' ? 'agd' : 'mik'

export const IS_AGD = BRAND_KIT === 'agd'

/** The browser's address-bar tint on mobile. */
export const BRAND_THEME_COLOR = IS_AGD ? '#0c0c0c' : '#038C7F'

/** Favicon and touch icon, under the [assets] directory. */
export const BRAND_FAVICON = IS_AGD ? '/brand/agd/favicon.png' : '/brand/mik/favicon.png'

/** Fonts every page preloads (with font-display:optional, an unpreloaded face is rarely seen). */
export const BRAND_PRELOAD_FONTS: readonly string[] = IS_AGD
  ? ['/fonts/spacegrotesk-latin-wght-normal.woff2']
  : ['/fonts/mulish-latin-wght-normal.woff2', '/fonts/catamaran-latin-wght-normal.woff2']

/** The static link-preview card served when the dynamic one cannot render. */
export const BRAND_DEFAULT_OG = IS_AGD ? '/og/default-agd.png' : '/og/default.png'
