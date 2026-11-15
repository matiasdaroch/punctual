/**
 * Booking notifications in the places a team actually looks: a Slack
 * channel, a Telegram chat, or an n8n workflow. Email reaches the host;
 * this reaches the room.
 *
 * A channel belongs to a user (their own bookings) or to a team (every
 * booking of the team's event types), carries a list of events, and a
 * destination — a Slack incoming-webhook URL, a Telegram bot token and chat
 * id, or an n8n webhook URL and optional shared secret — that is a secret
 * and is stored encrypted. Delivery runs on the queue beside webhooks, so a
 * slow chat API never slows a booking.
 *
 * Slack and Telegram get a sentence for people to read; n8n gets the
 * booking as fields (`n8nPayload`), for a workflow to map without parsing.
 */

import type { Booking, EventType, User, WebhookEvent } from './types.js'
import { formatInZone } from '../time/zone.js'
import { joinNames } from './calendar-text.js'
import { answeredQuestions } from './booking-service.js'

export type ChannelKind = 'slack' | 'telegram' | 'n8n'
export type ChannelOwnerKind = 'user' | 'team'

export type ChannelConfig =
  | { kind: 'slack'; webhookUrl: string }
  | { kind: 'telegram'; botToken: string; chatId: string }
  | { kind: 'n8n'; url: string; secret?: string }

export interface NotificationChannel {
  id: string
  ownerKind: ChannelOwnerKind
  ownerId: string
  kind: ChannelKind
  /** Shown in the dashboard in place of the secret: "Slack · hooks.slack.com/…/T0…" */
  label: string
  /** The encrypted `ChannelConfig` and the key it was encrypted with (ADR-0005 §6). */
  configEncrypted: string
  keyVersion: number
  events: WebhookEvent[]
  active: boolean
  createdAt: number
}

export const CHANNEL_EVENTS: ReadonlyArray<{ value: WebhookEvent; label: string }> = [
  { value: 'booking.created', label: 'New booking' },
  { value: 'booking.rescheduled', label: 'Rescheduled' },
  { value: 'booking.cancelled', label: 'Cancelled' },
  { value: 'booking.hosts_changed', label: 'Hosts changed' },
]

/** AAD for the encrypted destination: the row it belongs to, so a ciphertext cannot be moved between channels. */
export function channelAad(ownerKind: ChannelOwnerKind, ownerId: string, id: string): string {
  return `channel|${ownerKind}|${ownerId}|${id}`
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ParsedDestination = { ok: true; config: ChannelConfig; label: string } | { ok: false; message: string }

const TELEGRAM_TOKEN = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/
const TELEGRAM_CHAT = /^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/

/**
 * Only the destinations this engine knows how to post to, each checked for
 * the shape its service issues — a Slack URL on any other host would make
 * the instance post booking details wherever a host typed. n8n runs on the
 * host's own domain, so its URL can be any https address, but only that:
 * no plain http, no credentials in the URL, nothing local.
 */
export function parseDestination(
  kind: string,
  fields: { webhookUrl?: string; botToken?: string; chatId?: string; n8nUrl?: string; n8nSecret?: string },
): ParsedDestination {
  if (kind === 'slack') {
    const url = (fields.webhookUrl ?? '').trim()
    let parsed: URL | null = null
    try {
      parsed = new URL(url)
    } catch {
      parsed = null
    }
    if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== 'hooks.slack.com' || !parsed.pathname.startsWith('/services/')) {
      return { ok: false, message: 'A Slack incoming webhook URL looks like https://hooks.slack.com/services/T…/B…/…' }
    }
    const parts = parsed.pathname.split('/').filter(Boolean)
    return { ok: true, config: { kind: 'slack', webhookUrl: url }, label: `Slack · …/${parts[1] ?? ''}/${parts[2] ?? ''}` }
  }
  if (kind === 'telegram') {
    const botToken = (fields.botToken ?? '').trim()
    const chatId = (fields.chatId ?? '').trim()
    if (!TELEGRAM_TOKEN.test(botToken)) return { ok: false, message: 'A Telegram bot token looks like 123456789:AAH… — from @BotFather' }
    if (!TELEGRAM_CHAT.test(chatId)) return { ok: false, message: 'A Telegram chat id is a number (negative for groups) or @channelname' }
    return { ok: true, config: { kind: 'telegram', botToken, chatId }, label: `Telegram · ${chatId} via bot ${botToken.split(':')[0]}` }
  }
  if (kind === 'n8n') {
    const url = (fields.n8nUrl ?? '').trim()
    const secret = (fields.n8nSecret ?? '').trim()
    let parsed: URL | null = null
    try {
      parsed = new URL(url)
    } catch {
      parsed = null
    }
    const host = parsed?.hostname.toLowerCase() ?? ''
    const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^[\d.]+$/.test(host) || host.startsWith('[')
    if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password || local || !host.includes('.') || url.length > 500) {
      return { ok: false, message: 'An n8n webhook URL is the Production URL of a Webhook node, like https://n8n.example.com/webhook/…' }
    }
    if (secret.length > 200 || /[\r\n]/.test(secret)) return { ok: false, message: 'Keep the secret to one line of 200 characters or fewer' }
    return { ok: true, config: { kind: 'n8n', url, ...(secret ? { secret } : {}) }, label: `n8n · ${host}${secret ? ' (with secret)' : ''}` }
  }
  return { ok: false, message: 'Choose Slack, Telegram or n8n' }
}

