-- location_options_json now holds EVERY location a guest may pick, the
-- default first, so each can carry its own label (core/domain/booking-options.ts).
-- Until now it held only the extras after the default in location_type /
-- location_value: prepend that default to every non-empty list. An empty
-- list still means "the default only" and is left alone.

UPDATE event_types
SET location_options_json = json(
  '[' || json_object('type', location_type, 'value', location_value) || ',' || substr(trim(location_options_json), 2)
)
WHERE json_valid(location_options_json) AND json_array_length(location_options_json) > 0;
