/**
 * The guest's duration and location through the REST API and out the other
 * side in the webhook (core/domain/booking-options.ts): POST /bookings takes
 * `durationMinutes` and `location`, the booking it returns carries them, and
 * `booking.created` hands n8n the length, the place and the phone number.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { buildPorts, type Env } from '../../src/index.js'
import { createSlotService } from '../../src/engine.js'
import { buildApiRoutes } from '../../src/http/api/rest.js'
import { createApiKey } from '../../src/core/domain/auth-flows.js'
import { handleOne } from '../../src/adapters/queue/consumer.js'
import type { EnginePorts, QueueMessage } from '../../src/ports.js'

function keyMaterial(seed: number): string {
  const bytes = new Uint8Array(32)
  for (let i = 0; i < bytes.length; i++) bytes[i] = (seed * 31 + i * 7) & 0xff
  return btoa(String.fromCharCode(...bytes))
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

describe('duration and location through the API', () => {
  it('books 60 minutes by phone, returns both, and sends them with the number in the webhook', async () => {
    const ports: EnginePorts = buildPorts({
      ...env,
      BASE_URL: 'https://meet.test',
      ENCRYPTION_KEY_V1: keyMaterial(1),
      SIGNING_KEY: keyMaterial(9),
    } as Env)
    // Every queued message is kept rather than run, so the test can step
    // through the calendar sync itself and read the webhook it enqueues.
    const queued: QueueMessage[] = []
    ports.queue = {
      async send(m) {
        queued.push(m)
      },
      async sendBatch(ms) {
        queued.push(...ms)
      },
    }
    const app = new Hono()
    app.route('/api/v1', buildApiRoutes(ports, createSlotService(ports)))

    const repos = ports.repositories({ consistency: 'bookmark' })
    const user = await repos.users.create({
      id: 'usr_choices',
      email: 'host@choices.test',
      name: 'Choices Host',
      tz: 'UTC',
      slug: 'choices-host',
      avatarKey: null,
      company: null,
      jobTitle: null,
      companyUrl: null,
      role: 'member',
    })
    if (!user) throw new Error('seed collided')
    const allDay = [{ startMinute: 0, endMinute: 24 * 60 }]
    await repos.availability.create(user.id, {
      id: 'sch_choices',
      userId: user.id,
      name: 'Always',
      isDefault: true,
      timezone: 'UTC',
      weekly: [allDay, allDay, allDay, allDay, allDay, allDay, allDay],
      overrides: [],
    })
    const { raw: key } = await createApiKey(
      { repos, crypto: ports.crypto },
      { userId: user.id, name: 'test', scopes: ['*'], now: Date.now() },
    )
    const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }

    // An event type made through the API, with lengths, places and a phone question.
    const created = await app.request('/api/v1/event-types', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        slug: 'discovery',
        title: 'Discovery call',
        durationMinutes: 30,
        durationOptions: [45, 60],
        locationOptions: [
          { type: 'google_meet', value: null },
          { type: 'phone', value: null },
          { type: 'in_person', value: '1385 Coral Way', label: 'MIK office' },
        ],
        questions: [{ id: 'phone', label: 'Phone', type: 'phone', required: true }],
        allowGuests: true,
      }),
    })
    expect(created.status, await created.clone().text()).toBe(201)
    const et = ((await created.json()) as { data: Record<string, unknown> }).data
    expect(et['durationOptions']).toEqual([30, 45, 60])
    expect(et['locationType']).toBe('google_meet')
    expect(et['allowGuests']).toBe(true)
    expect((et['locationOptions'] as unknown[]).length).toBe(3)

    await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'https://n8n.test/hook', events: ['booking.created'] }),
    })

    // Inside the 60-day horizon: 15:00 UTC two days out.
    const day = new Date(Date.now() + 2 * 24 * 60 * 60_000)
    const start = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 15, 0)
    const booked = await app.request('/api/v1/bookings', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventTypeId: et['id'],
        start,
        guestName: 'Guest',
        guestEmail: 'guest@choices.test',
        answers: { phone: '+1 786 708 0880' },
        durationMinutes: 60,
        location: { type: 'phone' },
        guests: ['Partner@Choices.test'],
      }),
    })
    expect(booked.status).toBe(201)
    const booking = ((await booked.json()) as { data: Record<string, unknown> }).data
    expect(booking['durationMinutes']).toBe(60)
    expect(booking['location']).toEqual({ type: 'phone', value: '+1 786 708 0880' })
    expect(booking['guests']).toEqual(['partner@choices.test'])

    // A length the event type does not offer is refused, not stretched.
    const odd = await app.request('/api/v1/bookings', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventTypeId: et['id'],
        start: start + 3 * 60 * 60_000,
        guestName: 'Guest',
        guestEmail: 'guest@choices.test',
        answers: { phone: '+1 786 708 0880' },
        durationMinutes: 90,
      }),
    })
    expect(odd.status).toBeGreaterThanOrEqual(400)

    // Run the calendar sync the booking enqueued: it sends the confirmation
    // and, with it, the webhook.
    const sync = queued.find((m) => m.kind === 'calendar.sync')
    expect(sync).toBeDefined()
    await handleOne(sync!, ports)
    const hook = queued.find((m) => m.kind === 'webhook') as Extract<QueueMessage, { kind: 'webhook' }> | undefined
    expect(hook?.event).toBe('booking.created')
    expect(hook?.payload).toMatchObject({
      durationMinutes: 60,
      location: { type: 'phone', value: '+1 786 708 0880', description: 'Phone: +1 786 708 0880' },
      answers: { phone: '+1 786 708 0880' },
      guests: ['partner@choices.test'],
    })
    // The invited guest gets their own copy of the confirmation.
    const mails = queued.filter((m): m is Extract<QueueMessage, { kind: 'email' }> => m.kind === 'email')
    expect(mails.map((m) => m.message.to)).toContain('partner@choices.test')
  })
})

describe('after booking: add to calendar', () => {
  it('serves the booking as an .ics behind its manage link, with the reschedule link inside', async () => {
    const { createExecutionContext } = await import('cloudflare:test')
    const { default: worker } = await import('../../src/index.js')
    // The worker's own ports, so the token is signed with the key it checks.
    const ports = buildPorts(env as unknown as Env)
    const repos = ports.repositories({ consistency: 'bookmark' })
    const user = await repos.users.create({
      id: 'usr_ics',
      email: 'host@ics.test',
      name: 'Ics Host',
      tz: 'UTC',
      slug: 'ics-host',
      avatarKey: null,
      company: null,
      jobTitle: null,
      companyUrl: null,
      role: 'member',
    })
    if (!user) throw new Error('seed collided')
    const allDay = [{ startMinute: 0, endMinute: 24 * 60 }]
    await repos.availability.create(user.id, {
      id: 'sch_ics',
      userId: user.id,
      name: 'Always',
      isDefault: true,
      timezone: 'UTC',
      weekly: [allDay, allDay, allDay, allDay, allDay, allDay, allDay],
      overrides: [],
    })
    const et = await repos.eventTypes.create({
      id: 'evt_ics',
      ownerUserId: user.id,
      ownerTeamId: null,
      schedulingType: 'personal',
      slug: 'ics',
      title: 'Ics call',
      description: '',
      durationMinutes: 30,
      slotIntervalMinutes: null,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minNoticeMinutes: 0,
      maxHorizonDays: 60,
      maxPerDay: null,
      locationType: 'in_person',
      locationValue: '1385 Coral Way',
      questions: [],
      active: true,
      scheduleId: null,
    })
    const day = new Date(Date.now() + 3 * 24 * 60 * 60_000)
    const start = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 16, 0)
    const outcome = await ports.coordinator.book(user.id, {
      eventTypeId: et.id,
      hostUserIds: [user.id],
      start,
      end: start + 30 * 60_000,
      guestName: 'Guest',
      guestEmail: 'guest@ics.test',
      guestTimezone: 'UTC',
      answers: {},
    })
    if (!outcome.ok || !outcome.manageToken) throw new Error(`booking failed: ${JSON.stringify(outcome)}`)

    const fetchIt = (path: string) =>
      worker.fetch(new Request(`https://punctual.test${path}`), env, createExecutionContext())
    const ok = await fetchIt(`/booking/${outcome.booking.id}/invite.ics?token=${encodeURIComponent(outcome.manageToken)}`)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('text/calendar')
    const ics = (await ok.text()).replace(/\r\n /g, '')
    expect(ics).toContain('LOCATION:1385 Coral Way')
    expect(ics).toContain('Need to reschedule or cancel? https://punctual.test/booking/')
    expect(ics).toContain('X-ALT-DESC;FMTTYPE=text/html:')
    expect(ics).toContain('>Need to reschedule or cancel?</a>')

    const denied = await fetchIt(`/booking/${outcome.booking.id}/invite.ics?token=nope`)
    expect(denied.headers.get('content-type') ?? '').not.toContain('text/calendar')
  })
})
