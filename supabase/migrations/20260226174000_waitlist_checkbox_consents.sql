alter table public.waitlist
  add column if not exists age_confirmed boolean not null default false,
  add column if not exists privacy_accepted boolean not null default false,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists privacy_version text not null default '2026-02-25',
  add column if not exists privacy_accepted_at timestamptz null,
  add column if not exists marketing_consent_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'waitlist_age_confirmed_true_chk'
      and conrelid = 'public.waitlist'::regclass
  ) then
    alter table public.waitlist
      add constraint waitlist_age_confirmed_true_chk
      check (age_confirmed = true) not valid;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'waitlist_privacy_accepted_true_chk'
      and conrelid = 'public.waitlist'::regclass
  ) then
    alter table public.waitlist
      add constraint waitlist_privacy_accepted_true_chk
      check (privacy_accepted = true) not valid;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'waitlist'
      and indexname = 'waitlist_email_idx'
  ) then
    create index waitlist_email_idx on public.waitlist (email);
  end if;
end;
$$;

create unique index if not exists waitlist_email_lower_unique_idx
  on public.waitlist (lower(email));

drop function if exists public.insert_waitlist(text, text, text, text);
drop function if exists public.insert_waitlist(text, text, text, text, boolean, boolean, text, text);

create or replace function public.insert_waitlist(
  p_email text,
  p_source text default 'landing',
  p_user_agent text default null,
  p_ip_hash text default null,
  p_age_confirmed boolean default false,
  p_privacy_accepted boolean default false,
  p_marketing_consent boolean default false,
  p_privacy_version text default '2026-02-25'
)
returns table (
  already_joined boolean,
  recorded_marketing_consent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_source text := left(coalesce(nullif(trim(p_source), ''), 'landing'), 64);
  v_user_agent text := nullif(left(trim(coalesce(p_user_agent, '')), 512), '');
  v_ip_hash text := nullif(lower(trim(coalesce(p_ip_hash, ''))), '');
  v_marketing_consent boolean := coalesce(p_marketing_consent, false);
  v_privacy_version text := coalesce(
    nullif(left(trim(coalesce(p_privacy_version, '2026-02-25')), 64), ''),
    '2026-02-25'
  );
  v_inserted int := 0;
begin
  if v_email = '' then
    raise exception using errcode = '22023', message = 'invalid_email';
  end if;

  if char_length(v_email) > 320 then
    raise exception using errcode = '22023', message = 'invalid_email';
  end if;

  if v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception using errcode = '22023', message = 'invalid_email';
  end if;

  if v_ip_hash is not null and v_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_ip_hash';
  end if;

  if coalesce(p_age_confirmed, false) is not true then
    raise exception using errcode = '22023', message = 'invalid_age_confirmed';
  end if;

  if coalesce(p_privacy_accepted, false) is not true then
    raise exception using errcode = '22023', message = 'invalid_privacy_accepted';
  end if;

  insert into public.waitlist (
    email,
    source,
    user_agent,
    ip_hash,
    age_confirmed,
    privacy_accepted,
    marketing_consent,
    privacy_version,
    privacy_accepted_at,
    marketing_consent_at,
    consent_waitlist,
    consent_marketing,
    consent_age_16,
    consent_ts,
    consent_source,
    consent_version
  )
  values (
    v_email,
    v_source,
    v_user_agent,
    v_ip_hash,
    true,
    true,
    v_marketing_consent,
    v_privacy_version,
    now(),
    case when v_marketing_consent then now() else null end,
    true,
    v_marketing_consent,
    true,
    now(),
    'landing',
    v_privacy_version
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 and v_marketing_consent = true then
    update public.waitlist
    set
      marketing_consent = true,
      marketing_consent_at = coalesce(marketing_consent_at, now()),
      privacy_version = coalesce(v_privacy_version, privacy_version),
      consent_marketing = true,
      consent_ts = now(),
      consent_version = coalesce(v_privacy_version, consent_version)
    where email = v_email
      and marketing_consent = false
      and unsubscribed_marketing = false
      and unsubscribed_all = false;
  end if;

  select coalesce(w.marketing_consent, false)
  into recorded_marketing_consent
  from public.waitlist w
  where w.email = v_email;

  already_joined := (v_inserted = 0);
  return next;
end;
$$;

revoke all on function public.insert_waitlist(
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  text
) from public;
grant execute on function public.insert_waitlist(
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  text
) to anon;
grant execute on function public.insert_waitlist(
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  text
) to authenticated;

-- Inspect rows quickly:
-- select email, age_confirmed, privacy_accepted, marketing_consent, privacy_version,
--        privacy_accepted_at, marketing_consent_at
-- from public.waitlist
-- order by created_at desc
-- limit 50;
