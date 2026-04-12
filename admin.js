/* =============================================
   LA HORNADA — Admin Panel JS (Firebase)
   ============================================= */
import {
  fsGetProducts, fsSaveProduct, fsSaveAllProducts,
  fsDeleteProduct, fsOnProducts, fsInitIfEmpty, fsResetProducts
} from './firebase.js';

/* ── CREDENCIALES ── */
const ADMIN_USER = 'admin';
const ADMIN_PASS = '1234';

/* ── EMOJIS ── */
const EMOJIS = ['🥟','🍩','🥧','🍮','🌀','🍪','🎂','🥐','🧁','🍞','🥖','🧇','🥞','🍰','🫓','🥨','🍡','🧆'];

/* ── STATE ── */
let products      = [];
let editingId     = null;
let deletingId    = null;
let selectedEmoji = '🥟';

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
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminUI').style.display    = 'block';
    loadSettings();
    initAdmin();
  } else {
    document.getElementById('loginError').style.display = 'block';
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
  // Escuchar cambios en tiempo real
  fsOnProducts(list => {
    products = list;
    renderAll();
  });
}

/* ═══════════════════════════════════════
   SECTIONS / NAV
═══════════════════════════════════════ */
window.showSection = function(name, el) {
  document.querySelectorAll('[id^="section-"]').forEach(s => s.style.display = 'none');
  document.getElementById('section-' + name).style.display = 'block';
  document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
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
