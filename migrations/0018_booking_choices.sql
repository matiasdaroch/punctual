-- Guest-chosen duration and location (core/domain/booking-options.ts).
--
-- Forward-only and additive (ADR-0006 §4). An event type's further
-- durations and locations, besides its default; empty means the default
-- only, which is every existing row. A booking's chosen location; NULL
-- means the event type's default, which is every existing booking. The
-- chosen duration needs no column: it is end_utc - start_utc.

ALTER TABLE event_types ADD COLUMN duration_options_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE event_types ADD COLUMN location_options_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN location_type TEXT;
ALTER TABLE bookings ADD COLUMN location_value TEXT;
