/* =============================================
   LA HORNADA — Panel de Reparto JS
   ============================================= */
import { fsOnOrders, fsUpdateOrderStatus } from './firebase.js';

/* ── CREDENCIALES REPARTIDOR ── */
const REP_USER = 'reparto';
const REP_PASS = 'reparto2024';

/* ── STATE ── */
let allOrders  = [];
let activeTab  = 'pendientes';

/* ── SANITIZAR ── */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
window.doLogin = function() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  if (u === REP_USER && p === REP_PASS) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('repartoUI').style.display   = 'block';
    initReparto();
  } else {
    document.getElementById('loginError').style.display = 'block';
  }
};

window.doLogout = function() {
  document.getElementById('repartoUI').style.display   = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginPass').value = '';
};

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
function initReparto() {
  // Fecha en header
  const now = new Date();
  document.getElementById('headerDate').textContent =
    now.toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long' });

  // Escuchar pedidos en tiempo real
  fsOnOrders(orders => {
    // Solo pedidos de hoy con estado relevante para reparto
    const hoy = new Date().toISOString().split('T')[0];
    allOrders = orders.filter(o => {
      const d = new Date(o.createdAt).toISOString().split('T')[0];
      return d === hoy && ['pagado','pendiente_envio','en_camino','entregado'].includes(o.estado);
    });
    renderAll();
  });
}

/* ═══════════════════════════════════════
   TABS
═══════════════════════════════════════ */
window.switchTab = function(tab, el) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderPedidos();
};

/* ═══════════════════════════════════════
   RENDER
═══════════════════════════════════════ */
function renderAll() {
  renderResumen();
  renderPedidos();
  updateBadges();
}

function renderResumen() {
  const pendientes = allOrders.filter(o => ['pagado','pendiente_envio','en_camino'].includes(o.estado)).length;
  const enCamino   = allOrders.filter(o => o.estado === 'en_camino').length;
  const entregados = allOrders.filter(o => o.estado === 'entregado').length;
  const totalHoy   = allOrders.filter(o => o.estado === 'entregado')
                               .reduce((s, o) => s + (o.total || 0), 0);

  document.getElementById('resumenRow').innerHTML = `
    <div class="resumen-card">
      <div class="resumen-label">Por entregar</div>
      <div class="resumen-value" style="color:var(--orange)">${pendientes}</div>
      <div class="resumen-desc">pedidos hoy</div>
    </div>
    <div class="resumen-card">
      <div class="resumen-label">En camino</div>
      <div class="resumen-value" style="color:var(--blue)">${enCamino}</div>
      <div class="resumen-desc">en ruta ahora</div>
    </div>
    <div class="resumen-card">
      <div class="resumen-label">Entregados</div>
      <div class="resumen-value" style="color:var(--green)">${entregados}</div>
      <div class="resumen-desc">completados hoy</div>
    </div>
    <div class="resumen-card">
      <div class="resumen-label">Recaudado</div>
      <div class="resumen-value" style="font-size:1.2rem">S/ ${totalHoy.toFixed(2)}</div>
      <div class="resumen-desc">efectivo hoy</div>
    </div>
  `;
}

function updateBadges() {
  const pendientes = allOrders.filter(o => ['pagado','pendiente_envio','en_camino'].includes(o.estado)).length;
  const entregados = allOrders.filter(o => o.estado === 'entregado').length;

  const bp = document.getElementById('badgePendientes');
  const be = document.getElementById('badgeEntregados');

  bp.textContent   = pendientes;
  bp.style.display = pendientes > 0 ? 'inline-flex' : 'none';
  be.textContent   = entregados;
  be.style.display = entregados > 0 ? 'inline-flex' : 'none';
}

