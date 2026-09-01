# Operación inicial de Pilchería Gloria

## Modelo recomendado

Usar el local como única ubicación del stock publicado. Cada variante del
dashboard debe coincidir con una prenda física disponible en el local.

Si todavía no hay espacio o una persona responsable en el local, mantener el
stock en casa y publicar el retiro como coordinado, con días fijos. No dividir
una misma variante entre casa y local sin registrar ubicaciones.

## Responsabilidades

### Administración

- Cargar productos, talles, colores, precios y stock.
- Revisar los pedidos pagados.
- Separar la prenda y colocarla en una bolsa con el código del pedido.
- Marcar el pedido como `Listo para retirar`.
- Usar el botón `Avisar por WhatsApp`.
- Resolver cambios, devoluciones y diferencias de stock.

### Persona que entrega en el local

- Entregar únicamente bolsas identificadas como listas.
- Pedir al cliente el código de ocho caracteres del pedido.
- No reemplazar talles o prendas sin registrarlo.
- Informar la entrega para marcar el pedido como `Entregado`.

## Flujo de retiro

1. El cliente paga con Mercado Pago.
2. El pedido pasa a `Preparando retiro`.
3. Se separa y embolsa la compra.
4. El pedido pasa a `Listo para retirar`.
5. Se envía el aviso por WhatsApp.
6. El cliente presenta el código del pedido.
7. Se entrega la bolsa y el pedido pasa a `Entregado`.

## Reglas de stock

- No publicar stock que no pueda localizarse físicamente.
- Hacer un conteo rápido al cierre o después de cada jornada de ventas.
- Registrar también en el dashboard las ventas realizadas directamente en el
  local o descontar su stock de inmediato.
- Mantener un estante o caja exclusiva para pedidos web preparados.
- No prometer retiro inmediato: siempre usar `previa confirmación`.

## Entrega local

Mantenerla desactivada hasta definir responsable, zonas, costo y días de
reparto. Al activarla, agrupar entregas en franjas fijas para no interrumpir la
atención del local.

## Uniformes escolares

- Usar `Uniformes escolares` como categoría principal.
- Crear una subcategoría por escuela desde el dashboard.
- Nombrar los productos por prenda y escuela, por ejemplo:
  `Chomba Escuela Técnica`.
- Usar las variantes para talle, color y SKU.
- Separar físicamente el stock por escuela y luego por talle.
- No publicar una escuela hasta confirmar modelos, escudos y colores reales.
# Preparación para ventas

## Variables y automatización

1. Configurá `CRON_JOB_API_KEY` y la URL pública definitiva en `NEXT_PUBLIC_APP_URL` dentro de `.env.local`.
2. Ejecutá `pnpm cron:configure`. Si falta, el script genera un `CRON_SECRET` seguro en `.env.local`.
3. Configurá ese mismo `CRON_SECRET` en las variables del entorno de producción y desplegá.
4. Ejecutá otra vez `pnpm cron:configure`. El keepalive directo de Supabase se activa de inmediato; el job de reservas se activa cuando `/api/cron/keepalive` valida el deploy y el secreto.
5. Verificá en cron-job.org los jobs `Pilchería Gloria - Liberar reservas vencidas` y `Pilchería Gloria - Mantener Supabase activo`.
6. Para emails, verificá un dominio en Resend y configurá `RESEND_API_KEY`, `ORDER_EMAIL_FROM` y `ORDER_NOTIFICATION_TO`. Esta última acepta uno o varios correos separados por coma.

La ruta `/api/cron/expire-orders` consulta Mercado Pago antes de cancelar. No liberes stock con un cron SQL directo porque un webhook retrasado podría corresponder a un pago aprobado.

El keepalive hace una consulta mínima de solo lectura directamente a Supabase cuatro veces al día, sin pasar por Vercel. El job de reservas corre cada 10 minutos y también genera actividad, pero necesita la aplicación porque debe consultar Mercado Pago antes de liberar stock.

## Datos obligatorios

Antes de habilitar ventas, completá en Configuración:

- Dirección y horarios reales.
- Teléfono, WhatsApp y email.
- Nombre o razón social, CUIT y domicilio legal.
- Modalidades de retiro o entrega realmente disponibles.
- Guía de talles específica en cada producto.
