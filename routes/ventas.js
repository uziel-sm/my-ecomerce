const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Construye la condición SQL de fecha según el filtro solicitado
function condicionFiltro(filtro) {
  switch (filtro) {
    case 'semana':
      return `date(v.fecha) >= date('now', 'localtime', '-7 days')`;
    case 'mes':
      return `strftime('%Y-%m', v.fecha) = strftime('%Y-%m', 'now', 'localtime')`;
    case 'anio':
      return `strftime('%Y', v.fecha) = strftime('%Y', 'now', 'localtime')`;
    case 'recientes':
    default:
      return `1=1`;
  }
}

// GET /api/ventas?filtro=recientes|semana|mes|anio&q=busqueda
router.get('/', (req, res) => {
  const filtro = req.query.filtro || 'recientes';
  const buscar = (req.query.q || '').trim();
  const cond = condicionFiltro(filtro);

  let sql = `
    SELECT v.*, c.nombre AS nombre_cliente, c.telefono
    FROM ventas v
    JOIN clientes c ON c.id = v.cliente_id
    WHERE ${cond}
  `;
  const params = [];
  if (buscar) {
    sql += ` AND (c.nombre LIKE ? OR c.telefono LIKE ? OR v.descripcion_producto LIKE ?)`;
    params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`);
  }
  sql += ` ORDER BY v.fecha DESC`;
  if (filtro === 'recientes') sql += ` LIMIT 30`;

  const ventas = db.prepare(sql).all(...params);
  res.json(ventas);
});

// GET /api/ventas/:id
router.get('/:id', (req, res) => {
  const venta = db.prepare(`
    SELECT v.*, c.nombre AS nombre_cliente, c.telefono
    FROM ventas v JOIN clientes c ON c.id = v.cliente_id
    WHERE v.id = ?
  `).get(req.params.id);
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  res.json(venta);
});

// POST /api/ventas -> crear venta. Si el cliente (por teléfono) no existe, se crea.
router.post('/', (req, res) => {
  const { cliente_id, descripcion_producto, precio, fecha } = req.body;
  if (!descripcion_producto) return res.status(400).json({ error: 'La descripción del producto es obligatoria' });

  const idCliente = cliente_id;
  if (!idCliente) {
    return res.status(400).json({ error: 'Se requiere cliente_id' });
  }

  const fechaVenta = fecha || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const info = db.prepare('INSERT INTO ventas (cliente_id, descripcion_producto, precio, fecha) VALUES (?,?,?,?)')
    .run(idCliente, descripcion_producto.trim(), precio || 0, fechaVenta);

  const venta = db.prepare(`
    SELECT v.*, c.nombre AS nombre_cliente, c.telefono
    FROM ventas v JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(venta);
});

// PUT /api/ventas/:id -> editar venta
router.put('/:id', (req, res) => {
  const existe = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ error: 'Venta no encontrada' });
  const { descripcion_producto, precio, fecha } = req.body;
  db.prepare('UPDATE ventas SET descripcion_producto = ?, precio = ?, fecha = ? WHERE id = ?')
    .run(
      descripcion_producto ?? existe.descripcion_producto,
      precio ?? existe.precio,
      fecha ?? existe.fecha,
      req.params.id
    );
  const venta = db.prepare(`
    SELECT v.*, c.nombre AS nombre_cliente, c.telefono
    FROM ventas v JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?
  `).get(req.params.id);
  res.json(venta);
});

// DELETE /api/ventas/:id
router.delete('/:id', (req, res) => {
  const existe = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ error: 'Venta no encontrada' });
  db.prepare('DELETE FROM ventas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
