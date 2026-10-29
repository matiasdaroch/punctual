/**
 * Prefilled booking links: `?name=…&email=…&phone=…` and friends.
 *
 * A host sending a link to someone they already know can fill in what they
 * know, and the confirm form opens with it in place, still editable. Only
 * names the form actually has are kept: the guest's name (or first and last
 * name, joined), email, invited guests, and the answer to any of the event
 * type's questions by its id. They ride along through the day and time links
 * the way `duration` and `location` do (http/pages/booking.ts `choiceQuery`).
 */

import { effectiveQuestions } from './booking-service.js'
import { phoneFromLink } from './phone.js'
import type { EventType } from './types.js'

/** The fixed names a link may fill; anything else must be a question id. */
const FIXED = ['name', 'email', 'first_name', 'last_name', 'firstname', 'lastname', 'guests'] as const
const MAX_VALUE = 500

/**
 * The prefill parameters in a request, keeping only names this event type's
 * form has, each cut to a sane length. `get` reads one query parameter.
 */
export function readPrefill(et: EventType, get: (name: string) => string | undefined): Record<string, string> {
  const names = [...FIXED, ...effectiveQuestions(et).map((q) => q.id)]
  const out: Record<string, string> = {}
  for (const name of names) {
    const value = get(name)
    if (value !== undefined && value.trim() !== '') out[name] = value.slice(0, MAX_VALUE)
  }
  return out
}

/**
 * The confirm form's starting values from a link's prefill: `name`, or
 * first and last name joined; `email`; `guests`; and each question's answer
 * under its id, a phone number put in the form the phone field reads.
 */
export function prefillValues(et: EventType, prefill: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {}
  const first = (prefill['first_name'] ?? prefill['firstname'] ?? '').trim()
  const last = (prefill['last_name'] ?? prefill['lastname'] ?? '').trim()
  const name = (prefill['name'] ?? '').trim() || [first, last].filter(Boolean).join(' ')
  if (name) values['name'] = name
  if (prefill['email']) values['email'] = prefill['email'].trim()
  if (prefill['guests']) values['guests'] = prefill['guests'].trim()
  for (const q of effectiveQuestions(et)) {
    const raw = prefill[q.id]
    if (raw === undefined) continue
    values[q.id] = q.type === 'phone' ? phoneFromLink(raw) : raw.trim()
  }
  return values
}
