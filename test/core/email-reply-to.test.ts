import { describe, expect, it } from 'vitest'
import { withDefaultReplyTo } from '../../src/adapters/email/index.js'
import type { EmailMessage, EmailSender } from '../../src/ports.js'

function capture() {
  const seen: EmailMessage[] = []
  const sender: EmailSender = { async send(m) { seen.push(m) } }
  return { seen, sender }
}
const base: EmailMessage = { to: 'guest@x.y', subject: 's', html: '<p>h</p>', text: 't' }

describe('withDefaultReplyTo', () => {
  it('adds the default reply-to when a message has none', async () => {
    const { seen, sender } = capture()
    await withDefaultReplyTo(sender, 'hello@mikarch.com').send(base)
    expect(seen[0]?.replyTo).toBe('hello@mikarch.com')
  })
  it("keeps a message's own reply-to (host copy replies to the guest)", async () => {
    const { seen, sender } = capture()
    await withDefaultReplyTo(sender, 'hello@mikarch.com').send({ ...base, replyTo: 'guest@x.y' })
    expect(seen[0]?.replyTo).toBe('guest@x.y')
  })
  it('is a no-op when unset or blank', async () => {
    const { sender } = capture()
    expect(withDefaultReplyTo(sender, undefined)).toBe(sender)
    expect(withDefaultReplyTo(sender, '  ')).toBe(sender)
  })
})
