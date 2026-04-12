/* =============================================
   LA HORNADA — Tienda JS
   ============================================= */

/* ── STATE ── */
let products = [];
let cart = {};

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

/* ── CONFIGURACIÓN DE TIENDA ── */
function applyStoreSettings() {
  const s = localStorage.getItem('lahornada_settings');
  if (!s) return;
  const cfg = JSON.parse(s);

  // Actualizar footer con datos de configuración
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

  // Actualizar título del logo si hay nombre configurado
  if (cfg.name) {
    const logoEl = document.querySelector('.logo');
    if (logoEl) {
      // Preservar el span de subtítulo
      const span = logoEl.querySelector('span');
      logoEl.childNodes[0].textContent = cfg.name + ' ';
      if (span) logoEl.appendChild(span);
    }
  }
}

/* ── RESOLVER URL DE IMAGEN ── */
// Acepta rutas locales (img/foto.jpg) y URLs externas (https://...)
function resolveImg(img) {
  if (!img) return 'img/placeholder.svg';
  // Si es base64 o URL externa, usarla tal cual
  if (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://')) {
    return img;
  }
  // Ruta local relativa al hosting
  return img;
}

/* ── RENDER PRODUCTS ── */
function renderProducts() {
  products = getProducts();
  const grid = document.getElementById('productsGrid');
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
    const imgSrc = resolveImg(p.img);
    return `
    <div class="product-card">
      <div class="product-img">
        <img
          src="${imgSrc}"
          alt="${esc(p.name)}"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"
        >
        <div class="emoji-fallback" style="display:none">${p.emoji}</div>
      </div>
      <div class="product-body">
        <div class="product-name">${esc(p.name)}</div>
        <div class="product-desc">${esc(p.desc)}</div>
        <div class="product-footer">
          <div class="product-price">
            S/ ${Number(p.price).toFixed(2)}<span> / unidad</span>
          </div>
          <button class="add-btn" onclick="addToCart(${p.id})">+ Agregar</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── CART: ADD ── */
function addToCart(id) {
  if (!cart[id]) cart[id] = 0;
  cart[id]++;
  updateCartUI();

  const p = products.find(x => x.id === id);
  showToast(`✅ ${p.emoji} ${esc(p.name)} agregado`);

  const badge = document.getElementById('cartBadge');
  badge.classList.remove('bump');
  void badge.offsetWidth;
  badge.classList.add('bump');
}

/* ── CART: CHANGE QTY ── */
function changeQty(id, delta) {
  if (!cart[id]) return;
  cart[id] += delta;
  if (cart[id] <= 0) delete cart[id];
  updateCartUI();
}

/* ── CART: REMOVE ── */
function removeItem(id) {
  delete cart[id];
  updateCartUI();
}

/* ── CART: UPDATE UI ── */
function updateCartUI() {
  const total = Object.keys(cart).reduce((s, id) => s + cart[id], 0);
  document.getElementById('cartBadge').textContent = total;

  const itemsEl  = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');
  const keys     = Object.keys(cart);

  if (keys.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <div class="empty-icon">🍽️</div>
        <p>Tu carrito está vacío.<br>¡Agrega algo delicioso!</p>
      </div>`;
    footerEl.style.display = 'none';
    return;
  }

  let subtotal = 0;
  itemsEl.innerHTML = keys.map(id => {
    const p   = products.find(x => x.id == id);
    const qty = cart[id];
    const sub = p.price * qty;
    subtotal += sub;
    const imgSrc = resolveImg(p.img);

    // Mostrar imagen si carga bien, si no mostrar emoji
    return `
      <div class="cart-item">
        <div class="cart-item-icon">
          <img
            src="${imgSrc}"
            alt="${esc(p.name)}"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"
          >
          <span class="cart-item-emoji" style="display:none">${p.emoji}</span>
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${esc(p.name)}</div>
          <div class="cart-item-price">S/ ${Number(p.price).toFixed(2)} c/u</div>
          <div class="cart-item-controls">
            <button class="qty-btn" onclick="changeQty(${id}, -1)">−</button>
            <span class="qty-num">${qty}</span>
            <button class="qty-btn" onclick="changeQty(${id}, 1)">+</button>
            <button class="remove-btn" onclick="removeItem(${id})">✕ quitar</button>
          </div>
        </div>
        <div class="cart-item-total">S/ ${sub.toFixed(2)}</div>
      </div>`;
  }).join('');

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
  cart = {};
  updateCartUI();
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

/* ── INIT ── */
applyStoreSettings();
renderProducts();
