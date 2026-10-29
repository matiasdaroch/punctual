/**
 * The dashboard's location and question rows (core/domain/event-type-rows.ts)
 * and the phone question's answer (core/domain/phone.ts).
 */

import { describe, expect, it } from 'vitest'
import { locationsFromRows, questionsFromRows, readRows } from '../../src/core/domain/event-type-rows.js'
import { isValidPhone, joinPhone, splitPhone } from '../../src/core/domain/phone.js'
import { validateAnswers } from '../../src/core/domain/booking-service.js'
import type { EventType } from '../../src/core/domain/types.js'

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('readRows', () => {
  it('reads rows in index order, skipping blank and removed ones', () => {
    const rows = readRows(
      form({
        loc_type_0: 'google_meet',
        loc_type_1: '',
        loc_value_1: 'ignored, no kind',
        loc_type_3: 'in_person',
        loc_value_3: '1385 Coral Way',
        loc_label_3: 'MIK office',
        q_label_0: 'Phone',
        q_type_0: 'phone',
        q_required_0: '1',
        q_label_2: 'Project type',
        q_type_2: 'select',
        q_options_2: 'New home, Renovation',
      }),
    )
    expect(rows.locations).toEqual([
      { type: 'google_meet', value: '', label: '' },
      { type: 'in_person', value: '1385 Coral Way', label: 'MIK office' },
    ])
    expect(rows.questions).toEqual([
      { label: 'Phone', type: 'phone', options: '', required: true },
      { label: 'Project type', type: 'select', options: 'New home, Renovation', required: false },
    ])
  })
})

describe('locationsFromRows', () => {
  it('keeps the label and turns blank details into a guest-supplied option', () => {
    expect(
      locationsFromRows([
        { type: 'phone', value: '', label: '' },
        { type: 'in_person', value: '1385 Coral Way', label: 'MIK office' },
      ]),
    ).toEqual({
      options: [
        { type: 'phone', value: null },
        { type: 'in_person', value: '1385 Coral Way', label: 'MIK office' },
      ],
    })
  })

  it('names the row that is wrong', () => {
    expect(locationsFromRows([{ type: 'google_meet', value: '', label: '' }, { type: 'custom_link', value: 'zoom', label: '' }])).toEqual({
      error: 'Location 2: a custom link needs its full http(s) URL',
    })
  })
})

describe('questionsFromRows', () => {
  it('derives ids from labels and keeps required and choices', () => {
    expect(
      questionsFromRows([
        { label: 'Property address', type: 'text', options: '', required: true },
        { label: 'Project type', type: 'select', options: 'New home, Renovation', required: false },
      ]),
    ).toEqual({
      questions: [
        { id: 'property-address', label: 'Property address', type: 'text', required: true },
        { id: 'project-type', label: 'Project type', type: 'select', required: false, options: ['New home', 'Renovation'] },
      ],
    })
  })

  it('asks for a dropdown\'s choices', () => {
    expect(questionsFromRows([{ label: 'Budget', type: 'select', options: '', required: false }])).toEqual({
      error: 'Question 1: a dropdown needs its choices, separated by commas',
    })
  })
})

describe('phone answers', () => {
  it('joins the country code and the number, and splits them back', () => {
    expect(joinPhone('US', '786 708 0880')).toBe('+1 786 708 0880')
    expect(joinPhone('CO', '300 123 4567')).toBe('+57 300 123 4567')
    expect(joinPhone('US', '+44 20 7946 0958')).toBe('+44 20 7946 0958')
    expect(joinPhone('US', '  ')).toBe('')
    expect(splitPhone('+57 300 123 4567')).toEqual({ iso: 'CO', number: '300 123 4567' })
  })

  it('accepts real numbers and rejects text', () => {
    expect(isValidPhone('+1 (786) 708-0880')).toBe(true)
    expect(isValidPhone('+1 12')).toBe(false)
    expect(isValidPhone('call me')).toBe(false)
  })

  it('is checked when a booking is validated', () => {
    const et = {
      questions: [{ id: 'phone', label: 'Phone', type: 'phone', required: true }],
    } as unknown as EventType
    expect(validateAnswers(et, { phone: '+1 call me' })['phone']).toBe('Please enter a valid phone number')
    expect(validateAnswers(et, { phone: '+1 786 708 0880' })['phone']).toBeUndefined()
  })
})
