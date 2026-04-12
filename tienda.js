/* =============================================
   LA HORNADA — Tienda JS (Firebase)
   ============================================= */
import { fsGetProducts, fsDeductStock, fsOnProducts, fsInitIfEmpty, fsSaveOrder, fsWatchOrderStatus } from './firebase.js';

/* ── STATE ── */
let products = [];
let cart     = {};
let preorder = {};

/* ── SANITIZAR ── */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ── RESOLVER IMAGEN ── */
function resolveImg(img) {
  if (!img) return 'img/placeholder.svg';
  if (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://')) return img;
  return img;
}

/* ── STOCK DISPONIBLE (descontando carrito actual) ── */
function stockDisponible(p) {
  const stock = p.stock ?? 99;
  return Math.max(0, stock - (cart[p.id] || 0));
}

/* ── BADGE DE STOCK ── */
function stockBadge(p) {
  const s = p.stock ?? 99;
  if (s === 0) return `<span class="stock-badge out">Sin stock</span>`;
  if (s <= 3)  return `<span class="stock-badge low">¡Solo ${s} disponibles!</span>`;
  if (s <= 10) return `<span class="stock-badge ok">${s} disponibles</span>`;
  return `<span class="stock-badge plenty">En stock</span>`;
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

/* ── RENDER PRODUCTS ── */
function renderProducts() {
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
    const imgSrc   = resolveImg(p.img);
    const sinStock = (p.stock ?? 99) === 0;
    return `
    <div class="product-card ${sinStock ? 'out-of-stock' : ''}">
      <div class="product-img" onclick="openProductModal(${p.id})" style="cursor:pointer">
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
window.addToCart = function(id) {
  const p = products.find(x => x.id === id);
  if (!p || stockDisponible(p) <= 0) {
    showToast(`⚠️ No hay más stock de ${p?.name}`);
    return;
  }
  cart[id] = (cart[id] || 0) + 1;
  updateCartUI();
  renderProducts();
  showToast(`✅ ${p.emoji} ${esc(p.name)} agregado`);
  bumpBadge();
};

/* ── PREORDER: ADD ── */
window.addPreorder = function(id) {
  const p = products.find(x => x.id === id);
  preorder[id] = (preorder[id] || 0) + 1;
  updateCartUI();
  showToast(`📅 ${p.emoji} ${esc(p.name)} — solicitud para mañana agregada`);
  bumpBadge();
};

/* ── CART: CHANGE QTY ── */
window.changeQty = function(id, delta, isPreorder) {
  const obj = isPreorder ? preorder : cart;
  if (!obj[id]) return;
  obj[id] += delta;
  if (obj[id] <= 0) delete obj[id];
  if (!isPreorder) {
    const p = products.find(x => x.id == id);
    const max = p?.stock ?? 99;
    if (cart[id] && cart[id] > max) cart[id] = max;
    renderProducts();
  }
  updateCartUI();
};

/* ── CART: REMOVE ── */
window.removeItem = function(id, isPreorder) {
  if (isPreorder) delete preorder[id];
  else { delete cart[id]; renderProducts(); }
  updateCartUI();
};

/* ── CART: UPDATE UI ── */
function updateCartUI() {
  const totalCart     = Object.values(cart).reduce((s, v) => s + v, 0);
  const totalPreorder = Object.values(preorder).reduce((s, v) => s + v, 0);
  document.getElementById('cartBadge').textContent = totalCart + totalPreorder;

  const itemsEl  = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');

  if (totalCart + totalPreorder === 0) {
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

  if (Object.keys(cart).length > 0) {
    html += `<div class="cart-section-label">🛒 Pedido de hoy</div>`;
    html += Object.keys(cart).map(id => {
      const p   = products.find(x => x.id == id);
      const qty = cart[id];
      const sub = p.price * qty;
      subtotal += sub;
      return cartItemHTML(p, qty, sub, false);
    }).join('');
  }

  if (Object.keys(preorder).length > 0) {
    html += `<div class="cart-section-label preorder-label">📅 Solicitudes para mañana</div>`;
    html += Object.keys(preorder).map(id => {
      const p   = products.find(x => x.id == id);
      const qty = preorder[id];
      const sub = p.price * qty;
      subtotal += sub;
      return cartItemHTML(p, qty, sub, true);
    }).join('');
  }

  itemsEl.innerHTML = html;
  document.getElementById('subtotalAmt').textContent = `S/ ${subtotal.toFixed(2)}`;
  document.getElementById('totalAmt').textContent    = `S/ ${subtotal.toFixed(2)}`;
  footerEl.style.display = 'block';
}

function cartItemHTML(p, qty, sub, isPreorder) {
  const imgSrc = resolveImg(p.img);
  return `
    <div class="cart-item ${isPreorder ? 'preorder-item' : ''}">
      <div class="cart-item-icon">
        <img src="${imgSrc}" alt="${esc(p.name)}"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
        <span class="cart-item-emoji" style="display:none">${p.emoji}</span>
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(p.name)}</div>
        <div class="cart-item-price">S/ ${Number(p.price).toFixed(2)} c/u
          ${isPreorder ? '· <span style="color:var(--gold)">Para mañana</span>' : ''}
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty(${p.id}, -1, ${isPreorder})">−</button>
          <span class="qty-num">${qty}</span>
          <button class="qty-btn" onclick="changeQty(${p.id}, 1, ${isPreorder})">+</button>
          <button class="remove-btn" onclick="removeItem(${p.id}, ${isPreorder})">✕ quitar</button>
        </div>
      </div>
      <div class="cart-item-total">S/ ${sub.toFixed(2)}</div>
    </div>`;
}

/* ── CART: OPEN / CLOSE ── */
window.openCart = function() {
  document.getElementById('cartOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.closeCart = function() {
  document.getElementById('cartOverlay').classList.remove('open');
  document.body.style.overflow = '';
};
window.handleOverlayClick = function(e) {
  if (e.target === document.getElementById('cartOverlay')) window.closeCart();
};

/* ── TOAST ── */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function bumpBadge() {
  const badge = document.getElementById('cartBadge');
  badge.classList.remove('bump');
  void badge.offsetWidth;
  badge.classList.add('bump');
}

/* ── EMAILJS CONFIG ── */
// Ya no se usa — reemplazado por WhatsApp

/* ── WHATSAPP CONFIG ── */
const WA_NUMBER = '51975524363'; // número con código de país Perú

/* ── CHECKOUT STATE ── */
let pendingCart     = {};
let pendingPreorder = {};
let pendingTotal    = 0;

/* ── ORDER: abrir checkout ── */
window.placeOrder = async function() {
  const btn = document.querySelector('.order-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

  try {
    if (Object.keys(cart).length > 0) {
      await fsDeductStock(cart);
    }
  } catch (e) {
    console.error('Error al descontar stock:', e);
  }

  pendingCart     = { ...cart };
  pendingPreorder = { ...preorder };
  pendingTotal    = parseFloat(document.getElementById('totalAmt').textContent.replace('S/ ', '')) || 0;

  cart     = {};
  preorder = {};
  updateCartUI();
  window.closeCart();

  document.getElementById('yapeAmount').textContent = `Total a yapear: S/ ${pendingTotal.toFixed(2)}`;
  showCheckoutStep('payment');
  document.getElementById('checkoutOverlay').classList.add('open');

  if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pedido'; }
};

/* ── CHECKOUT: navegación ── */
function showCheckoutStep(step) {
  ['payment','yape','contra','waiting','confirmed','success'].forEach(s => {
    document.getElementById(`step-${s}`).style.display = 'none';
  });
  document.getElementById(`step-${step}`).style.display = 'block';
}

window.selectPayment = function(method) {
  showCheckoutStep(method === 'yape' ? 'yape' : 'contra');
};

window.backToPayment = function() {
  showCheckoutStep('payment');
};

/* ── CHECKOUT: enviar pedido por WhatsApp ── */
window.submitOrder = async function(method) {
  let nombre, telefono, direccion, yapeDe;

  if (method === 'yape') {
    nombre   = document.getElementById('yape-name').value.trim();
    telefono = document.getElementById('yape-phone').value.trim();
    yapeDe   = document.getElementById('yape-from').value.trim();
    if (!nombre || !telefono || !yapeDe) {
      showToast('⚠️ Por favor completa todos los campos');
      return;
    }
  } else {
    nombre    = document.getElementById('contra-name').value.trim();
    telefono  = document.getElementById('contra-phone').value.trim();
    direccion = document.getElementById('contra-addr').value.trim();
    if (!nombre || !telefono || !direccion) {
      showToast('⚠️ Por favor completa todos los campos');
      return;
    }
  }

  const btn = document.querySelector(`#step-${method === 'yape' ? 'yape' : 'contra'} .btn-confirm-order`);
  if (btn) { btn.disabled = true; btn.textContent = 'Abriendo WhatsApp...'; }

  // Armar líneas del pedido
  const lineasHoy = Object.keys(pendingCart).map(id => {
    const p = products.find(x => x.id == id);
    return `  • ${p.name} x${pendingCart[id]} → S/ ${(p.price * pendingCart[id]).toFixed(2)}`;
  });

  const lineasMañana = Object.keys(pendingPreorder).map(id => {
    const p = products.find(x => x.id == id);
    return `  • ${p.name} x${pendingPreorder[id]} *(para mañana)*`;
  });

  const fecha = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });

  // Construir mensaje WhatsApp
  let msg = `🍞 *NUEVO PEDIDO — La Hornada*\n`;
  msg += `📅 ${fecha}\n\n`;
  msg += `👤 *Cliente:* ${nombre}\n`;
  msg += `📞 *Teléfono:* ${telefono}\n`;

  if (method === 'yape') {
    msg += `💳 *Pago:* Yape desde ${yapeDe}\n`;
  } else {
    msg += `💵 *Pago:* Efectivo (contraentrega)\n`;
    msg += `📍 *Dirección:* ${direccion}\n`;
  }

  msg += `\n🛒 *Productos:*\n`;
  if (lineasHoy.length)    msg += lineasHoy.join('\n') + '\n';
  if (lineasMañana.length) msg += lineasMañana.join('\n') + '\n';
  msg += `\n💰 *TOTAL: S/ ${pendingTotal.toFixed(2)}*`;

  if (method === 'yape') {
    msg += `\n\n📲 *Yape al:* 975 524 363`;
  }

  // Guardar en Firestore
  let orderId = null;
  try {
    orderId = await fsSaveOrder({
      nombre, telefono,
      direccion: direccion || '—',
      metodoPago: method,
      yapeDe: yapeDe || '—',
      items: [...lineasHoy, ...lineasMañana].join('\n'),
      total: pendingTotal,
      fecha,
      estado: method === 'yape' ? 'pendiente_confirmacion' : 'pendiente_envio'
    });
  } catch(e) { console.error('Error guardando pedido:', e); }

  // Abrir WhatsApp
  const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');

  if (method === 'yape') {
    // Mostrar pantalla de espera y escuchar confirmación en tiempo real
    showCheckoutStep('waiting');
    if (orderId) {
      fsWatchOrderStatus(orderId, (estado) => {
        if (estado === 'pagado') {
          showCheckoutStep('confirmed');
        }
      });
    }
  } else {
    const successText = `¡Gracias ${nombre}! Tu pedido fue enviado por WhatsApp. Te contactaremos al ${telefono} para coordinar la entrega. 🎉`;
    document.getElementById('successMsg').textContent = successText;
    showCheckoutStep('success');
  }

  if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar pedido'; }
};

