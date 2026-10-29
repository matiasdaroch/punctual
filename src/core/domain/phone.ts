/**
 * The phone-number question: a country calling code picked from a list, and
 * the number typed beside it, stored together as one answer — `+1 786 708
 * 0880` — so every consumer that already shows an answer as text (emails,
 * the calendar description, webhooks) shows it right with no change.
 *
 * Validation is deliberately loose: E.164 allows up to 15 digits including
 * the country code, and local formatting (spaces, dashes, brackets) is the
 * guest's business. A stricter, per-country check rejects real numbers.
 */

export interface CallingCode {
  /** ISO 3166-1 alpha-2, which keeps two countries sharing +1 or +7 apart. */
  iso: string
  name: string
  /** Digits only, no `+`. */
  code: string
}

/** The United States first (the default), then alphabetical by name. */
export const CALLING_CODES: readonly CallingCode[] = [
  { iso: 'US', name: 'United States', code: '1' },
  { iso: 'AR', name: 'Argentina', code: '54' },
  { iso: 'AU', name: 'Australia', code: '61' },
  { iso: 'AT', name: 'Austria', code: '43' },
  { iso: 'BS', name: 'Bahamas', code: '1' },
  { iso: 'BE', name: 'Belgium', code: '32' },
  { iso: 'BO', name: 'Bolivia', code: '591' },
  { iso: 'BR', name: 'Brazil', code: '55' },
  { iso: 'CA', name: 'Canada', code: '1' },
  { iso: 'CL', name: 'Chile', code: '56' },
  { iso: 'CN', name: 'China', code: '86' },
  { iso: 'CO', name: 'Colombia', code: '57' },
  { iso: 'CR', name: 'Costa Rica', code: '506' },
  { iso: 'CU', name: 'Cuba', code: '53' },
  { iso: 'DK', name: 'Denmark', code: '45' },
  { iso: 'DO', name: 'Dominican Republic', code: '1' },
  { iso: 'EC', name: 'Ecuador', code: '593' },
  { iso: 'SV', name: 'El Salvador', code: '503' },
  { iso: 'FR', name: 'France', code: '33' },
  { iso: 'DE', name: 'Germany', code: '49' },
  { iso: 'GR', name: 'Greece', code: '30' },
  { iso: 'GT', name: 'Guatemala', code: '502' },
  { iso: 'HT', name: 'Haiti', code: '509' },
  { iso: 'HN', name: 'Honduras', code: '504' },
  { iso: 'IN', name: 'India', code: '91' },
  { iso: 'IE', name: 'Ireland', code: '353' },
  { iso: 'IL', name: 'Israel', code: '972' },
  { iso: 'IT', name: 'Italy', code: '39' },
  { iso: 'JM', name: 'Jamaica', code: '1' },
  { iso: 'JP', name: 'Japan', code: '81' },
  { iso: 'MX', name: 'Mexico', code: '52' },
  { iso: 'NL', name: 'Netherlands', code: '31' },
  { iso: 'NI', name: 'Nicaragua', code: '505' },
  { iso: 'NO', name: 'Norway', code: '47' },
  { iso: 'PA', name: 'Panama', code: '507' },
  { iso: 'PY', name: 'Paraguay', code: '595' },
  { iso: 'PE', name: 'Peru', code: '51' },
  { iso: 'PL', name: 'Poland', code: '48' },
  { iso: 'PT', name: 'Portugal', code: '351' },
  { iso: 'PR', name: 'Puerto Rico', code: '1' },
  { iso: 'RU', name: 'Russia', code: '7' },
  { iso: 'SA', name: 'Saudi Arabia', code: '966' },
  { iso: 'ZA', name: 'South Africa', code: '27' },
  { iso: 'KR', name: 'South Korea', code: '82' },
  { iso: 'ES', name: 'Spain', code: '34' },
  { iso: 'SE', name: 'Sweden', code: '46' },
  { iso: 'CH', name: 'Switzerland', code: '41' },
  { iso: 'TT', name: 'Trinidad and Tobago', code: '1' },
  { iso: 'TR', name: 'Turkey', code: '90' },
  { iso: 'AE', name: 'United Arab Emirates', code: '971' },
  { iso: 'GB', name: 'United Kingdom', code: '44' },
  { iso: 'UY', name: 'Uruguay', code: '598' },
  { iso: 'VE', name: 'Venezuela', code: '58' },
]

const BY_ISO = new Map(CALLING_CODES.map((c) => [c.iso, c]))

/**
 * One stored answer from the two fields: `+<code> <number>`. The form posts
 * the country's ISO code (two countries can share a calling code, and the
 * select must come back on the one the guest picked). Empty when no number
 * was typed, so an optional question left blank stays blank.
 */
export function joinPhone(iso: string, number: string): string {
  const typed = number.trim()
  if (typed === '') return ''
  // A guest who typed the full international number keeps it as typed.
  if (typed.startsWith('+')) return typed
  const country = BY_ISO.get(iso.toUpperCase()) ?? CALLING_CODES[0]!
  return `+${country.code} ${typed}`
}

/**
 * A stored answer back into the two fields, for refilling the form. The
 * country is the first in the list with a matching code (the US for +1),
 * which is right unless the guest picked another +1 country — and the
 * number is shown either way.
 */
export function splitPhone(value: string): { iso: string; number: string } {
  const m = /^\+(\d{1,4})\s+(.*)$/.exec(value.trim())
  if (m) {
    const country = CALLING_CODES.find((c) => c.code === m[1])
    if (country) return { iso: country.iso, number: m[2]! }
  }
  return { iso: CALLING_CODES[0]!.iso, number: value.trim() }
}

/** 6 to 15 digits in all, the code included, and nothing but digits, spaces and `+-.()`. */
export function isValidPhone(value: string): boolean {
  if (!/^\+?[\d\s\-.()]+$/.test(value.trim())) return false
  const digits = value.replace(/\D/g, '').length
  return digits >= 6 && digits <= 15
}
