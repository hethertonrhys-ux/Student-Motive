-- =====================================================================
-- Motive: starter data
--
-- Run AFTER the schema file (supabase/migrations/...initial_schema.sql).
-- Safe to run more than once: it skips rows that already exist.
--
-- NOTE: coordinates are approximate (to within ~50m). Check each pin on
-- the map before launch and adjust the lat/lng if it's off.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Venues: places events can be pinned to
-- ---------------------------------------------------------------------

insert into public.venues (name, short_name, kind, address, lat, lng)
select v.name, v.short_name, v.kind::public.venue_kind, v.address, v.lat, v.lng
from (values
  -- LSE campus
  ('Saw Swee Hock Student Centre', 'SAW', 'campus', '1 Sheffield Street, London WC2A 2AP',      51.51460, -0.11630),
  ('Marshall Building',            'MAR', 'campus', '44 Lincoln''s Inn Fields, London WC2A 3LY', 51.51560, -0.11700),
  ('Centre Building',              'CBG', 'campus', 'Houghton Street, London WC2A 2AE',          51.51410, -0.11670),
  ('Old Building',                 'OLD', 'campus', 'Houghton Street, London WC2A 2AE',          51.51380, -0.11680),
  ('New Academic Building',        'NAB', 'campus', '54 Lincoln''s Inn Fields, London WC2A 3LJ', 51.51530, -0.11820),
  ('LSE Library',                  'LIB', 'campus', '10 Portugal Street, London WC2A 2HD',       51.51480, -0.11760),
  ('Peacock Theatre',              'PEA', 'campus', 'Portugal Street, London WC2A 2HT',          51.51460, -0.11920),
  ('Clement House',                'CLM', 'campus', '99 Aldwych, London WC2B 4JF',               51.51310, -0.11620),

  -- LSE halls
  ('Bankside House',               null,  'hall',   '24 Sumner Street, London SE1 9JA',          51.50770, -0.09830),
  ('Butler''s Wharf Residence',    null,  'hall',   '11 Gainsford Street, London SE1 2NE',       51.50250, -0.07200),
  ('Carr-Saunders Hall',           null,  'hall',   '18-24 Fitzroy Street, London W1T 4BN',      51.52140, -0.13810),
  ('Grosvenor House',              null,  'hall',   '141-143 Drury Lane, London WC2B 5TB',       51.51430, -0.12180),
  ('High Holborn Residence',       null,  'hall',   '178 High Holborn, London WC1V 7AA',         51.51680, -0.12530),
  ('Lilian Knowles House',         null,  'hall',   '50 Crispin Street, London E1 6HQ',          51.51930, -0.07570),
  ('Northumberland House',         null,  'hall',   '8a Northumberland Avenue, London WC2N 5BY', 51.50750, -0.12550),
  ('Passfield Hall',               null,  'hall',   '1-7 Endsleigh Place, London WC1H 0PW',      51.52620, -0.13000),
  ('Rosebery Hall',                null,  'hall',   '90 Rosebery Avenue, London EC1R 4TY',       51.52650, -0.10930),
  ('Sidney Webb House',            null,  'hall',   '7 Great Dover Street, London SE1 4YA',      51.50100, -0.09250),

  -- Other universities
  ('UCL Main Campus',              'UCL', 'university', 'Gower Street, London WC1E 6BT',         51.52460, -0.13400),
  ('King''s College London, Strand', 'KCL', 'university', 'Strand, London WC2R 2LS',             51.51150, -0.11600),
  ('Imperial College, South Kensington', 'ICL', 'university', 'Exhibition Road, London SW7 2AZ', 51.49880, -0.17490)
) as v(name, short_name, kind, address, lat, lng)
where not exists (select 1 from public.venues existing where existing.name = v.name);


-- ---------------------------------------------------------------------
-- Organisations: halls, other universities, and a first LSE society.
-- The full LSE society list gets added in a later step.
-- ---------------------------------------------------------------------

insert into public.societies (slug, name, kind, university, is_verified)
values
  -- LSE halls
  ('bankside-house',          'Bankside House',            'hall', 'LSE', true),
  ('butlers-wharf',           'Butler''s Wharf Residence', 'hall', 'LSE', true),
  ('carr-saunders-hall',      'Carr-Saunders Hall',        'hall', 'LSE', true),
  ('grosvenor-house',         'Grosvenor House',           'hall', 'LSE', true),
  ('high-holborn',            'High Holborn Residence',    'hall', 'LSE', true),
  ('lilian-knowles-house',    'Lilian Knowles House',      'hall', 'LSE', true),
  ('northumberland-house',    'Northumberland House',      'hall', 'LSE', true),
  ('passfield-hall',          'Passfield Hall',            'hall', 'LSE', true),
  ('rosebery-hall',           'Rosebery Hall',             'hall', 'LSE', true),
  ('sidney-webb-house',       'Sidney Webb House',         'hall', 'LSE', true),

  -- Other universities
  ('ucl',                     'UCL',                       'university', 'UCL',      true),
  ('kings-college-london',    'King''s College London',    'university', 'KCL',      true),
  ('imperial-college-london', 'Imperial College London',   'university', 'Imperial', true),

  -- LSE societies
  ('lse-poker-society',       'LSE Poker Society',         'society', 'LSE', false)
on conflict (slug) do nothing;
