import { pool } from "../../../config/db";

export type RolUsuario = "admin" | "user";
export type ProveedorUsuario = "local" | "google";

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  // Nullable: las cuentas creadas solo con Google no tienen contraseña local.
  password_hash: string | null;
  rol: RolUsuario;
  activo: boolean;
  creado_en: Date;
  proveedor: ProveedorUsuario;
  google_sub: string | null;
  foto_url: string | null;
  preferencias: Record<string, unknown> | null;
}

// Versión del usuario sin password_hash, para devolver en respuestas
// de la API sin exponer la contraseña encriptada.
export type UsuarioPublico = Omit<Usuario, "password_hash">;

// Campos públicos; las consultas que solo DEVUELVEN usuario usan esto
// y las que además necesitan validar contraseña agregan password_hash.
const CAMPOS_PUBLICOS = `id, nombre, correo, rol, activo, creado_en, proveedor, google_sub, foto_url, preferencias`;

export async function buscarUsuarioPorCorreo(
  correo: string
): Promise<Usuario | null> {
  const resultado = await pool.query<Usuario>(
    `SELECT ${CAMPOS_PUBLICOS}, password_hash
     FROM usuarios
     WHERE correo = $1 AND activo = true`,
    [correo]
  );

  return resultado.rows[0] ?? null;
}

// Busca por correo SIN filtrar el estado activo: se usa para detectar
// conflictos (ej. el correo de Google ya pertenece a una cuenta local).
export async function buscarUsuarioPorCorreoSinFiltro(
  correo: string
): Promise<Usuario | null> {
  const resultado = await pool.query<Usuario>(
    `SELECT ${CAMPOS_PUBLICOS}, password_hash
     FROM usuarios
     WHERE correo = $1`,
    [correo]
  );

  return resultado.rows[0] ?? null;
}

export async function buscarUsuarioPorGoogleSub(
  googleSub: string
): Promise<Usuario | null> {
  const resultado = await pool.query<Usuario>(
    `SELECT ${CAMPOS_PUBLICOS}, password_hash
     FROM usuarios
     WHERE google_sub = $1 AND activo = true`,
    [googleSub]
  );

  return resultado.rows[0] ?? null;
}

export async function crearUsuario(
  nombre: string,
  correo: string,
  passwordHash: string | null,
  rol: RolUsuario = "user"
): Promise<UsuarioPublico> {
  const resultado = await pool.query<UsuarioPublico>(
    `INSERT INTO usuarios (nombre, correo, password_hash, rol)
     VALUES ($1, $2, $3, $4)
     RETURNING ${CAMPOS_PUBLICOS}`,
    [nombre, correo, passwordHash, rol]
  );

  return resultado.rows[0];
}

// Crea un usuario proveniente de Google: rol "user" fijo, sin
// contraseña local (password_hash NULL) y con su identificador de Google.
export async function crearUsuarioGoogle(
  nombre: string,
  correo: string,
  googleSub: string,
  fotoUrl: string | null
): Promise<UsuarioPublico> {
  const resultado = await pool.query<UsuarioPublico>(
    `INSERT INTO usuarios (nombre, correo, password_hash, rol, proveedor, google_sub, foto_url)
     VALUES ($1, $2, NULL, 'user', 'google', $3, $4)
     RETURNING ${CAMPOS_PUBLICOS}`,
    [nombre, correo, googleSub, fotoUrl]
  );

  return resultado.rows[0];
}

// Actualiza SOLO los campos que vengan definidos. Cada usuario solo
// puede modificar su propio perfil (el controller usa req.usuario.id).
export async function actualizarPerfil(
  id: number,
  datos: {
    nombre?: string;
    foto_url?: string | null;
    preferencias?: Record<string, unknown> | null;
  }
): Promise<UsuarioPublico | null> {
  const asignaciones: string[] = [];
  const valores: unknown[] = [];

  if (datos.nombre !== undefined) {
    valores.push(datos.nombre);
    asignaciones.push(`nombre = $${valores.length}`);
  }
  if (datos.foto_url !== undefined) {
    valores.push(datos.foto_url);
    asignaciones.push(`foto_url = $${valores.length}`);
  }
  if (datos.preferencias !== undefined) {
    valores.push(datos.preferencias);
    asignaciones.push(`preferencias = $${valores.length}`);
  }

  if (!asignaciones.length) return null;

  valores.push(id);

  const resultado = await pool.query<UsuarioPublico>(
    `UPDATE usuarios
     SET ${asignaciones.join(", ")}
     WHERE id = $${valores.length}
     RETURNING ${CAMPOS_PUBLICOS}`,
    valores
  );

  return resultado.rows[0] ?? null;
}

export async function listarUsuarios(): Promise<UsuarioPublico[]> {
  const resultado = await pool.query<UsuarioPublico>(
    `SELECT ${CAMPOS_PUBLICOS}
     FROM usuarios
     ORDER BY creado_en DESC`
  );

  return resultado.rows;
}

export async function actualizarRolUsuario(
  id: number,
  rol: RolUsuario
): Promise<UsuarioPublico | null> {
  const resultado = await pool.query<UsuarioPublico>(
    `UPDATE usuarios
     SET rol = $1
     WHERE id = $2
     RETURNING ${CAMPOS_PUBLICOS}`,
    [rol, id]
  );

  return resultado.rows[0] ?? null;
}

export async function desactivarUsuario(id: number): Promise<boolean> {
  const resultado = await pool.query(
    `UPDATE usuarios SET activo = false WHERE id = $1`,
    [id]
  );

  return (resultado.rowCount ?? 0) > 0;
}