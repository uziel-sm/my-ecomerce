const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'marianee.db');
const isNew = !fs.existsSync(DB_PATH);

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ---------------------------------------------------------------------
// Esquema relacional
// ---------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS clientes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  telefono      TEXT NOT NULL,
  notas         TEXT,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS ventas (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id            INTEGER NOT NULL,
  descripcion_producto  TEXT NOT NULL,
  precio                REAL NOT NULL DEFAULT 0,
  fecha                 TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  creado_en             TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pagos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id    INTEGER NOT NULL,
  venta_id      INTEGER,
  monto         REAL NOT NULL DEFAULT 0,
  forma_pago    TEXT NOT NULL CHECK (forma_pago IN ('contado','credito')),
  metodo_pago   TEXT NOT NULL CHECK (metodo_pago IN ('efectivo','tarjeta')),
  estado        TEXT NOT NULL CHECK (estado IN ('pagado','abono','pendiente')),
  fecha         TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  creado_en     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (venta_id)   REFERENCES ventas(id)   ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('admin','cliente')),
  cliente_id    INTEGER,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cliente   ON pagos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha    ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha     ON pagos(fecha);
`);

const ventasInfo = db.prepare('PRAGMA table_info(ventas)').all();
const hasPrecio = ventasInfo.some(col => col.name === 'precio');
const hasMonto = ventasInfo.some(col => col.name === 'monto');
if (hasMonto && !hasPrecio) {
  db.exec('ALTER TABLE ventas RENAME COLUMN monto TO precio');
}

// ---------------------------------------------------------------------
// Usuario administrador por defecto (se crea solo si no existe)
// ---------------------------------------------------------------------
const existeAdmin = db.prepare('SELECT id FROM usuarios WHERE rol = ?').get('admin');
if (!existeAdmin) {
  db.prepare('INSERT INTO usuarios (username, password_hash, rol) VALUES (?,?,?)')
    .run('admin', bcrypt.hashSync('admin123', 10), 'admin');
  console.log('\n✔ Acceso de administrador creado →  usuario: admin  |  contraseña: admin123');
}

// Datos de ejemplo solo la primera vez que se crea la base de datos
if (isNew) {
  const insertCliente = db.prepare('INSERT INTO clientes (nombre, telefono, notas) VALUES (?,?,?)');
  const c1 = insertCliente.run('María Fernanda López', '618-123-4567', 'Cliente frecuente, prefiere tallas M');
  const c2 = insertCliente.run('Ana Sofía Ramírez', '618-234-5678', '');
  const c3 = insertCliente.run('Gabriela Torres', '618-345-6789', 'Compra por catálogo de Instagram');

  const insertVenta = db.prepare('INSERT INTO ventas (cliente_id, descripcion_producto, precio, fecha) VALUES (?,?,?,?)');
  const v1 = insertVenta.run(c1.lastInsertRowid, 'Playera azul talla M', 350, '2026-07-02 10:30:00');
  const v2 = insertVenta.run(c1.lastInsertRowid, 'Pantalón de mezclilla talla 28', 620, '2026-07-20 16:00:00');
  const v3 = insertVenta.run(c2.lastInsertRowid, 'Vestido floral talla S', 480, '2026-08-01 12:15:00');
  const v4 = insertVenta.run(c3.lastInsertRowid, 'Chamarra naranja talla L', 890, '2026-08-04 18:45:00');

  const insertPago = db.prepare('INSERT INTO pagos (cliente_id, venta_id, monto, forma_pago, metodo_pago, estado, fecha) VALUES (?,?,?,?,?,?,?)');
  insertPago.run(c1.lastInsertRowid, v1.lastInsertRowid, 350, 'contado', 'efectivo', 'pagado', '2026-07-02 10:35:00');
  insertPago.run(c1.lastInsertRowid, v2.lastInsertRowid, 300, 'credito', 'tarjeta', 'abono', '2026-07-20 16:05:00');
  insertPago.run(c2.lastInsertRowid, v3.lastInsertRowid, 480, 'contado', 'tarjeta', 'pagado', '2026-08-01 12:20:00');
  insertPago.run(c3.lastInsertRowid, v4.lastInsertRowid, 0, 'credito', 'efectivo', 'pendiente', '2026-08-04 18:50:00');

  // Acceso de cliente demo (vinculado a la primera clienta) para probar el rol 'cliente'
  db.prepare('INSERT INTO usuarios (username, password_hash, rol, cliente_id) VALUES (?,?,?,?)')
    .run('maria', bcrypt.hashSync('cliente123', 10), 'cliente', c1.lastInsertRowid);
  console.log('✔ Acceso de cliente demo creado →  usuario: maria  |  contraseña: cliente123');

  console.log('Base de datos creada con datos de ejemplo.');
}

module.exports = db;