window.closeCheckout = function() {
  document.getElementById('checkoutOverlay').classList.remove('open');
  pendingCart = {}; pendingPreorder = {}; pendingTotal = 0;
  renderProducts();
};

/* ── MODAL DETALLE PRODUCTO ── */
window.openProductModal = function(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  const imgSrc   = resolveImg(p.img);
  const sinStock = (p.stock ?? 99) === 0;

  // Imagen
  const img = document.getElementById('pmImg');
  img.src = imgSrc;
  img.style.display = imgSrc ? 'block' : 'none';
  img.onerror = () => { img.style.display = 'none'; document.getElementById('pmEmoji').style.display = 'flex'; };
  document.getElementById('pmEmoji').textContent = p.emoji;
  document.getElementById('pmEmoji').style.display = imgSrc ? 'none' : 'flex';

  // Título, precio, desc
  document.getElementById('pmName').textContent  = p.name;
  document.getElementById('pmPrice').innerHTML   = `S/ ${Number(p.price).toFixed(2)} <span class="pm-price-unit">/ unidad</span>`;
  document.getElementById('pmDesc').textContent  = p.desc;

  // Info cards
  const cfg     = JSON.parse(localStorage.getItem('lahornada_settings') || '{}');
  const phone   = cfg.phone || '975 524 363';
  const hours   = cfg.hours || 'Lun–Dom 8am–8pm';
  const storeName = cfg.name || 'La Hornada';
  const storeUrl  = window.location.href.includes('tienda.html')
    ? window.location.href
    : window.location.origin + window.location.pathname + 'tienda.html';

  document.getElementById('pmInfoRow').innerHTML = `
    <div class="pm-info-card">
      <div class="pm-info-icon">📞</div>
      <div class="pm-info-label">WhatsApp</div>
      <div class="pm-info-value">${phone}</div>
    </div>
    <div class="pm-info-card">
      <div class="pm-info-icon">🕐</div>
      <div class="pm-info-label">Horario</div>
      <div class="pm-info-value">${hours}</div>
    </div>`;

  // Texto para redes
  const frases = [
    `¡El sabor que te hace volver una y otra vez! 🔥`,
    `Hecho con ingredientes frescos y recetas de siempre. 🌾`,
    `¿Se te antojó? ¡Nosotros lo preparamos con todo el amor! 😍`,
    `Porque lo artesanal siempre sabe mejor. ❤️`,
    `¡El favorito de nuestros clientes! No te lo pierdas. ⭐`,
  ];
  const frase = frases[p.id % frases.length];
  const stockTxt = sinStock ? `⚠️ ¡Pide el tuyo para mañana!` : `✅ ¡Disponible ahora!`;

  const socialText =
`${p.emoji}${p.emoji}${p.emoji} ¡${p.name.toUpperCase()}! ${p.emoji}${p.emoji}${p.emoji}

${frase}

📝 ${p.desc}

━━━━━━━━━━━━━━━━━━━━━
💰 Precio: S/ ${Number(p.price).toFixed(2)} por unidad
🚚 Delivery GRATIS a domicilio
${stockTxt}
━━━━━━━━━━━━━━━━━━━━━

🛒 ¡HACÉ TU PEDIDO AHORA!
👇 Ingresa a nuestra tienda online:
🌐 ${storeUrl}

📲 O escríbenos por WhatsApp:
📞 ${phone}
🕐 Atención: ${hours}

━━━━━━━━━━━━━━━━━━━━━
🍞 ${storeName} — Delicias artesanales
✨ Hechas con amor, entregadas con cariño ✨

#${storeName.replace(/\s+/g,'')} #${p.name.replace(/\s+/g,'')} #DeliciasArtesanales #Delivery #PedidosOnline #HechoConAmor #Antojo`;

  document.getElementById('pmSocialText').textContent = socialText;

  // Botón agregar
  const addBtn = document.getElementById('pmAddBtn');
  if (sinStock) {
    addBtn.textContent = '📅 Pedir para mañana';
    addBtn.onclick = () => { addPreorder(id); closeProductModal(); };
    addBtn.style.background = 'linear-gradient(135deg, #C8862A, #E4A84B)';
  } else {
    addBtn.textContent = '🛒 ¡Agregar al carrito!';
    addBtn.onclick = () => { addToCart(id); closeProductModal(); };
    addBtn.style.background = 'linear-gradient(135deg, var(--brown), var(--rust))';
  }

  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Generar flyer
  generateFlyer(p, cfg);
};

