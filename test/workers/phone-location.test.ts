/**
 * A phone-call location and the phone number to call (core/domain/phone.ts).
 * When the event type asks its own phone-number question, a call dials that
 * answer and the location asks for nothing more; when it does not, the
 * location's own number field carries a country code like the question does.
 */

import { createExecutionContext, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'

const LOCATIONS = JSON.stringify([
  { type: 'google_meet', value: null },
  { type: 'phone', value: null },
])

async function fetchPage(path: string, init?: RequestInit): Promise<Response> {
  const { default: worker } = await import('../../src/index.js')
  return worker.fetch(new Request(`https://punctual.sh${path}`, init), env, createExecutionContext())
}

function post(path: string, fields: Record<string, string>): Promise<Response> {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) body.set(k, v)
  return fetchPage(path, { method: 'POST', body, headers: { 'cf-connecting-ip': `10.9.${Math.floor(Math.random() * 250)}.1` } })
}

describe('phone-call location', () => {
  const start = Date.UTC(2031, 0, 15, 15, 0)

  beforeAll(async () => {
    const now = Date.now()
    const eventType = (id: string, slug: string, questions: unknown[]) =>
      env.DB.prepare(
        `INSERT INTO event_types
         (id,owner_user_id,owner_team_id,scheduling_type,slug,title,description,duration_minutes,
          slot_interval_minutes,buffer_before_minutes,buffer_after_minutes,min_notice_minutes,
          max_horizon_days,max_per_day,location_type,location_value,questions_json,active,created_at,
          location_options_json)
         VALUES (?,?,NULL,'personal',?,?,'',30,NULL,0,0,0,60,NULL,'google_meet',NULL,?,1,?,?)`,
      ).bind(id, 'u_phone_loc', slug, slug, JSON.stringify(questions), now, LOCATIONS)
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id,email,name,tz,slug,created_at) VALUES (?,?,?,?,?,?)').bind(
        'u_phone_loc',
        'phone-loc@example.com',
        'Phone Host',
        'UTC',
        'phone-host',
        now,
      ),
      eventType('et_phone_q', 'with-question', [{ id: 'phone', label: 'Phone', type: 'phone', required: false }]),
      eventType('et_phone_none', 'no-question', []),
    ])
    await env.DB.prepare("UPDATE event_types SET allow_guests = 1 WHERE id = 'et_phone_none'").run()
  })

  it('does not ask for the number twice when the form has a phone question', async () => {
    const html = await (await fetchPage(`/phone-host/with-question/confirm?start=${start}&tz=UTC`)).text()
    expect(html).not.toContain('name="location_detail_2"')
    expect(html).toContain('We\'ll call the number you give under “Phone”.')
    expect(html).toContain('name="q_phone__country"')
  })

  it('asks for the phone question\'s answer when a call is chosen and it was left blank', async () => {
    const res = await post('/phone-host/with-question/confirm', {
      start: String(start),
      tz: 'UTC',
      name: 'Guest',
      email: 'not-an-email',
      location: '2',
      q_phone__country: 'US',
      q_phone: '',
    })
    expect(res.status).toBe(400)
    const html = await res.text()
    expect(html).toContain('<p class="pu-err" id="err-phone">Please give a number we can call</p>')
  })

  it('gives the location\'s own number field a country code when the form has no phone question', async () => {
    const html = await (await fetchPage(`/phone-host/no-question/confirm?start=${start}&tz=UTC`)).text()
    expect(html).toContain('name="location_detail_2__country"')
    expect(html).toMatch(/<input id="location_detail_2" name="location_detail_2" type="tel"/)
  })

  it('checks that number and keeps the country picked after an error', async () => {
    const res = await post('/phone-host/no-question/confirm', {
      start: String(start),
      tz: 'UTC',
      name: 'Guest',
      email: 'not-an-email',
      location: '2',
      location_detail_2__country: 'CO',
      location_detail_2: 'call me',
    })
    expect(res.status).toBe(400)
    const html = await res.text()
    expect(html).toContain('Please enter a valid phone number')
    expect(html).toContain('<option value="CO" selected>Colombia +57</option>')
  })
})

describe('invited guests on the booking form', () => {
  const start = Date.UTC(2031, 0, 15, 15, 0)

  it('offers the field only where the event type allows guests', async () => {
    const allowed = await (await fetchPage(`/phone-host/no-question/confirm?start=${start}&tz=UTC`)).text()
    expect(allowed).toContain('<textarea id="guests" name="guests"')
    const notAllowed = await (await fetchPage(`/phone-host/with-question/confirm?start=${start}&tz=UTC`)).text()
    expect(notAllowed).not.toContain('name="guests"')
  })

  it('names the address that is not one and keeps what was typed', async () => {
    const res = await post('/phone-host/no-question/confirm', {
      start: String(start),
      tz: 'UTC',
      name: 'Guest',
      email: 'guest@example.com',
      location: '1',
      guests: 'ok@example.com, not-an-address',
    })
    expect(res.status).toBe(400)
    const html = await res.text()
    expect(html).toContain('&quot;not-an-address&quot; is not an email address')
    expect(html).toContain('ok@example.com, not-an-address</textarea>')
  })
})
