/* =============================================
   LA HORNADA — Firebase Config + Firestore
   ============================================= */
import { initializeApp }                        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc,
         getDocs, getDoc, setDoc,
         updateDoc, deleteDoc,
         writeBatch, onSnapshot }               from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyD4PdGu-AZ6pvEk-PkywZdo_Olev3zNGQY",
  authDomain:        "la-hornada.firebaseapp.com",
  projectId:         "la-hornada",
  storageBucket:     "la-hornada.firebasestorage.app",
  messagingSenderId: "7556504010",
  appId:             "1:7556504010:web:64cdf3887d6bcdcbedd733"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* ── Colección de productos ── */
const PRODUCTS_COL = collection(db, 'products');

/* ── Cargar todos los productos desde Firestore ── */
async function fsGetProducts() {
  const snap = await getDocs(PRODUCTS_COL);
  const list = snap.docs.map(d => ({ ...d.data(), id: d.data().id }));
  // Ordenar por campo "order" si existe
  list.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
  return list;
}

/* ── Guardar/sobreescribir un producto ── */
async function fsSaveProduct(p) {
  await setDoc(doc(db, 'products', String(p.id)), p);
}

/* ── Guardar lista completa (batch) ── */
async function fsSaveAllProducts(arr) {
  const batch = writeBatch(db);
  arr.forEach(p => {
    batch.set(doc(db, 'products', String(p.id)), p);
  });
  await batch.commit();
}

/* ── Eliminar un producto ── */
async function fsDeleteProduct(id) {
  await deleteDoc(doc(db, 'products', String(id)));
}

/* ── Descontar stock al confirmar pedido ── */
async function fsDeductStock(cartObj) {
  const batch = writeBatch(db);
  for (const [id, qty] of Object.entries(cartObj)) {
    const ref  = doc(db, 'products', String(id));
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const current = snap.data().stock ?? 0;
      batch.update(ref, { stock: Math.max(0, current - qty) });
    }
  }
  await batch.commit();
}

/* ── Escuchar cambios en tiempo real ── */
function fsOnProducts(callback) {
  return onSnapshot(PRODUCTS_COL, snap => {
    const list = snap.docs.map(d => ({ ...d.data(), id: d.data().id }));
    list.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
    callback(list);
  });
}

/* ── Guardar pedido en Firestore (retorna el ID) ── */
async function fsSaveOrder(order) {
  // 1. Obtener y actualizar contador global de pedidos
  const counterRef = doc(db, 'meta', 'orderCounter');
  const counterSnap = await getDoc(counterRef);
  let nextNum = 1;
  if (counterSnap.exists()) {
    nextNum = (counterSnap.data().count || 0) + 1;
  }
  await setDoc(counterRef, { count: nextNum });
  const codigoPedido = String(nextNum).padStart(4, '0'); // "0001"

  // 2. Obtener o crear código de cliente por teléfono
  const tel = (order.telefono || '').replace(/\s/g, '');
  const clienteRef = doc(db, 'clientes', tel);
  const clienteSnap = await getDoc(clienteRef);
  let codigoCliente;
  if (clienteSnap.exists()) {
    codigoCliente = clienteSnap.data().codigo;
  } else {
    // Generar código único basado en teléfono
    codigoCliente = 'CLI-' + tel.slice(-4);
    await setDoc(clienteRef, {
      codigo: codigoCliente,
      telefono: tel,
      nombre: order.nombre,
      primerPedido: Date.now(),
      totalPedidos: 0
    });
  }
  // Incrementar total de pedidos del cliente
  await updateDoc(clienteRef, {
    totalPedidos: (clienteSnap.exists() ? (clienteSnap.data().totalPedidos || 0) : 0) + 1,
    ultimoPedido: Date.now()
  });

  // 3. Guardar pedido con códigos
  const ordersCol = collection(db, 'orders');
  const ref = doc(ordersCol);
  await setDoc(ref, {
    ...order,
    id: ref.id,
    codigoPedido,
    codigoCliente,
    archivado: false,
    createdAt: Date.now()
  });
  return ref.id;
}

/* ── Escuchar cambio de estado de un pedido específico ── */
function fsWatchOrderStatus(orderId, callback) {
  const ref = doc(db, 'orders', orderId);
  return onSnapshot(ref, snap => {
    if (snap.exists()) {
      callback(snap.data().estado);
    }
  });
}

/* ── Actualizar estado de un pedido (archiva automáticamente si es entregado) ── */
async function fsUpdateOrderStatus(id, status) {
  const ref = doc(db, 'orders', id);
  const updates = { estado: status };
  if (status === 'entregado') {
    updates.archivado   = true;
    updates.entregadoAt = Date.now();
    updates.archivadoAt = Date.now();
  }
  await updateDoc(ref, updates);
}

/* ── Escuchar pedidos activos (no archivados) ── */
function fsOnOrders(callback) {
  const ordersCol = collection(db, 'orders');
  return onSnapshot(ordersCol, snap => {
    const list = snap.docs.map(d => d.data()).filter(o => !o.archivado);
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(list);
  });
}

/* ── Escuchar pedidos archivados ── */
function fsOnArchivedOrders(callback) {
  const ordersCol = collection(db, 'orders');
  return onSnapshot(ordersCol, snap => {
    const list = snap.docs.map(d => d.data()).filter(o => o.archivado);
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(list);
  });
}

/* ── Inicializar Firestore con productos por defecto si está vacío ── */
async function fsInitIfEmpty() {
  const snap = await getDocs(PRODUCTS_COL);
  if (snap.empty) {
    console.log('Firestore vacío — cargando productos por defecto...');
    await fsSaveAllProducts(
      DEFAULT_PRODUCTS.map((p, i) => ({ ...p, order: i }))
    );
  }
}

/* ── Forzar reset completo con productos por defecto ── */
async function fsResetProducts() {
  // Borrar todos los documentos existentes
  const snap = await getDocs(PRODUCTS_COL);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  // Volver a cargar los defaults
  await fsSaveAllProducts(DEFAULT_PRODUCTS.map((p, i) => ({ ...p, order: i })));
}

/* ── Obtener todos los clientes ── */
async function fsGetClientes() {
  const snap = await getDocs(collection(db, 'clientes'));
  const list = snap.docs.map(d => d.data());
  list.sort((a, b) => (b.ultimoPedido || 0) - (a.ultimoPedido || 0));
  return list;
}

export {
  db, fsGetProducts, fsSaveProduct, fsSaveAllProducts,
  fsDeleteProduct, fsDeductStock, fsOnProducts,
  fsInitIfEmpty, fsResetProducts, fsSaveOrder,
  fsOnOrders, fsOnArchivedOrders, fsUpdateOrderStatus,
  fsWatchOrderStatus, fsGetClientes
};
