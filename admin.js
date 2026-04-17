/* =============================================
   LA HORNADA — Admin Panel JS (Firebase)
   ============================================= */
import {
  fsGetProducts, fsSaveProduct, fsSaveAllProducts,
  fsDeleteProduct, fsOnProducts, fsInitIfEmpty,
  fsResetProducts, fsOnOrders, fsOnArchivedOrders,
  fsUpdateOrderStatus, fsGetClientes
} from './firebase.js';

/* ── CREDENCIALES ── */
const ADMIN_USER = 'adminhornada';
const ADMIN_PASS = 'Hor009570';

/* ── BLOQUEO POR INTENTOS FALLIDOS ── */
const MAX_ATTEMPTS  = 3;
const BLOCK_MINUTES = 5;

function getLoginState() {
  const s = localStorage.getItem('lahornada_login_state');
  return s ? JSON.parse(s) : { attempts: 0, blockedUntil: null };
}

function saveLoginState(state) {
  localStorage.setItem('lahornada_login_state', JSON.stringify(state));
}

function isBlocked() {
  const state = getLoginState();
  if (!state.blockedUntil) return false;
  if (Date.now() < state.blockedUntil) return true;
  // Bloqueo expirado — resetear
  saveLoginState({ attempts: 0, blockedUntil: null });
  return false;
}

function getRemainingMinutes() {
  const state = getLoginState();
  if (!state.blockedUntil) return 0;
  return Math.ceil((state.blockedUntil - Date.now()) / 60000);
}

let blockTimer = null;

function startBlockCountdown() {
  const blockedEl = document.getElementById('loginBlocked');
  const loginBtn  = document.querySelector('.login-btn');

  function tick() {
    if (!isBlocked()) {
      blockedEl.style.display = 'none';
      blockedEl.textContent   = '';
      if (loginBtn) loginBtn.disabled = false;
      clearInterval(blockTimer);
      return;
    }
    const state = getLoginState();
    const secsLeft = Math.ceil((state.blockedUntil - Date.now()) / 1000);
    const mins = Math.floor(secsLeft / 60);
    const secs = secsLeft % 60;
    blockedEl.style.display = 'block';
    blockedEl.innerHTML = `🔒 Acceso bloqueado por ${mins}:${String(secs).padStart(2,'0')} min<br>
      <small>Demasiados intentos fallidos</small>`;
    if (loginBtn) loginBtn.disabled = true;
  }

  tick();
  blockTimer = setInterval(tick, 1000);
}

/* ── EMOJIS ── */
const EMOJIS = ['🥟','🍩','🥧','🍮','🌀','🍪','🎂','🥐','🧁','🍞','🥖','🧇','🥞','🍰','🫓','🥨','🍡','🧆'];

/* ── STATE ── */
let products       = [];
let allOrders      = [];
let archivedOrders = [];
let archiveDateFilter = '';
let currentFilter  = 'all';
let currentDate    = '';
let editingId      = null;
let deletingId     = null;
let selectedEmoji  = '🥟';

/* ── SANITIZAR ── */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ── RESOLVER IMAGEN ── */
function resolveImg(img) {
  if (!img) return '';
  if (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://')) return img;
  return img;
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
window.doLogin = function() {
  // Verificar bloqueo activo
  if (isBlocked()) {
    startBlockCountdown();
    return;
  }

  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const errorEl   = document.getElementById('loginError');
  const blockedEl = document.getElementById('loginBlocked');

  if (u === ADMIN_USER && p === ADMIN_PASS) {
    // Login exitoso — resetear intentos
    saveLoginState({ attempts: 0, blockedUntil: null });
    errorEl.style.display   = 'none';
    blockedEl.style.display = 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminUI').style.display     = 'block';
    loadSettings();
    initAdmin();
    initPWA();
  } else {
    // Fallo — incrementar intentos
    const state = getLoginState();
    state.attempts = (state.attempts || 0) + 1;

    if (state.attempts >= MAX_ATTEMPTS) {
      state.blockedUntil = Date.now() + BLOCK_MINUTES * 60 * 1000;
      state.attempts     = 0;
      saveLoginState(state);
      errorEl.style.display = 'none';
      startBlockCountdown();
    } else {
      saveLoginState(state);
      const restantes = MAX_ATTEMPTS - state.attempts;
      errorEl.style.display = 'block';
      errorEl.textContent   = `Usuario o contraseña incorrectos. ${restantes} intento${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''}.`;
    }
  }
};

window.doLogout = function() {
  document.getElementById('adminUI').style.display    = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginPass').value = '';
};

/* ═══════════════════════════════════════
   INIT ADMIN
═══════════════════════════════════════ */
async function initAdmin() {
  await fsInitIfEmpty();
  // Escuchar productos en tiempo real
  fsOnProducts(list => {
    products = list;
    renderAll();
  });
  // Escuchar pedidos activos en tiempo real
  fsOnOrders(orders => {
    allOrders = orders;
    renderOrders();
    updatePendingBadge();
    monitorearPedidosYape(orders);
  });
  // Escuchar pedidos archivados
  fsOnArchivedOrders(orders => {
    archivedOrders = orders;
    renderArchive();
  });
}

/* ═══════════════════════════════════════
   SECTIONS / NAV
═══════════════════════════════════════ */
window.showSection = function(name, el) {
  document.querySelectorAll('[id^="section-"]').forEach(s => s.style.display = 'none');
  document.getElementById('section-' + name).style.display = 'block';
  // Sidebar desktop
  document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  // Nav móvil
  document.querySelectorAll('.mobile-nav-item').forEach(s => s.classList.remove('active'));
  const mobileBtn = document.querySelector(`.mobile-nav-item[data-section="${name}"]`);
  if (mobileBtn) mobileBtn.classList.add('active');
};

/* ═══════════════════════════════════════
   RENDER
═══════════════════════════════════════ */
function renderAll() {
  renderStats();
  renderTable();
}

function renderStats() {
  const available = products.filter(p => p.available !== false).length;
  const total     = products.length;
  const minPrice  = total > 0 ? Math.min(...products.map(p => p.price)) : 0;
  const maxPrice  = total > 0 ? Math.max(...products.map(p => p.price)) : 0;

  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Productos</div>
      <div class="stat-value">${total}</div>
      <div class="stat-desc">en catálogo</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Disponibles</div>
      <div class="stat-value" style="color:var(--green)">${available}</div>
      <div class="stat-desc">visibles en tienda</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">No disponibles</div>
      <div class="stat-value" style="color:var(--red)">${total - available}</div>
      <div class="stat-desc">ocultos</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Rango de precio</div>
      <div class="stat-value" style="font-size:1.2rem">S/ ${minPrice.toFixed(2)}</div>
      <div class="stat-desc">hasta S/ ${maxPrice.toFixed(2)}</div>
    </div>
  `;
}

function renderTable() {
  const tbody = document.getElementById('productsTableBody');
  tbody.innerHTML = products.map(p => {
    const imgSrc = resolveImg(p.img);
    return `
    <tr class="prod-row" draggable="true" data-id="${p.id}">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
          <div class="prod-thumb">
            ${imgSrc
              ? `<img src="${imgSrc}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="">
                 <span style="display:none">${p.emoji}</span>`
              : `<span>${p.emoji}</span>`
            }
          </div>
        </div>
      </td>
      <td>
        <div class="prod-name">${esc(p.name)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${p.emoji}</div>
      </td>
      <td><div class="prod-desc-cell">${esc(p.desc)}</div></td>
      <td><div class="prod-price">S/ ${Number(p.price).toFixed(2)}</div></td>
      <td>
        <div class="stock-cell">
          <input type="number" class="stock-input" value="${p.stock ?? 0}" min="0"
            onchange="updateStock(${p.id}, this.value)" title="Stock disponible">
          <span class="stock-unit">uds</span>
        </div>
      </td>
      <td>
        <div class="toggle-pill ${p.available !== false ? 'on' : 'off'}" onclick="toggleAvailable(${p.id})">
          <span class="on-label">✓ Activo</span>
          <span class="off-label">✗ Oculto</span>
        </div>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="openEditModal(${p.id})">✏️ Editar</button>
          <button class="btn-del"  onclick="openDelModal(${p.id})">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  initDragAndDrop(tbody);
}

/* ═══════════════════════════════════════
   DRAG & DROP
═══════════════════════════════════════ */
function initDragAndDrop(tbody) {
  let dragSrc = null;

  tbody.querySelectorAll('.prod-row').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrc = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', async () => {
      row.classList.remove('dragging');
      tbody.querySelectorAll('.prod-row').forEach(r => r.classList.remove('drag-over'));
      // Guardar nuevo orden en Firestore
      const newOrder = [...tbody.querySelectorAll('.prod-row')].map((r, i) => ({
        id: parseInt(r.dataset.id), order: i
      }));
      const updated = products.map(p => {
        const o = newOrder.find(x => x.id === p.id);
        return o ? { ...p, order: o.order } : p;
      });
      await fsSaveAllProducts(updated);
    });

    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (row === dragSrc) return;
      tbody.querySelectorAll('.prod-row').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));

    row.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === row) return;
      const rect = row.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) tbody.insertBefore(dragSrc, row);
      else tbody.insertBefore(dragSrc, row.nextSibling);
      row.classList.remove('drag-over');
    });
  });
}

