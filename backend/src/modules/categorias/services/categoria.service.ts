import { AppError } from "../../../middlewares/errorHandler";
import {
  Categoria,
  DatosCategoria,
  TipoCategoria,
  actualizarCategoria as actualizarCategoriaModel,
  crearCategoria as crearCategoriaModel,
  eliminarCategoria as eliminarCategoriaModel,
  listarCategorias,
} from "../models/categoria.model";

export async function obtenerCategorias(
  usuarioId: number,
  tipo?: TipoCategoria
): Promise<Categoria[]> {
  return listarCategorias(usuarioId, tipo);
}

export async function crearCategoriaDeUsuario(
  usuarioId: number,
  datos: DatosCategoria
): Promise<Categoria> {
  try {
    return await crearCategoriaModel(usuarioId, datos);
  } catch (error) {
    // Violación del UNIQUE (usuario_id, nombre, tipo) → mensaje claro.
    if ((error as { code?: string }).code === "23505") {
      throw new AppError("Ya existe una categoría con ese nombre y tipo", 400);
    }
    throw error;
  }
}

export async function editarCategoriaDeUsuario(
  id: number,
  usuarioId: number,
  datos: DatosCategoria
): Promise<Categoria> {
  try {
    const actualizada = await actualizarCategoriaModel(id, usuarioId, datos);
    if (!actualizada) {
      throw new AppError(
        "Categoría no encontrada o no modificable (las del sistema no se pueden editar)",
        404
      );
    }
    return actualizada;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new AppError("Ya existe una categoría con ese nombre y tipo", 400);
    }
    throw error;
  }
}

export async function eliminarCategoriaDeUsuario(
  id: number,
  usuarioId: number
): Promise<void> {
  const eliminada = await eliminarCategoriaModel(id, usuarioId);
  if (!eliminada) {
    throw new AppError(
      "Categoría no encontrada o no modificable (las del sistema no se pueden eliminar)",
      404
    );
  }
}