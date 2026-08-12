// =============================================================================
// MARIANEE SHOP · app.js
// SPA ligera en JavaScript puro que consume la API REST (Express + SQLite)
// =============================================================================

const API = '/api';

const state = {
  view: 'dashboard',
  usuario: null,
  clienteActualId: null,
  filtroVentas: 'recientes',
  filtroPagos: '',
  busqueda: '',
  busquedaVentas: '',
  busquedaPagos: ''
};

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------
async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* respuesta vacía */ }
  if (res.status === 401 && path !== '/auth/login') {
    mostrarLogin();
    throw new Error(data?.error || 'Sesión expirada');
  }
  if (!res.ok) throw new Error(data?.error || 'Ocurrió un error inesperado');
  return data;
}

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
}

function formatFecha(f) {
  if (!f) return '—';
  const d = new Date(f.replace(' ', 'T'));
  if (isNaN(d)) return f;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function iniciales(nombre) {
  return (nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
}

let toastTimer;
function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function badgeEstado(estado) {
  const etiquetas = { pagado: 'Pagado', abono: 'Abono', pendiente: 'Pendiente' };
  return `<span class="badge badge-${estado}"><span class="badge-dot"></span>${etiquetas[estado] || estado}</span>`;
}

function capitaliza(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function renderTendenciaSemanal(tendencia = []) {
  const hoy = new Date();
  const barras = [];

  for (let i = 6; i >= 0; i -= 1) {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - i);
    const clave = fecha.toISOString().slice(0, 10);
    const dato = tendencia.find(item => item.dia === clave);
    barras.push({
      dia: clave,
      total: Number(dato?.total || 0)
    });
  }

  const max = Math.max(...barras.map(item => item.total), 1);
  return barras.map(item => {
    const label = new Date(`${item.dia}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short' });
    const porcentaje = Math.max(10, Math.round((item.total / max) * 100));
    return `
      <div class="trend-column">
        <div class="trend-bar">
          <div class="trend-fill" style="height:${porcentaje}%"></div>
        </div>
        <span class="trend-day">${label}</span>
        <strong>${formatMoney(item.total)}</strong>
      </div>`;
  }).join('');
}

// --------------------------------------------------------------------------
// Autenticación
// --------------------------------------------------------------------------
function mostrarLogin() {
  state.usuario = null;
  document.body.classList.add('no-auth');
  document.body.classList.remove('rol-cliente');
}

function entrarApp(usuario) {
  state.usuario = usuario;
  document.body.classList.remove('no-auth');
  document.body.classList.toggle('rol-cliente', usuario.rol === 'cliente');
  document.getElementById('user-chip-name').textContent = usuario.nombre || usuario.username;
  document.getElementById('user-chip-rol').textContent = usuario.rol === 'admin' ? 'Administrador' : 'Cliente';
  mostrarVista(usuario.rol === 'cliente' ? 'micuenta' : 'dashboard');
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const error = document.getElementById('login-error');

  error.classList.remove('show');
  if (!username || !password) {
    error.textContent = 'Ingresa tu usuario y contraseña.';
    error.classList.add('show');
    return;
  }

  try {
    const { usuario } = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    error.classList.remove('show');
    document.getElementById('login-password').value = '';
    entrarApp(usuario);
  } catch (err) {
    error.textContent = err.message;
    error.classList.add('show');
  }
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (_) { /* sin sesión */ }
  mostrarLogin();
}

document.getElementById('btn-login')?.addEventListener('click', login);
document.getElementById('login-password')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});
document.getElementById('btn-logout')?.addEventListener('click', logout);

// --------------------------------------------------------------------------
// Navegación entre vistas
// --------------------------------------------------------------------------
const TITULOS = {
  dashboard: ['Inicio', 'Resumen general del negocio'],
  clientes: ['Clientes', 'Consulta y administra tu cartera de clientes'],
  'cliente-detalle': ['Detalle de cliente', 'Historial de compras y pagos'],
  ventas: ['Ventas', 'Registra y consulta las ventas realizadas'],
  pagos: ['Pagos', 'Controla los cobros de cada venta'],
  usuarios: ['Usuarios', 'Gestiona los accesos al sistema'],
  micuenta: ['Mi cuenta', 'Consulta tu historial de compras y pagos']
};

function mostrarVista(nombre) {
  state.view = nombre;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${nombre}`).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navKey = nombre === 'cliente-detalle' ? 'clientes' : nombre;
  document.querySelector(`.nav-item[data-view="${navKey}"]`)?.classList.add('active');

  const [titulo, sub] = TITULOS[nombre];
  document.getElementById('view-title').textContent = titulo;
  document.getElementById('view-subtitle').textContent = sub;

  const showSearch = nombre === 'clientes';
  document.getElementById('topbar-search-wrap').style.visibility = showSearch ? 'visible' : 'hidden';

  if (nombre === 'dashboard') cargarDashboard();
  if (nombre === 'clientes') cargarClientes();
  if (nombre === 'ventas') cargarVentas();
  if (nombre === 'pagos') cargarPagos();
  if (nombre === 'usuarios') cargarUsuarios();
  if (nombre === 'micuenta') cargarMiCuenta();
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => mostrarVista(btn.dataset.view));
});

document.getElementById('topbar-search').addEventListener('input', (e) => {
  state.busqueda = e.target.value;
  if (state.view === 'clientes') cargarClientes();
});

document.getElementById('ventas-buscar-cliente').addEventListener('input', (e) => {
  state.busquedaVentas = e.target.value;
  if (state.view === 'ventas') cargarVentas();
});

document.getElementById('pagos-buscar-cliente').addEventListener('input', (e) => {
  state.busquedaPagos = e.target.value;
  if (state.view === 'pagos') cargarPagos();
});

// ============================================================================
// DASHBOARD
// ============================================================================
async function cargarDashboard() {
  const d = await api('/dashboard');

  const cards = [
    {
      icon: 'naranja',
      label: 'Clientes registrados',
      value: d.total_clientes,
      foot: 'Base completa del negocio',
      svg: '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>'
    },
    {
      icon: 'verde',
      label: 'Ventas del mes',
      value: `${d.ventas_mes.n} ventas`,
      foot: formatMoney(d.ventas_mes.total),
      svg: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>'
    },
    {
      icon: 'ambar',
      label: 'Cobrado',
      value: formatMoney(d.monto_pagado),
      foot: `Pendiente: ${formatMoney(d.monto_por_cobrar)}`,
      svg: '<path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>'
    },
    {
      icon: 'rojo',
      label: 'Pagos pendientes',
      value: `${d.pagos_pendientes} en curso`,
      foot: `${d.pagos_abono} abonos · ${d.pagos_pagados} pagados`,
      svg: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>'
    }
  ];

  document.getElementById('dashboard-cards').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-icon icon-${c.icon}"><svg viewBox="0 0 24 24">${c.svg}</svg></div>
      <h4>${c.label}</h4>
      <p class="stat-value">${c.value}</p>
      <p class="stat-foot">${c.foot}</p>
    </div>
  `).join('');

  document.getElementById('dashboard-trend').innerHTML = renderTendenciaSemanal(d.tendencia);

  document.getElementById('dashboard-ventas-body').innerHTML = d.ultimas_ventas.length
    ? d.ultimas_ventas.map(v => `
      <tr>
        <td class="cell-strong" data-label="Cliente">${v.nombre_cliente}</td>
        <td data-label="Producto">${v.descripcion_producto}</td>
        <td data-label="Precio">${formatMoney(v.precio ?? v.monto)}</td>
        <td data-label="Fecha">${formatFecha(v.fecha)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty-state">Todavía no hay ventas registradas.</td></tr>`;

  document.getElementById('dashboard-pagos-body').innerHTML = d.ultimos_pagos.length
    ? d.ultimos_pagos.map(p => `
      <tr>
        <td class="cell-strong" data-label="Cliente">${p.nombre_cliente}</td>
        <td data-label="Pago">${formatMoney(p.monto)}</td>
        <td data-label="Estado">${badgeEstado(p.estado)}</td>
        <td data-label="Fecha">${formatFecha(p.fecha)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty-state">Todavía no hay pagos registrados.</td></tr>`;
}

// ============================================================================
// CLIENTES
// ============================================================================
async function cargarClientes() {
  const q = state.busqueda ? `?q=${encodeURIComponent(state.busqueda)}` : '';
  const clientes = await api(`/clientes${q}`);
  const tbody = document.getElementById('clientes-body');
  const vacio = document.getElementById('clientes-empty');

  vacio.hidden = clientes.length > 0;
  tbody.innerHTML = clientes.map(c => `
    <tr class="clickable" data-id="${c.id}">
      <td class="cell-strong" data-label="Nombre">${c.nombre}</td>
      <td data-label="Teléfono">${c.telefono}</td>
      <td data-label="Compras">${c.total_compras}</td>
      <td data-label="Total comprado">${formatMoney(c.monto_comprado)}</td>
      <td data-label="Pagos pendientes">${c.pagos_pendientes > 0 ? `<span class="badge badge-pendiente"><span class="badge-dot"></span>${c.pagos_pendientes}</span>` : '<span class="muted">—</span>'}</td>
      <td data-label="Acciones">
        <div class="row-actions">
          <button class="icon-btn" title="Editar" data-accion="editar-cliente" data-id="${c.id}">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="icon-btn" title="Eliminar" data-accion="eliminar-cliente" data-id="${c.id}">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('[data-accion]')) return;
      abrirDetalleCliente(tr.dataset.id);
    });
  });
  tbody.querySelectorAll('[data-accion="editar-cliente"]').forEach(b => b.addEventListener('click', () => abrirModalCliente(b.dataset.id)));
  tbody.querySelectorAll('[data-accion="eliminar-cliente"]').forEach(b => b.addEventListener('click', () => confirmarEliminarCliente(b.dataset.id)));
}

document.getElementById('btn-nuevo-cliente').addEventListener('click', () => abrirModalCliente());

function abrirModalCliente(id) {
  const esEdicion = Boolean(id);
  abrirModal(esEdicion ? 'Editar cliente' : 'Nuevo cliente', `
    <div class="form-error" id="form-error"></div>
    <div class="form-group">
      <label for="f-nombre">Nombre completo</label>
      <input type="text" id="f-nombre" placeholder="Ej. María Fernanda López">
    </div>
    <div class="form-group">
      <label for="f-telefono">Número de teléfono</label>
      <input type="tel" id="f-telefono" placeholder="Ej. 618-123-4567">
    </div>
    <div class="form-group">
      <label for="f-notas">Notas (opcional)</label>
      <textarea id="f-notas" rows="2" placeholder="Preferencias, tallas, referencias..."></textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary btn-block" id="btn-guardar">${esEdicion ? 'Guardar cambios' : 'Registrar cliente'}</button>
    </div>
  `);

  (async () => {
    if (esEdicion) {
      const c = await api(`/clientes/${id}`);
      document.getElementById('f-nombre').value = c.nombre;
      document.getElementById('f-telefono').value = c.telefono;
      document.getElementById('f-notas').value = c.notas || '';
    }
  })();

  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-guardar').addEventListener('click', async () => {
    const nombre = document.getElementById('f-nombre').value.trim();
    const telefono = document.getElementById('f-telefono').value.trim();
    const notas = document.getElementById('f-notas').value.trim();
    const error = document.getElementById('form-error');

    if (!nombre || !telefono) {
      error.textContent = 'El nombre y el teléfono son obligatorios.';
      error.classList.add('show');
      return;
    }
    try {
      if (esEdicion) {
        await api(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify({ nombre, telefono, notas }) });
        toast('Cliente actualizado', 'success');
      } else {
        await api('/clientes', { method: 'POST', body: JSON.stringify({ nombre, telefono, notas }) });
        toast('Cliente registrado', 'success');
      }
      cerrarModal();
      if (state.view === 'cliente-detalle') abrirDetalleCliente(state.clienteActualId); else cargarClientes();
    } catch (err) {
      error.textContent = err.message;
      error.classList.add('show');
    }
  });
}

function confirmarEliminarCliente(id) {
  abrirModal('Eliminar cliente', `
    <p class="muted" style="margin-top:0">Esta acción eliminará al cliente junto con todo su historial de compras y pagos. No se puede deshacer.</p>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-danger btn-block" id="btn-confirmar-eliminar">Sí, eliminar</button>
    </div>
  `);
  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-confirmar-eliminar').addEventListener('click', async () => {
    await api(`/clientes/${id}`, { method: 'DELETE' });
    toast('Cliente eliminado', 'success');
    cerrarModal();
    cargarClientes();
  });
}

// ---------------------------- Detalle de cliente ----------------------------
async function abrirDetalleCliente(id) {
  state.clienteActualId = id;
  mostrarVista('cliente-detalle');

  const c = await api(`/clientes/${id}`);
  document.getElementById('cliente-avatar').textContent = iniciales(c.nombre);
  document.getElementById('cliente-nombre').textContent = c.nombre;
  document.getElementById('cliente-telefono').textContent = c.telefono;

  const resumen = await api(`/clientes/${id}/resumen`);
  document.getElementById('cliente-total-comprado').textContent = formatMoney(resumen.total_comprado);
  document.getElementById('cliente-total-pagado').textContent = formatMoney(resumen.total_pagado);
  document.getElementById('cliente-saldo-pendiente').textContent = formatMoney(resumen.saldo_pendiente);

  document.getElementById('btn-editar-cliente').onclick = () => abrirModalCliente(id);
  document.getElementById('btn-eliminar-cliente').onclick = () => confirmarEliminarClienteYVolver(id);

  await cargarDetalleDeudaCliente(id);
}

async function cargarDetalleDeudaCliente(clienteId) {
  const detalles = await api(`/clientes/${clienteId}/detalles-deuda`);
  const bodyDeuda = document.getElementById('cliente-deuda-body');
  const emptyDeuda = document.getElementById('cliente-deuda-empty');

  bodyDeuda.innerHTML = detalles.length
    ? detalles.map(d => `
      <tr>
        <td>${d.descripcion_producto}</td>
        <td>${formatMoney(d.precio)}</td>
        <td>${formatMoney(d.total_pagado)}</td>
        <td>${formatMoney(d.pendiente)}</td>
      </tr>
    `).join('')
    : '';

  emptyDeuda.hidden = detalles.length > 0;
}

function abrirModalVentaDesdeCliente(clienteId) {
  abrirModal('Agregar venta', `
    <div class="form-error" id="form-error"></div>
    <input type="hidden" id="f-cliente-id" value="${clienteId}">
    <div class="form-group">
      <label for="f-producto">Descripción del producto</label>
      <input type="text" id="f-producto" placeholder="Ej. Playera azul talla M">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="f-precio">Precio</label>
        <input type="number" id="f-precio" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label for="f-fecha">Fecha</label>
        <input type="datetime-local" id="f-fecha">
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary btn-block" id="btn-guardar">Registrar venta</button>
    </div>
  `);

  const inputFecha = document.getElementById('f-fecha');
  inputFecha.value = new Date().toISOString().slice(0, 16);

  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-guardar').addEventListener('click', async () => {
    const producto = document.getElementById('f-producto').value.trim();
    const precio = parseFloat(document.getElementById('f-precio').value) || 0;
    const cliente_id = Number(document.getElementById('f-cliente-id').value);
    const fecha = document.getElementById('f-fecha').value.replace('T', ' ') + ':00';
    const error = document.getElementById('form-error');

    if (!producto) {
      error.textContent = 'La descripción del producto es obligatoria.';
      error.classList.add('show');
      return;
    }

    try {
      await api('/ventas', { method: 'POST', body: JSON.stringify({ cliente_id, descripcion_producto: producto, precio, fecha }) });
      toast('Venta registrada', 'success');
      cerrarModal();
      await cargarDetalleDeudaCliente(clienteId);
    } catch (err) {
      error.textContent = err.message;
      error.classList.add('show');
    }
  });
}

async function cargarVentasClienteParaPago(clienteId, selectEl) {
  if (!selectEl) return;
  if (!clienteId) {
    selectEl.innerHTML = '<option value="">Sin venta asociada</option>';
    return;
  }

  try {
    const ventas = await api(`/pagos/ventas-cliente/${encodeURIComponent(clienteId)}?saldo_pendiente=1`);
    if (ventas.length === 0) {
      selectEl.innerHTML = '<option value="">No hay ventas con saldo pendiente</option>';
      return;
    }

    selectEl.innerHTML = '<option value="">Selecciona una venta</option>' + ventas.map(v => `
      <option value="${v.id}" data-precio="${v.precio}" data-pendiente="${v.pendiente}">${v.descripcion_producto} · ${formatMoney(v.precio)} — ${formatMoney(v.pendiente)} pendiente</option>
    `).join('');
  } catch (_) {
    selectEl.innerHTML = '<option value="">No disponible</option>';
  }
}

function abrirModalPagoDesdeCliente(clienteId) {
  abrirModal('Registrar pago', `
    <div class="form-error" id="form-error"></div>
    <input type="hidden" id="f-cliente-id" value="${clienteId}">
    <div class="form-group">
      <label for="f-venta-pago">Venta</label>
      <select id="f-venta-pago"></select>
    </div>
    <div class="form-group">
      <label for="f-monto-pago">Monto</label>
      <input type="number" id="f-monto-pago" min="0" step="0.01" placeholder="0.00">
      <p class="field-hint" id="pago-monto-error"></p>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="f-forma-pago">Forma de pago</label>
        <select id="f-forma-pago">
          <option value="contado">Contado</option>
          <option value="credito">Crédito</option>
        </select>
      </div>
      <div class="form-group">
        <label for="f-metodo-pago">Método de pago</label>
        <select id="f-metodo-pago">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label for="f-fecha-pago">Fecha</label>
      <input type="datetime-local" id="f-fecha-pago">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary btn-block" id="btn-guardar">Registrar pago</button>
    </div>
  `);

  const inputFecha = document.getElementById('f-fecha-pago');
  const selectVenta = document.getElementById('f-venta-pago');
  const inputMonto = document.getElementById('f-monto-pago');
  const errorMonto = document.getElementById('pago-monto-error');
  const btnGuardar = document.getElementById('btn-guardar');

  inputFecha.value = new Date().toISOString().slice(0, 16);

  const validarMonto = async () => {
    const ventaId = selectVenta.value;
    const monto = Number(inputMonto.value) || 0;
    if (!ventaId) {
      errorMonto.textContent = '';
      btnGuardar.disabled = false;
      return;
    }

    try {
      const venta = await api(`/ventas/${ventaId}`);
      const detalles = await api(`/clientes/${clienteId}/detalles-deuda`);
      const detalle = detalles.find(d => d.venta_id === Number(ventaId));
      const pendiente = detalle ? detalle.pendiente : Number(venta.precio || 0);

      if (monto > pendiente) {
        errorMonto.textContent = `❌ Monto $${monto.toFixed(2)} excede pendiente $${pendiente.toFixed(2)}`;
        btnGuardar.disabled = true;
      } else {
        errorMonto.textContent = '';
        btnGuardar.disabled = false;
      }
    } catch (err) {
      errorMonto.textContent = 'No se pudo validar el monto.';
      btnGuardar.disabled = true;
    }
  };

  selectVenta.addEventListener('change', validarMonto);
  inputMonto.addEventListener('input', validarMonto);

  cargarVentasClienteParaPago(clienteId, selectVenta);

  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-guardar').addEventListener('click', async () => {
    const cliente_id = Number(document.getElementById('f-cliente-id').value);
    const venta_id = selectVenta.value ? Number(selectVenta.value) : null;
    const monto = Number(inputMonto.value) || 0;
    const forma_pago = document.getElementById('f-forma-pago').value;
    const metodo_pago = document.getElementById('f-metodo-pago').value;
    const fecha = inputFecha.value.replace('T', ' ') + ':00';
    const error = document.getElementById('form-error');

    if (!venta_id) {
      error.textContent = 'Selecciona una venta con saldo pendiente.';
      error.classList.add('show');
      return;
    }
    if (monto <= 0) {
      error.textContent = 'Ingresa un monto válido mayor a cero.';
      error.classList.add('show');
      return;
    }

    try {
      await api('/pagos', { method: 'POST', body: JSON.stringify({ cliente_id, venta_id, monto, forma_pago, metodo_pago, fecha }) });
      toast('Pago registrado', 'success');
      cerrarModal();
      await cargarDetalleDeudaCliente(clienteId);
    } catch (err) {
      error.textContent = err.message;
      error.classList.add('show');
    }
  });
}

function confirmarEliminarClienteYVolver(id) {
  abrirModal('Eliminar cliente', `
    <p class="muted" style="margin-top:0">Esta acción eliminará al cliente junto con todo su historial de compras y pagos. No se puede deshacer.</p>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-danger btn-block" id="btn-confirmar-eliminar">Sí, eliminar</button>
    </div>
  `);
  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-confirmar-eliminar').addEventListener('click', async () => {
    await api(`/clientes/${id}`, { method: 'DELETE' });
    toast('Cliente eliminado', 'success');
    cerrarModal();
    mostrarVista('clientes');
  });
}

document.getElementById('btn-volver-clientes').addEventListener('click', () => mostrarVista('clientes'));

document.getElementById('btn-nueva-venta-cliente')?.addEventListener('click', () => abrirModalVentaDesdeCliente(state.clienteActualId));
document.getElementById('btn-nuevo-pago-cliente')?.addEventListener('click', () => abrirModalPagoDesdeCliente(state.clienteActualId));

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ============================================================================
// VENTAS
// ============================================================================
document.querySelectorAll('#ventas-filtros .pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#ventas-filtros .pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filtroVentas = btn.dataset.filtro;
    cargarVentas();
  });
});

async function cargarVentas() {
  const q = state.busquedaVentas ? `&q=${encodeURIComponent(state.busquedaVentas)}` : '';
  const ventas = await api(`/ventas?filtro=${state.filtroVentas}${q}`);
  const tbody = document.getElementById('ventas-body');
  document.getElementById('ventas-empty').hidden = ventas.length > 0;

  tbody.innerHTML = ventas.map(v => `
    <tr>
      <td class="cell-strong" data-label="Cliente">${v.nombre_cliente}</td>
      <td data-label="Teléfono">${v.telefono}</td>
      <td data-label="Producto">${v.descripcion_producto}</td>
      <td data-label="Precio">${formatMoney(v.precio ?? v.monto)}</td>
      <td data-label="Fecha">${formatFecha(v.fecha)}</td>
      <td data-label="Acciones">
        <div class="row-actions">
          <button class="icon-btn" title="Editar" data-accion="editar-venta" data-id="${v.id}">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="icon-btn" title="Eliminar" data-accion="eliminar-venta" data-id="${v.id}">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-accion="editar-venta"]').forEach(b => b.addEventListener('click', () => abrirModalVenta(b.dataset.id)));
  tbody.querySelectorAll('[data-accion="eliminar-venta"]').forEach(b => b.addEventListener('click', () => confirmarEliminarVenta(b.dataset.id)));
}


function abrirModalVenta(id) {
  const esEdicion = Boolean(id);
  abrirModal(esEdicion ? 'Editar venta' : 'Nueva venta', `
    <div class="form-error" id="form-error"></div>
    ${!esEdicion ? `
    <div class="form-group">
      <label for="f-cliente">Cliente</label>
      <input type="text" id="f-cliente" placeholder="Escribe un nombre o teléfono" autocomplete="off">
      <input type="hidden" id="f-cliente-id">
      <div class="autocomplete-list" id="f-cliente-list"></div>
      <p class="field-hint">Selecciona un cliente existente o crea uno desde el detalle.</p>
    </div>` : ''}
    <div class="form-group">
      <label for="f-producto">Descripción del producto</label>
      <input type="text" id="f-producto" placeholder="Ej. Playera azul talla M">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="f-precio">Precio</label>
        <input type="number" id="f-precio" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label for="f-fecha">Fecha</label>
        <input type="datetime-local" id="f-fecha">
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary btn-block" id="btn-guardar">${esEdicion ? 'Guardar cambios' : 'Registrar venta'}</button>
    </div>
  `);

  const inputFecha = document.getElementById('f-fecha');
  const inputCliente = document.getElementById('f-cliente');
  const inputClienteId = document.getElementById('f-cliente-id');
  const listCliente = document.getElementById('f-cliente-list');

  const buscarClientes = async (q) => {
    if (!q) { listCliente.innerHTML = ''; return; }
    const resultados = await api(`/clientes/buscar?q=${encodeURIComponent(q)}`);
    listCliente.innerHTML = resultados.map(item => `<button type="button" class="autocomplete-item" data-id="${item.id}" data-label="${item.nombre} — ${item.telefono}">${item.nombre} <span>${item.telefono}</span></button>`).join('');
    listCliente.querySelectorAll('.autocomplete-item').forEach(btn => btn.addEventListener('click', () => {
      inputCliente.value = btn.dataset.label.replace(' — ', ' ');
      inputClienteId.value = btn.dataset.id;
      listCliente.innerHTML = '';
    }));
  };

  inputCliente?.addEventListener('input', () => {
    inputClienteId.value = '';
    buscarClientes(inputCliente.value.trim());
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group')) listCliente.innerHTML = '';
  });

  (async () => {
    if (esEdicion) {
      const v = await api(`/ventas/${id}`);
      document.getElementById('f-producto').value = v.descripcion_producto;
      document.getElementById('f-precio').value = v.precio ?? v.monto;
      inputFecha.value = v.fecha.replace(' ', 'T').slice(0, 16);
    } else {
      inputFecha.value = new Date().toISOString().slice(0, 16);
    }
  })();

  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-guardar').addEventListener('click', async () => {
    const producto = document.getElementById('f-producto').value.trim();
    const precio = parseFloat(document.getElementById('f-precio').value) || 0;
    const fecha = inputFecha.value.replace('T', ' ') + ':00';
    const error = document.getElementById('form-error');

    if (!producto) {
      error.textContent = 'La descripción del producto es obligatoria.';
      error.classList.add('show');
      return;
    }

    try {
      if (esEdicion) {
        await api(`/ventas/${id}`, { method: 'PUT', body: JSON.stringify({ descripcion_producto: producto, precio, fecha }) });
        toast('Venta actualizada', 'success');
      } else {
        const cliente_id = inputClienteId.value || '';
        if (!cliente_id) {
          error.textContent = 'Selecciona un cliente para registrar la venta.';
          error.classList.add('show');
          return;
        }
        await api('/ventas', { method: 'POST', body: JSON.stringify({ cliente_id, descripcion_producto: producto, precio, fecha }) });
        toast('Venta registrada', 'success');
      }
      cerrarModal();
      if (state.view === 'cliente-detalle') abrirDetalleCliente(state.clienteActualId); else cargarVentas();
    } catch (err) {
      error.textContent = err.message;
      error.classList.add('show');
    }
  });
}

function confirmarEliminarVenta(id) {
  abrirModal('Eliminar venta', `
    <p class="muted" style="margin-top:0">Esta venta se eliminará de forma permanente.</p>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-danger btn-block" id="btn-confirmar-eliminar">Sí, eliminar</button>
    </div>
  `);
  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-confirmar-eliminar').addEventListener('click', async () => {
    await api(`/ventas/${id}`, { method: 'DELETE' });
    toast('Venta eliminada', 'success');
    cerrarModal();
    cargarVentas();
  });
}

