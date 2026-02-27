alter table public.waitlist
  add column if not exists consent_waitlist boolean not null default true,
  add column if not exists consent_marketing boolean not null default false,
  add column if not exists consent_age_16 boolean not null default false,
  add column if not exists consent_ts timestamptz not null default now(),
  add column if not exists consent_source text null,
  add column if not exists consent_version text null,
  add column if not exists unsubscribed_all boolean not null default false,
  add column if not exists unsubscribed_marketing boolean not null default false,
  add column if not exists unsubscribed_ts timestamptz null;

update public.waitlist
set
  consent_waitlist = true,
  consent_age_16 = true,
  consent_ts = coalesce(consent_ts, now()),
  consent_source = coalesce(consent_source, source),
  consent_version = coalesce(consent_version, 'legacy_pre_consent_split')
where consent_age_16 = false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'waitlist_consent_age_16_true_chk'
      and conrelid = 'public.waitlist'::regclass
  ) then
    alter table public.waitlist
      add constraint waitlist_consent_age_16_true_chk
      check (consent_age_16 = true);
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
      and indexdef ~ '\(email\)'
  ) then
    create index waitlist_email_idx on public.waitlist (email);
  end if;
end;
$$;

create unique index if not exists waitlist_email_lower_unique_idx
  on public.waitlist (lower(email));

drop function if exists public.insert_waitlist(text, text, text, text);
create or replace function public.insert_waitlist(
  p_email text,
  p_source text default 'landing',
  p_user_agent text default null,
  p_ip_hash text default null,
  p_consent_age_16 boolean default false,
  p_consent_marketing boolean default false,
  p_consent_source text default 'landing',
  p_consent_version text default null
)
returns table (already_joined boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_source text := left(coalesce(nullif(trim(p_source), ''), 'landing'), 64);
  v_user_agent text := nullif(left(trim(coalesce(p_user_agent, '')), 512), '');
  v_ip_hash text := nullif(lower(trim(coalesce(p_ip_hash, ''))), '');
  v_consent_marketing boolean := coalesce(p_consent_marketing, false);
  v_consent_source text := nullif(
    left(trim(coalesce(p_consent_source, 'landing')), 64),
    ''
  );
  v_consent_version text := nullif(
    left(trim(coalesce(p_consent_version, '')), 128),
    ''
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

  if coalesce(p_consent_age_16, false) is not true then
    raise exception using errcode = '22023', message = 'invalid_age_consent';
  end if;

  insert into public.waitlist (
    email,
    source,
    user_agent,
    ip_hash,
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
    v_consent_marketing,
    true,
    now(),
    coalesce(v_consent_source, 'landing'),
    v_consent_version
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 and v_consent_marketing = true then
    update public.waitlist
    set
      consent_marketing = true,
      consent_ts = now(),
      consent_source = coalesce(v_consent_source, consent_source, 'landing'),
      consent_version = coalesce(v_consent_version, consent_version)
    where email = v_email
      and consent_marketing = false
      and unsubscribed_marketing = false
      and unsubscribed_all = false;
  end if;

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
  text,
  text
) from public;
grant execute on function public.insert_waitlist(
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text,
  text
) to anon;
grant execute on function public.insert_waitlist(
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text,
  text
) to authenticated;

create or replace function public.unsubscribe_waitlist(
  p_email text,
  p_scope text default 'all'
)
returns table (
  updated boolean,
  unsubscribed_all boolean,
  unsubscribed_marketing boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_scope text := lower(trim(coalesce(p_scope, 'all')));
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

  if v_scope not in ('all', 'marketing') then
    raise exception using errcode = '22023', message = 'invalid_scope';
  end if;

  if v_scope = 'all' then
    update public.waitlist
    set
      unsubscribed_all = true,
      unsubscribed_marketing = true,
      unsubscribed_ts = now()
    where email = v_email;
  else
    update public.waitlist
    set
      unsubscribed_marketing = true,
      unsubscribed_ts = now()
    where email = v_email;
  end if;

  if found then
    return query
    select
      true as updated,
      w.unsubscribed_all,
      w.unsubscribed_marketing
    from public.waitlist w
    where w.email = v_email;
    return;
  end if;

  return query
  select
    false as updated,
    false as unsubscribed_all,
    false as unsubscribed_marketing;
end;
$$;

revoke all on function public.unsubscribe_waitlist(text, text) from public;
grant execute on function public.unsubscribe_waitlist(text, text) to anon;
grant execute on function public.unsubscribe_waitlist(text, text) to authenticated;

create or replace function public.waitlist_recipients_product_updates()
returns table (email text)
language sql
security definer
set search_path = public
as $$
  select w.email
  from public.waitlist w
  where w.consent_waitlist = true
    and w.unsubscribed_all = false;
$$;

create or replace function public.waitlist_recipients_marketing()
returns table (email text)
language sql
security definer
set search_path = public
as $$
  select w.email
  from public.waitlist w
  where w.consent_marketing = true
    and w.unsubscribed_marketing = false
    and w.unsubscribed_all = false;
$$;

revoke all on function public.waitlist_recipients_product_updates() from public;
revoke all on function public.waitlist_recipients_marketing() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.waitlist_recipients_product_updates() to service_role;
    grant execute on function public.waitlist_recipients_marketing() to service_role;
  end if;
end;
$$;
