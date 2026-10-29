/**
 * The guest's reschedule-or-cancel link in calendar events: behind words
 * where the calendar renders HTML, spelled out only in plain text.
 */

import { describe, expect, it } from 'vitest'
import { descriptionHtml } from '../../src/core/domain/calendar-text.js'
import { toGoogleEvent } from '../../src/adapters/google/provider.js'
import { toGraphEvent } from '../../src/adapters/microsoft/provider.js'
import type { ExternalEvent } from '../../src/ports.js'

const url = 'https://meet.test/booking/b1?token=a.b&c'

describe('descriptionHtml', () => {
  it('keeps line breaks, escapes the text, and puts the link behind words', () => {
    expect(descriptionHtml('Participants\n• A <a@x.com>', url)).toBe(
      'Participants<br>• A &lt;a@x.com&gt;<br><br><a href="https://meet.test/booking/b1?token=a.b&amp;c">Need to reschedule or cancel?</a>',
    )
    expect(descriptionHtml('Just text')).toBe('Just text')
  })
})

describe('provider event bodies', () => {
  const event: ExternalEvent = {
    title: 'Intro',
    description: 'Participants\n• Guest',
    start: 0,
    end: 30 * 60_000,
    attendees: [{ email: 'g@x.com' }],
    timezone: 'UTC',
    manageUrl: url,
  }

  it('gives Google an HTML description with the link hidden behind words', () => {
    const body = toGoogleEvent(event) as { description: string }
    expect(body.description).toContain('>Need to reschedule or cancel?</a>')
    expect(body.description).not.toMatch(/\? https:/)
  })

  it('gives Microsoft the same', () => {
    const body = toGraphEvent(event) as { body: { content: string } }
    expect(body.body.content).toContain('>Need to reschedule or cancel?</a>')
  })

  it('leaves a description with no link as plain text for Google', () => {
    const { manageUrl: _, ...plain } = event
    expect((toGoogleEvent(plain) as { description: string }).description).toBe('Participants\n• Guest')
  })
})
