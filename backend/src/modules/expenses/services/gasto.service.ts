import { AppError } from "../../../middlewares/errorHandler";
import { pool } from "../../../config/db";
import { esFechaFutura } from "../../../utils/fechas.util";
import {
  crearGasto as crearGastoModel,
  actualizarGasto as actualizarGastoModel,
  eliminarGasto as eliminarGastoModel,
  listarGastosPorUsuario,
  obtenerGastoPorId,
  calcularDisponible,
  DatosGasto,
  FiltrosGasto,
  Gasto,
} from "../models/gasto.model";

const MENSAJE_FECHA_FUTURA =
  "No se permiten fechas futuras. La fecha debe ser hoy o anterior.";

function mensajeFondosInsuficientes(disponible: number): string {
  const monto = Math.max(disponible, 0).toFixed(2);
  const deficit =
    disponible < 0 ? " (tu dinero disponible del mes es negativo)" : "";
  return `No tienes fondos suficientes. Tu dinero disponible para este mes es Q ${monto}${deficit}.`;
}

export async function obtenerGastosDelUsuario(
  usuarioId: number,
  filtros: FiltrosGasto
): Promise<Gasto[]> {
  return listarGastosPorUsuario(usuarioId, filtros);
}

export async function registrarGasto(
  usuarioId: number,
  datos: DatosGasto
): Promise<Gasto> {
  // El backend es la autoridad final contra la fecha real del servidor.
  if (esFechaFutura(datos.fecha)) {
    throw new AppError(MENSAJE_FECHA_FUTURA, 400);
  }

  // Cálculo del disponible + INSERT dentro de una MISMA transacción para
  // evitar inconsistencias (dos gastos simultáneos no pueden pasarse juntos).
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    const disponible = await calcularDisponible(usuarioId, datos.fecha, null, cliente);
    if (datos.monto > disponible) {
      // Error controlado (409), nunca un 500.
      throw new AppError(mensajeFondosInsuficientes(disponible), 409);
    }

    const nuevo = await crearGastoModel(usuarioId, datos, cliente);
    await cliente.query("COMMIT");
    return nuevo;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

export async function editarGasto(
  id: number,
  usuarioId: number,
  datos: DatosGasto
): Promise<Gasto> {
  if (esFechaFutura(datos.fecha)) {
    throw new AppError(MENSAJE_FECHA_FUTURA, 400);
  }

  const existente = await obtenerGastoPorId(id, usuarioId);
  if (!existente) {
    throw new AppError("Gasto no encontrado", 404);
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    // Excluye el propio gasto en edición del total de gastos del mes,
    // para no rechazar una edición con un falso negativo.
    const disponible = await calcularDisponible(usuarioId, datos.fecha, id, cliente);
    if (datos.monto > disponible) {
      throw new AppError(mensajeFondosInsuficientes(disponible), 409);
    }

    const actualizado = await actualizarGastoModel(id, usuarioId, datos, cliente);
    if (!actualizado) {
      throw new AppError("No se pudo actualizar el gasto", 500);
    }

    await cliente.query("COMMIT");
    return actualizado;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

export async function borrarGasto(id: number, usuarioId: number): Promise<void> {
  // Los borrados continúan funcionando sin restricciones.
  const eliminado = await eliminarGastoModel(id, usuarioId);
  if (!eliminado) {
    throw new AppError("Gasto no encontrado", 404);
  }
}