function renderPedidos() {
  const list = activeTab === 'pendientes'
    ? allOrders.filter(o => ['pagado','pendiente_envio','en_camino'].includes(o.estado))
    : allOrders.filter(o => o.estado === 'entregado');

  const container = document.getElementById('pedidosList');

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${activeTab === 'pendientes' ? '📭' : '🎉'}</div>
        <p>${activeTab === 'pendientes'
          ? 'No hay pedidos pendientes por ahora.'
          : 'Aún no has entregado pedidos hoy.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(o => pedidoCard(o)).join('');
}

function pedidoCard(o) {
  const hora = new Date(o.createdAt).toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
  const esEfectivo = o.metodoPago !== 'yape';

  const estadoInfo = {
    pagado:        { label: '✅ Pago confirmado — listo para enviar', cls: 'badge-pagado' },
    pendiente_envio:{ label: '📦 Listo para enviar',                  cls: 'badge-pagado' },
    en_camino:     { label: '🛵 En camino',                           cls: 'badge-en_camino' },
    entregado:     { label: '✅ Entregado',                           cls: 'badge-entregado' },
  };

  const est = estadoInfo[o.estado] || { label: o.estado, cls: '' };

  // Botones según estado
  let acciones = '';
  if (o.estado === 'pagado' || o.estado === 'pendiente_envio') {
    acciones = `
      <button class="btn-action btn-en-camino" onclick="marcarEnCamino('${o.id}', '${esc(o.telefono)}')">
        🛵 Salir a entregar
      </button>
      ${o.direccion && o.direccion !== '—'
        ? `<button class="btn-action btn-maps" onclick="abrirMaps('${esc(o.direccion)}')">🗺️ Ver mapa</button>`
        : ''}`;
  } else if (o.estado === 'en_camino') {
    acciones = `
      <button class="btn-action btn-entregado" onclick="marcarEntregado('${o.id}')">
        ✅ Confirmar entrega
      </button>
      <button class="btn-action btn-whatsapp" onclick="contactarCliente('${esc(o.telefono)}', '${esc(o.nombre)}')">
        💬 WhatsApp
      </button>`;
  }

  return `
    <div class="pedido-card estado-${o.estado}" id="card-${o.id}">
      <div class="pedido-card-header">
        <div class="pedido-cliente">
          <span class="pedido-nombre">👤 ${esc(o.nombre)}</span>
          <span class="pedido-tel">📞 ${esc(o.telefono)}</span>
          ${o.direccion && o.direccion !== '—'
            ? `<span class="pedido-dir">📍 ${esc(o.direccion)}</span>` : ''}
        </div>
        <div class="pedido-meta">
          <span class="pedido-hora">🕐 ${hora}</span>
          <span class="pedido-pago ${esEfectivo ? 'pago-efectivo' : 'pago-yape'}">
            ${esEfectivo ? '💵 Efectivo' : '📱 Yape'}
          </span>
        </div>
      </div>
      <div class="pedido-items">${esc(o.items || '').replace(/\n/g, '<br>')}</div>
      <div class="pedido-total">S/ ${Number(o.total || 0).toFixed(2)}</div>
      <div class="estado-badge ${est.cls}">${est.label}</div>
      ${acciones ? `<div class="pedido-actions">${acciones}</div>` : ''}
    </div>`;
}

/* ═══════════════════════════════════════
   ACCIONES
═══════════════════════════════════════ */
window.marcarEnCamino = async function(id, telefono) {
  await fsUpdateOrderStatus(id, 'en_camino');
  // Notificar al cliente por WhatsApp
  const msg = `🛵 *La Hornada* — ¡Tu pedido está en camino! Pronto llegará a tu dirección. 🍞`;
  window.open(`https://wa.me/51${telefono.replace(/\s/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.marcarEntregado = async function(id) {
  await fsUpdateOrderStatus(id, 'entregado');
};

window.contactarCliente = function(telefono, nombre) {
  const msg = `Hola ${nombre}, soy el repartidor de La Hornada 🍞. Estoy cerca de tu dirección, ¿puedes recibirme?`;
  window.open(`https://wa.me/51${telefono.replace(/\s/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.abrirMaps = function(direccion) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion + ', Lima, Perú')}`, '_blank');
};
