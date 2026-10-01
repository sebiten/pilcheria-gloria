create table public.product_interest_responses (
  id uuid primary key default gen_random_uuid(),
  survey_key text not null default 'uniforms-v1',
  visitor_id uuid not null,
  first_choice text not null,
  second_choice text,
  placement text not null,
  created_at timestamptz not null default now(),
  constraint product_interest_survey_key_check check (survey_key = 'uniforms-v1'),
  constraint product_interest_first_choice_check check (first_choice in ('dress_pants', 'skirts', 'socks')),
  constraint product_interest_second_choice_check check (second_choice is null or second_choice in ('dress_pants', 'skirts', 'socks')),
  constraint product_interest_distinct_choices_check check (second_choice is null or first_choice <> second_choice),
  constraint product_interest_placement_check check (placement in ('home', 'catalog', 'product')),
  constraint product_interest_one_response_per_browser unique (survey_key, visitor_id)
);
alter table public.product_interest_responses enable row level security;
revoke all on public.product_interest_responses from public, anon, authenticated;
grant select, insert on public.product_interest_responses to service_role;
comment on table public.product_interest_responses is
  'Voluntary product-interest survey. Server-only access; no names or contact details. Browser deduplication is not proof of unique people.';
