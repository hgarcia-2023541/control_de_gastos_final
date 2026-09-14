import { Response } from "express";
import { z } from "zod";
import { catchAsync, AppError } from "../../../middlewares/errorHandler";
import { RequestConUsuario } from "../../../middlewares/auth.middleware";
import {
  borrarIngreso,
  editarIngreso,
  obtenerIngresosDelUsuario,
  registrarIngreso,
} from "../services/ingreso.service";

const ingresoSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria").max(200),
  fuente: z.string().min(1, "La fuente es obligatoria").max(100),
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

// Helper: toma req.usuario.id (puesto por verificarToken) en vez de
// confiar en cualquier id que venga en el body/query del frontend.
function idDelUsuarioAutenticado(req: RequestConUsuario): number {
  if (!req.usuario) {
    throw new AppError("No se pudo identificar al usuario autenticado", 401);
  }
  return req.usuario.id;
}

export const listar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const filtros = filtrosSchema.parse(req.query);

  const ingresos = await obtenerIngresosDelUsuario(usuarioId, filtros);

  res.json({ ok: true, data: ingresos });
});

export const crear = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const datos = ingresoSchema.parse(req.body);

  const nuevoIngreso = await registrarIngreso(usuarioId, {
    ...datos,
    fecha: datos.fecha.toISOString().slice(0, 10),
  });

  res.status(201).json({
    ok: true,
    mensaje: "Ingreso registrado exitosamente",
    data: nuevoIngreso,
  });
});

export const actualizar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const id = Number(req.params["id"]);
  const datos = ingresoSchema.parse(req.body);

  const ingresoActualizado = await editarIngreso(id, usuarioId, {
    ...datos,
    fecha: datos.fecha.toISOString().slice(0, 10),
  });

  res.json({
    ok: true,
    mensaje: "Ingreso actualizado exitosamente",
    data: ingresoActualizado,
  });
});

export const eliminar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  const usuarioId = idDelUsuarioAutenticado(req);
  const id = Number(req.params["id"]);

  await borrarIngreso(id, usuarioId);

  res.json({ ok: true, mensaje: "Ingreso eliminado exitosamente" });
});
