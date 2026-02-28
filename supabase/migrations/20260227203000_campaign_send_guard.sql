alter table public.email_campaigns
  add column if not exists status text not null default 'draft';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_campaigns_status_chk'
      and conrelid = 'public.email_campaigns'::regclass
  ) then
    alter table public.email_campaigns
      add constraint email_campaigns_status_chk
      check (status in ('draft', 'sending', 'sent'));
  end if;
end;
$$;

update public.email_campaigns
set status = 'sent'
where sent_at is not null
  and status <> 'sent';

create or replace function public.waitlist_admin_campaign_begin_send(
  p_campaign_id uuid
)
returns table (
  can_send boolean,
  campaign_status text,
  subject text,
  body_markdown text,
  segment jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_campaign_id is null then
    raise exception using errcode = '22023', message = 'invalid_campaign_id';
  end if;

  update public.email_campaigns c
  set status = 'sending'
  where c.id = p_campaign_id
    and c.status = 'draft'
  returning c.status, c.subject, c.body_markdown, c.segment
  into campaign_status, subject, body_markdown, segment;

  if found then
    can_send := true;
    return next;
    return;
  end if;

  select c.status, c.subject, c.body_markdown, c.segment
  into v_status, subject, body_markdown, segment
  from public.email_campaigns c
  where c.id = p_campaign_id;

  if not found then
    raise exception using errcode = '22023', message = 'invalid_campaign_id';
  end if;

  can_send := false;
  campaign_status := v_status;
  return next;
end;
$$;

create or replace function public.waitlist_admin_campaign_finish_send(
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
    status = 'sent',
    sent_at = coalesce(c.sent_at, now()),
    recipient_count = greatest(coalesce(p_recipient_count, 0), 0)
  where c.id = p_campaign_id;
end;
$$;

drop function if exists public.waitlist_admin_get_campaign(uuid);

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
  status text,
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
    c.status,
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

revoke all on function public.waitlist_admin_campaign_begin_send(uuid) from public;
grant execute on function public.waitlist_admin_campaign_begin_send(uuid) to anon, authenticated;

revoke all on function public.waitlist_admin_campaign_finish_send(uuid, int) from public;
grant execute on function public.waitlist_admin_campaign_finish_send(uuid, int) to anon, authenticated;

revoke all on function public.waitlist_admin_get_campaign(uuid) from public;
grant execute on function public.waitlist_admin_get_campaign(uuid) to anon, authenticated;
