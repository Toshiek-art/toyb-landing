alter table public.waitlist
  add constraint waitlist_email_length_chk check (char_length(email) <= 320),
  add constraint waitlist_email_format_chk check (
    email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  add constraint waitlist_source_length_chk check (char_length(source) <= 64),
  add constraint waitlist_user_agent_length_chk check (
    user_agent is null or char_length(user_agent) <= 512
  ),
  add constraint waitlist_ip_hash_format_chk check (
    ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'
  );

create unique index if not exists waitlist_email_lower_unique_idx
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

revoke all on table public.waitlist from anon;
revoke all on table public.waitlist from authenticated;

drop policy if exists waitlist_no_direct_access on public.waitlist;
create policy waitlist_no_direct_access
  on public.waitlist
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.insert_waitlist(
  p_email text,
  p_source text default 'landing',
  p_user_agent text default null,
  p_ip_hash text default null
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

  insert into public.waitlist (email, source, user_agent, ip_hash)
  values (v_email, v_source, v_user_agent, v_ip_hash)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  already_joined := (v_inserted = 0);
  return next;
end;
$$;

revoke all on function public.insert_waitlist(text, text, text, text) from public;
grant execute on function public.insert_waitlist(text, text, text, text) to anon;
grant execute on function public.insert_waitlist(text, text, text, text) to authenticated;
