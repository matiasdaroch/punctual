/**
 * Guest-chosen duration and location (core/domain/booking-options.ts): the
 * choices on offer, the URL prefill, the dashboard's text format, and
 * applying a choice to the event type the engine then runs on.
 */

import { describe, expect, it } from 'vitest'
import {
  durationChoices,
  forBooking,
  formatLocationOptions,
  guestSupplies,
  locationChoices,
  parseDurationOptions,
  parseLocationOptions,
  pickDuration,
  pickLocation,
  withDuration,
} from '../../src/core/domain/booking-options.js'
import type { Booking, EventType } from '../../src/core/domain/types.js'

const et: EventType = {
  id: 'et1',
  ownerUserId: 'u1',
  ownerTeamId: null,
  schedulingType: 'personal',
  slug: 'discovery',
  title: 'Discovery call',
  description: '',
  durationMinutes: 30,
  slotIntervalMinutes: null,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minNoticeMinutes: 0,
  maxHorizonDays: 60,
  maxPerDay: null,
  locationType: 'google_meet',
  locationValue: null,
  durationOptions: [60, 45],
  locationOptions: [
    { type: 'phone', value: null },
    { type: 'in_person', value: '1385 Coral Way, Suite 202' },
  ],
  questions: [],
  active: true,
  createdAt: 0,
  scheduleId: null,
}

describe('choices on offer', () => {
  it('lists every duration ascending, the default included once', () => {
    expect(durationChoices(et)).toEqual([30, 45, 60])
    expect(durationChoices({ ...et, durationOptions: undefined })).toEqual([30])
  })

  it('lists the default location first, then the others', () => {
    expect(locationChoices(et).map((o) => o.type)).toEqual(['google_meet', 'phone', 'in_person'])
    expect(locationChoices({ ...et, locationOptions: [] })).toHaveLength(1)
  })

  it('knows which options the guest fills in', () => {
    expect(guestSupplies({ type: 'phone', value: null })).toBe(true)
    expect(guestSupplies({ type: 'in_person', value: null })).toBe(true)
    expect(guestSupplies({ type: 'in_person', value: 'Office' })).toBe(false)
    expect(guestSupplies({ type: 'google_meet', value: null })).toBe(false)
  })
})

describe('URL prefill', () => {
  it('takes an offered duration and ignores anything else', () => {
    expect(pickDuration(et, '60')).toBe(60)
    expect(pickDuration(et, '45min')).toBe(45)
    expect(pickDuration(et, '90')).toBe(30)
    expect(pickDuration(et, 'abc')).toBe(30)
    expect(pickDuration(et, undefined)).toBe(30)
  })

  it('takes a location by kind or by position', () => {
    expect(pickLocation(et, 'phone')).toBe(1)
    expect(pickLocation(et, 'in-person')).toBe(2)
    expect(pickLocation(et, 'meet')).toBe(0)
    expect(pickLocation(et, '3')).toBe(2)
    expect(pickLocation(et, '4')).toBeNull()
    expect(pickLocation(et, 'link')).toBeNull()
    expect(pickLocation(et, '')).toBeNull()
  })
})

describe('applying a choice', () => {
  it('keeps the base slot grid when the length changes', () => {
    const long = withDuration(et, 60)
    expect(long.durationMinutes).toBe(60)
    expect(long.slotIntervalMinutes).toBe(30)
    expect(withDuration(et, 30)).toBe(et)
  })

  it('keeps every length on offer after one is picked', () => {
    expect(durationChoices(withDuration(et, 60))).toEqual([30, 45, 60])
  })

  it('reapplies a stored booking\'s length and location', () => {
    const booking = {
      startUtc: 0,
      endUtc: 45 * 60_000,
      locationType: 'phone',
      locationValue: '786 708 0880',
    } as Booking
    const used = forBooking(et, booking)
    expect(used.durationMinutes).toBe(45)
    expect(used.locationType).toBe('phone')
    expect(used.locationValue).toBe('786 708 0880')
    expect(forBooking(null, booking)).toBeNull()
  })

  it('leaves the default location alone on a booking that made no choice', () => {
    const booking = { startUtc: 0, endUtc: 30 * 60_000, locationType: null, locationValue: null } as Booking
    expect(forBooking(et, booking).locationType).toBe('google_meet')
  })
})

describe('dashboard text', () => {
  it('reads "kind | details" lines and writes them back the same way', () => {
    const text = 'Phone\nIn person | 1385 Coral Way, Suite 202\nGoogle Meet'
    const parsed = parseLocationOptions(text)
    expect(parsed).toEqual({
      options: [
        { type: 'phone', value: null },
        { type: 'in_person', value: '1385 Coral Way, Suite 202' },
        { type: 'google_meet', value: null },
      ],
    })
    if ('options' in parsed) expect(formatLocationOptions(parsed.options)).toBe(text)
  })

  it('names the kind it does not recognise', () => {
    expect(parseLocationOptions('Zoom | x')).toEqual({
      error: '"Zoom" is not a location kind. Use Google Meet, Custom link, Phone or In person.',
    })
  })

  it('reads durations separated by commas or spaces', () => {
    expect(parseDurationOptions('60, 45')).toEqual([45, 60])
    expect(parseDurationOptions('45 90min')).toEqual([45, 90])
    expect(parseDurationOptions('')).toEqual([])
    expect(parseDurationOptions('an hour')).toBeNull()
  })
})
