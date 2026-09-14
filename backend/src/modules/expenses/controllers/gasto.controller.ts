import { Response } from "express";
import { z } from "zod";
import { catchAsync, AppError } from "../../../middlewares/errorHandler";
import { RequestConUsuario } from "../../../middlewares/auth.middleware";
import {
  borrarGasto,
  editarGasto,
  obtenerGastosDelUsuario,
  registrarGasto,
} from "../services/gasto.service";

const gastoSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria").max(200),
  categoria: z.string().min(1, "La categoría es obligatoria").max(100),
  tipo: z.enum(["fijo", "variable"]).default("variable"),
  monto: z.coerce.number().positive("La cantidad debe ser mayor que cero"),
  fecha: z.coerce.date({ errorMap: () => ({ message: "Fecha inválida" }) }),
});

const filtrosSchema = z.object({
  busqueda: z.string().trim().min(1).optional(),
  fechaInicio: z.string().optional(),
  fechaFin: z.string().optional(),
  categoria: z.string().min(1).optional(),
});

function idDelUsuarioAutenticado(req: RequestConUsuario): number {
  if (!req.usuario) {
    throw new AppError("No se pudo identificar al usuario autenticado", 401);
  }
  return req.usuario.id;
}

export const listar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const filtros = filtrosSchema.parse(req.query);

  const gastos = await obtenerGastosDelUsuario(usuarioId, filtros);

  res.json({ ok: true, data: gastos });
});

export const crear = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const datos = gastoSchema.parse(req.body);

  const nuevoGasto = await registrarGasto(usuarioId, {
    ...datos,
    fecha: datos.fecha.toISOString().slice(0, 10),
  });

  res.status(201).json({
    ok: true,
    mensaje: "Gasto registrado exitosamente",
    data: nuevoGasto,
  });
});

export const actualizar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const id = Number(req.params["id"]);
  const datos = gastoSchema.parse(req.body);

  const gastoActualizado = await editarGasto(id, usuarioId, {
    ...datos,
    fecha: datos.fecha.toISOString().slice(0, 10),
  });

  res.json({
    ok: true,
    mensaje: "Gasto actualizado exitosamente",
    data: gastoActualizado,
  });
});

export const eliminar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const id = Number(req.params["id"]);

  await borrarGasto(id, usuarioId);

  res.json({ ok: true, mensaje: "Gasto eliminado exitosamente" });
});
