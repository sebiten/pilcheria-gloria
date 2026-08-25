alter table public.order_payment_attempts
  add column provider_checkout_id text;

comment on column public.order_payment_attempts.provider_checkout_id is
  'Identificador de preferencia, sesion o checkout externo. external_id queda reservado para el identificador del pago conciliado.';

-- Los intentos activos de Mercado Pago guardaban la preferencia en external_id.
-- Solo movemos filas sin evidencia de conciliacion para no reinterpretar pagos
-- historicos aprobados, rechazados, en revision o devueltos.
update public.order_payment_attempts as attempt
set provider_checkout_id = attempt.external_id,
    external_id = null,
    updated_at = now()
where attempt.provider = 'mercadopago'
  and attempt.external_id is not null
  and attempt.receiver_account_id is null
  and attempt.status in ('created', 'pending', 'in_process', 'cancelled')
  and not exists (
    select 1
    from public.order_payment_reconciliation_events as event
    where event.attempt_id = attempt.id
      and event.payment_id = attempt.external_id
  );

set constraints all immediate;

create unique index order_payment_attempts_provider_checkout_uidx
  on public.order_payment_attempts (provider, provider_checkout_id)
  where provider_checkout_id is not null;
