/**
 * Guest-chosen duration and location.
 *
 * An event type offers a default duration and location, and optionally
 * further ones the guest picks between. Rather than teach the slot engine,
 * the coordinator, calendar sync and every email about choices, a choice is
 * applied up front: `withDuration` / `withLocation` return the event type AS
 * IF it had been configured that way, and everything downstream runs on
 * that unchanged. A stored booking carries its own choice, and `forBooking`
 * re-applies it wherever a booking is paired with its event type again.
 *
 * The slot grid stays the BASE event type's: `withDuration` pins
 * `slotIntervalMinutes` to what it resolved to before the override, so a
 * 90-minute pick on a 30-minute event type still offers a start every 30
 * minutes, and the page and the coordinator agree on which starts exist.
 */

import type { Booking, EventType, LocationOption, LocationType } from './types.js'

export const MAX_DURATION_OPTIONS = 8
export const MAX_LOCATION_OPTIONS = 6

/** Every duration a guest may pick, ascending, the default included. */
export function durationChoices(et: EventType): number[] {
  return [...new Set([et.durationMinutes, ...(et.durationOptions ?? [])])].sort((a, b) => a - b)
}

/** Every location a guest may pick, the default first. */
export function locationChoices(et: EventType): LocationOption[] {
  const all: LocationOption[] =
    et.locationOptions && et.locationOptions.length > 0
      ? et.locationOptions
      : [{ type: et.locationType, value: et.locationValue }]
  const seen = new Set<string>()
  return all.filter((o) => {
    const key = `${o.type}\u0000${o.value ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** A phone or in-person option with nothing set: the guest gives the number or the address. */
export function guestSupplies(option: LocationOption): boolean {
  return (option.type === 'phone' || option.type === 'in_person') && !option.value
}

/**
 * The event type as if `minutes` were its duration, on its own slot grid.
 * The other lengths stay on offer, the original default among them, so a
 * picker drawn from the result still lists every one.
 */
export function withDuration(et: EventType, minutes: number): EventType {
  if (minutes === et.durationMinutes) return et
  return {
    ...et,
    durationMinutes: minutes,
    durationOptions: durationChoices(et),
    slotIntervalMinutes: et.slotIntervalMinutes ?? et.durationMinutes,
  }
}

/** The event type as if `option` were its only location. */
export function withLocation(et: EventType, option: LocationOption): EventType {
  return { ...et, locationType: option.type, locationValue: option.value, locationOptions: [] }
}

/**
 * The event type as this booking used it: the booking's own length and, when
 * the guest chose one, its location. Takes and returns null so it wraps a
 * repository lookup directly.
 */
export function forBooking(et: EventType, booking: Booking): EventType
export function forBooking(et: EventType | null, booking: Booking): EventType | null
export function forBooking(et: EventType | null, booking: Booking): EventType | null {
  if (!et) return null
  const minutes = Math.round((booking.endUtc - booking.startUtc) / 60_000)
  let out = minutes > 0 ? withDuration(et, minutes) : et
  if (booking.locationType) out = withLocation(out, { type: booking.locationType, value: booking.locationValue ?? null })
  return out
}

/** The duration a `?duration=` value asks for, when the event type offers it; the default otherwise. */
export function pickDuration(et: EventType, raw: string | null | undefined): number {
  const n = Number(String(raw ?? '').replace(/\s*(m|min|mins|minutes)$/i, ''))
  return Number.isInteger(n) && durationChoices(et).includes(n) ? n : et.durationMinutes
}

const LOCATION_ALIASES: Record<string, LocationType> = {
  meet: 'google_meet',
  google_meet: 'google_meet',
  'google-meet': 'google_meet',
  video: 'google_meet',
  link: 'custom_link',
  custom_link: 'custom_link',
  'custom-link': 'custom_link',
  online: 'custom_link',
  phone: 'phone',
  call: 'phone',
  in_person: 'in_person',
  'in-person': 'in_person',
  inperson: 'in_person',
  person: 'in_person',
}

/**
 * Which location a `?location=` value asks for, as an index into
 * `locationChoices`: a 1-based position (`2`), or a kind (`meet`, `phone`,
 * `in-person`, `link`), which takes the first option of that kind. Null when
 * the value matches nothing on offer, so the caller falls back to letting
 * the guest choose.
 */
export function pickLocation(et: EventType, raw: string | null | undefined): number | null {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === '') return null
  const choices = locationChoices(et)
  if (/^\d+$/.test(value)) {
    const i = Number(value) - 1
    return i >= 0 && i < choices.length ? i : null
  }
  const type = LOCATION_ALIASES[value.replace(/\s+/g, '-')]
  if (!type) return null
  const i = choices.findIndex((o) => o.type === type)
  return i === -1 ? null : i
}

/** The short name a picker shows for an option: the host's label, else one from the kind and details. */
export function locationOptionLabel(option: LocationOption): string {
  if (option.label) return option.label
  switch (option.type) {
    case 'google_meet':
      return 'Google Meet'
    case 'custom_link':
      return option.value ? 'Video call' : 'Online'
    case 'phone':
      return option.value ? `Phone call (${option.value})` : 'Phone call, we call you'
    case 'in_person':
      return option.value ? `In person, ${option.value}` : 'In person, at your address'
  }
}

/** The label for the field a guest fills in for an option they supply. */
export function guestFieldLabel(option: LocationOption): string {
  return option.type === 'phone' ? 'Your phone number' : 'Address'
}

const LOCATION_WORDS: Record<string, LocationType> = {
  'google meet': 'google_meet',
  meet: 'google_meet',
  'custom link': 'custom_link',
  link: 'custom_link',
  video: 'custom_link',
  phone: 'phone',
  'phone call': 'phone',
  call: 'phone',
  'in person': 'in_person',
  'in-person': 'in_person',
}

/**
 * The dashboard's "more locations" box: one per line, `kind | details`,
 * details optional (`Phone`, `In person | 1385 Coral Way, Miami`). Null and
 * the offending line when a kind is not recognised.
 */
export function parseLocationOptions(text: string): { options: LocationOption[] } | { error: string } {
  const options: LocationOption[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const [kind = '', ...rest] = line.split('|')
    const type = LOCATION_WORDS[kind.trim().toLowerCase().replace(/\s+/g, ' ')]
    if (!type) return { error: `"${kind.trim()}" is not a location kind. Use Google Meet, Custom link, Phone or In person.` }
    const value = rest.join('|').trim()
    if (value.length > 500) return { error: 'Keep each location\'s details to 500 characters' }
    if (type === 'custom_link' && value === '') return { error: 'A custom link needs its URL after a |' }
    options.push({ type, value: value === '' ? null : value })
  }
  return { options }
}

/** The inverse of `parseLocationOptions`, for refilling the form. */
export function formatLocationOptions(options: LocationOption[]): string {
  const word: Record<LocationType, string> = {
    google_meet: 'Google Meet',
    custom_link: 'Custom link',
    phone: 'Phone',
    in_person: 'In person',
  }
  return options.map((o) => (o.value ? `${word[o.type]} | ${o.value}` : word[o.type])).join('\n')
}

/** The dashboard's "other durations" box: `45, 60`. Null when anything in it is not a whole number. */
export function parseDurationOptions(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  const out: number[] = []
  for (const p of parts) {
    const n = Number(p.replace(/(m|min|mins|minutes)$/i, ''))
    if (!Number.isInteger(n)) return null
    out.push(n)
  }
  return [...new Set(out)].sort((a, b) => a - b)
}
