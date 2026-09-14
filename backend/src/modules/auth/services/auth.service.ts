import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "../../../middlewares/errorHandler";
import {
  actualizarPerfil,
  buscarUsuarioPorCorreo,
  buscarUsuarioPorCorreoSinFiltro,
  buscarUsuarioPorGoogleSub,
  crearUsuario,
  crearUsuarioGoogle,
  RolUsuario,
  Usuario,
  UsuarioPublico,
} from "../models/usuario.model";

export interface ResultadoLogin {
  token: string;
  usuario: {
    id: number;
    nombre: string;
    correo: string;
    rol: RolUsuario;
    proveedor: string;
    fotoUrl: string | null;
  };
}

function generarToken(usuario: {
  id: number;
  correo: string;
  rol: string;
}): string {
  return jwt.sign(
    {
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1h" } as jwt.SignOptions
  );
}

// Convierte el usuario de BD en la respuesta de sesión que espera el
// frontend (claves en camelCase: fotoUrl, proveedor).
function aResultadoLogin(usuario: Usuario | UsuarioPublico): ResultadoLogin {
  return {
    token: generarToken(usuario),
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      proveedor: usuario.proveedor,
      fotoUrl: usuario.foto_url,
    },
  };
}

export async function autenticarUsuario(
  correo: string,
  password: string
): Promise<ResultadoLogin> {
  const usuario = await buscarUsuarioPorCorreo(correo);

  // password_hash es NULL en cuentas creadas solo con Google: el login
  // con contraseña no puede completarse, y devolvemos la misma respuesta
  // genérica para no revelar qué cuentas existen.
  if (!usuario || !usuario.password_hash) {
    throw new AppError("Credenciales incorrectas", 401);
  }

  const passwordValida = bcrypt.compareSync(password, usuario.password_hash);
  if (!passwordValida) {
    throw new AppError("Credenciales incorrectas", 401);
  }

  if (!usuario.activo) {
    throw new AppError("Usuario desactivado. Contacta al administrador.", 403);
  }

  return aResultadoLogin(usuario);
}

// Solo admin puede crear usuarios (mantiene el comportamiento actual).
export async function registrarUsuarioAdmin(
  nombre: string,
  correo: string,
  password: string,
  rol: RolUsuario = "user"
): Promise<UsuarioPublico> {
  const existe = await buscarUsuarioPorCorreo(correo);
  if (existe) {
    throw new AppError("El correo ya está registrado", 400);
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  return await crearUsuario(nombre, correo, passwordHash, rol);
}

// Registro público: el rol SIEMPRE es "user"; el usuario no puede
// elegir su rol (el schema del endpoint ni siquiera lo acepta).
export async function registrarUsuarioPublico(
  nombre: string,
  correo: string,
  password: string
): Promise<UsuarioPublico> {
  const existe = await buscarUsuarioPorCorreo(correo);
  if (existe) {
    throw new AppError(
      "El correo ya está registrado. Inicia sesión o usa otro correo.",
      400
    );
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  return await crearUsuario(nombre, correo, passwordHash, "user");
}

// --- Login con Google (sin reemplazar el login tradicional) ---
export async function autenticarConGoogle(
  idToken: string
): Promise<ResultadoLogin> {
  const perfil = await verificarIdTokenGoogle(idToken);

  // 1) La cuenta Google ya está vinculada a un usuario → iniciar sesión.
  const porSub = await buscarUsuarioPorGoogleSub(perfil.sub);
  if (porSub) {
    if (!porSub.activo) {
      throw new AppError(
        "Usuario desactivado. Contacta al administrador.",
        403
      );
    }

    // Si el usuario ya existía pero sin foto guardada (cuenta creada antes
    // de capturarla, o con foto vacía), la tomamos del perfil de Google en
    // este login: así la foto se conserva en la BD y aparece de inmediato.
    // Si ya había foto (p. ej. configurada a mano en Configuración) se
    // respeta y no se sobrescribe.
    if (perfil.foto && !porSub.foto_url) {
      const actualizado = await actualizarPerfil(porSub.id, {
        foto_url: perfil.foto,
      });
      if (actualizado) {
        return aResultadoLogin(actualizado);
      }
    }

    return aResultadoLogin(porSub);
  }

  // 2) El correo ya existe como cuenta local → error controlado y claro.
  const existente = await buscarUsuarioPorCorreoSinFiltro(perfil.correo);
  if (existente) {
    throw new AppError(
      "Este correo ya está registrado con una contraseña. Inicia sesión con tu correo y contraseña.",
      409
    );
  }

  // 3) Cuenta nueva → crear con rol "user" y proveedor "google".
  const nuevo = await crearUsuarioGoogle(
    perfil.nombre || "Usuario de Google",
    perfil.correo,
    perfil.sub,
    perfil.foto ?? null
  );
  return aResultadoLogin(nuevo);
}

interface PerfilGoogle {
  sub: string;
  correo: string;
  nombre: string;
  foto: string | null;
}

// Verifica el id_token contra el endpoint tokeninfo de Google. El
// backend decide qué client_id es válido (GOOGLE_CLIENT_ID desde .env),
// así que no se confía en nada que mande el frontend.
async function verificarIdTokenGoogle(idToken: string): Promise<PerfilGoogle> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new AppError(
      "El inicio de sesión con Google no está configurado en el servidor",
      503
    );
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
        idToken
      )}`
    );
  } catch {
    throw new AppError(
      "No se pudo contactar con Google. Inténtalo de nuevo.",
      502
    );
  }

  if (!respuesta.ok) {
    throw new AppError(
      "El token de Google no es válido o ya expiró. Inténtalo de nuevo.",
      401
    );
  }

  const datos = (await respuesta.json()) as Record<string, unknown>;

  const aud = datos.aud;
  const audValido =
    aud === clientId || (Array.isArray(aud) && aud.includes(clientId));
  if (!audValido) {
    throw new AppError(
      "El token de Google no corresponde a esta aplicación",
      401
    );
  }

  if (typeof datos.sub !== "string" || typeof datos.email !== "string") {
    throw new AppError(
      "El token de Google no contiene una identidad válida",
      401
    );
  }

  const emailVerificado =
    datos.email_verified === true || datos.email_verified === "true";
  if (!emailVerificado) {
    throw new AppError("El correo de Google no está verificado", 401);
  }

  return {
    sub: datos.sub,
    correo: datos.email,
    nombre: typeof datos.name === "string" ? datos.name : "",
    foto: typeof datos.picture === "string" ? datos.picture : null,
  };
}