// Capa de datos: Firestore en /usuarios/{uid}/...
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  writeBatch, query, orderBy, Timestamp
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { db } from './firebase.js';

// ---- rutas ----
const col = (uid, nombre) => collection(db, 'usuarios', uid, nombre);
const ref = (uid, nombre, id) => doc(db, 'usuarios', uid, nombre, id);

// ---- watchers en tiempo real (onSnapshot) ----
// Devuelve una función para dejar de escuchar.
// alCambiar recibe un objeto { idDoc: datos }
export function vigilar(uid, nombre, alCambiar, alError) {
  const consulta = nombre === 'movimientos'
    ? query(col(uid, nombre), orderBy('fecha', 'desc'))
    : col(uid, nombre);
  return onSnapshot(consulta, snap => {
    const datos = {};
    snap.forEach(d => { datos[d.id] = d.data(); });
    alCambiar(datos);
  }, alError);
}

// ---- movimientos ----
export const crearMovimiento = (uid, d) => addDoc(col(uid, 'movimientos'), d);
export const editarMovimiento = (uid, id, d) => updateDoc(ref(uid, 'movimientos', id), d);
export const borrarMovimiento = (uid, id) => deleteDoc(ref(uid, 'movimientos', id));

// ---- cuentas ----
export const crearCuenta = (uid, d) => addDoc(col(uid, 'cuentas'), d);
export const editarCuenta = (uid, id, d) => updateDoc(ref(uid, 'cuentas', id), d);
export const borrarCuenta = (uid, id) => deleteDoc(ref(uid, 'cuentas', id));

// ---- categorías ----
export const crearCategoria = (uid, d) => addDoc(col(uid, 'categorias'), d);
export const editarCategoria = (uid, id, d) => updateDoc(ref(uid, 'categorias', id), d);
export const borrarCategoria = (uid, id) => deleteDoc(ref(uid, 'categorias', id));

// ---- metas ----
export const crearMeta = (uid, d) => addDoc(col(uid, 'metas'), d);
export const editarMeta = (uid, id, d) => updateDoc(ref(uid, 'metas', id), d);
export const borrarMeta = (uid, id) => deleteDoc(ref(uid, 'metas', id));

// 'YYYY-MM-DD' (input date) -> Timestamp de Firestore a mediodía local
// (así el mes de la fecha nunca cambia por la zona horaria)
export function timestampDe(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0));
}

// Datos de ejemplo la primera vez que se entra (todo vacío)
export async function sembrarDatosIniciales(uid) {
  const lote = writeBatch(db);
  lote.set(doc(col(uid, 'cuentas')), { nombre: 'Efectivo', color: '#34d399', saldo_inicial: 0 });
  const cats = [
    ['Comida', '#f87171'],
    ['Transporte', '#60a5fa'],
    ['Ocio', '#c084fc'],
    ['Ropa', '#fbbf24'],
    ['Otros', '#94a3b8']
  ];
  cats.forEach(([nombre, color]) => lote.set(doc(col(uid, 'categorias')), { nombre, color, tipo: 'gasto' }));
  await lote.commit();
}
