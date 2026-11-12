// Esquema de la base de datos (Drizzle ORM + Turso / libSQL).
// El mismo esquema está en functions/_lib/schema.sql para que lo ejecutes en Turso si lo deseas.
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Usuarios: clientes y administradores
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("cliente"), // 'cliente' | 'admin'
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Sesiones de inicio de sesión
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(), // epoch en milisegundos
});

// Catálogo de figuras
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull().default(0), // en pesos colombianos (COP)
  category: text("category").notNull().default("General"),
  image: text("image").notNull().default(""), // ruta (images/...) o data URL subida desde el admin
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Textos, imágenes, colores y datos de pago editables desde el panel admin
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});

// Pedidos
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  status: text("status").notNull().default("pendiente"), // pendiente | pagado | entregado | cancelado
  paymentMethod: text("payment_method").notNull().default("whatsapp"), // whatsapp | nequi
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  notes: text("notes").notNull().default(""),
  total: integer("total").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Líneas de cada pedido
export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id"),
  productName: text("product_name").notNull(),
  unitPrice: integer("unit_price").notNull().default(0),
  quantity: integer("quantity").notNull().default(1),
});
