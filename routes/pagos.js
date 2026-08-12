const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/pagos?estado=pagado|abono|pendiente&q=busqueda
router.get('/', (req, res) => {
  const estado = req.query.estado;
  const buscar = (req.query.q || '').trim();

  let sql = `
    SELECT p.*, c.nombre AS nombre_cliente, c.telefono, v.descripcion_producto
    FROM pagos p
    JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN ventas v ON v.id = p.venta_id
    WHERE 1=1
  `;
  const params = [];
  if (estado) {
    sql += ` AND p.estado = ?`;
    params.push(estado);
  }
  if (buscar) {
    sql += ` AND (c.nombre LIKE ? OR c.telefono LIKE ?)`;
    params.push(`%${buscar}%`, `%${buscar}%`);
  }
  sql += ` ORDER BY p.fecha DESC`;

  res.json(db.prepare(sql).all(...params));
});

// GET /api/pagos/ventas-cliente/:cliente_id -> ventas de un cliente para asociar un pago
router.get('/ventas-cliente/:cliente_id', (req, res) => {
  const cliente_id = req.params.cliente_id;
  const soloPendientes = req.query.saldo_pendiente === '1';

  let sql = `
    SELECT
      v.id,
      v.descripcion_producto,
      v.precio,
      v.fecha,
      COALESCE(SUM(p.monto), 0) AS total_pagado,
      v.precio - COALESCE(SUM(p.monto), 0) AS pendiente
    FROM ventas v
    LEFT JOIN pagos p ON p.venta_id = v.id
    WHERE v.cliente_id = ?
    GROUP BY v.id
  `;

  if (soloPendientes) {
    sql += ` HAVING v.precio - COALESCE(SUM(p.monto), 0) > 0`;
  }

  sql += ` ORDER BY v.fecha DESC`;
  const ventas = db.prepare(sql).all(cliente_id);
  res.json(ventas.map(v => ({
    id: v.id,
    descripcion_producto: v.descripcion_producto,
    precio: Number(v.precio || 0),
    fecha: v.fecha,
    total_pagado: Number(v.total_pagado || 0),
    pendiente: Number(v.pendiente || 0)
  })));
});

// GET /api/pagos/:id
router.get('/:id', (req, res) => {
  const pago = db.prepare(`
    SELECT p.*, c.nombre AS nombre_cliente, c.telefono
    FROM pagos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?
  `).get(req.params.id);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  res.json(pago);
});

// POST /api/pagos -> crear pago.
router.post('/', (req, res) => {
  const { cliente_id, venta_id, monto, forma_pago, metodo_pago, fecha } = req.body;

  if (!cliente_id) {
    return res.status(400).json({ error: 'Se requiere cliente_id' });
  }
  if (monto === undefined || monto === null || Number.isNaN(Number(monto))) {
    return res.status(400).json({ error: 'Se requiere un monto válido' });
  }
  const montoPago = Number(monto);
  if (montoPago < 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor o igual a 0' });
  }
  if (!forma_pago || !metodo_pago) {
    return res.status(400).json({ error: 'forma_pago y metodo_pago son obligatorios' });
  }
  if (!['contado', 'credito'].includes(forma_pago)) return res.status(400).json({ error: 'forma_pago inválida' });
  if (!['efectivo', 'tarjeta'].includes(metodo_pago)) return res.status(400).json({ error: 'metodo_pago inválido' });

  if (venta_id) {
    const venta = db.prepare('SELECT precio FROM ventas WHERE id = ?').get(venta_id);
    if (!venta) return res.status(400).json({ error: 'Venta no encontrada' });
    const totalPagado = db.prepare('SELECT COALESCE(SUM(monto), 0) AS total FROM pagos WHERE venta_id = ?').get(venta_id).total;
    const pendiente = Number(venta.precio || 0) - Number(totalPagado || 0);
    if (montoPago > pendiente) {
      return res.status(400).json({ error: `Monto $${montoPago.toFixed(2)} excede pendiente $${pendiente.toFixed(2)}` });
    }
  }

  const fechaPago = fecha || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const estado = calcularEstadoPago(venta_id || null, montoPago || 0);
  const info = db.prepare(`
    INSERT INTO pagos (cliente_id, venta_id, monto, forma_pago, metodo_pago, estado, fecha)
    VALUES (?,?,?,?,?,?,?)
  `).run(cliente_id, venta_id || null, montoPago, forma_pago, metodo_pago, estado, fechaPago);

  const pago = db.prepare(`
    SELECT p.*, c.nombre AS nombre_cliente, c.telefono
    FROM pagos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(pago);
});

// PUT /api/pagos/:id -> editar pago
router.put('/:id', (req, res) => {
  const existe = db.prepare('SELECT * FROM pagos WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ error: 'Pago no encontrado' });
  const { monto, forma_pago, metodo_pago, fecha, venta_id } = req.body;
  const estado = calcularEstadoPago(venta_id !== undefined ? venta_id : existe.venta_id, monto ?? existe.monto, req.params.id);

  db.prepare(`
    UPDATE pagos SET monto = ?, forma_pago = ?, metodo_pago = ?, estado = ?, fecha = ?, venta_id = ?
    WHERE id = ?
  `).run(
    monto ?? existe.monto,
    forma_pago ?? existe.forma_pago,
    metodo_pago ?? existe.metodo_pago,
    estado,
    fecha ?? existe.fecha,
    venta_id !== undefined ? venta_id : existe.venta_id,
    req.params.id
  );

  const pago = db.prepare(`
    SELECT p.*, c.nombre AS nombre_cliente, c.telefono
    FROM pagos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?
  `).get(req.params.id);
  res.json(pago);
});

// DELETE /api/pagos/:id
router.delete('/:id', (req, res) => {
  const existe = db.prepare('SELECT * FROM pagos WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ error: 'Pago no encontrado' });
  db.prepare('DELETE FROM pagos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function calcularEstadoPago(ventaId, monto, pagoId = null) {
  if (!ventaId) return 'pendiente';
  const venta = db.prepare('SELECT precio FROM ventas WHERE id = ?').get(ventaId);
  if (!venta) return 'pendiente';
  const totalPagado = db.prepare('SELECT COALESCE(SUM(monto), 0) AS total FROM pagos WHERE venta_id = ? AND id != ?').get(ventaId, pagoId || -1).total;
  const totalVenta = Number(venta.precio || 0);
  const pagado = Number(totalPagado) + Number(monto || 0);
  if (pagado >= totalVenta) return 'pagado';
  if (pagado > 0) return 'abono';
  return 'pendiente';
}

module.exports = router;
