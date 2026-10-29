-- A person's main event (http/router.ts): their bare address, /<slug>, opens
-- it, so the link they share most needs no event slug. NULL for everyone
-- now: until one is picked, /<slug> opens the only active event when there
-- is exactly one.

ALTER TABLE users ADD COLUMN main_event_type_id TEXT;
