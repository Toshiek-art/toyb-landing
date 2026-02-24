create extension if not exists pgcrypto;

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now(),
  source text not null default 'landing',
  user_agent text null,
  ip_hash text null
);

create unique index if not exists waitlist_email_unique_idx
  on public.waitlist (email);
