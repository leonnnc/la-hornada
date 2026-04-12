/* =============================================
   LA HORNADA — Tienda JS
   ============================================= */

/* ── STATE ── */
let products = [];
let cart     = {};      // { id: qty }  pedidos normales
let preorder = {};      // { id: qty }  solicitudes para mañana

/* ── SANITIZAR (prevenir XSS) ── */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ── STORAGE ── */
function getProducts() {
  const saved = localStorage.getItem('lahornada_products');
  return saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
}

/* ── STOCK DISPONIBLE (descontando lo que ya está en carrito) ── */
function stockDisponible(p) {
  const stock = p.stock ?? 99; // si no tiene campo stock, ilimitado
  const enCarrito = cart[p.id] || 0;
  return Math.max(0, stock - enCarrito);
}

/* ── CONFIGURACIÓN DE TIENDA ── */
function applyStoreSettings() {
  const s = localStorage.getItem('lahornada_settings');
  if (!s) return;
  const cfg = JSON.parse(s);
  const footer = document.querySelector('footer');
  if (footer) {
    const name  = cfg.name  || 'La Hornada';
    const phone = cfg.phone || '+51 987 654 321';
    const addr  = cfg.addr  || 'Lima, Perú';
    const hours = cfg.hours || 'Lun–Dom 8am–8pm';
    footer.innerHTML = `
      <strong>${esc(name)}</strong> — Delicias Artesanales<br>
      📍 ${esc(addr)} &nbsp;|&nbsp; 📞 ${esc(phone)} &nbsp;|&nbsp; 🕐 ${esc(hours)}
    `;
  }
  if (cfg.name) {
    const logoEl = document.querySelector('.logo');
    if (logoEl) {
      const span = logoEl.querySelector('span');
      logoEl.childNodes[0].textContent = cfg.name + ' ';
      if (span) logoEl.appendChild(span);
    }
  }
}

