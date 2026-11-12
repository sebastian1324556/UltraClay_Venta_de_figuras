# ULTRA M 64 · Tienda de figuras de arcilla polimérica

Tienda web (HTML + CSS + JavaScript) con API serverless en Cloudflare Pages Functions y base de datos Turso (libSQL, ORM Drizzle).

## Estructura

```
Index.html          Tienda para clientes
Admin.html          Panel de administración (pedidos, figuras, textos, imágenes, pagos, usuarios)
Styles/             Estilos (main.css tienda, admin.css panel)
Scripts/            Lógica (common.js, index.js, admin.js)
images/             Imágenes de la página (editables desde el panel)
functions/
  api/[[route]].js  Punto de entrada de la API (/api/*)
  _lib/             Lógica del servidor: router, base de datos, autenticación, Nequi
  _lib/schema.sql   Esquema de la base de datos para Turso
.env.example        Variables de entorno necesarias
```

## 1. Crear la base de datos en Turso

```bash
turso db create ultram64
turso db show ultram64 --url          # -> TURSO_DATABASE_URL
turso db tokens create ultram64       # -> TURSO_AUTH_TOKEN
```

Opcional: ejecuta `functions/_lib/schema.sql` en la consola de Turso. La aplicación también crea las tablas automáticamente la primera vez.

## 2. Publicar en Cloudflare Pages

1. Sube esta carpeta a un repositorio de GitHub (o usa "Direct Upload").
2. En Cloudflare: **Workers & Pages > Create > Pages > Connect to Git**.
3. Configuración de build:
   - **Framework preset:** None
   - **Build command:** *(vacío)*
   - **Build output directory:** `/` (o `.`)
4. En **Settings > Environment variables** agrega las variables de `.env.example`:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - (Opcional) `NEQUI_CLIENT_ID`, `NEQUI_CLIENT_SECRET`, `NEQUI_API_KEY`
5. Vuelve a desplegar (**Retry deployment**) para que tome las variables.

## 3. Uso

- Tienda: `https://tu-sitio.pages.dev/`
- Panel admin: `https://tu-sitio.pages.dev/Admin.html` (inicia sesión con `ADMIN_EMAIL` y `ADMIN_PASSWORD`).

## Pagos

- **WhatsApp:** activo. Al confirmar el pedido se abre WhatsApp con el resumen. Configura el número en *Admin > Pagos y envíos*.
- **Nequi:** preparado. Se activa desde *Admin > Pagos y envíos > Pago por Nequi*. Cuando tengas las credenciales de la API de Nequi, completa `functions/_lib/nequi.js` y agrega las variables `NEQUI_*`.

## Estados de pedido

`pendiente` → `pagado` (el cliente ve el tiempo de entrega) → `entregado`, o `cancelado`. El administrador también puede eliminar pedidos.
