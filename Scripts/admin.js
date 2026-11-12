/* ULTRA M 64 · Panel de administración */
(function () {
  "use strict";

  const { api, money, escapeHtml, formatDate, toast, digitsOnly, applyTheme, readImage } = window.UM64;

  const STATUS_LABEL = {
    pendiente: "Pendiente de pago",
    pagado: "Pagado",
    entregado: "Entregado",
    cancelado: "Cancelado",
  };

  // Campos editables de la tienda (Admin > Textos e imágenes)
  const CONTENT_SECTIONS = [
    {
      title: "Encabezado",
      fields: [
        { key: "brand_name", label: "Nombre de la marca", type: "text" },
        { key: "logo_image", label: "Logo", type: "image" },
      ],
    },
    {
      title: "Portada",
      fields: [
        { key: "hero_eyebrow", label: "Texto superior (etiqueta)", type: "text" },
        { key: "hero_title", label: "Título principal", type: "text" },
        { key: "hero_subtitle", label: "Subtítulo", type: "textarea" },
        { key: "hero_button", label: "Texto del botón", type: "text" },
        { key: "hero_image", label: "Imagen de portada", type: "image" },
      ],
    },
    {
      title: "Catálogo de figuras",
      fields: [
        { key: "products_title", label: "Título de la sección", type: "text" },
        { key: "products_subtitle", label: "Subtítulo de la sección", type: "textarea" },
      ],
    },
    {
      title: "Sobre mí",
      fields: [
        { key: "about_title", label: "Título", type: "text" },
        { key: "about_text", label: "Texto", type: "textarea" },
        { key: "about_image", label: "Imagen", type: "image" },
        { key: "feature_1_title", label: "Beneficio 1 · título", type: "text" },
        { key: "feature_1_text", label: "Beneficio 1 · texto", type: "textarea" },
        { key: "feature_2_title", label: "Beneficio 2 · título", type: "text" },
        { key: "feature_2_text", label: "Beneficio 2 · texto", type: "textarea" },
        { key: "feature_3_title", label: "Beneficio 3 · título", type: "text" },
        { key: "feature_3_text", label: "Beneficio 3 · texto", type: "textarea" },
      ],
    },
    {
      title: "Contacto y redes",
      fields: [
        { key: "contact_title", label: "Título", type: "text" },
        { key: "contact_text", label: "Texto", type: "textarea" },
        { key: "youtube_url", label: "Enlace de YouTube", type: "url" },
        { key: "instagram_url", label: "Enlace de Instagram (opcional)", type: "url" },
        { key: "tiktok_url", label: "Enlace de TikTok (opcional)", type: "url" },
      ],
    },
    {
      title: "Pie de página",
      fields: [{ key: "footer_text", label: "Texto del pie", type: "text" }],
    },
    {
      title: "Colores de la marca",
      fields: [
        { key: "theme_primary", label: "Color principal", type: "color" },
        { key: "theme_accent", label: "Color de acento", type: "color" },
      ],
    },
  ];

  // Campos de pagos y envíos
  const PAYMENT_FIELDS = [
    {
      key: "whatsapp_number",
      label: "Número de WhatsApp para pedidos",
      type: "text",
      hint: "Solo números, con código de país. Ej: 573001234567",
    },
    {
      key: "nequi_enabled",
      label: "Pago por Nequi",
      type: "select",
      options: [
        ["0", "Desactivado (no se muestra al cliente)"],
        ["1", "Activado (se muestra al cliente)"],
      ],
    },
    {
      key: "nequi_number",
      label: "Número de Nequi",
      type: "text",
      hint: "Se muestra al cliente cuando elige pagar por Nequi.",
    },
    {
      key: "delivery_text",
      label: "Tiempo de entrega (texto para el cliente)",
      type: "textarea",
      hint: "Se muestra en el historial del cliente cuando su pago está confirmado.",
    },
  ];

  const state = {
    settings: {},
    products: [],
    orders: [],
    users: [],
    filter: "todos",
    productImage: "",
    editingProductId: null,
  };

  const $ = function (sel) {
    return document.querySelector(sel);
  };

  // ---------------------------------------------------------------------------
  // Sesión
  // ---------------------------------------------------------------------------
  function showLogin(message) {
    $("#loginView").classList.remove("hidden");
    $("#panelView").classList.add("hidden");
    $("#adminLoginError").textContent = message || "";
  }

  function showPanel(user) {
    $("#loginView").classList.add("hidden");
    $("#panelView").classList.remove("hidden");
    $("#adminUser").textContent = user.name;
  }

  async function checkSession() {
    try {
      const data = await api("/auth/me");
      if (data.user && data.user.role === "admin") {
        showPanel(data.user);
        await loadAll();
      } else {
        showLogin(data.user ? "Esta cuenta no tiene permisos de administrador." : "");
      }
    } catch (e) {
      showLogin();
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const btn = event.target.querySelector("button[type=submit]");
    btn.disabled = true;
    $("#adminLoginError").textContent = "";
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: { email: $("#adminEmail").value, password: $("#adminPassword").value },
      });
      if (data.user.role !== "admin") {
        await api("/auth/logout", { method: "POST" });
        throw new Error("Esta cuenta no tiene permisos de administrador.");
      }
      showPanel(data.user);
      event.target.reset();
      await loadAll();
    } catch (error) {
      $("#adminLoginError").textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function handleLogout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (e) {
      // ignorar
    }
    state.orders = [];
    showLogin("Sesión cerrada.");
  }

  // ---------------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------------
  async function loadAll() {
    try {
      const [settings, products, orders, users] = await Promise.all([
        api("/content"),
        api("/admin/products"),
        api("/admin/orders"),
        api("/admin/users"),
      ]);
      state.settings = settings;
      state.products = products;
      state.orders = orders;
      state.users = users;
      renderOrders();
      renderProducts();
      renderContentForm();
      renderPaymentForm();
      renderUsers();
      updateCounts();
    } catch (error) {
      toast(error.message);
    }
  }

  async function reloadOrders() {
    state.orders = await api("/admin/orders");
    renderOrders();
    updateCounts();
  }

  function updateCounts() {
    const pending = state.orders.filter((o) => o.status === "pendiente").length;
    const pill = $("#pendingPill");
    pill.textContent = pending;
    pill.classList.toggle("hidden", pending === 0);
  }

  // ---------------------------------------------------------------------------
  // Pestañas
  // ---------------------------------------------------------------------------
  function switchView(name) {
    document.querySelectorAll(".admin-tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === name);
    });
    document.querySelectorAll(".admin-view").forEach(function (v) {
      v.classList.toggle("hidden", v.id !== "view-" + name);
    });
    if (name === "orders") reloadOrders().catch(function (e) { toast(e.message); });
  }

  // ---------------------------------------------------------------------------
  // Modales
  // ---------------------------------------------------------------------------
  function openModal(id) {
    $("#overlay").classList.add("open");
    document.getElementById(id).classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModals() {
    document.querySelectorAll(".modal.open").forEach(function (m) {
      m.classList.remove("open");
    });
    $("#overlay").classList.remove("open");
    document.body.style.overflow = "";
  }

  // ---------------------------------------------------------------------------
  // Pedidos
  // ---------------------------------------------------------------------------
  function renderOrders() {
    const orders = state.orders;
    const paid = orders.filter(function (o) {
      return o.status === "pagado" || o.status === "entregado";
    });
    const income = paid.reduce(function (sum, o) {
      return sum + o.total;
    }, 0);
    $("#statTotal").textContent = orders.length;
    $("#statPending").textContent = orders.filter(function (o) {
      return o.status === "pendiente";
    }).length;
    $("#statPaid").textContent = paid.length;
    $("#statIncome").textContent = money(income);

    const list = orders.filter(function (o) {
      return state.filter === "todos" || o.status === state.filter;
    });
    $("#ordersList").innerHTML =
      list.length === 0
        ? '<div class="empty">No hay pedidos en esta categoría.</div>'
        : list.map(orderCard).join("");
  }

  function actionButton(orderId, status, label, cls) {
    return (
      '<button type="button" class="btn btn-sm ' + cls + '" data-set-status="' + status + '" data-order="' + orderId + '">' + label + "</button>"
    );
  }

  function orderCard(o) {
    const phone = digitsOnly(o.phone);
    const waLink = phone ? '<a href="https://wa.me/' + phone + '" target="_blank" rel="noopener">' + escapeHtml(o.phone) + "</a>" : escapeHtml(o.phone);
    const items = o.items
      .map(function (i) {
        return "<li>" + i.quantity + " × " + escapeHtml(i.productName) + " — " + money(i.unitPrice * i.quantity) + "</li>";
      })
      .join("");

    const actions = [];
    if (o.status === "pendiente") {
      actions.push(actionButton(o.id, "pagado", "Marcar como pagado", "btn-accent"));
      actions.push(actionButton(o.id, "cancelado", "Cancelar pedido", "btn-ghost"));
    } else if (o.status === "pagado") {
      actions.push(actionButton(o.id, "entregado", "Marcar como entregado", "btn-accent"));
      actions.push(actionButton(o.id, "cancelado", "Cancelar pedido", "btn-ghost"));
    }
    actions.push('<button type="button" class="btn btn-sm btn-danger" data-delete-order="' + o.id + '">Eliminar pedido</button>');

    return (
      '<article class="admin-order is-' + o.status + '">' +
      "<div>" +
      "<h3>" + escapeHtml(o.orderNumber) + "</h3>" +
      '<div class="meta">' + formatDate(o.createdAt) + " · Pago: " + (o.paymentMethod === "nequi" ? "Nequi" : "WhatsApp") + "</div>" +
      '<div class="details" style="margin-top:.6rem">' +
      "<div><strong>Cliente:</strong> " + escapeHtml(o.customerName) + "</div>" +
      "<div><strong>Teléfono:</strong> " + waLink + "</div>" +
      "<div><strong>Dirección:</strong> " + escapeHtml(o.address) + "</div>" +
      (o.notes ? "<div><strong>Notas:</strong> " + escapeHtml(o.notes) + "</div>" : "") +
      "</div>" +
      '<ul style="margin-top:.6rem">' + items + "</ul>" +
      "</div>" +
      '<div class="side">' +
      '<span class="status status-' + o.status + '">' + (STATUS_LABEL[o.status] || o.status) + "</span>" +
      '<div class="total">' + money(o.total) + "</div>" +
      "</div>" +
      '<div class="actions">' + actions.join("") + "</div>" +
      "</article>"
    );
  }

  async function setOrderStatus(orderId, status) {
    if (status === "cancelado" && !confirm("¿Seguro que quieres cancelar este pedido?")) return;
    try {
      await api("/admin/orders/" + orderId, { method: "PATCH", body: { status: status } });
      toast("Pedido actualizado a: " + STATUS_LABEL[status]);
      await reloadOrders();
    } catch (error) {
      toast(error.message);
    }
  }

  async function deleteOrder(orderId) {
    if (!confirm("¿Eliminar este pedido de forma permanente? Esta acción no se puede deshacer.")) return;
    try {
      await api("/admin/orders/" + orderId, { method: "DELETE" });
      toast("Pedido eliminado");
      await reloadOrders();
    } catch (error) {
      toast(error.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Figuras
  // ---------------------------------------------------------------------------
  function renderProducts() {
    if (state.products.length === 0) {
      $("#productsList").innerHTML = '<div class="empty" style="grid-column:1/-1">Aún no hay figuras. Crea la primera con “Nueva figura”.</div>';
      return;
    }
    $("#productsList").innerHTML = state.products
      .map(function (p) {
        const img = p.image
          ? '<img src="' + escapeHtml(p.image) + '" alt="">'
          : '<span style="font-size:2.5rem">🎨</span>';
        return (
          '<article class="admin-product' + (p.active ? "" : " is-inactive") + '">' +
          '<div class="thumb">' + img + "</div>" +
          '<div class="body">' +
          '<span class="pill ' + (p.active ? "pill-on" : "pill-off") + '">' + (p.active ? "Visible" : "Oculta") + "</span>" +
          "<h3>" + escapeHtml(p.name) + "</h3>" +
          '<div class="muted" style="font-size:.85rem">' + escapeHtml(p.category || "General") + "</div>" +
          '<div class="price">' + money(p.price) + "</div>" +
          "</div>" +
          '<div class="actions">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-edit-product="' + p.id + '">Editar</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-toggle-product="' + p.id + '">' + (p.active ? "Ocultar" : "Mostrar") + "</button>" +
          '<button type="button" class="btn btn-danger btn-sm" data-delete-product="' + p.id + '">Eliminar</button>' +
          "</div></article>"
        );
      })
      .join("");
  }

  function openProductModal(product) {
    state.editingProductId = product ? product.id : null;
    state.productImage = product ? product.image || "" : "";
    $("#productModalTitle").textContent = product ? "Editar figura" : "Nueva figura";
    $("#pName").value = product ? product.name : "";
    $("#pCategory").value = product ? product.category || "General" : "General";
    $("#pPrice").value = product ? product.price : "";
    $("#pSort").value = product ? product.sortOrder : state.products.length + 1;
    $("#pDescription").value = product ? product.description || "" : "";
    $("#pActive").checked = product ? !!product.active : true;
    $("#pError").textContent = "";
    refreshProductPreview();
    openModal("productModal");
  }

  function refreshProductPreview() {
    $("#pPreview").innerHTML = state.productImage
      ? '<img src="' + escapeHtml(state.productImage) + '" alt="Vista previa">'
      : '<span class="muted">Sin imagen</span>';
  }

  async function saveProduct(event) {
    event.preventDefault();
    const btn = $("#productSave");
    if (!$("#pName").value.trim()) {
      $("#pError").textContent = "Escribe el nombre de la figura.";
      return;
    }
    if ($("#pPrice").value === "" || Number($("#pPrice").value) < 0) {
      $("#pError").textContent = "Escribe un precio válido (en pesos).";
      return;
    }
    $("#pError").textContent = "";
    const body = {
      name: $("#pName").value,
      category: $("#pCategory").value,
      price: $("#pPrice").value,
      sortOrder: $("#pSort").value,
      description: $("#pDescription").value,
      active: $("#pActive").checked,
      image: state.productImage,
    };
    btn.disabled = true;
    try {
      if (state.editingProductId) {
        await api("/admin/products/" + state.editingProductId, { method: "PUT", body: body });
      } else {
        await api("/admin/products", { method: "POST", body: body });
      }
      closeModals();
      toast("Figura guardada. Los cambios ya aparecen en la tienda.");
      state.products = await api("/admin/products");
      renderProducts();
    } catch (error) {
      $("#pError").textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function toggleProduct(id) {
    const product = state.products.find(function (p) {
      return p.id === id;
    });
    if (!product) return;
    try {
      await api("/admin/products/" + id, { method: "PUT", body: { active: !product.active } });
      state.products = await api("/admin/products");
      renderProducts();
      toast(product.active ? "Figura oculta en la tienda" : "Figura visible en la tienda");
    } catch (error) {
      toast(error.message);
    }
  }

  async function deleteProduct(id) {
    if (!confirm("¿Eliminar esta figura? Los pedidos anteriores conservarán su nombre y precio.")) return;
    try {
      await api("/admin/products/" + id, { method: "DELETE" });
      state.products = await api("/admin/products");
      renderProducts();
      toast("Figura eliminada");
    } catch (error) {
      toast(error.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Textos e imágenes
  // ---------------------------------------------------------------------------
  function fieldHtml(field, value) {
    const id = "f_" + field.key;
    const v = escapeHtml(value);
    if (field.type === "image") {
      return (
        '<div class="field img-field">' +
        '<label>' + escapeHtml(field.label) + "</label>" +
        '<div class="img-preview">' +
        (value ? '<img src="' + v + '" alt="">' : '<span class="muted">Sin imagen</span>') +
        "</div>" +
        '<div class="img-actions">' +
        '<label class="btn btn-ghost btn-sm">Cambiar imagen<input type="file" accept="image/*" hidden data-file="' + field.key + '"></label>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-clear="' + field.key + '">Quitar</button>' +
        "</div>" +
        '<input type="hidden" data-key="' + field.key + '" value="' + v + '">' +
        "</div>"
      );
    }
    if (field.type === "textarea") {
      return (
        '<div class="field"><label for="' + id + '">' + escapeHtml(field.label) + "</label>" +
        '<textarea id="' + id + '" data-key="' + field.key + '">' + v + "</textarea>" +
        (field.hint ? '<span class="hint">' + escapeHtml(field.hint) + "</span>" : "") +
        "</div>"
      );
    }
    if (field.type === "select") {
      const opts = field.options
        .map(function (o) {
          return '<option value="' + escapeHtml(o[0]) + '"' + (String(value) === o[0] ? " selected" : "") + ">" + escapeHtml(o[1]) + "</option>";
        })
        .join("");
      return (
        '<div class="field"><label for="' + id + '">' + escapeHtml(field.label) + "</label>" +
        '<select id="' + id + '" data-key="' + field.key + '">' + opts + "</select>" +
        (field.hint ? '<span class="hint">' + escapeHtml(field.hint) + "</span>" : "") +
        "</div>"
      );
    }
    const type = field.type === "color" ? "color" : field.type === "url" ? "url" : "text";
    return (
      '<div class="field"><label for="' + id + '">' + escapeHtml(field.label) + "</label>" +
      '<input id="' + id + '" type="' + type + '" data-key="' + field.key + '" value="' + v + '">' +
      (field.hint ? '<span class="hint">' + escapeHtml(field.hint) + "</span>" : "") +
      "</div>"
    );
  }

  function renderContentForm() {
    $("#contentFields").innerHTML = CONTENT_SECTIONS.map(function (section) {
      return (
        '<section class="admin-card"><h3>' + escapeHtml(section.title) + "</h3>" +
        section.fields.map(function (f) {
          return fieldHtml(f, state.settings[f.key] || "");
        }).join("") +
        "</section>"
      );
    }).join("");
  }

  function renderPaymentForm() {
    $("#paymentFields").innerHTML = PAYMENT_FIELDS.map(function (f) {
      return fieldHtml(f, state.settings[f.key] || "");
    }).join("");
  }

  function collect(container) {
    const out = {};
    container.querySelectorAll("[data-key]").forEach(function (el) {
      out[el.getAttribute("data-key")] = el.value;
    });
    return out;
  }

  async function saveSettings(container, button) {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Guardando…";
    try {
      const data = collect(container);
      state.settings = await api("/admin/settings", { method: "PUT", body: data });
      applyTheme(state.settings);
      toast("Cambios guardados. Recarga la tienda para verlos.");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function handleImageFile(input) {
    const key = input.getAttribute("data-file");
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const dataUrl = await readImage(file, 1000, 0.85);
      const field = $("#contentFields").querySelector('[data-key="' + key + '"]');
      if (field) {
        field.value = dataUrl;
        const preview = field.closest(".img-field").querySelector(".img-preview");
        preview.innerHTML = '<img src="' + dataUrl + '" alt="">';
      }
      toast("Imagen cargada. Pulsa “Guardar cambios” para publicarla.");
    } catch (error) {
      toast(error.message);
    } finally {
      input.value = "";
    }
  }

  // ---------------------------------------------------------------------------
  // Usuarios
  // ---------------------------------------------------------------------------
  function renderUsers() {
    const rows = state.users.map(function (u) {
      return (
        '<div class="user-row">' +
        "<span><strong>" + escapeHtml(u.name) + "</strong></span>" +
        "<span>" + escapeHtml(u.email) + "</span>" +
        "<span>" + escapeHtml(u.phone || "—") + "</span>" +
        '<span><span class="pill ' + (u.role === "admin" ? "pill-on" : "pill-off") + '">' + escapeHtml(u.role) + "</span></span>" +
        "</div>"
      );
    });
    $("#usersList").innerHTML =
      '<div class="user-row user-head"><span>Nombre</span><span>Correo</span><span>Teléfono</span><span>Rol</span></div>' +
      (rows.length ? rows.join("") : '<div class="empty" style="border:0">Aún no hay usuarios registrados.</div>');
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------
  function bindEvents() {
    $("#adminLoginForm").addEventListener("submit", handleLogin);
    $("#adminLogout").addEventListener("click", handleLogout);

    document.querySelectorAll(".admin-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        switchView(b.getAttribute("data-view"));
      });
    });

    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", closeModals);
    });
    $("#overlay").addEventListener("click", closeModals);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModals();
    });

    // Pedidos
    $("#orderFilter").addEventListener("change", function (e) {
      state.filter = e.target.value;
      renderOrders();
    });
    $("#refreshOrders").addEventListener("click", function () {
      reloadOrders().then(function () {
        toast("Pedidos actualizados");
      });
    });
    $("#ordersList").addEventListener("click", function (e) {
      const statusBtn = e.target.closest("[data-set-status]");
      if (statusBtn) {
        setOrderStatus(Number(statusBtn.getAttribute("data-order")), statusBtn.getAttribute("data-set-status"));
        return;
      }
      const delBtn = e.target.closest("[data-delete-order]");
      if (delBtn) deleteOrder(Number(delBtn.getAttribute("data-delete-order")));
    });

    // Figuras
    $("#newProductBtn").addEventListener("click", function () {
      openProductModal(null);
    });
    $("#productsList").addEventListener("click", function (e) {
      const edit = e.target.closest("[data-edit-product]");
      if (edit) {
        const id = Number(edit.getAttribute("data-edit-product"));
        openProductModal(
          state.products.find(function (p) {
            return p.id === id;
          })
        );
        return;
      }
      const toggle = e.target.closest("[data-toggle-product]");
      if (toggle) return toggleProduct(Number(toggle.getAttribute("data-toggle-product")));
      const del = e.target.closest("[data-delete-product]");
      if (del) deleteProduct(Number(del.getAttribute("data-delete-product")));
    });
    $("#productForm").addEventListener("submit", saveProduct);
    $("#pImage").addEventListener("change", async function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        state.productImage = await readImage(file, 900, 0.85);
        refreshProductPreview();
      } catch (error) {
        $("#pError").textContent = error.message;
      } finally {
        e.target.value = "";
      }
    });
    $("#pClearImage").addEventListener("click", function () {
      state.productImage = "";
      refreshProductPreview();
    });

    // Textos e imágenes
    $("#contentFields").addEventListener("change", function (e) {
      if (e.target.matches("[data-file]")) handleImageFile(e.target);
    });
    $("#contentFields").addEventListener("click", function (e) {
      const clear = e.target.closest("[data-clear]");
      if (!clear) return;
      const key = clear.getAttribute("data-clear");
      const field = $("#contentFields").querySelector('[data-key="' + key + '"]');
      if (field) {
        field.value = "";
        field.closest(".img-field").querySelector(".img-preview").innerHTML = '<span class="muted">Sin imagen</span>';
      }
    });
    $("#saveContent").addEventListener("click", function () {
      saveSettings($("#contentFields"), $("#saveContent"));
    });

    // Pagos
    $("#savePayments").addEventListener("click", function () {
      saveSettings($("#paymentFields"), $("#savePayments"));
    });

    // Usuarios
    $("#refreshUsers").addEventListener("click", async function () {
      try {
        state.users = await api("/admin/users");
        renderUsers();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    checkSession();
  });
})();
