# Pilchería Gloria

Ecommerce local de indumentaria para mujer y hombre en Libertador General San Martín, Jujuy. Incluye catálogo con talles y colores, carrito, checkout invitado, Mercado Pago, stock, cupones, reseñas, cuentas y dashboard.

## Requisitos

- Node.js 20 o superior.
- pnpm.
- Proyectos configurados en Supabase, Clerk y Mercado Pago.

## Instalación

```bash
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

La aplicación queda disponible en `http://localhost:3000`.

## Variables

Completá `.env.local` con:

- `NEXT_PUBLIC_APP_URL`: URL pública sin barra final.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
- `DATABASE_URL`: conexión Postgres para Drizzle.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` y `CLERK_WEBHOOK_SECRET`.
- `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET`.

### Proveedores de pago

Los pedidos y la reserva de stock son independientes del procesador. Cada inicio
se registra en `order_payment_attempts`; solo puede existir un intento activo por
pedido.

El checkout carga el código de seguridad de Mercado Pago y envía
`MP_DEVICE_SESSION_ID` como `X-meli-session-id` al crear la preferencia. Después
de un rechazo de riesgo, el mismo pedido no puede volver a abrir Mercado Pago
durante 10 minutos; otro proveedor habilitado no queda bloqueado.

viüMi no se muestra ni acepta pagos hasta contar con sandbox, credenciales,
documentación de Checkout y consulta de estado, firma verificable de webhooks e
instrucciones de cancelación/devolución. Las variables `VIUMI_*` de
`.env.example` están reservadas para esa activación y no la habilitan por sí solas.

No expongas `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY` ni los secretos de Mercado Pago en variables públicas.

## Base de datos

Las migraciones están en `supabase/migrations`. La adaptación de indumentaria se encuentra en:

```text
supabase/migrations/20260727033741_adapt_apparel_catalog.sql
```

Esta migración:

- Agrega marca y precio anterior a productos.
- Agrega talle, color y SKU a variantes.
- Agrega categorías jerárquicas para hombre y mujer.
- Agrega retiro y costo de entrega local.
- Desactiva el catálogo heredado sin borrar pedidos históricos.

Para aplicar migraciones a un proyecto autorizado:

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref TU_PROJECT_REF
pnpm dlx supabase db push
```

Revisá el proyecto enlazado antes de ejecutar `db push`. Esta adaptación no aplica migraciones remotas automáticamente.

## Administrador

1. Registrá el usuario mediante Clerk.
2. Verificá que exista en `public.profiles`.
3. Asigná el rol desde Supabase:

```sql
update public.profiles
set role = 'admin'
where clerk_user_id = 'user_CLERK_ID';
```

El dashboard se encuentra en `/dashboard`.

## Configuración inicial

1. En `/dashboard/settings`, completá dirección, teléfono, WhatsApp, horarios, redes y costo de entrega local.
2. En `/dashboard/categories`, revisá la jerarquía Hombre y Mujer.
3. En `/dashboard/products`, cargá productos reales con marca, precio, categoría, imágenes, talles, colores, SKU y stock.
4. Marcá como destacados únicamente los productos que deban aparecer en la home.

Las imágenes se convierten a WebP en el navegador y se suben al bucket público `product-images` de Supabase Storage.

## Webhooks

Configurá estos endpoints públicos:

- Clerk: `POST /api/webhooks/clerk`.
- Mercado Pago: `POST /api/webhooks/mercadopago`.

En Mercado Pago, usá la misma URL y secreto en el ambiente correspondiente. El webhook valida la firma, consulta el pago y actualiza la orden de forma idempotente.

## Calidad

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm test:e2e
```

Playwright usa `.env.local`, crea datos temporales en Supabase y los elimina al terminar. `E2E_MERCADOPAGO_FAKE` se activa únicamente dentro de la configuración de pruebas.

## Documentación

- `PRODUCT.md`: alcance funcional y datos comerciales pendientes.
- `DESIGN.md`: identidad visual, tipografía, color, fotografía y voz.
