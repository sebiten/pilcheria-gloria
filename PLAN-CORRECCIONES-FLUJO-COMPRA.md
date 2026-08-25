# Plan integral de corrección del flujo principal de compra

## Contexto

Proyecto: **Pilchería Gloria**  
Stack: **Next.js + TypeScript + Supabase + Mercado Pago + transferencia bancaria**

Flujo auditado:

```text
Producto
→ selección de variante/talle
→ carrito
→ checkout
→ creación de orden
→ creación de items
→ reserva de stock y cupón
→ inicialización del pago
→ webhook/retorno
→ actualización del pago y la orden
→ confirmación
```

El flujo normal está correctamente integrado y Supabase recalcula de forma autoritativa precio, stock, cupón, envío y total. Sin embargo, existen problemas importantes en cancelaciones con pagos tardíos, transferencias en revisión, snapshots históricos y compatibilidad de ciertos modelos.

Este documento contiene todo el plan de implementación para resolverlos.

---

# 1. Reglas generales de trabajo

- Antes de modificar código, inspeccionar el repositorio y el esquema real mediante Supabase MCP.
- Leer la documentación local de la versión instalada de Next.js en `node_modules/next/dist/docs/` antes de tocar APIs del framework.
- Todo el código nuevo debe escribirse en TypeScript.
- No modificar datos productivos manualmente.
- Para cambios de base:
  - crear migraciones nuevas;
  - no editar migraciones ya aplicadas;
  - verificar primero la definición real de tablas, funciones, triggers y policies;
  - mantener las operaciones económicas críticas dentro de transacciones PostgreSQL.
- No confiar en precios, descuentos, envío, total o estados enviados por el cliente.
- Mantener compatibilidad con órdenes e intentos de pago existentes.
- No eliminar todavía las columnas legacy `orders.mercadopago_*`.
- No mezclar estos cambios con rediseños visuales ni refactors ajenos.
- Implementar por fases y verificar cada fase antes de continuar.
- Antes de implementar, informar brevemente qué archivos y objetos SQL se modificarán.

---

# 2. Orden de prioridad

1. **P0 — Pago aprobado después de una cancelación local.**
2. **P1 — Transferencias que reservan stock indefinidamente.**
3. **P1 — Falta de snapshot inmutable del producto y talle comprado.**
4. **P2 — Validación incompleta del total esperado.**
5. **P2 — Incompatibilidad de `variant_id` nullable.**
6. **P2 — Esquema Drizzle desactualizado respecto de Supabase.**
7. **Consolidación de lógica económica, estados y observabilidad.**

---

# 3. Arquitectura actual relevante

## Flujo real

```text
/ o /uniformes
  getProducts()
  products → product_variants → variant_offers → inventory_sources
↓
/uniformes/[slug]
  getProductBySlug()
  AddToCartButton
↓
useCartStore.addItem(product, variantId, quantity)
  localStorage
  + CartSync → cart_items para usuarios autenticados
↓
/checkout
  CheckoutForm
  refreshCheckoutCart()
  validateCouponForCheckout()
↓
POST /api/checkout
  Zod + rate limit + Idempotency-Key
↓
createOrder()
↓
RPC create_checkout_order()
  valida producto/variante/ofertas
  recalcula subtotal/cupón/envío/total
  bloquea y descuenta stock
  INSERT orders
  INSERT order_items
↓
startOrderPayment()
↓
order_payment_attempts
  ├─ Mercado Pago → createPreference()
  └─ Transferencia → create_bank_transfer_attempt()
↓
Mercado Pago
  external_reference = orders.id
  metadata.payment_attempt_id = order_payment_attempts.id
↓
POST /api/webhooks/mercadopago
  firma HMAC
  getPayment()
  findMercadoPagoPaymentForOrder()
  applyMercadoPagoPayment()
↓
RPC reconcile_order_payment_attempt()
  → apply_order_payment_attempt()
↓
orders.status = paid | payment_review | pending | cancelled
order_payment_attempts.status = approved | review | rejected | ...
↓
/order-confirmation/[id]
```

## Tablas principales

