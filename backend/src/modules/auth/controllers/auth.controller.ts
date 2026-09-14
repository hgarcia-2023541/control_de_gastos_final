import { Request, Response } from "express";
import { z } from "zod";
import { catchAsync, AppError } from "../../../middlewares/errorHandler";
import {
  autenticarConGoogle,
  autenticarUsuario,
  refrescarToken,
  registrarUsuarioAdmin,
  registrarUsuarioPublico,
} from "../services/auth.service";
import { RequestConUsuario } from "../../../middlewares/auth.middleware";
import {
  actualizarPerfil,
  actualizarRolUsuario,
  desactivarUsuario,
  listarUsuarios,
} from "../models/usuario.model";

const loginSchema = z.object({
  correo: z.string().email("Correo inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

const registroSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(150),
  correo: z.string().email("Correo inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres").max(100),
  rol: z.enum(["admin", "user"]).default("user"),
});

// Registro público: NO incluye campo "rol", el usuario no puede elegirlo.
const registroPublicoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(150, "El nombre es muy largo"),
  correo: z.string().email("Correo inválido"),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña es muy larga"),
});

const googleSchema = z.object({
  credential: z.string().min(1, "El token de Google es obligatorio"),
});

const perfilSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(150, "El nombre es muy largo")
    .optional(),
  foto_url: z.string().trim().max(500, "La URL de la foto es muy larga").optional(),
  preferencias: z.record(z.string(), z.unknown()).optional(),
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const datos = loginSchema.parse(req.body);

  const resultado = await autenticarUsuario(datos.correo, datos.password);

  res.json({
    ok: true,
    mensaje: "Inicio de sesión exitoso",
    data: resultado,
  });
});

// Solo admin puede registrar nuevos usuarios
export const registrar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  if (!req.usuario || req.usuario.rol !== "admin") {
    return res.status(403).json({
      ok: false,
      mensaje: "No tienes permisos para realizar esta acción",
    });
  }

  const datos = registroSchema.parse(req.body);

  const nuevoUsuario = await registrarUsuarioAdmin(
    datos.nombre,
    datos.correo,
    datos.password,
    datos.rol
  );

  res.json({
    ok: true,
    mensaje: "Usuario registrado exitosamente",
    data: {
      id: nuevoUsuario.id,
      nombre: nuevoUsuario.nombre,
      correo: nuevoUsuario.correo,
      rol: nuevoUsuario.rol,
    },
  });
});

// Registro público (POST /api/auth/registro-publico): cualquier persona
// crea su cuenta con rol "user" automático.
export const registrarPublico = catchAsync(async (req: Request, res: Response) => {
  const datos = registroPublicoSchema.parse(req.body);

  const nuevoUsuario = await registrarUsuarioPublico(
    datos.nombre,
    datos.correo,
    datos.password
  );

  res.status(201).json({
    ok: true,
    mensaje: "Cuenta creada exitosamente. Ya puedes iniciar sesión.",
    data: {
      id: nuevoUsuario.id,
      nombre: nuevoUsuario.nombre,
      correo: nuevoUsuario.correo,
      rol: nuevoUsuario.rol,
    },
  });
});

// Login con Google (POST /api/auth/google): recibe el credential/id_token
// que el frontend obtuvo de Google, el backend lo verifica y crea/inicia
// la sesión. NO sustituye al login tradicional.
export const google = catchAsync(async (req: Request, res: Response) => {
  const datos = googleSchema.parse(req.body);

  const resultado = await autenticarConGoogle(datos.credential);

  res.json({
    ok: true,
    mensaje: "Inicio de sesión con Google exitoso",
    data: resultado,
  });
});

