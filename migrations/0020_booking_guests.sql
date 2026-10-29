-- Guests the booker invites along (core/domain/booking-options.ts).
--
-- Forward-only and additive (ADR-0006 §4). Off by default for every event
-- type, existing ones included: the host turns it on per event type. A
-- booking's invited guests, as a JSON list of email addresses; empty for
-- every existing booking.

ALTER TABLE event_types ADD COLUMN allow_guests INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN guests_json TEXT NOT NULL DEFAULT '[]';
