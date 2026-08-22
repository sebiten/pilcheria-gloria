# Campaña de ventas de uniformes

## Antes de publicar

1. Pausar el anuncio anterior.
2. Conectar el conjunto de datos de Meta con la web.
3. Verificar en `Administrador de eventos → Probar eventos`:
   - `PageView`
   - `ViewContent`
   - `AddToCart`
   - `InitiateCheckout`
   - `AddPaymentInfo`
   - `Purchase`
4. Confirmar que navegador y servidor aparecen deduplicados con el mismo evento.
5. Eliminar `META_TEST_EVENT_CODE` de Vercel después de la prueba.

## Configuración recomendada

- Objetivo: `Ventas`.
- Ubicación de conversión: `Sitio web`.
- Evento de optimización: `Purchase`, únicamente después de comprobarlo en producción.
- Duración: 7 días con fecha de finalización; no dejarla indefinida.
- Conjunto de anuncios: uno solo para no dividir el presupuesto local.
- Ubicación: únicamente la zona que realmente recibe envío o retiro.
- Edad: adultos responsables de compra; evitar intereses demasiado estrechos al inicio.
- Ubicaciones: Advantage+, cargando la pieza 4:5 para feed y la 9:16 para historias/reels.
- Anuncios iniciales: máximo tres.

## Texto del anuncio

**Texto principal**

Uniformes escolares en Ledesma.

Elegí tu escuela, prenda y talle.

Remeras $28.000 · Chombas $32.000.

Pagá con tarjeta por Mercado Pago. Envío gratis desde 2 prendas.

**Título**

Elegí el uniforme

**Descripción**

Compra online sin registrarte

**Botón**

Comprar

## Enlace medible

Destino:

`https://www.pilcheriagloria.com.ar/uniformes`

Parámetros de URL:

`utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`

Usar nombres breves y sin información personal:

- Campaña: `uniformes_agosto`
- Anuncio feed: `general_feed_4x5`
- Anuncio historia: `general_story_9x16`
- Video real: `video_local_9x16`

El panel mostrará el recorrido completo de cada `utm_content`.

## Archivos

- Feed 4:5: `public/social/meta-ads/uniformes-meta-feed-4x5.jpg`
- Historia/Reel 9:16: `public/social/meta-ads/uniformes-meta-story-9x16.jpg`

## Video real pendiente

Grabar vertical, con buena luz y sin filtros:

1. Entrada o cartel de Pilchería Gloria: 2 segundos.
2. Tres uniformes reales y sus escudos: 5 segundos.
3. Mano eligiendo escuela y talle desde un celular: 4 segundos.
4. Cierre mostrando el local y el texto `Pagá con tarjeta desde la tienda online`: 3 segundos.

No mostrar menores ni inventar stock, opiniones o urgencia.

## Cómo decidir después

No evaluar por reproducciones ni interacciones. Revisar después de 7 días:

- costo por entrada al catálogo;
- catálogo → ficha;
- ficha → talle;
- talle → intención de compra;
- checkout → Mercado Pago;
- pagos aprobados;
- ingreso y margen comparados con gasto.

No aumentar presupuesto mientras `Purchase` siga en cero.
