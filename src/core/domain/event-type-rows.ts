/**
 * The dashboard's row editors for an event type's locations and questions.
 *
 * Each row posts as indexed fields (`loc_type_3`, `q_label_3`, …): a
 * checkbox that is not ticked posts nothing, so the index is what keeps a
 * row's "required" with its own label. Rows are read back in index order,
 * blank rows skipped, and kept exactly as typed so a form that failed
 * validation refills with what the host entered.
 */

import { MAX_LOCATION_OPTIONS } from './booking-options.js'
import { slugify } from './booking-service.js'
import type { EventType, EventTypeQuestion, LocationOption, LocationType } from './types.js'

export interface LocationRow {
  type: string
  value: string
  label: string
}

export interface QuestionRow {
  label: string
  type: string
  options: string
  required: boolean
}

export interface EventTypeRows {
  locations: LocationRow[]
  questions: QuestionRow[]
}

export const MAX_QUESTIONS = 20
/** How many indexes the reader scans; generous, since removed rows leave gaps. */
const MAX_ROW_INDEX = 100

export const LOCATION_KINDS: ReadonlyArray<{ value: LocationType; label: string }> = [
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'custom_link', label: 'Custom link' },
  { value: 'phone', label: 'Phone call' },
  { value: 'in_person', label: 'In person' },
]

export const QUESTION_KINDS: ReadonlyArray<{ value: EventTypeQuestion['type']; label: string }> = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'phone', label: 'Phone number' },
]

/** The event type's locations as rows, the default first. */
export function locationRowsOf(et: EventType | undefined): LocationRow[] {
  if (!et) return [{ type: 'google_meet', value: '', label: '' }]
  const list = et.locationOptions && et.locationOptions.length > 0 ? et.locationOptions : [{ type: et.locationType, value: et.locationValue }]
  return list.map((o) => ({ type: o.type, value: o.value ?? '', label: o.label ?? '' }))
}

export function questionRowsOf(et: EventType | undefined): QuestionRow[] {
  return (et?.questions ?? []).map((q) => ({
    label: q.label,
    type: q.type,
    options: (q.options ?? []).join(', '),
    required: q.required,
  }))
}

/** The rows as posted, in index order, blank ones dropped. */
export function readRows(form: FormData): EventTypeRows {
  const text = (name: string) => String(form.get(name) ?? '').trim()
  const locations: LocationRow[] = []
  const questions: QuestionRow[] = []
  for (let i = 0; i < MAX_ROW_INDEX; i++) {
    const loc: LocationRow = { type: text(`loc_type_${i}`), value: text(`loc_value_${i}`), label: text(`loc_label_${i}`) }
    if (loc.type !== '') locations.push(loc)
    const q: QuestionRow = {
      label: text(`q_label_${i}`),
      type: text(`q_type_${i}`) || 'text',
      options: text(`q_options_${i}`),
      required: form.get(`q_required_${i}`) !== null,
    }
    if (q.label !== '' || q.options !== '') questions.push(q)
  }
  return { locations, questions }
}

/** The locations the rows describe, or the message for the first row that is wrong. */
export function locationsFromRows(rows: LocationRow[]): { options: LocationOption[] } | { error: string } {
  if (rows.length > MAX_LOCATION_OPTIONS) return { error: `Up to ${MAX_LOCATION_OPTIONS} locations` }
  const options: LocationOption[] = []
  for (const [i, r] of rows.entries()) {
    const kind = LOCATION_KINDS.find((k) => k.value === r.type)
    const where = `Location ${i + 1}`
    if (!kind) return { error: `${where}: choose a kind` }
    if (r.value.length > 500) return { error: `${where}: keep the details to 500 characters` }
    if (r.label.length > 80) return { error: `${where}: keep the label to 80 characters` }
    if (kind.value === 'custom_link' && !isHttpUrl(r.value)) return { error: `${where}: a custom link needs its full http(s) URL` }
    options.push({ type: kind.value, value: r.value === '' ? null : r.value, ...(r.label ? { label: r.label } : {}) })
  }
  return { options }
}

/**
 * The questions the rows describe, or the message for the first row that is
 * wrong. Ids derive from labels, as they always have here, so an unchanged
 * label keeps its id and the answers already stored under it.
 */
export function questionsFromRows(rows: QuestionRow[]): { questions: EventTypeQuestion[] } | { error: string } {
  if (rows.length > MAX_QUESTIONS) return { error: `Up to ${MAX_QUESTIONS} questions` }
  const out: EventTypeQuestion[] = []
  const seen = new Set<string>()
  for (const [i, r] of rows.entries()) {
    const where = `Question ${i + 1}`
    if (r.label === '') return { error: `${where}: give it a question` }
    if (r.label.length > 200) return { error: `${where}: keep the question to 200 characters` }
    const kind = QUESTION_KINDS.find((k) => k.value === r.type)
    if (!kind) return { error: `${where}: choose an answer type` }
    const options = r.options
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o !== '')
    if (kind.value === 'select' && options.length === 0) {
      return { error: `${where}: a dropdown needs its choices, separated by commas` }
    }
    const base = slugify(r.label)
    if (base === '') return { error: `${where}: the question needs at least one letter or number` }
    let id = base
    let n = 2
    while (seen.has(id)) id = `${base}-${n++}`
    seen.add(id)
    const question: EventTypeQuestion = { id, label: r.label, type: kind.value, required: r.required }
    if (kind.value === 'select') question.options = options
    out.push(question)
  }
  return { questions: out }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
