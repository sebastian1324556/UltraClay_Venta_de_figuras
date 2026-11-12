// Enrutador de la API de ULTRA M 64.
// Lo usan Cloudflare Pages Functions (functions/api/[[route]].js) y el servidor de vista previa.
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { ensureReady, DEFAULT_SETTINGS } from "./db.js";
import * as schema from "./schema.js";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  readCookie,
  sessionCookie,
  SESSION_COOKIE,
  SESSION_DAYS,
} from "./auth.js";
import { createNequiPayment, isNequiApiConfigured } from "./nequi.js";

const { users, sessions, products, settings, orders, orderItems } = schema;

const ORDER_STATUSES = ["pendiente", "pagado", "entregado", "cancelado"];
const MAX_IMAGE_CHARS = 1_500_000; // ~1 MB de imagen en base64

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "La información enviada no es válida.");
  }
}

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function formatCop(value) {
  return "$" + Math.round(Number(value) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function orderNumber(id) {
  return `UM64-${String(id).padStart(6, "0")}`;
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role };
}

async function getSettingsMap(db) {
  const rows = await db.select().from(settings);
  const map = { ...DEFAULT_SETTINGS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

async function currentUser(request, db) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now())));
  return rows[0]?.user ?? null;
}

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, "Debes iniciar sesión para continuar.");
  return ctx.user;
}

function requireAdmin(ctx) {
  if (!ctx.user) throw new HttpError(401, "Debes iniciar sesión como administrador.");
  if (ctx.user.role !== "admin") throw new HttpError(403, "No tienes permisos de administrador.");
  return ctx.user;
}

async function attachItems(db, orderRows) {
  if (orderRows.length === 0) return [];
  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderRows.map((o) => o.id)));
  return orderRows.map((o) => ({
    id: o.id,
    orderNumber: orderNumber(o.id),
    status: o.status,
    paymentMethod: o.paymentMethod,
    customerName: o.customerName,
    phone: o.phone,
    address: o.address,
    notes: o.notes,
    total: o.total,
    createdAt: o.createdAt,
    userId: o.userId,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ productId: i.productId, productName: i.productName, unitPrice: i.unitPrice, quantity: i.quantity })),
  }));
}

function productInput(body, { partial }) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = clean(body.name, 120);
    if (!name) throw new HttpError(400, "El nombre de la figura es obligatorio.");
    out.name = name;
  }
  if (body.description !== undefined) out.description = clean(body.description, 2000);
  if (!partial || body.price !== undefined) {
    const price = Math.round(Number(body.price));
    if (!Number.isFinite(price) || price < 0) throw new HttpError(400, "El precio no es válido.");
    out.price = price;
  }
  if (body.category !== undefined) out.category = clean(body.category, 60) || "General";
  if (body.image !== undefined) {
    const image = String(body.image || "");
    if (image.length > MAX_IMAGE_CHARS) throw new HttpError(413, "La imagen es demasiado grande. Usa una imagen más liviana.");
    out.image = image;
  }
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.sortOrder !== undefined) out.sortOrder = Math.round(Number(body.sortOrder)) || 0;
  return out;
}

