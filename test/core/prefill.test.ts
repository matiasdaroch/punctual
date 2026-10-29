/**
 * Prefilled booking links (core/domain/prefill.ts, core/domain/phone.ts).
 */

import { describe, expect, it } from 'vitest'
import { prefillValues, readPrefill } from '../../src/core/domain/prefill.js'
import { phoneFromLink } from '../../src/core/domain/phone.js'
import type { EventType } from '../../src/core/domain/types.js'

const et = {
  questions: [
    { id: 'phone', label: 'Phone', type: 'phone', required: true },
    { id: 'project-type', label: 'Project type', type: 'select', required: false, options: ['New home', 'Renovation'] },
  ],
} as unknown as EventType

describe('readPrefill', () => {
  it('keeps the names the form has and drops the rest', () => {
    const query: Record<string, string> = { name: 'Ana', phone: '7867080880', agenda: 'Kitchen', utm_source: 'x', 'project-type': 'New home' }
    expect(readPrefill(et, (n) => query[n])).toEqual({ name: 'Ana', phone: '7867080880', agenda: 'Kitchen', 'project-type': 'New home' })
  })
})

describe('prefillValues', () => {
  it('fills first and last name, and puts a phone number in the field\'s form', () => {
    expect(prefillValues(et, { first_name: 'Ana', last_name: 'Lopez', email: 'ana@x.com', phone: '+17867080880' })).toEqual({
      name: 'Ana',
      last_name: 'Lopez',
      email: 'ana@x.com',
      phone: '+1 7867080880',
    })
  })

  it('splits a whole name at its last space', () => {
    expect(prefillValues(et, { name: 'Ana Maria  Lopez' })).toEqual({ name: 'Ana Maria', last_name: 'Lopez' })
    expect(prefillValues(et, { name: 'Ana' })).toEqual({ name: 'Ana' })
  })
})

describe('phoneFromLink', () => {
  it('reads a + that arrived as a space, and splits off the country code', () => {
    expect(phoneFromLink(' 17867080880')).toBe('+1 7867080880')
    expect(phoneFromLink('+573001234567')).toBe('+57 3001234567')
    expect(phoneFromLink('+1 786 708 0880')).toBe('+1 786 708 0880')
    expect(phoneFromLink('7867080880')).toBe('7867080880')
  })
})
