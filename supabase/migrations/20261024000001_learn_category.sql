-- Follow-up: a "Learn" category for Social events (workshops, skills,
-- talks by students). Only adds a new choice; nothing existing changes.
alter type public.social_category add value if not exists 'learn';
