import { pool } from "../../../config/db";

export type TipoMovimiento = "fijo" | "variable";

export interface Ingreso {
  id: number;
  usuario_id: number;
  descripcion: string;
  fuente: string;
  categoria: string;
  tipo: TipoMovimiento;
  monto: string; // NUMERIC llega como string desde pg; se castea en el service
  fecha: string; // DATE llega como "yyyy-mm-dd"
  creado_en: Date;
}

export interface FiltrosIngreso {
  busqueda?: string;
  fechaInicio?: string;
  fechaFin?: string;
  categoria?: string;
}

export interface DatosIngreso {
  descripcion: string;
  fuente: string;
  categoria: string;
  tipo: TipoMovimiento;
  monto: number;
  fecha: string;
}

// SIEMPRE recibe el usuarioId del usuario autenticado (nunca del body
// que manda el frontend), así cada usuario solo ve/edita/elimina sus
// propios ingresos.
export async function listarIngresosPorUsuario(
  usuarioId: number,
  filtros: FiltrosIngreso = {}
): Promise<Ingreso[]> {
  const condiciones: string[] = ["usuario_id = $1"];
  const valores: unknown[] = [usuarioId];

  if (filtros.busqueda) {
    valores.push(`%${filtros.busqueda}%`);
    const idx = valores.length;
    condiciones.push(
      `(descripcion ILIKE $${idx} OR fuente ILIKE $${idx} OR categoria ILIKE $${idx})`
    );
  }

  if (filtros.fechaInicio) {
    valores.push(filtros.fechaInicio);
    condiciones.push(`fecha >= $${valores.length}`);
  }

  if (filtros.fechaFin) {
    valores.push(filtros.fechaFin);
    condiciones.push(`fecha <= $${valores.length}`);
  }

  if (filtros.categoria) {
    valores.push(filtros.categoria);
    condiciones.push(`categoria = $${valores.length}`);
  }

  const resultado = await pool.query<Ingreso>(
    `SELECT id, usuario_id, descripcion, fuente, categoria, tipo, monto, fecha, creado_en
    FROM ingresos
    WHERE ${condiciones.join(" AND ")}
    ORDER BY fecha DESC, creado_en DESC`,
    valores
  );

  return resultado.rows;
}

export async function obtenerIngresoPorId(
  id: number,
  usuarioId: number
): Promise<Ingreso | null> {
  const resultado = await pool.query<Ingreso>(
    `SELECT id, usuario_id, descripcion, fuente, categoria, tipo, monto, fecha, creado_en
     FROM ingresos
     WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId]
  );

  return resultado.rows[0] ?? null;
}

export async function crearIngreso(
  usuarioId: number,
  datos: DatosIngreso
): Promise<Ingreso> {
  const resultado = await pool.query<Ingreso>(
    `INSERT INTO ingresos (usuario_id, descripcion, fuente, categoria, tipo, monto, fecha)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, usuario_id, descripcion, fuente, categoria, tipo, monto, fecha, creado_en`,
    [usuarioId, datos.descripcion, datos.fuente, datos.categoria, datos.tipo, datos.monto, datos.fecha]
  );

  return resultado.rows[0];
}

// Actualiza SOLO si el ingreso pertenece al usuario (WHERE usuario_id).
// Si no pertenece o no existe, devuelve null y el controller responde 404.
export async function actualizarIngreso(
  id: number,
  usuarioId: number,
  datos: DatosIngreso
): Promise<Ingreso | null> {
  const resultado = await pool.query<Ingreso>(
    `UPDATE ingresos
     SET descripcion = $1, fuente = $2, categoria = $3, tipo = $4, monto = $5, fecha = $6
     WHERE id = $7 AND usuario_id = $8
     RETURNING id, usuario_id, descripcion, fuente, categoria, tipo, monto, fecha, creado_en`,
    [datos.descripcion, datos.fuente, datos.categoria, datos.tipo, datos.monto, datos.fecha, id, usuarioId]
  );

  return resultado.rows[0] ?? null;
}

export async function eliminarIngreso(id: number, usuarioId: number): Promise<boolean> {
  const resultado = await pool.query(
    `DELETE FROM ingresos WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId]
  );

  return (resultado.rowCount ?? 0) > 0;
}