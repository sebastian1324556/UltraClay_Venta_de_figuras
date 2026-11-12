/* ULTRA M 64 · Lógica de la tienda (catálogo, carrito, pagos, cuenta y pedidos) */
(function () {
  "use strict";

  const { api, money, escapeHtml, formatDate, toast, digitsOnly, applyTheme, applyContent } = window.UM64;
  const CART_KEY = "um64_cart";
  const MAX_QTY = 99;

  const state = {
    settings: {},
    products: [],
    user: null,
    category: "Todas",
    search: "",
    cart: loadCart(),
    pendingCheckout: false,
    lastOrder: null,
  };

  const $ = function (sel) {
    return document.querySelector(sel);
  };

  // ---------------------------------------------------------------------------
  // Carrito (se guarda en el navegador)
  // ---------------------------------------------------------------------------
  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(raw)
        ? raw.filter(function (i) {
            return i && Number.isInteger(i.productId) && i.quantity >= 1;
          })
        : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    renderCartBadge();
  }

  function cartLines() {
    // Solo muestra figuras que todavía existen y están activas
    const byId = new Map(state.products.map(function (p) {
      return [p.id, p];
    }));
    const lines = [];
    let changed = false;
    state.cart = state.cart.filter(function (item) {
      const product = byId.get(item.productId);
      if (!product) {
        changed = true;
        return false;
      }
      lines.push({ product: product, quantity: item.quantity });
      return true;
    });
    if (changed) saveCart();
    return lines;
  }

  function cartTotal() {
    return cartLines().reduce(function (sum, l) {
      return sum + l.product.price * l.quantity;
    }, 0);
  }

  function cartCount() {
    return state.cart.reduce(function (sum, i) {
      return sum + i.quantity;
    }, 0);
  }

  function addToCart(productId) {
    const item = state.cart.find(function (i) {
      return i.productId === productId;
    });
    if (item) {
      item.quantity = Math.min(MAX_QTY, item.quantity + 1);
    } else {
      state.cart.push({ productId: productId, quantity: 1 });
    }
    saveCart();
    const product = state.products.find(function (p) {
      return p.id === productId;
    });
    toast("Agregaste " + (product ? product.name : "una figura") + " al carrito");
    renderCart();
  }

  function setQuantity(productId, quantity) {
    const item = state.cart.find(function (i) {
      return i.productId === productId;
    });
    if (!item) return;
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty < 1) {
      removeFromCart(productId);
      return;
    }
    item.quantity = Math.min(MAX_QTY, qty);
    saveCart();
    renderCart();
  }

  function removeFromCart(productId) {
    state.cart = state.cart.filter(function (i) {
      return i.productId !== productId;
    });
    saveCart();
    renderCart();
    toast("Figura eliminada del carrito");
  }

  function renderCartBadge() {
    const count = cartCount();
    const badge = $("#cartCount");
    badge.textContent = count;
    badge.classList.toggle("hidden", count === 0);
  }

  function renderCart() {
    const lines = cartLines();
    renderCartBadge();
    const list = $("#cartItems");
    if (lines.length === 0) {
      list.innerHTML = '<div class="empty">Tu carrito está vacío. Agrega figuras desde el catálogo.</div>';
    } else {
      list.innerHTML = lines
        .map(function (l) {
          const p = l.product;
          const img = p.image
            ? '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '">'
            : '<img alt="">';
          return (
            '<div class="cart-item">' +
            img +
            "<div>" +
            '<div class="cart-item-name">' + escapeHtml(p.name) + "</div>" +
            '<div class="muted">' + money(p.price) + " c/u · " + money(p.price * l.quantity) + "</div>" +
            '<div class="qty">' +
            '<button type="button" data-qty="-1" data-id="' + p.id + '" aria-label="Quitar uno">−</button>' +
            '<input type="number" min="1" max="' + MAX_QTY + '" value="' + l.quantity + '" data-qty-input="' + p.id + '" aria-label="Cantidad">' +
            '<button type="button" data-qty="1" data-id="' + p.id + '" aria-label="Agregar uno">+</button>' +
            "</div>" +
            "</div>" +
            '<button type="button" class="remove-btn" data-remove="' + p.id + '">Quitar</button>' +
            "</div>"
          );
        })
        .join("");
    }
    $("#cartTotal").textContent = money(cartTotal());
    $("#continueBtn").disabled = lines.length === 0;
  }

  function openCart() {
    renderCart();
    openPanel("cartDrawer");
  }

  // ---------------------------------------------------------------------------
  // Modales y paneles
  // ---------------------------------------------------------------------------
  function openPanel(id) {
    closeAll();
    const el = document.getElementById(id);
    el.classList.add("open");
    $("#overlay").classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeAll() {
    document.querySelectorAll(".modal.open, .drawer.open").forEach(function (el) {
      el.classList.remove("open");
    });
    $("#overlay").classList.remove("open");
    document.body.style.overflow = "";
  }

  // ---------------------------------------------------------------------------
  // Catálogo
  // ---------------------------------------------------------------------------
  function renderChips() {
    const categories = ["Todas"].concat(
      Array.from(new Set(state.products.map(function (p) {
        return p.category || "General";
      }))).sort()
    );
    $("#chips").innerHTML = categories
      .map(function (c) {
        return '<button type="button" class="chip' + (c === state.category ? " active" : "") + '" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + "</button>";
      })
      .join("");
  }

  function renderProducts() {
    const term = state.search.trim().toLowerCase();
    const list = state.products.filter(function (p) {
      const matchCat = state.category === "Todas" || (p.category || "General") === state.category;
      const matchText = !term || (p.name + " " + p.description).toLowerCase().includes(term);
      return matchCat && matchText;
    });
    $("#emptyState").classList.toggle("hidden", list.length > 0);
    $("#productGrid").innerHTML = list
      .map(function (p) {
        const img = p.image
          ? '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">'
          : '<span style="font-size:3rem">🎨</span>';
        return (
          '<article class="product-card">' +
          '<div class="product-img">' + img + "</div>" +
          '<div class="product-body">' +
          '<span class="product-cat">' + escapeHtml(p.category || "General") + "</span>" +
          '<h3 class="product-name">' + escapeHtml(p.name) + "</h3>" +
          '<p class="product-desc">' + escapeHtml(p.description) + "</p>" +
          '<div class="product-foot">' +
          '<span class="price">' + money(p.price) + "</span>" +
          '<button type="button" class="btn btn-primary btn-sm" data-add="' + p.id + '">Agregar</button>' +
          "</div></div></article>"
        );
      })
      .join("");
  }

  // ---------------------------------------------------------------------------
  // Cuenta
  // ---------------------------------------------------------------------------
  function renderAccount() {
    const user = state.user;
    $("#loginBtn").classList.toggle("hidden", !!user);
    $("#ordersBtn").classList.toggle("hidden", !user);
    $("#logoutBtn").classList.toggle("hidden", !user);
    $("#userChip").classList.toggle("hidden", !user);
    $("#userChip").textContent = user ? user.name : "";
    $("#adminLink").classList.toggle("hidden", !(user && user.role === "admin"));
  }

  function openAuth(tab, notice) {
    switchAuthTab(tab || "login");
    $("#authNotice").textContent = notice || "";
    $("#authNotice").classList.toggle("hidden", !notice);
    openPanel("authModal");
  }

  function switchAuthTab(tab) {
    document.querySelectorAll(".tab[data-tab]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === tab);
    });
    $("#loginForm").classList.toggle("hidden", tab !== "login");
    $("#registerForm").classList.toggle("hidden", tab !== "register");
    $("#loginError").textContent = "";
    $("#registerError").textContent = "";
  }

  async function handleLogin(event) {
    event.preventDefault();
    const btn = event.submitter || event.target.querySelector("button[type=submit]");
    btn.disabled = true;
    $("#loginError").textContent = "";
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: {
          email: $("#loginEmail").value,
          password: $("#loginPassword").value,
        },
      });
      state.user = data.user;
      event.target.reset();
      renderAccount();
      toast("¡Bienvenido, " + data.user.name + "!");
      afterLogin();
    } catch (error) {
      $("#loginError").textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    const btn = event.submitter || event.target.querySelector("button[type=submit]");
    btn.disabled = true;
    $("#registerError").textContent = "";
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: {
          name: $("#regName").value,
          email: $("#regEmail").value,
          phone: $("#regPhone").value,
          password: $("#regPassword").value,
        },
      });
      state.user = data.user;
      event.target.reset();
      renderAccount();
      toast("Cuenta creada. ¡Gracias por unirte!");
      afterLogin();
    } catch (error) {
      $("#registerError").textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  }

  function afterLogin() {
    if (state.pendingCheckout) {
      state.pendingCheckout = false;
      openCheckout();
    } else {
      closeAll();
    }
  }

  async function handleLogout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (e) {
      // Si falla la red igual limpiamos la sesión visual
    }
    state.user = null;
    renderAccount();
    closeAll();
    toast("Sesión cerrada");
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------
  function continueToCheckout() {
    if (cartLines().length === 0) return;
    if (!state.user) {
      state.pendingCheckout = true;
      openAuth("login", "Inicia sesión o crea tu cuenta para finalizar tu compra. Así guardamos tu historial de pedidos.");
      return;
    }
    openCheckout();
  }

  function openCheckout() {
    const lines = cartLines();
    if (lines.length === 0) {
      toast("Tu carrito está vacío");
      return;
    }
    $("#checkoutSummary").innerHTML =
      lines
        .map(function (l) {
          return (
            '<div class="totals" style="font-size:.95rem;font-weight:700;margin:0 0 .35rem">' +
            "<span>" + l.quantity + " × " + escapeHtml(l.product.name) + "</span>" +
            "<span>" + money(l.product.price * l.quantity) + "</span></div>"
          );
        })
        .join("") +
      '<div class="totals" style="margin-top:.6rem"><span>Total</span><span class="price">' + money(cartTotal()) + "</span></div>";

    $("#checkoutName").value = state.user.name || "";
    $("#checkoutPhone").value = state.user.phone || "";
    $("#checkoutError").textContent = "";

    const nequiOn = state.settings.nequi_enabled === "1" && !!state.settings.nequi_number;
    const nequiOption = $("#nequiOption");
    const nequiInput = nequiOption.querySelector("input");
    nequiOption.classList.toggle("disabled", !nequiOn);
    nequiInput.disabled = !nequiOn;
    $("#nequiHint").textContent = nequiOn
      ? "Paga a la cuenta Nequi indicada y envía el comprobante."
      : "Próximamente disponible.";
    selectPayment("whatsapp");

    openPanel("checkoutModal");
  }

  function selectPayment(value) {
    document.querySelectorAll(".pay-option").forEach(function (opt) {
      const input = opt.querySelector("input");
      const checked = input.value === value && !input.disabled;
      input.checked = checked;
      opt.classList.toggle("selected", checked);
    });
  }

  async function handleCheckout(event) {
    event.preventDefault();
    const btn = $("#checkoutSubmit");
    const errorEl = $("#checkoutError");
    errorEl.textContent = "";
    const paymentInput = document.querySelector('input[name="payment"]:checked');
    const payload = {
      customerName: $("#checkoutName").value,
      phone: $("#checkoutPhone").value,
      address: $("#checkoutAddress").value,
      notes: $("#checkoutNotes").value,
      paymentMethod: paymentInput ? paymentInput.value : "whatsapp",
      items: cartLines().map(function (l) {
        return { productId: l.product.id, quantity: l.quantity };
      }),
    };
    if (!payload.items.length) {
      errorEl.textContent = "Tu carrito está vacío.";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Enviando pedido…";
    try {
      const data = await api("/orders", { method: "POST", body: payload });
      state.lastOrder = data;
      state.cart = [];
      saveCart();
      event.target.reset();
      showSuccess(data, payload.paymentMethod);
    } catch (error) {
      errorEl.textContent = error.message;
      if (error.status === 401) {
        state.user = null;
        renderAccount();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirmar pedido";
    }
  }

  function showSuccess(data, method) {
    const order = data.order;
    let html =
      '<p>Tu pedido <strong>' + escapeHtml(order.orderNumber) + "</strong> por <strong>" +
      money(order.total) + "</strong> fue registrado.</p>";
    if (method === "nequi") {
      html +=
        '<p>Realiza el pago a la cuenta Nequi <strong>' + escapeHtml((data.nequi && data.nequi.number) || "") +
        "</strong> y envía el comprobante por WhatsApp para confirmarlo.</p>";
    } else {
      html += "<p>Envía el resumen por WhatsApp para coordinar el pago.</p>";
    }
    html +=
      '<div class="delivery-note">Cuando tu pago sea confirmado, aquí podrás ver el tiempo estimado de entrega en tu historial de pedidos.</div>';
    $("#successBody").innerHTML = html;
    const link = $("#whatsappLink");
    if (data.whatsappUrl) {
      link.setAttribute("href", data.whatsappUrl);
      link.classList.remove("hidden");
    } else {
      link.classList.add("hidden");
    }
    openPanel("successModal");
  }

  // ---------------------------------------------------------------------------
  // Mis pedidos (historial)
  // ---------------------------------------------------------------------------
  const STATUS_LABEL = {
    pendiente: "Pendiente de pago",
    pagado: "Pagado",
    entregado: "Entregado",
    cancelado: "Cancelado",
  };

  async function openOrders() {
    if (!state.user) {
      openAuth("login");
      return;
    }
    const list = $("#ordersList");
    list.innerHTML = '<p class="muted">Cargando tus pedidos…</p>';
    openPanel("ordersModal");
    try {
      const orders = await api("/orders");
      if (!orders.length) {
        list.innerHTML = '<div class="empty">Aún no tienes pedidos. ¡Anímate a tu primera figura!</div>';
        return;
      }
      list.innerHTML = orders
        .map(function (o) {
          const items = o.items
            .map(function (i) {
              return "<li>" + i.quantity + " × " + escapeHtml(i.productName) + " (" + money(i.unitPrice * i.quantity) + ")</li>";
            })
            .join("");
          let note = "";
          if (o.status === "pagado" || o.status === "entregado") {
            note = '<div class="delivery-note"><strong>Tiempo de entrega:</strong> ' + escapeHtml(state.settings.delivery_text || "") + "</div>";
          } else if (o.status === "pendiente") {
            note = '<div class="delivery-note">Cuando confirmemos tu pago, aquí verás el tiempo estimado de entrega.</div>';
          }
          return (
            '<div class="order-card">' +
            '<div class="order-top"><strong>' + escapeHtml(o.orderNumber) + "</strong>" +
            '<span class="status status-' + o.status + '">' + (STATUS_LABEL[o.status] || o.status) + "</span></div>" +
            '<div class="muted" style="font-size:.85rem">' + formatDate(o.createdAt) + " · " +
            (o.paymentMethod === "nequi" ? "Nequi" : "WhatsApp") + "</div>" +
            '<ul class="order-items">' + items + "</ul>" +
            '<div class="totals" style="margin:.3rem 0 0"><span>Total</span><span class="price">' + money(o.total) + "</span></div>" +
            note +
            "</div>"
          );
        })
        .join("");
    } catch (error) {
      list.innerHTML = '<p class="form-error">' + escapeHtml(error.message) + "</p>";
    }
  }

  // ---------------------------------------------------------------------------
  // Carga inicial
  // ---------------------------------------------------------------------------
  async function loadContent() {
    state.settings = await api("/content");
    applyTheme(state.settings);
    applyContent(state.settings);
  }

  async function loadProducts() {
    state.products = await api("/products");
    renderChips();
    renderProducts();
    renderCart();
  }

  async function loadSession() {
    try {
      const data = await api("/auth/me");
      state.user = data.user;
    } catch (e) {
      state.user = null;
    }
    renderAccount();
  }

  function bindEvents() {
    // Header y navegación móvil
    $("#menuToggle").addEventListener("click", function () {
      $("#mainNav").classList.toggle("open");
    });
    document.querySelectorAll("#mainNav a").forEach(function (a) {
      a.addEventListener("click", function () {
        $("#mainNav").classList.remove("open");
      });
    });
    $("#cartBtn").addEventListener("click", openCart);
    $("#loginBtn").addEventListener("click", function () {
      openAuth("login");
    });
    $("#ordersBtn").addEventListener("click", openOrders);
    $("#logoutBtn").addEventListener("click", handleLogout);
    $("#logoutFromOrders").addEventListener("click", handleLogout);

    // Overlay y cierres
    $("#overlay").addEventListener("click", closeAll);
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", closeAll);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll();
    });

    // Catálogo
    $("#search").addEventListener("input", function (e) {
      state.search = e.target.value;
      renderProducts();
    });
    $("#chips").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      state.category = btn.getAttribute("data-cat");
      renderChips();
      renderProducts();
    });
    $("#productGrid").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-add]");
      if (btn) addToCart(Number(btn.getAttribute("data-add")));
    });

    // Carrito
    $("#cartItems").addEventListener("click", function (e) {
      const qtyBtn = e.target.closest("[data-qty]");
      if (qtyBtn) {
        const id = Number(qtyBtn.getAttribute("data-id"));
        const item = state.cart.find(function (i) {
          return i.productId === id;
        });
        if (item) setQuantity(id, item.quantity + Number(qtyBtn.getAttribute("data-qty")));
        return;
      }
      const removeBtn = e.target.closest("[data-remove]");
      if (removeBtn) removeFromCart(Number(removeBtn.getAttribute("data-remove")));
    });
    $("#cartItems").addEventListener("change", function (e) {
      if (e.target.matches("[data-qty-input]")) {
        setQuantity(Number(e.target.getAttribute("data-qty-input")), e.target.value);
      }
    });
    $("#continueBtn").addEventListener("click", continueToCheckout);

    // Pago
    document.querySelectorAll(".pay-option input").forEach(function (input) {
      input.addEventListener("change", function () {
        selectPayment(input.value);
      });
    });
    $("#checkoutForm").addEventListener("submit", handleCheckout);

    // Cuenta
    document.querySelectorAll(".tab[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        switchAuthTab(b.getAttribute("data-tab"));
      });
    });
    $("#loginForm").addEventListener("submit", handleLogin);
    $("#registerForm").addEventListener("submit", handleRegister);

    // Hero: desplazamiento suave ya lo maneja el href="#productos"
  }

  async function init() {
    bindEvents();
    try {
      await Promise.all([loadContent(), loadProducts(), loadSession()]);
    } catch (error) {
      toast("No pudimos cargar la tienda. Revisa tu conexión e intenta de nuevo.");
      console.error(error);
    }
    renderCartBadge();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
