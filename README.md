# Control de Gastos

Aplicación web para el control de gastos e ingresos personales, desarrollada con una arquitectura separada entre `frontend/` y `backend/`.

El sistema permite registrar y administrar ingresos y gastos, organizar movimientos mediante categorías, consultar reportes financieros y administrar la información del perfil del usuario.

## Tecnologías utilizadas

### Frontend
- Angular 22
- TypeScript
- HTML5
- CSS3
- Angular Signals
- Angular Router
- Chart components para visualización de datos

### Backend
- Node.js
- Express
- TypeScript
- PostgreSQL
- JWT
- bcryptjs
- Zod
- pg

### Herramientas
- pnpm
- Git / GitHub

---

## Funcionalidades

###  Autenticación y usuarios

- Inicio de sesión con correo y contraseña.
- Autenticación mediante Google.
- Registro de nuevos usuarios.
- Contraseñas protegidas mediante hash con bcrypt.
- Autenticación mediante JWT.
- Control de acceso mediante roles (`admin` / `user`).
- Protección de rutas mediante guard.
- Interceptor HTTP para enviar el token automáticamente.
- Manejo de sesiones expiradas.
- Cierre de sesión manual.
- Cierre automático por inactividad.
- Mensajes de confirmación para acciones de sesión.

###  Ingresos

- Crear ingresos.
- Editar ingresos.
- Eliminar ingresos.
- Consultar ingresos registrados.
- Filtrar por búsqueda, fechas y categoría.
- Clasificar ingresos como fijos o variables.
- Validar que no se registren fechas futuras.
- Visualizar estadísticas mensuales y anuales.
- Gráfico de fuentes de ingreso.
- Información almacenada directamente en PostgreSQL.

###  Gastos

- Crear gastos.
- Editar gastos.
- Eliminar gastos.
- Consultar gastos registrados.
- Filtrar por búsqueda, fechas y categoría.
- Clasificar gastos como fijos o variables.
- Validar que no se registren fechas futuras.
- Control de fondos disponibles.
- El sistema evita registrar un gasto cuando supera el dinero disponible.
- Visualizar estadísticas mensuales y anuales.
- Gráfico de gastos por categoría.
- Información almacenada directamente en PostgreSQL.

###  Dashboard

El Dashboard presenta información financiera real obtenida desde la base de datos.

Incluye:

- Total de ingresos.
- Total de gastos.
- Dinero disponible.
- Comparación de ingresos y gastos.
- Evolución de los movimientos durante los últimos períodos.
- Gráfico de categorías de gastos.
- Listado de últimos gastos registrados.

Los valores mostrados se calculan dinámicamente y no utilizan datos de demostración.

###  Categorías

- Categorías para ingresos y gastos.
- Separación entre categorías de ingresos y categorías de gastos.
- Creación de categorías personalizadas.
- Edición de categorías propias.
- Eliminación de categorías propias.
- Identificación de categorías del sistema.
- Protección de categorías del sistema para evitar modificaciones no permitidas.

###  Reportes

- Selección del año a consultar.
- Comparación mensual de ingresos y gastos.
- Gráfico de evolución financiera.
- Gráfico de gastos por categoría.
- Gráfico de ingresos por fuente.
- Tabla con información mensual.
- Resumen anual de ingresos, gastos y dinero disponible.

###  Configuración

- Edición del nombre del usuario.
- Actualización de fotografía de perfil.
- Preferencia de símbolo de moneda.
- Persistencia de la información del perfil.

---

## Estructura del proyecto

```text
control-de-gastos/
├── backend/
│   └── src/
│       ├── config/              # Configuración y conexión a PostgreSQL
│       ├── middlewares/         # Manejo de errores y autenticación
│       ├── utils/               # Utilidades compartidas
│       └── modules/
│           ├── app.ts           # Configuración de Express
│           ├── server.ts        # Arranque del servidor
│           ├── auth/            # Autenticación y usuarios
│           ├── ingresos/        # Gestión de ingresos
│           ├── expenses/        # Gestión de gastos
│           └── categorias/      # Gestión de categorías
│
└── frontend/
    └── src/app/
        ├── core/                # Servicios, modelos, guards e interceptor
        ├── shared/              # Componentes y modelos compartidos
        └── features/
            ├── landing/         # Página de bienvenida
            ├── login/           # Inicio de sesión
            ├── registro/        # Registro de usuarios
            ├── inicio/          # Dashboard
            ├── ingresos/        # Gestión de ingresos
            ├── gastos/          # Gestión de gastos
            ├── reportes/        # Reportes financieros
            ├── categorias/      # Gestión de categorías
            └── configuracion/   # Configuración del perfil

## Backend

1. Entra a la carpeta e instala dependencias:
   ```
   cd backend
   pnpm install
   ```
2. Copia `.env.example` a `.env` y ajusta `DATABASE_URL` con tus datos de PostgreSQL:
   ```
   cp .env.example .env
   ```
3. Crea la base de datos en PostgreSQL (una vez, desde psql o pgAdmin):
   ```sql
   CREATE DATABASE control_de_gastos;
   ```
4. Crea/actualiza las tablas (es seguro correrlo aunque ya existan datos, usa `CREATE TABLE IF NOT EXISTS`):
   ```
   pnpm db:init
   ```
5. Inserta los usuarios de prueba:
   ```
   pnpm db:seed
   ```
6. Levanta el servidor en modo desarrollo:
   ```
   pnpm dev
   ```
   La API queda disponible en `http://localhost:3010/api`.

### Usuarios de prueba

| Correo | Contraseña | Rol |
|---|---|---|
| admin@controldegastos.com | Admin123 | admin |
| user@controldegastos.com | User123 | user |
| maria@controldegastos.com | Maria123 | user |

### Endpoints principales

Autenticación
POST   /api/auth/login       Iniciar sesión
POST   /api/auth/registro    Registrar usuario
POST   /api/auth/google      Iniciar sesión con Google
GET    /api/auth/perfil      Obtener perfil
PATCH  /api/auth/perfil      Actualizar perfil
Ingresos
GET    /api/ingresos
POST   /api/ingresos
PUT    /api/ingresos/:id
DELETE /api/ingresos/:id

Los ingresos permiten filtros mediante parámetros como:

busqueda
fechaInicio
fechaFin
categoria
Gastos
GET    /api/expenses
POST   /api/expenses
PUT    /api/expenses/:id
DELETE /api/expenses/:id

Los gastos permiten filtros mediante parámetros como:

busqueda
fechaInicio
fechaFin
categoria
Categorías
GET    /api/categorias
POST   /api/categorias
PUT    /api/categorias/:id
DELETE /api/categorias/:id

## Frontend

1. Entra a la carpeta e instala dependencias:
   ```
   cd frontend
   pnpm install
   ```
2. Levanta el proyecto:
   ```
   pnpm start
   ```
3. Abre `http://localhost:4200`.

### Autor

Herbert García

Proyecto académico de desarrollo web full-stack.