function buildWhatsappMessage(order, lines, cfg) {
  const detail = lines.map((l) => `- ${l.quantity} x ${l.productName} (${formatCop(l.unitPrice)} c/u)`).join("\n");
  const payment = order.paymentMethod === "nequi" ? "Nequi" : "WhatsApp";
  return [
    `Hola ${cfg.brand_name}, quiero confirmar mi pedido ${order.orderNumber}.`,
    "",
    "Figuras:",
    detail,
    "",
    `Total: ${formatCop(order.total)}`,
    `Método de pago: ${payment}`,
    "",
    `Nombre: ${order.customerName}`,
    `Teléfono: ${order.phone}`,
    `Dirección: ${order.address}`,
    order.notes ? `Notas: ${order.notes}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function createSession(db, userId) {
  await db.delete(sessions).where(lt(sessions.expiresAt, Date.now()));
  const token = newSessionToken();
  await db.insert(sessions).values({
    token,
    userId,
    expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
  return token;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------
async function route(ctx) {
  const { db, request, env, method, segments } = ctx;
  const [a, b, c] = segments;
  const id = Number(c);

  // Público -------------------------------------------------------------
  if (a === "health" && method === "GET") {
    return json({ ok: true });
  }

  if (a === "content" && method === "GET") {
    return json(await getSettingsMap(db));
  }

  if (a === "products" && method === "GET" && !b) {
    const rows = await db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(products.sortOrder, products.id);
    return json(rows);
  }

  // Autenticación -------------------------------------------------------
  if (a === "auth" && b === "me" && method === "GET") {
    return json({ user: ctx.user ? publicUser(ctx.user) : null });
  }

  if (a === "auth" && b === "register" && method === "POST") {
    const body = await readJson(request);
    const name = clean(body.name, 80);
    const email = clean(body.email, 120).toLowerCase();
    const password = String(body.password ?? "");
    const phone = clean(body.phone, 30);
    if (!name) throw new HttpError(400, "Escribe tu nombre.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "El correo electrónico no es válido.");
    if (password.length < 6) throw new HttpError(400, "La contraseña debe tener al menos 6 caracteres.");
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing.length > 0) throw new HttpError(409, "Ya existe una cuenta con ese correo.");
    const inserted = await db
      .insert(users)
      .values({ name, email, phone, passwordHash: await hashPassword(password), role: "cliente" })
      .returning();
    const token = await createSession(db, inserted[0].id);
    return json({ user: publicUser(inserted[0]) }, 201, {
      "Set-Cookie": sessionCookie(request, token, SESSION_DAYS * 24 * 60 * 60),
    });
  }

  if (a === "auth" && b === "login" && method === "POST") {
    const body = await readJson(request);
    const email = clean(body.email, 120).toLowerCase();
    const password = String(body.password ?? "");
    const rows = await db.select().from(users).where(eq(users.email, email));
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, "Correo o contraseña incorrectos.");
    }
    const token = await createSession(db, user.id);
    return json({ user: publicUser(user) }, 200, {
      "Set-Cookie": sessionCookie(request, token, SESSION_DAYS * 24 * 60 * 60),
    });
  }

  if (a === "auth" && b === "logout" && method === "POST") {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await db.delete(sessions).where(eq(sessions.token, token));
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
  }

  // Pedidos del cliente -------------------------------------------------
  if (a === "orders" && !b && method === "GET") {
    const user = requireUser(ctx);
    const rows = await db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.id));
    return json(await attachItems(db, rows));
  }

  if (a === "orders" && !b && method === "POST") {
    const user = requireUser(ctx);
    const body = await readJson(request);
    const cfg = await getSettingsMap(db);

    const customerName = clean(body.customerName, 120);
    const phone = clean(body.phone, 30);
    const address = clean(body.address, 300);
    const notes = clean(body.notes, 500);
    if (!customerName || !phone || !address) {
      throw new HttpError(400, "Completa nombre, teléfono y dirección de entrega.");
    }

    const paymentMethod = body.paymentMethod;
    if (paymentMethod !== "whatsapp" && paymentMethod !== "nequi") {
      throw new HttpError(400, "Selecciona un método de pago válido.");
    }
    if (paymentMethod === "nequi" && (cfg.nequi_enabled !== "1" || !cfg.nequi_number)) {
      throw new HttpError(400, "El pago por Nequi no está disponible por ahora.");
    }

    // Cantidades agrupadas por figura
    const wanted = new Map();
    for (const item of Array.isArray(body.items) ? body.items : []) {
      const productId = Number(item.productId);
      const quantity = Math.floor(Number(item.quantity));
      if (!Number.isInteger(productId) || quantity < 1 || quantity > 99) {
        throw new HttpError(400, "La cantidad de alguna figura no es válida (1 a 99).");
      }
      wanted.set(productId, (wanted.get(productId) || 0) + quantity);
    }
    if (wanted.size === 0) throw new HttpError(400, "Tu carrito está vacío.");

    // Precios siempre se leen de la base de datos (nunca del navegador)
    const rows = await db.select().from(products).where(inArray(products.id, [...wanted.keys()]));
    const available = rows.filter((p) => p.active);
    if (available.length !== wanted.size) {
      throw new HttpError(400, "Algunas figuras ya no están disponibles. Actualiza tu carrito.");
    }

    let total = 0;
    const lines = available.map((p) => {
      const quantity = wanted.get(p.id);
      total += p.price * quantity;
      return { productId: p.id, productName: p.name, unitPrice: p.price, quantity };
    });

    const inserted = await db
      .insert(orders)
      .values({
        userId: user.id,
        status: "pendiente",
        paymentMethod,
        customerName,
        phone,
        address,
        notes,
        total,
      })
      .returning();
    const order = inserted[0];
    await db.insert(orderItems).values(lines.map((l) => ({ orderId: order.id, ...l })));

    const orderInfo = { orderNumber: orderNumber(order.id), total, paymentMethod, customerName, phone, address, notes };
    const nequiPayment = paymentMethod === "nequi" ? await createNequiPayment(orderInfo, env) : null;

    const whatsappNumber = String(cfg.whatsapp_number || "").replace(/\D/g, "");
    const message = buildWhatsappMessage(orderInfo, lines, cfg);
    const whatsappUrl = whatsappNumber
      ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
      : null;

    return json(
      {
        order: { id: order.id, orderNumber: orderInfo.orderNumber, total, status: order.status, paymentMethod },
        whatsappUrl,
        nequi: paymentMethod === "nequi"
          ? {
              number: cfg.nequi_number,
              apiConfigured: isNequiApiConfigured(env),
              paymentUrl: nequiPayment?.paymentUrl ?? null,
            }
          : null,
        deliveryText: cfg.delivery_text,
      },
      201
    );
  }

  // Administración ------------------------------------------------------
  if (a === "admin") {
    requireAdmin(ctx);

    if (b === "orders" && !c && method === "GET") {
      const rows = await db.select().from(orders).orderBy(desc(orders.id));
      return json(await attachItems(db, rows));
    }

    if (b === "orders" && c && method === "PATCH") {
      const body = await readJson(request);
      if (!ORDER_STATUSES.includes(body.status)) throw new HttpError(400, "Estado de pedido no válido.");
      const updated = await db.update(orders).set({ status: body.status }).where(eq(orders.id, id)).returning();
      if (updated.length === 0) throw new HttpError(404, "Pedido no encontrado.");
      return json((await attachItems(db, updated))[0]);
    }

    if (b === "orders" && c && method === "DELETE") {
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      const removed = await db.delete(orders).where(eq(orders.id, id)).returning({ id: orders.id });
      if (removed.length === 0) throw new HttpError(404, "Pedido no encontrado.");
      return json({ ok: true });
    }

    if (b === "products" && !c && method === "GET") {
      const rows = await db.select().from(products).orderBy(products.sortOrder, products.id);
      return json(rows);
    }

    if (b === "products" && !c && method === "POST") {
      const values = productInput(await readJson(request), { partial: false });
      const inserted = await db.insert(products).values(values).returning();
      return json(inserted[0], 201);
    }

    if (b === "products" && c && method === "PUT") {
      const values = productInput(await readJson(request), { partial: true });
      if (Object.keys(values).length === 0) throw new HttpError(400, "No hay cambios para guardar.");
      const updated = await db.update(products).set(values).where(eq(products.id, id)).returning();
      if (updated.length === 0) throw new HttpError(404, "Figura no encontrada.");
      return json(updated[0]);
    }

    if (b === "products" && c && method === "DELETE") {
      const removed = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
      if (removed.length === 0) throw new HttpError(404, "Figura no encontrada.");
      return json({ ok: true });
    }

    if (b === "settings" && method === "PUT") {
      const body = await readJson(request);
      const entries = Object.entries(body ?? {}).filter(([key]) => key in DEFAULT_SETTINGS);
      for (const [key, rawValue] of entries) {
        const value = String(rawValue ?? "");
        if (value.length > MAX_IMAGE_CHARS) throw new HttpError(413, `El contenido de "${key}" es demasiado grande.`);
        await db
          .insert(settings)
          .values({ key, value })
          .onConflictDoUpdate({ target: settings.key, set: { value } });
      }
      return json(await getSettingsMap(db));
    }

    if (b === "users" && method === "GET") {
      const rows = await db
        .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, createdAt: users.createdAt })
        .from(users)
        .orderBy(desc(users.id));
      return json(rows);
    }
  }

  throw new HttpError(404, "Ruta no encontrada.");
}

/**
 * Punto de entrada único.
 * @param {Request} request
 * @param {Record<string, string|undefined>} env  variables de entorno (Cloudflare o process.env)
 * @param {string[]} segments  partes de la ruta después de /api/
 */
export async function handleRequest(request, env, segments) {
  try {
    const db = await ensureReady(env);
    const ctx = {
      request,
      env,
      db,
      method: request.method.toUpperCase(),
      segments: (segments || []).filter(Boolean),
      user: null,
    };
    ctx.user = await currentUser(request, db);
    return await route(ctx);
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status);
    }
    console.error("Error en la API:", error);
    return json({ error: "Ocurrió un error en el servidor. Intenta de nuevo." }, 500);
  }
}