export function parseChannelEvents(values: string[]): WebhookEvent[] {
  const known = new Set(CHANNEL_EVENTS.map((e) => e.value))
  return [...new Set(values)].filter((v): v is WebhookEvent => known.has(v as WebhookEvent))
}

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------

export interface ChatMessageInput {
  event: WebhookEvent
  booking: Booking
  eventType: EventType
  hosts: User[]
  /** Who the message is for — decides the timezone the time is written in. */
  tz: string
  /** The host-side link to the booking in the dashboard. */
  link: string
  /** For hosts_changed: who came and who went. */
  hostsAdded?: string[]
  hostsRemoved?: string[]
}

export interface ChatMessage {
  /** One line, for a notification banner. */
  headline: string
  /** Plain-text lines under it. */
  lines: string[]
  link: string
  /** The booking as fields, for n8n (`n8nPayload`); absent on a test message. */
  data?: Record<string, unknown>
}

const HEADLINE: Record<WebhookEvent, string> = {
  'booking.created': 'New booking',
  'booking.rescheduled': 'Booking rescheduled',
  'booking.cancelled': 'Booking cancelled',
  'booking.hosts_changed': 'Hosts changed',
}

export function chatMessage(input: ChatMessageInput): ChatMessage {
  const { booking, eventType } = input
  const when = `${formatInZone(booking.startUtc, input.tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (${input.tz})`
  const hosts = input.hosts.map((h) => h.name || h.slug)
  const lines = [
    `${eventType.title} · ${eventType.durationMinutes} min`,
    `${booking.guestName} <${booking.guestEmail}>`,
    when,
    hosts.length > 0 ? `With ${joinNames(hosts)}` : '',
  ]
  if (input.event === 'booking.hosts_changed') {
    if (input.hostsAdded?.length) lines.push(`Added: ${input.hostsAdded.join(', ')}`)
    if (input.hostsRemoved?.length) lines.push(`Removed: ${input.hostsRemoved.join(', ')}`)
  }
  return { headline: `${HEADLINE[input.event]}: ${eventType.title}`, lines: lines.filter(Boolean), link: input.link, data: bookingData(input) }
}

/**
 * The booking as an n8n workflow wants it: flat names, ISO times in UTC and
 * in the reader's zone, and the answers both by question id and by the
 * label the guest saw, so a workflow can map "Phone" without knowing ids.
 */
function bookingData(input: ChatMessageInput): Record<string, unknown> {
  const { booking, eventType } = input
  const answered = eventType.questions ? answeredQuestions(eventType, booking.answers) : []
  const local = (t: number) => formatInZone(t, input.tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  return {
    event: input.event,
    booking: {
      id: booking.id,
      status: booking.status,
      start: new Date(booking.startUtc).toISOString(),
      end: new Date(booking.endUtc).toISOString(),
      startLocal: local(booking.startUtc),
      endLocal: local(booking.endUtc),
      timezone: input.tz,
      durationMinutes: Math.round((booking.endUtc - booking.startUtc) / 60_000),
      location: booking.locationType ? { type: booking.locationType, value: booking.locationValue ?? null } : null,
      conferenceUrl: booking.conferenceUrl ?? null,
      rescheduleOf: booking.rescheduleOf ?? null,
      cancelledAt: booking.cancelledAt ? new Date(booking.cancelledAt).toISOString() : null,
      createdAt: booking.createdAt ? new Date(booking.createdAt).toISOString() : null,
    },
    guest: {
      name: booking.guestName,
      email: booking.guestEmail,
      timezone: booking.guestTimezone,
      guests: booking.guests ?? [],
    },
    answers: booking.answers,
    answersByLabel: Object.fromEntries(answered.map(({ question, value }) => [question.label, value])),
    eventType: { id: eventType.id, slug: eventType.slug, title: eventType.title, durationMinutes: eventType.durationMinutes },
    hosts: input.hosts.map((h) => ({ id: h.id, name: h.name || h.slug, email: h.email, slug: h.slug })),
    ...(input.hostsAdded ? { hostsAdded: input.hostsAdded } : {}),
    ...(input.hostsRemoved ? { hostsRemoved: input.hostsRemoved } : {}),
    link: input.link,
  }
}

/**
 * What goes over the wire to each service. Slack reads `text` as mrkdwn,
 * where `<…>` is a mention or a link — and the guest's name is public,
 * unauthenticated input (a guest named `<!channel>` would page the room;
 * caught by review). Slack's own rule: escape exactly `&`, `<`, `>`.
 */
export function slackPayload(m: ChatMessage): Record<string, unknown> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return { text: `*${esc(m.headline)}*\n${m.lines.map(esc).join('\n')}\n<${m.link}|Open booking>` }
}

export function telegramPayload(m: ChatMessage, chatId: string): Record<string, unknown> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return {
    chat_id: chatId,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    text: `<b>${esc(m.headline)}</b>\n${m.lines.map(esc).join('\n')}\n<a href="${esc(m.link)}">Open booking</a>`,
  }
}

/**
 * n8n gets JSON, not prose: the booking's fields (`ChatMessage.data`), with
 * the readable summary beside them for a workflow that just forwards text.
 * A test message has no booking, and says so with `test: true`.
 */
export function n8nPayload(m: ChatMessage): Record<string, unknown> {
  return {
    ...(m.data ?? { event: 'test', test: true }),
    summary: { headline: m.headline, lines: m.lines, text: [m.headline, ...m.lines].join('\n') },
    link: m.link,
  }
}
