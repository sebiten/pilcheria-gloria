create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_push_subscriptions_user_idx
  on public.admin_push_subscriptions (clerk_user_id);

alter table public.admin_push_subscriptions enable row level security;
revoke all on table public.admin_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.admin_push_subscriptions to service_role;

alter table public.admin_notifications
  add column if not exists push_claimed_at timestamptz,
  add column if not exists push_sent_at timestamptz;

create or replace function public.claim_admin_sale_push(p_order_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  update public.admin_notifications
  set push_claimed_at = now()
  where order_id = p_order_id
    and event_key = 'sale_paid'
    and push_sent_at is null
    and (
      push_claimed_at is null
      or push_claimed_at < now() - interval '5 minutes'
    )
  returning id into claimed_id;

  return claimed_id is not null;
end;
$$;

revoke execute on function public.claim_admin_sale_push(uuid) from public, anon, authenticated;
grant execute on function public.claim_admin_sale_push(uuid) to service_role;
