import { pool } from "../../../config/db";

export type TipoCategoria = "ingreso" | "gasto";

export interface Categoria {
  id: number;
  usuario_id: number | null; // null = categoría del sistema
  nombre: string;
  tipo: TipoCategoria;
  color: string | null;
  creado_en: Date;
}

export interface DatosCategoria {
  nombre: string;
  tipo: TipoCategoria;
  color?: string | null;
}

const SELECT_CATEGORIA = `id, usuario_id, nombre, tipo, color, creado_en`;

// Lista las categorías del sistema (usuario_id NULL) + las creadas por
// el usuario. Las del sistema salen primero (son las predefinidas) y
// después las del usuario.
export async function listarCategorias(
  usuarioId: number,
  tipo?: TipoCategoria
): Promise<Categoria[]> {
  const condiciones: string[] = ["(usuario_id = $1 OR usuario_id IS NULL)"];
  const valores: unknown[] = [usuarioId];

  if (tipo) {
    valores.push(tipo);
    condiciones.push(`tipo = $${valores.length}`);
  }

  const resultado = await pool.query<Categoria>(
    `SELECT ${SELECT_CATEGORIA}
     FROM categorias
     WHERE ${condiciones.join(" AND ")}
     ORDER BY CASE WHEN usuario_id IS NULL THEN 0 ELSE 1 END, id`,
    valores
  );

  return resultado.rows;
}

// Las categorías creadas por el usuario quedan con usuario_id = su id,
// para que cada usuario gestione solo las suyas sin tocar las del sistema.
export async function crearCategoria(
  usuarioId: number,
  datos: DatosCategoria
): Promise<Categoria> {
  const resultado = await pool.query<Categoria>(
    `INSERT INTO categorias (usuario_id, nombre, tipo, color)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SELECT_CATEGORIA}`,
    [usuarioId, datos.nombre, datos.tipo, datos.color ?? null]
  );

  return resultado.rows[0];
}

// Solo puede editar sus propias categorías (WHERE usuario_id = $2):
// si apunta a una del sistema o a otra que no le pertenece, devuelve
// null y el service traduce la respuesta a un error claro.
export async function actualizarCategoria(
  id: number,
  usuarioId: number,
  datos: DatosCategoria
): Promise<Categoria | null> {
  const resultado = await pool.query<Categoria>(
    `UPDATE categorias
     SET nombre = $1, tipo = $2, color = $3
     WHERE id = $4 AND usuario_id = $5
     RETURNING ${SELECT_CATEGORIA}`,
    [datos.nombre, datos.tipo, datos.color ?? null, id, usuarioId]
  );

  return resultado.rows[0] ?? null;
}

export async function eliminarCategoria(id: number, usuarioId: number): Promise<boolean> {
  const resultado = await pool.query(
    `DELETE FROM categorias WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId]
  );

  return (resultado.rowCount ?? 0) > 0;
}