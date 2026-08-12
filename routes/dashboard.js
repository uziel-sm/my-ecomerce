const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const totalClientes = db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n;

  const ventasHoy = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(precio),0) AS total FROM ventas WHERE date(fecha) = date('now','localtime')`).get();
  const ventasMes = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(precio),0) AS total FROM ventas WHERE strftime('%Y-%m', fecha) = strftime('%Y-%m','now','localtime')`).get();
  const ventasTotal = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(precio),0) AS total FROM ventas`).get();

  const pagadoTotal = db.prepare(`SELECT COALESCE(SUM(monto),0) AS total FROM pagos WHERE estado != 'pendiente'`).get().total;
  const pendientes = db.prepare(`SELECT COUNT(*) AS n FROM pagos WHERE estado = 'pendiente'`).get().n;
  const abonos = db.prepare(`SELECT COUNT(*) AS n FROM pagos WHERE estado = 'abono'`).get().n;
  const pagados = db.prepare(`SELECT COUNT(*) AS n FROM pagos WHERE estado = 'pagado'`).get().n;

  const porCobrar = ventasTotal.total - pagadoTotal;

  const ultimasVentas = db.prepare(`
    SELECT v.id, v.descripcion_producto, v.precio, v.fecha, c.nombre AS nombre_cliente
    FROM ventas v JOIN clientes c ON c.id = v.cliente_id
    ORDER BY v.fecha DESC LIMIT 5
  `).all();

  const ultimosPagos = db.prepare(`
    SELECT p.id, p.monto, p.estado, p.metodo_pago, p.fecha, c.nombre AS nombre_cliente
    FROM pagos p JOIN clientes c ON c.id = p.cliente_id
    ORDER BY p.fecha DESC LIMIT 5
  `).all();

  // Ventas de los últimos 7 días para la gráfica de tendencia
  const tendencia = db.prepare(`
    SELECT date(fecha) AS dia, COALESCE(SUM(precio),0) AS total
    FROM ventas
    WHERE date(fecha) >= date('now','localtime','-6 days')
    GROUP BY date(fecha)
  `).all();

  res.json({
    total_clientes: totalClientes,
    ventas_hoy: ventasHoy,
    ventas_mes: ventasMes,
    ventas_total: ventasTotal,
    monto_pagado: pagadoTotal,
    monto_por_cobrar: porCobrar,
    pagos_pendientes: pendientes,
    pagos_abono: abonos,
    pagos_pagados: pagados,
    ultimas_ventas: ultimasVentas,
    ultimos_pagos: ultimosPagos,
    tendencia
  });
});

module.exports = router;