```text
categories
    ↑ category_id
products
    ├─ product_images.product_id
    └─ product_variants.product_id
             └─ variant_offers.variant_id
                    └─ inventory_sources.id

profiles
    └─ cart_items.clerk_user_id
           ├─ product_id → products.id
           └─ variant_id → product_variants.id

orders
    ├─ order_items.order_id
    │      ├─ product_id → products.id
    │      ├─ variant_id → product_variants.id
    │      ├─ offer_id → variant_offers.id
    │      └─ source_id → inventory_sources.id
    ├─ order_payment_attempts.order_id
    ├─ order_payment_reconciliation_events.order_id
    └─ payment_flow_events.order_id
```

No existe una tabla genérica `payments`. El pago se representa mediante `order_payment_attempts`, eventos de conciliación y eventos de observabilidad.

---

# 4. Fase 1 — Corregir pagos aprobados después de una cancelación

## Prioridad

**P0 — Crítico**

## Problema

Al iniciar Mercado Pago, `order_payment_attempts.external_id` contiene inicialmente el ID de la preferencia. Después de una conciliación pasa a contener el ID del pago.

Cuando una orden se cancela localmente:

- la preferencia puede continuar activa en Mercado Pago;
- el stock se libera;
- el cupón se restaura;
- el intento queda `cancelled`;
- la RPC `apply_order_payment_attempt()` ignora eventos posteriores si el intento ya está en `rejected`, `cancelled` o `failed`.

Si Mercado Pago informa después un pago `approved`, el cliente puede quedar cobrado mientras la orden sigue cancelada y el stock ya fue liberado.

También existe una carrera posible:

```text
cron consulta Mercado Pago y no encuentra pago
→ cliente termina de pagar
→ cron cancela la orden y libera stock
→ llega webhook approved
→ el intento local ya está cancelled
→ la aprobación se ignora
```

## Objetivo

Todo pago auténtico aprobado debe quedar registrado y visible, aunque llegue tarde o la orden haya sido cancelada.

Una aprobación tardía nunca debe descartarse silenciosamente.

## 4.1. Separar identificadores externos

Agregar en `order_payment_attempts`:

```sql
provider_checkout_id text null
```

Semántica:

- `provider_checkout_id`: preferencia, sesión o checkout externo.
- `external_id`: payment ID o identificador del cobro conciliado.

Evaluar un nombre más explícito como `provider_payment_id`, pero evitar un rename físico si complica la compatibilidad.

La migración debe tratar cuidadosamente los valores existentes, porque no todos los `external_id` históricos necesariamente representan un payment ID.

Actualizar:

- tipos TypeScript;
- esquema Drizzle;
- selects;
- adapters;
- inicio de pagos;
- conciliación;
- cancelación;
- dashboard;
- logs y eventos.

## 4.2. Cambiar el contrato del adapter

`PaymentAdapter.start()` debería devolver algo explícito:

```ts
type StartedPayment = {
  providerCheckoutId: string;
  checkoutUrl: string;
  status: "pending" | "in_process";
};
```

El webhook o la consulta posterior deben persistir el payment ID real en `external_id`.

Nunca llamar `/v1/payments/{id}` usando un preference ID.

## 4.3. Corregir las transiciones tardías

Modificar `apply_order_payment_attempt()` o crear una RPC transaccional nueva.

Reglas obligatorias:

- Un `approved` auténtico no puede ignorarse únicamente porque el intento esté:
  - `rejected`;
  - `cancelled`;
  - `failed`.
- Si la orden mantiene stock reservado y todavía puede cumplirse:
  - intento → `approved`;
  - orden → `paid`.
- Si la orden está cancelada, el stock fue restaurado o no puede cumplirse:
  - registrar el payment ID;
  - registrar la aprobación;
  - orden → `payment_review`;
  - no volver a descontar stock automáticamente;
  - crear evento de conciliación;
  - generar alerta administrativa.
- Nunca marcar `paid` sin un intento aprobado.
- Nunca liberar o restaurar stock dos veces.
- Los webhooks duplicados deben ser idempotentes.

Evaluar estados explícitos:

```text
late_approved
requires_refund
```

Si no se agregan, representar el caso mediante `review` y un `status_detail` estructurado y reconocible.

## 4.4. Cancelación segura

Al cancelar una orden pendiente:

- intentar invalidar o expirar la preferencia externa si Mercado Pago lo permite;
- persistir el resultado del intento de invalidación;
- no asumir que cambiar el estado local cancela el checkout externo;
- si no puede invalidarse, conservar una ventana explícita de conciliación;
- cualquier aprobación posterior debe terminar en revisión administrativa.

## 4.5. Manejar carreras cron/webhook

