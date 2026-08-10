alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.cart_items enable row level security;

revoke all privileges on table
  public.profiles,
  public.addresses,
  public.orders,
  public.order_items,
  public.cart_items
  from anon, authenticated;

grant all privileges on table
  public.profiles,
  public.addresses,
  public.orders,
  public.order_items,
  public.cart_items
  to service_role;
