import { Pool, PoolClient } from "pg";
import { pool } from "../../../config/db";

// Pool y PoolClient implementan la misma interfaz .query(); pasar un
// cliente permite ejecutar el cálculo y el INSERT/UPDATE dentro de una
// misma transacción (ver gasto.service.ts).
type ConexionBD = Pool | PoolClient;

export type TipoMovimiento = "fijo" | "variable";

export interface Gasto {
  id: number;
  usuario_id: number;
  descripcion: string;
  categoria: string;
  tipo: TipoMovimiento;
  monto: string; // NUMERIC llega como string desde pg; se castea en el service
  fecha: string; // DATE llega como "yyyy-mm-dd"
  creado_en: Date;
}

export interface FiltrosGasto {
  busqueda?: string;
  fechaInicio?: string;
  fechaFin?: string;
  categoria?: string;
}

export interface DatosGasto {
  descripcion: string;
  categoria: string;
  tipo: TipoMovimiento;
  monto: number;
  fecha: string;
}

const SELECT_GASTO = `id, usuario_id, descripcion, categoria, tipo, monto, fecha, creado_en`;

// SIEMPRE recibe el usuarioId del usuario autenticado (nunca del body
// que manda el frontend), así cada usuario solo ve/edita/elimina sus
// propios gastos. Mismo patrón que ingreso.model.ts.
export async function listarGastosPorUsuario(
  usuarioId: number,
  filtros: FiltrosGasto = {}
): Promise<Gasto[]> {
  const condiciones: string[] = ["usuario_id = $1"];
  const valores: unknown[] = [usuarioId];

  if (filtros.busqueda) {
    valores.push(`%${filtros.busqueda}%`);
    const idx = valores.length;
    condiciones.push(`(descripcion ILIKE $${idx} OR categoria ILIKE $${idx})`);
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

  const resultado = await pool.query<Gasto>(
    `SELECT ${SELECT_GASTO}
     FROM gastos
     WHERE ${condiciones.join(" AND ")}
     ORDER BY fecha DESC, creado_en DESC`,
    valores
  );

  return resultado.rows;
}

export async function obtenerGastoPorId(
  id: number,
  usuarioId: number
): Promise<Gasto | null> {
  const resultado = await pool.query<Gasto>(
    `SELECT ${SELECT_GASTO}
     FROM gastos
     WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId]
  );

  return resultado.rows[0] ?? null;
}

export async function crearGasto(
  usuarioId: number,
  datos: DatosGasto,
  conexion: ConexionBD = pool
): Promise<Gasto> {
  const resultado = await conexion.query<Gasto>(
    `INSERT INTO gastos (usuario_id, descripcion, categoria, tipo, monto, fecha)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${SELECT_GASTO}`,
    [usuarioId, datos.descripcion, datos.categoria, datos.tipo, datos.monto, datos.fecha]
  );

  return resultado.rows[0];
}

// Actualiza SOLO si el gasto pertenece al usuario (WHERE usuario_id).
// Si no pertenece o no existe, devuelve null y el controller responde 404.
export async function actualizarGasto(
  id: number,
  usuarioId: number,
  datos: DatosGasto,
  conexion: ConexionBD = pool
): Promise<Gasto | null> {
  const resultado = await conexion.query<Gasto>(
    `UPDATE gastos
     SET descripcion = $1, categoria = $2, tipo = $3, monto = $4, fecha = $5
     WHERE id = $6 AND usuario_id = $7
     RETURNING ${SELECT_GASTO}`,
    [datos.descripcion, datos.categoria, datos.tipo, datos.monto, datos.fecha, id, usuarioId]
  );

  return resultado.rows[0] ?? null;
}

export async function eliminarGasto(id: number, usuarioId: number): Promise<boolean> {
  const resultado = await pool.query(
    `DELETE FROM gastos WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId]
  );

  return (resultado.rowCount ?? 0) > 0;
}

// Dinero disponible del MES al que pertenece "fecha":
//   disponible = SUM(ingresos del mes) - SUM(gastos del mes)
// excluirGastoId permite excluir el gasto que se está EDITANDO para no
// rechazar una edición con un falso negativo. Se ejecuta sobre la misma
// conexión (transacción) cuando el service la abre.
export async function calcularDisponible(
  usuarioId: number,
  fecha: string,
  excluirGastoId: number | null,
  conexion: ConexionBD = pool
): Promise<number> {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));

  const resultado = await conexion.query<{ ingresos: string | null; gastos: string | null }>(
    `SELECT
       COALESCE(
         (SELECT SUM(monto) FROM ingresos
          WHERE usuario_id = $1 AND EXTRACT(YEAR FROM fecha) = $2 AND EXTRACT(MONTH FROM fecha) = $3),
         0) AS ingresos,
       COALESCE(
         (SELECT SUM(monto) FROM gastos
          WHERE usuario_id = $4 AND EXTRACT(YEAR FROM fecha) = $5 AND EXTRACT(MONTH FROM fecha) = $6
            AND ($7::int IS NULL OR id <> $7::int)),
         0) AS gastos`,
    [usuarioId, anio, mes, usuarioId, anio, mes, excluirGastoId]
  );

  const fila = resultado.rows[0];
  return Number(fila.ingresos ?? 0) - Number(fila.gastos ?? 0);
}