Usar locks sobre orden e intento dentro de PostgreSQL.

Resultado requerido para una aprobación posterior a la liberación:

- pago registrado;
- intento visible como aprobado o revisión por aprobación tardía;
- orden en `payment_review`;
- stock sin segundo descuento;
- alerta administrativa;
- posibilidad clara de cumplir el pedido o reembolsarlo.

## 4.6. No ignorar errores de persistencia

Controlar siempre el resultado de operaciones como:

```ts
await supabase
  .from("order_payment_attempts")
  .update(...);
```

Si el reembolso externo fue exitoso pero falla la actualización local:

- registrar un evento recuperable;
- generar alerta;
- no continuar silenciosamente;
- permitir conciliación posterior.

## Archivos probables

- `src/actions/orders.ts`
- `src/lib/orders/payment-state.ts`
- `src/lib/payments/types.ts`
- `src/lib/payments/mercadopago-adapter.ts`
- `src/lib/mercadopago/reconciliation.ts`
- `src/lib/mercadopago/reconciliation-selection.ts`
- `src/app/api/webhooks/mercadopago/route.ts`
- `src/app/api/cron/expire-orders/route.ts`
- `src/app/api/order-confirmation/[id]/route.ts`
- `src/types/index.ts`
- `src/db/schema.ts`
- nuevas migraciones Supabase

## Criterios de aceptación

- Un `approved` tardío nunca se ignora.
- Una orden cancelada con pago aprobado termina en revisión.
- Preference ID y payment ID se almacenan por separado.
- Webhooks duplicados no duplican efectos.
- Eventos fuera de orden no degradan un estado válido.
- Una carrera cron/webhook no produce un pago invisible.
- No se usa un preference ID como payment ID.
- Los índices únicos siguen evitando pagos duplicados.
- Existe trazabilidad mediante eventos y `status_detail`.

---

# 5. Fase 2 — Evitar reservas indefinidas por transferencia

## Prioridad

**P1 — Alto**

## Problema

`report_bank_transfer()` cambia:

```text
attempt.status = review
order.status = payment_review
```

y extiende la reserva 24 horas.

Cuando vence, el cron detecta una transferencia en `review`, registra una advertencia y continúa sin liberar ni reprogramar la reserva.

La reserva puede quedar activa indefinidamente hasta que un administrador intervenga.

## Objetivo

Toda transferencia informada debe ingresar en una cola operativa con deadline, alertas y resolución explícita.

## 5.1. Agregar campos operativos

Evaluar agregar:

```text
review_deadline_at
review_escalated_at
review_resolution
review_notes
proof_url o proof_reference
```

No guardar datos personales o comprobantes innecesarios sin definir previamente su política de acceso.

## 5.2. Definir SLA y estados

Flujo esperado:

```text
pending
→ review
→ approved
→ rejected/cancelled
```

Para `review`:

- primer vencimiento: alerta administrativa;
- vencimiento máximo: estado explícito de revisión vencida;
- no permitir una reserva vencida sin ninguna acción pendiente visible.

No cancelar automáticamente una posible transferencia real sin una política definida. Si se libera stock, la orden debe quedar en revisión/reembolso potencial, no desaparecer como simple cancelación.

## 5.3. Cola administrativa

Mostrar:

- antigüedad;
- deadline;
- comprador;
- monto;
- stock reservado;
- referencia o comprobante;
- acciones aprobar/rechazar;
- advertencia cuando la revisión vence.

## 5.4. Protección contra abuso

Aplicar límites a:

- órdenes por transferencia por fingerprint, teléfono o usuario;
- reportes dentro de una ventana temporal;
- cantidad de reservas abiertas simultáneamente.

Mantener idempotencia de `report_bank_transfer()`.

No permitir:

- reportar un intento que no esté `pending`;
- reabrir intentos resueltos;
- extender indefinidamente enviando el mismo reporte.

## 5.5. Cron

Debe distinguir:

- transferencia pendiente no informada: cancelar al vencer;
- transferencia informada: escalar;
- revisión excedida: ejecutar política definida;
- transferencia aprobada o rechazada: no reprocesar.

## Criterios de aceptación

- Ninguna revisión queda sin deadline operativo.
- El cron no hace `continue` indefinidamente sin escalar.
- Aprobar y rechazar son idempotentes.
- Stock y cupón se liberan una sola vez.
- Una transferencia aprobada conserva quién la revisó y cuándo.
- Un comprador no puede bloquear stock indefinidamente sin visibilidad administrativa.