/* ═══════════════════════════════════════
   STOCK DIRECTO DESDE TABLA
═══════════════════════════════════════ */
window.updateStock = async function(id, value) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newStock = Math.max(0, parseInt(value) || 0);
  await fsSaveProduct({ ...p, stock: newStock });
  showToast(`📦 Stock de "${esc(p.name)}" → ${newStock} uds`);
};

/* ═══════════════════════════════════════
   TOGGLE DISPONIBILIDAD
═══════════════════════════════════════ */
window.toggleAvailable = async function(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const updated = { ...p, available: p.available === false ? true : false };
  await fsSaveProduct(updated);
  showToast(updated.available
    ? `✅ "${esc(p.name)}" ahora está disponible`
    : `⛔ "${esc(p.name)}" ocultado de la tienda`
  );
};

/* ═══════════════════════════════════════
   EMOJI PICKER
═══════════════════════════════════════ */
function buildEmojiPicker(current) {
  selectedEmoji = current || '🥟';
  document.getElementById('emojiPicker').innerHTML = EMOJIS.map(e =>
    `<div class="emoji-opt ${e === selectedEmoji ? 'selected' : ''}" onclick="selectEmoji('${e}', this)">${e}</div>`
  ).join('');
}

window.selectEmoji = function(e, el) {
  selectedEmoji = e;
  document.querySelectorAll('.emoji-opt').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
};

/* ═══════════════════════════════════════
   MODAL EDITAR / AGREGAR
═══════════════════════════════════════ */
window.openAddModal = function() {
  editingId = null;
  document.getElementById('modalTitle').textContent  = '➕ Nuevo Producto';
  document.getElementById('f-name').value  = '';
  document.getElementById('f-price').value = '';
  document.getElementById('f-stock').value = '0';
  document.getElementById('f-desc').value  = '';
  document.getElementById('f-img').value   = '';
  document.getElementById('f-avail-yes').checked = true;
  buildEmojiPicker('🥟');
  updatePreview();
  document.getElementById('editModal').classList.add('open');
};

window.openEditModal = function(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById('modalTitle').textContent  = '✏️ Editar Producto';
  document.getElementById('f-name').value  = p.name;
  document.getElementById('f-price').value = p.price;
  document.getElementById('f-stock').value = p.stock ?? 0;
  document.getElementById('f-desc').value  = p.desc;
  document.getElementById('f-img').value   = p.img || '';
  document.getElementById(p.available !== false ? 'f-avail-yes' : 'f-avail-no').checked = true;
  buildEmojiPicker(p.emoji);
  updatePreview();
  document.getElementById('editModal').classList.add('open');
};

window.closeModal = function() {
  document.getElementById('editModal').classList.remove('open');
};

/* ── IMAGE PREVIEW ── */
window.updatePreview = function() {
  const url = document.getElementById('f-img').value.trim();
  const img = document.getElementById('imgPreview');
  const msg = document.getElementById('noImgMsg');
  if (url) {
    img.src = resolveImg(url);
    img.style.display = 'block';
    msg.style.display = 'none';
    img.onerror = () => { img.style.display = 'none'; msg.style.display = 'block'; msg.textContent = '⚠️ No se pudo cargar'; };
  } else {
    img.style.display = 'none';
    msg.style.display = 'block';
    msg.textContent = 'Vista previa de la imagen';
  }
};

/* ── FILE UPLOAD ── */
window.handleFileUpload = function(event) {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith('image/')) { showToast('⚠️ Solo imágenes (JPG, PNG, WEBP)'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('f-img').value = e.target.result;
    window.updatePreview();
    showToast('📷 Imagen cargada');
  };
  reader.readAsDataURL(file);
};

/* ── GUARDAR PRODUCTO ── */
window.saveProduct = async function() {
  const name      = document.getElementById('f-name').value.trim();
  const price     = parseFloat(document.getElementById('f-price').value);
  const stock     = Math.max(0, parseInt(document.getElementById('f-stock').value) || 0);
  const desc      = document.getElementById('f-desc').value.trim();
  const img       = document.getElementById('f-img').value.trim();
  const available = document.getElementById('f-avail-yes').checked;

  if (!name) { alert('Por favor ingresa el nombre del producto'); return; }
  if (isNaN(price) || price < 0) { alert('Por favor ingresa un precio válido'); return; }

  const btn = document.querySelector('.modal-footer .btn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    if (editingId !== null) {
      const existing = products.find(x => x.id === editingId);
      await fsSaveProduct({ ...existing, name, price, stock, desc, img, emoji: selectedEmoji, available });
    } else {
      const maxId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
      await fsSaveProduct({ id: maxId, name, price, stock, desc, img, emoji: selectedEmoji, available, order: products.length });
    }
    window.closeModal();
    showToast(`💾 "${esc(name)}" guardado`);
  } catch (e) {
    showToast('❌ Error al guardar. Intenta de nuevo.');
    console.error(e);
  }

  if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar cambios'; }
};