// Perfil propio (PATCH /api/auth/perfil): cada usuario SOLO puede
// modificar sus propios datos (siempre usa req.usuario.id, nunca un id
// enviado en el body/query).
export const actualizarMiPerfil = catchAsync(
  async (req: RequestConUsuario, res: Response) => {
    if (!req.usuario) {
      throw new AppError("No se pudo identificar al usuario autenticado", 401);
    }

    const datos = perfilSchema.parse(req.body);

    const cambios: {
      nombre?: string;
      foto_url?: string | null;
      preferencias?: Record<string, unknown>;
    } = {};

    if (datos.nombre !== undefined) cambios.nombre = datos.nombre;
    if (datos.foto_url !== undefined) cambios.foto_url = datos.foto_url || null;
    if (datos.preferencias !== undefined) cambios.preferencias = datos.preferencias;

    if (!Object.keys(cambios).length) {
      throw new AppError("No hay datos para actualizar", 400);
    }

    const actualizado = await actualizarPerfil(req.usuario.id, cambios);
    if (!actualizado) {
      throw new AppError("Usuario no encontrado", 404);
    }

    res.json({
      ok: true,
      mensaje: "Perfil actualizado exitosamente",
      data: {
        id: actualizado.id,
        nombre: actualizado.nombre,
        correo: actualizado.correo,
        rol: actualizado.rol,
        proveedor: actualizado.proveedor,
        fotoUrl: actualizado.foto_url,
        preferencias: actualizado.preferencias,
      },
    });
  }
);

// Listar usuarios (solo admin)
export const listar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  if (!req.usuario || req.usuario.rol !== "admin") {
    return res.status(403).json({
      ok: false,
      mensaje: "No tienes permisos para realizar esta acción",
    });
  }

  const usuarios = await listarUsuarios();

  res.json({
    ok: true,
    data: usuarios,
  });
});

// Actualizar rol (solo admin)
export const actualizarRol = catchAsync(async (req: RequestConUsuario, res: Response) => {
  if (!req.usuario || req.usuario.rol !== "admin") {
    return res.status(403).json({
      ok: false,
      mensaje: "No tienes permisos para realizar esta acción",
    });
  }

  const { id } = req.params;
  const { rol } = z.object({ rol: z.enum(["admin", "user"]) }).parse(req.body);

  const usuarioActualizado = await actualizarRolUsuario(parseInt(id), rol);

  if (!usuarioActualizado) {
    return res.status(404).json({
      ok: false,
      mensaje: "Usuario no encontrado",
    });
  }

  res.json({
    ok: true,
    mensaje: "Rol actualizado exitosamente",
    data: usuarioActualizado,
  });
});

// Desactivar usuario (solo admin)
export const desactivar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  if (!req.usuario || req.usuario.rol !== "admin") {
    return res.status(403).json({
      ok: false,
      mensaje: "No tienes permisos para realizar esta acción",
    });
  }

  const { id } = req.params;

  if (parseInt(id) === req.usuario.id) {
    return res.status(400).json({
      ok: false,
      mensaje: "No puedes desactivar tu propia cuenta",
    });
  }

  const desactivado = await desactivarUsuario(parseInt(id));

  if (!desactivado) {
    return res.status(404).json({
      ok: false,
      mensaje: "Usuario no encontrado",
    });
  }

  res.json({
    ok: true,
    mensaje: "Usuario desactivado exitosamente",
  });
});

// Renovar sesión (POST /api/auth/refresh): requiere un token todavía
// válido (verificarToken ya lo comprobó al llegar aquí). Devuelve un
// token nuevo con la misma identidad y una expiración fresca, para que
// el frontend pueda mantener la sesión viva mientras el usuario sigue
// activo, sin que el JWT original expire a mitad de uso.
export const refrescar = catchAsync(async (req: RequestConUsuario, res: Response) => {
  if (!req.usuario) {
    throw new AppError("No se pudo identificar al usuario autenticado", 401);
  }

  const token = refrescarToken(req.usuario);

  res.json({
    ok: true,
    mensaje: "Sesión renovada",
    data: { token },
  });
});