// ============================================================================
// PAGOS
// ============================================================================
document.querySelectorAll('#pagos-filtros .pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#pagos-filtros .pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filtroPagos = btn.dataset.estado;
    cargarPagos();
  });
});

async function cargarPagos() {
  const filtro = state.filtroPagos ? `?estado=${state.filtroPagos}` : '?';
  const q = state.busquedaPagos ? `&q=${encodeURIComponent(state.busquedaPagos)}` : '';
  const pagos = await api(`/pagos${filtro}${q}`);
  const tbody = document.getElementById('pagos-body');
  document.getElementById('pagos-empty').hidden = pagos.length > 0;

  tbody.innerHTML = pagos.map(p => `
    <tr>
      <td class="cell-strong" data-label="Cliente">${p.nombre_cliente}<span class="cell-sub">${p.descripcion_producto || 'Pago general'}</span></td>
      <td data-label="Pago">${formatMoney(p.monto)}</td>
      <td data-label="Forma">${capitaliza(p.forma_pago)}</td>
      <td data-label="Método">${capitaliza(p.metodo_pago)}</td>
      <td data-label="Estado">${badgeEstado(p.estado)}</td>
      <td data-label="Fecha">${formatFecha(p.fecha)}</td>
      <td data-label="Acciones">
        <div class="row-actions">
          <button class="icon-btn" title="Editar" data-accion="editar-pago" data-id="${p.id}">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="icon-btn" title="Eliminar" data-accion="eliminar-pago" data-id="${p.id}">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-accion="editar-pago"]').forEach(b => b.addEventListener('click', () => abrirModalPago(b.dataset.id)));
  tbody.querySelectorAll('[data-accion="eliminar-pago"]').forEach(b => b.addEventListener('click', () => confirmarEliminarPago(b.dataset.id)));
}


async function cargarVentasClienteParaPago(clienteId, selectEl) {
  if (!selectEl) return;

  if (!clienteId) {
    selectEl.innerHTML = '<option value="">Sin venta asociada</option>';
    return;
  }

  try {
    const ventas = await api(`/pagos/ventas-cliente/${encodeURIComponent(clienteId)}`);
    selectEl.innerHTML = '<option value="">Sin venta asociada</option>' + ventas.map(v => `
      <option value="${v.id}">${v.descripcion_producto} · ${formatMoney(v.precio ?? v.monto)}</option>
    `).join('');
  } catch (_) {
    selectEl.innerHTML = '<option value="">No disponible</option>';
  }
}

function abrirModalPago(id) {
  const esEdicion = Boolean(id);
  abrirModal(esEdicion ? 'Editar pago' : 'Nuevo pago', `
    <div class="form-error" id="form-error"></div>
    ${!esEdicion ? `
    <div class="form-group">
      <label for="f-cliente">Cliente</label>
      <input type="text" id="f-cliente" placeholder="Busca por nombre o teléfono" autocomplete="off">
      <input type="hidden" id="f-cliente-id">
      <div class="autocomplete-list" id="f-cliente-list"></div>
    </div>` : ''}
    <div class="form-group">
      <label for="f-venta">Venta asociada</label>
      <select id="f-venta">
        <option value="">Sin venta asociada</option>
      </select>
      <p class="field-hint">Si eliges una venta, el estado del pago se calculará automáticamente.</p>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="f-monto">Monto</label>
        <input type="number" id="f-monto" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label for="f-fecha">Fecha</label>
        <input type="datetime-local" id="f-fecha">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="f-forma">Forma de pago</label>
        <select id="f-forma">
          <option value="contado">Contado</option>
          <option value="credito">Crédito</option>
        </select>
      </div>
      <div class="form-group">
        <label for="f-metodo">Método de pago</label>
        <select id="f-metodo">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
        </select>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary btn-block" id="btn-guardar">${esEdicion ? 'Guardar cambios' : 'Registrar pago'}</button>
    </div>
  `);

  const inputFecha = document.getElementById('f-fecha');
  const inputCliente = document.getElementById('f-cliente');
  const inputClienteId = document.getElementById('f-cliente-id');
  const listCliente = document.getElementById('f-cliente-list');
  const selectVenta = document.getElementById('f-venta');

  const buscarClientes = async (q) => {
    if (!q) { listCliente.innerHTML = ''; return; }
    const resultados = await api(`/clientes/buscar?q=${encodeURIComponent(q)}`);
    listCliente.innerHTML = resultados.map(item => `<button type="button" class="autocomplete-item" data-id="${item.id}" data-label="${item.nombre} — ${item.telefono}">${item.nombre} <span>${item.telefono}</span></button>`).join('');
    listCliente.querySelectorAll('.autocomplete-item').forEach(btn => btn.addEventListener('click', () => {
      inputCliente.value = btn.dataset.label.replace(' — ', ' ');
      inputClienteId.value = btn.dataset.id;
      listCliente.innerHTML = '';
      cargarVentasClienteParaPago(btn.dataset.id, selectVenta);
    }));
  };

  inputCliente?.addEventListener('input', () => {
    inputClienteId.value = '';
    cargarVentasClienteParaPago('', selectVenta);
    buscarClientes(inputCliente.value.trim());
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group')) listCliente.innerHTML = '';
  });

  (async () => {
    if (esEdicion) {
      const p = await api(`/pagos/${id}`);
      document.getElementById('f-monto').value = p.monto;
      inputFecha.value = p.fecha.replace(' ', 'T').slice(0, 16);
      document.getElementById('f-forma').value = p.forma_pago;
      document.getElementById('f-metodo').value = p.metodo_pago;
      if (inputCliente) inputCliente.value = p.nombre_cliente || '';
      if (inputClienteId) inputClienteId.value = p.cliente_id || '';
      await cargarVentasClienteParaPago(p.cliente_id, selectVenta);
      if (selectVenta) selectVenta.value = p.venta_id || '';
    } else {
      inputFecha.value = new Date().toISOString().slice(0, 16);
      await cargarVentasClienteParaPago('', selectVenta);
    }
  })();

  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-guardar').addEventListener('click', async () => {
    const monto = parseFloat(document.getElementById('f-monto').value) || 0;
    const fecha = inputFecha.value.replace('T', ' ') + ':00';
    const forma_pago = document.getElementById('f-forma').value;
    const metodo_pago = document.getElementById('f-metodo').value;
    const venta_id = selectVenta?.value ? Number(selectVenta.value) : null;
    const error = document.getElementById('form-error');

    try {
      if (esEdicion) {
        await api(`/pagos/${id}`, { method: 'PUT', body: JSON.stringify({ monto, fecha, forma_pago, metodo_pago, venta_id }) });
        toast('Pago actualizado', 'success');
      } else {
        const cliente_id = inputClienteId.value || '';
        if (!cliente_id) {
          error.textContent = 'Selecciona un cliente para registrar el pago.';
          error.classList.add('show');
          return;
        }
        await api('/pagos', { method: 'POST', body: JSON.stringify({ cliente_id, venta_id, monto, forma_pago, metodo_pago, fecha }) });
        toast('Pago registrado', 'success');
      }
      cerrarModal();
      if (state.view === 'cliente-detalle') abrirDetalleCliente(state.clienteActualId); else cargarPagos();
    } catch (err) {
      error.textContent = err.message;
      error.classList.add('show');
    }
  });
}

function confirmarEliminarPago(id) {
  abrirModal('Eliminar pago', `
    <p class="muted" style="margin-top:0">Este pago se eliminará de forma permanente.</p>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-danger btn-block" id="btn-confirmar-eliminar">Sí, eliminar</button>
    </div>
  `);
  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-confirmar-eliminar').addEventListener('click', async () => {
    await api(`/pagos/${id}`, { method: 'DELETE' });
    toast('Pago eliminado', 'success');
    cerrarModal();
    cargarPagos();
  });
}

// ============================================================================
// MI CUENTA (portal del cliente)
// ============================================================================
async function cargarMiCuenta() {
  const d = await api('/auth/mi-cuenta');

  document.getElementById('micuenta-avatar').textContent = iniciales(d.cliente.nombre);
  document.getElementById('micuenta-nombre').textContent = d.cliente.nombre;
  document.getElementById('micuenta-telefono').textContent = d.cliente.telefono;
  document.getElementById('micuenta-total-comprado').textContent = formatMoney(d.total_comprado);
  document.getElementById('micuenta-total-pagado').textContent = formatMoney(d.total_pagado);
  document.getElementById('micuenta-saldo-pendiente').textContent = formatMoney(d.saldo_pendiente);

  const bodyDeuda = document.getElementById('micuenta-deuda-body');
  const emptyDeuda = document.getElementById('micuenta-deuda-empty');
  bodyDeuda.innerHTML = d.detalles_deuda.map(det => `
    <tr>
      <td>${det.descripcion_producto}</td>
      <td>${formatMoney(det.precio)}</td>
      <td>${formatMoney(det.total_pagado)}</td>
      <td>${det.pendiente > 0 ? `<span class="badge badge-pendiente"><span class="badge-dot"></span>${formatMoney(det.pendiente)}</span>` : '<span class="badge badge-pagado"><span class="badge-dot"></span>Liquidado</span>'}</td>
    </tr>
  `).join('');
  emptyDeuda.hidden = d.detalles_deuda.length > 0;

  const bodyCompras = document.getElementById('micuenta-compras-body');
  const emptyCompras = document.getElementById('micuenta-compras-empty');
  bodyCompras.innerHTML = d.compras.map(v => `
    <tr>
      <td>${v.descripcion_producto}</td>
      <td>${formatMoney(v.precio ?? v.monto)}</td>
      <td>${formatFecha(v.fecha)}</td>
    </tr>
  `).join('');
  emptyCompras.hidden = d.compras.length > 0;

  const bodyPagos = document.getElementById('micuenta-pagos-body');
  const emptyPagos = document.getElementById('micuenta-pagos-empty');
  bodyPagos.innerHTML = d.pagos.map(p => `
    <tr>
      <td>${p.descripcion_producto || 'Pago general'}</td>
      <td>${formatMoney(p.monto)}</td>
      <td>${badgeEstado(p.estado)}</td>
      <td>${formatFecha(p.fecha)}</td>
    </tr>
  `).join('');
  emptyPagos.hidden = d.pagos.length > 0;
}

// ============================================================================
// USUARIOS (gestión de accesos, solo admin)
// ============================================================================
async function cargarUsuarios() {
  const usuarios = await api('/auth/usuarios');
  const tbody = document.getElementById('usuarios-body');
  document.getElementById('usuarios-empty').hidden = usuarios.length > 0;

  tbody.innerHTML = usuarios.map(u => `
    <tr>
      <td class="cell-strong">${u.username}</td>
      <td>${u.rol === 'admin'
        ? '<span class="badge badge-abono"><span class="badge-dot"></span>Administrador</span>'
        : '<span class="badge badge-cliente"><span class="badge-dot"></span>Cliente</span>'}</td>
      <td>${u.rol === 'cliente' ? `${u.cliente_nombre || '—'} <span class="cell-sub">${u.cliente_telefono || ''}</span>` : '<span class="muted">—</span>'}</td>
      <td>${formatFecha(u.creado_en)}</td>
      <td>
        <div class="row-actions">
          ${u.rol === 'cliente' ? `
          <button class="icon-btn" title="Cambiar contraseña" data-accion="pass-usuario" data-id="${u.id}">
            <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/></svg>
          </button>
          <button class="icon-btn" title="Eliminar acceso" data-accion="eliminar-usuario" data-id="${u.id}">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>` : '<span class="muted">—</span>'}
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-accion="pass-usuario"]').forEach(b => b.addEventListener('click', () => abrirModalPassword(b.dataset.id)));
  tbody.querySelectorAll('[data-accion="eliminar-usuario"]').forEach(b => b.addEventListener('click', () => confirmarEliminarUsuario(b.dataset.id)));
}

