...

# Marianee Shop · Panel de administración

Sistema web para administrar clientes, ventas y pagos de la tienda **Marianee Shop**.
No maneja inventario/stock: el flujo de trabajo es *cliente → compras → pagos*.

## Tecnología

- **Backend:** Node.js + Express
- **Base de datos:** SQLite (relacional), mediante el módulo `node:sqlite` **integrado en Node.js** (no requiere instalar Visual Studio ni compilar nada). El archivo vive en `db/marianee.db` y se crea automáticamente la primera vez que se enciende el servidor, con algunos datos de ejemplo.
- **Frontend:** HTML + CSS + JavaScript puro (sin frameworks), consumiendo la API vía `fetch`.

> **Requisito de versión:** `node:sqlite` requiere **Node.js 22.5 o superior**. Verifica tu versión con `node -v`; si es menor, actualiza Node desde https://nodejs.org antes de instalar el proyecto. Al arrancar el servidor verás un aviso `ExperimentalWarning: SQLite is an experimental feature` — es normal, no es un error, solo indica que el módulo es relativamente nuevo dentro de Node.

### ¿Por qué SQLite?

Para este negocio (una tienda con un solo punto de administración) SQLite es la opción más práctica: no requiere instalar ni configurar un servidor de base de datos aparte, el archivo `.db` se puede respaldar copiando un solo archivo, y soporta perfectamente las relaciones que necesitamos (clientes → ventas → pagos) con integridad referencial. Usamos el módulo `node:sqlite` en vez de paquetes como `better-sqlite3` porque ese último necesita compilar código nativo en cada computadora (requiere Visual Studio en Windows), mientras que `node:sqlite` ya viene listo dentro de Node.js. Si en el futuro la tienda crece y necesita varios usuarios escribiendo al mismo tiempo desde distintos lugares, el proyecto puede migrarse a PostgreSQL cambiando únicamente el archivo `db/database.js`, ya que el resto del código (rutas y frontend) no depende del motor de base de datos.

## Estructura del proyecto

```
marianee-shop/
├── server.js              # Servidor Express
├── db/
│   └── database.js        # Conexión y esquema de la base de datos SQLite
├── routes/
│   ├── auth.js            # Login/logout con sesiones, portal del cliente y gestión de accesos
│   ├── clientes.js         # CRUD de clientes + subsecciones de compras/pagos
│   ├── ventas.js            # CRUD de ventas + filtros por fecha
│   ├── pagos.js              # CRUD de pagos + estados
│   └── dashboard.js           # Resumen para el panel de inicio
└── public/
    ├── index.html          # Estructura de la aplicación (SPA)
    ├── css/style.css        # Estilos (identidad naranja de la marca)
    └── js/app.js             # Lógica de navegación, tablas y formularios
```

## Modelo de datos (relacional)

- **clientes** (`id`, `nombre`, `telefono`, `notas`, `creado_en`)
- **ventas** (`id`, `cliente_id` → clientes, `descripcion_producto`, `monto`, `fecha`)
- **pagos** (`id`, `cliente_id` → clientes, `venta_id` → ventas, `monto`, `forma_pago`, `metodo_pago`, `estado`, `fecha`)
- **usuarios** (`id`, `username`, `password_hash`, `rol` ∈ `admin|cliente`, `cliente_id` → clientes, `creado_en`)

Al eliminar un cliente se eliminan en cascada sus ventas, pagos y su acceso de usuario asociado.

## Cómo ejecutarlo

1. Instalar [Node.js](https://nodejs.org) (versión 18 o superior).
2. Abrir una terminal dentro de la carpeta `marianee-shop`.
3. Instalar las dependencias (solo la primera vez):
   ```bash
   npm install
   ```
4. Encender el servidor:
   ```bash
   npm start
   ```
5. Abrir el navegador en:
   ```
   http://localhost:3000
   ```

La base de datos (`db/marianee.db`) se crea sola la primera vez. Para respaldarla, basta con copiar ese archivo a un lugar seguro. Para empezar "desde cero", solo hay que borrar ese archivo y reiniciar el servidor.

## Autenticación (login)

El sistema usa **sesiones con cookie** (`express-session`) y contraseñas encriptadas con **bcrypt**. Toda la API (`/api/*`) exige sesión iniciada y las rutas de administración exigen rol `admin`.

### Accesos iniciales

| Rol        | Usuario | Contraseña   |
|------------|---------|--------------|
| Admin      | `admin` | `admin123`   |
| Cliente demo | `maria` | `cliente123` (solo si la BD se crea desde cero) |

> ⚠️ **Cambia estas contraseñas** la primera vez. El acceso del admin se crea automáticamente si no existe; puedes cambiar su contraseña editando `db/database.js` o borrando la BD para regenerarla.

### Roles

- **Admin:** acceso completo al panel (Inicio, Clientes, Ventas, Pagos) + la vista **Usuarios**, donde crea accesos para sus clientes y restablece contraseñas.
- **Cliente:** al iniciar sesión ve **Mi cuenta**, con su total comprado, pagado, saldo pendiente y su historial de compras/pagos. No puede consultar las rutas de administración (devuelven `403`).

### Cambiar el secreto de sesión (recomendado en producción)

Define la variable de entorno `SESSION_SECRET` antes de arrancar; si no existe se usa un valor de desarrollo:

## Funcionalidades

### Inicio (Dashboard)
Resumen con: clientes registrados, ventas del mes, monto cobrado/por cobrar, pagos pendientes, y las últimas ventas y pagos registrados.

### Clientes
- Listado con buscador por nombre o teléfono.
- Alta, edición y eliminación de clientes.
- Al entrar al detalle de un cliente se muestran dos pestañas:
  - **Compras**: historial de productos comprados.
  - **Pagos**: historial de pagos realizados, con su forma, método y estado.

### Ventas
- Alta, edición y eliminación de ventas (cliente, teléfono, descripción del producto, monto y fecha).
- Filtros: **Recientes**, **Esta semana**, **Este mes**, **Este año**.
- Si el teléfono capturado ya pertenece a un cliente existente, la venta se asocia automáticamente a ese cliente; si no, se crea un cliente nuevo.

### Pagos
- Alta, edición y eliminación de pagos.
- Campos: cliente, monto, forma de pago (**contado** / **crédito**), método de pago (**efectivo** / **tarjeta**) y estado (**pagado** / **abono** / **pendiente**).
- Filtro rápido por estado.

## Notas para producción

- Este proyecto está pensado para uso local o en un solo servidor pequeño (por ejemplo, una laptop de la tienda o un hosting económico tipo VPS).
- Si se desea acceso remoto seguro (varias personas usándolo desde distintos dispositivos a la vez), lo recomendable es desplegarlo en un servicio como Render, Railway o un VPS, y migrar la base de datos a PostgreSQL para mayor concurrencia.