/* ═══════════════════════════════════════
   ELIMINAR
═══════════════════════════════════════ */
window.openDelModal = function(id) {
  deletingId = id;
  const p = products.find(x => x.id === id);
  document.getElementById('delProductName').textContent = `"${p?.name}"`;
  document.getElementById('delModal').classList.add('open');
};

window.closeDelModal = function() {
  document.getElementById('delModal').classList.remove('open');
  deletingId = null;
};

window.confirmDelete = async function() {
  if (deletingId === null) return;
  await fsDeleteProduct(deletingId);
  window.closeDelModal();
  showToast('🗑️ Producto eliminado');
};

/* ═══════════════════════════════════════
   RESTAURAR
═══════════════════════════════════════ */
window.confirmReset = async function() {
  if (confirm('¿Restaurar todos los productos a los valores predeterminados? Se perderán los cambios actuales.')) {
    const btn = document.querySelector('.btn-reset');
    if (btn) { btn.disabled = true; btn.textContent = 'Restaurando...'; }
    await fsResetProducts();
    showToast('↺ Productos restaurados con imágenes y stock correctos');
    if (btn) { btn.disabled = false; btn.textContent = '↺ Restaurar predeterminados'; }
  }
};

/* ═══════════════════════════════════════
   CONFIGURACIÓN
═══════════════════════════════════════ */
window.saveSettings = function() {
  const cfg = {
    name:  document.getElementById('cfg-name').value.trim(),
    phone: document.getElementById('cfg-phone').value.trim(),
    addr:  document.getElementById('cfg-addr').value.trim(),
    hours: document.getElementById('cfg-hours').value.trim(),
  };
  localStorage.setItem('lahornada_settings', JSON.stringify(cfg));
  showToast('⚙️ Configuración guardada');
};

function loadSettings() {
  const s = localStorage.getItem('lahornada_settings');
  if (!s) return;
  const cfg = JSON.parse(s);
  document.getElementById('cfg-name').value  = cfg.name  || '';
  document.getElementById('cfg-phone').value = cfg.phone || '';
  document.getElementById('cfg-addr').value  = cfg.addr  || '';
  document.getElementById('cfg-hours').value = cfg.hours || '';
}

/* ═══════════════════════════════════════
   PEDIDOS
═══════════════════════════════════════ */
function updatePendingBadge() {
  const pending = allOrders.filter(o =>
    o.estado === 'pendiente_confirmacion' || o.estado === 'pendiente_envio'
  ).length;
  // Badge sidebar desktop
  const badge = document.getElementById('pendingBadge');
  if (badge) {
    badge.textContent = pending > 0 ? pending : '';
    badge.style.display = pending > 0 ? 'inline-flex' : 'none';
  }
  // Badge nav móvil
  const mobileBadge = document.getElementById('mobilePendingBadge');
  if (mobileBadge) {
    mobileBadge.textContent = pending > 0 ? pending : '';
    mobileBadge.style.display = pending > 0 ? 'flex' : 'none';
  }
}

function getFilteredOrders() {
  let list = [...allOrders];
  if (currentFilter !== 'all') list = list.filter(o => o.estado === currentFilter);
  if (currentDate) {
    list = list.filter(o => {
      // fecha guardada como string "DD/MM/YYYY, HH:MM:SS"
      const d = new Date(o.createdAt);
      const iso = d.toISOString().split('T')[0]; // YYYY-MM-DD
      return iso === currentDate;
    });
  }
  return list;
}

