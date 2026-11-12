/* ULTRA M 64 · Utilidades compartidas entre la tienda y el panel admin */
(function () {
  "use strict";

  // Llamadas a la API (Cloudflare Pages Functions en /api)
  async function api(path, options) {
    const opts = options || {};
    const init = {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: {},
    };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    const response = await fetch("/api" + path, init);
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
    if (!response.ok) {
      const error = new Error((data && data.error) || "Ocurrió un error inesperado.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  // Formato de pesos colombianos: $85.000
  function money(value) {
    const n = Math.round(Number(value) || 0);
    return "$" + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
    if (isNaN(date.getTime())) return value;
    return date.toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function toast(message) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.remove("show");
    }, 2800);
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  // Aplica colores de marca guardados en el panel admin
  function applyTheme(cfg) {
    const root = document.documentElement.style;
    if (cfg.theme_primary) root.setProperty("--primary", cfg.theme_primary);
    if (cfg.theme_accent) root.setProperty("--accent", cfg.theme_accent);
  }

  // Reemplaza textos, imágenes y enlaces marcados con atributos data-*
  //  data-c="clave"      -> texto
  //  data-img="clave"    -> src de imagen
  //  data-href="clave"   -> href (se oculta si está vacío)
  //  data-wa             -> enlace a WhatsApp con el número configurado
  function applyContent(cfg) {
    document.querySelectorAll("[data-c]").forEach(function (el) {
      const key = el.getAttribute("data-c");
      if (cfg[key] !== undefined) el.textContent = cfg[key];
    });
    document.querySelectorAll("[data-img]").forEach(function (el) {
      const value = cfg[el.getAttribute("data-img")];
      if (value) el.setAttribute("src", value);
    });
    document.querySelectorAll("[data-href]").forEach(function (el) {
      const value = cfg[el.getAttribute("data-href")];
      if (value) {
        el.setAttribute("href", value);
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });
    const number = digitsOnly(cfg.whatsapp_number);
    document.querySelectorAll("[data-wa]").forEach(function (el) {
      if (number) {
        el.setAttribute("href", "https://wa.me/" + number);
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });
    if (cfg.brand_name) document.title = cfg.brand_name + " · Figuras de arcilla polimérica";
  }

  // Lee una imagen del equipo, la reduce y la devuelve como data URL (se guarda en la base de datos)
  function readImage(file, maxSize, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Selecciona un archivo de imagen (JPG, PNG o WEBP)."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("No se pudo leer la imagen."));
      };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () {
          reject(new Error("La imagen no es válida."));
        };
        img.onload = function () {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          const keepTransparency = file.type === "image/png";
          if (!keepTransparency) {
            ctx.fillStyle = "#15132b";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const type = keepTransparency ? "image/png" : "image/jpeg";
          let dataUrl = canvas.toDataURL(type, quality || 0.85);
          if (dataUrl.length > 1400000) dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  window.UM64 = {
    api: api,
    money: money,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    toast: toast,
    digitsOnly: digitsOnly,
    applyTheme: applyTheme,
    applyContent: applyContent,
    readImage: readImage,
  };
})();
