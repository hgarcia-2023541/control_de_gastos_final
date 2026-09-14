-- Tabla de usuarios del sistema.
-- El campo "rol" solo acepta dos valores: admin y user (por defecto user)
CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(150) NOT NULL,
  correo         VARCHAR(150) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  rol            VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (rol IN ('admin', 'user')),
  creado_en      TIMESTAMP NOT NULL DEFAULT now(),
  activo         BOOLEAN NOT NULL DEFAULT true
);

-- Índice para búsquedas rápidas por correo
CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios(correo);

-- Tabla de ingresos. Cada ingreso pertenece a un único usuario
-- (usuario_id); el backend siempre filtra/asocia por el usuario
-- autenticado (req.usuario.id), nunca por un id que mande el frontend.
CREATE TABLE IF NOT EXISTS ingresos (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  descripcion VARCHAR(200) NOT NULL,
  fuente      VARCHAR(100) NOT NULL,
  categoria   VARCHAR(100) NOT NULL,
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha       DATE NOT NULL,
  creado_en   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingresos_usuario ON ingresos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON ingresos(fecha);

-- Tabla de gastos. Misma convención que ingresos: cada gasto
-- pertenece a un único usuario (usuario_id), y el backend siempre
-- filtra/asocia por el usuario autenticado (req.usuario.id), nunca
-- por un id que mande el frontend.
--
-- "categoria" se guarda como texto libre (igual que en ingresos),
-- a propósito: todavía no existe un módulo de Categorías con su
-- propia tabla. Cuando exista, se puede migrar este texto a una
-- relación sin rehacer la tabla de gastos.
CREATE TABLE IF NOT EXISTS gastos (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  descripcion VARCHAR(200) NOT NULL,
  categoria   VARCHAR(100) NOT NULL,
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha       DATE NOT NULL,
  creado_en   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_usuario ON gastos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);

-- ============================================================
-- CAMBIOS ADITIVOS (compatibles con los datos existentes)
-- ============================================================

-- Usuarios: soporte para login con Google y perfil.
-- password_hash pasa a ser opcional: las cuentas creadas solo con
-- Google no tienen contraseña local (el login con contraseña lo
-- rechaza el backend con un mensaje controlado).
ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS proveedor VARCHAR(20) NOT NULL DEFAULT 'local';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_url VARCHAR(500) NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preferencias JSONB NULL;

-- Índice único parcial: solo aplica cuando hay google_sub
-- (PostgreSQL no indexa los NULL dentro de un UNIQUE normal).
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_google_sub ON usuarios(google_sub) WHERE google_sub IS NOT NULL;

-- Clasificación fijo/variable en ingresos y gastos. DEFAULT 'variable'
-- para que las filas existentes sigan funcionando sin cambios.
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'variable' CHECK (tipo IN ('fijo','variable'));
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'variable' CHECK (tipo IN ('fijo','variable'));

-- Módulo de Categorías: categorías del sistema (usuario_id NULL) y
-- categorías propias del usuario (usuario_id = id del usuario).
-- NO se toca la columna "categoria" (texto) que ya usan ingresos/gastos:
-- esta tabla es solo para gestión, no rompe los datos existentes.
CREATE TABLE IF NOT EXISTS categorias (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre     VARCHAR(60) NOT NULL,
  tipo       VARCHAR(20) NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  color      VARCHAR(20),
  creado_en  TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_categoria_usuario UNIQUE (usuario_id, nombre, tipo)
);

CREATE INDEX IF NOT EXISTS idx_categorias_usuario ON categorias(usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_sistema ON categorias (nombre, tipo) WHERE usuario_id IS NULL;

-- Categorías iniciales del sistema (idempotente: solo se insertan si no existen).
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Trabajo', 'ingreso'     WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Trabajo' AND tipo='ingreso');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Ventas', 'ingreso'       WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Ventas' AND tipo='ingreso');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Servicios', 'ingreso'    WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Servicios' AND tipo='ingreso');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Negocio', 'ingreso'      WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Negocio' AND tipo='ingreso');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Inversión', 'ingreso'    WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Inversión' AND tipo='ingreso');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Regalo', 'ingreso'       WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Regalo' AND tipo='ingreso');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Otros', 'ingreso'        WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Otros' AND tipo='ingreso');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Alimentación', 'gasto'   WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Alimentación' AND tipo='gasto');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Transporte', 'gasto'     WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Transporte' AND tipo='gasto');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Vivienda', 'gasto'       WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Vivienda' AND tipo='gasto');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Educación', 'gasto'      WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Educación' AND tipo='gasto');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Salud', 'gasto'          WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Salud' AND tipo='gasto');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Entretenimiento', 'gasto' WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Entretenimiento' AND tipo='gasto');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Servicios', 'gasto'      WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Servicios' AND tipo='gasto');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Compras', 'gasto'        WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Compras' AND tipo='gasto');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Deudas', 'gasto'         WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Deudas' AND tipo='gasto');
INSERT INTO categorias (usuario_id, nombre, tipo)
SELECT NULL, 'Otros', 'gasto'          WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id IS NULL AND nombre='Otros' AND tipo='gasto');