window.closeProductModal = function(e) {
  if (e && e.target !== document.getElementById('productModal') && !e.target.classList.contains('product-modal-close')) return;
  document.getElementById('productModal').classList.remove('open');
  document.body.style.overflow = '';
};

/* ── GENERAR FLYER CON CANVAS ── */
function generateFlyer(p, cfg) {
  const canvas = document.getElementById('flyerCanvas');
  const W = 1080, H = 1920;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const storeName = cfg.name  || 'La Hornada';
  const phone     = (cfg.phone || '975 524 363').replace(/\D/g,'').slice(-9);
  const storeUrl  = window.location.href.includes('tienda.html')
    ? window.location.href
    : window.location.origin + window.location.pathname + 'tienda.html';

  const draw = (productImg) => {
    // ── FONDO MARRÓN ──
    ctx.fillStyle = '#3D2314';
    ctx.fillRect(0, 0, W, H);

    // ── FOTO DEL PRODUCTO (zona central) ──
    const imgY = 320, imgH = 900;
    if (productImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, imgY, W, imgH);
      ctx.clip();
      const scale = Math.max(W / productImg.width, imgH / productImg.height);
      const sw = productImg.width * scale;
      const sh = productImg.height * scale;
      ctx.drawImage(productImg, (W - sw) / 2, imgY + (imgH - sh) / 2, sw, sh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#6B3A2A';
      ctx.fillRect(0, imgY, W, imgH);
      ctx.font = '260px serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.emoji, W / 2, imgY + imgH / 2 + 90);
    }

    // Gradiente superior sobre foto
    const gTop = ctx.createLinearGradient(0, imgY, 0, imgY + 260);
    gTop.addColorStop(0, 'rgba(61,35,20,0.92)');
    gTop.addColorStop(1, 'rgba(61,35,20,0)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, imgY, W, 260);

    // Gradiente inferior sobre foto
    const gBot = ctx.createLinearGradient(0, imgY + imgH - 260, 0, imgY + imgH);
    gBot.addColorStop(0, 'rgba(61,35,20,0)');
    gBot.addColorStop(1, 'rgba(61,35,20,0.95)');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, imgY + imgH - 260, W, 260);

    // ── TEXTO SUPERIOR: "DELICIOSAS" ──
    ctx.textAlign = 'center';
    ctx.fillStyle = '#E4A84B';
    ctx.font = 'bold 110px Georgia, serif';
    ctx.fillText('DELICIOSAS', W / 2, 160);

    // ── NOMBRE DEL PRODUCTO (grande, rojo) ──
    ctx.fillStyle = '#C8862A';
    ctx.font = 'bold 148px Georgia, serif';
    const nameUpper = p.name.toUpperCase();
    // Si es muy largo, reducir
    const nameFont = nameUpper.length > 12 ? 'bold 110px Georgia, serif' : 'bold 148px Georgia, serif';
    ctx.font = nameFont;
    ctx.fillText(nameUpper, W / 2, 300);

    // ── BADGE DE PRECIO (sello) ──
    const bx = W - 260, by = imgY + 60, br = 130;
    // Sello dentado
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const r1 = br, r2 = br - 22;
      const x1 = bx + Math.cos(angle) * r1;
      const y1 = by + Math.sin(angle) * r1;
      const x2 = bx + Math.cos(angle + Math.PI / 20) * r2;
      const y2 = by + Math.sin(angle + Math.PI / 20) * r2;
      if (i === 0) ctx.beginPath();
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3D2314';
    ctx.font = 'bold 80px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`S/ ${Number(p.price).toFixed(2)}`, bx, by - 10);
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('POR UNIDAD', bx, by + 40);

    // ── FLECHA HACIA ABAJO ──
    const arrowY = imgY + imgH + 30;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W / 2, arrowY);
    ctx.lineTo(W / 2, arrowY + 80);
    ctx.moveTo(W / 2 - 40, arrowY + 40);
    ctx.lineTo(W / 2, arrowY + 80);
    ctx.lineTo(W / 2 + 40, arrowY + 40);
    ctx.stroke();

    // ── BOTÓN "ORDENAR" ──
    const btnY = arrowY + 110;
    ctx.fillStyle = '#B84C2A';
    roundRect(ctx, 100, btnY, W - 200, 130, 65);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 72px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('ORDENAR AQUÍ', W / 2, btnY + 88);

    // ── DELIVERY GRATIS ──
    ctx.fillStyle = '#E4A84B';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText('🚚  DELIVERY GRATIS', W / 2, btnY + 190);

    // ── DATOS DE CONTACTO ──
    const infoY = btnY + 270;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, 60, infoY, W - 120, 160, 20);
    ctx.fill();

    ctx.fillStyle = '#FAF6EF';
    ctx.font = 'bold 38px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`📞 WhatsApp: ${phone}`, W / 2, infoY + 60);
    ctx.fillStyle = '#E4A84B';
    ctx.font = '34px sans-serif';
    ctx.fillText(`🌐 ${storeUrl.replace('https://','').replace('http://','').split('/tienda')[0]}`, W / 2, infoY + 115);

    // ── MARCA INFERIOR ──
    ctx.fillStyle = '#E4A84B';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🍞 ${storeName} — Delicias Artesanales`, W / 2, H - 50);

    // Mostrar preview
    document.getElementById('flyerPreview').src = canvas.toDataURL('image/png');
  };

  if (p.img && (p.img.startsWith('http') || p.img.startsWith('data:'))) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => draw(img);
    img.onerror = () => draw(null);
    img.src = p.img;
  } else if (p.img) {
    const img = new Image();
    img.onload  = () => draw(img);
    img.onerror = () => draw(null);
    img.src = p.img;
  } else {
    draw(null);
  }
}

// Helpers canvas
function wrapText(ctx, text, maxWidth, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

window.downloadFlyer = function() {
  const canvas = document.getElementById('flyerCanvas');
  const link   = document.createElement('a');
  link.download = `flyer-lahornada.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

window.copySocialText = function() {
  const text = document.getElementById('pmSocialText').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btnCopy');
    btn.textContent = '✅ ¡Copiado!';
    btn.style.background = '#27ae60';
    setTimeout(() => {
      btn.textContent = '📋 Copiar texto';
      btn.style.background = '';
    }, 2000);
  });
};
async function init() {
  applyStoreSettings();

  // Mostrar loading
  document.getElementById('productsGrid').innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
      <div style="font-size:2rem;margin-bottom:12px">⏳</div>
      <p>Cargando productos...</p>
    </div>`;

  // Inicializar Firestore si está vacío
  await fsInitIfEmpty();

  // Escuchar cambios en tiempo real
  fsOnProducts(list => {
    products = list;
    renderProducts();
  });
}

init();
