/**
 * The satori element tree for a booking page's dynamic OG card.
 *
 * Pure and Cloudflare-free on purpose — it is exercised in `test/core` without
 * satori or the wasm runtime, so the "what does the card actually say" logic
 * is checkable in milliseconds rather than only under `test/workers`.
 *
 * satori takes React-element-like plain objects (no JSX transpiler is wired
 * up for this package, and pulling in `react` as a runtime dependency just
 * for OG rendering is not worth it) — see satori's "Use without JSX" mode.
 */

import { IS_AGD } from '../../brand.js'
import { AGD_LOGO_ASPECT, agdLogoDataUri } from './logo-agd.js'
import { PATTERN_SCALE, PATTERN_TILE_HEIGHT, PATTERN_TILE_WIDTH, patternTileDataUri } from './pattern.js'

// Loose enough to avoid depending on satori's own (React-typed) element
// shape here; render.ts hands this straight to `satori()`, which is where it
// actually gets checked against satori's types.
export interface OgElement {
  type: string
  props: { children?: OgElement | OgElement[] | string; style?: Record<string, string | number>; [key: string]: unknown }
}

/** One face on the card: a PNG data URI when the host uploaded a photo, else an initial on the main green. */
export interface OgAvatar {
  src?: string
  initial: string
  /** Width over height of an uncropped logo; absent = a square crop shown round. */
  aspect?: number
}

export interface OgCardProps {
  /** "Book {duration} min" — already formatted, so card.ts has no duration/pluralisation policy of its own. */
  titleLine: string
  /** "with {host}" / "with Alice, Bob and Carol" / "with the Support team" */
  subtitleLine: string
  /** e.g. "10:30 GMT+3" */
  timeLabel: string
  brandName: string
  /**
   * Who the meeting is with, as faces: one for a personal event type, up
   * to three for a team's. Empty renders the text-only card.
   */
  avatars?: OgAvatar[]
  /** Hosts beyond the three shown, as a "+N" disc after the stack. */
  extraCount?: number
}

/** Personal: one large face. Team: a stack of up to three, overlapping, plus the "+N" disc. */
const SINGLE_SIZE = 220
const STACK_SIZE = 132

function avatarNode(a: OgAvatar, size: number, overlap = 0): OgElement {
  const ring = { border: `6px solid ${GROUND}`, borderRadius: '50%' }
  if (a.src && a.aspect) {
    // A logo in its own proportions: height-aligned, width from the
    // aspect, capped so a banner stays inside the card, square corners
    // (the design system's radius) rather than a circle.
    const width = Math.min(Math.round(size * a.aspect), 720)
    return {
      type: 'img',
      props: { src: a.src, width, height: size, style: { width: `${width}px`, height: `${size}px`, objectFit: 'contain', borderRadius: '2px' } },
    }
  }
  if (a.src) {
    return {
      type: 'img',
      props: {
        src: a.src,
        width: size,
        height: size,
        style: { ...ring, width: `${size}px`, height: `${size}px`, objectFit: 'cover', marginLeft: `${-overlap}px` },
      },
    }
  }
  return {
    type: 'div',
    props: {
      style: {
        ...ring,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        marginLeft: `${-overlap}px`,
        backgroundColor: MIK_GREEN,
        color: INITIAL_TEXT,
        fontFamily: DISPLAY,
        fontSize: `${Math.round(size * 0.42)}px`,
        fontWeight: TITLE_WEIGHT,
      },
      children: a.initial,
    },
  }
}

function avatarsNode(avatars: OgAvatar[], extraCount: number): OgElement {
  if (avatars.length === 1 && extraCount === 0) {
    return { type: 'div', props: { style: { display: 'flex' }, children: [avatarNode(avatars[0]!, SINGLE_SIZE)] } }
  }
  const faces = avatars.slice(0, 3).map((a, i) => avatarNode(a, STACK_SIZE, i === 0 ? 0 : 28))
  if (extraCount > 0) {
    faces.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: `${STACK_SIZE}px`,
          height: `${STACK_SIZE}px`,
          marginLeft: '-28px',
          borderRadius: '50%',
          border: `6px solid ${GROUND}`,
          backgroundColor: MIK_BLACK,
          color: WHITE,
          fontFamily: DISPLAY,
          fontSize: '44px',
          fontWeight: TITLE_WEIGHT,
        },
        children: `+${extraCount}`,
      },
    })
  }
  return { type: 'div', props: { style: { display: 'flex', alignItems: 'center' }, children: faces } }
}

