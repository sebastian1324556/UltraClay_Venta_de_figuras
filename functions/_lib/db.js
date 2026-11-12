// Conexión a Turso (libSQL) con Drizzle ORM + creación automática de tablas y datos iniciales.
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema.js";
import { hashPassword } from "./auth.js";

const { users, products, settings } = schema;

// Valores iniciales de la página (todo editable desde el panel admin)
export const DEFAULT_SETTINGS = {
  brand_name: "ULTRA M 64",
  logo_image: "images/logo.png",
  hero_eyebrow: "Canal de YouTube · Arcilla polimérica",
  hero_title: "Figuras de arcilla polimérica hechas a mano",
  hero_subtitle: "Recreaciones de Friday Night Funkin' en versión clay, modeladas una a una por ULTRA M 64.",
  hero_button: "Ver figuras",
  hero_image: "images/hero.jpg",
  products_title: "Nuestras figuras",
  products_subtitle: "Elige tu figura, ajusta la cantidad en el carrito y paga por WhatsApp o Nequi.",
  about_title: "Sobre ULTRA M 64",
  about_text:
    "Soy un creador de contenido que modela cada personaje a mano con arcilla polimérica. Cada figura nace de mis recreaciones de mods de Friday Night Funkin' y se pinta con el mismo cuidado que pongo en mis videos.",
  about_image: "images/about.jpg",
  feature_1_title: "100% hecho a mano",
  feature_1_text: "Cada figura se modela y pinta a mano, detalle por detalle.",
  feature_2_title: "Inspirado en FNF",
  feature_2_text: "Personajes y mods de Friday Night Funkin' en versión clay.",
  feature_3_title: "Pedido con seguimiento",
  feature_3_text: "Revisa el estado de tus compras en tu historial de pedidos.",
  contact_title: "Contacto",
  contact_text: "¿Tienes una idea o un personaje especial en mente? Escríbeme por WhatsApp.",
  footer_text: "© ULTRA M 64. Todos los derechos reservados.",
  youtube_url: "https://www.youtube.com/@Ultra_m_64",
  instagram_url: "",
  tiktok_url: "",
  whatsapp_number: "573000000000",
  nequi_enabled: "0",
  nequi_number: "",
  delivery_text: "Tu figura saldrá a envío entre 3 y 5 días hábiles. El tiempo de llegada depende de tu ciudad.",
  theme_primary: "#c24b99",
  theme_accent: "#00e5ff",
};

const SAMPLE_PRODUCTS = [
  {
    name: "Boyfriend Rapero",
    description: "Figura de unos 12 cm modelada a mano con arcilla polimérica. Incluye micrófono y gorra roja.",
    price: 85000,
    category: "Personajes",
    image: "images/figura-1.png",
    sortOrder: 1,
  },
  {
    name: "Girlfriend Clásica",
    description: "Figura de unos 12 cm con vestido rojo y detalles pintados a mano.",
    price: 80000,
    category: "Personajes",
    image: "images/figura-2.png",
    sortOrder: 2,
  },
  {
    name: "Monstruo Neón",
    description: "Figura morada y cian de unos 10 cm, con ojos grandes y micrófono.",
    price: 75000,
    category: "Mods",
    image: "images/figura-3.png",
    sortOrder: 3,
  },
];

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cliente',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'General',
    image TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendiente',
    payment_method TEXT NOT NULL DEFAULT 'whatsapp',
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
];

let cached = null; // { db, client }
let readyPromise = null;

export function getDb(env) {
  if (!cached) {
    const client = createClient({
      url: env.TURSO_DATABASE_URL || "file:local.db",
      authToken: env.TURSO_AUTH_TOKEN || undefined,
    });
    cached = { client, db: drizzle(client, { schema }) };
  }
  return cached.db;
}

async function bootstrap(db, env) {
  // 1) Tablas
  await cached.client.batch(CREATE_STATEMENTS, "write");

  // 2) Textos y ajustes por defecto (sin pisar lo que ya editaste)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }

  // 3) Figuras de ejemplo solo si el catálogo está vacío
  const [{ total }] = await db.select({ total: sql`count(*)` }).from(products);
  if (Number(total) === 0) {
    for (const p of SAMPLE_PRODUCTS) {
      await db.insert(products).values({ ...p, active: true });
    }
  }

  // 4) Administrador inicial desde variables de entorno
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const email = env.ADMIN_EMAIL.trim().toLowerCase();
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length === 0) {
      await db.insert(users).values({
        name: "Administrador",
        email,
        phone: "",
        passwordHash: await hashPassword(env.ADMIN_PASSWORD),
        role: "admin",
      });
    } else if (existing[0].role !== "admin") {
      await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
    }
  }
}

// Garantiza que las tablas y datos iniciales existan (se ejecuta una vez por instancia)
export function ensureReady(env) {
  const db = getDb(env);
  if (!readyPromise) {
    readyPromise = bootstrap(db, env).catch((error) => {
      readyPromise = null; // permite reintentar en la siguiente petición
      throw error;
    });
  }
  return readyPromise.then(() => db);
}
