const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/clientes  -> lista todos los clientes con resumen de compras/pagos
router.get('/', (req, res) => {
  const buscar = (req.query.q || '').trim();
  let clientes;
  if (buscar) {
    clientes = db.prepare(
      `SELECT * FROM clientes WHERE nombre LIKE ? OR telefono LIKE ? ORDER BY nombre ASC`
    ).all(`%${buscar}%`, `%${buscar}%`);
  } else {
    clientes = db.prepare(`SELECT * FROM clientes ORDER BY nombre ASC`).all();
  }

  const totalComprasStmt = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(precio),0) AS total FROM ventas WHERE cliente_id = ?`);
  const totalPagadoStmt = db.prepare(`SELECT COALESCE(SUM(monto),0) AS total FROM pagos WHERE cliente_id = ? AND estado != 'pendiente'`);
  const pendienteStmt = db.prepare(`SELECT COUNT(*) AS n FROM pagos WHERE cliente_id = ? AND estado != 'pagado'`);

  const data = clientes.map(c => {
    const compras = totalComprasStmt.get(c.id);
    const pagado = totalPagadoStmt.get(c.id);
    const pend = pendienteStmt.get(c.id);
    return {
      ...c,
      total_compras: compras.n,
      monto_comprado: compras.total,
      monto_pagado: pagado.total,
      pagos_pendientes: pend.n
    };
  });

  res.json(data);
});

// GET /api/clientes/buscar?q=term
router.get('/buscar', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);

  const clientes = db.prepare(`
    SELECT id, nombre, telefono
    FROM clientes
    WHERE nombre LIKE ? OR telefono LIKE ?
    ORDER BY nombre ASC
    LIMIT 8
  `).all(`%${q}%`, `%${q}%`);

  res.json(clientes);
});

// GET /api/clientes/:id -> detalle de un cliente
router.get('/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(cliente);
});

// GET /api/clientes/:id/detalles-deuda -> resumen de deuda por venta
router.get('/:id/detalles-deuda', (req, res) => {
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const detalles = db.prepare(`
    SELECT
      v.id AS venta_id,
      v.descripcion_producto,
      v.precio,
      COALESCE(SUM(p.monto), 0) AS total_pagado,
      v.precio - COALESCE(SUM(p.monto), 0) AS pendiente
    FROM ventas v
    LEFT JOIN pagos p ON p.venta_id = v.id
    WHERE v.cliente_id = ?
    GROUP BY v.id
    ORDER BY v.fecha DESC
  `).all(req.params.id);

  res.json(detalles.map(d => ({
    venta_id: d.venta_id,
    descripcion_producto: d.descripcion_producto,
    precio: Number(d.precio || 0),
    total_pagado: Number(d.total_pagado || 0),
    pendiente: Number(d.pendiente || 0)
  })));
});

// GET /api/clientes/:id/compras -> historial de compras del cliente
router.get('/:id/compras', (req, res) => {
  const compras = db.prepare('SELECT * FROM ventas WHERE cliente_id = ? ORDER BY fecha DESC').all(req.params.id);
  res.json(compras);
});

// GET /api/clientes/:id/pagos -> historial de pagos del cliente
router.get('/:id/pagos', (req, res) => {
  const pagos = db.prepare(`
    SELECT p.*, v.descripcion_producto
    FROM pagos p
    LEFT JOIN ventas v ON v.id = p.venta_id
    WHERE p.cliente_id = ?
    ORDER BY p.fecha DESC
  `).all(req.params.id);
  res.json(pagos);
});
// GET /api/clientes/:id/resumen
router.get('/:id/resumen', (req, res) => {
  const cliente = db.prepare('SELECT id, nombre, telefono FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const compraTotal = db.prepare('SELECT COALESCE(SUM(precio), 0) AS total FROM ventas WHERE cliente_id = ?').get(req.params.id).total;
  const pagosTotal = db.prepare('SELECT COALESCE(SUM(monto), 0) AS total FROM pagos WHERE cliente_id = ?').get(req.params.id).total;
  const saldoPendiente = Number(compraTotal) - Number(pagosTotal);

  res.json({
    cliente,
    total_comprado: Number(compraTotal),
    total_pagado: Number(pagosTotal),
    saldo_pendiente: Number(saldoPendiente)
  });
});
// POST /api/clientes -> crear cliente
router.post('/', (req, res) => {
  const { nombre, telefono, notas } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
  const info = db.prepare('INSERT INTO clientes (nombre, telefono, notas) VALUES (?,?,?)').run(nombre.trim(), telefono.trim(), notas || '');
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(cliente);
});

// PUT /api/clientes/:id -> editar cliente
router.put('/:id', (req, res) => {
  const { nombre, telefono, notas } = req.body;
  const existe = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ error: 'Cliente no encontrado' });
  db.prepare('UPDATE clientes SET nombre = ?, telefono = ?, notas = ? WHERE id = ?')
    .run(nombre ?? existe.nombre, telefono ?? existe.telefono, notas ?? existe.notas, req.params.id);
  res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id));
});

// DELETE /api/clientes/:id -> eliminar cliente (y sus ventas/pagos por cascada)
router.delete('/:id', (req, res) => {
  const existe = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ error: 'Cliente no encontrado' });
  db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
