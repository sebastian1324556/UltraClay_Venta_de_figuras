// Cloudflare Pages Function: atiende todas las rutas /api/*
import { handleRequest } from "../_lib/router.js";

export async function onRequest(context) {
  const raw = context.params.route;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return handleRequest(context.request, context.env, segments);
}
