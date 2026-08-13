const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

require('./db/database'); // inicializa la base de datos al arrancar

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Sesiones con cookie
app.use(session({
  secret: process.env.SESSION_SECRET || 'marianee-shop-secreto-dev',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8 // 8 horas
  }
}));

// Middleware de autenticación y roles
function requiereAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Inicia sesión para continuar' });
}
function requiereAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.rol === 'admin') return next();
  return res.status(403).json({ error: 'No tienes permisos para esta acción' });
}

app.use(express.static(path.join(__dirname, 'public')));

// Auth (login público; el resto de rutas se protegen dentro del router)
app.use('/api/auth', require('./routes/auth'));

// Rutas de administración (requieren sesión + rol admin)
const adminApi = [requiereAuth, requiereAdmin];
app.use('/api/clientes', adminApi, require('./routes/clientes'));
app.use('/api/ventas', adminApi, require('./routes/ventas'));
app.use('/api/pagos', adminApi, require('./routes/pagos'));
app.use('/api/dashboard', adminApi, require('./routes/dashboard'));

// GET /logout -> cerrar sesión (menú móvil): destruye la sesión y vuelve a la portada
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✔ Marianee Shop corriendo en http://localhost:${PORT}\n`);
});
