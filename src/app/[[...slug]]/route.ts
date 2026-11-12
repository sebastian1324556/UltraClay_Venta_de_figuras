// Servidor de vista previa: sirve los archivos estáticos de la tienda (Index.html, Admin.html,
// Styles/, Scripts/, images/) y enruta /api/* al mismo código que usan las Cloudflare Pages Functions.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { handleRequest } from "../../../functions/_lib/router.js";

export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const ALLOWED_FILES = new Set(["index.html", "Admin.html"]);
const ALLOWED_DIRS = ["Styles/", "Scripts/", "images/"];

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".gif": "image/gif",
};

type Ctx = { params: Promise<{ slug?: string[] }> };

async function serveStatic(slug: string[]): Promise<Response> {
  let rel = slug.join("/");
  if (rel === "") rel = "index.html";
  if (rel === "admin" || rel === "admin.html") rel = "Admin.html";
  if (rel === "index") rel = "index.html";

  const allowed = ALLOWED_FILES.has(rel) || ALLOWED_DIRS.some((dir) => rel.startsWith(dir));
  if (!allowed || rel.includes("..")) {
    return new Response("No encontrado", { status: 404 });
  }

  const fullPath = path.join(/*turbopackIgnore: true*/ ROOT, rel);
  if (!fullPath.startsWith(ROOT)) {
    return new Response("No encontrado", { status: 404 });
  }

  try {
    const data = await readFile(/*turbopackIgnore: true*/ fullPath);
    const type = CONTENT_TYPES[path.extname(fullPath).toLowerCase()] || "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": type, "Cache-Control": "no-cache" },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}

async function dispatch(request: Request, context: Ctx): Promise<Response> {
  const { slug = [] } = await context.params;
  if (slug[0] === "api") {
    return handleRequest(request, process.env, slug.slice(1));
  }
  return serveStatic(slug);
}

export async function GET(request: Request, context: Ctx) {
  return dispatch(request, context);
}

export async function POST(request: Request, context: Ctx) {
  return dispatch(request, context);
}

export async function PUT(request: Request, context: Ctx) {
  return dispatch(request, context);
}

export async function PATCH(request: Request, context: Ctx) {
  return dispatch(request, context);
}

export async function DELETE(request: Request, context: Ctx) {
  return dispatch(request, context);
}