---

# 6. Fase 3 — Guardar snapshots inmutables en `order_items`

## Prioridad

**P1 — Alto**

## Problema

`order_items` guarda FKs a producto y variante, pero no congela:

- nombre del producto;
- talle;
- sistema de talle;
- diseño o nivel escolar;
- color;
- SKU.

Las pantallas vuelven a consultar `products` y `product_variants` actuales. Si una variante se edita después, una orden histórica puede mostrar o preparar una prenda distinta.

## Objetivo

Conservar exactamente la identidad comercial comprada.

## Columnas sugeridas

```sql
product_name text not null
product_slug text null
product_brand text null
variant_size text null
variant_size_system text null
variant_school_level text null
variant_color text null
variant_sku text null
variant_label text null
```

Mantener además:

- `product_id`;
- `variant_id`;
- `offer_id`;
- `source_id`.

## Implementación

- Obtener snapshots desde las filas bloqueadas en `create_checkout_order()`.
- No recibirlos desde el cliente.
- Insertarlos junto con precio, cantidad y fuente.
- Hacer que las pantallas prioricen snapshots.
- Usar joins vivos sólo como complemento o navegación.
- Crear backfill conservador para órdenes existentes.
- Documentar que el backfill histórico refleja el valor actual si no existe otra fuente.

## Criterios de aceptación

- Editar una variante no altera una orden histórica.
- El panel de preparación conserva el talle y diseño comprados.
- Los snapshots sólo se crean desde servidor/PostgreSQL.
- Las FKs existentes se mantienen.

---

# 7. Fase 4 — Validar el resumen económico completo

## Prioridad

**P2 — Medio**

## Problema

El checkout sólo envía `expectedSubtotal`.

El servidor recalcula correctamente, pero una modificación concurrente del cupón o del envío puede cambiar el total sin obligar al usuario a revisar el resumen nuevamente.

## Objetivo

Detectar diferencias entre el resumen confirmado por el usuario y el cálculo autoritativo de PostgreSQL.

## Payload requerido

```ts
type CheckoutEconomics = {
  expectedSubtotal: number;
  expectedDiscount: number;
  expectedShippingCost: number;
  expectedTotal: number;
};
```

Actualizar:

- esquema Zod;
- `CheckoutForm`;
- `createOrder()`;
- firma de `create_checkout_order()`;
- hash idempotente;
- validaciones SQL.

## Validación SQL

Dentro de la RPC:

1. recalcular subtotal;
2. recalcular cupón;
3. recalcular envío;
4. recalcular total;
5. redondear a dos decimales;
6. comparar con las expectativas;
7. abortar si la diferencia supera un centavo.

Los valores del cliente nunca deben persistirse como importes autoritativos.

## Idempotencia

El hash canónico debe incluir:

- items normalizados;
- modalidad de envío;
- dirección;
- cupón;
- subtotal esperado;
- descuento esperado;
- envío esperado;
- total esperado.

La misma clave con datos económicos diferentes debe rechazarse.

## Criterios de aceptación

- Cambiar precio, cupón o envío antes del submit obliga a refrescar.
- `orders.total` siempre proviene del cálculo SQL.
- La preferencia recibe exactamente `orders.total`.
- La UI confirma el importe antes de redirigir.

---

# 8. Fase 5 — Hacer obligatorio `variant_id`

## Prioridad

**P2 — Medio**

## Problema

Actualmente:

- `CartItem.variant_id` permite `null`;
- `cart_items.variant_id` permite `null`;
- las acciones de carrito aceptan `null`;
- el checkout y la RPC exigen un UUID.

La UI actual selecciona talle y bloquea items inválidos, pero el modelo del carrito no es compatible al 100% con el backend.

## Decisión recomendada

Como la tienda vende prendas por talle, hacer la variante obligatoria de punta a punta.

## Cambios requeridos

- Cambiar `CartItem.variant_id` a `string`.
- Actualizar esquemas Zod del carrito.
- Actualizar `addItem`, `removeItem` y `updateQuantity`.
- Revisar todos los call sites.
- Consultar primero filas reales con `variant_id is null`.
- Limpiar o migrar filas inválidas antes de agregar `NOT NULL`.
- Eliminar la clave artificial `default` cuando ya no sea necesaria.
- Detectar carritos antiguos en `localStorage`.
- Pedir al usuario volver a elegir talle para un item legacy.
- No enviar items legacy al checkout.

