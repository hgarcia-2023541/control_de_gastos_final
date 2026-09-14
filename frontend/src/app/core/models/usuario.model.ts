export type RolUsuario = "admin" | "user";
export type ProveedorUsuario = "local" | "google";

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  // Campos nuevos del perfil (los devuelve el backend en la sesión).
  // Son opcionales para no romper sesiones guardadas antes de esta
  // versión (que solo tenían id/nombre/correo/rol).
  proveedor?: string;
  fotoUrl?: string | null;
  preferencias?: Record<string, unknown> | null;
}

export interface LoginResponse {
  token: string;
  usuario: Usuario;
}

// Lo que envía el formulario de registro público.
export interface RegistroFormulario {
  nombre: string;
  correo: string;
  password: string;
}

// Lo que envía el formulario de perfil (Configuración).
export interface PerfilFormulario {
  nombre?: string;
  fotoUrl?: string | null;
  preferencias?: Record<string, unknown>;
}

// Respuesta del endpoint PATCH /auth/perfil.
export interface PerfilResponse {
  id: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  proveedor: ProveedorUsuario;
  fotoUrl: string | null;
  preferencias: Record<string, unknown> | null;
}