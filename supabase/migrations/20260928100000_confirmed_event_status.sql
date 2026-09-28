-- Kept separate: PostgreSQL requires a commit before a new enum value is used.
alter type public.event_status add value if not exists 'confirmed' after 'open';
