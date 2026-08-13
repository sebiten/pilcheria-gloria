create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_key text not null check (event_key in ('sale_paid')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, event_key)
);

create index if not exists admin_notifications_unread_created_idx
  on public.admin_notifications (created_at desc)
  where read_at is null;

alter table public.admin_notifications enable row level security;
revoke all on table public.admin_notifications from anon, authenticated;
grant select, insert, update, delete on table public.admin_notifications to service_role;

create or replace function public.notify_admin_on_paid_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.admin_notifications (order_id, event_key)
    values (new.id, 'sale_paid')
    on conflict (order_id, event_key) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_admin_on_paid_order() from public, anon, authenticated;

drop trigger if exists orders_notify_admin_on_paid on public.orders;
create trigger orders_notify_admin_on_paid
after update of status on public.orders
for each row
execute function public.notify_admin_on_paid_order();
