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

export {
  db, fsGetProducts, fsSaveProduct, fsSaveAllProducts,
  fsDeleteProduct, fsDeductStock, fsOnProducts, fsInitIfEmpty
};
