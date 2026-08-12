// =============================================================================
// MARIANEE SHOP · Autenticación (sesiones con cookie)
// =============================================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../db/database');

// Helper: devuelve la forma pública del usuario de sesión
function perfilSesion(user) {
  let nombre = user.username;
  if (user.rol === 'cliente' && user.cliente_id) {
    const cliente = db.prepare('SELECT nombre FROM clientes WHERE id = ?').get(user.cliente_id);
    if (cliente) nombre = cliente.nombre;
  }
  return { ...user, nombre };
}

// Requiere sesión iniciada
function requiereAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Inicia sesión para continuar' });
}

// Requiere rol administrador
function requiereAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.rol === 'admin') return next();
  return res.status(403).json({ error: 'No tienes permisos para esta acción' });
}

// POST /api/auth/login  -> iniciar sesión
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE username = ? COLLATE NOCASE')
    .get(String(username).trim());

  if (!usuario || !bcrypt.compareSync(String(password), usuario.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  req.session.user = {
    id: usuario.id,
    username: usuario.username,
    rol: usuario.rol,
    cliente_id: usuario.cliente_id
  };

  res.json({ usuario: perfilSesion(req.session.user) });
});

// POST /api/auth/logout  -> cerrar sesión
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me  -> usuario de la sesión actual
router.get('/me', requiereAuth, (req, res) => {
  res.json({ usuario: perfilSesion(req.session.user) });
});

// GET /api/auth/mi-cuenta  -> portal del cliente (rol 'cliente' o admin consultando)
router.get('/mi-cuenta', requiereAuth, (req, res) => {
  const { rol, cliente_id } = req.session.user;
  let targetId = cliente_id;
  if (rol === 'admin' && req.query.cliente_id) targetId = Number(req.query.cliente_id);
  if (!targetId) return res.status(404).json({ error: 'Este usuario no tiene un cliente asociado' });

  const cliente = db.prepare('SELECT id, nombre, telefono FROM clientes WHERE id = ?').get(targetId);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const compras = db.prepare('SELECT * FROM ventas WHERE cliente_id = ? ORDER BY fecha DESC').all(targetId);
  const pagos = db.prepare(`
    SELECT p.*, v.descripcion_producto
    FROM pagos p LEFT JOIN ventas v ON v.id = p.venta_id
    WHERE p.cliente_id = ? ORDER BY p.fecha DESC
  `).all(targetId);

  const compraTotal = db.prepare('SELECT COALESCE(SUM(precio),0) AS total FROM ventas WHERE cliente_id = ?').get(targetId).total;
  const pagosTotal = db.prepare('SELECT COALESCE(SUM(monto),0) AS total FROM pagos WHERE cliente_id = ?').get(targetId).total;

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
  `).all(targetId);

  res.json({
    cliente,
    total_comprado: Number(compraTotal),
    total_pagado: Number(pagosTotal),
    saldo_pendiente: Math.max(0, Number(compraTotal) - Number(pagosTotal)),
    compras,
    pagos,
    detalles_deuda: detalles.map(d => ({
      venta_id: d.venta_id,
      descripcion_producto: d.descripcion_producto,
      precio: Number(d.precio || 0),
      total_pagado: Number(d.total_pagado || 0),
      pendiente: Number(d.pendiente || 0)
    }))
  });
});

// =============================================================================
// Gestión de accesos (solo administrador)
// =============================================================================

// GET /api/auth/usuarios  -> lista todos los accesos
router.get('/usuarios', requiereAuth, requiereAdmin, (req, res) => {
  const usuarios = db.prepare(`
    SELECT u.id, u.username, u.rol, u.cliente_id, u.creado_en,
           c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
    FROM usuarios u
    LEFT JOIN clientes c ON c.id = u.cliente_id
    ORDER BY u.rol, u.username
  `).all();
  res.json(usuarios);
});

// POST /api/auth/usuarios  -> crea un acceso de cliente
router.post('/usuarios', requiereAuth, requiereAdmin, (req, res) => {
  const { cliente_id, username, password } = req.body || {};
  if (!cliente_id || !username || !password) {
    return res.status(400).json({ error: 'Cliente, usuario y contraseña son obligatorios' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const existe = db.prepare('SELECT id FROM usuarios WHERE username = ? COLLATE NOCASE').get(String(username).trim());
  if (existe) return res.status(400).json({ error: 'Ese nombre de usuario ya está en uso' });

  const info = db.prepare('INSERT INTO usuarios (username, password_hash, rol, cliente_id) VALUES (?,?,?,?)')
    .run(String(username).trim(), bcrypt.hashSync(String(password), 10), 'cliente', cliente_id);
  const nuevo = db.prepare(`
    SELECT u.id, u.username, u.rol, u.cliente_id, u.creado_en, c.nombre AS cliente_nombre
    FROM usuarios u LEFT JOIN clientes c ON c.id = u.cliente_id WHERE u.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(nuevo);
});

// POST /api/auth/usuarios/:id/password  -> restablecer contraseña
router.post('/usuarios/:id/password', requiereAuth, requiereAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const existe = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ error: 'Usuario no encontrado' });

  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(String(password), 10), req.params.id);
  res.json({ ok: true });
});

// DELETE /api/auth/usuarios/:id  -> elimina un acceso (no permite borrar admins)
router.delete('/usuarios/:id', requiereAuth, requiereAdmin, (req, res) => {
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (usuario.rol === 'admin') {
    return res.status(403).json({ error: 'No se puede eliminar un acceso de administrador' });
  }
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