// MIK customization: the MIK Architecture design system's brand page --
// surface-brand (mik-green-dark) with white headlines, the closing phrase in
// mik-green-light and mist for the small print.
// MIK customization: mik-black under the cube pattern (pattern.ts).
// AGD (src/brand.ts): its design system's black frame with no pattern, the
// closing phrase in accent-mint the way its one dark card titles in mint,
// silver (grey-300) for the small print, faces on mint with black initials.
const GROUND = IS_AGD ? '#0c0c0c' : '#221F1F'
const WHITE = '#FFFFFF'
const ACCENT = IS_AGD ? '#AEEEEE' : '#A9D9D0'
const MIST = IS_AGD ? '#C4C4C4' : '#DDEEEA'
const MIK_GREEN = IS_AGD ? '#AEEEEE' : '#038C7F'
const MIK_BLACK = IS_AGD ? '#2a2a2a' : '#221F1F'
const INITIAL_TEXT = IS_AGD ? '#0c0c0c' : WHITE

const DISPLAY = IS_AGD ? 'Space Grotesk' : 'Catamaran'
const BASELINE_NUDGE = 3
const BODY = IS_AGD ? 'Space Grotesk' : 'Mulish'
/** Display weight: AGD sets its titles at 500 with negative tracking. */
const TITLE_WEIGHT = IS_AGD ? 500 : 600
const TITLE_TRACKING = IS_AGD ? '-0.025em' : '0'

/** Longer host/event combinations still fit at 1200x630 without overflowing satori's layout. */
function titleFontSize(titleLine: string, subtitleLine: string): number {
  const longest = Math.max(titleLine.length, subtitleLine.length)
  if (longest <= 16) return 76
  if (longest <= 24) return 60
  return 48
}

export function buildOgCard(props: OgCardProps): OgElement {
  const fontSize = titleFontSize(props.titleLine, props.subtitleLine)
  const avatars = props.avatars ?? []
  const faces = avatars.length > 0 ? [avatarsNode(avatars, props.extraCount ?? 0)] : []

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '1200px',
        height: '630px',
        backgroundColor: GROUND,
        ...(IS_AGD
          ? {}
          : {
              backgroundImage: `url(${patternTileDataUri()})`,
              backgroundSize: `${PATTERN_TILE_WIDTH * PATTERN_SCALE}px ${PATTERN_TILE_HEIGHT * PATTERN_SCALE}px`,
              backgroundRepeat: 'repeat',
            }),
        padding: '64px',
        fontFamily: DISPLAY,
      },
      children: [
        lockup(props.brandName),
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 1,
              justifyContent: 'center',
              gap: '12px',
            },
            children: [
              ...faces,
              {
                type: 'div',
                props: {
                  style: { display: 'flex', color: WHITE, fontSize: `${fontSize}px`, lineHeight: 1.05, fontWeight: TITLE_WEIGHT, letterSpacing: TITLE_TRACKING },
                  children: props.titleLine,
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', color: ACCENT, fontSize: `${fontSize}px`, lineHeight: 1.05, fontWeight: TITLE_WEIGHT, letterSpacing: TITLE_TRACKING },
                  children: props.subtitleLine,
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              color: MIST,
              fontFamily: BODY,
              fontSize: '30px',
              fontWeight: IS_AGD ? 400 : 500,
            },
            children: props.timeLabel,
          },
        },
      ],
    },
  }
}

/**
 * MIK customization: the design system's text-only logo in white, replacing
 * the `punctual:` wordmark. The first word in Mulish Bold, the rest in
 * Catamaran Regular a hair larger so the cap heights meet, uppercase, on one
 * baseline -- the same build as the emails' header (email-templates.ts).
 */
function lockup(brandName: string): OgElement {
  // AGD: its white horizontal logo, the version its design system gives
  // headers on black; never retyped.
  if (IS_AGD) {
    const height = 56
    const width = Math.round(height * AGD_LOGO_ASPECT)
    return {
      type: 'img',
      props: { src: agdLogoDataUri(), width, height, style: { width: `${width}px`, height: `${height}px` } },
    }
  }
  const [first = '', ...rest] = brandName.trim().split(/\s+/)
  const children: OgElement[] = [
    { type: 'span', props: { style: { fontFamily: BODY, fontWeight: 700, fontSize: '28px', lineHeight: 1 }, children: first.toUpperCase() } },
  ]
  if (rest.length > 0) {
    children.push({
      type: 'span',
      props: {
        // satori lines up the two spans' boxes, not their baselines, and
        // Catamaran's tall vertical metrics would ride it high; the nudge
        // puts both words back on one baseline.
        style: { fontFamily: DISPLAY, fontWeight: 400, fontSize: '29px', lineHeight: 1, letterSpacing: '0.04em', marginLeft: '10px', position: 'relative', top: `${BASELINE_NUDGE}px` },
        children: rest.join(' ').toUpperCase(),
      },
    })
  }
  return { type: 'div', props: { style: { display: 'flex', alignItems: 'flex-end', color: WHITE }, children } }
}
