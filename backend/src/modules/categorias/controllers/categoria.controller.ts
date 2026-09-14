import { Response } from "express";
import { z } from "zod";
import { catchAsync, AppError } from "../../../middlewares/errorHandler";
import { RequestConUsuario } from "../../../middlewares/auth.middleware";
import {
  crearCategoriaDeUsuario,
  editarCategoriaDeUsuario,
  eliminarCategoriaDeUsuario,
  obtenerCategorias,
} from "../services/categoria.service";

const categoriaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre de la categoría es obligatorio")
    .max(60, "El nombre es muy largo"),
  tipo: z.enum(["ingreso", "gasto"]),
  color: z.string().trim().max(20).optional(),
});

const filtroTipoSchema = z.object({
  tipo: z.enum(["ingreso", "gasto"]).optional(),
});

function idDelUsuarioAutenticado(req: RequestConUsuario): number {
  if (!req.usuario) {
    throw new AppError("No se pudo identificar al usuario autenticado", 401);
  }
  return req.usuario.id;
}

export const listar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const { tipo } = filtroTipoSchema.parse(req.query);

  const categorias = await obtenerCategorias(usuarioId, tipo);

  res.json({ ok: true, data: categorias });
});

export const crear = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const datos = categoriaSchema.parse(req.body);

  const nueva = await crearCategoriaDeUsuario(usuarioId, datos);

  res.status(201).json({
    ok: true,
    mensaje: "Categoría creada exitosamente",
    data: nueva,
  });
});

export const actualizar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const id = Number(req.params["id"]);
  const datos = categoriaSchema.parse(req.body);

  const actualizada = await editarCategoriaDeUsuario(id, usuarioId, datos);

  res.json({
    ok: true,
    mensaje: "Categoría actualizada exitosamente",
    data: actualizada,
  });
});

export const eliminar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const id = Number(req.params["id"]);

  await eliminarCategoriaDeUsuario(id, usuarioId);

  res.json({ ok: true, mensaje: "Categoría eliminada exitosamente" });
});