document.getElementById('btn-nuevo-usuario')?.addEventListener('click', abrirModalUsuario);

async function abrirModalUsuario() {
  const clientes = await api('/clientes');
  abrirModal('Nuevo acceso de cliente', `
    <div class="form-error" id="form-error"></div>
    <div class="form-group">
      <label for="f-usuario-cliente">Cliente</label>
      <select id="f-usuario-cliente">
        <option value="">Selecciona un cliente...</option>
        ${clientes.map(c => `<option value="${c.id}">${c.nombre} — ${c.telefono}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label for="f-usuario-username">Nombre de usuario</label>
      <input type="text" id="f-usuario-username" placeholder="Ej. maria.fernanda" autocomplete="off">
      <p class="field-hint">El cliente usará este nombre para iniciar sesión.</p>
    </div>
    <div class="form-group">
      <label for="f-usuario-password">Contraseña</label>
      <input type="password" id="f-usuario-password" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary btn-block" id="btn-guardar">Crear acceso</button>
    </div>
  `);

  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-guardar').addEventListener('click', async () => {
    const cliente_id = document.getElementById('f-usuario-cliente').value;
    const username = document.getElementById('f-usuario-username').value.trim();
    const password = document.getElementById('f-usuario-password').value;
    const error = document.getElementById('form-error');

    if (!cliente_id || !username || !password) {
      error.textContent = 'Completa todos los campos.';
      error.classList.add('show');
      return;
    }
    if (password.length < 6) {
      error.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      error.classList.add('show');
      return;
    }

    try {
      await api('/auth/usuarios', { method: 'POST', body: JSON.stringify({ cliente_id, username, password }) });
      toast('Acceso creado', 'success');
      cerrarModal();
      cargarUsuarios();
    } catch (err) {
      error.textContent = err.message;
      error.classList.add('show');
    }
  });
}

function abrirModalPassword(id) {
  abrirModal('Cambiar contraseña', `
    <div class="form-error" id="form-error"></div>
    <div class="form-group">
      <label for="f-pass-nueva">Nueva contraseña</label>
      <input type="password" id="f-pass-nueva" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary btn-block" id="btn-guardar">Guardar contraseña</button>
    </div>
  `);

  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-guardar').addEventListener('click', async () => {
    const password = document.getElementById('f-pass-nueva').value;
    const error = document.getElementById('form-error');
    if (!password || password.length < 6) {
      error.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      error.classList.add('show');
      return;
    }
    try {
      await api(`/auth/usuarios/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) });
      toast('Contraseña actualizada', 'success');
      cerrarModal();
    } catch (err) {
      error.textContent = err.message;
      error.classList.add('show');
    }
  });
}

function confirmarEliminarUsuario(id) {
  abrirModal('Eliminar acceso', `
    <p class="muted" style="margin-top:0">Este cliente ya no podrá iniciar sesión en el portal.</p>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-danger btn-block" id="btn-confirmar-eliminar">Sí, eliminar</button>
    </div>
  `);
  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('btn-confirmar-eliminar').addEventListener('click', async () => {
    await api(`/auth/usuarios/${id}`, { method: 'DELETE' });
    toast('Acceso eliminado', 'success');
    cerrarModal();
    cargarUsuarios();
  });
}

// ============================================================================
// MODAL genérico
// ============================================================================
function abrirModal(titulo, htmlBody) {
  document.getElementById('modal-title').textContent = titulo;
  document.getElementById('modal-body').innerHTML = htmlBody;
  document.getElementById('modal-overlay').classList.add('open');
}
function cerrarModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}
document.getElementById('modal-close').addEventListener('click', cerrarModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') cerrarModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarModal();
});

// ============================================================================
// Arranque
// ============================================================================
(async function init() {
  try {
    const { usuario } = await api('/auth/me');
    entrarApp(usuario);
  } catch (_) {
    mostrarLogin();
  }
})();
