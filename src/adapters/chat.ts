/**
 * Posting one booking notification to a Slack, Telegram or n8n destination.
 * Shared by the queue consumer (the real path) and the dashboard's "Send a
 * test" button (synchronous, so the host sees the result).
 */

import type { ChannelConfig, ChatMessage } from '../core/domain/chat-notify.js'
import { n8nPayload, slackPayload, telegramPayload } from '../core/domain/chat-notify.js'

const SERVICE = { slack: 'Slack', telegram: 'Telegram', n8n: 'n8n' } as const

export async function postChatMessage(
  config: ChannelConfig,
  message: ChatMessage,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const url =
    config.kind === 'slack' ? config.webhookUrl : config.kind === 'n8n' ? config.url : `https://api.telegram.org/bot${config.botToken}/sendMessage`
  const body = config.kind === 'slack' ? slackPayload(message) : config.kind === 'n8n' ? n8nPayload(message) : telegramPayload(message, config.chatId)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  // n8n's Webhook node checks this with Header Auth (name X-Webhook-Secret).
  if (config.kind === 'n8n' && config.secret) headers['x-webhook-secret'] = config.secret
  let res: Response
  try {
    res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
  if (res.ok) return { ok: true }
  // Telegram explains itself in JSON; Slack answers with a short word; n8n
  // says whether the workflow is active. None can contain the secret, which
  // lives in the URL or a header — never echoed.
  const text = (await res.text().catch(() => '')).slice(0, 200)
  return { ok: false, detail: `${SERVICE[config.kind]} answered ${res.status}${text ? `: ${text}` : ''}` }
}
