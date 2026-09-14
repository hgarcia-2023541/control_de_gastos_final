import { AppError } from "../../../middlewares/errorHandler";
import { esFechaFutura } from "../../../utils/fechas.util";
import {
  crearIngreso as crearIngresoModel,
  actualizarIngreso as actualizarIngresoModel,
  eliminarIngreso as eliminarIngresoModel,
  listarIngresosPorUsuario,
  obtenerIngresoPorId,
  DatosIngreso,
  FiltrosIngreso,
  Ingreso,
} from "../models/ingreso.model";

const MENSAJE_FECHA_FUTURA =
  "No se permiten fechas futuras. La fecha debe ser hoy o anterior.";

export async function obtenerIngresosDelUsuario(
  usuarioId: number,
  filtros: FiltrosIngreso
): Promise<Ingreso[]> {
  return listarIngresosPorUsuario(usuarioId, filtros);
}

export async function registrarIngreso(
  usuarioId: number,
  datos: DatosIngreso
): Promise<Ingreso> {
  // El backend es la autoridad final contra la fecha real del servidor.
  if (esFechaFutura(datos.fecha)) {
    throw new AppError(MENSAJE_FECHA_FUTURA, 400);
  }

  return crearIngresoModel(usuarioId, datos);
}

export async function editarIngreso(
  id: number,
  usuarioId: number,
  datos: DatosIngreso
): Promise<Ingreso> {
  if (esFechaFutura(datos.fecha)) {
    throw new AppError(MENSAJE_FECHA_FUTURA, 400);
  }

  // Verificamos primero que el ingreso exista y sea del usuario antes
  // de intentar editarlo, para poder devolver un 404 claro.
  const existente = await obtenerIngresoPorId(id, usuarioId);
  if (!existente) {
    throw new AppError("Ingreso no encontrado", 404);
  }

  const actualizado = await actualizarIngresoModel(id, usuarioId, datos);
  if (!actualizado) {
    throw new AppError("No se pudo actualizar el ingreso", 500);
  }

  return actualizado;
}

export async function borrarIngreso(id: number, usuarioId: number): Promise<void> {
  // Los borrados continúan funcionando sin restricciones.
  const eliminado = await eliminarIngresoModel(id, usuarioId);
  if (!eliminado) {
    throw new AppError("Ingreso no encontrado", 404);
  }
}