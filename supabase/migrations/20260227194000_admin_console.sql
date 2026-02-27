alter table public.waitlist
  add column if not exists beta_invited_at timestamptz null,
  add column if not exists beta_active boolean not null default false,
  add column if not exists beta_notes text null;

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body_markdown text not null,
  segment jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  recipient_count int not null default 0
);

create table if not exists public.email_campaign_recipients (
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  email text not null,
  status text not null,
  sent_at timestamptz null,
  error_code text null,
  primary key (campaign_id, email)
);

create index if not exists email_campaigns_created_at_idx
  on public.email_campaigns (created_at desc);

create index if not exists email_campaign_recipients_campaign_id_idx
  on public.email_campaign_recipients (campaign_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_campaign_recipients_status_chk'
      and conrelid = 'public.email_campaign_recipients'::regclass
  ) then
    alter table public.email_campaign_recipients
      add constraint email_campaign_recipients_status_chk
      check (status in ('sent', 'failed', 'skipped'));
  end if;
end;
$$;

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;

revoke all on table public.email_campaigns from anon;
revoke all on table public.email_campaigns from authenticated;
revoke all on table public.email_campaign_recipients from anon;
revoke all on table public.email_campaign_recipients from authenticated;

drop policy if exists email_campaigns_no_direct_access on public.email_campaigns;
create policy email_campaigns_no_direct_access
  on public.email_campaigns
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists email_campaign_recipients_no_direct_access on public.email_campaign_recipients;
create policy email_campaign_recipients_no_direct_access
  on public.email_campaign_recipients
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.waitlist_admin_stats()
returns table (
  total bigint,
  marketing_opt_in bigint,
  unsubscribed bigint,
  last_7_days bigint,
  beta_invited bigint,
  beta_active bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(*)::bigint as total,
    count(*) filter (
      where w.marketing_consent = true
        and w.unsubscribed_at is null
    )::bigint as marketing_opt_in,
    count(*) filter (
      where w.unsubscribed_at is not null
    )::bigint as unsubscribed,
    count(*) filter (
      where w.created_at >= now() - interval '7 days'
    )::bigint as last_7_days,
    count(*) filter (
      where w.beta_invited_at is not null
    )::bigint as beta_invited,
    count(*) filter (
      where w.beta_active = true
    )::bigint as beta_active
  from public.waitlist w;
$$;

create or replace function public.waitlist_admin_list(
  p_marketing boolean default null,
  p_source text default null,
  p_subscribed_only boolean default false,
  p_beta text default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  email text,
  created_at timestamptz,
  source text,
  marketing_consent boolean,
  unsubscribed_at timestamptz,
  beta_invited_at timestamptz,
  beta_active boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_beta text := lower(trim(coalesce(p_beta, '')));
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_beta not in ('', 'invited', 'active', 'none') then
    raise exception using errcode = '22023', message = 'invalid_beta_filter';
  end if;

  return query
  with filtered as (
    select
      w.email,
      w.created_at,
      w.source,
      w.marketing_consent,
      w.unsubscribed_at,
      w.beta_invited_at,
      w.beta_active
    from public.waitlist w
    where (p_marketing is null or w.marketing_consent = p_marketing)
      and (nullif(trim(coalesce(p_source, '')), '') is null or w.source = trim(p_source))
      and (coalesce(p_subscribed_only, false) = false or w.unsubscribed_at is null)
      and (
        v_beta = ''
        or (v_beta = 'invited' and w.beta_invited_at is not null)
        or (v_beta = 'active' and w.beta_active = true)
        or (v_beta = 'none' and w.beta_invited_at is null and w.beta_active = false)
      )
      and (p_from is null or w.created_at >= p_from::timestamptz)
      and (p_to is null or w.created_at < (p_to::timestamptz + interval '1 day'))
  )
  select
    f.email,
    f.created_at,
    f.source,
    f.marketing_consent,
    f.unsubscribed_at,
    f.beta_invited_at,
    f.beta_active,
    count(*) over()::bigint as total_count
  from filtered f
  order by f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.waitlist_admin_invite_beta_emails(
  p_emails text[]
)
returns table (updated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
begin
  if p_emails is null or array_length(p_emails, 1) is null then
    updated_count := 0;
    return next;
    return;
  end if;

  with normalized as (
    select distinct lower(trim(e)) as email
    from unnest(p_emails) as e
    where trim(coalesce(e, '')) <> ''
  )
  update public.waitlist w
  set beta_invited_at = coalesce(w.beta_invited_at, now())
  where w.email in (select n.email from normalized n);

  get diagnostics v_updated = row_count;
  updated_count := v_updated;
  return next;
end;
$$;

create or replace function public.waitlist_admin_invite_beta_segment(
  p_marketing boolean default null,
  p_source text default null,
  p_subscribed_only boolean default false,
  p_beta text default null,
  p_from date default null,
  p_to date default null
)
returns table (updated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_beta text := lower(trim(coalesce(p_beta, '')));
  v_updated int := 0;
begin
  if v_beta not in ('', 'invited', 'active', 'none') then
    raise exception using errcode = '22023', message = 'invalid_beta_filter';
  end if;

  update public.waitlist w
  set beta_invited_at = coalesce(w.beta_invited_at, now())
  where (p_marketing is null or w.marketing_consent = p_marketing)
    and (nullif(trim(coalesce(p_source, '')), '') is null or w.source = trim(p_source))
    and (coalesce(p_subscribed_only, false) = false or w.unsubscribed_at is null)
    and (
      v_beta = ''
      or (v_beta = 'invited' and w.beta_invited_at is not null)
      or (v_beta = 'active' and w.beta_active = true)
      or (v_beta = 'none' and w.beta_invited_at is null and w.beta_active = false)
    )
    and (p_from is null or w.created_at >= p_from::timestamptz)
    and (p_to is null or w.created_at < (p_to::timestamptz + interval '1 day'));

  get diagnostics v_updated = row_count;
  updated_count := v_updated;
  return next;
end;
$$;

create or replace function public.waitlist_admin_set_beta_active(
  p_email text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_active boolean := coalesce(p_active, false);
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

  update public.waitlist w
  set
    beta_active = v_active,
    beta_invited_at = case
      when v_active = true then coalesce(w.beta_invited_at, now())
      else w.beta_invited_at
    end
  where w.email = v_email;
end;
$$;

create or replace function public.waitlist_admin_create_campaign(
  p_subject text,
  p_body_markdown text,
  p_segment jsonb
)
returns table (campaign_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := trim(coalesce(p_subject, ''));
  v_body text := trim(coalesce(p_body_markdown, ''));
  v_segment jsonb := coalesce(p_segment, '{}'::jsonb);
begin
  if v_subject = '' then
    raise exception using errcode = '22023', message = 'invalid_subject';
  end if;

  if v_body = '' then
    raise exception using errcode = '22023', message = 'invalid_body';
  end if;

  insert into public.email_campaigns (
    subject,
    body_markdown,
    segment
  )
  values (
    v_subject,
    v_body,
    v_segment
  )
  returning id into campaign_id;

  return next;
end;
$$;

create or replace function public.waitlist_admin_campaign_add_recipients(
  p_campaign_id uuid,
  p_emails text[]
)
returns table (inserted_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
begin
  if p_campaign_id is null then
    raise exception using errcode = '22023', message = 'invalid_campaign_id';
  end if;

  if p_emails is null or array_length(p_emails, 1) is null then
    inserted_count := 0;
    return next;
    return;
  end if;

  with normalized as (
    select distinct lower(trim(e)) as email
    from unnest(p_emails) as e
    where trim(coalesce(e, '')) <> ''
  )
  insert into public.email_campaign_recipients (
    campaign_id,
    email,
    status,
    sent_at,
    error_code
  )
  select
    p_campaign_id,
    n.email,
    'skipped',
    null,
    null
  from normalized n
  on conflict (campaign_id, email) do nothing;

  get diagnostics v_inserted = row_count;
  inserted_count := v_inserted;
  return next;
end;
$$;

create or replace function public.waitlist_admin_campaign_set_recipient_result(
  p_campaign_id uuid,
  p_email text,
  p_status text,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if p_campaign_id is null then
    raise exception using errcode = '22023', message = 'invalid_campaign_id';
  end if;

  if v_email = '' then
    raise exception using errcode = '22023', message = 'invalid_email';
  end if;

  if v_status not in ('sent', 'failed', 'skipped') then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  update public.email_campaign_recipients r
  set
    status = v_status,
    sent_at = case when v_status = 'sent' then now() else null end,
    error_code = case
      when v_status = 'failed' then nullif(trim(coalesce(p_error_code, '')), '')
      else null
    end
  where r.campaign_id = p_campaign_id
    and r.email = v_email;
end;
$$;

create or replace function public.waitlist_admin_campaign_mark_sent(
  p_campaign_id uuid,
  p_recipient_count int default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_campaign_id is null then
    raise exception using errcode = '22023', message = 'invalid_campaign_id';
  end if;

  update public.email_campaigns c
  set
    sent_at = now(),
    recipient_count = greatest(coalesce(p_recipient_count, 0), 0)
  where c.id = p_campaign_id;
end;
$$;

create or replace function public.waitlist_admin_get_campaign(
  p_campaign_id uuid
)
returns table (
  id uuid,
  subject text,
  body_markdown text,
  segment jsonb,
  created_at timestamptz,
  sent_at timestamptz,
  recipient_count int,
  sent_count int,
  failed_count int,
  skipped_count int
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.subject,
    c.body_markdown,
    c.segment,
    c.created_at,
    c.sent_at,
    c.recipient_count,
    coalesce(rc.sent_count, 0) as sent_count,
    coalesce(rc.failed_count, 0) as failed_count,
    coalesce(rc.skipped_count, 0) as skipped_count
  from public.email_campaigns c
  left join (
    select
      r.campaign_id,
      count(*) filter (where r.status = 'sent')::int as sent_count,
      count(*) filter (where r.status = 'failed')::int as failed_count,
      count(*) filter (where r.status = 'skipped')::int as skipped_count
    from public.email_campaign_recipients r
    where r.campaign_id = p_campaign_id
    group by r.campaign_id
  ) rc
    on rc.campaign_id = c.id
  where c.id = p_campaign_id;
$$;

create or replace function public.waitlist_admin_list_campaign_recipients(
  p_campaign_id uuid,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  email text,
  status text,
  sent_at timestamptz,
  error_code text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if p_campaign_id is null then
    raise exception using errcode = '22023', message = 'invalid_campaign_id';
  end if;

  return query
  with filtered as (
    select
      r.email,
      r.status,
      r.sent_at,
      r.error_code
    from public.email_campaign_recipients r
    where r.campaign_id = p_campaign_id
  )
  select
    f.email,
    f.status,
    f.sent_at,
    f.error_code,
    count(*) over()::bigint as total_count
  from filtered f
  order by f.email asc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.waitlist_admin_stats() from public;
grant execute on function public.waitlist_admin_stats() to anon, authenticated;

revoke all on function public.waitlist_admin_list(
  boolean,
  text,
  boolean,
  text,
  date,
  date,
  int,
  int
) from public;
grant execute on function public.waitlist_admin_list(
  boolean,
  text,
  boolean,
  text,
  date,
  date,
  int,
  int
) to anon, authenticated;

revoke all on function public.waitlist_admin_invite_beta_emails(text[]) from public;
grant execute on function public.waitlist_admin_invite_beta_emails(text[]) to anon, authenticated;

revoke all on function public.waitlist_admin_invite_beta_segment(
  boolean,
  text,
  boolean,
  text,
  date,
  date
) from public;
grant execute on function public.waitlist_admin_invite_beta_segment(
  boolean,
  text,
  boolean,
  text,
  date,
  date
) to anon, authenticated;

revoke all on function public.waitlist_admin_set_beta_active(text, boolean) from public;
grant execute on function public.waitlist_admin_set_beta_active(text, boolean) to anon, authenticated;

revoke all on function public.waitlist_admin_create_campaign(text, text, jsonb) from public;
grant execute on function public.waitlist_admin_create_campaign(text, text, jsonb) to anon, authenticated;

revoke all on function public.waitlist_admin_campaign_add_recipients(uuid, text[]) from public;
grant execute on function public.waitlist_admin_campaign_add_recipients(uuid, text[]) to anon, authenticated;

revoke all on function public.waitlist_admin_campaign_set_recipient_result(uuid, text, text, text) from public;
grant execute on function public.waitlist_admin_campaign_set_recipient_result(uuid, text, text, text) to anon, authenticated;

revoke all on function public.waitlist_admin_campaign_mark_sent(uuid, int) from public;
grant execute on function public.waitlist_admin_campaign_mark_sent(uuid, int) to anon, authenticated;

revoke all on function public.waitlist_admin_get_campaign(uuid) from public;
grant execute on function public.waitlist_admin_get_campaign(uuid) to anon, authenticated;

revoke all on function public.waitlist_admin_list_campaign_recipients(uuid, int, int) from public;
grant execute on function public.waitlist_admin_list_campaign_recipients(uuid, int, int) to anon, authenticated;
