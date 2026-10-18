-- Item 4: a "Food" category for Social events. Only adds a new choice;
-- nothing existing changes.
alter type public.social_category add value if not exists 'food';
