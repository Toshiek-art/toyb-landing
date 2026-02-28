alter table public.email_campaigns
  add column if not exists status text not null default 'draft';

update public.email_campaigns
set status = 'sent'
where sent_at is not null
  and status <> 'sent';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'email_campaigns_status_chk'
      and conrelid = 'public.email_campaigns'::regclass
  ) then
    alter table public.email_campaigns
      drop constraint email_campaigns_status_chk;
  end if;
end;
$$;

alter table public.email_campaigns
  add constraint email_campaigns_status_chk
  check (status in ('draft', 'sending', 'sent', 'failed'));

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
    and c.status in ('draft', 'failed')
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

create or replace function public.waitlist_admin_campaign_mark_failed(
  p_campaign_id uuid
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
  set status = 'failed'
  where c.id = p_campaign_id
    and c.status = 'sending';
end;
$$;

revoke all on function public.waitlist_admin_campaign_begin_send(uuid) from public;
grant execute on function public.waitlist_admin_campaign_begin_send(uuid) to anon, authenticated;

revoke all on function public.waitlist_admin_campaign_mark_failed(uuid) from public;
grant execute on function public.waitlist_admin_campaign_mark_failed(uuid) to anon, authenticated;
