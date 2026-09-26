// Mis Finanzas v2 — lógica de la app (estado, vistas, gráficos y modales)
import { auth, entrar, salir, onAuthStateChanged, OWNER_EMAIL } from './firebase.js';
import {
  vigilar, sembrarDatosIniciales,
  crearMovimiento, editarMovimiento, borrarMovimiento,
  crearCuenta, editarCuenta, borrarCuenta,
  crearCategoria, editarCategoria, borrarCategoria,
  crearMeta, editarMeta, borrarMeta,
  timestampDe
} from './db.js';

const PALETA = ['#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#fb7185',
                '#fbbf24', '#f97316', '#4ade80', '#2dd4bf', '#e879f9', '#94a3b8'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const $ = id => document.getElementById(id);

// ---------- estado ----------
const estado = {
  uid: null,
  cuentas: {},      // id -> { nombre, color, saldo_inicial }
  categorias: {},   // id -> { nombre, tipo, color }
  movimientos: {},  // id -> { fecha: Timestamp, monto, cuenta, tipo, categoria }
  metas: {},        // id -> { nombre, monto_objetivo, monto_actual_manual, color }
  leido: {},
  mesVisto: mesActual()
};
let oyentes = [];
let sembrado = false;
let enAjustes = false;
let donut = null, barras = null;

// edición en curso (id o null)
let editando = { mov: null, cuenta: null, categoria: null, meta: null };
let movTipo = 'gasto';
let tipoCategoria = 'gasto';
let colorCuenta = PALETA[0], colorCatSel = PALETA[3], colorMeta = PALETA[0];

// ---------- utilidades ----------
function eur(n){ return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); }
function esc(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function hoyISO(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function mesActual(){ return hoyISO().slice(0, 7); }
function mesVisto(){ return estado.mesVisto || mesActual(); }
function desplazarMes(mes, delta){
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function mesDe(ts){
  const d = ts.toDate();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function isoDe(ts){
  const d = ts.toDate();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fechaBonita(ts){
  const d = ts.toDate();
  const extra = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
  return DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()] + extra;
}
function parsearNumero(txt){
  const n = parseFloat(String(txt).trim().replace(',', '.'));
  return isNaN(n) ? null : n;
}
function listaMovs(){
  return Object.entries(estado.movimientos).map(([id, m]) => ({ id, ...m }));
}
function saldoCuenta(id){
  const c = estado.cuentas[id];
  if (!c) return 0;
  return listaMovs().reduce(
    (s, m) => m.cuenta === id ? s + (m.tipo === 'ingreso' ? m.monto : -m.monto) : s,
    c.saldo_inicial
  );
}
function saldoTotal(){
  return Object.keys(estado.cuentas).reduce((s, id) => s + saldoCuenta(id), 0);
}
function nombreCategoria(id){
  return estado.categorias[id] ? estado.categorias[id].nombre : 'Sin categoría';
}
function colorCategoria(id){
  return estado.categorias[id] ? estado.categorias[id].color : '#94a3b8';
}
function avisoDb(mostrar){ $('avisoDb').hidden = !mostrar; }

// ---------- autenticación ----------
// Si Firebase Auth no responde en 10 s, avisamos en vez de quedarnos cargando
const relojGuardian = setTimeout(() => {
  if (!$('cargando').hidden){
    $('cargando').hidden = true;
    $('pantallaLogin').hidden = false;
    const err = $('loginError');
    err.hidden = false;
    err.textContent = '⏱️ Firebase no respondió. Revisa tu conexión (o desactiva bloqueadores) y recarga la página.';
  }
}, 10000);

onAuthStateChanged(auth, usuario => {
  clearTimeout(relojGuardian);
  $('cargando').hidden = true;
  cancelarOyentes();
  if (!usuario){
    estado.uid = null;
    mostrarLogin();
    return;
  }
  if ((usuario.email || '').toLowerCase() !== OWNER_EMAIL){
    const err = $('loginError');
    err.hidden = false;
    err.textContent = '🔒 Esta app es privada: no se puede entrar con esta cuenta de Google.';
    salir();
    return;
  }
  $('loginError').hidden = true;
  estado.uid = usuario.uid;
  iniciarOyentes();
  mostrarApp();
});

function mostrarLogin(){
  $('app').hidden = true;
  $('pantallaLogin').hidden = false;
}
function mostrarApp(){
  $('pantallaLogin').hidden = true;
  $('app').hidden = false;
  // siempre arrancar en la vista principal (aunque se cerrara sesión desde Ajustes)
  enAjustes = false;
  $('vistaAjustes').hidden = true;
  $('vistaPrincipal').hidden = false;
  $('fab').hidden = false;
}

function iniciarOyentes(){
  const mapa = {
    cuentas: d => estado.cuentas = d,
    categorias: d => estado.categorias = d,
    movimientos: d => estado.movimientos = d,
    metas: d => estado.metas = d
  };
  for (const [nombre, aplicar] of Object.entries(mapa)){
    oyentes.push(vigilar(estado.uid, nombre, datos => {
      aplicar(datos);
      estado.leido[nombre] = true;
      avisoDb(false);
      quizasSembrar();
      renderTodo();
    }, () => avisoDb(true)));
  }
}
function cancelarOyentes(){
  oyentes.forEach(parar => parar());
  oyentes = [];
  if (donut){ donut.destroy(); donut = null; }
  if (barras){ barras.destroy(); barras = null; }
}

// La primera vez que se entra y todo está vacío, crear datos de ejemplo
function quizasSembrar(){
  if (sembrado) return;
  const todoLeido = ['cuentas', 'categorias', 'movimientos', 'metas'].every(k => estado.leido[k]);
  const todoVacio = ['cuentas', 'categorias', 'movimientos', 'metas'].every(k => Object.keys(estado[k]).length === 0);
  if (todoLeido && todoVacio){
    sembrado = true;
    sembrarDatosIniciales(estado.uid).catch(console.error);
  }
}

// ---------- render principal ----------
function renderTodo(){
  if (!estado.uid) return;
  renderSaldos();
  renderCuentas();
  renderMetas();
  renderHistorial();
  if (!enAjustes) renderGraficos();
}

function renderSaldos(){
  const total = saldoTotal();
  const el = $('saldoTotal');
  el.textContent = (total > 0 ? '+ ' : '') + eur(total);
  el.className = total > 0 ? 'pos' : (total < 0 ? 'neg' : '');
}

function renderCuentas(){
  const ids = Object.keys(estado.cuentas)
    .sort((a, b) => estado.cuentas[a].nombre.localeCompare(estado.cuentas[b].nombre));
  $('cuentasVacio').hidden = ids.length > 0;
  $('cuentas').innerHTML = ids.map(id => {
    const c = estado.cuentas[id];
    const saldo = saldoCuenta(id);
    return `
      <div class="cuenta-card" style="border-left-color:${c.color}">
        <span class="cuenta-nombre"><i style="background:${c.color}"></i>${esc(c.nombre)}</span>
        <strong class="${saldo < 0 ? 'neg' : ''}">${eur(saldo)}</strong>
      </div>`;
  }).join('');
}

function renderMetas(){
  const ids = Object.keys(estado.metas)
    .sort((a, b) => estado.metas[a].nombre.localeCompare(estado.metas[b].nombre));
  $('seccionMetas').hidden = ids.length === 0;
  $('metas').innerHTML = ids.map(id => {
    const m = estado.metas[id];
    const pct = m.monto_objetivo > 0 ? Math.min(100, m.monto_actual_manual / m.monto_objetivo * 100) : 0;
    return `
      <div class="meta-card" data-id="${id}">
        <div class="meta-top"><strong>${esc(m.nombre)}</strong><span>${eur(m.monto_actual_manual)} / ${eur(m.monto_objetivo)}</span></div>
        <div class="meta-barra"><div style="width:${pct.toFixed(1)}%;background:${m.color}"></div></div>
        <span class="meta-pct">${Math.round(pct)}%</span>
      </div>`;
  }).join('');
}

function renderHistorial(){
  const delMes = listaMovs().filter(m => mesDe(m.fecha) === mesVisto());
  $('listaVacio').hidden = delMes.length > 0;
  $('lista').innerHTML = delMes.map(m => {
    const cuenta = estado.cuentas[m.cuenta];
    const esIngreso = m.tipo === 'ingreso';
    return `
      <li class="mov" data-id="${m.id}">
        <span class="punto" style="background:${esIngreso ? '#34d399' : colorCategoria(m.categoria)}"></span>
        <div class="info">
          <strong>${esIngreso ? 'Ingreso' : esc(nombreCategoria(m.categoria))}</strong>
          <span>${cuenta ? esc(cuenta.nombre) : '—'} · ${fechaBonita(m.fecha)}</span>
        </div>
        <span class="importe ${esIngreso ? 'pos' : 'neg'}">${esIngreso ? '+' : '−'} ${eur(m.monto)}</span>
        <div class="btns">
          <button data-accion="editar" title="Editar">✏️</button>
          <button data-accion="borrar" title="Borrar">🗑️</button>
        </div>
      </li>`;
  }).join('');
}

// ---------- gráficos ----------
function renderGraficos(){
  if (typeof Chart === 'undefined') return;

  // Donut: gastos del mes por categoría
  const porCat = new Map();
  listaMovs().forEach(m => {
    if (m.tipo === 'gasto' && mesDe(m.fecha) === mesVisto()){
      porCat.set(m.categoria, (porCat.get(m.categoria) || 0) + m.monto);
    }
  });
  const datos = [...porCat.entries()]
    .map(([id, total]) => ({ nombre: nombreCategoria(id), color: colorCategoria(id), total }))
    .sort((a, b) => b.total - a.total);
  $('donutVacio').hidden = datos.length > 0;
  $('cajaDonut').hidden = datos.length === 0;
  if (donut){ donut.destroy(); donut = null; }
  if (datos.length){
    donut = new Chart($('graficoDonut'), {
      type: 'doughnut',
      data: {
        labels: datos.map(d => d.nombre),
        datasets: [{
          data: datos.map(d => d.total),
          backgroundColor: datos.map(d => d.color),
          borderColor: '#141a24', borderWidth: 3, hoverOffset: 6
        }]
      },
      options: {
        maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, padding: 12 } },
          tooltip: { callbacks: { label: c => ` ${c.label}: ${eur(c.parsed)}` } }
        }
      }
    });
  }

  // Barras: ingresos vs gastos de los últimos 6 meses
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(desplazarMes(mesVisto(), -i));
  const ing = [], gas = [];
  const todos = listaMovs();
  meses.forEach(mes => {
    const delMes = todos.filter(m => mesDe(m.fecha) === mes);
    ing.push(delMes.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0));
    gas.push(delMes.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0));
  });
  if (barras){ barras.destroy(); barras = null; }
  barras = new Chart($('graficoBarras'), {
    type: 'bar',
    data: {
      labels: meses.map(m => MESES[Number(m.slice(5, 7)) - 1]),
      datasets: [
        { label: 'Ingresos', data: ing, backgroundColor: '#34d399', borderRadius: 6, maxBarThickness: 28 },
        { label: 'Gastos', data: gas, backgroundColor: '#f87171', borderRadius: 6, maxBarThickness: 28 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' €' } },
        x: { grid: { display: false } }
      },
      plugins: {
        legend: { labels: { boxWidth: 12, boxHeight: 12 } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${eur(c.parsed.y)}` } }
      }
    }
  });
}

// ---------- ajustes ----------
function renderAjustes(){
  const fila = (id, color, nombre, sub) => `
    <div class="fila" data-id="${id}">
      <span class="punto" style="background:${color}"></span>
      <div class="info"><strong>${esc(nombre)}</strong><span>${sub}</span></div>
      <div class="btns">
        <button data-accion="editar" title="Editar">✏️</button>
        <button data-accion="borrar" title="Borrar">🗑️</button>
      </div>
    </div>`;

  $('listaCuentas').innerHTML = Object.keys(estado.cuentas)
    .sort((a, b) => estado.cuentas[a].nombre.localeCompare(estado.cuentas[b].nombre))
    .map(id => fila(id, estado.cuentas[id].color, estado.cuentas[id].nombre,
      'Saldo inicial: ' + eur(estado.cuentas[id].saldo_inicial))).join('');

  $('listaCategorias').innerHTML = Object.keys(estado.categorias)
    .sort((a, b) => estado.categorias[a].nombre.localeCompare(estado.categorias[b].nombre))
    .map(id => fila(id, estado.categorias[id].color, estado.categorias[id].nombre,
      'Tipo: ' + estado.categorias[id].tipo)).join('');

  $('listaMetas').innerHTML = Object.keys(estado.metas)
    .sort((a, b) => estado.metas[a].nombre.localeCompare(estado.metas[b].nombre))
    .map(id => fila(id, estado.metas[id].color, estado.metas[id].nombre,
      eur(estado.metas[id].monto_actual_manual) + ' de ' + eur(estado.metas[id].monto_objetivo))).join('');
}

// ---------- modales ----------
function abrirModal(id){
  cerrarModales();
  $('fondo').hidden = false;
  $(id).hidden = false;
}
function cerrarModales(){
  $('fondo').hidden = true;
  document.querySelectorAll('.modal').forEach(m => m.hidden = true);
}

function pintarSwatches(contenedor, activo, alElegir){
  contenedor.innerHTML = PALETA.map(c =>
    `<button type="button" class="swatch${c === activo ? ' sel' : ''}" data-color="${c}" style="background:${c}" aria-label="color"></button>`
  ).join('');
  contenedor.querySelectorAll('.swatch').forEach(b => b.addEventListener('click', () => {
    contenedor.querySelectorAll('.swatch').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    alElegir(b.dataset.color);
  }));
}

function llenarCuentas(sel, elegida){
  const ids = Object.keys(estado.cuentas)
    .sort((a, b) => estado.cuentas[a].nombre.localeCompare(estado.cuentas[b].nombre));
  sel.innerHTML = ids.length
    ? ids.map(id => `<option value="${id}">${esc(estado.cuentas[id].nombre)}</option>`).join('')
    : '<option value="">— sin cuentas —</option>';
  if (elegida) sel.value = elegida;
}

function llenarCategoriasGasto(sel, elegida){
  const ids = Object.keys(estado.categorias).filter(id => estado.categorias[id].tipo === 'gasto')
    .sort((a, b) => estado.categorias[a].nombre.localeCompare(estado.categorias[b].nombre));
  sel.innerHTML = ids.length
    ? '<option value="">Elige categoría…</option>' + ids.map(id => `<option value="${id}">${esc(estado.categorias[id].nombre)}</option>`).join('')
    : '<option value="">— crea categorías en Ajustes —</option>';
  if (elegida) sel.value = elegida;
}

function setMovTipo(t){
  movTipo = t;
  $('movGasto').classList.toggle('activo', t === 'gasto');
  $('movIngreso').classList.toggle('activo', t === 'ingreso');
  $('campoCategoria').hidden = t !== 'gasto';
}

function abrirModalMov(id = null){
  editando.mov = id;
  const m = id ? estado.movimientos[id] : null;
  $('tituloMov').textContent = m ? 'Editar movimiento' : 'Nuevo movimiento';
  setMovTipo(m ? m.tipo : 'gasto');
  $('movMonto').value = m ? String(m.monto).replace('.', ',') : '';
  $('movFecha').value = m ? isoDe(m.fecha) : hoyISO();
  llenarCuentas($('movCuenta'), m ? m.cuenta : undefined);
  llenarCategoriasGasto($('movCategoria'), m ? m.categoria : undefined);
  $('movError').hidden = true;
  abrirModal('modalMov');
  $('movMonto').focus();
}

function abrirModalCuenta(id = null){
  editando.cuenta = id;
  const c = id ? estado.cuentas[id] : null;
  $('tituloCuenta').textContent = c ? 'Editar cuenta' : 'Nueva cuenta';
  $('ctaNombre').value = c ? c.nombre : '';
  $('ctaSaldo').value = c ? String(c.saldo_inicial).replace('.', ',') : '';
  colorCuenta = c ? c.color : PALETA[0];
  pintarSwatches($('swCuenta'), colorCuenta, col => colorCuenta = col);
  $('ctaError').hidden = true;
  abrirModal('modalCuenta');
  $('ctaNombre').focus();
}

function setTipoCategoria(t){
  tipoCategoria = t;
  $('catGasto').classList.toggle('activo', t === 'gasto');
  $('catIngreso').classList.toggle('activo', t === 'ingreso');
}

function abrirModalCategoria(id = null){
  editando.categoria = id;
  const c = id ? estado.categorias[id] : null;
  $('tituloCategoria').textContent = c ? 'Editar categoría' : 'Nueva categoría';
  $('catNombre').value = c ? c.nombre : '';
  setTipoCategoria(c ? c.tipo : 'gasto');
  colorCatSel = c ? c.color : PALETA[3];
  pintarSwatches($('swCategoria'), colorCatSel, col => colorCatSel = col);
  $('catError').hidden = true;
  abrirModal('modalCategoria');
  $('catNombre').focus();
}

function abrirModalMeta(id = null){
  editando.meta = id;
  const m = id ? estado.metas[id] : null;
  $('tituloMeta').textContent = m ? 'Editar meta' : 'Nueva meta';
  $('metaNombre').value = m ? m.nombre : '';
  $('metaObjetivo').value = m ? String(m.monto_objetivo).replace('.', ',') : '';
  $('metaActual').value = m ? String(m.monto_actual_manual).replace('.', ',') : '';
  colorMeta = m ? m.color : PALETA[0];
  pintarSwatches($('swMeta'), colorMeta, col => colorMeta = col);
  $('metaError').hidden = true;
  abrirModal('modalMeta');
  $('metaNombre').focus();
}

// ---------- borrados con reglas de negocio ----------
function pedirBorrarMovimiento(id){
  if (!confirm('¿Borrar este movimiento?')) return;
  borrarMovimiento(estado.uid, id);
}
function pedirBorrarCuenta(id){
  if (listaMovs().some(m => m.cuenta === id)){
    alert('Esta cuenta tiene movimientos.\nBórralos (o cámbialos a otra cuenta) antes de borrar la cuenta.');
    return;
  }
  if (!confirm('¿Borrar esta cuenta?')) return;
  borrarCuenta(estado.uid, id);
}
function pedirBorrarCategoria(id){
  if (listaMovs().some(m => m.categoria === id)){
    alert('Esta categoría tiene gastos asociados.\nBórralos (o cámbiales la categoría) antes de borrarla.');
    return;
  }
  if (!confirm('¿Borrar esta categoría?')) return;
  borrarCategoria(estado.uid, id);
}
function pedirBorrarMeta(id){
  if (!confirm('¿Borrar esta meta?')) return;
  borrarMeta(estado.uid, id);
}

// ---------- eventos ----------
$('btnGoogle').addEventListener('click', () => {
  $('loginError').hidden = true;
  entrar().catch(e => {
    const mensajes = {
      'auth/network-request-failed': 'Sin conexión: revisa tu internet e inténtalo otra vez.',
      'auth/operation-not-allowed': 'El login con Google no está activado en este proyecto de Firebase.',
      'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication.'
    };
    const err = $('loginError');
    err.hidden = false;
    err.textContent = mensajes[e.code] || 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  });
});

$('btnSalir').addEventListener('click', () => {
  if (confirm('¿Cerrar sesión?')) salir();
});
$('btnAjustes').addEventListener('click', () => {
  enAjustes = true;
  $('vistaPrincipal').hidden = true;
  $('vistaAjustes').hidden = false;
  $('fab').hidden = true;
  renderAjustes();
});
$('btnVolver').addEventListener('click', () => {
  enAjustes = false;
  $('vistaAjustes').hidden = true;
  $('vistaPrincipal').hidden = false;
  $('fab').hidden = false;
  renderTodo();
});

// pestañas de ajustes
$('tabsNav').addEventListener('click', e => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  document.querySelectorAll('#tabsNav button').forEach(b => b.classList.toggle('activo', b === btn));
  ['cuentas', 'categorias', 'metas'].forEach(t => $('tab-' + t).hidden = t !== btn.dataset.tab);
});

// botones "+ nuevo…" de cada pestaña
document.querySelectorAll('[data-nuevo]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.nuevo === 'cuenta') abrirModalCuenta();
  if (b.dataset.nuevo === 'categoria') abrirModalCategoria();
  if (b.dataset.nuevo === 'meta') abrirModalMeta();
}));

// selector de mes
$('filtroMes').value = estado.mesVisto;
$('filtroMes').addEventListener('change', () => {
  estado.mesVisto = $('filtroMes').value || mesActual();
  renderTodo();
});
$('mesAnterior').addEventListener('click', () => {
  estado.mesVisto = desplazarMes(mesVisto(), -1);
  $('filtroMes').value = estado.mesVisto;
  renderTodo();
});
$('mesSiguiente').addEventListener('click', () => {
  estado.mesVisto = desplazarMes(mesVisto(), 1);
  $('filtroMes').value = estado.mesVisto;
  renderTodo();
});

// FAB
$('fab').addEventListener('click', () => abrirModalMov());

// listas con delegación de clics
function delegar(contenedor, alEditar, alBorrar, alTocarFila){
  contenedor.addEventListener('click', e => {
    const btn = e.target.closest('button[data-accion]');
    const fila = e.target.closest('[data-id]');
    if (!fila) return;
    const id = fila.dataset.id;
    if (btn){
      if (btn.dataset.accion === 'editar') alEditar(id);
      if (btn.dataset.accion === 'borrar') alBorrar(id);
    } else if (alTocarFila){
      alTocarFila(id);
    }
  });
}
delegar($('lista'), abrirModalMov, pedirBorrarMovimiento, abrirModalMov);
delegar($('listaCuentas'), abrirModalCuenta, pedirBorrarCuenta);
delegar($('listaCategorias'), abrirModalCategoria, pedirBorrarCategoria);
delegar($('listaMetas'), abrirModalMeta, pedirBorrarMeta);
// tocar una meta en la pantalla principal también la abre para editar
$('metas').addEventListener('click', e => {
  const fila = e.target.closest('[data-id]');
  if (fila) abrirModalMeta(fila.dataset.id);
});

// cerrar modales
$('fondo').addEventListener('click', cerrarModales);
document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrarModales));
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModales(); });

// segmentos
$('movGasto').addEventListener('click', () => setMovTipo('gasto'));
$('movIngreso').addEventListener('click', () => setMovTipo('ingreso'));
$('catGasto').addEventListener('click', () => setTipoCategoria('gasto'));
$('catIngreso').addEventListener('click', () => setTipoCategoria('ingreso'));

// ---------- formularios ----------
$('formMov').addEventListener('submit', e => {
  e.preventDefault();
  const monto = parsearNumero($('movMonto').value);
  if (monto === null || monto <= 0) return errorForm('movError', 'Escribe un monto válido mayor que 0.');
  const cuentaId = $('movCuenta').value;
  if (!cuentaId) return errorForm('movError', 'Primero crea una cuenta en ⚙️ Ajustes.');
  let categoriaId = null;
  if (movTipo === 'gasto'){
    categoriaId = $('movCategoria').value;
    if (!categoriaId) return errorForm('movError', 'Los gastos necesitan categoría: créala en ⚙️ Ajustes.');
  }
  const datos = {
    monto, cuenta: cuentaId, tipo: movTipo, categoria: categoriaId,
    fecha: timestampDe($('movFecha').value || hoyISO())
  };
  if (editando.mov) editarMovimiento(estado.uid, editando.mov, datos);
  else crearMovimiento(estado.uid, datos);
  cerrarModales();
});

$('formCuenta').addEventListener('submit', e => {
  e.preventDefault();
  let saldo = 0;
  const texto = $('ctaSaldo').value.trim();
  if (texto){
    saldo = parsearNumero(texto);
    if (saldo === null) return errorForm('ctaError', 'El saldo inicial no es un número válido.');
  }
  const datos = { nombre: $('ctaNombre').value.trim(), color: colorCuenta, saldo_inicial: saldo };
  if (editando.cuenta) editarCuenta(estado.uid, editando.cuenta, datos);
  else crearCuenta(estado.uid, datos);
  cerrarModales();
});

$('formCategoria').addEventListener('submit', e => {
  e.preventDefault();
  const datos = { nombre: $('catNombre').value.trim(), tipo: tipoCategoria, color: colorCatSel };
  if (editando.categoria) editarCategoria(estado.uid, editando.categoria, datos);
  else crearCategoria(estado.uid, datos);
  cerrarModales();
});

$('formMeta').addEventListener('submit', e => {
  e.preventDefault();
  const objetivo = parsearNumero($('metaObjetivo').value);
  if (objetivo === null || objetivo <= 0) return errorForm('metaError', 'Escribe un objetivo válido mayor que 0.');
  let actual = 0;
  const texto = $('metaActual').value.trim();
  if (texto){
    actual = parsearNumero(texto);
    if (actual === null) return errorForm('metaError', 'El "ahorrado ahora" no es un número válido.');
  }
  const datos = {
    nombre: $('metaNombre').value.trim(),
    monto_objetivo: objetivo,
    monto_actual_manual: actual,
    color: colorMeta
  };
  if (editando.meta) editarMeta(estado.uid, editando.meta, datos);
  else crearMeta(estado.uid, datos);
  cerrarModales();
});

function errorForm(id, texto){
  const el = $(id);
  el.hidden = false;
  el.textContent = texto;
}
['movMonto', 'movCuenta', 'movCategoria'].forEach(id => $(id).addEventListener('input', () => $('movError').hidden = true));
['ctaNombre', 'ctaSaldo'].forEach(id => $(id).addEventListener('input', () => $('ctaError').hidden = true));
['catNombre'].forEach(id => $(id).addEventListener('input', () => $('catError').hidden = true));
['metaNombre', 'metaObjetivo', 'metaActual'].forEach(id => $(id).addEventListener('input', () => $('metaError').hidden = true));

// ---------- estilo global de Chart.js ----------
if (typeof Chart !== 'undefined'){
  Chart.defaults.color = '#8a94a6';
  Chart.defaults.font.family = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
  Chart.defaults.borderColor = 'rgba(255,255,255,.07)';
}

// ---------- service worker (PWA) ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
