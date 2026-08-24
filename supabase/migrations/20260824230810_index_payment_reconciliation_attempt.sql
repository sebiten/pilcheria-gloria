create index if not exists order_payment_reconciliation_attempt_idx
  on public.order_payment_reconciliation_events (attempt_id)
  where attempt_id is not null;