/* ── RESOLVER URL DE IMAGEN ── */
function resolveImg(img) {
  if (!img) return 'img/placeholder.svg';
  if (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://')) return img;
  return img;
}

/* ── BADGE DE STOCK ── */
function stockBadge(p) {
  const s = p.stock ?? 99;
  if (s === 0)  return `<span class="stock-badge out">Sin stock</span>`;
  if (s <= 3)   return `<span class="stock-badge low">¡Solo ${s} disponibles!</span>`;
  if (s <= 10)  return `<span class="stock-badge ok">${s} disponibles</span>`;
  return `<span class="stock-badge plenty">En stock</span>`;
}

/* ── RENDER PRODUCTS ── */
function renderProducts() {
  products = getProducts();
  const grid    = document.getElementById('productsGrid');
  const visible = products.filter(p => p.available !== false);

  if (visible.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
        <div style="font-size:3rem;margin-bottom:12px">🍽️</div>
        <p>No hay productos disponibles por el momento.</p>
      </div>`;
    return;
  }

  grid.innerHTML = visible.map(p => {
    const imgSrc  = resolveImg(p.img);
    const sinStock = (p.stock ?? 99) === 0;
    return `
    <div class="product-card ${sinStock ? 'out-of-stock' : ''}">
      <div class="product-img">
        <img src="${imgSrc}" alt="${esc(p.name)}"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
        <div class="emoji-fallback" style="display:none">${p.emoji}</div>
        ${sinStock ? '<div class="stock-overlay">Sin stock hoy</div>' : ''}
      </div>
      <div class="product-body">
        <div class="product-name">${esc(p.name)}</div>
        <div class="product-desc">${esc(p.desc)}</div>
        <div class="stock-row">${stockBadge(p)}</div>
        <div class="product-footer">
          <div class="product-price">
            S/ ${Number(p.price).toFixed(2)}<span> / unidad</span>
          </div>
          ${sinStock
            ? `<button class="preorder-btn" onclick="addPreorder(${p.id})">📅 Pedir para mañana</button>`
            : `<button class="add-btn" onclick="addToCart(${p.id})">+ Agregar</button>`
          }
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── CART: ADD ── */
function addToCart(id) {
  const p = products.find(x => x.id === id);
  const disponible = stockDisponible(p);
  if (disponible <= 0) {
    showToast(`⚠️ No hay más stock de ${p.name}`);
    return;
  }
  if (!cart[id]) cart[id] = 0;
  cart[id]++;
  updateCartUI();
  renderProducts(); // refrescar badges de stock

  showToast(`✅ ${p.emoji} ${esc(p.name)} agregado`);
  const badge = document.getElementById('cartBadge');
  badge.classList.remove('bump');
  void badge.offsetWidth;
  badge.classList.add('bump');
}

/* ── PREORDER: ADD ── */
function addPreorder(id) {
  const p = products.find(x => x.id === id);
  if (!preorder[id]) preorder[id] = 0;
  preorder[id]++;
  updateCartUI();
  showToast(`📅 ${p.emoji} ${esc(p.name)} — solicitud para mañana agregada`);
  const badge = document.getElementById('cartBadge');
  badge.classList.remove('bump');
  void badge.offsetWidth;
  badge.classList.add('bump');
}

/* ── CART: CHANGE QTY ── */
function changeQty(id, delta, isPreorder) {
  const obj = isPreorder ? preorder : cart;
  if (!obj[id]) return;
  obj[id] += delta;
  if (obj[id] <= 0) delete obj[id];

  if (!isPreorder) {
    // Validar que no supere el stock
    const p = products.find(x => x.id == id);
    const maxStock = p.stock ?? 99;
    if (cart[id] && cart[id] > maxStock) cart[id] = maxStock;
    renderProducts();
  }
  updateCartUI();
}

/* ── CART: REMOVE ── */
function removeItem(id, isPreorder) {
  if (isPreorder) delete preorder[id];
  else { delete cart[id]; renderProducts(); }
  updateCartUI();
}

/* ── CART: UPDATE UI ── */
function updateCartUI() {
  const totalCart     = Object.keys(cart).reduce((s, id) => s + cart[id], 0);
  const totalPreorder = Object.keys(preorder).reduce((s, id) => s + preorder[id], 0);
  document.getElementById('cartBadge').textContent = totalCart + totalPreorder;

  const itemsEl  = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');
  const cartKeys     = Object.keys(cart);
  const preorderKeys = Object.keys(preorder);

  if (cartKeys.length === 0 && preorderKeys.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <div class="empty-icon">🍽️</div>
        <p>Tu carrito está vacío.<br>¡Agrega algo delicioso!</p>
      </div>`;
    footerEl.style.display = 'none';
    return;
  }

  let subtotal = 0;
  let html = '';

  // ── Pedidos normales ──
  if (cartKeys.length > 0) {
    html += `<div class="cart-section-label">🛒 Pedido de hoy</div>`;
    html += cartKeys.map(id => {
      const p   = products.find(x => x.id == id);
      const qty = cart[id];
      const sub = p.price * qty;
      subtotal += sub;
      const imgSrc = resolveImg(p.img);
      return `
        <div class="cart-item">
          <div class="cart-item-icon">
            <img src="${imgSrc}" alt="${esc(p.name)}"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
            <span class="cart-item-emoji" style="display:none">${p.emoji}</span>
          </div>
          <div class="cart-item-info">
            <div class="cart-item-name">${esc(p.name)}</div>
            <div class="cart-item-price">S/ ${Number(p.price).toFixed(2)} c/u</div>
            <div class="cart-item-controls">
              <button class="qty-btn" onclick="changeQty(${id}, -1, false)">−</button>
              <span class="qty-num">${qty}</span>
              <button class="qty-btn" onclick="changeQty(${id}, 1, false)">+</button>
              <button class="remove-btn" onclick="removeItem(${id}, false)">✕ quitar</button>
            </div>
          </div>
          <div class="cart-item-total">S/ ${sub.toFixed(2)}</div>
        </div>`;
    }).join('');
  }

  // ── Solicitudes para mañana ──
  if (preorderKeys.length > 0) {
    html += `<div class="cart-section-label preorder-label">📅 Solicitudes para mañana</div>`;
    html += preorderKeys.map(id => {
      const p   = products.find(x => x.id == id);
      const qty = preorder[id];
      const sub = p.price * qty;
      subtotal += sub;
      const imgSrc = resolveImg(p.img);
      return `
        <div class="cart-item preorder-item">
          <div class="cart-item-icon">
            <img src="${imgSrc}" alt="${esc(p.name)}"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
            <span class="cart-item-emoji" style="display:none">${p.emoji}</span>
          </div>
          <div class="cart-item-info">
            <div class="cart-item-name">${esc(p.name)}</div>
            <div class="cart-item-price">S/ ${Number(p.price).toFixed(2)} c/u · <span style="color:#C8862A">Para mañana</span></div>
            <div class="cart-item-controls">
              <button class="qty-btn" onclick="changeQty(${id}, -1, true)">−</button>
              <span class="qty-num">${qty}</span>
              <button class="qty-btn" onclick="changeQty(${id}, 1, true)">+</button>
              <button class="remove-btn" onclick="removeItem(${id}, true)">✕ quitar</button>
            </div>
          </div>
          <div class="cart-item-total">S/ ${sub.toFixed(2)}</div>
        </div>`;
    }).join('');
  }

  itemsEl.innerHTML = html;
  document.getElementById('subtotalAmt').textContent = `S/ ${subtotal.toFixed(2)}`;
  document.getElementById('totalAmt').textContent    = `S/ ${subtotal.toFixed(2)}`;
  footerEl.style.display = 'block';
}

/* ── CART: OPEN / CLOSE ── */
function openCart() {
  document.getElementById('cartOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
function handleOverlayClick(e) {
  if (e.target === document.getElementById('cartOverlay')) closeCart();
}

/* ── TOAST ── */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

/* ── ORDER ── */
function placeOrder() {
  closeCart();
  cart     = {};
  preorder = {};
  updateCartUI();
  renderProducts();
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

/* ── INIT ── */
applyStoreSettings();
renderProducts();
