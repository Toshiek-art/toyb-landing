alter table public.waitlist
  add column if not exists age_confirmed boolean not null default false,
  add column if not exists privacy_accepted boolean not null default false,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists privacy_version text not null default '2026-02-25',
  add column if not exists privacy_accepted_at timestamptz null,
  add column if not exists marketing_consent_at timestamptz null,
  add column if not exists unsubscribed_at timestamptz null,
  add column if not exists unsubscribe_scope text null;

alter table public.waitlist
  alter column source set default 'landing';

alter table public.waitlist
  drop column if exists consent_waitlist,
  drop column if exists consent_marketing,
  drop column if exists consent_age_16,
  drop column if exists consent_ts,
  drop column if exists consent_source,
  drop column if exists consent_version,
  drop column if exists unsubscribed_all,
  drop column if exists unsubscribed_marketing,
  drop column if exists unsubscribed_ts;

drop index if exists waitlist_email_lower_unique_idx;
create unique index if not exists waitlist_email_unique_idx
  on public.waitlist (email);

drop function if exists public.insert_waitlist(text, text, text, text);
drop function if exists public.insert_waitlist(text, text, text, text, boolean, boolean, text, text);
drop function if exists public.insert_waitlist(text, text, text, text, boolean, boolean, boolean, text);
drop function if exists public.unsubscribe_waitlist(text, text);
drop function if exists public.waitlist_recipients_product_updates();
drop function if exists public.waitlist_recipients_marketing();

create or replace function public.waitlist_upsert(
  p_email text,
  p_source text default 'landing',
  p_user_agent text default null,
  p_ip_hash text default null,
  p_age_confirmed boolean default false,
  p_privacy_accepted boolean default false,
  p_marketing_consent boolean default false,
  p_privacy_version text default null
)
returns table (
  inserted boolean,
  updated boolean
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
  v_privacy_version text := nullif(left(trim(coalesce(p_privacy_version, '')), 64), '');
  v_now timestamptz := now();
  v_existing public.waitlist%rowtype;
  v_updated boolean := false;
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

  if v_privacy_version is null then
    raise exception using errcode = '22023', message = 'invalid_privacy_version';
  end if;

  select *
  into v_existing
  from public.waitlist
  where email = v_email
  for update;

  if not found then
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
      unsubscribed_at,
      unsubscribe_scope
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
      v_now,
      case when v_marketing_consent then v_now else null end,
      null,
      null
    );

    inserted := true;
    updated := false;
    return next;
    return;
  end if;

  if v_existing.marketing_consent = false and v_marketing_consent = true then
    v_updated := true;
  end if;

  if v_existing.privacy_version is distinct from v_privacy_version then
    v_updated := true;
  end if;

  if v_existing.privacy_accepted_at is null then
    v_updated := true;
  end if;

  update public.waitlist
  set
    marketing_consent = case
      when marketing_consent = false and v_marketing_consent = true then true
      else marketing_consent
    end,
    marketing_consent_at = case
      when marketing_consent = false and v_marketing_consent = true then coalesce(marketing_consent_at, v_now)
      else marketing_consent_at
    end,
    privacy_version = case
      when privacy_version is distinct from v_privacy_version then v_privacy_version
      else privacy_version
    end,
    privacy_accepted_at = coalesce(privacy_accepted_at, v_now)
  where id = v_existing.id;

  inserted := false;
  updated := v_updated;
  return next;
end;
$$;

create or replace function public.waitlist_apply_unsubscribe(
  p_email text,
  p_scope text default 'marketing'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_scope text := lower(trim(coalesce(p_scope, 'marketing')));
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

  update public.waitlist
  set
    unsubscribed_at = coalesce(unsubscribed_at, now()),
    unsubscribe_scope = v_scope,
    marketing_consent = false
  where email = v_email;
end;
$$;

revoke all on function public.waitlist_upsert(
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  text
) from public;

grant execute on function public.waitlist_upsert(
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  text
) to anon;

grant execute on function public.waitlist_upsert(
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  text
) to authenticated;

revoke all on function public.waitlist_apply_unsubscribe(text, text) from public;
grant execute on function public.waitlist_apply_unsubscribe(text, text) to anon;
grant execute on function public.waitlist_apply_unsubscribe(text, text) to authenticated;
