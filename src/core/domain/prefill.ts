/**
 * Prefilled booking links: `?name=…&email=…&phone=…` and friends.
 *
 * A host sending a link to someone they already know can fill in what they
 * know, and the confirm form opens with it in place, still editable. Only
 * names the form actually has are kept: the guest's name (or first and last
 * name, joined), email, invited guests, and the answer to any of the event
 * type's questions. A question is found by its id, or failing that by its
 * label (`?company=` for "Company", `?project_type=` for "Project type"),
 * and a phone question also answers to `?phone=`, `?tel=` or `?mobile=`; its
 * answer then reaches the host like one the guest typed. They ride along through the day and time links
 * the way `duration` and `location` do (http/pages/booking.ts `choiceQuery`).
 */

import { effectiveQuestions } from './booking-service.js'
import { phoneFromLink } from './phone.js'
import type { EventType } from './types.js'

/** The fixed names a link may fill; anything else must name a question. */
const FIXED = ['name', 'email', 'first_name', 'last_name', 'firstname', 'lastname', 'guests'] as const
const PHONE_NAMES = ['phone', 'phonenumber', 'tel', 'telephone', 'mobile', 'cell']
const MAX_VALUE = 500

/** A name compared loosely: case, spaces, dashes and underscores ignored. */
function loose(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * The prefill parameters in a request, keeping only names this event type's
 * form has, each cut to a sane length. Answers come back under their
 * question's id whatever name the link used, so the confirm form and the
 * links onward read them the one way.
 */
export function readPrefill(et: EventType, query: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  const keep = (name: string, value: string | undefined): void => {
    if (value !== undefined && value.trim() !== '') out[name] = value.slice(0, MAX_VALUE)
  }
  for (const name of FIXED) keep(name, query[name])
  const byLoose = new Map<string, string>()
  for (const [k, v] of Object.entries(query)) if (!byLoose.has(loose(k))) byLoose.set(loose(k), v)
  for (const q of effectiveQuestions(et)) {
    const names = [q.id, q.label, ...(q.type === 'phone' ? PHONE_NAMES : [])]
    const value = query[q.id] ?? names.map((n) => byLoose.get(loose(n))).find((v) => v !== undefined && v.trim() !== '')
    keep(q.id, value)
  }
  return out
}

/**
 * The confirm form's starting values from a link's prefill: first and last
 * name into their own fields (a whole `name` splits at its last space);
 * `email`; `guests`; and each question's answer under its id, a phone number
 * put in the form the phone field reads.
 */
export function prefillValues(et: EventType, prefill: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {}
  const first = (prefill['first_name'] ?? prefill['firstname'] ?? '').trim()
  const last = (prefill['last_name'] ?? prefill['lastname'] ?? '').trim()
  const whole = (prefill['name'] ?? '').trim().replace(/\s+/g, ' ')
  if (first || last) {
    if (first) values['name'] = first
    if (last) values['last_name'] = last
  } else if (whole) {
    const cut = whole.lastIndexOf(' ')
    values['name'] = cut === -1 ? whole : whole.slice(0, cut)
    if (cut !== -1) values['last_name'] = whole.slice(cut + 1)
  }
  if (prefill['email']) values['email'] = prefill['email'].trim()
  if (prefill['guests']) values['guests'] = prefill['guests'].trim()
  for (const q of effectiveQuestions(et)) {
    const raw = prefill[q.id]
    if (raw === undefined) continue
    values[q.id] = q.type === 'phone' ? phoneFromLink(raw) : raw.trim()
  }
  return values
}
