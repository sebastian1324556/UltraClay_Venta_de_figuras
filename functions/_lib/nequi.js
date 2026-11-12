// Integración preparada para pagos con Nequi.
//
// Estado actual: el método "Nequi" aparece en el checkout SOLO cuando el administrador lo
// activa desde el panel (Admin > Pagos y envíos). Mientras no existan credenciales de API,
// el cliente recibe el número de Nequi configurado y envía el comprobante por WhatsApp;
// el administrador confirma el pago y cambia el pedido a "pagado".
//
// Cuando tengas las credenciales de la API de Nequi (por ejemplo, Nequi Conecta), agrega en
// Cloudflare las variables NEQUI_CLIENT_ID, NEQUI_CLIENT_SECRET y NEQUI_API_KEY, y completa
// createNequiPayment() para generar el cobro automático.

export function isNequiApiConfigured(env) {
  return Boolean(env.NEQUI_API_KEY && env.NEQUI_CLIENT_ID && env.NEQUI_CLIENT_SECRET);
}

/**
 * Devuelve { paymentUrl, reference } cuando la API de Nequi esté configurada.
 * Devuelve null mientras no existan credenciales (se usa el pago manual).
 */
export async function createNequiPayment(order, env) {
  if (!isNequiApiConfigured(env)) return null;
  // TODO: llamar a la API de Nequi con order.orderNumber y order.total.
  console.warn("Nequi API: credenciales presentes pero la integración aún no está implementada.", order.orderNumber);
  return null;
}
