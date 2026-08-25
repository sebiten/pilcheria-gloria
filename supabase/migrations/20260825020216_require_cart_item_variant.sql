-- Los items sin variante no representan una seleccion comprable. Se eliminan
-- únicamente del carrito; el frontend avisa al usuario que debe elegir talle otra vez.
delete from public.cart_items
where variant_id is null;

do $$
begin
  if exists (select 1 from public.order_items where variant_id is null) then
    raise exception 'No se puede exigir order_items.variant_id: existen items historicos sin variante';
  end if;
end
$$;

alter table public.cart_items
  alter column variant_id set not null;

alter table public.order_items
  alter column variant_id set not null;

comment on column public.cart_items.variant_id is
  'Variante/talle obligatorio seleccionado para el item del carrito.';

comment on column public.order_items.variant_id is
  'Variante/talle obligatorio validado por create_checkout_order al comprar.';
