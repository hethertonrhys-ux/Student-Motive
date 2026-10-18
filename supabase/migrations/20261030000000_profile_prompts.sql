-- Item 17: profile prompts (like Hinge) replace "About me". Each person
-- answers up to 3 questions from the app's list. The old "About me" text
-- (profiles.bio) is kept exactly as it is, just no longer shown.
-- Only adds a table and a function.

create table if not exists public.profile_prompts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  prompt_id  text not null check (char_length(prompt_id) between 1 and 40),
  answer     text not null check (char_length(answer) between 1 and 150),
  position   smallint not null check (position between 0 and 2),
  updated_at timestamptz not null default now(),
  primary key (user_id, prompt_id)
);

alter table public.profile_prompts enable row level security;

-- Logged-in people can read answers, unless one of you has blocked the other.
-- Changes go through save_profile_prompts() below.
drop policy if exists profile_prompts_select on public.profile_prompts;
create policy profile_prompts_select on public.profile_prompts for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_motive_admin()
    or not public.is_blocked_between(user_id, (select auth.uid()))
  );

-- Save your answers (a list of up to 3 {prompt_id, answer}), replacing the
-- ones you had.
create or replace function public.save_profile_prompts(answers jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  if jsonb_typeof(answers) <> 'array' then raise exception 'Something went wrong. Please try again.'; end if;
  if jsonb_array_length(answers) > 3 then raise exception 'You can answer up to 3 prompts'; end if;
  delete from public.profile_prompts where user_id = uid;
  insert into public.profile_prompts (user_id, prompt_id, answer, position)
  select uid, a->>'prompt_id', trim(a->>'answer'), (n - 1)::smallint
  from jsonb_array_elements(answers) with ordinality as t(a, n);
end;
$$;
revoke execute on function public.save_profile_prompts(jsonb) from public, anon;
grant execute on function public.save_profile_prompts(jsonb) to authenticated;