Si el negocio necesita productos sin variante, implementar ese caso explícitamente en frontend, backend y base, no mediante nulabilidad accidental.

## Criterios de aceptación

- Todo item comprable tiene variante.
- El carrito es compatible al 100% con el checkout.
- Un carrito legacy no rompe la página.
- La RPC sigue rechazando variantes pertenecientes a otro producto.

---

# 9. Fase 6 — Sincronizar el esquema Drizzle

## Prioridad

**P2 — Medio**

## Problema

`src/db/schema.ts` no representa todas las columnas reales de Supabase, incluyendo:

```text
orders.checkout_payload_hash
orders.checkout_owner_fingerprint
```

Después de las fases anteriores existirán más columnas nuevas.

## Cambios requeridos

- Comparar todas las tablas del flujo mediante Supabase MCP.
- Actualizar `src/db/schema.ts` con:
  - columnas;
  - tipos;
  - nulabilidad;
  - defaults;
  - FKs;
  - índices;
  - constraints representables.
- Actualizar tipos TypeScript.
- No generar DDL destructivo automáticamente.
- Documentar que las migraciones Supabase son la fuente de evolución del esquema.

## Criterios de aceptación

- Todas las columnas críticas reales aparecen en `schema.ts`.
- Los tipos no permiten estados o valores que PostgreSQL rechaza.
- No se elimina ninguna columna legacy sin migración específica.

---

# 10. Fase 7 — Consolidar lógica económica y estados

## Objetivo

Reducir divergencias sin trasladar la autoridad económica al frontend.

## Acciones

- Mantener PostgreSQL como fuente de verdad.
- Mantener TypeScript como preview.
- Centralizar constantes cuando sea posible:
  - máximo por variante;
  - máximo total por pedido;
  - mínimo para entrega local;
  - tolerancia monetaria;
  - estados visuales.
- Documentar que el cálculo cliente es preliminar.
- Comparar todos los estados TypeScript con los CHECK reales.
- Si se agregan estados de aprobación tardía o revisión vencida, actualizar:
  - tipos;
  - labels;
  - transiciones administrativas;
  - emails;
  - confirmación;
  - dashboard;
  - cron;
  - analytics;
  - constraints SQL.

## Estados actuales

```text
Pago:
created
  → pending / in_process
  → approved / rejected / cancelled / failed / review
  → refunded / charged_back

Orden:
pending
  ├─→ paid
  │     ├─ pickup → ready_for_pickup → delivered
  │     └─ delivery → shipped → delivered
  ├─→ payment_review
  └─→ cancelled
```

La solución debe documentar cualquier transición nueva.

---

# 11. Aspectos que ya funcionan y deben preservarse

- `product_id` y `variant_id` se validan juntos en PostgreSQL.
- La RPC verifica producto y variante activos.
- La RPC obtiene precios desde `uniform_price_groups` o `variant_offers`.
- El cliente no envía `unit_price`.
- El total se calcula en PostgreSQL.
- La creación de orden, items, stock y cupón es transaccional.
- Los errores dentro de la RPC revierten la transacción.
- Existe un índice único para un solo intento activo por orden.
- Existe unicidad para `(provider, external_id)` cuando no es nulo.
- Los eventos de conciliación tienen deduplicación.
- El webhook valida firma.
- El pago se consulta al proveedor.
- Para pagos aprobados se validan:
  - monto;
  - moneda ARS;
  - collector/cuenta receptora;
  - external reference.
- Las órdenes pagadas deben tener un intento aprobado por trigger diferido.
- Service role está encapsulada en código `server-only`.
- Las RPC críticas sólo son ejecutables por `service_role` y `postgres`.
- Las tablas sensibles no tienen grants públicos de escritura.
- La confirmación de invitados usa token hasheado y cookie HttpOnly.

No degradar estas protecciones durante la implementación.

---

# 12. Verificación obligatoria

## 12.1. Supabase MCP

Verificar después de cada migración:

- tablas y columnas;
- tipos y nulabilidad;
- valores default;
- PK y FK;
- `ON DELETE` y `ON UPDATE`;
- CHECK constraints;
- índices únicos y parciales;
- triggers;
- definición real de RPC;
- `SECURITY DEFINER`;
- `search_path`;
- ACL de ejecución;
- grants;
- RLS y policies;
- advisors de seguridad y rendimiento.