function renderOrders() {
  const filtered = getFilteredOrders();

  // Stats
  const totalGeneral = allOrders.reduce((s, o) => s + (o.total || 0), 0);
  const hoy = new Date().toISOString().split('T')[0];
  const totalHoy = allOrders.filter(o => {
    const d = new Date(o.createdAt);
    return d.toISOString().split('T')[0] === hoy;
  }).reduce((s, o) => s + (o.total || 0), 0);
  const pedidosHoy = allOrders.filter(o => {
    const d = new Date(o.createdAt);
    return d.toISOString().split('T')[0] === hoy;
  }).length;

  document.getElementById('ordersStatsRow').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total pedidos</div>
      <div class="stat-value">${allOrders.length}</div>
      <div class="stat-desc">histórico</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pedidos hoy</div>
      <div class="stat-value" style="color:var(--accent)">${pedidosHoy}</div>
      <div class="stat-desc">${new Date().toLocaleDateString('es-PE')}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Ventas hoy</div>
      <div class="stat-value" style="color:var(--green);font-size:1.4rem">S/ ${totalHoy.toFixed(2)}</div>
      <div class="stat-desc">del día</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Ventas totales</div>
      <div class="stat-value" style="color:var(--gold);font-size:1.4rem">S/ ${totalGeneral.toFixed(2)}</div>
      <div class="stat-desc">histórico</div>
    </div>
  `;

  const container = document.getElementById('ordersList');
  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
        <div style="font-size:3rem;margin-bottom:12px">📭</div>
        <p>No hay pedidos${currentFilter !== 'all' ? ' con este filtro' : ''} aún.</p>
      </div>`;
    return;
  }

  // Agrupar por día
  const byDay = {};
  filtered.forEach(o => {
    const d = new Date(o.createdAt);
    const key = d.toLocaleDateString('es-PE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(o);
  });

  container.innerHTML = Object.entries(byDay).map(([day, orders]) => {
    const dayTotal = orders.reduce((s, o) => s + (o.total || 0), 0);
    return `
      <div class="orders-day-group">
        <div class="orders-day-header">
          <span class="orders-day-label">📅 ${day}</span>
          <span class="orders-day-total">S/ ${dayTotal.toFixed(2)}</span>
        </div>
        ${orders.map(o => orderCard(o)).join('')}
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════
   ARCHIVO
═══════════════════════════════════════ */
function renderArchive() {
  let list = [...archivedOrders];

  // Filtro por fecha
  if (archiveDateFilter) {
    list = list.filter(o => {
      const iso = new Date(o.createdAt).toISOString().split('T')[0];
      return iso === archiveDateFilter;
    });
  }

  // Stats archivo
  const totalArchive = archivedOrders.reduce((s, o) => s + (o.total || 0), 0);
  const statsEl = document.getElementById('archiveStatsRow');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total archivados</div>
        <div class="stat-value">${archivedOrders.length}</div>
        <div class="stat-desc">pedidos entregados</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ingresos totales</div>
        <div class="stat-value" style="color:var(--green);font-size:1.4rem">S/ ${totalArchive.toFixed(2)}</div>
        <div class="stat-desc">histórico</div>
      </div>`;
  }

  const container = document.getElementById('archiveList');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
        <div style="font-size:3rem;margin-bottom:12px">📭</div>
        <p>No hay pedidos archivados${archiveDateFilter ? ' en esta fecha' : ''}.</p>
      </div>`;
    return;
  }

  // Agrupar por día
  const byDay = {};
  list.forEach(o => {
    const d = new Date(o.createdAt);
    const key = d.toLocaleDateString('es-PE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(o);
  });

  container.innerHTML = Object.entries(byDay).map(([day, orders]) => {
    const dayTotal = orders.reduce((s, o) => s + (o.total || 0), 0);
    return `
      <div class="orders-day-group">
        <div class="orders-day-header">
          <span class="orders-day-label">📅 ${day}</span>
          <span class="orders-day-total">S/ ${dayTotal.toFixed(2)}</span>
        </div>
        ${orders.map(o => orderCard(o, true)).join('')}
      </div>`;
  }).join('');
}

window.filterArchiveByDate = function(val) {
  archiveDateFilter = val;
  renderArchive();
};

window.clearArchiveFilter = function() {
  archiveDateFilter = '';
  const input = document.getElementById('filterArchiveDate');
  if (input) input.value = '';
  renderArchive();
};

function orderCard(o, isArchived = false) {
  const estadoMap = {
    pendiente_confirmacion: { label: '⏳ Pendiente Yape',   cls: 'status-pending' },
    pagado:                 { label: '✅ Pago confirmado',   cls: 'status-paid' },
    pendiente_envio:        { label: '📦 Por enviar',        cls: 'status-shipping' },
    en_camino:              { label: '🛵 En camino',         cls: 'status-shipping' },
    entregado:              { label: '✅ Entregado',          cls: 'status-done' },
  };
  const est  = estadoMap[o.estado] || { label: o.estado, cls: '' };
  const hora = new Date(o.createdAt).toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });

  return `
    <div class="order-card ${isArchived ? 'order-archived' : ''}">
      <div class="order-card-header">
        <div class="order-client">
          <div class="order-codes">
            <span class="order-code-pedido">#${o.codigoPedido || '????'}</span>
            <span class="order-code-cliente">${o.codigoCliente || ''}</span>
          </div>
          <span class="order-name">👤 ${esc(o.nombre)}</span>
          <span class="order-phone">📞 ${esc(o.telefono)}</span>
          ${o.direccion && o.direccion !== '—' ? `<span class="order-addr">📍 ${esc(o.direccion)}</span>` : ''}
        </div>
        <div class="order-meta">
          <span class="order-time">🕐 ${hora}</span>
          <span class="order-pay ${o.metodoPago === 'yape' ? 'pay-yape' : 'pay-contra'}">
            ${o.metodoPago === 'yape' ? '📱 Yape' : '💵 Efectivo'}
          </span>
          ${o.yapeDe && o.yapeDe !== '—' ? `<span class="order-yape-from">desde ${esc(o.yapeDe)}</span>` : ''}
        </div>
      </div>
      <div class="order-items">${esc(o.items || '').replace(/\n/g, '<br>')}</div>
      <div class="order-card-footer">
        <span class="order-total">S/ ${Number(o.total || 0).toFixed(2)}</span>
        ${isArchived
          ? `<span class="order-status status-done">📁 Archivado</span>`
          : `<div class="order-status-group">
              <span class="order-status ${est.cls}">${est.label}</span>
              <div class="status-btns">
                <button class="status-btn ${o.estado==='pendiente_confirmacion'?'active-pending':''}"
                  onclick="changeOrderStatus('${o.id}','pendiente_confirmacion')">⏳ Pendiente Yape</button>
                <button class="status-btn ${o.estado==='pagado'?'active-paid':''}"
                  onclick="changeOrderStatus('${o.id}','pagado')">✅ Pago confirmado</button>
                <button class="status-btn ${o.estado==='pendiente_envio'||o.estado==='en_camino'?'active-shipping':''}"
                  onclick="changeOrderStatus('${o.id}','pendiente_envio')">🚚 Por enviar</button>
                <button class="status-btn ${o.estado==='entregado'?'active-done':''}"
                  onclick="changeOrderStatus('${o.id}','entregado')">📦 Entregado</button>
              </div>
            </div>`
        }
      </div>
    </div>`;
}

window.filterOrders = function(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderOrders();
};

window.filterByDate = function(val) {
  currentDate = val;
  renderOrders();
};

window.changeOrderStatus = async function(id, newStatus) {
  await fsUpdateOrderStatus(id, newStatus);
  showToast(`✅ Estado actualizado`);
};

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ═══════════════════════════════════════
   CERRAR MODALES AL CLICK AFUERA
═══════════════════════════════════════ */
document.getElementById('editModal').addEventListener('click', e => {
  if (e.target === document.getElementById('editModal')) window.closeModal();
});
document.getElementById('delModal').addEventListener('click', e => {
  if (e.target === document.getElementById('delModal')) window.closeDelModal();
});

/* ── Verificar bloqueo al cargar ── */
if (isBlocked()) startBlockCountdown();


/* ═══════════════════════════════════════
   CAMPAÑAS WHATSAPP
═══════════════════════════════════════ */

let campanaProducto      = null;
let campanaClientes      = [];
let campanaFiltrados     = [];
let campanaNumerosManual = [];
let campanaQueue         = [];
let campanaIndex         = 0;
let campanaEnviadosLog   = [];
let campanaMsgPersonalizado = ''; // mensaje personalizado por el admin
let campanaFotoCustom    = null;  // imagen personalizada (data URL)

async function initCampanas() {
  campanaProducto      = null;
  campanaNumerosManual = [];
  campanaQueue         = [];
  campanaIndex         = 0;
  campanaEnviadosLog   = [];

  const layout = document.getElementById('campana-layout');
  const step3  = document.getElementById('campana-step3');
  if (layout) layout.style.display = '';
  if (step3)  step3.style.display  = 'none';

  renderCampanaProductos();
  renderNumerosAgregados();
  actualizarFooterCampana();

  try { campanaClientes = await fsGetClientes(); } catch { campanaClientes = []; }
  campanaFiltrados = [...campanaClientes];
  renderClientesCampana();
  actualizarCountClientes();
}

function renderCampanaProductos() {
  const grid = document.getElementById('campanaProductosGrid');
  if (!grid) return;
  if (products.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted);padding:20px">Cargando productos...</p>`;
    return;
  }
  grid.innerHTML = products.map(p => {
    const imgSrc = resolveImg(p.img);
    const activo = campanaProducto && campanaProducto.id === p.id;
    return `
    <div class="campana-prod-card ${activo ? 'activo' : ''}" onclick="seleccionarProductoCampana(${p.id})">
      <div class="campana-prod-img">
        ${imgSrc ? `<img src="${imgSrc}" alt="${esc(p.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
        <span class="campana-prod-emoji" ${imgSrc ? 'style="display:none"' : ''}>${p.emoji}</span>
      </div>
      <div class="campana-prod-info">
        <div class="campana-prod-name">${esc(p.name)}</div>
        <div class="campana-prod-price">S/ ${Number(p.price).toFixed(2)}</div>
      </div>
      ${activo ? '<span class="campana-prod-check">✓</span>' : '<span class="campana-prod-arrow">→</span>'}
    </div>`;
  }).join('');
}

window.seleccionarProductoCampana = function(id) {
  campanaProducto = products.find(p => p.id === id);
  renderCampanaProductos();
  actualizarFooterCampana();
  showToast(`✅ ${campanaProducto.name} seleccionado`);

  // Generar mensaje template con el producto seleccionado
  const msgTemplate = buildWAMessageTemplate(campanaProducto);
  const textarea = document.getElementById('campanaMsgTemplate');
  if (textarea) {
    textarea.value = msgTemplate;
    campanaMsgPersonalizado = msgTemplate;
  }

  // Resetear foto personalizada
  resetFotoCampana();
};

window.agregarNumeroCampana = function() {
  const telInput    = document.getElementById('campanaInputTel');
  const nombreInput = document.getElementById('campanaInputNombre');
  const tel    = telInput.value.trim().replace(/\D/g, '');
  const nombre = nombreInput.value.trim() || 'Cliente';
  if (!tel || tel.length < 7) { showToast('⚠️ Ingresa un número válido'); return; }
  if (campanaNumerosManual.find(x => x.telefono === tel)) { showToast('⚠️ Ese número ya está en la lista'); return; }
  campanaNumerosManual.push({ nombre, telefono: tel, fuente: 'manual' });
  telInput.value    = '';
  nombreInput.value = '';
  telInput.focus();
  renderNumerosAgregados();
  actualizarFooterCampana();
  showToast(`✅ ${nombre} (${tel}) agregado`);
};

window.agregarClienteFirestore = function(tel, nombre) {
  if (campanaNumerosManual.find(x => x.telefono === tel)) { showToast('⚠️ Ese número ya está en la lista'); return; }
  campanaNumerosManual.push({ nombre, telefono: tel, fuente: 'firestore' });
  renderNumerosAgregados();
  renderClientesCampana();
  actualizarFooterCampana();
  showToast(`✅ ${nombre} agregado`);
};

window.quitarNumeroCampana = function(tel) {
  campanaNumerosManual = campanaNumerosManual.filter(x => x.telefono !== tel);
  renderNumerosAgregados();
  renderClientesCampana();
  actualizarFooterCampana();
};

function renderNumerosAgregados() {
  const lista = document.getElementById('campanaNumerosLista');
  const count = document.getElementById('campanaNumerosCount');
  if (!lista) return;
  if (count) count.textContent = campanaNumerosManual.length;
  if (campanaNumerosManual.length === 0) {
    lista.innerHTML = `<div class="campana-numeros-empty">Agrega números a la izquierda 👈</div>`;
    return;
  }
  lista.innerHTML = campanaNumerosManual.map((c, i) => `
    <div class="campana-numero-tag">
      <span class="campana-numero-idx">${i + 1}</span>
      <div class="campana-numero-data">
        <span class="campana-numero-nombre">${esc(c.nombre)}</span>
        <span class="campana-numero-tel">📞 ${esc(c.telefono)}</span>
      </div>
      <span class="campana-numero-src">${c.fuente === 'firestore' ? '👥' : '✍️'}</span>
      <button class="campana-numero-del" onclick="quitarNumeroCampana('${c.telefono}')" title="Quitar">✕</button>
    </div>`).join('');
}

function renderClientesCampana() {
  const list = document.getElementById('campanaClientesList');
  if (!list) return;
  if (campanaFiltrados.length === 0) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:10px 0">
      ${campanaClientes.length === 0 ? '👥 Sin clientes aún — usa el formulario de arriba.' : '🔍 Sin resultados.'}</div>`;
    return;
  }
  list.innerHTML = campanaFiltrados.map(c => {
    const yaAgregado = !!campanaNumerosManual.find(x => x.telefono === c.telefono);
    return `
    <div class="campana-cliente-row ${yaAgregado ? 'ya-agregado' : ''}">
      <div class="campana-cliente-info">
        <div class="campana-cliente-nombre">${esc(c.nombre || '—')}</div>
        <div class="campana-cliente-tel">📞 ${esc(c.telefono)}</div>
      </div>
      <span class="campana-cliente-pedidos">${c.totalPedidos || 0} pedidos</span>
      ${yaAgregado
        ? `<button class="campana-btn-ya" disabled>✓</button>`
        : `<button class="campana-btn-agregar-fs" onclick="agregarClienteFirestore('${c.telefono}','${esc(c.nombre||'Cliente')}')">＋</button>`}
    </div>`;
  }).join('');
}

window.seleccionarTodosClientes = function(agregar) {
  if (agregar) {
    campanaFiltrados.forEach(c => {
      if (!campanaNumerosManual.find(x => x.telefono === c.telefono))
        campanaNumerosManual.push({ nombre: c.nombre || 'Cliente', telefono: c.telefono, fuente: 'firestore' });
    });
  } else {
    const tels = new Set(campanaFiltrados.map(c => c.telefono));
    campanaNumerosManual = campanaNumerosManual.filter(x => !tels.has(x.telefono));
  }
  renderNumerosAgregados();
  renderClientesCampana();
  actualizarFooterCampana();
};

window.filtrarClientesCampana = function(q) {
  const t = q.toLowerCase().trim();
  campanaFiltrados = t
    ? campanaClientes.filter(c => (c.nombre||'').toLowerCase().includes(t) || (c.telefono||'').includes(t))
    : [...campanaClientes];
  renderClientesCampana();
};

function actualizarCountClientes() {
  const el = document.getElementById('campanaClientesCount');
  if (el) el.textContent = `(${campanaClientes.length})`;
}

function actualizarFooterCampana() {
  const count = document.getElementById('campanaSelCount');
  const btn   = document.getElementById('campanaBtnStart');
  const n = campanaNumerosManual.length;
  if (count) count.textContent = n;
  if (btn) btn.disabled = n === 0 || !campanaProducto;
}

window.iniciarCampana = function() {
  if (!campanaProducto) { showToast('⚠️ Primero selecciona un producto'); return; }
  if (campanaNumerosManual.length === 0) { showToast('⚠️ Agrega al menos un número'); return; }
  campanaQueue = [...campanaNumerosManual];
  campanaIndex = 0;
  campanaEnviadosLog = [];
  const layout = document.getElementById('campana-layout');
  const step3  = document.getElementById('campana-step3');
  if (layout) layout.style.display = 'none';
  if (step3)  step3.style.display  = 'block';
  renderCampanaEnvio();
};

function renderCampanaEnvio() {
  const total = campanaQueue.length;
  const pct   = total > 0 ? Math.round((campanaIndex / total) * 100) : 0;
  document.getElementById('campanaProgresoFill').style.width = pct + '%';
  document.getElementById('campanaProgresoTxt').textContent =
    campanaIndex < total
      ? `${campanaIndex} de ${total} enviados — quedan ${total - campanaIndex}`
      : `✅ ¡Campaña completada! ${total} mensajes enviados`;

  const actualEl   = document.getElementById('campanaActual');
  const btnsEl     = document.getElementById('campanaEnvioBtns');
  const enviadosEl = document.getElementById('campanaEnviados');

  if (campanaIndex >= total) {
    actualEl.innerHTML = `
      <div class="campana-done">
        <div class="campana-done-icon">🎉</div>
        <div class="campana-done-txt">¡Campaña completada!</div>
        <div class="campana-done-sub">Enviaste el flyer a ${total} contacto${total !== 1 ? 's' : ''}.</div>
      </div>`;
    btnsEl.innerHTML = `<button class="campana-btn-start" onclick="campanaVolver()">← Nueva campaña</button>`;
  } else {
    const c   = campanaQueue[campanaIndex];
    const tel = c.telefono.replace(/\D/g, '');
    const waMsg = buildWAMessage(campanaProducto, c.nombre);
    const waUrl = `https://wa.me/51${tel}?text=${encodeURIComponent(waMsg)}`;

    actualEl.innerHTML = `
      <div class="campana-envio-layout">
        <div class="campana-flyer-wrap">
          <canvas id="campanaFlyerCanvas" style="display:none"></canvas>
          <img id="campanaFlyerImg" class="campana-flyer-img" alt="Flyer">
          <div class="campana-flyer-loading">⏳ Generando flyer...</div>
        </div>
        <div class="campana-cliente-actual">
          <div class="campana-actual-num">Contacto ${campanaIndex + 1} de ${total}</div>
          <div class="campana-actual-nombre">👤 ${esc(c.nombre)}</div>
          <div class="campana-actual-tel">📞 ${esc(c.telefono)}</div>
          <div class="campana-msg-label">✏️ Edita el mensaje antes de enviar:</div>
          <textarea id="campanaMsgEdit" class="campana-msg-edit">${waMsg}</textarea>
        </div>
      </div>`;

    btnsEl.innerHTML = `
      <a class="campana-btn-wa" id="campanaBtnWA" href="${`https://wa.me/51${tel}?text=${encodeURIComponent(waMsg)}`}" target="_blank"
        onclick="enviarConMsgEditado(event, '${c.telefono}','${esc(c.nombre)}')">
        💬 Abrir WhatsApp y enviar
      </a>
      <button class="campana-btn-skip" onclick="saltarCliente()">⏭ Saltar</button>`;

    // Generar flyer
    generarFlyerCampana(campanaProducto, null, c);
  }

  if (campanaEnviadosLog.length > 0) {
    enviadosEl.innerHTML = `
      <div class="campana-enviados-title">✅ Enviados (${campanaEnviadosLog.length})</div>
      ${campanaEnviadosLog.map(e => `
        <div class="campana-enviado-row">
          <span>👤 ${esc(e.nombre)}</span>
          <span style="color:var(--text-muted)">📞 ${esc(e.tel)}</span>
          <span class="campana-enviado-badge">Enviado</span>
        </div>`).join('')}`;
  } else {
    enviadosEl.innerHTML = '';
  }
}

/* ── Generar flyer en canvas para la campaña ── */
function generarFlyerCampana(p, waUrl, contacto) {
  const canvas = document.getElementById('campanaFlyerCanvas');
  if (!canvas) return;
  const cfg = (() => { try { return JSON.parse(localStorage.getItem('lahornada_settings')||'{}'); } catch { return {}; } })();
  const W = 720, H = 1280;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const phone    = (cfg.phone || '975 524 363').replace(/\s/g,'');
  const storeUrl = 'https://lahornada.aplicatodos.com/tienda.html';

  const draw = (productImg) => {
    // ── FONDO BLANCO ──
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // ── FOTO PRODUCTO (mitad superior) ──
    const imgH = 560;
    if (productImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, imgH);
      ctx.clip();
      const scale = Math.max(W / productImg.width, imgH / productImg.height);
      const sw = productImg.width * scale, sh = productImg.height * scale;
      ctx.drawImage(productImg, (W-sw)/2, (imgH-sh)/2, sw, sh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#F5ECD7';
      ctx.fillRect(0, 0, W, imgH);
      ctx.font = '200px serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.emoji, W/2, imgH/2 + 70);
    }

    // ── ONDA AMARILLA (separador) ──
    const waveY = imgH - 60;
    ctx.fillStyle = '#E4A84B';
    ctx.beginPath();
    ctx.moveTo(0, waveY + 60);
    ctx.bezierCurveTo(W*0.25, waveY - 40, W*0.75, waveY + 100, W, waveY + 20);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // ── FONDO AMARILLO INFERIOR ──
    ctx.fillStyle = '#E4A84B';
    ctx.fillRect(0, waveY + 60, W, H - waveY - 60);

    // ── PATRÓN TEXTURA (puntos) ──
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let x = 20; x < W; x += 40) {
      for (let y = waveY + 80; y < H - 60; y += 40) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── NOMBRE PRODUCTO (grande, blanco) ──
    const nameY = waveY + 120;
    const words = p.name.toUpperCase().split(' ');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 8;

    // Línea 1
    let fontSize1 = 130;
    ctx.font = `900 ${fontSize1}px Impact, Arial Black, sans-serif`;
    const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    while (ctx.measureText(line1).width > W - 40 && fontSize1 > 60) {
      fontSize1 -= 4;
      ctx.font = `900 ${fontSize1}px Impact, Arial Black, sans-serif`;
    }
    ctx.strokeText(line1, W/2, nameY);
    ctx.fillText(line1, W/2, nameY);

    // Línea 2
    if (words.length > 1) {
      const line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
      let fontSize2 = 110;
      ctx.font = `900 ${fontSize2}px Impact, Arial Black, sans-serif`;
      ctx.fillStyle = '#2A1810';
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      while (ctx.measureText(line2).width > W - 40 && fontSize2 > 50) {
        fontSize2 -= 4;
        ctx.font = `900 ${fontSize2}px Impact, Arial Black, sans-serif`;
      }
      ctx.strokeText(line2, W/2, nameY + fontSize1 + 10);
      ctx.fillText(line2, W/2, nameY + fontSize1 + 10);
    }

    // ── "DELICIOSAS" ──
    const subY = nameY + fontSize1 + 130;
    ctx.fillStyle = '#2A1810';
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DELICIOSAS', W/2, subY);

    // ── SELLO PRECIO (círculo blanco) ──
    const cx = W/2, cy = subY + 100, cr = 90;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2A1810';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#2A1810';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`S/${Number(p.price).toFixed(2)}`, cx, cy + 10);

    // ── "UND" ──
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - 60, cy + cr - 10, 120, 36);
    ctx.fillStyle = '#2A1810';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillText('UND', cx, cy + cr + 18);

    // ── "¡LLEVAMOS A DOMICILIO!" ──
    const domY = cy + cr + 80;
    ctx.fillStyle = '#2A1810';
    ctx.font = 'bold 54px Impact, Arial Black, sans-serif';
    ctx.fillText('¡LLEVAMOS A DOM!', W/2, domY);

    // ── TELÉFONO ──
    ctx.fillStyle = '#2A1810';
    ctx.font = '36px Arial, sans-serif';
    ctx.fillText(`pedidos a ${phone}`, W/2, domY + 56);

    // ── URL ──
    ctx.fillStyle = '#2A1810';
    ctx.font = 'bold 28px Arial, sans-serif';
    // Subrayado
    const urlText = storeUrl;
    const urlW = ctx.measureText(urlText).width;
    ctx.fillText(urlText, W/2, H - 30);
    ctx.fillRect(W/2 - urlW/2, H - 18, urlW, 3);

    // Mostrar flyer
    const imgEl = document.getElementById('campanaFlyerImg');
    const loadEl = document.querySelector('.campana-flyer-loading');
    if (imgEl) { imgEl.src = canvas.toDataURL('image/png'); imgEl.style.display = 'block'; }
    if (loadEl) loadEl.style.display = 'none';

    actualizarBtnWAConFlyer(canvas, waUrl, contacto);
  };

  if (campanaFotoCustom) {
    const img = new Image();
    img.onload = () => draw(img);
    img.src = campanaFotoCustom;
  } else if (p.img) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => draw(img);
    img.onerror = () => draw(null);
    img.src = p.img;
  } else {
    draw(null);
  }
}

  const draw = (productImg) => {
    // Fondo
    ctx.fillStyle = '#3D2314';
    ctx.fillRect(0, 0, W, H);

    // Foto producto
    const imgY = 220, imgH = 680;
    if (productImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, imgY, W, imgH);
      ctx.clip();
      const scale = Math.max(W / productImg.width, imgH / productImg.height);
      const sw = productImg.width * scale, sh = productImg.height * scale;
      ctx.drawImage(productImg, (W-sw)/2, imgY+(imgH-sh)/2, sw, sh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#6B3A2A';
      ctx.fillRect(0, imgY, W, imgH);
      ctx.font = '180px serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.emoji, W/2, imgY+imgH/2+60);
    }

    // Gradientes
    const gTop = ctx.createLinearGradient(0, imgY, 0, imgY+200);
    gTop.addColorStop(0,'rgba(61,35,20,0.9)'); gTop.addColorStop(1,'rgba(61,35,20,0)');
    ctx.fillStyle = gTop; ctx.fillRect(0, imgY, W, 200);
    const gBot = ctx.createLinearGradient(0, imgY+imgH-200, 0, imgY+imgH);
    gBot.addColorStop(0,'rgba(61,35,20,0)'); gBot.addColorStop(1,'rgba(61,35,20,0.95)');
    ctx.fillStyle = gBot; ctx.fillRect(0, imgY+imgH-200, W, 200);

    // "DELICIOSAS"
    ctx.textAlign = 'center';
    ctx.fillStyle = '#E4A84B';
    ctx.font = 'bold 72px Georgia, serif';
    ctx.fillText('DELICIOSAS', W/2, 100);

    // Nombre producto
    ctx.fillStyle = '#FAF6EF';
    const name = p.name.toUpperCase();
    let fontSize = 80;
    ctx.font = `bold ${fontSize}px Georgia, serif`;
    while (ctx.measureText(name).width > W-40 && fontSize > 36) { fontSize -= 4; ctx.font = `bold ${fontSize}px Georgia, serif`; }
    ctx.fillText(name, W/2, 190);

    // Sello precio
    const bx = W-150, by = imgY+90, br = 85;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    for (let i=0;i<20;i++){
      const a1=(i/20)*Math.PI*2, a2=((i+0.5)/20)*Math.PI*2;
      ctx.lineTo(bx+Math.cos(a1)*br, by+Math.sin(a1)*br);
      ctx.lineTo(bx+Math.cos(a2)*(br-14), by+Math.sin(a2)*(br-14));
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3D2314';
    ctx.font = 'bold 46px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText(`S/ ${Number(p.price).toFixed(2)}`, bx, by-6);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('POR UNIDAD', bx, by+24);

    // Flecha
    const arrowY = imgY+imgH+24;
    ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(W/2,arrowY); ctx.lineTo(W/2,arrowY+52);
    ctx.moveTo(W/2-24,arrowY+28); ctx.lineTo(W/2,arrowY+52); ctx.lineTo(W/2+24,arrowY+28);
    ctx.stroke();

    // Botón ordenar
    const btnY = arrowY+68;
    ctx.fillStyle = '#B84C2A';
    campanaRoundRect(ctx, 50, btnY, W-100, 90, 45); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('ORDENAR AQUÍ', W/2, btnY+60);

    // Delivery gratis
    ctx.fillStyle = '#E4A84B';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText('🚚  DELIVERY GRATIS', W/2, btnY+130);

    // Info contacto
    const infoY = btnY+170;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    campanaRoundRect(ctx, 30, infoY, W-60, 110, 14); ctx.fill();
    ctx.fillStyle = '#FAF6EF';
    ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`📞 WhatsApp: ${phone}`, W/2, infoY+42);
    ctx.fillStyle = '#E4A84B';
    ctx.font = '22px sans-serif';
    ctx.fillText(`🌐 ${storeUrl}`, W/2, infoY+80);

    // Marca
    ctx.fillStyle = '#E4A84B';
    ctx.font = 'bold 26px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText(`🍞 ${storeName} — Delicias Artesanales`, W/2, H-20);

    // Mostrar flyer
    const imgEl = document.getElementById('campanaFlyerImg');
    const loadEl = document.querySelector('.campana-flyer-loading');
    if (imgEl) { imgEl.src = canvas.toDataURL('image/png'); imgEl.style.display = 'block'; }
    if (loadEl) loadEl.style.display = 'none';

    // Actualizar botón WA para compartir imagen si es móvil
    actualizarBtnWAConFlyer(canvas, waUrl, contacto);
  };

  if (campanaFotoCustom) {
    // Usar foto personalizada
    const img = new Image();
    img.onload = () => draw(img);
    img.src = campanaFotoCustom;
  } else if (p.img) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => draw(img);
    img.onerror = () => draw(null);
    img.src = p.img;
  } else {
    draw(null);
  }
}

function campanaRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

/* ── Actualizar botón WA: en móvil comparte imagen, en desktop abre WA ── */
function actualizarBtnWAConFlyer(canvas, waUrl, contacto) {
  const btn = document.getElementById('campanaBtnWA');
  if (!btn) return;

  if (navigator.share && navigator.canShare) {
    // Móvil: compartir imagen + texto
    btn.removeAttribute('href');
    btn.removeAttribute('target');
    btn.onclick = async (e) => {
      e.preventDefault();
      try {
        canvas.toBlob(async (blob) => {
          const file = new File([blob], 'flyer-lahornada.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'La Hornada — Flyer' });
          } else {
            window.open(waUrl, '_blank');
          }
          registrarEnviado(contacto.telefono, contacto.nombre);
        }, 'image/png');
      } catch(err) {
        if (err.name !== 'AbortError') window.open(waUrl, '_blank');
      }
    };
  }
  // Desktop: el link href ya está puesto, solo descarga el flyer también
}

function buildWAMessage(p, nombre) {
  const cfg = (() => { try { return JSON.parse(localStorage.getItem('lahornada_settings')||'{}'); } catch { return {}; } })();
  const storeName = cfg.name  || 'La Hornada';
  const phone     = cfg.phone || '975 524 363';
  const storeUrl  = 'https://leonnnc.github.io/la-hornada';

  // Si hay mensaje personalizado, reemplazar {nombre}
  if (campanaMsgPersonalizado) {
    return campanaMsgPersonalizado.replace(/\{nombre\}/g, nombre && nombre !== 'Cliente' ? nombre : '');
  }

  let msg = `🍞 *¡Hola${nombre && nombre !== 'Cliente' ? ' ' + nombre : ''}!* 👋\n\n`;
  msg += `Te traemos una delicia de *${storeName}*:\n\n`;
  msg += `🌟 *${p.name}*\n`;
  msg += `${p.desc}\n\n`;
  msg += `💰 *Precio: S/ ${Number(p.price).toFixed(2)} / unidad*\n`;
  msg += `🚚 Delivery gratis\n\n`;
  msg += `👉 Visita nuestra tienda y haz tu pedido:\n`;
  msg += `🌐 ${storeUrl}\n\n`;
  msg += `O escríbenos directamente 😊\n`;
  msg += `📞 ${phone}`;
  return msg;
}

/* ── Mensaje template para el textarea ── */
function buildWAMessageTemplate(p) {
  const cfg = (() => { try { return JSON.parse(localStorage.getItem('lahornada_settings')||'{}'); } catch { return {}; } })();
  const storeName = cfg.name  || 'La Hornada';
  const phone     = cfg.phone || '975 524 363';
  const storeUrl  = 'https://leonnnc.github.io/la-hornada';

  let msg = `🍞 *¡Hola {nombre}!* 👋\n\n`;
  msg += `Te traemos una delicia de *${storeName}*:\n\n`;
  msg += `🌟 *${p.name}*\n`;
  msg += `${p.desc}\n\n`;
  msg += `💰 *Precio: S/ ${Number(p.price).toFixed(2)} / unidad*\n`;
  msg += `🚚 Delivery gratis\n\n`;
  msg += `👉 Visita nuestra tienda y haz tu pedido:\n`;
  msg += `🌐 ${storeUrl}\n\n`;
  msg += `O escríbenos directamente 😊\n`;
  msg += `📞 ${phone}`;
  return msg;
}

/* ── Cambiar foto personalizada ── */
window.cambiarFotoCampana = function(event) {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith('image/')) { showToast('⚠️ Solo imágenes'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    campanaFotoCustom = e.target.result;
    const img = document.getElementById('campanaFotoImg');
    const placeholder = document.querySelector('.campana-foto-placeholder');
    const resetBtn = document.getElementById('campanaFotoReset');
    if (img) { img.src = campanaFotoCustom; img.style.display = 'block'; }
    if (placeholder) placeholder.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'inline-flex';
    showToast('📷 Foto personalizada cargada');
  };
  reader.readAsDataURL(file);
};

/* ── Resetear foto a la del producto ── */
window.resetFotoCampana = function() {
  campanaFotoCustom = null;
  const img = document.getElementById('campanaFotoImg');
  const placeholder = document.querySelector('.campana-foto-placeholder');
  const resetBtn = document.getElementById('campanaFotoReset');
  const input = document.getElementById('campanaFotoInput');
  if (img) { img.src = ''; img.style.display = 'none'; }
  if (placeholder) placeholder.style.display = 'flex';
  if (resetBtn) resetBtn.style.display = 'none';
  if (input) input.value = '';
};

window.registrarEnviado = function(tel, nombre) {
  campanaEnviadosLog.push({ tel, nombre });
  campanaIndex++;
  setTimeout(renderCampanaEnvio, 600);
};

/* ── Enviar con mensaje editado ── */
window.enviarConMsgEditado = function(e, tel, nombre) {
  e.preventDefault();
  const textarea = document.getElementById('campanaMsgEdit');
  const msg = textarea ? textarea.value : buildWAMessage(campanaProducto, nombre);
  const telLimpio = tel.replace(/\D/g, '');
  const url = `https://wa.me/51${telLimpio}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  registrarEnviado(tel, nombre);
};

window.saltarCliente = function() {
  campanaIndex++;
  renderCampanaEnvio();
};

window.campanaVolver = function() {
  const layout = document.getElementById('campana-layout');
  const step3  = document.getElementById('campana-step3');
  if (layout) layout.style.display = '';
  if (step3)  step3.style.display  = 'none';
  campanaQueue = [];
  campanaIndex = 0;
  campanaEnviadosLog = [];
};

/* ── Hook showSection ── */
const _origShowSection = window.showSection;
window.showSection = function(name, el) {
  _origShowSection(name, el);
  if (name === 'campanas') initCampanas();
};

/* ═══════════════════════════════════════
   PWA + NOTIFICACIONES PUSH
═══════════════════════════════════════ */

/* ── Registrar Service Worker ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch(e) {
      console.log('SW no registrado:', e);
    }
  });

  // Escuchar mensajes del SW (aprobar desde notificación)
  navigator.serviceWorker.addEventListener('message', async e => {
    if (e.data?.type === 'APROBAR_YAPE') {
      await fsUpdateOrderStatus(e.data.orderId, 'pagado');
      showToast('✅ Pago Yape aprobado');
    }
  });
}

/* ── Mostrar botón de notificaciones al loguearse ── */
function initPWA() {
  const btn = document.getElementById('btnNotif');
  if (!btn) return;
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    btn.style.display = 'none'; // ya está activo
  } else if (Notification.permission !== 'denied') {
    btn.style.display = 'flex';
  }

  // Verificar URL params para aprobar pedido desde notificación
  const params = new URLSearchParams(window.location.search);
  const aprobarId = params.get('aprobar');
  if (aprobarId) {
    setTimeout(async () => {
      await fsUpdateOrderStatus(aprobarId, 'pagado');
      showToast('✅ Pago Yape aprobado desde notificación');
    }, 2000);
  }
}

/* ── Solicitar permiso de notificaciones ── */
window.solicitarNotificaciones = async function() {
  const perm = await Notification.requestPermission();
  const btn  = document.getElementById('btnNotif');
  if (perm === 'granted') {
    btn.style.display = 'none';
    showToast('🔔 Notificaciones activadas');
    // Enviar notificación de prueba
    new Notification('🍞 La Hornada Admin', {
      body: '✅ Notificaciones activadas correctamente',
      icon: '/img/icon-192.png'
    });
  } else {
    showToast('⚠️ Permiso denegado');
  }
};

/* ── Enviar notificación push cuando llega pedido Yape ── */
function notificarPedidoYape(orden) {
  if (Notification.permission !== 'granted') return;

  const title = `💳 Yape pendiente — #${orden.codigoPedido || '????'}`;
  const body  = `${orden.nombre} yapea S/ ${Number(orden.total || 0).toFixed(2)}\nTel: ${orden.telefono}`;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon: '/img/icon-192.png',
        badge: '/img/icon-192.png',
        tag: `yape-${orden.id}`,
        data: { orderId: orden.id },
        actions: [
          { action: 'aprobar', title: '✅ Aprobar pago' },
          { action: 'ver',     title: '👁 Ver pedido' }
        ],
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300]
      });
    });
  } else {
    // Fallback: notificación simple
    const n = new Notification(title, { body, icon: '/img/icon-192.png' });
    n.onclick = () => { window.focus(); n.close(); };
  }
}

/* ── Hook: detectar nuevos pedidos Yape y notificar ── */
let pedidosYapeConocidos = new Set();

function monitorearPedidosYape(orders) {
  orders
    .filter(o => o.estado === 'pendiente_confirmacion')
    .forEach(o => {
      if (!pedidosYapeConocidos.has(o.id)) {
        pedidosYapeConocidos.add(o.id);
        // No notificar en la carga inicial
        if (pedidosYapeConocidos.size > 0 && document.visibilityState === 'hidden') {
          notificarPedidoYape(o);
        }
      }
    });
}