## 12.2. Consultas de integridad de sólo lectura

Comprobar:

- órdenes sin items;
- items con producto y variante cruzados;
- órdenes pagadas sin intento aprobado;
- intentos aprobados con monto diferente al total;
- más de un intento activo por orden;
- payment IDs duplicados;
- reservas vencidas sin resolución;
- totales distintos de items netos más envío;
- diferencias en contadores de cupones;
- stock de variante distinto de la suma de ofertas finitas;
- órdenes históricas sin snapshots;
- intentos con identificadores externos ambiguos.

## 12.3. Casos funcionales mínimos

1. Compra normal aprobada.
2. Webhook aprobado duplicado.
3. Webhook pendiente seguido de aprobado.
4. Rechazo seguido de reintento.
5. Aprobación tardía después de cancelación.
6. Carrera cron versus webhook.
7. Dos pagos aprobados para la misma orden.
8. Pago con importe incorrecto.
9. Pago con moneda incorrecta.
10. Pago con collector incorrecto.
11. Transferencia informada y aprobada.
12. Transferencia informada y rechazada.
13. Transferencia en revisión vencida.
14. Cambio del cupón antes del submit.
15. Cambio del costo de envío antes del submit.
16. Cambio del producto o variante después de comprar.
17. Carrito legacy con `variant_id = null`.
18. Repetición de la misma `Idempotency-Key`.
19. Misma clave con payload económico diferente.
20. Cancelación de un checkout con preferencia externa todavía activa.

## 12.4. Seguridad

Confirmar:

- service role sólo en servidor;
- RPC críticas sólo para service role;
- cliente sin capacidad de actualizar pagos u órdenes;
- ningún estado económico aceptado directamente del navegador;
- webhook con firma válida;
- pago consultado al proveedor;
- monto, moneda, collector y referencia verificados;
- aprobación tardía siempre visible y escalada;
- transferencia informada sin posibilidad de reservar indefinidamente;
- snapshots creados exclusivamente desde la base.

---

# 13. Estrategia de migraciones

Crear migraciones pequeñas y ordenadas. Propuesta:

```text
1. separate_payment_checkout_and_payment_ids
2. handle_late_approved_payments
3. add_bank_transfer_review_deadlines
4. add_order_item_product_variant_snapshots
5. validate_full_checkout_economics
6. require_cart_item_variant
7. update_payment_integrity_constraints
```

Cada migración debe:

- ser compatible con datos existentes;
- incluir backfill cuando corresponda;
- agregar constraints después del backfill;
- evitar bloquear innecesariamente tablas;
- preservar funciones y grants correctos;
- volver a revocar `EXECUTE` a `PUBLIC`, `anon` y `authenticated` para RPC sensibles;
- otorgar `EXECUTE` sólo a `service_role` cuando corresponda.

No mezclar todos los cambios en una única migración gigante.

---

# 14. Entrega esperada del agente

Al finalizar, entregar:

1. Resumen de cada problema corregido.
2. Archivos modificados.
3. Migraciones creadas.
4. Cambios de tablas, columnas, índices y RPC.
5. Mapa final de estados y transiciones.
6. Compatibilidad con datos existentes.
7. Resultado de las consultas de integridad.
8. Resultado de los escenarios críticos.
9. Riesgos residuales.
10. Confirmación de que no se expuso service role.
11. Confirmación explícita de la siguiente pregunta:

> ¿Puede un cliente quedar cobrado con una orden cancelada sin que el sistema registre y escale el pago?

La respuesta final debe ser:

```text
NO
```

acompañada por evidencia concreta del código y de las RPC reales.

---

# 15. Condición final de completitud

El trabajo sólo puede considerarse terminado si:

- un pago aprobado tardío nunca queda invisible;
- preference ID y payment ID tienen semánticas separadas;
- una orden cancelada con cobro termina en revisión;
- una transferencia no puede bloquear stock indefinidamente;
- el item conserva el producto y talle comprados aunque el catálogo cambie;
- el servidor valida subtotal, descuento, envío y total;
- carrito y checkout coinciden sobre la obligatoriedad de la variante;
- el esquema TypeScript/Drizzle coincide con Supabase real;
- los webhooks y reintentos son idempotentes;
- todos los cambios fueron contrastados contra Supabase mediante MCP.
